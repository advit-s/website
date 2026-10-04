/**
 * Sanitise a post-login return URL to prevent open redirects. Only same-site absolute paths are allowed.
 * Rejects protocol-relative ("//evil"), backslash tricks ("/\evil"), schemes, control characters and the auth pages themselves.
 */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next) return fallback;
  let v = next;
  try {
    v = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (v.length > 300) return fallback;
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return fallback;
  if (/^\/(login|register|forgot-password)(\/|\?|$)/.test(v)) return fallback;
  if (/^\/api\//.test(v)) return fallback;
  return v;
}
