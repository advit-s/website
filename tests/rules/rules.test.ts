import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc, addDoc, query, where } from "firebase/firestore";
import { ref, uploadString, getBytes } from "firebase/storage";

/**
 * Security-rules tests (run with: npm run test:rules, which starts the emulators).
 * They prove the corrected rules in docs/DECISIONS.md D-07..D-11 - in particular that the browser can never write
 * orders, roles, stock, logs or payments, and that draft catalog data is unreachable from clients.
 */
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-rajraani",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "orders/o_alice"), { userId: "alice", total: 100, items: [] });
    await setDoc(doc(db, "orders/o_bob"), { userId: "bob", total: 200 });
    await setDoc(doc(db, "orders/o_guest"), { userId: null, total: 300 });
    await setDoc(doc(db, "orders/o_alice/timeline/t1"), { customerVisible: true, label: "public" });
    await setDoc(doc(db, "orders/o_alice/timeline/t2"), { customerVisible: false, label: "internal" });
    await setDoc(doc(db, "users/alice"), { fullName: "Alice", email: "a@x.test" });
    await setDoc(doc(db, "users/alice/addresses/a1"), { line1: "x" });
    await setDoc(doc(db, "users/alice/cart/c1"), { quantity: 1 });
    await setDoc(doc(db, "users/bob"), { fullName: "Bob" });
    await setDoc(doc(db, "users/bob/addresses/b1"), { line1: "secret" });
    await setDoc(doc(db, "products/draft1"), { status: "draft", name: "secret draft" });
    await setDoc(doc(db, "products/pub1"), { status: "published", name: "x" });
    await setDoc(doc(db, "productVariants/v1"), { stock: 3, reserved: 1 });
    await setDoc(doc(db, "categories/cat1"), { isActive: false });
    await setDoc(doc(db, "stockLogs/l1"), { delta: 1 });
    await setDoc(doc(db, "assistantLogs/a1"), { messages: ["hi"] });
    await setDoc(doc(db, "settings/private"), { secret: true });
    await setDoc(doc(db, "coupons/X"), { value: 1 });
    await setDoc(doc(db, "idempotencyKeys/k"), { orderId: "o" });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const alice = () => env.authenticatedContext("alice").firestore();
const admin = () => env.authenticatedContext("root", { admin: true }).firestore();

describe("orders", () => {
  it("anonymous users cannot read or create orders (the PDF's `create: if true` is gone)", async () => {
    await assertFails(getDoc(doc(anon(), "orders/o_alice")));
    await assertFails(setDoc(doc(anon(), "orders/forged"), { userId: null, total: 1, paymentStatus: "paid" }));
    await assertFails(addDoc(collection(anon(), "orders"), { total: 1 }));
  });
  it("a customer reads only their own orders and can never write any", async () => {
    await assertSucceeds(getDoc(doc(alice(), "orders/o_alice")));
    await assertFails(getDoc(doc(alice(), "orders/o_bob")));
    await assertFails(getDoc(doc(alice(), "orders/o_guest")));
    await assertFails(setDoc(doc(alice(), "orders/forged"), { userId: "alice", total: 1 }));
    await assertFails(updateDoc(doc(alice(), "orders/o_alice"), { paymentStatus: "paid" }));
    await assertFails(deleteDoc(doc(alice(), "orders/o_alice")));
  });
  it("list queries cannot widen access beyond the owner's rows", async () => {
    await assertFails(getDocs(collection(alice(), "orders")));
    await assertSucceeds(getDocs(query(collection(alice(), "orders"), where("userId", "==", "alice"))));
  });
  it("customers see only customer-visible timeline events of their own orders", async () => {
    await assertSucceeds(getDoc(doc(alice(), "orders/o_alice/timeline/t1")));
    await assertFails(getDoc(doc(alice(), "orders/o_alice/timeline/t2")));
    await assertFails(getDoc(doc(env.authenticatedContext("bob").firestore(), "orders/o_alice/timeline/t1")));
  });
  it("even admins cannot write orders from the client (writes are server-only)", async () => {
    await assertSucceeds(getDoc(doc(admin(), "orders/o_bob")));
    await assertFails(updateDoc(doc(admin(), "orders/o_bob"), { status: "delivered" }));
  });
});

