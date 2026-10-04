# Raj Raani Collections — Claude Code build prompt

Place this file in the project folder beside the five PDFs. Install the recommended skills below, open Claude Code in this folder, and say: “Read RajRaani_Claude_Code_Master_Prompt.md completely and execute the build instructions. Start by reading all five PDFs, reconciling requirements, and then implement the project through the milestones. Keep progress in docs/PROGRESS.md.”

## Recommended skills and installation

These are instruction packs for Claude Code; they do not replace npm dependencies, Firebase setup, API credentials, or browser test tools. Run the commands in the project folder, not in Claude's chat. Node.js/npm and Git must be available. These commands target Claude Code and install at project scope. `--copy` avoids symlink setup issues on Windows.

```powershell
npx skills add anthropics/skills --skill pdf frontend-design webapp-testing --agent claude-code --copy
npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices web-design-guidelines --agent claude-code --copy
npx skills add firebase/agent-skills --skill firebase-basics firebase-auth-basics firebase-firestore-standard firebase-app-hosting-basics --agent claude-code --copy
npx skills list --agent claude-code
```

Use `pdf` for the source documents, `frontend-design` for the storefront, `vercel-react-best-practices` for React/Next.js implementation, `web-design-guidelines` for UI review, and `webapp-testing` for browser verification. The Firebase skills cover project setup, authentication, Standard-edition Firestore, and App Hosting. The webapp-testing skill uses Python Playwright helpers; Claude should check their runtime requirements before using them. Application end-to-end tests can remain in TypeScript Playwright.

If a skill references another required skill that is absent, inspect `npx skills add firebase/agent-skills --list` and install the exact available dependency. Do not invent a skill name. We deliberately choose Firestore Standard Edition for this implementation; do not let a generic skill silently provision Enterprise Edition. Cloud provisioning and billing still require the owner's explicit authorization. Local emulators do not need a live paid project.

Verified directory/reference pages:
- https://skills.sh/anthropics/skills/pdf
- https://skills.sh/anthropics/skills/frontend-design
- https://skills.sh/anthropics/skills/webapp-testing
- https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
- https://skills.sh/vercel-labs/agent-skills/web-design-guidelines
- https://skills.sh/firebase/agent-skills/firebase-basics
- https://skills.sh/firebase/agent-skills/firebase-auth-basics
- https://skills.sh/firebase/agent-skills/firebase-firestore-standard
- https://skills.sh/firebase/agent-skills/firebase-app-hosting-basics
- https://github.com/vercel-labs/skills (installation flags and agent configuration)

---

# BEGIN BUILD INSTRUCTIONS

You are the implementation engineer for Raj Raani Collections, an Indian lehenga and occasionwear ecommerce business. Build a complete, coherent, locally runnable storefront and store-owner administration application in this folder. This is a working ecommerce implementation, with real persistence and tested business logic, not just a collection of attractive mockups.

The folder initially contains only requirement PDFs and perhaps this prompt/installed skills. Inspect before scaffolding. Preserve existing files. Do not overwrite the PDFs, delete skills, or assume a starter application exists. If scaffolding cannot work in a nonempty folder, generate in a temporary sibling directory and merge only the scaffold files carefully.

## 1. Read the source material and establish the implementation contract

Find and read every page of:
1. RajRaani_01_User_Flow(1).pdf
2. RajRaani_02_Sitemap(1).pdf
3. RajRaani_03_Database.pdf
4. RajRaani_04_Backend_Auth.pdf
5. RajRaani_05_Security_Legal.pdf

Accept equivalent filenames with a different copy suffix. Use the PDF skill/extraction tools and inspect page images where tables or diagrams require it. Some PDFs repeat content: deduplicate requirements without losing unique details. Do not treat the documents' typography and page colours as screenshot references for the actual website.

Create:
- `docs/REQUIREMENTS.md`: requirements with source PDF and page references, acceptance criteria, and implemented/deferred/blocked status.
- `docs/ROUTES.md`: one canonical route inventory and access requirements.
- `docs/DECISIONS.md`: contradictions, correction, reason, and current official documentation where needed.
- `docs/PROGRESS.md`: current milestone, completed work, failing checks, blockers, exact next action.

