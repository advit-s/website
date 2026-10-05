import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { C, col } from "../repos/common";

/**
 * Migration of TTL fields from ISO strings to Firestore Timestamps.
 *
 * Firestore TTL policies only act on fields holding a Timestamp (https://firebase.google.com/docs/firestore/ttl). Older
 * `rateLimits` / `idempotencyKeys` documents were written with ISO strings, so the policy would never delete them.
 * New writes use Timestamps (see `ttlTimestamp`). This converts existing documents:
 *  - bounded (default 200 docs per call, hard max 500), resumable (returns `nextCursor` = last document id), dry-run by default;
 *  - each write carries a `lastUpdateTime` precondition, so a document changed since we read it is skipped, never overwritten;
 *  - only the single `expiresAt` field changes; unparsable values are reported and left alone (never deleted);
 *  - TTL deletion is asynchronous cleanup. It is not access control and it is not the business expiry of any record.
 */
export const TTL_COLLECTIONS = [C.rateLimits, C.idempotency] as const;
export type TtlCollection = (typeof TTL_COLLECTIONS)[number];

export interface TtlMigrationReport {
  collection: TtlCollection;
  dryRun: boolean;
  scanned: number;
  alreadyTimestamp: number;
  stringToConvert: number;
  converted: number;
  skippedChanged: number;
  unparsable: { id: string; value: unknown }[];
  missing: number;
  /** Pass back as `after` to continue; null when the collection has been fully scanned. */
  nextCursor: string | null;
}

export async function migrateTtlBatch(opts: { collection: TtlCollection; after?: string | null; limit?: number; commit?: boolean }): Promise<TtlMigrationReport> {
  if (!TTL_COLLECTIONS.includes(opts.collection)) throw new Error(`Not a TTL collection: ${opts.collection}`);
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const dryRun = !opts.commit;
  let q = col(opts.collection).orderBy("__name__").limit(limit);
  if (opts.after) q = q.startAfter(col(opts.collection).doc(opts.after));
  const snap = await q.get();
  const report: TtlMigrationReport = {
    collection: opts.collection,
    dryRun,
    scanned: snap.size,
    alreadyTimestamp: 0,
    stringToConvert: 0,
    converted: 0,
    skippedChanged: 0,
    unparsable: [],
    missing: 0,
    nextCursor: snap.size === limit ? (snap.docs.at(-1)?.id ?? null) : null,
  };
  const convertible: typeof snap.docs = [];
  for (const d of snap.docs) {
    const v = (d.data() as { expiresAt?: unknown }).expiresAt;
    if (v === undefined || v === null) {
      report.missing++;
    } else if (v instanceof Timestamp) {
      report.alreadyTimestamp++;
    } else if (typeof v === "string" && !Number.isNaN(Date.parse(v))) {
      report.stringToConvert++;
      convertible.push(d);
    } else {
      report.unparsable.push({ id: d.id, value: typeof v === "string" ? v.slice(0, 40) : typeof v });
    }
  }
  if (dryRun) return report;
  // One precondition-guarded write per document: a document changed since it was read is skipped, never overwritten.
  for (const d of convertible) {
    try {
      await d.ref.update({ expiresAt: Timestamp.fromMillis(Date.parse((d.data() as { expiresAt: string }).expiresAt)) }, { lastUpdateTime: d.updateTime });
      report.converted++;
    } catch {
      report.skippedChanged++;
    }
  }
  return report;
}
