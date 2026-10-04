import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { C, col, newId, nowIso } from "../repos/common";
import { env, isSimulated, requireConfigured } from "../env";
import type { Paise } from "@/domain/money";

/**
 * Payment provider adapter. Two implementations behind one interface:
 *  - SimulatedPayments: local stand-in, clearly labelled, REFUSED when APP_ENV=production (see env.ts).
 *  - RazorpayPayments: live REST integration (hosted Checkout.js on the client, server-side order creation,
 *    HMAC verification, provider-side payment fetch before anything is marked paid).
 * There is NO fallback from live to simulated: missing credentials raise ConfigurationError.
 */
export interface ProviderOrder {
  providerOrderId: string;
  amount: Paise;
  currency: "INR";
}
export type ProviderPaymentStatus = "created" | "authorized" | "captured" | "failed" | "refunded";
export interface ProviderPayment {
  id: string;
  orderId: string;
  amount: Paise;
  currency: string;
  status: ProviderPaymentStatus;
  method: string | null;
  errorDescription: string | null;
}
export interface ProviderRefund {
  id: string;
  paymentId: string;
  amount: Paise;
  status: "pending" | "processed" | "failed";
}

export interface PaymentProvider {
  readonly mode: "simulated" | "live";
  createOrder(p: { amount: Paise; receipt: string; notes?: Record<string, string> }): Promise<ProviderOrder>;
  /** Checkout callback signature: HMAC_SHA256(orderId + "|" + paymentId, key_secret). */
  verifyCheckoutSignature(p: { orderId: string; paymentId: string; signature: string }): boolean;
  /** Webhook signature: HMAC_SHA256(raw body, webhook secret) in X-Razorpay-Signature. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  fetchOrderPayments(providerOrderId: string): Promise<ProviderPayment[]>;
  refund(p: { paymentId: string; amount: Paise; idempotencyKey: string; notes?: Record<string, string> }): Promise<ProviderRefund>;
  fetchRefund(paymentId: string, refundId: string): Promise<ProviderRefund>;
  /** Public key id for Checkout.js (null in simulated mode). */
  publicKeyId(): string | null;
}

export const hmacHex = (secret: string, data: string): string => createHmac("sha256", secret).update(data).digest("hex");

/** Timing-safe comparison of two hex strings of any length. */
export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/* ---------------------------------------------------------------- simulated */

interface SimPaymentDoc {
  id: string;
  orderId: string;
  amount: Paise;
  currency: "INR";
  status: ProviderPaymentStatus;
  method: string;
  errorDescription: string | null;
  createdAt: string;
  refunds: Record<string, { amount: Paise; status: "pending" | "processed" | "failed"; key: string }>;
}

export const SIM_KEY_SECRET = () => env().SIMULATION_SECRET + ":key";
export const SIM_WEBHOOK_SECRET = () => env().SIMULATION_SECRET + ":webhook";

class SimulatedPayments implements PaymentProvider {
  readonly mode = "simulated" as const;

  async createOrder(p: { amount: Paise; receipt: string }): Promise<ProviderOrder> {
    const id = `order_SIM${randomBytes(7).toString("hex")}`;
    await col(C.simPayments).doc(id).set({ kind: "order", amount: p.amount, currency: "INR", receipt: p.receipt, createdAt: nowIso() });
    return { providerOrderId: id, amount: p.amount, currency: "INR" };
  }
  verifyCheckoutSignature(p: { orderId: string; paymentId: string; signature: string }): boolean {
    return safeEqualHex(hmacHex(SIM_KEY_SECRET(), `${p.orderId}|${p.paymentId}`), p.signature);
  }
  verifyWebhookSignature(raw: string, sig: string): boolean {
    return safeEqualHex(hmacHex(SIM_WEBHOOK_SECRET(), raw), sig);
  }
  private async load(id: string): Promise<SimPaymentDoc> {
    const s = await col(C.simPayments).doc(id).get();
    if (!s.exists) throw new Error(`Simulated payment ${id} not found`);
    return { ...(s.data() as SimPaymentDoc), id };
  }
  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    const d = await this.load(paymentId);
    return { id: d.id, orderId: d.orderId, amount: d.amount, currency: d.currency, status: d.status, method: d.method, errorDescription: d.errorDescription };
  }
  async fetchOrderPayments(orderId: string): Promise<ProviderPayment[]> {
    const q = await col(C.simPayments).where("orderId", "==", orderId).get();
    return q.docs.map((s) => {
      const d = s.data() as SimPaymentDoc;
      return { id: s.id, orderId: d.orderId, amount: d.amount, currency: d.currency, status: d.status, method: d.method, errorDescription: d.errorDescription };
    });
  }
  async refund(p: { paymentId: string; amount: Paise; idempotencyKey: string }): Promise<ProviderRefund> {
    const ref = col(C.simPayments).doc(p.paymentId);
    const d = await this.load(p.paymentId);
    const existing = Object.entries(d.refunds ?? {}).find(([, r]) => r.key === p.idempotencyKey);
    if (existing) return { id: existing[0], paymentId: p.paymentId, amount: existing[1].amount, status: existing[1].status };
    const id = `rfnd_SIM${randomBytes(6).toString("hex")}`;
    await ref.set({ refunds: { ...(d.refunds ?? {}), [id]: { amount: p.amount, status: "processed", key: p.idempotencyKey } } }, { merge: true });
    return { id, paymentId: p.paymentId, amount: p.amount, status: "processed" };
  }
  async fetchRefund(paymentId: string, refundId: string): Promise<ProviderRefund> {
    const d = await this.load(paymentId);
    const r = d.refunds?.[refundId];
    if (!r) throw new Error("Simulated refund not found");
    return { id: refundId, paymentId, amount: r.amount, status: r.status };
  }
  publicKeyId(): string | null {
    return null;
  }

  /** Test/dev helper: create the "customer payment" for an order, as Razorpay Checkout would. */
  async simulateCustomerPayment(orderId: string, outcome: "success" | "failed"): Promise<{ payment: ProviderPayment; signature: string }> {
    const o = await col(C.simPayments).doc(orderId).get();
    if (!o.exists) throw new Error("Unknown simulated order");
    const amount = (o.data() as { amount: Paise }).amount;
    const id = `pay_SIM${randomBytes(7).toString("hex")}`;
    const doc: Omit<SimPaymentDoc, "id"> & { kind: "payment" } = {
      kind: "payment",
      orderId,
      amount,
      currency: "INR",
      status: outcome === "success" ? "captured" : "failed",
      method: "simulated-upi",
      errorDescription: outcome === "failed" ? "Simulated payment failure" : null,
      createdAt: nowIso(),
      refunds: {},
    };
    await col(C.simPayments).doc(id).set(doc);
    return {
      payment: { id, orderId, amount, currency: "INR", status: doc.status, method: doc.method, errorDescription: doc.errorDescription },
      signature: hmacHex(SIM_KEY_SECRET(), `${orderId}|${id}`),
    };
  }
}