This prompt resolves conflicts explicitly. Otherwise follow the PDFs' business intent, not unsafe or unsupported sample code. Verify framework/provider details against their current official documentation. Do not blindly pin Next.js 14 because the PDF mentions it; select a currently supported stable version compatible with Firebase App Hosting, record why, and commit a lockfile. Avoid preview releases.

Make reasonable reversible implementation decisions and continue. Ask only for a genuinely blocking business decision or permission for live infrastructure/actions. Missing paid API credentials must not stop local implementation. Do not end after writing a plan. Do not repeatedly request permission between local milestones.

## 2. Required technical direction

- Next.js App Router, React, TypeScript strict mode, and Tailwind CSS.
- Server Components for suitable read/render work; focused Client Components for interactive UI.
- Firebase Authentication: email/password and phone OTP; Firebase Admin SDK exclusively on the server.
- Cloud Firestore Standard Edition, planned production location `asia-south1` (Mumbai), subject to owner confirmation before provisioning.
- Firebase Cloud Storage for catalog media; Firebase App Hosting as the intended deployment target. Prepare configuration; do not deploy automatically.
- Zod validation at every mutation/API boundary; accessible form primitives and reusable components.
- Razorpay hosted checkout for prepaid payments; COD as a separate order/payment path.
- Shiprocket for courier integration; explicit manual fulfilment fallback.
- Anthropic API for grounded shopping assistance and an authenticated admin assistant.
- Vitest or equivalent unit/integration tests, Firebase Emulator Suite and Security Rules tests, and Playwright end-to-end tests.
- Use one package manager and one lockfile. Keep dependencies justified. Do not add another database, Express server, microservices, or a generic CMS merely to finish the scaffold.

Organize into route groups for storefront, auth, account, and admin; reusable UI and domain components; server-only repositories/services; validation/domain types; provider adapters; scripts; tests; and docs. Route groups must not alter the URLs specified below. No monolithic page containing the entire application.

Create `CLAUDE.md` with persistent project conventions, chosen commands, architecture boundaries, design tokens, source locations, and the security invariants below. The user's requirements take priority over a skill's default styling preferences.

## 3. Visual direction and fixed design tokens

Build an editorial Indian couture storefront: rich lehenga photography, ivory space, deep maroon controls, refined serif headings, fine dividers and restrained gold detail. The page should feel like a real clothing brand. Avoid generic SaaS hero cards, dashboard styling on the storefront, excessive gradients, glass panels, emoji icons, and distracting animation.

Use these agreed palette values as CSS variables and Tailwind semantic tokens:

| Token | Hex | Intended role |
|---|---|---|
| brand-maroon | #4A1020 | Primary buttons, header accents, footer |
| brand-wine | #6B1E2D | Hover/active brand colour |
| ivory | #FAF8F3 | Main storefront background |
| antique-gold | #D4AF37 | Restrained decorative accents |
| beige | #E8DDC9 | Secondary surfaces and dividers |
| taupe | #C9B8A7 | Muted decorative detail |
| charcoal | #2D2D2D | Primary readable text |
| rose | #F5E6E6 | Soft highlight backgrounds |

Use Playfair Display for storefront headings, Montserrat for navigation/buttons, and Inter for body/admin text. These are explicit design choices; a design skill must not substitute unrelated typefaces. Load efficiently with suitable fallbacks. Establish a shared type scale, spacing scale, widths, image ratios, button heights, focus states, and small corner radii.

Gold and taupe are not automatically suitable for small text on ivory. Check contrast and use readable dark text. Add separate semantic success/warning/error tokens with accessible text/icon cues and document them as additions.

