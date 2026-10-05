# Test report

## Recovery and staging-readiness milestone - 2026-10-05

Run by Claude Code on Windows 11, Node 24, Java 25, Firebase emulators (Auth, Firestore, Storage) and **simulated providers only**. No cloud project, real payment, courier, messaging or model call was made, and no production key or customer data was used. These are newly run results (not copied from the author-reported or independent reviews below). A clean `npm ci` was run first.

| Command | Result |
|---|---|
| `npm ci` | succeeded (lockfile regenerated with the dependency overrides in D-37) |
| `npm run check` (typecheck + ESLint + unit) | typecheck clean, ESLint 0 problems, **56 unit tests passed** (48 before; +8 for `src/domain/refunds.ts`) |
| `npm run test:rules` | **16 passed** |
| `npm run test:int` (Auth + Firestore emulators) | **121 passed in 9 files**: checkout 24, admin 26, assistants 8, payment-regressions 6 (existing 64) + **refund-recovery 18, payment-exceptions 9, messaging 11, ttl 6, provider-races 13 (new 57)** |
| `npm run build` | succeeded after the dependency overrides |
| `npx playwright test` (seeded stack via `npm run dev:local`, 76 specs incl. purchase, auth, auth-flows, access, admin, assistant, responsive 320-1440 px, axe, keyboard, security headers) | **76 passed** (10.0 min). A first attempt in this session produced spurious failures because log files written inside the project folder made the Next dev server recompile continuously; it was discarded and re-run with logs outside the project. |
| `npm audit --omit=dev` | **0 vulnerabilities** (was 9: 5 high, 4 moderate), through scoped `overrides`, see D-37 and below |
| `npm audit` (including dev tooling) | 16 findings (11 high, 5 moderate), all in development tooling: `firebase-tools` (pubsub/opentelemetry/proxy-agent/basic-ftp), `vitest`/`@vitest/mocker`, `eslint-config-next` (fast-glob/micromatch/braces), `re2`. Not shipped to production; not addressed (their fixes are major upgrades or are not available). Revisit before relying on a shared CI runner. |

### What the new tests demonstrate
- **Refund dispatch and recovery** (`refund-recovery.test.ts`): the dispatch record and lock exist before the provider is called; three concurrent dispatches produce exactly one provider refund; provider acceptance followed by a timeout leaves the refund locked and un-resendable (even with everything aged 30 days), and reconciliation by receipt completes it once with a single money movement; a crash after acceptance is recovered by the scheduled job; the job does not race a just-started dispatch; nothing found at the provider keeps the refund locked until a system search plus a written provider check makes it retry-safe with a new receipt; a definitive rejection is retry-safe; unproven failures are not retryable; unrelated same-amount refunds are never adopted, duplicate-receipt and wrong-amount matches are ambiguous/mismatch; an unreachable provider changes nothing; early webhooks without a receipt are kept as evidence and replayed after correlation; with our receipt they correlate immediately; duplicate webhooks change totals once; a stale `failed` after `completed` is ignored; wrong payment/amount events are not applied and flag the order; unknown-payment events are retained; a refund surfacing for a superseded attempt is flagged, not merged; the refund cap is re-checked on retry.
- **Payment exceptions** (`payment-exceptions.test.ts`): repeated capture delivery keeps one exception, one stock allocation and the processing state; confirm/process/ship are blocked (and no courier booking is attempted); an already-shipped order keeps its history and is flagged for courier review while delivery can still be recorded; `clear_review` cannot bypass an exception or uncertain refund; refund of the extra payment is verified against the provider (mismatches refused), flows through the protected/recoverable refund path, leaves the COD order's own totals untouched and unblocks fulfilment when complete; "already refunded elsewhere" is accepted only with provider proof; a second capture on a paid order opens a `duplicate_capture` exception (previously ignored).
- **Messaging** (`messaging.test.ts`): local builds store `previewed` (never `delivered`, no provider id, no stored secure link); live mode without a channel -> `unavailable` and nothing sent, re-queued and delivered once a (mocked) channel is configured; mocked-vendor contract: idempotency key, delivery receipt only after acceptance, retry/permanent-failure handling, secure link minted only at delivery; the endpoint answers `preview_only` / `queued` / 503 and never `sent: true`.
- **TTL** (`ttl.test.ts`): persisted `rateLimits.expiresAt` and `idempotencyKeys.expiresAt` are Firestore Timestamps (read back from the documents), other timestamps remain ISO strings; the migration is dry-run-first, bounded, resumable, idempotent, leaves unparsable/missing values alone and uses `lastUpdateTime` preconditions; the target guard refuses anything but the emulator without project id + `--allow-cloud` + `CONFIRM_TTL_MIGRATION`.
- **Provider races** (`provider-races.test.ts`): a hold that expires while a provider order is being created is rejected with the provider id retained on the order; an obsolete attempt's failure does not fail the current attempt; a provider order accepted before the process died is not half-recorded and the retry reuses the same receipt; concurrent new attempts converge on one live attempt; Shiprocket: AWB-step failure resumes without a second create, a completed booking is not repeated, unknown create outcome locks booking (attach verified by order number, or ship manually), definitive rejection clears the lock, concurrent clicks produce one booking; the live adapter (HTTP stubbed) refuses without owner parcel dimensions, sends them, and treats a create timeout as unknown.