describe("users and subcollections", () => {
  it("owner reads own profile and subcollections; others cannot", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice")));
    await assertSucceeds(getDoc(doc(alice(), "users/alice/addresses/a1")));
    await assertFails(getDoc(doc(alice(), "users/bob")));
    await assertFails(getDoc(doc(alice(), "users/bob/addresses/b1")));
    await assertFails(getDoc(doc(anon(), "users/alice")));
  });
  it("clients cannot create profiles, set roles/admin, or edit anything (profile writes are server-owned)", async () => {
    await assertFails(setDoc(doc(alice(), "users/alice"), { fullName: "A", role: "admin" }));
    await assertFails(updateDoc(doc(alice(), "users/alice"), { role: "admin" }));
    await assertFails(setDoc(doc(env.authenticatedContext("new").firestore(), "users/new"), { fullName: "x" }));
    await assertFails(setDoc(doc(alice(), "users/alice/addresses/a2"), { line1: "y" }));
    await assertFails(setDoc(doc(alice(), "users/alice/cart/c2"), { quantity: 999 }));
    await assertFails(setDoc(doc(alice(), "users/alice/anything/x"), { a: 1 }));
  });
  it("a spoofed `admin` field on a user document grants nothing; only the token claim does", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), "users/mallory"), { role: "admin", admin: true }));
    await assertFails(getDoc(doc(env.authenticatedContext("mallory").firestore(), "orders/o_bob")));
    await assertFails(getDoc(doc(env.authenticatedContext("mallory").firestore(), "stockLogs/l1")));
  });
});

describe("catalog is not directly readable (drafts and operational stock fields stay private)", () => {
  it("anonymous and customer clients cannot read products, variants or categories", async () => {
    for (const path of ["products/draft1", "products/pub1", "productVariants/v1", "categories/cat1"]) {
      await assertFails(getDoc(doc(anon(), path)));
      await assertFails(getDoc(doc(alice(), path)));
    }
    await assertFails(getDocs(collection(anon(), "products")));
  });
  it("no client, including admin, can write catalog documents directly", async () => {
    await assertFails(setDoc(doc(admin(), "products/new"), { name: "x" }));
    await assertFails(updateDoc(doc(admin(), "productVariants/v1"), { stock: 9999 }));
    await assertFails(setDoc(doc(alice(), "productVariants/v1"), { stock: 9999 }));
  });
});

describe("audit, logs and operational collections", () => {
  it("only admins read stockLogs / assistantLogs; nobody writes from a client", async () => {
    await assertSucceeds(getDoc(doc(admin(), "stockLogs/l1")));
    await assertSucceeds(getDoc(doc(admin(), "assistantLogs/a1")));
    await assertFails(getDoc(doc(alice(), "stockLogs/l1")));
    await assertFails(getDoc(doc(anon(), "assistantLogs/a1")));
    await assertFails(setDoc(doc(anon(), "assistantLogs/forged"), { messages: ["x"] })); // PDF allowed this
    await assertFails(setDoc(doc(admin(), "stockLogs/forged"), { delta: 1 }));
    await assertFails(deleteDoc(doc(admin(), "stockLogs/l1")));
  });
  it("settings, coupons, idempotency keys, reservations and webhook receipts are server-only", async () => {
    for (const path of ["settings/private", "settings/public", "coupons/X", "idempotencyKeys/k", "stockReservations/r", "webhookReceipts/w", "notificationOutbox/n", "uniqueKeys/u", "counters/orders", "rateLimits/r"]) {
      await assertFails(getDoc(doc(alice(), path)));
      await assertFails(getDoc(doc(admin(), path)));
      await assertFails(setDoc(doc(admin(), path), { x: 1 }));
    }
  });
  it("unknown collections are denied by default", async () => {
    await assertFails(setDoc(doc(admin(), "whatever/x"), { a: 1 }));
    await assertFails(getDoc(doc(admin(), "whatever/x")));
  });
});

describe("storage", () => {
  const s = (ctx: ReturnType<RulesTestEnvironment["unauthenticatedContext"]>) => ctx.storage();
  it("public can read published media but cannot write anywhere", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadString(ref(ctx.storage(), "products/published/a.jpg"), "x", "raw", { contentType: "image/jpeg" });
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadString(ref(ctx.storage(), "products/draft/a.jpg"), "x", "raw", { contentType: "image/jpeg" });
    });
    await assertSucceeds(getBytes(ref(s(env.unauthenticatedContext()), "products/published/a.jpg")));
    await assertFails(getBytes(ref(s(env.unauthenticatedContext()), "products/draft/a.jpg")));
    await assertFails(uploadString(ref(s(env.unauthenticatedContext()), "products/published/evil.jpg"), "x", "raw", { contentType: "image/jpeg" }));
  });
  it("not even an admin token can upload or read drafts from the client (uploads are validated server-side)", async () => {
    const adminCtx = env.authenticatedContext("root", { admin: true });
    await assertFails(uploadString(ref(adminCtx.storage(), "products/published/x.jpg"), "x", "raw", { contentType: "image/jpeg" }));
    await assertFails(uploadString(ref(adminCtx.storage(), "products/published/x.exe"), "MZ", "raw", { contentType: "application/x-msdownload" }));
    await assertFails(getBytes(ref(adminCtx.storage(), "products/draft/a.jpg")));
  });
  it("unknown paths are denied", async () => {
    await assertFails(getBytes(ref(s(env.unauthenticatedContext()), "private/secret.txt")));
  });
});
