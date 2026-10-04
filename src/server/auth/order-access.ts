import "server-only";
import { cookies } from "next/headers";
import { getSession } from "./session";
import { ACCESS_COOKIE, makeAccessToken, orderFromDoc, orderRef, verifyAccessToken, type TokenPurpose } from "../services/order-core";
import { notFound } from "../http";
import type { Order } from "@/domain/types";

/**
 * Authorise access to ONE order. Allowed when (a) the signed-in user owns it, (b) the caller holds a valid, unexpired,
 * order-scoped token cookie issued at checkout, or (c) the caller is an admin. Anything else is reported as "not found"
 * (never "forbidden") so order ids cannot be probed.
 */
export async function authorizeOrder(orderId: string, purposes: TokenPurpose[] = ["success"]): Promise<{ order: Order; via: "owner" | "token" | "admin" }> {
  const snap = await orderRef(orderId).get();
  if (!snap.exists) throw notFound("Order not found.");
  const order = orderFromDoc(snap);
  const session = await getSession();
  if (session) {
    if (session.isAdmin) return { order, via: "admin" };
    if (order.userId && order.userId === session.uid) return { order, via: "owner" };
  }
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE(orderId))?.value;
  if (purposes.some((p) => verifyAccessToken(token, orderId, p))) return { order, via: "token" };
  throw notFound("Order not found.");
}

export async function setOrderAccessCookie(orderId: string, ttlSeconds = 24 * 3600): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE(orderId), makeAccessToken(orderId, "success", ttlSeconds), {
    httpOnly: true,
    secure: process.env.APP_ENV !== "local",
    sameSite: "lax",
    path: "/",
    maxAge: ttlSeconds,
  });
}
