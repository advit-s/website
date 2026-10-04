import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/session";
import { readMedia } from "@/server/services/media";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

/** Admin-only preview of private (draft) media. Path is allow-listed to our own re-encoded .webp objects. */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const path = new URL(req.url).searchParams.get("path") ?? "";
    const m = await readMedia(path);
    if (!m) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
    return new NextResponse(new Uint8Array(m.data), { headers: { "Content-Type": m.contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    return errorResponse(e);
  }
}
