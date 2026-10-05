# Readiness review — 5 October 2026

Reviewed repository: https://github.com/advit-s/website
Base commit: `3b3ba26e7559ef2097fd372196d26eb9f073ebf6`.

## Verdict

The project is a substantial local implementation, but it is not ready to accept real customer payments. Passing the original suite did not cover several payment/refund races. This review adds bounded fixes and regression tests. It does not certify the entire application or verify real providers.

Changes are local on `codex/rajraani-readiness-review`; nothing was pushed, deployed, or purchased. No real customer data or credentials were used.

## Fixed in this patch

| Finding | Result |
|---|---|
| Fresh `npm ci` rejected missing lockfile entries | Regenerated lockfile; fresh install succeeded in the initial review run. Package manifest and requested versions unchanged. |
| Mutation origin validation trusted incoming host/forwarded-host headers and ignored scheme | Only the configured site origin is trusted, including scheme and port. Preview deployments must configure their own site URL. |
| Production could retain a Storage emulator host | All three emulator hosts are now rejected in production. |
| Competing checkouts with different payloads and the same key could reuse another order | Stored payload hash is checked again inside the transaction. |
| Late online capture after a switch to COD deducted stock again and reset fulfilment | Preserve COD/stock/fulfilment; retain capture evidence in `orders/{id}/paymentExceptions`, set review flag and internal timeline. Requires reconciliation before launch. |
| Callback reported paid after amount validation rejected the capture | Return status from persisted payment/review state. |
| Refund already processing but awaiting its provider ID could be sent again | Every processing refund is locked against another dispatch. |
| Transport timeout marked a refund failed and invited unsafe retry | Unknown outcome remains processing, is flagged for review, and returns `REFUND_UNCERTAIN`. Recovery remains a next-milestone requirement. |
| Late failed event could undo a completed refund | Completed refund is terminal; unknown/duplicate events do not mutate totals. |
| Hosting template omitted browser live-mode values and server Razorpay key ID | Explicit live mode, no browser emulators, and server key-ID placeholder added. Real values still required. |

Four security tests and six payment regression tests were added. The initial review reproduced three security failures and all six payment regressions against the base code, then passed them after these changes.

## Independent verification

Linux, Node 24.19.0, temporary Java 21.0.6; Firebase demo project and simulated providers only.

| Check | Outcome |
|---|---|
| TypeScript and ESLint (`npm run check`) | Passed |
| Unit suite | 48 passed |
| Integration suite (Firestore/Auth emulators) | 64 passed |
| Firestore/Storage rules suite | 16 passed |
| Seed | 19 products, 48 variants, 3 accounts, 9 demo orders created in emulators |
| Production build with local demo environment | Passed; this verifies compilation, not production service configuration |
| Browser suite | See final verification note in TEST_REPORT.md; original author results remain separately attributed |
| Production dependency audit | 9 reported package findings: 5 high, 4 moderate; these are not nine distinct exploitable vulnerabilities |

Existing author-reported Windows/browser results are retained in TEST_REPORT.md and are not represented as independent results here.

## Next milestone: recovery and staging readiness

1. **Refund reconciliation.** `fetchRefund` exists in the adapter but has no service caller. A processing refund with no provider ID has no supported recovery operation. Unknown-ID refund webhooks are ignored. Persist dispatch identity, recover outcomes through verified provider evidence, and retain/replay early events. Never unlock an uncertain request merely because time elapsed. Add authenticated admin recovery and audit records.
2. **Payment exceptions and fulfilment.** The new COD exception evidence has no dedicated admin resolution flow. `needsReview` blocks confirmation only; an already-processing order can still ship. Add explicit exception display/resolution and guards for onward fulfilment; account for courier COD collection and extra captured payments. Generic `clear_review` must not erase unresolved money exceptions.
3. **Notification delivery.** Only the preview adapter exists even in live mode. `/api/track-order/link` returns `sent: true` after enqueueing, while no vendor delivers the link. Add a real owner-selected adapter or make unavailable/queued/preview states truthful. Protect secure-link access and redact tokens from logs.
4. **TTL storage type.** `rateLimits.expiresAt` and `idempotencyKeys.expiresAt` are ISO strings, while their policies use Firestore TTL. Standard-edition TTL requires a date/time value: https://firebase.google.com/docs/firestore/ttl. Change only TTL fields to Firestore timestamps, test persisted type, and plan a bounded migration for existing strings. Reservation ISO dates have active string comparisons and must not be blindly converted. TTL deletion is asynchronous and must not enforce business expiry.
5. **Provider retry/race audit.** Payment attempt creation and courier booking call external services before final local state is persisted. Test crashes, retries, expiry during provider calls, obsolete-attempt failures, and partial shipment/AWB success. Reconcile existing external objects before creating replacements. Shiprocket parcel dimensions are currently hardcoded; use owner-supplied parcel information and verify serviceability in staging.
6. **Dependencies.** Audit currently flags Firebase/gRPC, Next/PostCSS, and ExcelJS/gaxios/uuid chains. Suggested forced fixes include downgrades or major upgrades. Resolve with compatible releases/replacements and targeted regression checks; document any residual findings and reachability instead of claiming a clean audit.

