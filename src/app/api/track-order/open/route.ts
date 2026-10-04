import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, parseAccessToken } from "@/server/services/order-core";
import { env } from "@/server/env";

/** Opens a secure tracking link: validates the signed token, stores it as an HttpOnly order-scoped cookie, then redirects (token leaves the URL). */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const orderId = parseAccessToken(token, "track");
  const base = new URL(env().NEXT_PUBLIC_SITE_URL);
  if (!orderId || !token) return NextResponse.redirect(new URL("/track-order?link=invalid", base));
  (await cookies()).set(ACCESS_COOKIE(orderId), token, { httpOnly: true, secure: env().APP_ENV !== "local", sameSite: "lax", path: "/", maxAge: 3600 });
  return NextResponse.redirect(new URL(`/track-order?o=${encodeURIComponent(orderId)}`, base));
}
