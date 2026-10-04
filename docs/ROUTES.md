# Canonical route inventory

35 page-route patterns = 19 storefront/account/auth + 4 legal + 12 admin (Master Prompt §4). The Sitemap PDF's "32 = 17 + 4 + 8"
is internally inconsistent (17+4+8 = 29) and omits routes its own body requires — see D-02. Route groups
(`(storefront)`, `(auth)`, `(account)`, `(legal)`, `admin`) do not change URLs.

Access levels: **Public** · **Auth** (any signed-in customer, ownership checked in handler) · **Admin** (verified session cookie + `admin` custom claim, checked in the page/action, not only the proxy) · **Scoped** (opaque token/OTP-verified).

## Storefront, auth, account

| # | Route | Access | Notes |
|---|---|---|---|
| 1 | `/` | Public | Admin-editable hero/featured/announcement |
| 2 | `/shop` | Public | `?q &category &minPrice &maxPrice &size &color &fabric &sort &page &collection=new\|bestsellers\|sale` — filters in URL |
| 3 | `/category/[slug]` | Public | Inactive/unknown → 404; includes `custom-made` |
| 4 | `/product/[slug]` | Public | Tabs: Description, Details, Size Guide, Reviews (empty state), Shipping & Returns; custom enquiry section |
| 5 | `/cart` | Public | Guest cart in browser storage; server revalidation |
| 6 | `/wishlist` | Public (persisted when signed in) | |
| 7 | `/checkout` | Public (guest OK) | One page: contact, address, shipping, payment, summary |
| 8 | `/checkout/success` | Scoped | Opaque order-access token or owner session |
| 9 | `/track-order` | Scoped | Order no. + phone/email → masked timeline; OTP/email link for private detail |
| 10 | `/about` | Public | |
| 11 | `/contact` | Public | Persists enquiry; honeypot + rate limit |
| 12 | `/faq` | Public | Accordions grouped by topic; answers sourced from policy config |
| 13 | `/login` | Public | Email/password + phone OTP; shared customer/admin; sanitized `?next=` |
| 14 | `/register` | Public | |
| 15 | `/forgot-password` | Public | Request + `oobCode` reset states |
| 16 | `/account` | Auth | Overview, profile, settings |
| 17 | `/account/orders` | Auth | Status filters |
| 18 | `/account/orders/[id]` | Auth + owner | Invoice, cancellation/return requests |
| 19 | `/account/addresses` | Auth | |

## Legal

| # | Route | Access |
|---|---|---|
| 20 | `/terms` | Public |
| 21 | `/privacy` | Public (includes cookie section; no separate cookies page) |
| 22 | `/shipping-policy` | Public |
| 23 | `/refund-policy` | Public |

## Admin

| # | Route | Access | Notes |
|---|---|---|---|
| 24 | `/admin` | Admin | Dashboard |
| 25 | `/admin/products` | Admin | List, filters, pagination |
| 26 | `/admin/products/new`, `/admin/products/[id]` | Admin | Shared editor component |
| 27 | `/admin/inventory` | Admin | Spreadsheet table, import/export |
| 28 | `/admin/categories` | Admin | List + modal |
| 29 | `/admin/orders` | Admin | `?status=` filter tabs |
| 30 | `/admin/orders/[id]` | Admin | |
| 31 | `/admin/customers` | Admin | |
| 32 | `/admin/customers/[id]` | Admin | Orders tab |
| 33 | `/admin/assistant` | Admin | Conversation / Activity / Settings tabs |
| 34 | `/admin/settings` | Admin | Sectioned |
| 35 | *Flow, not a page* | — | `/login` → verified session → claim ? `/admin` : `/account`. No `/admin/login`. |

## System routes (additional)

| Route | Access | Notes |
|---|---|---|
| `/api/webhooks/razorpay` | Signature-verified | Raw-body HMAC-SHA256, `x-razorpay-event-id` dedupe |
| `/api/webhooks/shiprocket` | Token-verified (`x-api-key`) | See D-13 |
| `/api/assistant` | Public, rate-limited | Read-only tools |
| `/api/admin/assistant` | Admin | Separate tool set |
| `/api/auth/session` (POST/DELETE) | Origin-checked | Exchange verified ID token for session cookie / clear |
| `/api/checkout/*`, `/api/orders/*`, `/api/cart/*`, `/api/pincode`, `/api/contact`, `/api/custom-enquiry` | Per-handler | Zod-validated, origin-checked |
| `/api/admin/*` | Admin | Upload, import/export, order actions |
| `/api/jobs/*` | Job secret | Reservation expiry, outbox drain, reconciliation (callable by Cloud Scheduler or `npm run jobs:*`) |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` | Public | Private paths excluded from sitemap; robots is not access control |
| 404 (`not-found.tsx`), `error.tsx`, `loading.tsx` | Public | |

External, not routes: WhatsApp click-to-chat links (`https://wa.me/…`).
