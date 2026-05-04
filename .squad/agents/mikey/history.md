# Project Context

- **Owner:** John Spaid
- **Project:** eps-parent-manager — Parent toolkit for Edmond Public Schools
- **Stack:** TypeScript/Node.js (MCP servers), Obsidian (local memory vault), GitHub Copilot (skills)
- **Data Sources:** Infinite Campus (grades/attendance), Canvas (LMS/assignments), Google (Drive/Sheets/Classroom)
- **Key Principle:** PII stays local (Obsidian vault) — repo is shareable
- **Created:** 2026-05-04

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-05-04 — Bootstrap Architecture Decision
- **Pattern chosen:** "Degit + Layer Cake" — tarball download + manifest-based file overlay for updates. No upstream git remote = no PII leak vector.
- **Two layers:** Template (updatable, git-tracked) vs Personal (never overwritten, gitignored). Manifest file (`scripts/template-manifest.txt`) is the source of truth for what's safe to overwrite.
- **Cross-platform:** Dual scripts — `setup.sh` (bash) and `setup.ps1` (PowerShell). Same logic, native to each OS.
- **Vault strategy:** `vault-template/` seeds structure on first run. After that, vault is parent-owned. Symlink option for existing vaults.
- **Key paths:** `scripts/setup.sh`, `scripts/setup.ps1`, `scripts/template-manifest.txt`, `vault-template/`, `config/personal.yaml.example`, `.env.example`
- **User preference (John):** Wants other parents to have zero-friction install. No forks, no developer tooling assumptions. "Works at 6am before the bus" is the bar.
- **Decision file:** `.squad/decisions/inbox/mikey-bootstrap-architecture.md`
