# Progress

**Current milestone:** M1 complete → M2 in progress (scaffold, design system, shells, homepage)
**Last updated:** 2026-10-04

## Done
- M1: Read master prompt + all five PDFs (de-duplicated), viewed homepage reference. Wrote REQUIREMENTS.md, ROUTES.md, DECISIONS.md.
- Verified current docs: Firebase App Hosting framework support (Next 13.5–15.x listed, 16 not), Next 16 proxy convention, Razorpay webhook signature, Shiprocket webhook token mechanism.
- Toolchain present: Node 24.13, npm 11.6, Java 25, Python 3.14, pdftotext. `firebase-tools` not global (use devDependency via npx).

## In progress
- M2 scaffold.

## Failing checks
- none yet

## Blockers (need owner, none stop local work)
- Real contact details, WhatsApp number, legal entity/GSTIN/grievance officer, product photography, Razorpay / Shiprocket / Anthropic / messaging credentials, Firebase project.
- Note: the user's message called the image folder `design-references`; the actual folder is `reference image/` (used as-is, not renamed).

## Exact next action
Scaffold Next.js 15.5 + Tailwind 4 + TS strict in this folder (manual, non-empty folder), commit design tokens, build homepage.
