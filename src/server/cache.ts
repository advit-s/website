import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";

/** Seconds that public catalog/settings reads are cached. Short locally so seed/admin edits show quickly. */
export function cacheSeconds(): number {
  return process.env.APP_ENV === "production" ? 60 : 2;
}

const inNext = () => typeof process.env.NEXT_RUNTIME === "string";

/**
 * unstable_cache that degrades to a plain call outside the Next.js server (seed scripts, jobs, Vitest),
 * where there is no incremental cache. Results must be JSON-serialisable.
 */
export function cachedFn<A extends unknown[], R>(fn: (...a: A) => Promise<R>, keyParts: string[], tags: string[]): (...a: A) => Promise<R> {
  let wrapped: ((...a: A) => Promise<R>) | null = null;
  return (...a: A) => {
    if (!inNext()) return fn(...a);
    wrapped ??= unstable_cache(fn, keyParts, { tags, revalidate: cacheSeconds() });
    return wrapped(...a);
  };
}

/** Invalidate cached public reads; a no-op outside the Next.js server. */
export function invalidate(...tags: string[]): void {
  if (!inNext()) return;
  for (const t of tags) {
    try {
      revalidateTag(t);
    } catch {
      /* called outside a request scope (e.g. a job) - the short TTL covers it */
    }
  }
}
