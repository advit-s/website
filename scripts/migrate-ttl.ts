/**
 * Convert `expiresAt` ISO strings to Firestore Timestamps on rateLimits and idempotencyKeys so TTL policies can delete them.
 * Dry-run by default; bounded and resumable. See src/server/services/ttl-migration.ts.
 *
 *   npm run migrate:ttl                                   dry run against the local emulator (first 200 docs per collection)
 *   npm run migrate:ttl -- --commit                       convert on the emulator
 *   npm run migrate:ttl -- --collection=rateLimits --after=<lastDocId> --limit=300
 *
 * NEVER run against cloud data without the owner's authorisation. A non-emulator target needs ALL of:
 *   --project-id=<id> matching NEXT_PUBLIC_FIREBASE_PROJECT_ID, --allow-cloud, and CONFIRM_TTL_MIGRATION=<id> in the environment.
 * Back up first (Firestore export / scheduled backup); the change is one field per document and is reversible only from a backup.
 */
import { migrateTtlBatch, TTL_COLLECTIONS, type TtlCollection } from "@/server/services/ttl-migration";
import { assertTtlTarget } from "./lib/ttl-guard";

async function main() {
  const args = process.argv.slice(2);
  const target = assertTtlTarget(args, process.env);
  const commit = args.includes("--commit");
  const only = args.find((a) => a.startsWith("--collection="))?.slice(13) as TtlCollection | undefined;
  const after = args.find((a) => a.startsWith("--after="))?.slice(8) ?? null;
  const limit = Number(args.find((a) => a.startsWith("--limit="))?.slice(8) ?? 200);
  const collections = only ? [only] : [...TTL_COLLECTIONS];
  console.log(`[migrate:ttl] target=${target} mode=${commit ? "COMMIT" : "dry run"}`);
  for (const c of collections) {
    const r = await migrateTtlBatch({ collection: c, after: only ? after : null, limit, commit });
    console.log(JSON.stringify(r));
    if (r.nextCursor) console.log(`[migrate:ttl] more documents remain in ${c}; continue with --collection=${c} --after=${r.nextCursor}`);
  }
  if (!commit) console.log("[migrate:ttl] dry run only: nothing was written. Add --commit to convert.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
