# Project Context

- **Owner:** John Spaid
- **Project:** eps-parent-manager — Parent toolkit for Edmond Public Schools
- **Stack:** TypeScript/Node.js (MCP servers), Obsidian (local memory vault), GitHub Copilot (skills)
- **Data Sources:** Infinite Campus (grades/attendance), Canvas (LMS/assignments), Google (Drive/Sheets/Classroom)
- **Key Principle:** PII stays local (Obsidian vault) — repo is shareable
- **Created:** 2026-05-04

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
- 2026-05-04T17:36:11-05:00 — The Obsidian memory layer works best when synced notes land in canonical collection folders first and student folders act as dashboards or mirrored child views.
- 2026-05-04T17:36:11-05:00 — Frontmatter is the stable query contract for skills; every school note should share `type`, `student-name`, `source`, and `date` before any note-specific fields.
- 2026-05-05T00:38:12Z — Decision "Canonical vault collections with student dashboards" merged into squad/decisions.md by Scribe.
