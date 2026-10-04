# Decision records

Format: **Conflict / gap → Decision → Reason**. Dates are 2026-10-04 unless stated. "Verified" means checked against current official
documentation on that date.

## D-01 Next.js version (PDF 4 says "Next.js 14")
**Decision:** Next.js **15.5.x** (`15.5.27`, npm tag `backport`), React 19, Node ≥ 22 (`engines`), TypeScript 5.9, Tailwind CSS 4.
**Reason:** `latest` on npm is 16.3.8 (verified), but Firebase App Hosting's "Supported frameworks" page (verified) lists Next.js 13.5–15.x
and does not list 16, so 16 is not provably compatible with the intended deployment target. 14.x LTS ends 2026-10-09 (days away). 15.x is
listed with LTS to 2027-10-09. 15.5 has stable Node.js-runtime middleware, which Admin SDK session checks need. No preview/canary releases.
**Upgrade path:** move to 16 (rename `middleware.ts` → `proxy.ts`, which is Node-runtime by default) once App Hosting documents support.

## D-02 Route counts (SM says 32 = 17+4+8; MP says 35 = 19+4+12)
**Decision:** Use the 35 patterns in [ROUTES.md](ROUTES.md). **Reason:** 17+4+8 = 29, not 32; the SM body also needs `/wishlist`, `/cart`, and
the account sub-routes. MP §4 explicitly overrides. Entry 26 is two paths sharing one editor; entry 35 is a flow.

## D-03 Order status vocabulary (DB: New→Confirmed→Processing→Shipped→Delivered, Cancelled; UI/UF say "Pending")
**Decision:** Canonical fulfilment status: `new → confirmed → processing → shipped → out_for_delivery → delivered`, plus `cancelled`; returns are a
separate workflow object (`returnStatus`). Payment status is a separate field: `pending | paid | failed | partially_refunded | refunded`
(plus `cod_pending` expressed as method=`cod`, status=`pending`). The admin "Pending" tab maps to *orders awaiting action*:
`status=new` or `paymentStatus=pending` (explicit mapping in `src/domain/orders/labels.ts`). **Reason:** MP §5; avoids conflating payment, fulfilment and return.

## D-04 Money (DB samples use rupees such as `42999`)
**Decision:** All persisted and computed money is **integer paise**; formatting to ₹ happens only at display. Seed data converts the PDF's
rupee examples ×100. **Reason:** MP §5; eliminates float error.

## D-05 Fonts (reference mockup lists Lora for body; MP specifies Inter)
**Decision:** Playfair Display (headings), Montserrat (nav/buttons), Inter (body/admin). **Reason:** MP §3 is explicit and states a design skill must not substitute.

## D-06 Palette annotations inside reference images
The palette/typography/sitemap panels in the reference PNGs are annotations, not site sections (user instruction). Hex values match MP §3 exactly.

## D-07 Firestore rule: `orders allow create: if true` (SL §02)
**Decision:** `orders` — owner/admin **read** only, **all client writes denied**. Orders are created by the server (Admin SDK) after Zod
validation, price/stock recomputation and idempotency. **Reason:** the original lets anyone write arbitrary orders/payment state.

## D-08 Firestore rule: `assistantLogs allow create: if true`
**Decision:** Denied to clients. Transcripts are persisted by `/api/assistant` after rate limiting and size limits; read admin-only.

## D-09 `users/{uid}` write rule vs server-created profile (BA §02 vs SL §02)
**Decision:** Profile creation is server-only. Clients may *read* their own profile and *update only* `fullName` and `phone`-display
allowlisted fields; `role`, `email`-of-record, `createdAt`, `admin` are immutable from the client. Subcollections have **explicit** rules (SL's `{sub=**}` wildcard
would have let clients write anything under their user, and rules do not inherit the parent match). Cart persistence goes through server
endpoints (stock-capped); addresses/wishlist writes validated by field allowlist rules.

## D-10 Catalog public-read vs drafts (SL: `products read: if true`)
**Decision:** Clients never read `products`/`productVariants`/`categories` directly. Public pages use Server Components that query via Admin
SDK and return **DTOs** (published/active only, no private fields). Rules for those collections: `read` only for admins, no client writes.
**Reason:** Firestore returns whole documents and draft rows would leak; sellable-stock fields (reservations) are operational data.

