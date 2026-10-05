# Paste this into Claude Code in the existing website folder

Continue the existing Raj Raani Collections project. Work in this repository, preserve its architecture and maroon/ivory design, and implement the next milestone: payment recovery and staging readiness. Do not regenerate the website or replace the stack.

First read CLAUDE.md, docs/DECISIONS.md, docs/READINESS_REVIEW.md, docs/PROGRESS.md, docs/TEST_REPORT.md, docs/OWNER_SETUP.md and docs/DEPLOYMENT.md. Inspect git status and recent commits. If the readiness fixes are not present, apply the provided `readiness-fixes.patch` using `git apply --check` followed by `git apply`. Stop on conflicts and resolve deliberately; never discard existing work. The patch is based on commit 3b3ba26. Read tests/unit/http-security.test.ts and tests/integration/payment-regressions.test.ts.

Implement the following in order, using failing regression tests for the money/state bugs and updating progress after each coherent change.

## 1. Recover uncertain refunds safely

- Trace executeRefund, applyRefundEvent, jobs, the payment adapter and the admin order UI. Persist a durable dispatch record before making the provider call, including order/payment/refund identity and stable request identity. Do not assume a Razorpay receipt is a provider-enforced idempotency key; consult current official API documentation.
- Keep processing refunds locked, including those with no provider ID. A timeout, dropped connection or process crash cannot prove that money did not move. Do not add an automatic timed unlock or blindly send again.
- Support verified reconciliation for known IDs and unknown-ID outcomes using available provider retrieval/listing capabilities and stable identity. If matching is ambiguous, retain needs-review and require a documented provider check. Never rely on amount alone or trust a browser-supplied refund status.
- Retain authenticated early/unknown refund webhooks as unresolved evidence and replay them after correlation. Make completed states terminal and handle duplicate/out-of-order events.
- Add a protected, recent-admin recovery action with audit trail and an understandable admin UI. Preserve caps on refunds, stock accounting and privacy. Define exactly when a failed refund is safe to retry.
- Test concurrent dispatch, provider acceptance followed by timeout, crash after acceptance, early webhook, duplicate webhook, stale failed event, wrong payment/amount correlation, ambiguous matching and successful recovery. Demonstrate one money movement under concurrent retry/recovery.

## 2. Resolve payment-after-COD exceptions

- Read the paymentExceptions subcollection written by applyPaymentCaptured. Display unresolved captures and their verified amounts/IDs to admins through server DTOs.
- Guard new confirmation, processing and shipment operations when an unresolved payment exception remains. Keep existing fulfilled order history intact; flag already-shipped orders for courier/payment review.
- Provide an audited resolution flow appropriate to whether COD was already collected or a courier shipment was created. Do not silently reset fulfilment, allocate stock again, or create an automatic extra refund. Use verified provider evidence for money-changing decisions.
- Ensure generic clear_review cannot bypass an unresolved payment exception or uncertain refund.
- Test repeated capture delivery, one stock allocation, preserved processing/shipped state, guarded shipping and authorised reconciliation.

## 3. Make messaging states truthful

- Inspect the outbox worker, tracking-link API and customer/admin copy. Enqueued, previewed, delivered and failed are different states; `sent: true` cannot imply delivery when only a preview exists.
- Preserve a clearly labelled local preview. In live mode fail explicitly when delivery is unconfigured, or report a truthful queued/unavailable result without exposing private links.
- Add an adapter for the owner-selected vendor only when that choice is known. If missing, finish the interface, safe failure behaviour and mocked contract tests, then document the single owner decision needed. Never invent credentials or deliver real messages during tests.

## 4. Correct TTL fields

- Store rateLimits.expiresAt and idempotencyKeys.expiresAt as Firestore date/time values, verified by reading persisted documents. Update the ISO-date convention with this exception.
- Leave reservation expiry comparisons functioning; do not convert every timestamp globally.
- Add a bounded, resumable, dry-run-first migration for existing TTL strings with explicit target safeguards. Do not run it against cloud data without authorisation. TTL is delayed cleanup, not access control or exact business expiry.

## 5. Prepare external-service staging gates

- Test reservation expiry during payment-order creation, obsolete payment-attempt failure, and provider acceptance before local persistence. Reject stale mutations and avoid orphan/duplicate requests through durable identity and reconciliation.
- Trace Shiprocket partial booking/AWB failure and retry. Persist and recover existing provider IDs; do not rebook blindly. Remove hardcoded parcel assumptions only with validated settings/owner inputs.
- Re-run npm audit --omit=dev. Resolve compatible dependency findings with a reviewed upgrade/replacement plan. Do not use npm audit fix --force or silently downgrade the framework/Firebase. Verify affected exports, imports, Firebase, build and browser flows.

Run npm ci, npm run check, npm run test:int, npm run test:rules, seeded purchase/auth/access/admin Playwright tests and npm run build. Document actual outcomes and blocked checks separately; do not turn existing author-reported results into newly verified results. Start/stop emulator processes cleanly. No test should use production keys or customer data.

Update READINESS_REVIEW.md, TEST_REPORT.md, PROGRESS.md and relevant decisions/setup docs with implemented recovery behaviour, exact commands, residual blockers and the next action. Keep owner-dependent tasks explicit. Preserve draft legal labels and placeholder-photo attribution.

Finish with a concise change summary, verification evidence, remaining owner inputs and a concrete staging checklist. Do not deploy, enable real payments, provision paid infrastructure or make irreversible cloud changes. Prepare the project so owner approval and credentials are the final steps after the work is reviewable.
