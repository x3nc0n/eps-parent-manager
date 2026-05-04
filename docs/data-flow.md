# Data Flow

This project treats the Obsidian vault as the personal memory layer. MCP servers normalize source data locally, then write one markdown note per discrete school record into the parent's `vault/` directory. The shareable `vault-template/` directory defines the schema and folder structure; the real `vault/` contains the family's private data and is gitignored.

## Flow: MCP server -> vault note

1. A local MCP server fetches records from Infinite Campus, Canvas, or Google Workspace.
2. The sync layer maps each record into a vault note type.
3. The note is written into the canonical vault folder with YAML frontmatter.
4. Copilot skills query frontmatter first, then read note bodies for supporting detail.

### Source mapping

| source | primary records | canonical vault folders |
| --- | --- | --- |
| `ic` | course grade snapshots, attendance entries, school calendar items | `Grades/`, `Attendance/`, `Calendar/` |
| `canvas` | assignments, submission status, course grades, due dates | `Assignments/`, `Grades/`, `Calendar/` |
| `google` | calendar events, teacher comms, shared documents, rollup context | `Calendar/`, `Reports/`, `Students/` |

## Vault structure

```text
vault/
├── .obsidian/
├── _templates/
├── Students/
│   ├── _template.md
│   └── <student-slug>/
│       ├── Grades/
│       ├── Assignments/
│       ├── Attendance/
│       ├── Calendar/
│       └── Reports/
├── Grades/
├── Assignments/
├── Attendance/
├── Calendar/
├── Reports/
└── _config/
```

Top-level folders are the canonical shared collections for sync output. `Students/<student-slug>/` is the dashboard layer for child-specific navigation, links, and optional mirrored views.

## Frontmatter schema reference

Frontmatter is the query interface. Skills should filter by frontmatter before reading note content.

### Common fields

All note types use these keys:

| field | type | notes |
| --- | --- | --- |
| `type` | string | Note contract (`grade-report`, `assignment`, `attendance-log`, `weekly-digest`, `daily-summary`, `student-note`) |
| `student-name` | string | Child display name, or `family` for family-wide rollups |
| `source` | string | Usually `ic`, `canvas`, or `google`; reserved values `aggregate` and `local` are for rollups/manual notes |
| `date` | string | ISO date for the record or snapshot |

### Grade report notes

Stored in `Grades/`.

| field | type | notes |
| --- | --- | --- |
| `course` | string | Course name |
| `grade-letter` | string | Letter grade snapshot |
| `grade-percent` | number/string | Numeric grade snapshot |
| `term` | string | Reporting term |

### Assignment notes

Stored in `Assignments/`.

| field | type | notes |
| --- | --- | --- |
| `course` | string | Course name |
| `due-date` | string | ISO due date |
| `status` | string | `pending`, `submitted`, or `graded` |
| `score` | number/string | Earned score when available |

### Attendance notes

Stored in `Attendance/`.

| field | type | notes |
| --- | --- | --- |
| `date` | string | ISO attendance date |
| `status` | string | `present`, `absent`, or `tardy` |
| `period` | string | Class period or day-part |

## Skill query patterns

Skills should search generic vault paths and never hardcode child names.

- Grades: `vault/Grades/**/*.md` and `vault/Students/*/Grades/**/*.md`
- Assignments: `vault/Assignments/**/*.md` and `vault/Students/*/Assignments/**/*.md`
- Attendance: `vault/Attendance/**/*.md` and `vault/Students/*/Attendance/**/*.md`
- Weekly rollups: `vault/Reports/**/*.md` and `vault/Students/*/Reports/**/*.md`

Recommended skill behavior:

1. Filter by `type`.
2. Narrow by `student-name`, `course`, `status`, `term`, or `date`.
3. Prefer the newest note when answering point-in-time questions.
4. When multiple children are involved, group answers by `student-name`.

## PII boundaries

- `vault/` is the personal layer and may contain names, grades, schedules, attendance, and teacher communications.
- `vault-template/`, `.copilot/skills/`, `docs/`, and repo code stay generic and shareable.
- Skills may reference vault path patterns, but they must not store family-specific data in the repository.
