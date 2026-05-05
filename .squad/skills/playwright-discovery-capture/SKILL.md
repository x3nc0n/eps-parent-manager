---
name: "playwright-discovery-capture"
description: "Use a headed Playwright recon script to capture real district portal HTML and XHR/fetch traffic for connector hardening"
domain: "integration-discovery"
confidence: "high"
source: "earned"
---

## Context
This pattern applies when a school system portal has district-specific routes, selectors, or hidden API endpoints that cannot be trusted from vendor docs alone. A one-off discovery script is safer than hardcoding guesses into production integration code because it captures the actual browser flow, payload shapes, and DOM structure.

## Patterns
- Put the recon script at the repo root when its output will directly inform multiple connector packages.
- Default to headed mode so a human can handle MFA, CAPTCHAs, or redirect weirdness while the script keeps capturing traffic.
- Load credentials from `.env` with documented optional route overrides in `.env.example`; never hardcode secrets.
- Save rendered HTML per page plus a consolidated network log and student-detection summary in a gitignored capture directory.
- Start endpoint analysis with the small per-page JSON files and `summary.json`; only grep the full network log for a specific path or parameter once the smaller artifacts narrow the question.
- Treat 403s and missing pages as data points: log them, save the page state, and continue to the next target.
- When a detail page 404s, inspect the home/dashboard notifications for real selector anchors and background XHR routes before guessing a replacement page path.

## Examples
- `scripts/ic-discover.ts` logs into Infinite Campus, walks home/grades/attendance/schedule/assignments, and writes captures into `scripts/ic-captures/`.
- `.env.example` documents `IC_LOGIN_PAGE_PATH`, `IC_LOGIN_PATH`, `IC_API_BASE_PATH`, and `IC_DISCOVERY_POST_LOGIN_TIMEOUT_MS` so district-specific paths can be retried without code changes.

## Anti-Patterns
- Guessing vendor endpoints or selectors from generic Infinite Campus examples and treating them as production-ready.
- Saving captured portal traffic in tracked files or team decision docs.
- Running discovery only in headless mode when the login flow may require human intervention.
- Aborting the whole recon run on the first failed page instead of collecting partial evidence.
