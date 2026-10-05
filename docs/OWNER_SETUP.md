# Owner setup - everything still needed before launch

The software runs locally without any of this. Each item below is something only the business owner can decide or supply.
Items marked **BLOCKER** must be done before real customers are served. Nothing here has been invented on your behalf.

## A. Business identity and legal (BLOCKERS)
Fill in **Admin -> Settings -> Legal identity**. Until then the legal pages show visible placeholders and the settings page lists what is missing.
- [ ] Registered **legal business name** and **registered address**
- [ ] **GSTIN** (if registered). Until set, invoices are titled "Order invoice" (a receipt), not a GST tax invoice. Decide GST rates/HSN per product and whether prices are tax-inclusive; the invoice
      generator then needs a tax-breakup extension (not built, because rates were not supplied).
- [ ] **Jurisdiction** (city, state) for the Terms
- [ ] **Grievance officer** name, email, postal address, phone (required by the Digital Personal Data Protection Act notice)
- [ ] **Support email**, **phone**, store **address**, **opening hours** (shown in the footer/Contact page only once set)
- [ ] **Professional review** of the four drafts (Terms, Privacy, Shipping, Refund). They are templates based on the supplied PDFs. Verify the current law (DPDP Act and rules, Consumer Protection (E-Commerce) Rules,
      payment-aggregator and GST obligations) with an advisor or the official sources before claiming compliance; no compliance claim is made in the app.
- [ ] Decide the **cookie/analytics** position if you add analytics (the app currently sets only a strictly necessary session cookie and uses browser storage for the cart).

## B. Policies and numbers (all editable in Admin -> Settings; shown values are demo defaults)
- [ ] Free-delivery threshold (demo: Rs 10,000), Delhi-NCR and rest-of-India delivery charges (demo: Rs 99 / Rs 199), heavy-piece surcharge (demo: Rs 150 per started kg above 2 kg)
- [ ] Delivery estimates (draft: NCR 1-2 days, rest of India 3-7 business days - estimates, not guarantees) and the list of **unserviceable** and **COD-blocked pincodes**
      (the app has no live serviceability lookup until Shiprocket credentials exist)
- [ ] Cash on delivery: on/off, maximum order value (demo Rs 50,000), handling fee
- [ ] Return window (draft 7 days), damage-report window (48 h), refund timeline (7-10 business days), which products are non-returnable (made-to-measure is configured as non-returnable)
- [ ] **Size chart** (`src/config/size-guide.ts` is a draft - replace with your real measurements)
- [ ] **Coupons** (Admin -> Settings -> Coupons; two demo coupons exist: `WELCOME10`, `FLAT500`)
- [ ] Stock-hold time while paying (demo 15 min) and max payment attempts (demo 3)
- [ ] Made-to-measure rules: lead times per product, how much advance you take, and your quote process (the app records quote + advance; it never auto-charges a list price)

## C. Content and imagery
- [ ] Real **product photography** for every product (alt text required), category banners, hero image, About-page photos - only images you own or have licensed; log them in docs/ASSETS.md
- [ ] Replace the Unsplash **sample photographs** (`public/photos`, credited in docs/ASSETS.md; they show unrelated models, not your products) with your own, then remove the demo products (flagged `isDemo`)
- [ ] Official **logo** file; the current wordmark is a placeholder
- [ ] **Brand story** copy (Admin -> Settings -> Homepage). Do not add awards, history, counts or reviews you cannot substantiate. The reviews tab shows an honest empty state; a reviews system was deferred by the sitemap document.
- [ ] Social media URLs (hidden until entered), WhatsApp business number in international digits (until set, every WhatsApp button leads to the Contact page, which explains the state)

## D. Accounts and credentials (none are in the repository; see docs/DEPLOYMENT.md for how to store them)
| Service | What you need | Used for |
|---|---|---|
| Firebase / Google Cloud | A project on the **Blaze** plan, Firestore **Standard** in your chosen region (plan: `asia-south1` - confirm), Auth providers Email + Phone | everything persistent |
| Razorpay | Account, KYC, **Key ID + Key Secret**, **webhook secret**; start with Test mode | online payments + refunds |
| Shiprocket | API user (email/password), pickup location name, webhook token; or keep booking manually | courier booking/tracking |
| Anthropic | API key + a **current model id** from their models page (set `ANTHROPIC_MODEL`) and a spend limit | customer + admin assistants |
| Messaging provider (**your choice - not decided in the documents**) | Options: WhatsApp Business API provider, an SMS gateway with DLT registration (India), or transactional email | order confirmations, shipping updates, tracking links. Until chosen, messages are only recorded as previews in Admin -> Settings |
| Domain + hosting | Domain name, DNS access | go-live |
| Backups | Decide retention and who restores | DPDP / business continuity |

## E. Decisions only you can make
1. **Firestore location** (Mumbai `asia-south1` is the plan; permanent once chosen).
2. **Who is the second admin/staff?** One owner account works at launch; more staff = more `make-admin` grants (all see customer data - admin is all-or-nothing).
3. **Data retention**: assistant conversations (default 365 days), order records (kept for accounting/tax - confirm the period with your accountant), what happens on an account-deletion request
   (the app does not delete orders; build the process with your advisor).
4. **Marketing consent**: the app sends no marketing and has no newsletter. If you want one, a consent flow and a vendor are needed.
5. **Whether to use Shiprocket automation or manual booking** at launch (manual booking with AWB entry works today).
6. **Custom-order payments**: the app records quotes/advances; collecting the advance online needs a verified Razorpay payment-link integration (not built - no fabricated links).
7. **Review system, lookbook, blog, comparison, appointments**: deliberately deferred by the sitemap.

## F. First-day checklist after credentials arrive
1. Deploy rules/indexes, create the backend, set secrets (docs/DEPLOYMENT.md). 2. Grant yourself admin (`make-admin`). 3. Fill Settings (A, B). 4. Upload products (C).
5. Razorpay **test** payment: success, failure, retry, refund, duplicate webhook. 6. One real low-value order end-to-end. 7. Verify backups restore. 8. Remove demo data. 9. Flip to live keys.
