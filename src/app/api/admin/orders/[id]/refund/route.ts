import { z } from "zod";
import { adminRoute } from "@/server/admin-http";
import { json, readJson } from "@/server/http";
import { executeRefund } from "@/server/services/admin-orders";

const body = z.object({ refundId: z.string().min(3).max(40) });

/** Sends a requested refund to the payment provider. Money movement: needs a recent sign-in and is idempotent per refund. */
export const POST = adminRoute(
  async (req, ctx: { params: Promise<{ id: string }> }, admin) => {
    const { id } = await ctx.params;
    const { refundId } = await readJson(req, body);
    const o = await executeRefund(id, refundId, admin.uid);
    return json({ paymentStatus: o.paymentStatus, refunds: o.payment.refunds.map((r) => ({ id: r.id, state: r.state })) });
  },
  { recent: true },
);