Only the palette and broad art direction are supplied here. Original homepage screenshots referenced in earlier conversation may not be present. Search the folder for actual reference assets; do not claim pixel-perfect reproduction without them. Continue with a polished consistent interpretation, and document missing imagery/reference assets. Use only user-provided or appropriately licensed imagery. Never fabricate brand awards, customer reviews, business addresses, or authentic product photos. Demo catalog data must be labelled as demo in development. Track image provenance and replacements in `docs/ASSETS.md`.

Make desktop, tablet, and phone layouts intentional. Inspect 390px, 768px, and 1440px widths, and prevent overflow at 320px. Use two-column mobile product grids when legible, accessible mobile filter drawers, responsive galleries, and a usable purchase action on small screens. Respect reduced motion; avoid scroll hijacking. Admin may use its own compact neutral shell with maroon accents, dense tables, clear hierarchy, keyboard-friendly editing, and a responsive sidebar.

## 4. Complete route and page contract

There are 35 numbered design entries in the brief, not 35 distinct independently designed pages. Entry 26 shares an editor between two paths; entry 35 is an authentication flow. The explicit inventory below has 35 page-route patterns: 19 storefront/account/auth, 4 legal, and 12 admin. Correct the PDFs' inconsistent totals; do not drop routes to fit them. API handlers and generated metadata endpoints are additional system routes.

### Storefront, auth, and account

1. `/`: announcement bar; responsive RR wordmark/navigation/search/account/wishlist/cart; editorial bridal hero with meaningful shop CTA; shop by category; featured/new pieces; bestsellers; “The Art of Indian Couture” story; craftsmanship; custom-made enquiry CTA; useful service assurances; footer with contact, policies, social links. All catalog sections read shared data. Do not show fake testimonials. Homepage copy, hero, featured selection, and announcement must be editable in admin settings.
2. `/shop`: reusable catalog with search, category/price/size/color/fabric filters, sorting, pagination, product count, empty/loading/error states. New arrivals, bestsellers, sale, collections, and search use query parameters. Preserve filters in URLs and back navigation. Implement a bounded, documented Firestore-compatible search strategy; do not pretend Firestore provides arbitrary full-text search.
3. `/category/[slug]`: reusable category landing/catalog including Custom Made, category banner/description, appropriate filters. Active categories drive navigation automatically. Invalid/inactive categories return a proper not-found state.
4. `/product/[slug]`: desktop gallery left, purchase panel right; product title, genuine rating only if available, price, description, real size/color variants, stock availability, size-guide trigger, add to cart, wishlist, pincode serviceability, COD/shipping info. Description, Details, Size Guide, Reviews, Shipping & Returns are accessible tabs within this route. Related products below. Customizable items include measurements/occasion enquiry and WhatsApp handoff, with production lead time separate from transit time. Review collection/submission is deferred at launch: preserve the tab with an honest empty state, never invented reviews.
5. `/cart`: variants, quantity update, remove/move to wishlist, coupon entry, free-delivery progress, server-revalidated subtotal/shipping/discount/total, desktop order-summary panel, checkout CTA. Clearly state when shipping is estimated until pincode entry. Include empty and price/stock-changed states.
6. `/wishlist`: minimal product grid, count, move to cart with variant selection, remove, empty state, and login invitation for logged-out visitors. Account wishlist persists in Firestore. Do not lose guest cart when asking for login.
7. `/checkout`: ONE page containing contact information, delivery address, shipping method, payment method, order summary, and place-order control. Guest checkout supported. Saved addresses for authenticated customers. India-only validation. UPI/cards/netbanking through Razorpay; COD only when allowed. Failed/cancelled payment stays inline with retry/change-method controls. No separate address/payment/failure routes.
8. `/checkout/success`: server-authorized order confirmation, order number, applicable delivery/production estimate, track-order and continue-shopping CTAs. Pending verification must display pending, never fake success. Refreshing must not create another order. Guest access uses an opaque scoped session/token, not an enumerable order ID alone.
9. `/track-order`: order number + phone/email lookup followed by timeline on the same route. Return only minimally necessary masked tracking data after matching contact information; rate-limit attempts. Use verified-contact OTP or a secure emailed link before showing private order/invoice/address details. No public listing or enumerable order-detail API.
10. `/about`: hero, story, philosophy, craftsmanship, design process, why RR Collections, CTA. Editorial imagery with maroon/cream sections; do not invent business history as verified fact.
11. `/contact`: validated name/email/phone/message form, store contact/hours, WhatsApp CTA; submission persists or uses a configured delivery service with honest success/failure states. Missing real contact details remain explicit owner-setup items.
12. `/faq`: accessible accordions grouped by Orders, Payments, Shipping, Returns, Sizing, Customisation, COD, Care Instructions. Source policy answers from the same configuration/content as legal and checkout pages.
13. `/login`: email/password and phone OTP modes; inline OTP; forgot-password/create-account links; shared customer/admin login. Firebase phone auth is a separate mode, not a made-up phone+password provider.
14. `/register`: full name, appropriate email/phone fields, password and confirm where relevant, terms acceptance; inline Firebase OTP for phone sign-up. Handle existing accounts and verification states. No OTP route.
15. `/forgot-password`: request link, token verification, new password, success, invalid/expired-link states on this one path, using Firebase reset APIs.
16. `/account`: customer overview, profile and settings sections, orders/addresses shortcuts, safe profile editing and sign-out.
17. `/account/orders`: All/Processing/Shipped/Delivered/Cancelled filters; order cards/table and correct totals.
18. `/account/orders/[id]`: authorized order items, address/payment summary, timeline, invoice download, support, and applicable cancellation/return requests. Immutable purchase snapshots determine invoice data.
19. `/account/addresses`: add/edit/remove/default addresses; forms inline or in modal; default-address changes consistent; do not mutate an existing order's address snapshot.

