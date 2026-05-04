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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
