import "server-only";
import { timingSafeEqual } from "node:crypto";
import { C, col, nowIso } from "../repos/common";
import { db } from "../firebase/admin";
import { addTimeline, orderFromDoc, sha256 } from "./order-core";
import { enqueueNotification } from "./notifications";
import { mapShiprocketStatus } from "../providers/shipping";
import { canAdvanceFromProvider, STATUS_LABEL } from "@/domain/order-state";
import { env } from "../env";
import type { FulfilmentStatus } from "@/domain/types";

/**
 * Shiprocket authenticates webhooks with a configurable token that it sends back in the `x-api-key` header
 * (Settings > API > Webhooks in the Shiprocket panel). This is NOT an HMAC over the body like Razorpay - see docs/DECISIONS.md D-13.
 * Because a static token is weaker evidence than a signature, events can only move an order FORWARD along the courier path and
 * anything ambiguous (RTO, undelivered, lost) flags the order for a human instead of changing its state.
 */
export function verifyShiprocketToken(header: string | null): boolean {
  const expected = env().SHIPROCKET_WEBHOOK_TOKEN;
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface ShiprocketPayload {
  awb?: string;
  current_status?: string;
  order_id?: string;
  current_timestamp?: string;
  shipment_status?: string;
}

export async function handleShiprocketEvent(raw: string): Promise<{ status: 200 | 400; body: Record<string, unknown> }> {
  let p: ShiprocketPayload;
  try {
    p = JSON.parse(raw) as ShiprocketPayload;
  } catch {
    return { status: 400, body: { error: "malformed body" } };
  }
  const statusText = (p.current_status ?? p.shipment_status ?? "").toString().slice(0, 120);
  const awb = (p.awb ?? "").toString().slice(0, 60);
  if (!statusText || (!awb && !p.order_id)) return { status: 200, body: { ok: true, ignored: "no actionable data" } };

  const receiptRef = col(C.webhookReceipts).doc(`shiprocket_${sha256(`${awb}|${statusText}|${p.current_timestamp ?? ""}`).slice(0, 40)}`);
  try {
    await receiptRef.create({ provider: "shiprocket", awb, status: statusText, receivedAt: nowIso() });
  } catch (e) {
    if ((e as { code?: number }).code === 6) return { status: 200, body: { ok: true, duplicate: true } };
    throw e;
  }

  let q = awb ? await col(C.orders).where("shipment.awbNumber", "==", awb).limit(1).get() : null;
  if ((!q || q.empty) && p.order_id) q = await col(C.orders).where("orderNumber", "==", String(p.order_id).toUpperCase()).limit(1).get();
  const doc = q?.docs[0];
  if (!doc) return { status: 200, body: { ok: true, ignored: "unknown shipment" } };

  const mapped = mapShiprocketStatus(statusText);
  const out = await db().runTransaction(async (tx) => {
    const order = orderFromDoc(await tx.get(doc.ref));
    if (mapped === "exception") {
      tx.update(doc.ref, { needsReview: true, updatedAt: nowIso(), version: order.version + 1 });
      addTimeline(tx, order.id, { type: "shipment.exception", label: `Courier reported: ${statusText}`, detail: "Flagged for review", customerVisible: false, actor: "provider" });
      return { changed: false as const };
    }
    if (!mapped || !canAdvanceFromProvider(order.status, mapped as FulfilmentStatus)) return { changed: false as const };
    const now = nowIso();
    tx.update(doc.ref, {
      status: mapped,
      ...(mapped === "delivered" ? { "shipment.deliveredAt": now } : {}),
      updatedAt: now,
      version: order.version + 1,
    });
    addTimeline(tx, order.id, { type: `shipment.${mapped}`, label: STATUS_LABEL[mapped as FulfilmentStatus], detail: `Courier update: ${statusText}`, customerVisible: true, actor: "provider" });
    return { changed: true as const, order, mapped };
  });
  if (out.changed) {
    await enqueueNotification({ kind: "order.status", to: { email: out.order.contact.email, phone: out.order.contact.phone }, data: { orderNumber: out.order.orderNumber, statusLabel: STATUS_LABEL[out.mapped as FulfilmentStatus], detail: statusText }, dedupeKey: `ship_${doc.id}_${out.mapped}` });
  }
  return { status: 200, body: { ok: true, applied: out.changed } };
}
