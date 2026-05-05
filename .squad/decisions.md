# Squad Decisions

## Active Decisions

### Architecture Decision: Bootstrap / Install Script Mechanism

**Author:** Mikey (Lead/Architect)  
**Date:** 2026-05-04T16:19:35-05:00  
**Status:** Proposed  
**Requested by:** John Spaid

**Core Concept:** "Degit + Layer Cake" architecture separates template layer (git-tracked, updatable) from personal layer (gitignored, never overwritten). Uses cross-platform scripts (`setup.sh` / `setup.ps1`) for initial install and incremental updates via tarball overlay + manifest file list.

**Key Design Decisions:**
- Tarball over git-pull for updates (no upstream remote = no PII leaks)
- Manifest-based overlay (explicit file list beats heuristics)
- Vault-template as seed, not sync
- Version marker (`.eps-toolkit-version`) for update detection
- No git submodules or monorepo tooling (keep it simple for parents)

### Decision Note: Bootstrap Detection Guardrail

**Author:** Data  
**Date:** 2026-05-04T16:19:35-05:00  
**Status:** Proposed

**Decision:** `setup.sh` and `setup.ps1` treat install as update only when:
- caller explicitly passes `--update` / `-Update`, or
- `.eps-toolkit-version` exists **and** at least one personal-layer artifact already exists (`vault/`, `.env`, or `config/personal.yaml`)

**Rationale:** Preserves marker-based update detection without misclassifying a fresh tarball extract as already-initialized parent install.

### Decision Inbox: Vitest MCP Contract Scaffolding

**Author:** Chunk  
**Date:** 2026-05-04T17:36:11-05:00  
**Status:** Proposed

**Decision:** Use one root Vitest workspace to run MCP tests across `mcp-servers/`, with each server treated as its own package.

**Rationale:** `npm test` becomes the single local and CI command. MCP client tests stay offline by mocking fetch and fixture payloads. Server tests can land before implementation and activate automatically when each package exports its server module.

### User Directive: Automatic Onboarding Issues

**Author:** John Spaid (via Copilot)  
**Date:** 2026-05-04T18:51:06-05:00  
**Status:** Proposed

**Directive:** Onboarding issues should be created automatically when a parent runs the install script — not pre-existing in the upstream repo. Issues are orientation steps that guide the parent through setup. Each issue must include the steps to take AND example AI prompts that will get the appropriate knowledge stored in the Obsidian vault.

**Rationale:** User request — the install script is the onboarding entry point; issues are per-parent, created in their personal copy.

### User Directive: Automatic Prerequisite Installation

**Author:** John Spaid (via Copilot)  
**Date:** 2026-05-04T18:53:49-05:00  
**Status:** Proposed

**Directive:** The install script should install gh CLI, GitHub Copilot CLI, and any other related prerequisites automatically if they're not already present.

**Rationale:** User request — parents shouldn't need to manually install tooling; the setup script handles it all.

### Decision: Canvas Observed User Resolution

**Author:** Data  
**Date:** 2026-05-04T17:36:11-05:00  
**Status:** Proposed

**Decision:** The Canvas MCP server resolves the target student in this order:
1. explicit `observedUserId` tool argument
2. `CANVAS_OBSERVED_USER_ID` environment variable
3. the only linked observee returned by Canvas
4. `self` when the token owner has no observees

If multiple observees exist and no default is set, the server returns a parent-friendly configuration error instead of guessing.

**Rationale:** Canvas parent accounts may observe more than one student, while MCP resources do not accept interactive arguments. This fallback order keeps single-student setups simple, avoids wrong-student data leakage, and still supports multi-student families with explicit configuration.

### Decision: Google Workspace MCP Packaging

**Author:** Data  
**Date:** 2026-05-04T17:36:11-05:00  
**Status:** Proposed

