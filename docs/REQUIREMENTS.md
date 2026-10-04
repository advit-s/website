# Requirements — Raj Raani Collections

Sources: **UF** = `RajRaani_01_User_Flow.pdf`, **SM** = `RajRaani_02_Sitemap.pdf`, **DB** = `RajRaani_03_Database.pdf`,
**BA** = `RajRaani_04_Backend_Auth.pdf`, **SL** = `RajRaani_05_Security_Legal.pdf`, **MP** = `RajRaani_Claude_Code_Master_Prompt.md`.
Each PDF contains its content twice (a continuous copy followed by a paginated copy); requirements were de-duplicated.
`§nn` refers to the numbered section markers printed in the PDFs (BA and SL have no page footers in the first copy);
`p.n` refers to "Page n of N" footers (UF, SM, DB).
Status values: **Implemented** · **Partial** · **Simulated** (works locally against a labelled simulation) · **Deferred** (deliberate) · **Blocked** (needs owner input/credentials) · **Planned**.
Status column is maintained in step with [PROGRESS.md](PROGRESS.md); conflicts are resolved in [DECISIONS.md](DECISIONS.md).

## A. Customer journeys

| ID | Requirement | Source | Acceptance criteria | Status |
|---|---|---|---|---|
| R-A01 | Guest purchase path Home → Shop/Category → Product → Cart → Checkout → Payment → Confirmation → Track order, no account required at any step | UF p.1 | E2E: guest completes COD checkout, sees protected confirmation, tracks the order | Planned |
| R-A02 | Variant selector disables size/colour combos with zero sellable stock | UF p.2 | Out-of-stock combo is not selectable; server rejects it anyway | Planned |
| R-A03 | Pincode check on product page: NCR "1–2 days", rest of India "3–7 days" (draft estimates, not guarantees) | UF p.1, SL §10 | Valid 6-digit pincode returns zone + estimate; invalid/unserviceable states shown; estimates labelled as estimates | Planned |
| R-A04 | Cart: quantities, free-delivery progress bar, proceed to checkout | UF p.1 | Progress reflects configurable threshold; totals revalidated server-side | Planned |
| R-A05 | One-page checkout: address (new or saved), delivery method auto-set by pincode, payment method | UF p.1, SM p.2 | Single route; no address/payment/failure routes | Planned |
| R-A06 | Pay by Razorpay (UPI/card/netbanking) or Cash on Delivery | UF p.1, BA §09 | Prepaid + COD paths; COD never marked paid | Simulated (no Razorpay credentials) |
| R-A07 | Payment failure shown inline with retry; order stays Pending until paid or abandoned | UF p.2 | Failed/cancelled payment keeps user on `/checkout` with retry/change-method | Planned |
| R-A08 | Confirmation page + automatic WhatsApp/SMS receipt + account-creation prompt | UF p.1 | Confirmation shows order number, estimates; receipt goes to notification outbox (no vendor chosen) | Simulated |
| R-A09 | `/track-order`: order number + phone → live status with no login | UF p.1, BA §07 | Matching contact required, minimal masked data, rate-limited | Planned |
| R-A10 | Register with email+password or phone OTP; OTP entered inline; profile created server-side; guest cart merges | UF p.2, BA §02–03 | Emulator Auth accounts; no OTP route; cart merge with stock caps | Planned |
| R-A11 | Forgot password: one route, request state + reset state | UF p.2, SM p.2, BA §06 | Uses Firebase reset APIs; invalid/expired states | Planned |
| R-A12 | Guest orders never auto-linked to new accounts by phone/email; linking is a deliberate verified action | BA §07 | No auto-link; manual link requires verification against order phone | Planned |
| R-A13 | Custom / made-to-measure: enquiry section on product page collects measurements + occasion date and opens a pre-filled WhatsApp draft; owner quotes; advance collected; leadTimeDays sets expectation | UF p.3, DB p.2 | Enquiry persisted; WhatsApp URL encoded; no auto-charge of list price | Planned |
| R-A14 | AI shopping assistant: matches message to real catalog, answers only from matched data + policies, hands off to WhatsApp when unsure | UF p.3, BA §11 | Read-only tools; rate-limited; unavailable state labelled | Simulated until Anthropic key supplied |
| R-A15 | WhatsApp CTA visible throughout the storefront | UF p.1, SM p.2 | WhatsApp is an external link, never a route; number is an owner setup item | Blocked (number) |

## B. Routes (see [ROUTES.md](ROUTES.md))

