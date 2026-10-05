# Raj Raani readiness fixes

This package reviews https://github.com/advit-s/website at commit `3b3ba26e7559ef2097fd372196d26eb9f073ebf6`. Fixes were verified locally and have not been pushed to GitHub. Local review commit: `f04368a`.

Contents:
- `readiness-fixes.patch`: fixes, regression tests and updated project documentation.
- `READINESS_REVIEW.md`: findings, verification and remaining blockers.
- `NEXT_STEP_CLAUDE_PROMPT.md`: paste into Claude Code after applying the patch.
- `evidence/`: independent check, emulator/build, browser-download and dependency-audit results.

## Apply in your existing clone

Extract this ZIP outside the website directory. Open a terminal in your existing website clone. Review `git status` and keep your own changes safe. Update your clone to the reviewed base if appropriate; do not discard work or overwrite conflicts.

For PowerShell, replace `C:\path\to\package` below with the extracted package path:

```powershell
git switch -c readiness-fixes
git apply --check "C:\path\to\package\readiness-fixes.patch"
git apply "C:\path\to\package\readiness-fixes.patch"
npm ci
npm run check
```

The check must succeed before applying. If it fails because your repository has changed, ask Claude Code to inspect the patch and deliberately port its changes; do not force it or replace entire files blindly.

The patch adds `docs/NEXT_STEP_CLAUDE_PROMPT.md`. Paste that prompt into Claude Code while it is opened in the website directory. It continues recovery and staging work without rebuilding the storefront.

Once reviewed, commit and push the branch yourself or through your authenticated development setup. This package does not alter the remote repository or deploy a website.

## What is verified

48 unit tests, 64 integration tests, 16 rules tests, lint, typecheck and a production build using the local demo environment passed. Browser tests could not be rerun because Chromium downloads failed. Real payment, courier, messaging, AI, cloud indexes/TTL and production deployment remain unverified. The dependency audit still reports 9 package findings. Read the review before enabling real sales.
