# Squad Team

> eps-parent-manager — A parent toolkit for Edmond Public Schools. MCP servers, Copilot skills, and Obsidian-based local memory for managing grades, events, and assignments from Infinite Campus, Canvas, and Google.

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Mikey | Lead | `.squad/agents/mikey/charter.md` | 🏗️ Active |
| Data | Integration Dev | `.squad/agents/data/charter.md` | 🔧 Active |
| Mouth | Data Engineer | `.squad/agents/mouth/charter.md` | 📊 Active |
| Chunk | Tester | `.squad/agents/chunk/charter.md` | 🧪 Active |
| Scribe | Session Logger | `.squad/agents/scribe/charter.md` | 📋 Active |
| Ralph | Work Monitor | — | 🔄 Monitor |
| @copilot | Coding Agent | `copilot-instructions.md` | 🤖 Active |

<!-- copilot-auto-assign: true -->

### @copilot Capability Profile

| Category | Fit | Notes |
|----------|-----|-------|
| Single-file bug fixes | 🟢 | Straightforward fixes with clear scope |
| Multi-file refactors | 🟡 | May need guidance via issue description |
| New MCP server scaffolding | 🟡 | Can scaffold with good issue spec |
| Test writing | 🟢 | Good at generating test cases from specs |
| Architecture decisions | 🔴 | Route to Mikey |
| Obsidian vault/skill design | 🔴 | Route to Mouth |

## Project Context

- **Owner:** John Spaid
- **Project:** eps-parent-manager — Parent toolkit for Edmond Public Schools
- **Stack:** TypeScript/Node.js (MCP servers), Obsidian (local memory vault), GitHub Copilot (skills/extensions)
- **Created:** 2026-05-04
- **Data Sources:** Infinite Campus (grades/attendance), Canvas (LMS/assignments), Google (Drive/Sheets/Classroom)
- **Key Principle:** PII stays local (Obsidian vault) — repo is shareable with other EPS parents
