/**
 * Resolve a stored image reference to a URL the browser can load.
 *  - "/demo/..." or "https://..."  -> used as-is (seeded placeholder art or external URL)
 *  - "products/published/..." etc  -> Firebase Storage public download URL (emulator-aware)
 */
export function mediaUrl(src: string | null | undefined): string {
  if (!src) return "/demo/placeholder.svg";
  if (src.startsWith("/") || src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) return src;
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-rajraani"}.appspot.com`;
  const emu = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
  const host = emu ? "http://127.0.0.1:9199" : "https://firebasestorage.googleapis.com";
  return `${host}/v0/b/${bucket}/o/${encodeURIComponent(src)}?alt=media`;
}

/** In admin screens, private draft media is previewed through an admin-only endpoint; everything else uses the public URL. */
export function adminMediaUrl(src: string | null | undefined): string {
  if (src && src.startsWith("products/draft/")) return `/api/admin/media?path=${encodeURIComponent(src)}`;
  return mediaUrl(src);
}
