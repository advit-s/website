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

## Test results
See docs/TEST_REPORT.md for exact commands and counts.

## Blockers (owner input needed - docs/OWNER_SETUP.md)
Legal identity/GSTIN/grievance officer; real photos and logo; Razorpay, Shiprocket, Anthropic credentials; messaging vendor choice; WhatsApp number; Firebase project (Blaze) and region confirmation; professional review of legal drafts.

## How to run
`npm install`, then `npm run dev:local` (emulators + seed on first run + Next dev) -> http://localhost:3000. Admin: admin@rajraani.test / Demo#Passw0rd (emulator only).

## Exact next action
Developer: complete payment/refund recovery, payment-exception fulfilment guards, truthful messaging states, TTL date fields and provider retry checks using docs/NEXT_STEP_CLAUDE_PROMPT.md. Current local tests passing is not production readiness; review docs/READINESS_REVIEW.md before cloud setup.

Owner: collect docs/OWNER_SETUP.md inputs in parallel. After recovery gates pass, configure isolated staging and exercise providers with test credentials using docs/DEPLOYMENT.md. Production deployment requires explicit owner approval.
