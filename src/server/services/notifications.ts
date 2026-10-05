import "server-only";
import { C, col, newId, nowIso } from "../repos/common";
import { db } from "../firebase/admin";
import { env } from "../env";
import { DeliveryError, liveChannel, type ChannelName, type MessageRecipient, type RenderedMessage } from "../providers/messaging";
import { makeAccessToken } from "./order-core";

/**
 * Durable, retryable notification outbox. Business code only ENQUEUES (inside or after its own transaction);
 * a worker (`npm run jobs:outbox` / POST /api/jobs/outbox) delivers through a channel adapter.
 *
 * Outbox states are deliberately distinct and truthful:
 *   pending      queued, not yet attempted (or waiting to retry after a retryable failure)
 *   previewed    SIMULATED builds only: the message was rendered and stored for inspection. It was NOT sent to anyone.
 *   delivered    a real channel accepted the message (providerMessageId recorded)
 *   failed/dead  a real channel refused it permanently / retries exhausted
 *   unavailable  live mode with no configured channel. Nothing was sent; the record is kept (and retried automatically once a
 *                channel is configured) so staff can see exactly which messages customers did not get.
 * No messaging vendor has been chosen (owner decision, docs/OWNER_SETUP.md), so live mode currently ends in `unavailable`.
 */
export type NotificationKind =
  | "order.placed"
  | "order.paid"
  | "order.status"
  | "order.cancelled"
  | "order.refund"
  | "order.needs_review"
  | "order.secure_link"
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
  status: "pending" | "previewed" | "delivered" | "failed" | "dead" | "unavailable";
  channel: "preview" | ChannelName | null;
  /** Real delivery only: the vendor's id for the accepted message. */
  providerMessageId?: string | null;
  previewedAt?: string | null;
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

/**
 * Render a message. `forDelivery` is true only when handing the text to a real channel: that is the ONLY place a private,
 * order-scoped link is minted (fresh, 1 hour). Stored previews never contain a working link.
 */
export function renderNotification(r: Pick<OutboxRecord, "kind" | "data">, opts: { forDelivery?: boolean } = {}): RenderedMessage {
  const d = r.data as Record<string, string | number | undefined>;
  switch (r.kind) {
    case "order.secure_link": {
      if (!opts.forDelivery) return { subject: `Secure link for ${d.orderNumber}`, body: `A secure link to view order ${d.orderNumber} would be sent here, valid for 1 hour. (The link is not stored in previews.)` };
      const token = makeAccessToken(String(d.orderId), "track", 3600);
      const link = new URL(`/api/track-order/open?token=${encodeURIComponent(token)}`, env().NEXT_PUBLIC_SITE_URL).toString();
      return { subject: `Secure link for ${d.orderNumber}`, body: `Open this link within 1 hour to see the full details of order ${d.orderNumber}: ${link}` };
    }
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

export interface DrainResult {
  delivered: number;
  previewed: number;
  failed: number;
  unavailable: number;
}

/**
 * Process pending outbox entries. Safe to run concurrently: each record is claimed in a transaction.
 *  - simulated mode: render a stored preview -> `previewed` (never `delivered`)
 *  - live mode, channel configured: send -> `delivered` with the vendor message id, or retry/fail
 *  - live mode, no channel: `unavailable` (explicit; nothing is claimed as sent)
 */
export async function drainOutbox(limit = 25): Promise<DrainResult> {
  const result: DrainResult = { delivered: 0, previewed: 0, failed: 0, unavailable: 0 };
  const simulated = env().INTEGRATION_MODE === "simulated";
  let channel: ReturnType<typeof liveChannel> = null;
  let channelError: string | null = null;
  if (!simulated) {
    try {
      channel = liveChannel();
      if (channel && !channel.configured()) {
        channelError = `The ${channel.name} channel is not fully configured.`;
        channel = null;
      }
    } catch (e) {
      channelError = e instanceof Error ? e.message.slice(0, 300) : "Messaging is not configured.";
    }
    // A channel may have been configured since records were parked: put them back in the queue (bounded).
    if (channel) await requeueUnavailable(limit);
  }
  const now = nowIso();
  const q = await col(C.outbox).where("status", "==", "pending").where("nextAttemptAt", "<=", now).orderBy("nextAttemptAt").limit(limit).get();
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
      if (simulated) {
        await doc.ref.update({ status: "previewed", channel: "preview", preview: renderNotification(claimed), previewedAt: nowIso(), deliveredAt: null, lastError: null });
        result.previewed++;
        continue;
      }
      if (!channel) {
        await doc.ref.update({ status: "unavailable", channel: null, preview: renderNotification(claimed), lastError: channelError ?? "No messaging channel is configured. Nothing was sent.", nextAttemptAt: "9999-12-31T00:00:00.000Z" });
        result.unavailable++;
        continue;
      }
      const msg = renderNotification(claimed, { forDelivery: true });
      const sent = await channel.send(claimed.to as MessageRecipient, msg, { idempotencyKey: doc.id });
      // Store the redacted preview (never the minted link) alongside the real delivery receipt.
      await doc.ref.update({ status: "delivered", channel: channel.name, providerMessageId: sent.providerMessageId, preview: renderNotification(claimed), deliveredAt: nowIso(), lastError: null });
      result.delivered++;
    } catch (e) {
      result.failed++;
      const retryable = !(e instanceof DeliveryError) || e.retryable;
      const attempts = claimed.attempts;
      const exhausted = !retryable || attempts >= MAX_ATTEMPTS;
      await doc.ref.update({
        status: exhausted ? (retryable ? "dead" : "failed") : "pending",
        lastError: e instanceof Error ? e.message.slice(0, 300) : "unknown error",
        nextAttemptAt: new Date(Date.now() + Math.min(3600_000, 30_000 * 2 ** attempts)).toISOString(),
      });
    }
  }
  return result;
}

/** Move `unavailable` records back to `pending` once a channel exists (bounded batch, oldest first). */
export async function requeueUnavailable(limit = 25): Promise<number> {
  const q = await col(C.outbox).where("status", "==", "unavailable").orderBy("createdAt").limit(limit).get();
  let n = 0;
  for (const d of q.docs) {
    await d.ref.update({ status: "pending", nextAttemptAt: nowIso(), lastError: null });
    n++;
  }
  return n;
}

/** Counts for the admin dashboard: how many messages did customers NOT get. */
export async function outboxHealth(): Promise<{ unavailable: number; failed: number; pending: number }> {
  const count = async (status: string) => (await col(C.outbox).where("status", "==", status).count().get()).data().count;
  const [unavailable, failed, pending] = await Promise.all([count("unavailable"), count("failed"), count("pending")]);
  return { unavailable, failed, pending };
}
