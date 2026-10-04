import { NextResponse } from "next/server";
import { authorizeOrder } from "@/server/auth/order-access";
import { buildInvoicePdf } from "@/server/services/invoice";
import { getPublicSettings } from "@/server/repos/settings";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

/** Invoice PDF for ONE order the caller is authorised to see (owner, admin, or secure-link holder). Otherwise 404. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { order } = await authorizeOrder(id, ["success", "track"]);
    const pdf = await buildInvoicePdf(order, await getPublicSettings());
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${order.orderNumber}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
