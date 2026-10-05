import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";

// Switch the integration mode per test without touching process.env (env() caches its first parse).
const mode = vi.hoisted(() => ({ value: "simulated" as "simulated" | "live" }));
vi.mock("@/server/env", async (orig) => {
  const actual = await orig<typeof import("@/server/env")>();
  return { ...actual, env: () => ({ ...actual.env(), INTEGRATION_MODE: mode.value }), isSimulated: () => mode.value === "simulated" };
});

import { db } from "@/server/firebase/admin";
import { C, newId } from "@/server/repos/common";
import { drainOutbox, enqueueNotification, outboxHealth, type OutboxRecord } from "@/server/services/notifications";
import { DeliveryError, deliveryCapability, setMessageChannelForTests, type MessageChannel, type MessageRecipient, type RenderedMessage } from "@/server/providers/messaging";
import { placeOrder } from "@/server/services/checkout";
import { checkoutInput, ensureSettings, makeProduct } from "../helpers/fixtures";

beforeAll(ensureSettings);
afterEach(() => {
  setMessageChannelForTests(undefined);
  mode.value = "simulated";
  vi.restoreAllMocks();
});

const rec = async (id: string) => (await db().collection(C.outbox).doc(id).get()).data() as OutboxRecord;
const queue = async (kind: Parameters<typeof enqueueNotification>[0]["kind"] = "order.status", data: Record<string, unknown> = { orderNumber: "RRC-9999", statusLabel: "Shipped" }) => {
  const key = newId("t_");
  await enqueueNotification({ kind, to: { email: "buyer@example.test", phone: "+919876543210" }, data, dedupeKey: key });
  return `dk_${key}`;
};
/** Drain until our record has been processed (other tests' records may be in the queue). */
async function drainUntil(id: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await drainOutbox(100);
    if ((await rec(id)).status !== "pending") return;
  }
}

class FakeVendor implements MessageChannel {
  readonly name = "sms" as const;
  sent: { to: MessageRecipient; message: RenderedMessage; key: string }[] = [];
  failWith: Error | null = null;
  isConfigured = true;
  configured() {
    return this.isConfigured;
  }
  async send(to: MessageRecipient, message: RenderedMessage, ctx: { idempotencyKey: string }) {
    if (this.failWith) throw this.failWith;
    this.sent.push({ to, message, key: ctx.idempotencyKey });
    return { providerMessageId: `vendor_${this.sent.length}` };
  }
}

describe("simulated mode: a preview is not a delivery", () => {
  it("stores the message as `previewed`, never `delivered`, with no delivery time or provider id", async () => {
    const id = await queue();
    await drainUntil(id);
    const r = await rec(id);
    expect(r.status).toBe("previewed");
    expect(r.channel).toBe("preview");
    expect(r.deliveredAt).toBeNull();
    expect(r.providerMessageId ?? null).toBeNull();
    expect(r.preview?.body).toContain("RRC-9999");
    expect(deliveryCapability()).toBe("preview_only");
  });

  it("never stores a working secure link in the preview", async () => {
    const id = await queue("order.secure_link", { orderNumber: "RRC-9999", orderId: "ord_abc" });
    await drainUntil(id);
    const r = await rec(id);
    expect(r.status).toBe("previewed");
    expect(JSON.stringify(r)).not.toMatch(/token=|track-order\/open|http/);
  });
});

describe("live mode without a channel fails explicitly", () => {
  it("marks messages `unavailable`, sends nothing, and reports it", async () => {
    mode.value = "live";
    setMessageChannelForTests(null);
    expect(deliveryCapability()).toBe("unavailable");
    const before = (await outboxHealth()).unavailable;
    const id = await queue();
    await drainUntil(id);
    const r = await rec(id);
    expect(r.status).toBe("unavailable");
    expect(r.deliveredAt).toBeNull();
    expect(r.lastError).toMatch(/no messaging channel|not fully configured|MESSAGING_PROVIDER/i);
    expect((await outboxHealth()).unavailable).toBe(before + 1);
  });

  it("a half-configured vendor counts as unavailable", async () => {
    mode.value = "live";
    const v = new FakeVendor();
    v.isConfigured = false;
    setMessageChannelForTests(v);
    expect(deliveryCapability()).toBe("unavailable");
    const id = await queue();
    await drainUntil(id);
    expect((await rec(id)).status).toBe("unavailable");
    expect(v.sent).toHaveLength(0);
  });

  it("parked messages are re-queued and delivered once a channel is configured", async () => {
    mode.value = "live";
    setMessageChannelForTests(null);
    const id = await queue();
    await drainUntil(id);
    expect((await rec(id)).status).toBe("unavailable");
    const v = new FakeVendor();
    setMessageChannelForTests(v);
    await drainUntil(id);
    expect((await rec(id)).status).toBe("delivered");
    expect(v.sent.filter((s) => s.key === id)).toHaveLength(1);
  });
});

