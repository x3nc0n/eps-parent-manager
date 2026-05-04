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
<!-- Append new learnings below. Each entry is something lasting about the project. -->
