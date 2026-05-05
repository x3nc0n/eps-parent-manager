# Project Context

- **Owner:** John Spaid
- **Project:** eps-parent-manager — Parent toolkit for Edmond Public Schools
- **Stack:** TypeScript/Node.js (MCP servers), Obsidian (local memory vault), GitHub Copilot (skills)
- **Data Sources:** Infinite Campus (grades/attendance), Canvas (LMS/assignments), Google (Drive/Sheets/Classroom)
- **Key Principle:** PII stays local (Obsidian vault) — repo is shareable
- **Created:** 2026-05-04

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
- 2026-05-04T17:36:11-05:00 — Added a repo-level Vitest workspace and offline MCP test scaffolding so server packages can pick up client/server/error coverage as they land.
- 2026-05-05T00:38:12Z — Decision "Vitest MCP Contract Scaffolding" merged into squad/decisions.md by Scribe.
- 2026-05-04T20:01:12-05:00 — Wrote spec tests for Streamer Mode in `mcp-servers/infinite-campus/tests/streamer-mode.test.ts` (58 test cases across 10 describe blocks). Key patterns: (1) Use `vi.stubEnv` + `afterEach vi.unstubAllEnvs()` per describe block for clean env isolation. (2) Test both `STREAMER_MODE=true` and `EPS_STREAMER_MODE=1` activation paths. (3) Masked functions are passthrough when mode is off — test both paths for critical fields. (4) Deterministic masking tested by calling the same mask function twice and asserting identical output. (5) Edge cases: minimal objects with only required fields, null/undefined optionals, empty strings, single-char last names. (6) Single-character last names should preserve just that character (no trailing asterisks). (7) Snapshot tests verify masking propagates to nested student + entry arrays. The `raw` field should be stripped/masked to prevent PII leakage via that escape hatch.
- 2026-05-05T01:13:36Z — Streamer Mode session complete. Reconciled API mismatch with Data (added passthrough guards, maskAttendanceRecord export, fixed edge cases). All 94 tests passing. Behavioral contracts captured in decisions.md.
