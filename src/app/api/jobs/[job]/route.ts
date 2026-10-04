import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { expireReservations, reconcilePayments } from "@/server/services/payment-events";
import { drainOutbox } from "@/server/services/notifications";

export const runtime = "nodejs";

/**
 * Scheduled maintenance, authenticated with JOB_SECRET (Authorization: Bearer ...). Intended callers: Cloud Scheduler
 * (production) or `npm run jobs:*` (local). Idempotent - safe to run on overlapping schedules. See docs/DEPLOYMENT.md.
 */
export async function POST(req: Request, ctx: { params: Promise<{ job: string }> }) {
  const secret = env().JOB_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { job } = await ctx.params;
  switch (job) {
    case "expire":
      return NextResponse.json(await expireReservations());
    case "outbox":
      return NextResponse.json(await drainOutbox());
    case "reconcile":
      return NextResponse.json(await reconcilePayments());
    default:
      return NextResponse.json({ error: "unknown job" }, { status: 404 });
  }
}
