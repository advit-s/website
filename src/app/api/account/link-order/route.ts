import { assertSameOrigin, clientIp, conflict, handle, HttpError, json, readJson } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { requireUser } from "@/server/auth/session";
import { trackOrderSchema } from "@/domain/validation";
import { C, col, nowIso } from "@/server/repos/common";
import { db } from "@/server/firebase/admin";
import { orderFromDoc, orderRef, addTimelineNow } from "@/server/services/order-core";

const body = trackOrderSchema.pick({ orderNumber: true });

/**
 * Deliberately link ONE guest order to the signed-in account. Never automatic (an unverified phone/email match could attach
 * someone else's order to a new sign-up). The order's contact must match a VERIFIED identifier on this account: the phone number
 * proven by OTP, or an email address Firebase has verified.
 */
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await rateLimit(RULES.trackOrderIp, clientIp(req));
  const user = await requireUser();
  const { orderNumber } = await readJson(req, body);
  await rateLimit(RULES.trackOrderTarget, orderNumber);
  const q = await col(C.orders).where("orderNumber", "==", orderNumber).limit(1).get();
  const doc = q.docs[0];
  const generic = new HttpError(404, "NOT_FOUND", "We could not link that order. It must be a guest order, and its phone number or email must match a verified phone or verified email on your account.");
  if (!doc) throw generic;
  const o = orderFromDoc(doc);
  const phoneOk = Boolean(user.phone) && (user.phone === o.contact.phone || user.phone === o.shippingAddress.phone);
  const emailOk = user.emailVerified && Boolean(user.email) && user.email!.toLowerCase() === o.contact.email.toLowerCase();
  if (o.userId || !(phoneOk || emailOk)) throw o.userId === user.uid ? conflict("ALREADY_LINKED", "This order is already in your account.") : generic;
  await db().runTransaction(async (tx) => {
    const cur = orderFromDoc(await tx.get(orderRef(o.id)));
    if (cur.userId) throw generic;
    tx.update(orderRef(o.id), { userId: user.uid, updatedAt: nowIso(), version: cur.version + 1 });
  });
  await addTimelineNow(o.id, { type: "order.linked", label: "Order added to your account", detail: null, customerVisible: false, actor: user.uid });
  return json({ ok: true, orderId: o.id });
});
