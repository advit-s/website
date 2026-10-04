import { NextResponse, type NextRequest } from "next/server";

/**
 * Early, cheap redirect for protected areas: no session cookie -> /login?next=...
 * This is ONLY a convenience layer. It does not verify the cookie (no Admin SDK here); every protected page,
 * server action and route handler independently verifies the session, role and ownership (src/server/auth/session.ts).
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get("__session")?.value);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/account/:path*"] };