/* --------------------------------------------------------------------- live */

class RazorpayPayments implements PaymentProvider {
  readonly mode = "live" as const;
  private creds() {
    return requireConfigured("Razorpay", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET");
  }
  private async call<T>(method: "GET" | "POST", path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = this.creds();
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: "Basic " + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64"),
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (!res.ok) {
      const desc = (json as { error?: { description?: string } } | null)?.error?.description ?? `HTTP ${res.status}`;
      throw new Error(`Razorpay ${method} ${path} failed: ${desc}`);
    }
    return json as T;
  }
  async createOrder(p: { amount: Paise; receipt: string; notes?: Record<string, string> }): Promise<ProviderOrder> {
    const o = await this.call<{ id: string; amount: number; currency: string }>("POST", "/orders", { amount: p.amount, currency: "INR", receipt: p.receipt.slice(0, 40), notes: p.notes });
    return { providerOrderId: o.id, amount: o.amount, currency: "INR" };
  }
  verifyCheckoutSignature(p: { orderId: string; paymentId: string; signature: string }): boolean {
    const { RAZORPAY_KEY_SECRET } = this.creds();
    return safeEqualHex(hmacHex(RAZORPAY_KEY_SECRET, `${p.orderId}|${p.paymentId}`), p.signature);
  }
  verifyWebhookSignature(raw: string, sig: string): boolean {
    const { RAZORPAY_WEBHOOK_SECRET } = requireConfigured("Razorpay webhooks", "RAZORPAY_WEBHOOK_SECRET");
    return safeEqualHex(hmacHex(RAZORPAY_WEBHOOK_SECRET, raw), sig);
  }
  private mapPayment(x: { id: string; order_id: string; amount: number; currency: string; status: string; method?: string; error_description?: string | null }): ProviderPayment {
    const status = (["created", "authorized", "captured", "failed", "refunded"].includes(x.status) ? x.status : "created") as ProviderPaymentStatus;
    return { id: x.id, orderId: x.order_id, amount: x.amount, currency: x.currency, status, method: x.method ?? null, errorDescription: x.error_description ?? null };
  }
  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    return this.mapPayment(await this.call("GET", `/payments/${encodeURIComponent(paymentId)}`));
  }
  async fetchOrderPayments(orderId: string): Promise<ProviderPayment[]> {
    const r = await this.call<{ items: Parameters<RazorpayPayments["mapPayment"]>[0][] }>("GET", `/orders/${encodeURIComponent(orderId)}/payments`);
    return r.items.map((i) => this.mapPayment(i));
  }
  async refund(p: { paymentId: string; amount: Paise; idempotencyKey: string; notes?: Record<string, string> }): Promise<ProviderRefund> {
    // `receipt` carries our idempotency key so a retried call can be matched to the same refund on reconciliation.
    const r = await this.call<{ id: string; amount: number; status: string; payment_id: string }>("POST", `/payments/${encodeURIComponent(p.paymentId)}/refund`, {
      amount: p.amount,
      speed: "normal",
      receipt: p.idempotencyKey.slice(0, 40),
      notes: p.notes,
    });
    return { id: r.id, paymentId: r.payment_id, amount: r.amount, status: r.status === "processed" ? "processed" : r.status === "failed" ? "failed" : "pending" };
  }
  async fetchRefund(paymentId: string, refundId: string): Promise<ProviderRefund> {
    const r = await this.call<{ id: string; amount: number; status: string; payment_id: string }>("GET", `/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}`);
    return { id: r.id, paymentId: r.payment_id, amount: r.amount, status: r.status === "processed" ? "processed" : r.status === "failed" ? "failed" : "pending" };
  }
  publicKeyId(): string | null {
    return env().RAZORPAY_KEY_ID ?? null;
  }
}

let simulated: SimulatedPayments | null = null;
let live: RazorpayPayments | null = null;

export function payments(): PaymentProvider {
  if (isSimulated()) return (simulated ??= new SimulatedPayments());
  return (live ??= new RazorpayPayments());
}

export function simulatedPayments(): SimulatedPayments {
  if (!isSimulated()) throw new Error("Simulated payments are disabled in live mode.");
  return (simulated ??= new SimulatedPayments());
}

export const newIdempotencyToken = () => newId("idem_");
