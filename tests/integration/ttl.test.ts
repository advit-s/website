import { beforeAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/server/firebase/admin";
import { C, newId } from "@/server/repos/common";
import { rateLimit } from "@/server/rate-limit";
import { placeOrder } from "@/server/services/checkout";
import { migrateTtlBatch } from "@/server/services/ttl-migration";
import { assertTtlTarget } from "../../scripts/lib/ttl-guard";
import { checkoutInput, ensureSettings, makeProduct } from "../helpers/fixtures";

beforeAll(ensureSettings);

describe("TTL fields are stored as Firestore Timestamps (read back from persisted documents)", () => {
  it("rateLimits.expiresAt is a Timestamp roughly two windows ahead", async () => {
    const rule = { name: `ttl-test-${newId("")}`, limit: 5, windowSeconds: 60 };
    await rateLimit(rule, "subject-1");
    const q = await db().collection(C.rateLimits).where("rule", "==", rule.name).get();
    expect(q.size).toBe(1);
    const v = q.docs[0]!.data().expiresAt;
    expect(v).toBeInstanceOf(Timestamp);
    const ahead = (v as Timestamp).toMillis() - Date.now();
    expect(ahead).toBeGreaterThan(60_000);
    expect(ahead).toBeLessThanOrEqual(120_000 + 1000);
  });

  it("idempotencyKeys.expiresAt is a Timestamp ~30 days ahead, and ordinary ISO timestamps elsewhere are unchanged", async () => {
    const f = await makeProduct({ stocks: [3] });
    const r = await placeOrder(checkoutInput(f.variants[0]!.id, 1), { userId: null, idempotencyKey: newId("idem_") });
    const idem = (await db().collection(C.idempotency).where("orderId", "==", r.orderId).get()).docs[0]!.data();
    expect(idem.expiresAt).toBeInstanceOf(Timestamp);
    const days = ((idem.expiresAt as Timestamp).toMillis() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    // business timestamps keep the ISO-string convention (reservation expiry comparisons depend on it)
    expect(typeof idem.createdAt).toBe("string");
    const order = (await db().collection(C.orders).doc(r.orderId).get()).data()!;
    expect(typeof order.placedAt).toBe("string");
  });
});

describe("TTL string -> Timestamp migration", () => {
  const tag = newId("m");
  const seed = async () => {
    const col = db().collection(C.rateLimits);
    const iso = new Date(Date.now() + 3600_000).toISOString();
    await col.doc(`${tag}_a`).set({ rule: tag, expiresAt: iso });
    await col.doc(`${tag}_b`).set({ rule: tag, expiresAt: iso });
    await col.doc(`${tag}_c`).set({ rule: tag, expiresAt: Timestamp.fromMillis(Date.now() + 1000) });
    await col.doc(`${tag}_d`).set({ rule: tag, expiresAt: "not-a-date" });
    await col.doc(`${tag}_e`).set({ rule: tag });
  };

  it("dry run reports but writes nothing; commit converts only valid strings, is resumable and idempotent", async () => {
    await seed();
    const col = db().collection(C.rateLimits);
    // restrict the scan to our documents by starting just before them and bounding the batch
    const after = `${tag}_`.slice(0, -1);
    const dry = await migrateTtlBatch({ collection: C.rateLimits, after, limit: 5 });
    expect(dry.dryRun).toBe(true);
    expect(dry.converted).toBe(0);
    expect(typeof (await col.doc(`${tag}_a`).get()).data()!.expiresAt).toBe("string");

    // page 1 of size 2 (a, b), then resume from its cursor
    const p1 = await migrateTtlBatch({ collection: C.rateLimits, after, limit: 2, commit: true });
    expect(p1).toMatchObject({ scanned: 2, stringToConvert: 2, converted: 2 });
    expect(p1.nextCursor).toBe(`${tag}_b`);
    const p2 = await migrateTtlBatch({ collection: C.rateLimits, after: p1.nextCursor, limit: 3, commit: true });
    expect(p2).toMatchObject({ scanned: 3, alreadyTimestamp: 1, converted: 0, missing: 1 });
    expect(p2.unparsable.map((u) => u.id)).toEqual([`${tag}_d`]);

    for (const id of ["a", "b", "c"]) expect((await col.doc(`${tag}_${id}`).get()).data()!.expiresAt).toBeInstanceOf(Timestamp);
    // unparsable and missing values are left exactly as they were - never deleted or invented
    expect((await col.doc(`${tag}_d`).get()).data()!.expiresAt).toBe("not-a-date");
    expect((await col.doc(`${tag}_e`).get()).data()!.expiresAt).toBeUndefined();

    // idempotent
    const again = await migrateTtlBatch({ collection: C.rateLimits, after, limit: 5, commit: true });
    expect(again.converted).toBe(0);
  });

  it("a document modified after it was read is skipped, not overwritten", async () => {
    const ref = db().collection(C.idempotency).doc(`${tag}_race`);
    await ref.set({ expiresAt: new Date(Date.now() + 5000).toISOString() });
    const snap = await ref.get();
    await ref.update({ touched: true }); // changes updateTime after our read
    await expect(ref.update({ expiresAt: Timestamp.fromMillis(1) }, { lastUpdateTime: snap.updateTime })).rejects.toThrow();
    expect(typeof (await ref.get()).data()!.expiresAt).toBe("string");
  });
});

describe("migration target safeguards", () => {
  it("allows only the local emulator by default", () => {
    expect(assertTtlTarget([], { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" })).toBe("emulator");
    expect(() => assertTtlTarget([], { FIRESTORE_EMULATOR_HOST: "10.0.0.5:8080" })).toThrow(/not a local address/);
  });
  it("refuses a real project without project id, --allow-cloud and the owner's confirmation variable", () => {
    const env = { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "raj-raani-prod" };
    expect(() => assertTtlTarget([], env)).toThrow(/--project-id/);
    expect(() => assertTtlTarget(["--project-id=wrong"], env)).toThrow(/--project-id/);
    expect(() => assertTtlTarget(["--project-id=raj-raani-prod"], env)).toThrow(/--allow-cloud/);
    expect(() => assertTtlTarget(["--project-id=raj-raani-prod", "--allow-cloud"], env)).toThrow(/CONFIRM_TTL_MIGRATION/);
    expect(assertTtlTarget(["--project-id=raj-raani-prod", "--allow-cloud"], { ...env, CONFIRM_TTL_MIGRATION: "raj-raani-prod" })).toBe("cloud");
  });
});
