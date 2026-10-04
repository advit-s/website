import { adminRoute } from "@/server/admin-http";
import { badRequest, json } from "@/server/http";
import { MAX_UPLOAD_BYTES, processAndStoreImage, type MediaKind } from "@/server/services/media";
import { audit } from "@/server/services/audit";

export const runtime = "nodejs";

/** Admin image upload (multipart). The bytes are decoded, validated and re-encoded server-side; the declared MIME type is ignored. */
export const POST = adminRoute(async (req, _ctx, admin) => {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw badRequest("File too large.");
  const form = await req.formData();
  const file = form.get("file");
  const kind = (form.get("kind") === "category" ? "category" : "product") as MediaKind;
  if (!(file instanceof File)) throw badRequest("No file received.");
  const out = await processAndStoreImage(Buffer.from(await file.arrayBuffer()), kind);
  await audit(admin.uid, "media.upload", out.path, { kind, bytes: out.bytes });
  return json(out, { status: 201 });
});
