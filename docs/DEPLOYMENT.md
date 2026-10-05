# Deployment guide (prepared, NOT performed)

Nothing in this repository has been deployed, no cloud project was created, and no billing was enabled. This is the runbook for when the owner
decides to go live. Every step that creates paid infrastructure or touches live data needs the owner's explicit approval.

## 0. Version and platform notes
- Next.js **15.5.x** on **Firebase App Hosting** (Cloud Run + Cloud Build). Node 22+ (`engines`). Firebase's supported-framework page lists 13.5-15.x; Next 16 is not listed
  (docs/DECISIONS.md D-01). App Hosting requires the **Blaze** (pay-as-you-go) plan - a billing decision for the owner.
- Region: Firestore `asia-south1` (Mumbai) is the plan; **confirm with the owner before provisioning** - a Firestore location cannot be changed later.
- Firestore **Standard edition** (not Enterprise): choose it explicitly when creating the database.

## 1. Create the Firebase project (owner action)
1. Firebase console -> add project (no Analytics needed) -> upgrade to Blaze.
2. Build -> Firestore Database -> Create database -> **Standard**, location `asia-south1`, production mode (rules below deny everything by default).
3. Build -> Storage -> Get started (same region).
4. Build -> Authentication -> Sign-in method: enable **Email/Password** and **Phone**. Settings -> Password policy: min length 8, require upper/lower/numeric (matches the app's validation).
   Authentication -> Settings -> Authorized domains: add the production domain (and the `*.web.app` App Hosting domain while testing).
   Authentication -> Templates: set the **password reset action URL** to `https://<domain>/forgot-password` so the emailed link opens the in-app reset page.
5. Phone sign-in uses SMS (cost per message, region allow-list - restrict to India). Keep reCAPTCHA enabled; optionally enable App Check later (it is an abuse-reduction layer, not authorisation; verify web phone-auth support at that time).
6. Project settings -> add a Web app; copy the **public** config into `apphosting.yaml` `env` (`NEXT_PUBLIC_FIREBASE_*`).

## 2. Deploy rules and indexes
```powershell
npx firebase-tools@latest login
npx firebase-tools@latest use <project-id>
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes,storage
```
`firestore.rules` / `storage.rules` deny all client writes (docs/DECISIONS.md D-07..D-11) - they are tested by `npm run test:rules`.
`firestore.indexes.json` holds every composite index the queries need (the emulator does not enforce indexes, so run `deploy --only firestore:indexes` and wait for them to build **before** traffic;
a missing index shows as a `FAILED_PRECONDITION` error with a console link). It also declares TTL policies for `rateLimits.expiresAt` and `idempotencyKeys.expiresAt`.
`rateLimits.expiresAt` / `idempotencyKeys.expiresAt` are now written as Firestore Timestamps (required by TTL). Documents written by earlier builds hold ISO strings and will never be deleted by the policy; convert them with the bounded, resumable, dry-run-first migration BEFORE enabling the policy (it is not needed on a fresh project):
```powershell
npm run migrate:ttl                       # dry run on the local emulator
# against a real project - owner authorisation required, back up first (scheduled backup or export):
$env:CONFIRM_TTL_MIGRATION="<project-id>"
npm run migrate:ttl -- --project-id=<project-id> --allow-cloud            # dry run
npm run migrate:ttl -- --project-id=<project-id> --allow-cloud --commit   # repeat with --collection=... --after=<cursor> until no cursor is printed
```
TTL deletion is delayed cleanup (typically within a day or more); it is not access control and not any record's business expiry.
Also enable a TTL policy for `webhookReceipts` only if you want them to expire (they are permanent by default - keep at least 90 days).

## 3. Secrets (never typed into git or the console UI of the repo)
```powershell
npx firebase-tools@latest apphosting:secrets:set razorpay-key-secret
npx firebase-tools@latest apphosting:secrets:set razorpay-webhook-secret
npx firebase-tools@latest apphosting:secrets:set shiprocket-email
npx firebase-tools@latest apphosting:secrets:set shiprocket-password
npx firebase-tools@latest apphosting:secrets:set shiprocket-webhook-token
npx firebase-tools@latest apphosting:secrets:set anthropic-api-key
npx firebase-tools@latest apphosting:secrets:set job-secret          # long random string
npx firebase-tools@latest apphosting:secrets:set order-token-secret  # long random string
```
`apphosting.yaml` already maps these names to environment variables. Non-secret values to fill in `apphosting.yaml`: `NEXT_PUBLIC_SITE_URL`, the public Firebase config,
`NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_ID`, `ANTHROPIC_MODEL` (take the current id from Anthropic's models page - never guess), `SHIPROCKET_PICKUP_LOCATION`.
`APP_ENV=production` and `INTEGRATION_MODE=live` are already set: **the server refuses to start in production in simulated mode or with emulator hosts**, so a mis-deploy cannot silently fake payments.
Admin SDK credentials come from the App Hosting runtime service account (Application Default Credentials); do not create or commit a key file.

## 4. Create the backend and deploy
```powershell
npx firebase-tools@latest apphosting:backends:create --project <project-id>   # or use firebase.json's backendId: raj-raani-web
npx firebase-tools@latest deploy --only apphosting
```
Check the build log for `next build`; the build needs network access for `next/font/google`.

## 5. Grant the first administrator (trusted machine only)
Create the owner's account through `/register` (or in the Firebase console), then:
```powershell
$env:NEXT_PUBLIC_FIREBASE_PROJECT_ID="<project-id>"
$env:GOOGLE_APPLICATION_CREDENTIALS="<path to a short-lived credential, outside the repo>"   # or run `gcloud auth application-default login`
npm run make-admin -- owner@example.com --project-id=<project-id>
```
The script preserves other claims and revokes existing sessions; the owner signs in again and `/login` sends them to `/admin`. Revoke with `--revoke`.

## 6. Provider callbacks
- **Razorpay**: Dashboard -> Webhooks -> URL `https://<domain>/api/webhooks/razorpay`, secret = `razorpay-webhook-secret`, events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`.
  Start in **Test mode** with test keys; run through docs/TEST_REPORT.md section "Needs real services" before switching to live keys.
- **Shiprocket**: Settings -> API -> Webhooks -> URL `https://<domain>/api/webhooks/courier` (a neutral alias of `/api/webhooks/shiprocket`, because Shiprocket advises that webhook URLs must not contain "shiprocket"/"sr"/"kr"),
  security token = `shiprocket-webhook-token` (sent as the `x-api-key` header). The adapter's booking calls (`src/server/providers/shipping.ts`) have **not** been run against a live account. Before relying on them, in a Shiprocket sandbox/staging account verify: order creation + AWB assignment, the behaviour of a repeated create/assign for the same order, `GET /orders/show/{id}` (used to attach an existing booking; its response shape was taken from public documentation), and serviceability/pincode checks. Set the standard parcel size and packaging weight in Admin > Settings > Courier parcel first; live booking refuses without them.
- **Messaging**: no vendor is implemented. Live mode marks customer messages `unavailable` (visible in Admin > Settings and the integration status) until an adapter for the owner's chosen vendor is added (`src/server/providers/messaging.ts`, contract tests in `tests/integration/messaging.test.ts`) and `MESSAGING_PROVIDER` is set.

## 7. Scheduled jobs (Cloud Scheduler -> HTTPS, `Authorization: Bearer <job-secret>`)
| Job | Schedule | URL | Why |
|---|---|---|---|
| expire | every 5 min | `POST https://<domain>/api/jobs/expire` | release stock held by unpaid orders (the hold is also re-checked on every payment) |
| outbox | every 2 min | `POST .../api/jobs/outbox` | deliver queued notifications |
| reconcile | every 15 min | `POST .../api/jobs/reconcile` | recover lost payment webhooks/callbacks |
| refunds | every 5 min | `POST .../api/jobs/refunds` | re-check refunds stuck `processing` against the provider; applies only verified outcomes (docs/DECISIONS.md D-32) |
| purge | daily | `POST .../api/jobs/purge` | assistant-conversation retention |
Use a scheduler service account/secret header; jobs are idempotent and safe to overlap. `npm run jobs:*` runs the same code locally.

## 8. Domain, headers, caching
Connect the custom domain in App Hosting, then set `NEXT_PUBLIC_SITE_URL`. Security headers (CSP, HSTS, frame/sniff/referrer policies) come from `next.config.ts`; the CSP currently allows inline scripts (docs/DECISIONS.md D-22) - consider a nonce-based CSP before launch.
Catalogue/settings reads are cached for 60 s in production and invalidated on admin edits.

## 9. Backups, restore, rollback
- **Backups**: Firestore -> Disaster recovery -> scheduled backups (daily, retention per owner policy). Also enable PITR if desired. **Practise a restore into a separate test project before launch**; a backup nobody has restored is a guess.
- **Storage**: enable object versioning or a bucket backup for `products/` and `categories/`.
- **App rollback**: App Hosting keeps previous rollouts - roll back from the console (Rollouts) or `firebase apphosting:rollouts:create` to a previous build. Data migrations in this app are additive; there are none yet.
- **Rules rollback**: redeploy the previous `firestore.rules` from git (`git revert`).
- **Incident**: if payment or account fraud is reported: disable the checkout by setting settings COD off and rotating `razorpay-*` secrets; revoke sessions with `make-admin --revoke`/`revokeRefreshTokens`; decide in advance who notifies customers and the Data Protection Board (DPDP Act).

## 10. Go-live checklist (all must be true)
- [ ] OWNER_SETUP.md items done (legal identity, grievance officer, contact, policies reviewed by a professional, GSTIN/invoice rules)
- [ ] Real product photography uploaded; demo products removed or unpublished (`isDemo`)
- [ ] Razorpay **test-mode** end-to-end (success/failure/refund/webhook retry) passed, then live keys; Shiprocket pickup tested with a real parcel
- [ ] Messaging provider chosen and wired (otherwise customers get no confirmations)
- [ ] Rules + indexes deployed; scheduled jobs running; backup restore rehearsed
- [ ] `npm audit` reviewed (docs/TEST_REPORT.md); dependencies updated
- [ ] Admin account claim granted; no demo accounts exist in the production Auth project (the seed refuses non-emulator targets)