### Legal

20. `/terms`: clean readable document, update date, general/products/orders/payments/accounts/IP/liability sections.
21. `/privacy`: data collection/use, cookies, providers/payments, security, rights, contact, assistant disclosure; no separate cookies page.
22. `/shipping-policy`: India-only coverage, processing/transit/custom production times, charges/COD/tracking/delays/damage.
23. `/refund-policy`: cancellation/returns/exchange/refunds/damage/non-returnable/custom-made conditions.

Use the provided legal templates as drafts. Keep policy values centralized and configurable. Do not manufacture legal name, GSTIN, grievance officer, registered address, jurisdiction, or approved policy. Document required owner/legal review and verify current law through official sources before making a compliance claim. In local preview display a clear draft indicator. Unresolved legal placeholders are launch blockers, not reasons to stop coding.

### Admin

24. `/admin`: authenticated dashboard with today's sales/orders, pending orders, revenue, low stock, recent orders. Define metrics correctly: pending prepaid orders are not paid revenue. Use Asia/Kolkata business-day boundaries and labelled periods.
25. `/admin/products`: search/filter/pagination, category/price/stock/status, add/edit actions, draft/publish/archive behavior.
26. `/admin/products/new` AND `/admin/products/[id]`: reusable editor with basic information, images/alt/order, price/sale/compare-at rules, inventory, size/color variants, unique SKU, category, description, fabric/work/set/weight, tags, featured/bestseller/new-arrival flags, customization and lead time, SEO, draft/publish. Existing data loads correctly; unsaved changes and validation errors are visible.
27. `/admin/inventory`: practical variant-level spreadsheet table; inline price/stock edits, low-stock filters, validation, conflict detection, audit history, CSV/XLSX export/import with preview/dry-run and row errors. Never overwrite concurrent sales silently.
28. `/admin/categories`: list/add/edit modal for name, unique slug, description, banner, sort order, active state. Categories appear without deployment. Prevent deleting categories with products or provide an explicit reassignment flow.
29. `/admin/orders`: one order queue with All/Pending/Processing/Shipped/Delivered/Cancelled/Returns filters using query parameters, search, pagination, payment and fulfilment indicators.
30. `/admin/orders/[id]`: customer, snapshotted products/totals, payment, delivery address, fulfilment timeline, valid status transitions, shipment/manual tracking, cancellation/return/refund workflows, notes, and audit records. Customer-visible updates come from the same source of truth.
31. `/admin/customers`: search and paginated customers with order counts/spend/latest order; sensitive data restricted to admins.
32. `/admin/customers/[id]`: profile/contact, orders and addresses, totals; orders remain a tab here.
33. `/admin/assistant`: Conversation, Activity, Settings tabs. Support read-only business questions about actual orders/revenue/stock and review customer-assistant conversations with pagination/redaction. Keep admin and public assistant authorization/tool sets separate. No autonomous refunds, price edits, deletes, or other mutations from model output.
34. `/admin/settings`: one sectioned page for store information, delivery and COD, payment integration status, notifications, homepage/hero/featured/announcement, socials. Do not expose secret values in this UI or store them in publicly readable settings. Support validated updates, previews, and clear save/error states.
35. Admin access FLOW: `/login` → verified authentication/session → admin custom claim ? `/admin` : `/account`. No `/admin/login` page. Sanitize return URLs to avoid open redirects.

