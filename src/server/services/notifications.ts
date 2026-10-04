import "server-only";
import { C, col, newId, nowIso } from "../repos/common";
import { db } from "../firebase/admin";
import { env } from "../env";

/**
 * Durable, retryable notification outbox. Business code only ENQUEUES (inside or after its own transaction);
 * a worker (`npm run jobs:outbox` / POST /api/jobs/outbox) delivers through a channel adapter.
 *
 * No messaging vendor has been chosen (owner decision, docs/OWNER_SETUP.md). The only adapter shipped is "preview":
 * it records the rendered message so it can be inspected in Admin, and it NEVER claims a real message was sent.
 */
export type NotificationKind =
  | "order.placed"
  | "order.paid"
  | "order.status"
  | "order.cancelled"
  | "order.refund"
  | "order.needs_review"
  | "admin.contact_enquiry"
  | "admin.custom_enquiry"
  | "admin.new_order";

export interface NotificationRecipient {
  email?: string | null;
  phone?: string | null;
  admin?: boolean;
}

export interface OutboxRecord {
  id: string;
  kind: NotificationKind;
  to: NotificationRecipient;
  data: Record<string, unknown>;
  status: "pending" | "delivered" | "failed" | "dead";
  channel: "preview" | "email" | "sms" | "whatsapp" | null;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  dedupeKey: string | null;
  createdAt: string;
  deliveredAt: string | null;
  /** Rendered text recorded by the preview channel. */
  preview: { subject: string; body: string } | null;
  simulated: boolean;
}

export async function enqueueNotification(n: { kind: NotificationKind; to: NotificationRecipient; data: Record<string, unknown>; dedupeKey?: string }): Promise<void> {
  const id = n.dedupeKey ? `dk_${n.dedupeKey}`.slice(0, 120) : newId("ntf_");
  const ref = col(C.outbox).doc(id);
  const rec: Omit<OutboxRecord, "id"> = {
    kind: n.kind,
    to: n.to,
    data: n.data,
    status: "pending",
    channel: null,
    attempts: 0,
    nextAttemptAt: nowIso(),
    lastError: null,
    dedupeKey: n.dedupeKey ?? null,
    createdAt: nowIso(),
    deliveredAt: null,
    preview: null,
    simulated: env().INTEGRATION_MODE === "simulated",
  };
  // create() fails if the dedupe id exists, which is what makes enqueue idempotent.
  try {
    await ref.create(rec);
  } catch (e) {
    if ((e as { code?: number }).code === 6) return; // ALREADY_EXISTS
    throw e;
  }
}

export function renderNotification(r: Pick<OutboxRecord, "kind" | "data">): { subject: string; body: string } {
  const d = r.data as Record<string, string | number | undefined>;
  switch (r.kind) {
    case "order.placed":
      return { subject: `Order ${d.orderNumber} received`, body: `Thank you! We have received order ${d.orderNumber} (${d.total}). ${d.paymentNote ?? ""} Track it any time at /track-order.` };
    case "order.paid":
      return { subject: `Payment received for ${d.orderNumber}`, body: `We have received your payment for order ${d.orderNumber}. We will confirm it shortly.` };
    case "order.status":
      return { subject: `Order ${d.orderNumber}: ${d.statusLabel}`, body: `Your order ${d.orderNumber} is now: ${d.statusLabel}. ${d.detail ?? ""}` };
    case "order.cancelled":
      return { subject: `Order ${d.orderNumber} cancelled`, body: `Your order ${d.orderNumber} has been cancelled. ${d.detail ?? ""}` };
    case "order.refund":
      return { subject: `Refund update for ${d.orderNumber}`, body: `Refund status for order ${d.orderNumber}: ${d.state}.` };
    case "order.needs_review":
      return { subject: `Order ${d.orderNumber} needs attention`, body: `${d.reason}` };
    case "admin.new_order":
      return { subject: `New order ${d.orderNumber}`, body: `A new order ${d.orderNumber} (${d.total}, ${d.method}) was placed.` };
    case "admin.contact_enquiry":
      return { subject: "New contact enquiry", body: `From ${d.name}. Open Admin to read it.` };
    case "admin.custom_enquiry":
      return { subject: `New custom enquiry ${d.reference}`, body: `For ${d.product}. Open Admin to review.` };
  }
}

const MAX_ATTEMPTS = 6;

/** Deliver pending outbox entries. Safe to run concurrently: each record is claimed in a transaction. */
export async function drainOutbox(limit = 25): Promise<{ delivered: number; failed: number }> {
  const now = nowIso();
  const q = await col(C.outbox).where("status", "==", "pending").where("nextAttemptAt", "<=", now).orderBy("nextAttemptAt").limit(limit).get();
  let delivered = 0;
  let failed = 0;
  for (const doc of q.docs) {
    const claimed = await db().runTransaction(async (tx) => {
      const s = await tx.get(doc.ref);
      const r = s.data() as OutboxRecord | undefined;
      if (!r || r.status !== "pending" || r.nextAttemptAt > now) return null;
      tx.update(doc.ref, { nextAttemptAt: new Date(Date.now() + 120_000).toISOString(), attempts: r.attempts + 1 });
      return { ...r, id: doc.id, attempts: r.attempts + 1 };
    });
    if (!claimed) continue;
    try {
      // Only the preview channel exists until the owner selects a vendor.
      const preview = renderNotification(claimed);
      await doc.ref.update({ status: "delivered", channel: "preview", preview, deliveredAt: nowIso(), lastError: null });
      delivered++;
    } catch (e) {
      failed++;
      const attempts = claimed.attempts;
      await doc.ref.update({
        status: attempts >= MAX_ATTEMPTS ? "dead" : "pending",
        lastError: e instanceof Error ? e.message.slice(0, 300) : "unknown error",
        nextAttemptAt: new Date(Date.now() + Math.min(3600_000, 30_000 * 2 ** attempts)).toISOString(),
      });
    }
  }
  return { delivered, failed };
}
