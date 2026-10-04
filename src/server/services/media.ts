import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { bucket } from "../firebase/admin";
import { badRequest } from "../http";

/**
 * Image pipeline. A client-declared MIME type proves nothing about the bytes, so every upload is DECODED with sharp,
 * checked for real format and dimensions, rotated per EXIF, downscaled, stripped of metadata and re-encoded as WebP.
 * What is stored is our own re-encoded output, never the uploaded bytes.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["jpeg", "png", "webp"]);
const MIN_SIDE = 200;
const MAX_SIDE = 8000;

export type MediaKind = "product" | "category";

export async function processAndStoreImage(input: Buffer, kind: MediaKind): Promise<{ path: string; width: number; height: number; bytes: number }> {
  if (input.length === 0) throw badRequest("The file is empty.");
  if (input.length > MAX_UPLOAD_BYTES) throw badRequest(`Images must be under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  let meta: { format?: string; width?: number; height?: number };
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000, failOn: "error" }).metadata();
  } catch {
    throw badRequest("That file is not a valid image.");
  }
  if (!meta.format || !ALLOWED.has(meta.format)) throw badRequest("Only JPEG, PNG or WebP images are allowed.");
  if (!meta.width || !meta.height || meta.width < MIN_SIDE || meta.height < MIN_SIDE) throw badRequest(`Images must be at least ${MIN_SIDE}px on each side.`);
  if (meta.width > MAX_SIDE || meta.height > MAX_SIDE) throw badRequest(`Images must be at most ${MAX_SIDE}px on each side.`);

  let out: Buffer;
  let info: { width: number; height: number };
  try {
    ({ data: out, info } = await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 2000, height: 2500, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw badRequest("That image could not be processed.");
  }
  // Product uploads start private (draft/) and are copied to published/ only when the product is published.
  const path = kind === "category" ? `categories/${randomUUID()}.webp` : `products/draft/${randomUUID()}.webp`;
  await bucket().file(path).save(out, { contentType: "image/webp", resumable: false, metadata: { cacheControl: "public, max-age=31536000, immutable" } });
  return { path, width: info.width, height: info.height, bytes: out.length };
}

/** Copy a draft image into the public namespace (idempotent). Returns the published path. */
export async function publishImage(path: string): Promise<string> {
  if (!path.startsWith("products/draft/")) return path;
  const dest = path.replace("products/draft/", "products/published/");
  const target = bucket().file(dest);
  const [exists] = await target.exists();
  if (!exists) await bucket().file(path).copy(target);
  return dest;
}

const SAFE_PATH = /^(products|categories)\/(draft\/|published\/)?[A-Za-z0-9-]+\.webp$/;

export function isSafeMediaPath(path: string): boolean {
  return SAFE_PATH.test(path) && !path.includes("..");
}

export async function readMedia(path: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (!isSafeMediaPath(path)) return null;
  const f = bucket().file(path);
  const [exists] = await f.exists();
  if (!exists) return null;
  const [data] = await f.download();
  return { data, contentType: "image/webp" };
}
