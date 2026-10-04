# Test report

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
