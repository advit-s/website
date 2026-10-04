import { adminRoute } from "@/server/admin-http";
import { badRequest, json } from "@/server/http";
import { rateLimit, RULES } from "@/server/rate-limit";
import { commitImport, IMPORT_MAX_BYTES, planImport } from "@/server/services/inventory";
import { requireRecentAdmin } from "@/server/auth/session";

export const runtime = "nodejs";

/** mode=dry-run returns a per-row plan and writes nothing. mode=commit applies it (needs a recent sign-in) in version-checked chunks. */
export const POST = adminRoute(async (req, _ctx, admin) => {
  await rateLimit(RULES.importUid, admin.uid);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > IMPORT_MAX_BYTES + 64 * 1024) throw badRequest("The file is too large (max 2 MB).");
  const form = await req.formData();
  const file = form.get("file");
  const mode = form.get("mode") === "commit" ? "commit" : "dry-run";
  if (!(file instanceof File)) throw badRequest("No file received.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (mode === "dry-run") {
    const { results, fileRows } = await planImport(buf, file.name);
    return json({ mode, fileRows, results: results.map(({ patch: _p, ...r }) => r) });
  }
  await requireRecentAdmin();
  const out = await commitImport(buf, file.name, admin.uid);
  return json({ mode, ...out, results: out.results.map(({ patch: _p, ...r }) => r) });
});
