import { NextResponse } from "next/server";
import { handleShiprocketEvent, verifyShiprocketToken } from "@/server/services/shipment-events";

export const runtime = "nodejs";

/** Shiprocket tracking webhook: token (x-api-key) authenticated, forward-only state changes. Always 200 for authenticated, handled events. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ error: "too large" }, { status: 413 });
  if (!verifyShiprocketToken(req.headers.get("x-api-key"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const out = await handleShiprocketEvent(raw);
    return NextResponse.json(out.body, { status: out.status });
  } catch (e) {
    console.error("[shiprocket webhook] error", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "processing error" }, { status: 500 });
  }
}