| ID | Requirement | Source | Acceptance criteria | Status |
|---|---|---|---|---|
| R-B01 | Route consolidation: filters/tabs/modals instead of extra routes (New Arrivals/Best Sellers/Sale/Search are `/shop` query params; order statuses are filters; address/payment/failure inline) | SM p.1–3 | No extra routes beyond the inventory | Planned |
| R-B02 | 4 legal routes: `/terms`, `/privacy` (incl. cookies), `/shipping-policy`, `/refund-policy` | SM p.3, SL §08–11 | Rendered from central policy config with DRAFT indicator | Planned |
| R-B03 | System routes: `/api/webhooks/razorpay`, `/api/webhooks/shiprocket`, `/api/assistant`, `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, custom 404 | SM p.4 | Present; private pages excluded from sitemap | Planned |
| R-B04 | Deferred on purpose: lookbook, blog, comparison, appointments, customer-review system | SM p.3 | Product Reviews tab shows honest empty state | Deferred |
| R-B05 | Admin login via shared `/login`; admin claim routes to `/admin`; no `/admin/login` | UF p.2, SM p.3, BA §05 | Claim-based redirect; sanitized return URL | Planned |

## C. Admin

| ID | Requirement | Source | Acceptance criteria | Status |
|---|---|---|---|---|
| R-C01 | Dashboard: today's orders, pending count, low-stock products, revenue | UF p.2, SM p.3 | Asia/Kolkata day boundaries; pending prepaid ≠ revenue | Planned |
| R-C02 | Inventory spreadsheet: inline stock/price edit, Excel import after restock | UF p.2, BA §08 | Version-checked writes; dry-run import; formula-injection-safe export; audit log | Planned |
| R-C03 | Orders queue with status filter tabs; confirm, book Shiprocket pickup or manual NCR booking; move Confirmed → Processing → Shipped; webhook takes Shipped → Delivered | UF p.2 | Valid-transition guard; manual AWB workflow; no regression from webhook | Planned |
| R-C04 | Assistant review: see what AI told customers; step in on WhatsApp where escalated | UF p.3 | Paginated, redacted transcripts | Planned |
| R-C05 | New category appears in storefront nav with no deploy | UF p.2 | Active categories drive nav from Firestore | Planned |
| R-C06 | Product editor handles images/variants tabs; product rename updates denormalised `productName` on variants in the same write | SM p.3, DB p.1 | Multi-write batch; limit handling | Planned |
| R-C07 | Admin settings: store, delivery, payment, notifications, banner (single page) | SM p.3 | Validated; no secrets exposed | Planned |
| R-C08 | Customers list + detail with orders as a tab | SM p.3 | Paginated, admin-only | Planned |

## D. Data model

| ID | Requirement | Source | Acceptance criteria | Status |
|---|---|---|---|---|
| R-D01 | Collections: `users` (+addresses/cart/wishlist), `categories`, `products`, flat `productVariants`, `orders`, `stockLogs`, `assistantLogs` | DB p.1 | All exist with validated schemas | Planned |
| R-D02 | Variants are a flat top-level collection with denormalised product name/category | DB p.1 | Inventory table is one query | Planned |
| R-D03 | Order price/name/address snapshots; no later mutation of old orders | DB p.4 | Test: editing product/address leaves order unchanged | Planned |
| R-D04 | `order.status` single source of truth; Cancelled reachable only before Shipped | DB p.4 | Transition table + tests | Planned |
| R-D05 | Orders never deleted, only cancelled; stockLogs/assistantLogs append-only | DB p.5 | Rules deny delete; retention documented | Planned |
| R-D06 | Composite indexes committed | DB p.4 | `firestore.indexes.json` covers catalog + inventory + orders queries | Planned |
| R-D07 | Backups: scheduled exports, tested restore | DB p.5 | Documented in DEPLOYMENT.md (cannot be run locally) | Blocked (live project) |
| R-D08 | Money in integer paise (PDF examples use rupees) | MP §5 | Single money module; display-only formatting | Planned |

## E. Backend and auth

| ID | Requirement | Source | Acceptance criteria | Status |
|---|---|---|---|---|
| R-E01 | Admin SDK only on server; secrets never `NEXT_PUBLIC_` | BA §01, §10, SL §05 | `server-only` imports; grep audit test | Planned |
| R-E02 | Session cookie from Admin `createSessionCookie`; httpOnly, secure (prod), SameSite; `verifySessionCookie(…, true)` | BA §04 | Cookie attrs asserted in tests; revoked sessions rejected | Planned |
| R-E03 | Admin = custom claim set by trusted script only; claim change needs re-login | BA §05 | Script preserves other claims, revokes tokens | Planned |
| R-E04 | Password minimum 8 + upper/lower/number | SL §04 | Client and server validation; Firebase policy documented | Planned |
| R-E05 | Session length: customer 7–14 days, admin 24–72 h; re-auth for destructive admin actions | SL §04 | Configured lifetimes | Planned |
| R-E06 | Rate limiting: sign-in, checkout, Excel import, assistant, contact/custom forms (honeypot) | BA §08, SL §05 | Limiter with tests; shared store for production | Partial (in-memory locally; production store is a documented owner choice) |
| R-E07 | Webhooks: raw-body HMAC, idempotent processing | BA §09 | Timing-safe verify; replay/duplicate tests | Planned |
| R-E08 | Server Actions inventory: placeOrder, updateStock/bulkImportStock, create/updateProduct | BA §11 | All Zod-validated; authz inside each | Planned |
| R-E09 | Zod validation at every mutation boundary | SL §05 | No unvalidated mutation | Planned |
| R-E10 | Phone OTP via Firebase PhoneAuthProvider with reCAPTCHA; App Check where supported | BA §03, SL §04 | Emulator OTP flow; App Check documented, not claimed as authorization | Planned |

## F. Security rules and compliance

| ID | Requirement | Source | Acceptance criteria | Status |
|---|---|---|---|---|
| R-F01 | Deny-by-default Firestore + Storage rules, tested in emulator | SL §02–03, §05 | Rules unit tests pass | Planned |
| R-F02 | Corrected rules: no `orders create: if true`, no public `assistantLogs` create, no broad public catalog read of drafts, explicit subcollection rules, profile creation server-owned | SL §02, MP §6 | See DECISIONS D-07..D-12 | Planned |
| R-F03 | Storage: admin-only writes, image MIME + size cap (+ server-side byte validation) | SL §03, MP §6 | Server upload route decodes/normalises with sharp | Planned |
| R-F04 | DPDP Act: notice, purpose limitation, grievance officer, security safeguards, breach plan | SL §07 | Privacy page notice; owner placeholders flagged | Blocked (legal details) |
| R-F05 | Legal page drafts: Terms, Privacy, Shipping, Refund — bracketed values filled by owner + professional review | SL §08–11 | Draft banner in non-production; placeholders listed in OWNER_SETUP.md | Blocked (legal) |
| R-F06 | Threat checklist (cross-user reads, admin escalation, forged webhooks, XSS cookie theft, OTP abuse, disguised uploads, replayed imports, key leakage) | SL §06 | Each has a test or documented control | Planned |
| R-F07 | Never store card/bank detail; Razorpay hosted checkout only | SL §05, BA §09 | No card fields in app | Planned |

## G. Payments, inventory, shipping

| ID | Requirement | Source | Acceptance criteria | Status |
|---|---|---|---|---|
| R-G01 | Payment status changes only via verified webhook or signature-checked callback | SL §05 | Client POST cannot mark paid | Simulated |
| R-G02 | Stock reservation lifecycle, idempotency, expiry worker, late-payment path | MP §7 | Concurrency + replay tests | Planned |
| R-G03 | Razorpay orders created server-side; webhook verified over raw bytes | MP §7, BA §09 | Fixtures for tamper/replay | Simulated |
| R-G04 | Shiprocket booking/tracking via adapter + manual AWB fallback | UF p.2, MP §7 | No fake bookings | Simulated |
| R-G05 | Provider-backed refunds with states | MP §7 | requested/processing/completed/failed | Simulated |
| R-G06 | Transactional notifications via adapter + outbox | UF p.1, MP §7 | Preview only; no claim of real delivery | Simulated |
| R-G07 | Excel import: row cap, expected versions, chunking, audit | BA §08, MP §6 | Dry-run + row errors | Planned |

## H. Design (Master Prompt §3 + reference images)

| ID | Requirement | Source | Acceptance criteria | Status |
|---|---|---|---|---|
| R-H01 | Fixed palette tokens, Playfair Display / Montserrat / Inter | MP §3 | CSS vars + Tailwind semantic tokens | Planned |
| R-H02 | Reference images used as visual guide; sitemap/palette/typography panels inside images are annotations, not site sections | user message | Not rendered on site | Planned |
| R-H03 | No fabricated testimonials, awards, addresses, product photos | MP §3 | Reference mockup's "What Our Customers Say" and Instagram feed are NOT reproduced as fake content | Planned |
| R-H04 | Responsive 320/390/768/1440, reduced motion, WCAG contrast | MP §3, §11 | Screenshot review | Planned |
