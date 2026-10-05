# Progress

Last updated: 2026-10-05. Nothing has been deployed; no paid infrastructure exists; no live payment or provider call has been made. Independent readiness review and local fixes are recorded in READINESS_REVIEW.md.

## Milestones
| Milestone | Status |
|---|---|
| M1 Foundations: Next 15 app, design system (brand tokens), shared layouts, docs | Done |
| M2 Catalogue: home, shop (filters/search/sort/pagination), category, product, wishlist, seed + demo art | Done |
| M3 Auth/session, cart (guest + merge), checkout with stock reservation, COD + simulated Razorpay, webhooks, account, tracking | Done |
| M4 Order lifecycle: cancel/return/refund, invoices (PDF), notifications outbox, jobs (expire/outbox/reconcile/purge) | Done |
| M5 Admin: dashboard, orders, products editor, inventory (import/export), categories, customers, settings, coupons | Done |
| M6 Assistants (customer + admin, simulated responders), content/legal pages, contact/custom-enquiry | Done |
| M7 Hardening: rules tests, integration tests, e2e (a11y, responsive, security headers), docs | Done locally; see TEST_REPORT.md |

## M8 Recovery and staging readiness (2026-10-05)
Done locally (see READINESS_REVIEW.md "Update" and DECISIONS D-32..D-37): refund dispatch records + verified recovery + evidence replay + `refunds` job; payment exceptions with fulfilment guards and audited resolution; truthful messaging states with a vendor interface; TTL timestamps + safe migration; payment-attempt and Shiprocket booking race handling with owner-supplied parcel size; production dependency audit 0 via scoped overrides. Plus: licensed Unsplash sample photography on the storefront (docs/ASSETS.md).

## Test results
Latest run (2026-10-05): 56 unit, 121 integration, 16 rules, 76 browser tests passed; clean build; `npm audit --omit=dev` 0. Details and what is NOT verified: docs/TEST_REPORT.md.

## Blockers (owner input needed - docs/OWNER_SETUP.md)
Legal identity/GSTIN/grievance officer; real photos and logo; Razorpay, Shiprocket, Anthropic credentials; messaging vendor choice; WhatsApp number; Firebase project (Blaze) and region confirmation; professional review of legal drafts.

## How to run
`npm install`, then `npm run dev:local` (emulators + seed on first run + Next dev) -> http://localhost:3000. Admin: admin@rajraani.test / Demo#Passw0rd (emulator only).

## Exact next action
Owner (unblocks everything else, none of it needs code): (1) choose the messaging vendor; (2) give the standard parcel size and packaging weight (or decide to book manually); (3) decide the paid-online-and-COD policy; (4) supply the items in docs/OWNER_SETUP.md sections A-D.

Developer, after approval to create an isolated STAGING Firebase project (not production): deploy rules/indexes, set test-mode secrets, then rehearse and record - Razorpay Test Mode (success, failure, retry, refund incl. duplicate receipt and lost response, webhook retry/ordering, dashboard-created refund) and a Shiprocket sandbox booking (incl. repeated create/assign and `orders/show`); add the chosen messaging adapter against its contract tests; add browser tests for the admin recovery panels. Do not deploy, enable live payments or create paid infrastructure without explicit owner approval.