After recovery work: configure isolated Firebase staging, Razorpay test keys/webhooks, courier test facilities where available, messaging and Anthropic. Rehearse purchase/cancel/refund/recovery with evidence. Then owner supplies real catalogue photos/logo, legal identity/GST/tax inputs, grievance details, and reviewed policies. Assess nonce CSP, mobile accessibility/performance, indexes, backup/restore, and job scheduling before a separately approved production release.

Use NEXT_STEP_CLAUDE_PROMPT.md to continue the existing project. Do not restart from an empty folder or rebuild the design.

## Update - recovery and staging-readiness milestone (2026-10-05, Claude Code)

Implemented locally on the same branch; nothing deployed or pushed. Results are in TEST_REPORT.md (121 integration, 56 unit, 16 rules, 76 browser tests, clean build, `npm audit --omit=dev` 0). **Still not ready for real customer money**: the provider behaviours below are designed from public documentation and unrehearsed.

| Item | Status | Where |
|---|---|---|
| 1. Uncertain refunds | Durable dispatch record + receipt before the provider call; processing/uncertain refunds stay locked (no timer, no blind resend); verified recovery by id or by receipt+payment+exact amount; ambiguity -> review; early/unknown webhooks kept as evidence and replayed; completed is terminal; recent-admin reconcile / attestation actions with audit; `refunds` job; exact retry rule documented | D-32, `src/server/services/refunds.ts`, `src/domain/refunds.ts`, admin order page |
| 2. Payment-after-COD exceptions | Exceptions shown to admins; confirm/process/ship blocked (before any courier call); already-shipped orders flagged; verified refund or provider-proven "already refunded" resolution; `clear_review` cannot bypass; duplicate captures on paid orders now detected | D-33, `src/server/services/payment-exceptions.ts` |
| 3. Messaging states | previewed / delivered / failed / unavailable are distinct; link minted at delivery and never stored; live mode without a channel fails explicitly; interface + mocked contract tests; **owner must choose the vendor** | D-34, `src/server/providers/messaging.ts` |
| 4. TTL fields | Timestamps for the two TTL fields (verified on persisted docs); other dates unchanged; bounded resumable dry-run-first migration with three-way cloud safeguard | D-35, `scripts/migrate-ttl.ts` |
| 5. Provider races / courier / dependencies | Expiry during order creation, obsolete-attempt failure and orphan provider orders handled and tested; Shiprocket booking is a persisted state machine with resume/attach and owner-supplied parcel size (no hardcoded dimensions); production audit 0 via scoped overrides (no force, no downgrade) | D-36, D-37, `src/server/services/shipment-booking.ts` |

Residual risks and next actions: rehearse refunds/webhooks in Razorpay Test Mode and bookings in a Shiprocket sandbox (items in TEST_REPORT "Not verified"); owner chooses the messaging vendor, parcel size, and the policy for paid-online-and-COD cases (OWNER_SETUP); deploy indexes before traffic; run the TTL migration only if there is pre-existing cloud data and only with authorisation; add automated browser coverage for the new admin recovery panels; the 16 dev-tooling advisories remain.
