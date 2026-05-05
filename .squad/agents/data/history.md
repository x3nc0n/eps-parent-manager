# Project Context

- **Owner:** John Spaid
- **Project:** eps-parent-manager — Parent toolkit for Edmond Public Schools
- **Stack:** TypeScript/Node.js (MCP servers), Obsidian (local memory vault), GitHub Copilot (skills)
- **Data Sources:** Infinite Campus (grades/attendance), Canvas (LMS/assignments), Google (Drive/Sheets/Classroom)
- **Key Principle:** PII stays local (Obsidian vault) — repo is shareable
- **Created:** 2026-05-04

## Learnings

- Bootstrap/update implementation follows a manifest-driven layer split: template files come from `scripts/template-manifest.txt`, while `vault/`, `.env`, `config/personal.yaml`, and `config/schools.yaml` remain local-only.
- Installer entry points live at `scripts/install.sh` and `scripts/install.ps1`; main lifecycle logic lives in `scripts/setup.sh` and `scripts/setup.ps1` with tarball updates from `x3nc0n/eps-parent-manager`.
- First-run detection uses `.eps-toolkit-version` together with personal-layer presence so the tracked version marker does not force a fresh tarball into update mode.
- New parent scaffolding now comes from `.env.example`, `config/personal.yaml.example`, and `vault-template/` (including `.obsidian/app.json` and note templates under `vault-template/_templates/`).
- Completed implementation spike (2026-05-04T16-19). Bootstrap detection guardrail merged into `.squad/decisions.md`. Inbox cleaned. Orchestration log written. Ready for parent-facing testing.
- 2026-05-04T17:36:11-05:00: Built `mcp-servers/google-workspace/` with a refresh-token OAuth helper, parent-friendly Google error handling, MCP tools/resources for Classroom/Drive/Sheets/Calendar, and package-local TypeScript validation/build flow using increased Node heap for `googleapis` type-checking.
- 2026-05-04T17:36:11-05:00 — Built `mcp-servers/infinite-campus/` as a standalone MCP server with session-cookie login, REST-first fetches, scrape fallback hooks, parent-friendly error messages, `health_check`, and the `student://profile` / `student://grades/current` resources. Build, startup, and mock tool smoke tests passed.
- 2026-05-04T17:36:11-05:00 — Built `mcp-servers/canvas/` with a typed Canvas REST client, MCP tools/resources, pagination and rate-limit handling, and parent-facing token setup guidance.
- 2026-05-04T18:51:06-05:00 — Added `scripts/onboarding/` issue templates plus first-run GitHub issue creation in `scripts/setup.sh` and `scripts/setup.ps1`, including idempotent label creation, issue deduping, and step-one pinning when `gh` is available.
- 2026-05-04T19:26:46.771-05:00 — Added `scripts/ic-discover.ts` as a Playwright-based Infinite Campus recon flow that loads `.env`, defaults to headed mode for manual MFA handling, captures per-page HTML into `scripts/ic-captures/pages/`, and writes full network/session summaries to `scripts/ic-captures/` for selector and endpoint discovery.
- 2026-05-04T19:26:46.771-05:00 — Root dev tooling now includes `playwright`, `dotenv`, and `tsx`, with `npm run ic:discover -- [--headless]` as the repo-level entry point; `.env.example` documents the optional Infinite Campus route overrides plus `IC_DISCOVERY_POST_LOGIN_TIMEOUT_MS`, and `.gitignore` excludes `scripts/ic-captures/` because the captures contain sensitive portal traffic.
- 2026-05-04T19:38:12.216-05:00 — Merged the shared Infinite Campus login hardening from `my-family-toolkit`: `InfiniteCampusConfig` now exposes optional `appName` and `portalLoginPage`, `fromEnv()` reads `IC_APP_NAME` / `IC_PORTAL_LOGIN_PAGE`, and login form posts send those fields when configured so districts with custom portal requirements can authenticate without code changes.
- 2026-05-04T20:01:12.635-05:00 — Added `mcp-servers/infinite-campus/src/streamer-mode.ts` implementing Streamer Mode: deterministic PII masking via DJB2-seeded perturbation. Masking layer is imported by `client.ts` and applied at the boundary of every public snapshot/profile method when `STREAMER_MODE=true` or `EPS_STREAMER_MODE=1`. Internal resolution logic (resolveStudent, fetchX) is unmasked so session-cookie auth and API calls continue to work correctly. InfiniteCampusConfig gains a `streamerMode?: boolean` field; `fromEnv()` reads it via `isStreamerModeEnabled(env)`. `.env.example` documents the new env vars.
- 2026-05-05T01:13:36Z — Streamer Mode session complete. API exports validated by Chunk test suite (94/94 passing). Decisions merged: test contracts, endpoint mapping, streamer mode spec. Ready for production integration.
