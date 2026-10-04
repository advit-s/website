import { z } from "zod";
import { assertSameOrigin, handle, json, readJson } from "@/server/http";
import { authorizeOrder } from "@/server/auth/order-access";
import { requestReturn } from "@/server/services/order-actions";

const body = z.object({ reason: z.string().trim().min(5, "Please tell us briefly why.").max(500) });

export const POST = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const { order } = await authorizeOrder(id, ["success", "track"]);
  const { reason } = await readJson(req, body);
  await requestReturn(order.id, reason, { id: order.userId ?? "guest", kind: "customer" });
  return json({ ok: true });
});
