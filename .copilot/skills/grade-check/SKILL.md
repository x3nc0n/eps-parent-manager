---
name: "grade-check"
description: "Answer parent questions about grades from the local Obsidian vault"
domain: "obsidian-vault"
confidence: "high"
source: "manual"
---

## What question does this answer?
- How are my kids doing?
- What's [child]'s grade in math?
- Which classes need attention right now?

## Required data contract
- Search `vault/Grades/**/*.md` and `vault/Students/*/Grades/**/*.md`.
- Use notes with `type: grade-report`.
- Treat frontmatter as the primary query surface: `student-name`, `course`, `term`, `date`, `grade-letter`, `grade-percent`, `source`.

## Query strategy
1. Filter to the requested student; if none is provided, group all matching notes by `student-name`.
2. Filter by `course` or `term` when the prompt names a class or grading period.
3. Prefer the newest `date` for each student/course pair.
4. Use note body details only to explain the snapshot or missing-work context.

## Response guidelines
- Lead with the current grade snapshot.
- Call out stale data if the newest note is old.
- When multiple classes are involved, present one short line per course.
- If no matching notes exist, say which vault path or field is missing.
