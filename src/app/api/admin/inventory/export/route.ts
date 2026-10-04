import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { exportRows, rowsToCsv, rowsToXlsx } from "@/server/services/inventory";

export const runtime = "nodejs";

/** Export the current inventory view (filters honoured) as CSV or XLSX. Cells that could be read as spreadsheet formulas are neutralised. */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const sp = new URL(req.url).searchParams;
    const filter = (["low", "out"].includes(sp.get("filter") ?? "") ? sp.get("filter") : "all") as "all" | "low" | "out";
    const rows = await exportRows({ filter, q: sp.get("q") ?? undefined, categoryId: sp.get("category") ?? undefined });
    const stamp = new Date().toISOString().slice(0, 10);
    if (sp.get("format") === "xlsx") {
      return new NextResponse(new Uint8Array(await rowsToXlsx(rows)), {
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="inventory-${stamp}.xlsx"`, "Cache-Control": "no-store" },
      });
    }
    return new NextResponse(rowsToCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inventory-${stamp}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    return errorResponse(e);
  }
}