### Visual check
Admin order pages were rendered against emulator data for (a) a COD order with a late online capture (payment-exception panel, blocked actions, review banner that explains why it cannot be cleared) and (b) a refund with an unknown outcome (locked refund, reconcile button, dispatch/receipt line). Checked by screenshot at 1440 px; no automated browser test covers these panels yet.

### Not verified / blocked (needs real services or the owner)
1. **Razorpay behaviour the recovery design relies on**: receipt-as-idempotency for refunds (duplicate receipt rejected), `GET /payments/:id/refunds` completeness and pagination, whether `refund.*` webhooks echo `receipt`, `refund.processed/failed` ordering. Taken from Razorpay's public API reference and **untested against Test Mode**. Rehearse in Test Mode: success, failure, duplicate receipt, delayed webhook, dashboard-created refund.
2. **Shiprocket**: create/assign behaviour on repeat, and `GET /orders/show/{id}` (used by Attach booking) are unverified; needs a sandbox account. Serviceability lookups are not implemented.
3. **Messaging vendor**: none chosen, so no real adapter exists (interface, safe failure and contract tests only).
4. **Firestore TTL policies, indexes** (the new `notificationOutbox status+createdAt` index is declared), scheduled jobs (`refunds` every ~5 minutes) and the TTL migration against real data: not run (no cloud project).
5. Firebase phone OTP over real SMS, backups/restore, Lighthouse/mobile performance, nonce-based CSP: unchanged from the earlier reports.
6. Dev-tooling advisories listed above.

---

## Independent readiness review — 2026-10-05

The original Windows results below are author-reported and kept for provenance. A separate Linux review at base commit `3b3ba26` added four security tests and six payment regression tests, and applied the fixes described in READINESS_REVIEW.md. This review used Node 24.19.0, Java 21.0.6, Firebase emulators and simulated providers only.

| Command/check | Independent result |
|---|---|
| Fresh `npm ci --ignore-scripts` | Initially failed on missing lockfile entries; succeeded after lockfile regeneration in the initial review run |
| `npm run check` | TypeScript and ESLint passed; 48 unit tests passed |
| `npx vitest run --project integration` inside Auth/Firestore/Storage emulators | 64 passed: checkout 24, admin 26, assistants 8, new payment regressions 6 |
| `npx vitest run --project rules` inside emulators | 16 passed |
| `npm run seed` | Succeeded against demo emulators |
| `npm run build` with `.env.local` demo configuration and emulators running | Succeeded; no production provider verification implied |
| Playwright purchase/auth/access rerun | Not run: Chromium and Headless Shell downloads both failed with invalid/truncated ZIP errors; no system browser available |
| `npm audit --omit=dev` | 9 package findings: 5 high, 4 moderate; unresolved |
| `git diff --check` | Passed |

The initial failing regression runs reproduced the defects; the patched suites passed independently again when work resumed. No cloud service, real payment, courier, messaging or model call was exercised. Refund recovery and payment-exception resolution remain explicit release blockers; see NEXT_STEP_CLAUDE_PROMPT.md.

## Original implementation report — 2026-10-04

Date: 2026-10-04. Environment: Windows 11, Node 24, Java 25, Firebase emulators (Auth, Firestore, Storage), Next dev server, Chromium via Playwright.
Everything below ran against **emulators and simulated providers only**. No cloud project, live payment, live courier or live AI call was made.

