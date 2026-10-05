# Raj Raani Collections - project conventions

Indian lehenga / occasionwear storefront + store-owner admin. Next.js 15.5 (App Router) · React 19 · TypeScript strict · Tailwind 4 ·
Firebase (Auth, Firestore **Standard**, Storage) via emulators locally · Razorpay / Shiprocket / Anthropic behind adapters.
Source of truth for requirements: `RajRaani_*.pdf` + `RajRaani_Claude_Code_Master_Prompt.md`; reconciled in `docs/` (read `docs/DECISIONS.md` first).

## Commands (Windows PowerShell friendly, one package manager: npm)
| Command | What it does |
|---|---|
| `npm run dev:local` | emulators (persisted in `emulator-data/`) + first-run seed + `next dev` |
| `npm run emulators` | Firebase emulators only (Auth 9099, Firestore 8080, Storage 9199, UI 4000). Needs Java 21+ |
| `npm run seed` / `npm run reset` | rebuild demo data (wipes!) / wipe. **Refuse non-emulator targets** (`scripts/lib/guard.ts`) |
| `npm run make-admin -- <email\|uid> [--revoke]` | grant/revoke the `admin` custom claim + revoke old sessions |
| `npm run check` | typecheck + lint + unit tests |
| `npm run test:unit` / `test:int` / `test:rules` / `test:e2e` | Vitest (pure) / Vitest vs emulators / rules tests / Playwright |
| `npm run build` | production build (typecheck + lint run inside) |
| `npm run jobs:expire\|outbox\|reconcile\|refunds\|purge` | maintenance jobs (also `POST /api/jobs/<name>` with `JOB_SECRET`). `refunds` re-checks refunds stuck `processing` against the provider |
| `npm run migrate:ttl` | dry-run-first, resumable ISO-string -> Timestamp migration for TTL fields (emulator by default; cloud needs 3 explicit confirmations) |
| `node scripts/shot.mjs <path> <width> [name] [--login=email] [--cart=variantIds]` | screenshot to `screenshots/` |

Integration/E2E tests need the emulators running with seed data (`npm run dev:local`, or `npm run emulators` + `npm run seed`).
`test:int` / `test:rules` start their own emulators via `firebase emulators:exec` (stop `dev:local` first - ports collide).

## Architecture boundaries
- `src/domain/*` pure TypeScript (money, pricing, order state machine, catalogue filtering, schemas). No I/O. Unit tested.
- `src/server/*` is `import "server-only"`. Only `src/server/firebase/admin.ts` may import `firebase-admin` (ESLint-enforced).
  - `repos/` reads/writes collections; `services/` business operations (checkout, stock, payments, orders, inventory...);
    `providers/` adapters (payments, shipping, ai) with explicit `simulated | live` modes; `auth/` session + order access.
- `src/app/api/*` thin handlers: `handle()` + `assertSameOrigin()` + `readJson(zodSchema)` + rate limit + the right `require*()`; no logic.
- `src/components/*` UI. **A module marked `"use client"` cannot export values (objects/functions) for Server Components to call** - export
  only components; keep shared constants in plain modules (this bit us twice: `emptyEditor`, `tableCls`).
- Storefront reads go through server DTOs (`repos/catalog.ts`); the browser never reads Firestore. Rules deny all client writes.
- Money is **integer paise**. `formatINR()` only at display. Timestamps are server ISO strings.
- Scripts import server modules with `node --conditions=react-server` (so `server-only` resolves); Vitest aliases it to a stub.

## Security invariants (do not weaken; each has a test)
1. Every protected page/handler/action verifies the session cookie (`getSession`/`requireUser`/`requireAdmin`), role claim and ownership itself.
   `src/middleware.ts` is only an early redirect. Order access = owner session, admin, or signed order-scoped token; otherwise **404**.
2. Admin is the Firebase custom claim `admin` only (never a profile field, never client-sent). Destructive admin actions need `requireRecentAdmin()`.
3. Totals/prices/discounts/shipping/stock are recomputed server-side; client numbers are ignored (zod strips unknown fields).
4. Checkout needs `Idempotency-Key`; stock changes only via `services/stock.ts` inside transactions; reservations expire (job) and release once.
5. A payment is marked paid ONLY by `applyPaymentCaptured` after signature/provider verification; webhooks verify the raw body (Razorpay HMAC)
   or the `x-api-key` token (Shiprocket) and are idempotent + out-of-order safe.
6. No secret in `NEXT_PUBLIC_*`; no service-account JSON in the repo; production refuses simulated mode and emulator hosts (`server/env.ts`).
7. Uploads are decoded and re-encoded with sharp; draft media is private; CSV/XLSX exports neutralise formula injection.
8. AI assistants: customer = no tools, grounded context only; admin = read-only bounded tools. Neither can mutate data.
9. Money movement never repeats on a guess (docs/DECISIONS.md D-32): a refund is locked `processing` with a persisted dispatch record (receipt) BEFORE the provider call; a timeout/crash leaves it `uncertain`, never unlocked by time; only verified provider evidence (fetch / list by receipt+payment+exact amount / authenticated webhook) or an audited manual attestation resolves it. A failed refund is retried only when `retrySafe`. Amount alone is never a match.
10. Captures the order cannot apply become `paymentExceptions` (D-33): they block confirm/process/ship (before any courier call), are resolved by verified provider evidence, and cannot be cleared by generic `clear_review`.
11. Messages: `previewed` is not `delivered` (D-34). Live mode without a channel is `unavailable`, never "sent". Private links are minted at delivery time and never stored.
12. Courier booking is a persisted state machine (D-36): provider ids are stored as known, retries resume, unknown outcomes lock until attached/manual. Parcel size comes from owner settings.
13. Simulations are always labelled (`SimulationBadge`, "[Simulated ...]"); live mode with missing credentials throws `ConfigurationError` (never fakes success).

## Design tokens (fixed by the brief; defined in `src/app/globals.css` `@theme`)
maroon `#4A1020` (primary), wine `#6B1E2D` (hover/active), ivory `#FAF8F3` (bg), antique-gold `#D4AF37` (decorative; text only on maroon),
beige `#E8DDC9`, taupe `#C9B8A7` (decorative), charcoal `#2D2D2D` (text), rose `#F5E6E6`.
Documented additions: `ink-muted #5C534D`, `line #DCCFB9`, `gold-ink #7A5D00`, success/warning/error/info pairs (always with icon + text).
Fonts: Playfair Display (headings), Montserrat (nav/buttons/eyebrows), Inter (body/admin). Small radii (2-6px), 44px touch targets.
Storefront = editorial (no dashboard styling); admin = compact neutral shell with maroon accents.
Images: Unsplash-licensed sample photographs in `public/photos` (fetched by `scripts/fetch-photos.mjs`, credited in `docs/ASSETS.md`, always labelled "Sample photo") + user-supplied assets. Never invent testimonials, awards, addresses or numbers.

## Doc map
`docs/REQUIREMENTS.md` (traceable requirements + status) · `ROUTES.md` · `DECISIONS.md` · `PROGRESS.md` (state + exact next action) ·
`ASSETS.md` · `TEST_REPORT.md` · `DEPLOYMENT.md` · `OWNER_SETUP.md` · `README.md`.