Add `/api/webhooks/razorpay`, `/api/webhooks/shiprocket`, a public `/api/assistant`, necessary protected service endpoints, generated `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, and a custom 404. A manifest alone must not be described as complete offline/PWA support. Exclude private pages from the sitemap; robots/noindex is not access control.

## 5. Data model and integrity

Implement the source collections: `users/{uid}` with addresses/cart/wishlist subcollections; `categories`; `products`; flat top-level `productVariants`; `orders`; append-only `stockLogs`; and `assistantLogs`.

Add only the records required by functioning features: validated public/private settings, coupon definitions/redemptions, stock reservations, idempotency keys, webhook receipts, contact enquiries, order timeline/audit entries, and notification outbox. Document each addition. Separate private operational fields from anything publicly readable.

- Use integer paise for monetary calculations and document the change from PDF rupee examples; format rupees only for display. Handle zero-valued overrides with explicit null checks. Validate quantities and amounts server-side.
- Validate SKU and slug uniqueness transactionally or with unique-key records; a query-before-write alone is race-prone.
- Keep name/price/variant/tax/discount/address snapshots on orders. Changing products, settings, or addresses must not alter old orders/invoices.
- Keep flat variants for inventory. In Standard-edition Firestore, do not translate `stock <= lowStockThreshold` into a field-to-field query. Maintain a transactionally updated `isLowStock`/availability field, with tests, or choose another supported bounded design. Account for reservations in sellable availability.
- Check query/index feasibility for multi-filter catalog pages. Commit required composite indexes in `firestore.indexes.json`. Use pagination and bounded reads; do not download all orders/customers to render a table or dashboard.
- Maintain denormalized product name/category on variants safely; define multi-write behavior and limit handling.
- Canonical fulfilment status: New → Confirmed → Processing → Shipped → Out for Delivery → Delivered, with guarded cancellation and separate return workflow. Map “Pending” UI labels explicitly. Track payment status separately: pending/paid/failed/partially_refunded/refunded or equivalent documented values. Return requested is not the same as refund completed.
- Use server timestamps, sensible log/message size limits and retention settings. Orders retain necessary business records; account deletion does not silently erase transactional history.

## 6. Authentication, authorization, and corrections to the PDFs

Implement Firebase email/password/phone auth; never store passwords or OTP codes. Establish an HTTP-only, secure-in-production, SameSite session cookie from a verified recent ID token, with origin/CSRF protection, bounded duration, revocation checks, safe logout, and session renewal/expiry behavior. Use an explicit localhost-only development exception if necessary.

Perform auth/role/ownership verification in every protected server action and handler. Middleware/proxy/layout redirects are only an additional layer. Choose the correct runtime for Admin SDK verification based on the selected Next.js version; do not put unsupported Node dependencies in an Edge runtime.

Use `import 'server-only'` for privileged modules. Absence of `'use client'` does NOT by itself guarantee a helper cannot enter the client dependency graph. Keep Admin SDK credentials, payment secrets, courier credentials and Anthropic keys server-side. Public Firebase web config and Razorpay checkout key ID are public identifiers. Use managed credentials/secret storage in production; no checked-in service-account JSON.

Admin authorization comes from Firebase custom claims, never a client-submitted role or a mutable profile field. Provide a trusted administrative grant/revoke script using environment/managed credentials; preserve unrelated claims and ensure revocation invalidates prior admin sessions. No public route that grants admin.

Fix these concrete source defects:
- The security PDF's `orders` rule `allow create: if true` permits direct unvalidated writes. Deny direct client order/payment/stock/audit mutations; trusted server services handle them after validation. Admin SDK bypasses rules, so server authorization is mandatory even with perfect rules.
- Do not copy `assistantLogs` public create permissions. Persist validated, rate-limited transcripts through the server.
- The user-profile write rule conflicts with the backend's server-created profiles. Make profile creation server-owned and restrict updates to permitted fields; do not allow role/ownership injection. Explicitly define subcollection rules; they do not automatically inherit a parent document rule.
- Do not expose unpublished products or inactive categories through broad public-read rules. Ensure query constraints match rules, or use a safe public catalog projection/server DTO. Firestore reads return documents, not field-redacted subsets.
- File MIME labels alone do not prove safe image bytes. Validate/decode/normalize uploaded images server-side; constrain types/dimensions/size and paths. Handle authorized deletes separately because `request.resource` is absent on deletion. Decide whether draft media must be private.
- Do not claim App Check alone provides authorization, prevents all abuse, or replaces web phone-auth reCAPTCHA. Verify actual service/platform support.
- Do not copy the claim that Shiprocket verifies webhooks “the same way” as Razorpay. Verify current provider authentication documentation and implement its actual mechanism. If authenticity cannot be established, reconcile with authenticated provider queries before applying status changes.
- Import audit logs alone do not prevent stale Excel overwrites. Use expected versions/timestamps and transactions. Account for all related writes and current Firestore limits; small atomic imports must fit them. For larger jobs use explicit chunks with accurate partial-progress reporting rather than claiming global atomicity.

Use deny-by-default Firestore/Storage rules, rules-unit tests, server input allowlists, output DTOs, permission checks, bounded requests, shared/distributed production rate limits, sanitized content, CSRF/origin checks, appropriate CSP/security headers, and redacted logs. Never call the application “unhackable.”

## 7. Checkout, inventory, payments, and fulfilment

The server loads authoritative product/variant prices and checks published state, stock, quantity, delivery serviceability, discount eligibility, COD limits, and shipping fees. It calculates the payable amount; ignore client-supplied totals. Include all surcharges before payment. Coupon validity, minimum spend, redemption limits, and discount caps must be enforced atomically where needed.

Design and test a reservation lifecycle before implementing checkout. A robust implementation must ensure:
- Concurrent buyers cannot oversell the last unit.
- Retrying a request with the same scoped idempotency key does not create duplicate orders/reservations/payment attempts.
- Prepaid checkout reserves stock transactionally with an expiry; successful captured payment commits the reservation once.
- Cancellation/expiry releases stock exactly once. A retryable payment failure has a defined bounded reservation policy; it cannot reserve stock forever.
- Expiry cleanup has a runnable worker/scheduled execution plan, not just a timestamp that nothing processes. Do not depend on eventual TTL deletion alone for timely restocking.
- Late successful payment after reservation expiry has an explicit recover/re-reserve or refund/manual-review path; do not mark it fulfilled against unavailable stock.
- COD confirms an order and allocates stock with payment pending, never falsely paid. Cancellation/restocking and returned-stock disposition are explicit and audited.
- External provider calls do not execute inside retrying Firestore transaction callbacks. Use durable state/idempotency/outbox/reconciliation where necessary.

Create Razorpay orders server-side. Validate callbacks according to official instructions and verify webhook signatures over raw bytes using a timing-safe comparison. Verify provider order/payment references, currency, amount and captured status before confirming payment. Store event identity and process duplicate/out-of-order deliveries safely; handle both callback and webhook arriving without double stock deductions. A browser success callback alone must not mark the order paid. Persist pending state and reconcile when a webhook/callback is lost. Provide test fixtures for failure, tampering and replay.

Handle refunds as provider-backed operations with idempotency, permission checks and reconciliation, not a dropdown that pretends money moved. Distinguish requested/processing/completed/failed refund states. Record COD refund references without exposing financial details publicly.

Shipping: India only; validated pincode-based serviceability and configurable rate/weight/threshold logic. NCR 1–2 days and rest-of-India 3–7 business days are source draft estimates, not verified guarantees. Custom production lead time is additional. Implement booking/tracking through a provider adapter and a manual booking/AWB workflow that never pretends an unmade booking succeeded. Shipment events must not illegally regress order state.

Transactional receipts and updates use a configurable SMS/WhatsApp/email adapter and durable retryable outbox. The documents do not choose a messaging vendor: implement local preview and a clear integration contract, list this as an owner configuration choice, and do not claim real notifications were sent. Do not send marketing without separate consent.

## 8. AI assistants and custom enquiries

Customer assistant: public, rate-limited, read-only, retrieves current published product data and configured policies; answers factual catalog questions, links actual products, states uncertainty and hands off to WhatsApp when necessary. Prevent prompt injection from granting tools, disclosing secrets, retrieving other users' orders, or writing data. Minimize personal data sent to the model. Limit input length, output tokens, tool calls, history, request time and spend. Select an available model using current official docs and environment configuration, not a guessed model ID.

Admin assistant: authenticated and admin-checked on every call; read-only structured tools for orders, defined revenue metrics and low stock. Queries operate under explicit authorization and return bounded results. Keep customer conversation review separate from the admin's private conversations. Log tool use safely. When the model provider is absent, show clear unavailable/configuration-needed behavior; a local simulated response must be visibly identified.

Custom orders: enquiry on category/product, measurements and occasion date, consent, encoded WhatsApp draft, owner quotation and agreed lead time. Don't automatically charge a standard product price for an unquoted custom order. Support recording the agreed quote, production state and partial advance against the order. Live payment links require verified provider integration; do not fabricate one. WhatsApp is an external CTA, not a site route, and creating a draft must not send it automatically.

## 9. Local-first development and honest live integration boundaries

Provide repeatable emulator setup, seed and reset scripts with persistent emulator import/export. Seed representative categories/products/variants, in-stock/low-stock/out-of-stock combinations, authenticated customer/admin test identities, guest orders, payment states, shipping/return cases and realistic totals. Seed/reset must default to a local demo project and refuse production targets without a deliberate safeguard. Never ship a hardcoded production admin password.

Local catalog/order/admin operations must use emulator-backed persistence, not component arrays or localStorage as the database. Guest cart browser storage is fine; reconcile it on the server and merge into authenticated carts deliberately with stock caps.

Use provider adapters with explicit local simulation/test and live modes. Simulated payments/shipping/notifications/AI are clearly labelled in development and cannot be accidentally enabled in production. No real credentials must be required for `dev:local` and business-logic tests. Simulated auth must not become a production bypass; use Auth Emulator accounts and real authorization code paths.

Create `.env.example`, document public vs private values and setup for Firebase web/admin, emulator hosts, Razorpay key ID/secret/webhook secret, courier configuration, Anthropic, messaging, domain and contact details. Never insert real secrets into examples or logs. Fail with useful configuration errors when live operations lack credentials; never fall back silently to a fake payment success.

## 10. Build milestones and persistence across sessions

Execute in this order, updating `docs/PROGRESS.md` after each coherent milestone:

1. Read/deduplicate/reconcile PDFs; establish route inventory, architecture, supported dependency versions and acceptance matrix.
2. Scaffold, design tokens, shared storefront/admin shells, responsive homepage first, then catalog/product pages. Connect these to emulator-seeded catalog data early.
3. Implement Firebase auth/session/RBAC, data repositories, rules and tests; category/product/inventory admin and settings.
4. Implement cart/wishlist/account/addresses and server checkout, stock reservations, discounts, COD, payment adapters and webhook/reconciliation logic.
5. Complete customer order tracking/details/invoices, admin orders/customers, shipping/manual fulfilment, notifications and custom enquiries.
6. Finish contact/FAQ/legal/about, both assistant surfaces, search/filter states, SEO/metadata and remaining route states.
7. Run security/business-flow/browser tests, inspect screenshots, repair defects, document live setup and launch blockers.

Work in manageable increments; do not scatter unfinished placeholder pages and call the project done. Keep local commits when Git is configured, with coherent messages and no secret/source-PDF deletion. Do not push or deploy without explicit instruction. If context runs short, write an exact checkpoint and resume existing work rather than recreating the project.

## 11. Verification and acceptance criteria

Provide reproducible scripts for development, local emulators, seed/reset, lint, typecheck, unit/integration/rules tests, E2E tests and production build. Use actual supported commands for installed versions. Report commands actually run, outcomes, and blocked tests. No fabricated Lighthouse scores or claimed provider tests without evidence.

Required behavioral checks:
- Every listed route renders appropriately for its access level, including not-found/loading/error/empty states.
- Guest browsing → variant → cart → COD checkout → protected confirmation → tracking works; repeat submissions remain one order.
- Simulated or provider-test prepaid success/failure/cancel/retry/late payment works, clearly separated from live verification.
- Tampered price, discount, quantity and order ownership requests fail safely.
- Two simultaneous purchases for one remaining unit cannot both allocate it.
- Duplicate and out-of-order webhooks, failed external calls and expiry cleanup preserve consistent stock/payment/order state.
- Customer A cannot access B's order/address/invoice or any admin action, including by direct endpoint invocation.
- Direct public Firestore writes cannot forge orders, roles, inventory, logs or payments. Draft catalog data remains inaccessible.
- Shared login routes correctly, OTP/reset have expiry/error states, and revoked admin sessions stop working.
- Product/category/settings edits appear in storefront; historical orders stay unchanged.
- Inventory edit/import validation, version conflicts, row limits, audit logging and export formula-injection protection work.
- Assistant tool permissions and provider-unavailable states are tested.
- Keyboard navigation, dialog focus, labels, tab/accordion semantics, focus visibility and touch controls work. Check accessible colour contrast.
- Browser screenshots for homepage, shop, product, cart, checkout, auth, orders and key admin pages at desktop/mobile; inspect and fix overflow, broken media, unreadable text, inconsistent spacing, and console errors.
- Build/typecheck/lint pass; no placeholder button silently performs no action. Unavailable live capabilities clearly explain their configuration requirement.

## 12. Handoff and definition of done

Deliver the actual code, tested local app, seed data, rules/indexes, hosting configuration, environment template, and these concise documents:
- `README.md`: Windows PowerShell-friendly setup and run commands, prerequisites, local demo accounts, how to exercise customer/admin journeys.
- `docs/REQUIREMENTS.md`, `ROUTES.md`, `DECISIONS.md`, `PROGRESS.md`, `ASSETS.md`.
- `docs/TEST_REPORT.md`: evidence, test commands/results, visual checks, and tests still requiring real services.
- `docs/DEPLOYMENT.md`: Firebase/App Hosting setup, secret provisioning, auth domains, provider callbacks/webhooks, scheduled cleanup/outbox/reconciliation jobs, backup/restore and rollback.
- `docs/OWNER_SETUP.md`: exact remaining business details, credentials, assets, delivery/COD/coupon/policy values, tax/invoice configuration, messaging provider and legal approvals needed for launch.

Finish with a concise account of what works locally, what has been verified, what needs live credentials/provider testing, where to open the app, and the next concrete owner steps. Do not label a local simulation as a production-ready live store. Deployment readiness is a separate gate from successful local implementation.

Begin now: inspect this folder and installed skills, read the PDFs completely, identify conflicts, create the requirements/decision records, and proceed with implementation.

# END BUILD INSTRUCTIONS
