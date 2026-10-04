import { NextResponse } from "next/server";
import { handleRazorpayWebhook } from "@/server/services/payment-events";
import { ConfigurationError } from "@/server/env";

export const runtime = "nodejs";

/**
 * Razorpay webhook. Authenticated by HMAC-SHA256 over the RAW request bytes (X-Razorpay-Signature), compared in constant
 * time. No origin/CSRF check: this route is called server-to-server and trusts nothing but the signature.
 */
export async function POST(req: Request) {
  const raw = await req.text(); // raw body, before any JSON.parse
  if (raw.length > 512 * 1024) return NextResponse.json({ error: "too large" }, { status: 413 });
  try {
    const out = await handleRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"), req.headers.get("x-razorpay-event-id"));
    return NextResponse.json(out.body, { status: out.status });
  } catch (e) {
    if (e instanceof ConfigurationError) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
    console.error("[razorpay webhook] processing error", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "processing error" }, { status: 500 }); // non-2xx makes Razorpay retry
  }
}
