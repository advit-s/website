import "server-only";
import { assertSameOrigin, handle } from "./http";
import { requireAdmin, requireRecentAdmin, type SessionUser } from "./auth/session";

/**
 * Wrapper for every /api/admin/* handler: uniform error handling, origin check on mutations, and the authoritative
 * admin check (verified non-revoked session + admin custom claim). `recent: true` additionally demands a recent sign-in
 * for destructive actions. Authorisation is NEVER inferred from the URL or the proxy.
 */
export function adminRoute<C = unknown>(fn: (req: Request, ctx: C, admin: SessionUser) => Promise<Response>, opts: { recent?: boolean } = {}) {
  return handle<C>(async (req, ctx) => {
    if (!["GET", "HEAD"].includes(req.method)) assertSameOrigin(req);
    const admin = opts.recent ? await requireRecentAdmin() : await requireAdmin();
    return fn(req, ctx, admin);
  });
}
