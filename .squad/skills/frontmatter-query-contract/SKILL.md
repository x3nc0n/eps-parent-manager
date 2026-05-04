---
name: "frontmatter-query-contract"
description: "Use YAML frontmatter as the stable query interface for Obsidian-based data layers"
domain: "data-modeling"
confidence: "high"
source: "extracted during vault schema design for EPS Parent Manager"
---

## Context
When markdown notes are the persistence layer, the note body should stay human-friendly and the frontmatter should carry the machine-queryable contract. Skills, sync jobs, and dashboards become much simpler when every note type shares a small common key set.

## Patterns

### Shared keys first
Every note type should expose a common minimum contract:
- `type`
- `student-name`
- `source`
- `date`

Put note-specific keys after the shared contract so skills can filter quickly.

### One note per discrete record
Store one assignment, one attendance entry, or one grade snapshot per note. This avoids merge conflicts, keeps note history readable, and makes time-window queries reliable.

### Canonical folders plus dashboard folders
Write synced records into canonical collection folders first. Use per-person folders for dashboards, links, and optional mirrored views rather than as the only storage location.

### Query frontmatter before bodies
Skills should narrow results with frontmatter fields first, then read note bodies only for explanation or context.

## Anti-Patterns
- Burying query-critical fields only in prose
- Mixing multiple assignments or attendance events into one note
- Hardcoding personal names into reusable skill definitions
- Using inconsistent field names across note types