**Decision:** The Google Workspace integration ships as its own MCP server package under `mcp-servers/google-workspace/`, with:
- refresh-token OAuth2 authentication driven entirely by environment variables
- one shared client covering Classroom, Drive, Sheets, and Calendar read-only APIs
- parent-friendly tool/resource responses that surface reconnect guidance instead of raw Google auth failures

**Rationale:** Keeps Google-specific setup isolated from Canvas and Infinite Campus work. Matches the one-server-per-data-source rule in the Data charter. Lets vault/skill layers consume a stable exported TypeScript surface for Google content.

### Decision: Infinite Campus Discovery Capture Flow

**Author:** Data  
**Date:** 2026-05-04T19:26:46.771-05:00  
**Status:** Proposed

**Decision:** The Infinite Campus recon workflow lives at the repo root as `scripts/ic-discover.ts`, runs in headed Playwright mode by default, and writes all sensitive captures into the gitignored `scripts/ic-captures/` folder.

**Rationale:** Infinite Campus login flows can require manual MFA or district-specific redirects, so headed mode is the safest default for reliable discovery. Keeping captures in one ignored folder gives Brady the raw HTML, network bodies, and endpoint summaries needed to replace guessed selectors and paths in `mcp-servers/infinite-campus/src/client.ts` without risking accidental commits of student data or session traffic.

### Decision: Infinite Campus Login Field Parity

**Author:** Data  
**Date:** 2026-05-04T19:38:12.216-05:00  
**Status:** Proposed

**Decision:** Keep the Infinite Campus login payload configurable with optional `appName` and `portalLoginPage` fields sourced from environment variables, while defaulting `appName` to `portal` so existing districts keep working unchanged.

**Rationale:** Brady already validated these two fields against another working Infinite Campus integration, so matching that behavior reduces drift between repos and avoids district-specific login failures caused by hardcoded form data. Making the fields env-driven preserves the current no-code setup model for parents while letting discovery output feed directly into production configuration when a portal expects custom values.

### Decision: Infinite Campus Connector Fallback Strategy

**Author:** Data  
**Date:** 2026-05-04T17:36:11-05:00  
**Status:** Proposed

**Decision:** The Infinite Campus MCP server uses session-cookie authentication, tries JSON/REST-style portal endpoints first, and falls back to portal-page scraping with env-overridable routes and explicit TODO markers for district-specific selectors.

**Rationale:** Infinite Campus parent portals vary by district and often do not expose a stable public API. A REST-first, scrape-second approach keeps the connector useful immediately while preserving a clean path for Edmond-specific selector hardening without putting credentials or captured portal HTML into the repository.

### Decision: Canonical Vault Collections with Student Dashboards

**Author:** Mouth  
**Date:** 2026-05-04T17:36:11-05:00  
**Status:** Proposed

**Decision:** Define the vault memory layer with canonical shared collection folders (`Grades/`, `Assignments/`, `Attendance/`, `Calendar/`, `Reports/`) plus per-student dashboard folders under `Students/<student-slug>/` for navigation and optional mirrored views.

**Rationale:** Keeps sync output predictable for skills while preserving child-level isolation for multi-student families.

### Decision Inbox: Streamer Mode Test Contracts

**Author:** Chunk  
**Date:** 2026-05-04T20:01:12-05:00  
**Status:** Proposed  
**Requested by:** John Spaid

Streamer Mode masking functions follow these behavioral contracts (enforced by spec tests in `mcp-servers/infinite-campus/tests/streamer-mode.test.ts`):

1. **Env var check is runtime, not module-load-time** — `isStreamerModeEnabled()` reads `process.env` on every call so toggling the var mid-process works correctly in tests.

2. **All mask functions are passthrough when mode is off** — calling `maskStudentProfile(profile)` with no env vars set returns the profile unchanged, making the functions safe to call unconditionally from tool handlers.

3. **Single-character last names** — a one-character last name masks to just that character (no trailing asterisks appended), preventing index-out-of-bounds on the masking logic.

4. **`raw` field stripped in streamer mode** — the `raw?: unknown` escape hatch on most records could contain full API payloads with PII; it must be removed or replaced when masking is active.

