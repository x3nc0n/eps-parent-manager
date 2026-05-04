# Active Sources

Use this file to record which local MCP servers are feeding the vault.

| source | enabled | note types | canonical folders | notes |
| --- | --- | --- | --- | --- |
| ic | yes | `grade-report`, `attendance-log`, calendar events | `Grades/`, `Attendance/`, `Calendar/` | Infinite Campus snapshots and attendance records |
| canvas | yes | `assignment`, `grade-report`, calendar events | `Assignments/`, `Grades/`, `Calendar/` | LMS assignments, submissions, and grade details |
| google | yes | `student-note`, `weekly-digest`, calendar events | `Calendar/`, `Reports/` | Workspace summaries, teacher communications, shared schedules |

## Local Rules
- Keep personal vault content in `vault/` only.
- Keep repo templates generic and family-safe.
- Add or disable sources here before enabling new sync jobs.
