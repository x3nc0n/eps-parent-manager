---
name: "weekly-digest"
description: "Generate a parent-friendly weekly school summary from the local vault"
domain: "obsidian-vault"
confidence: "high"
source: "manual"
---

## What question does this answer?
- Give me a weekly summary.
- What happened at school this week?
- What should I pay attention to before next week?

## Required data contract
- Prefer `vault/Reports/**/*.md` and `vault/Students/*/Reports/**/*.md` notes with `type: weekly-digest`.
- If no digest note exists, synthesize from `grade-report`, `assignment`, and `attendance-log` notes in the requested week.
- Use frontmatter keys `student-name`, `date`, `week-start`, `week-end`, `source`, plus the source note frontmatter for supporting details.

## Query strategy
1. Look for the newest matching `weekly-digest` note first.
2. If absent, gather the week's grade, assignment, and attendance notes.
3. Group findings by `student-name`.
4. Convert raw records into three buckets: wins, follow-up items, and calendar pressure.

## Response guidelines
- Keep the answer parent-readable and short.
- Call out urgent follow-up items before neutral updates.
- Include source-backed details only when they help the parent act.
- Be explicit when the digest is synthesized instead of pulled from a saved weekly note.