## Commands and outcomes
| Command | Result |
|---|---|
| `npm run typecheck` (strict + noUncheckedIndexedAccess) | clean |
| `npm run lint` (ESLint incl. server-only Admin SDK boundary rule) | 0 errors, 0 warnings |
| `npm run test:unit` | 44 passed (domain money/pricing/coupons/pincode/order-state/catalog/validation: 26; WCAG contrast of every token pair: 18) |
| `npm run test:rules` (Firestore + Storage rules on emulator) | 16 passed |
| `npm run test:int` (services on emulator via `emulators:exec`) | 58 passed: checkout/stock/payments/webhooks 24, admin 26, assistants 8 |
| `npm run build` | succeeds |
| `npx playwright test` (full e2e, 76 tests, 1 worker) | 75 passed, 1 timed out on the first run (`public pages at 320px`: 60 s limit hit while the dev server compiled routes). Timeout raised to 180 s for that group; re-run of the 5 responsive tests: 5 passed. No assertion failures. |

E2E specs: auth, auth-flows, access, purchase, admin, assistant, quality (responsive at 320/390/768/1440 px with no horizontal overflow and no console errors; axe accessibility; keyboard; security headers).

## What the tests prove
- Money in integer paise; server recomputes all prices, shipping, coupons; client-supplied amounts ignored (tampered-request test).
- Stock reservation/commit/release is transactional; no overselling under concurrent checkout; expiry job releases holds; late payment after expiry revives or goes to needs-review with refund request.
- Payment application and webhooks are idempotent (duplicate/replayed events); bad signatures rejected; Shiprocket state moves forward only.
- Guest orders readable only with the order-scoped token; customers cannot read other customers' orders; admin routes require the `admin` claim; destructive actions require recent re-authentication.
- Rules: all client writes denied; owner-scoped reads only.
- Admin: version-checked inventory edits (stale edits rejected), CSV/XLSX import dry-run/commit, formula-injection neutralised on export, unique slug/SKU, immutable order snapshots.
- Assistants: customer assistant has no tools, strips URLs, redacts personal data, rate-limited with a daily cap; admin assistant is read-only with bounded tools. Both are labelled as simulated locally.

## Visual checks
Pages were screenshotted at desktop and mobile widths and compared with the supplied reference images for layout and mood (not copied). Public pages were reviewed throughout; admin order detail and the product editor were checked at 390 px for overflow by the automated test, not by exhaustive manual review.

## Needs real services (not verified)
1. **Razorpay**: live/test-mode order creation, checkout popup, signature verification against real payloads, webhook delivery, refunds. Signing and verification logic is tested against locally generated signatures only.
2. **Shiprocket**: authentication, serviceability lookup, shipment booking, AWB/label, tracking webhooks. The adapter has never run against a real account; manual AWB entry works.
3. **Anthropic**: real model responses, guardrail behaviour with a real model, cost/limit behaviour. Local responders are used.
4. **Messaging** (WhatsApp/SMS/email): no vendor chosen; messages are recorded as previews in the outbox.
5. **Phone OTP in production**: works with the Auth emulator; real SMS, India region allow-list, reCAPTCHA/App Check are unverified.
6. **Firestore indexes and TTL policies** are declared but the emulator does not enforce them; deploy and wait for build before traffic.
7. **Backup/restore** has not been rehearsed (no cloud project).
8. **Performance**: Lighthouse and real-device testing were not run; the production build was not load-tested.
9. **Legal text** is a draft pending owner details and professional review.

## Dependency audit (`npm audit --omit=dev`)
9 findings (4 moderate, 5 high), all transitive: `@grpc/grpc-js`, `postcss` (via `next`), `uuid` (via `exceljs`/`gaxios`). The suggested fixes are breaking or downgrade `next`/`exceljs`, so none were applied. The app does not feed untrusted CSS to postcss at runtime or call uuid with a user-supplied buffer; review again before launch and update `next` to the newest 15.5.x patch release that resolves the advisory.

## Known limitations
- Search/filter runs in code over a bounded projection (D-26); beyond ~1,000 published products an external search service is needed.
- CSP allows inline scripts (D-22); a nonce-based CSP is recommended before launch.
- GST tax breakup on invoices is not built (rates not supplied); invoices are titled "Order invoice" until a GSTIN is configured.
- No reviews system, newsletter or analytics (deferred by the sitemap / no consent flow).
