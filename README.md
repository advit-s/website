# Raj Raani Collections

A working Indian lehenga / occasionwear store: editorial storefront, customer accounts, one-page checkout with stock reservations, and a
store-owner admin (catalogue, inventory spreadsheet, orders, returns/refunds, customers, settings, read-only AI assistant).

> **This is a local, simulated build.** Persistence is real (Firebase emulators); payments, shipping, notifications and AI run as clearly
> labelled local simulations until you supply credentials. It is **not** a production-ready live store. See
> [docs/OWNER_SETUP.md](docs/OWNER_SETUP.md) for what is needed to launch and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the (not yet performed) deployment steps.

## Prerequisites
- Node.js 22+ (tested on 24) and npm 10+
- **Java 21+** (the Firestore emulator needs it - check with `java -version`)
- Git (optional; local commits only)

## Run it (PowerShell)
```powershell
npm install
npm run dev:local        # starts emulators, seeds demo data on first run, then Next.js
```
Open **http://localhost:3000**. Emulator UI: http://127.0.0.1:4000. Stop with Ctrl+C (emulator data is saved to `emulator-data/`).
`.env.local` is created from `.env.example` automatically (demo values only, no real secrets).

Prefer separate terminals? `npm run emulators` in one, then `npm run seed` and `npm run dev` in another.
To reset to the pristine demo dataset at any time: `npm run seed` (wipes local emulator data, then re-seeds).

## Demo accounts (Auth emulator only - created by the seed)
| Role | Email | Password |
|---|---|---|
| Store owner (admin) | `admin@rajraani.test` | `Demo#Passw0rd` |
| Customer (has orders, saved address) | `customer@rajraani.test` (phone +91 90000 00002) | `Demo#Passw0rd` |
| Customer 2 | `customer2@rajraani.test` (phone +91 90000 00003) | `Demo#Passw0rd` |

Phone sign-in: enter the number, then read the 6-digit code from the Auth emulator UI (http://127.0.0.1:4000/auth) or
`http://127.0.0.1:9099/emulator/v1/projects/demo-rajraani/verificationCodes`. Password-reset links appear at `.../oobCodes`
(open `/forgot-password?mode=resetPassword&oobCode=<code>`). The same `/login` serves customers and the owner; the `admin` claim routes to `/admin`.

## Try the journeys
- **Guest purchase:** `/shop` -> a product -> pick size -> *Add to cart* -> `/cart` -> `/checkout` -> *Cash on delivery* -> confirmation -> `/track-order`
  (use the order number + the phone you typed). Seeded guest order: `RRC-1001` with phone `9876500011`.
- **Prepaid (simulated Razorpay):** at checkout choose *Pay online* -> a labelled simulation window offers *succeed / fail / close*. A failure keeps you on
  `/checkout` with *Try again* (bounded attempts) or *Pay by cash on delivery instead*. The simulation sends a **signed webhook** to the real handler.
- **Owner day:** sign in as admin -> `/admin` dashboard -> `/admin/orders?tab=pending` -> open an order -> *Confirm* -> *Start processing* -> *Ship*
  (manual AWB, or simulated Shiprocket) -> *Mark delivered*. Refunds: *Request refund* then *Send refund to provider (simulated)*.
- **Inventory:** `/admin/inventory` - edit a stock cell and Save; export CSV/Excel, edit, re-import (dry-run first). Rows changed by a sale since export are flagged, not overwritten.
- **Catalogue:** `/admin/products/new` (upload images, variants, publish); `/admin/categories`; homepage/hero/announcement/delivery/COD/coupons in `/admin/settings`.
- **Assistants:** the "Ask our stylist" button (customer, grounded in the catalogue) and `/admin/assistant` (owner, read-only tools). Without an Anthropic key both answer
  from a labelled local responder.
- Maintenance jobs: `npm run jobs:expire` (release held stock), `jobs:outbox`, `jobs:reconcile`, `jobs:purge`.

## Checks
```powershell
npm run check            # typecheck + lint + unit tests
npm run test:unit
npm run test:int         # starts its own emulators (stop dev:local first)
npm run test:rules
npm run test:e2e         # Playwright; needs `npm run dev:local` running; first: npx playwright install chromium
npm run build
```
Results and what could not be verified without live services: [docs/TEST_REPORT.md](docs/TEST_REPORT.md).

## Where things are
`src/domain` (pure logic) · `src/server` (server-only: repos, services, providers) · `src/app` (routes: `(storefront)`, `(auth)`, `(account)`, `admin`, `api`) ·
`src/components` · `scripts` (seed, jobs, admin grant, screenshots) · `tests` · `docs`. Conventions: [CLAUDE.md](CLAUDE.md). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Honest limits
Demo catalogue and images are generated placeholders (labelled). Legal pages are drafts. No messaging vendor is selected, so customer messages are previews only.
Nothing was deployed, no live payment was made, and no paid infrastructure was created.
