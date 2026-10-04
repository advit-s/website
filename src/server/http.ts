import "server-only";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { env, ConfigurationError } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "Please sign in to continue.") => new HttpError(401, "UNAUTHENTICATED", msg);
export const forbidden = (msg = "You do not have access to this resource.") => new HttpError(403, "FORBIDDEN", msg);
export const notFound = (msg = "Not found.") => new HttpError(404, "NOT_FOUND", msg);
export const badRequest = (msg: string, extra?: Record<string, unknown>) => new HttpError(400, "BAD_REQUEST", msg, extra);
export const conflict = (code: string, msg: string, extra?: Record<string, unknown>) => new HttpError(409, code, msg, extra);

/**
 * CSRF / cross-origin defence for cookie-authenticated mutations: the Origin header must match this site.
 * Combined with SameSite=Lax cookies and JSON-only bodies. Webhook/job routes authenticate differently and skip this.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin) throw new HttpError(403, "BAD_ORIGIN", "Missing Origin header.");
  let o: URL;
  try {
    o = new URL(origin);
  } catch {
    throw new HttpError(403, "BAD_ORIGIN", "Invalid Origin header.");
  }
  const site = new URL(env().NEXT_PUBLIC_SITE_URL);
  const allowed = new Set([site.host, host ?? ""]);
  if (!allowed.has(o.host)) throw new HttpError(403, "BAD_ORIGIN", "Cross-origin request blocked.");
}

export async function readJson<S extends z.ZodTypeAny>(req: Request, schema: S, maxBytes = 64 * 1024): Promise<z.infer<S>> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json.");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body too large.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw badRequest("Malformed JSON.");
  }
  return schema.parse(data);
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  const first = xf?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    const headers: Record<string, string> = {};
    if (typeof e.extra?.retryAfter === "number") headers["Retry-After"] = String(e.extra.retryAfter);
    return json({ error: { code: e.code, message: e.message, ...e.extra } }, { status: e.status, headers });
  }
  if (e instanceof ZodError) {
    return json(
      { error: { code: "VALIDATION", message: "Some fields are invalid.", fields: Object.fromEntries(e.issues.map((i) => [i.path.join(".") || "_", i.message])) } },
      { status: 422 },
    );
  }
  if (e instanceof ConfigurationError) {
    return json({ error: { code: e.code, message: e.message } }, { status: 503 });
  }
  console.error("[api] unhandled error", e instanceof Error ? { name: e.name, message: e.message, stack: e.stack?.split("\n").slice(0, 4).join("\n") } : e);
  return json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wrap a route handler with uniform error handling. */
export function handle<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
