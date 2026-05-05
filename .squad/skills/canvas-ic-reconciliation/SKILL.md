---
name: "canvas-ic-reconciliation"
description: "Cross-service reconciliation of IC missing assignments against Canvas submission status"
domain: "academic-tracking, cross-service-orchestration"
confidence: "high"
source: "earned"
---

## Context

Infinite Campus (IC) is the district's system of record for grades. Canvas is the LMS where students submit assignments and teachers grade them. There is a propagation delay between the two systems:

1. Student submits an assignment in Canvas.
2. Teacher grades the submission in Canvas.
3. The grade eventually syncs from Canvas to IC (hours to days).

As a result, IC may show assignments as "missing" when they are actually:
- **Submitted but ungraded** in Canvas (turned in, teacher hasn't graded yet)
- **Graded but not yet synced** to IC (teacher graded, IC hasn't updated yet)
- **Truly missing** (student never submitted in Canvas either)

This skill orchestrates both the IC and Canvas MCP servers to classify each IC "missing" assignment into one of these buckets.

## Prerequisites

- IC MCP server is running with valid session credentials
- Canvas MCP server is running with valid API token
- Both servers observe the same student

## Reconciliation Workflow

### Step 1: Fetch IC Missing Assignments

Call the IC `get_assignments` tool with `filter: "missing"`:

```
get_assignments({ filter: "missing" })
```

This returns all assignments IC considers missing. Each has:
- `courseName` — the IC course name
- `title` — the assignment title
- `dueDate` — when it was due
- `isMissing: true`

### Step 2: Fetch Canvas Courses

Call the Canvas `get_courses` tool to get the full course list:

```
get_courses()
```

### Step 3: Map IC Courses to Canvas Courses

Match IC course names to Canvas course names using conservative heuristics:

1. **Exact match** (case-insensitive, trimmed)
2. **Prefix/substring match** — IC often uses abbreviated names (e.g., "ELA" vs "ELA Honors 7")
3. **Common word overlap** — tokenize both names, count shared tokens (ignore "7", "8", "honors", "period", section numbers)

Rules:
- Require at least 2 shared meaningful tokens OR a substring match of 4+ characters
- If multiple Canvas courses match an IC course, flag the mapping as **ambiguous** — do NOT force a match
- Track unmatched IC courses separately as **unmappable**

### Step 4: Fetch Canvas Assignments for Matched Courses

For each successfully mapped Canvas course, call:

```
get_assignments({ courseId: "<canvas_course_id>" })
```

This returns assignments with full submission status (`submissionStatus` field):
- `"submitted"` — turned in, not yet graded
- `"graded"` — turned in and graded
- `"missing"` — Canvas also considers it missing
- `"pending"` — not due yet or no submission record
- `"excused"` — teacher excused the student
- `"late"` — turned in late (may or may not be graded)

### Step 5: Match IC Assignments to Canvas Assignments

For each IC missing assignment, find the best Canvas match within the mapped course:

**Matching heuristics** (in priority order):
1. **Exact title match** (case-insensitive, trimmed)
2. **Normalized title match** — strip punctuation, collapse whitespace, compare
3. **Fuzzy title + due date** — title tokens overlap ≥ 60% AND due dates within ±1 calendar day

Rules:
- If multiple Canvas assignments match, pick the one closest in due date
- If no match is found, classify as **unmatched** (not "truly missing" — it might use a different name)
- Never force a 1:1 match when confidence is low

### Step 6: Classify Each IC Missing Assignment

For each matched pair, determine status:

| Canvas `submissionStatus` | Classification | Meaning |
|---|---|---|
| `"submitted"` | **Submitted, ungraded** | Student turned it in; waiting on teacher |
| `"graded"` | **Graded, not synced** | Teacher graded; IC hasn't picked it up yet |
| `"late"` + has score | **Graded late, not synced** | Late but graded; IC sync pending |
| `"late"` + no score | **Submitted late, ungraded** | Turned in late; teacher hasn't graded |
| `"missing"` | **Truly missing** | Both systems agree it's missing |
| `"pending"` | **Likely truly missing** | Canvas has no submission record |
| `"excused"` | **Excused (IC may be stale)** | Teacher excused but IC still shows missing |
| No Canvas match | **Unmatched** | Could not find corresponding Canvas assignment |

### Step 7: Present Results

Group results by classification:

1. **✅ Submitted but ungraded** — No parent action needed; grade will flow to IC after teacher grades
2. **✅ Graded, awaiting IC sync** — No action needed; will appear in IC soon
3. **⚠️ Truly missing** — Student needs to submit this work
4. **⚠️ Unmatched** — Could not find in Canvas; may need manual verification
5. **ℹ️ Excused** — Teacher excused; IC may update on its own

For each item, show: IC course name, assignment title, due date, and (if matched) the Canvas submission date and any score.

## Anti-Patterns

- **Forcing matches when ambiguous** — better to say "unmatched" than misclassify
- **Treating "unmatched" as "truly missing"** — the assignment might exist under a different name
- **Ignoring course mapping failures** — if an IC course can't be mapped to Canvas, report it clearly
- **Running reconciliation on completed/archived courses** — filter to active courses only

## Edge Cases

- **IC shows 0 missing** — reconciliation is unnecessary; report "all clear"
- **Canvas API returns no assignments for a course** — the teacher may not use Canvas for that class; flag as "Canvas not in use for this course"
- **Same assignment name appears multiple times** — use due date as tiebreaker; if still ambiguous, flag
- **IC course has no Canvas equivalent** — some IC courses (study hall, advisory) don't exist in Canvas

## Example Output Format

```
## Assignment Reconciliation Report

### ✅ Submitted, Awaiting Grade (3)
- Math 7 / "Unit 9 Quiz" (due 5/5) → submitted in Canvas 5/4 at 12:10 PM
- ELA Honors / "Essay Draft" (due 5/9) → submitted in Canvas 5/8 at 3:45 PM
- Science / "Lab Report" (due 5/2) → submitted late in Canvas 5/3 at 11:00 AM

### ✅ Graded, Awaiting IC Sync (1)
- Math 7 / "Chapter 8 HW" (due 4/28) → graded in Canvas: 85% (graded 5/1)

### ⚠️ Truly Missing (2)
- ELA Honors / "Vocabulary Week 12" (due 5/1) → missing in both IC and Canvas
- Art & Design / "Sketch Portfolio" (due 4/25) → no submission in Canvas

### ⚠️ Unmatched (1)
- Science / "Mystery Assignment" (due 5/3) → no matching Canvas assignment found

### ℹ️ Course Mapping Issues
- "Advisory" has no Canvas equivalent (likely non-academic)
```
