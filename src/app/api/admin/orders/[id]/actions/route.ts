import { z } from "zod";
import { adminRoute } from "@/server/admin-http";
import { json, readJson } from "@/server/http";
import { applyOrderAction } from "@/server/services/admin-orders";
import { requireRecentAdmin } from "@/server/auth/session";

/** Money-affecting recovery actions need a recent sign-in, like sending a refund does. */
const RECENT = new Set(["booking_attach", "refund_reconcile", "refund_attest_absent", "exception_refund", "exception_reconcile", "clear_review"]);

const paise = z.number().int().min(0).max(100_000_000_00);
const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("confirm") }),
  z.object({ type: z.literal("start_processing") }),
  z.object({ type: z.literal("ship"), mode: z.enum(["shiprocket", "manual"]), courierName: z.string().trim().max(60).optional(), awbNumber: z.string().trim().max(60).optional(), trackingUrl: z.string().trim().max(300).optional() }),
  z.object({ type: z.literal("out_for_delivery") }),
  z.object({ type: z.literal("deliver"), codCollected: z.boolean().optional() }),
  z.object({ type: z.literal("collect_cod") }),
  z.object({ type: z.literal("cancel"), reason: z.string().trim().min(3, "Give a reason").max(200) }),
  z.object({ type: z.literal("note"), text: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal("refund_request"), amount: paise.min(1), reason: z.string().trim().min(3).max(200) }),
  z.object({ type: z.literal("cod_refund_record"), refundId: z.string().min(3).max(40), reference: z.string().trim().min(4).max(80) }),
  z.object({ type: z.literal("return_decision"), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(200).optional() }),
  z.object({ type: z.literal("return_received"), disposition: z.enum(["restock", "discard"]) }),
  z.object({ type: z.literal("return_close") }),
  z.object({ type: z.literal("custom_quote"), quotedTotal: paise.nullable(), leadTimeDays: z.number().int().min(1).max(365).nullable(), advancePaid: paise, productionState: z.enum(["enquiry", "quoted", "in_production", "ready"]) }),
  z.object({ type: z.literal("booking_attach"), shiprocketOrderId: z.string().trim().min(3).max(40) }),
  z.object({ type: z.literal("refund_reconcile"), refundId: z.string().min(3).max(40) }),
  z.object({ type: z.literal("refund_attest_absent"), refundId: z.string().min(3).max(40), note: z.string().trim().min(20, "Describe the provider check you made").max(500) }),
  z.object({ type: z.literal("exception_refund"), exceptionId: z.string().min(8).max(64) }),
  z.object({ type: z.literal("exception_reconcile"), exceptionId: z.string().min(8).max(64), note: z.string().trim().min(20, "Describe how it was handled").max(500) }),
  z.object({ type: z.literal("clear_review") }),
]);

/** Single entry point for admin order mutations; every one is state-guarded, audited and re-authorised here. */
export const POST = adminRoute(async (req, ctx: { params: Promise<{ id: string }> }, admin) => {
  const { id } = await ctx.params;
  const a = await readJson(req, action);
  if (RECENT.has(a.type)) await requireRecentAdmin();
  const order = await applyOrderAction(id, a, admin.uid);
  return json({ status: order.status, paymentStatus: order.paymentStatus, returnStatus: order.returnStatus });
});