describe("mocked vendor contract (no real messages are ever sent in tests)", () => {
  it("records delivery only after the vendor accepts, passes a stable idempotency key, and does not resend", async () => {
    mode.value = "live";
    const v = new FakeVendor();
    setMessageChannelForTests(v);
    const id = await queue();
    await drainUntil(id);
    const r = await rec(id);
    expect(r).toMatchObject({ status: "delivered", channel: "sms" });
    expect(r.providerMessageId).toMatch(/^vendor_/);
    expect(r.deliveredAt).toBeTruthy();
    await drainOutbox(100);
    expect(v.sent.filter((s) => s.key === id)).toHaveLength(1);
  });

  it("mints the secure link only at delivery time and never persists it", async () => {
    mode.value = "live";
    const v = new FakeVendor();
    setMessageChannelForTests(v);
    const id = await queue("order.secure_link", { orderNumber: "RRC-9999", orderId: "ord_abc" });
    await drainUntil(id);
    const sent = v.sent.find((s) => s.key === id)!;
    expect(sent.message.body).toMatch(/\/api\/track-order\/open\?token=/);
    const stored = JSON.stringify(await rec(id));
    expect(stored).not.toMatch(/token=|track-order\/open/);
  });

  it("retryable failures back off; permanent failures stop; neither is reported as delivered", async () => {
    mode.value = "live";
    const v = new FakeVendor();
    setMessageChannelForTests(v);
    v.failWith = new DeliveryError("vendor timeout", true);
    const a = await queue();
    await drainOutbox(100);
    expect(await rec(a)).toMatchObject({ status: "pending", attempts: 1, lastError: "vendor timeout" });
    expect((await rec(a)).nextAttemptAt > new Date().toISOString()).toBe(true);

    v.failWith = new DeliveryError("invalid recipient", false);
    const b = await queue();
    await drainUntil(b);
    expect(await rec(b)).toMatchObject({ status: "failed", lastError: "invalid recipient" });
    expect((await rec(b)).deliveredAt).toBeNull();
  });
});

describe("secure-link endpoint tells the truth", () => {
  async function callLink() {
    const f = await makeProduct({ stocks: [3] });
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1), { userId: null, idempotencyKey: newId("idem_") });
    const { POST } = await import("@/app/api/track-order/link/route");
    const res = await POST(
      new Request("http://localhost:3000/api/track-order/link", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
        body: JSON.stringify({ orderNumber: r.orderNumber, contact: "+919876543210" }),
      }),
      undefined as never,
    );
    const outbox = await db().collection(C.outbox).where("data.orderId", "==", r.orderId).get();
    return { res, body: await res.json(), outbox };
  }

  it("local demo: says preview-only, returns a labelled link, queues no real send", async () => {
    const { res, body, outbox } = await callLink();
    expect(res.status).toBe(200);
    expect(body.status).toBe("preview_only");
    expect(body.simulatedPreviewLink).toMatch(/token=/);
    expect(body.sent).toBeUndefined();
    expect(outbox.size).toBe(1);
    expect(JSON.stringify(outbox.docs[0]!.data())).not.toMatch(/token=/);
  });

  it("live without a channel: 503, nothing queued, no link minted", async () => {
    mode.value = "live";
    setMessageChannelForTests(null);
    const { res, body, outbox } = await callLink();
    expect(res.status).toBe(503);
    expect(body.error.code).toBe("MESSAGING_UNAVAILABLE");
    expect(body.simulatedPreviewLink).toBeUndefined();
    expect(outbox.size).toBe(0);
  });

  it("live with a channel: says queued (not sent/delivered) and exposes no link", async () => {
    mode.value = "live";
    setMessageChannelForTests(new FakeVendor());
    const { res, body, outbox } = await callLink();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "queued" });
    expect(outbox.size).toBe(1);
  });
});