5. **Deterministic masking within a session** — same input → same masked output on every call. This ensures a demo session talks about a consistent fake student, not a randomly-shifting one.

6. **Null scores/percentages stay null** — masking a `null` percent must not substitute a fake number; the course should still appear ungraded.

### User Directive: Streamer Mode

**Author:** Brady (via Copilot)  
**Date:** 2026-05-04T19:53:48-05:00  
**Status:** Proposed

Build a "streamer mode" that hides sensitive data for demos — last names, ID numbers, actual grades, etc. should be masked/redacted when streamer mode is active.

**Rationale:** User request — Brady wants to demo the tool publicly without exposing family PII.

### Decision: Streamer Mode for Infinite Campus MCP

**Author:** Data  
**Date:** 2026-05-04T20:01:12.635-05:00  
**Status:** Proposed

Added Streamer Mode to the Infinite Campus MCP server. When `STREAMER_MODE=true` (or `EPS_STREAMER_MODE=1`) is set, all data returned by public client methods is passed through a deterministic masking layer before being handed back to the MCP tool layer.

**What Is Masked:**
- `lastName`: First letter + asterisks (`"Spaid"` → `"S****"`)
- `teacherName`: First name kept, last name masked same way
- `personId`, `studentId`, `studentNumber`: `"***REDACTED***"`
- `birthDate`: `"XXXX-XX-XX"`
- `schoolName`, `campusName`: `"Demo School"`
- `profilePhotoUrl`: Removed
- `courseId`, `sectionId`, `assignmentId`: DJB2 hex hash (`"demo-a3f2c100"`)
- `percent`, `score`, `finalPercent`, `gpa`: Seeded perturbation (same course → same fake value)
- `room`: `"Room XX"`

**What Is Preserved:** First names, course names, letter grades, attendance status types, assignment titles, date structures (non-birthdate), source metadata, overall response shape.

**Key Implementation Details:**
- **File:** `mcp-servers/infinite-campus/src/streamer-mode.ts`
- **Determinism:** DJB2 hash → seeded float → same course/student always produces the same masked value per session.
- **Boundary:** Masking is applied at the public method boundary in `client.ts` only. Internal methods (`resolveStudent`, `fetchX`) receive real data so auth and API calls work correctly.
- **Config:** `InfiniteCampusConfig.streamerMode?: boolean`; `fromEnv()` reads `STREAMER_MODE` / `EPS_STREAMER_MODE` env vars.
- **Env docs:** `.env.example` documents both env var spellings (commented out by default).

**Rationale:** "PII stays local" is a core principle. Streamer Mode is the extra safety layer for when output IS visible — demos, livestreams, screenshots. It does not depend on any vault or external service; it runs purely in-process and adds no latency beyond a cheap hash computation per field.

### Decision Inbox: Infinite Campus Edmond Endpoint Mapping

**Author:** Data  
**Date:** 2026-05-04T19:49:36.037-05:00  
**Status:** Proposed

Treat the Edmond PS Infinite Campus parent portal capture as the canonical route map for the current connector pass:
- login page `/campus/portal/parents/edmond.jsp` with POST verify at `/campus/verify.jsp`
- student roster API `/campus/api/portal/students`
- grade summary API `/campus/resources/portal/grades`
- attendance API `/campus/resources/portal/attendance/events`
- schedule-plan API `/campus/api/portal/plan`
- assignment activity endpoints under `/campus/api/portal/assignment/*`
- home-page notification selector `.notification__text` as the scrape fallback when detail pages fail or return 404

**Rationale:** The page-level captures showed the direct `instruction/*` URLs failing with 404 while the live login flow still pulled student, grade, attendance, plan, and assignment activity data through background XHR requests. Locking the connector to the observed Edmond routes removes guessed defaults from `client.ts` and gives Brady a stable baseline for future detail-endpoint discovery without re-opening the login investigation.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
