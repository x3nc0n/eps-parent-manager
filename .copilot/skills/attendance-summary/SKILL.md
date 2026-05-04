---
name: "attendance-summary"
description: "Answer parent questions about attendance trends and recent absences"
domain: "obsidian-vault"
confidence: "high"
source: "manual"
---

## What question does this answer?
- How's attendance looking?
- Any absences this month?
- Was [child] tardy this week?

## Required data contract
- Search `vault/Attendance/**/*.md` and `vault/Students/*/Attendance/**/*.md`.
- Use notes with `type: attendance-log`.
- Query frontmatter keys: `student-name`, `date`, `status`, `period`, `source`.

## Query strategy
1. Filter by `student-name` when requested.
2. Filter by date window next.
3. Separate `absent` and `tardy` records from `present` records before summarizing.
4. Use note body details for explanations such as reason or excused status.

## Response guidelines
- Report counts first, then notable dates.
- Group by student for family-wide questions.
- Mention repeated periods or patterns when visible.
- If attendance is clean, say there are no absences or tardies in the requested window.