## D-11 Storage rules and uploads (SL §03)
**Decision:** Storage client writes denied; admin uploads go through `/api/admin/uploads`, which validates magic bytes, decodes and re-encodes with
sharp (type, dimensions, size caps), and writes to controlled paths via Admin SDK. Public read limited to `products/published/**` and
`categories/**`; drafts under `products/draft/**` are private (signed URLs for admin preview). Deletes are admin-server-side.

## D-12 App Check and phone-auth reCAPTCHA (BA §03, §08)
**Decision:** Phone auth keeps Firebase's reCAPTCHA verifier (App Check does not replace it for web phone auth — to be re-verified at
live setup). App Check is documented as an optional abuse-reduction layer, not authorization. Authorization is always server-side.

## D-13 Shiprocket webhook "verified the same way" as Razorpay (BA §09)
**Decision:** Not equivalent. Razorpay: HMAC-SHA256 over the raw body in `X-Razorpay-Signature` (verified). Shiprocket (verified via public
docs/integration guides): a configurable **security token sent as `x-api-key`**, not a body HMAC. Implementation: constant-time compare of
`x-api-key` to `SHIPROCKET_WEBHOOK_TOKEN`; status updates only move forward along the state machine; ambiguous events trigger authenticated
tracking reconciliation (live mode) rather than trusting payload alone.

## D-14 Excel import "one atomic batched write" (BA §08)
**Decision:** Firestore allows ≤500 writes per batch/transaction, so each variant update + its stockLog entry (2 writes) bounds an atomic import
to ≈ 200 rows. Imports are `expectedVersion`-checked per row inside transactions; the UI reports exact per-row results. Larger files: explicit
chunks with accurate partial-progress reporting. Hard cap 1,000 rows/upload. Audit log alone does not prevent stale overwrites (version check does).

## D-15 Session lifetimes and re-auth (SL §04)
**Decision:** Customer cookie 14 days; admin cookie 24 h (inside the 24–72 h spec). Session minted only from an ID token ≤ 5 minutes old.
Destructive admin actions (refunds, bulk import, deletions) require an ID token ≤ 5 minutes old (recent sign-in re-check).

## D-16 Stock accounting beyond DB's single `stock` number
**Decision:** Variants carry `stock` (on-hand), `reserved`, derived `available = stock - reserved`, and a transactionally maintained `isLowStock`
(`available <= lowStockThreshold`) so Firestore Standard can query it (no field-vs-field query). Reservations are separate documents with expiry.

## D-17 Additions to the source schema
`settings/public`, `settings/private`, `coupons`, `couponRedemptions`, `stockReservations`, `idempotencyKeys`, `webhookReceipts`,
`contactEnquiries`, `customEnquiries`, `orders/{id}/timeline`, `auditLogs`, `notificationOutbox`, `rateLimits` (dev only), `orderAccess`
(hashed guest tokens). Each exists because a listed feature (checkout reservations, webhooks, custom orders, notifications) cannot be correct without it.

## D-18 Reference-image elements deliberately not copied
Mockup homepage shows a named customer testimonial, a social photo feed, "Continue with Google/Apple", and a newsletter. Testimonials would be
fabricated (MP §3, §4.1) → omitted. Google/Apple sign-in is outside the specified providers (email/password + phone OTP) → omitted.
Instagram feed has no licensed imagery → omitted (social links only). Newsletter signup needs separate marketing consent and a vendor → deferred.

## D-19 Imagery
No licensed product photography exists in the folder. The reference PNGs are design mockups, not licensed assets. Storefront uses clearly-labelled
generated placeholder art (SVG compositions in brand colours) until the owner supplies photos; see [ASSETS.md](ASSETS.md).

## D-20 Package manager / test stack
npm + `package-lock.json`. Vitest 3 (unit/integration), `@firebase/rules-unit-testing` (rules), Playwright (E2E). `firebase-tools` as a devDependency so
emulators run with `npx firebase` (Java 21+ required for the Firestore emulator; Java 25 present locally).

## D-21 Runtime for auth checks
Next 15.5 middleware runs with `runtime: 'nodejs'` so the Admin SDK can verify cookies. Middleware only redirects early; every server action,
route handler, and admin layout re-verifies via `requireUser()` / `requireAdmin()`.
