---
name: "upcoming-work"
description: "Answer parent questions about due dates, missing work, and assignment status"
domain: "obsidian-vault"
confidence: "high"
source: "manual"
---

## What question does this answer?
- What's due this week?
- Any missing assignments?
- What still needs to be turned in for [child]?

## Required data contract
- Search `vault/Assignments/**/*.md` and `vault/Students/*/Assignments/**/*.md`.
- Use notes with `type: assignment`.
- Query frontmatter keys: `student-name`, `course`, `due-date`, `status`, `score`, `date`, `source`.

## Query strategy
1. Start with assignments whose `status` is `pending` or missing a `score`.
2. Filter by date window using `due-date`.
3. Group by `student-name`, then `course`.
4. Use note body details for submission links or teacher instructions only after frontmatter filtering.

## Response guidelines
- Sort by earliest `due-date` first.
- Highlight overdue work separately from upcoming work.
- Name the student on every grouped section.
- If everything is clear, say so plainly.
