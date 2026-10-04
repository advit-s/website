import { z } from "zod";
import { assertSameOrigin, handle, json, readJson } from "@/server/http";
import { authorizeOrder } from "@/server/auth/order-access";
import { cancelOrder } from "@/server/services/order-actions";

const body = z.object({ reason: z.string().trim().max(200).default("Cancelled by customer") });

/** Customer cancellation: only the owner (or a holder of this order's token) and only before the order ships. */
export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const { order } = await authorizeOrder(id, ["success", "track"]);
  const { reason } = await readJson(req, body);
  const updated = await cancelOrder(order.id, { id: order.userId ?? "guest", kind: "customer" }, reason || "Cancelled by customer");
  return json({ status: updated.status });
});
