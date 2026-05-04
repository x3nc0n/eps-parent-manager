# Canvas LMS MCP Server

Typed MCP server for Canvas LMS parent workflows at Edmond Public Schools.

## What it exposes

### Tools
- `health_check`
- `get_courses`
- `get_assignments`
- `get_upcoming`
- `get_grades`
- `get_submissions`
- `get_calendar`
- `get_announcements`

### Resources
- `canvas://courses`
- `canvas://assignments/upcoming`
- `canvas://calendar/week`

### Prompt
- `canvas_weekly_checkin`

## Requirements

- Node.js 18+
- A Canvas API token from the parent's Canvas account
- Your Canvas base URL, such as `https://edmondschools.instructure.com`

## How parents can get a Canvas API token

1. Sign in to Canvas in a web browser.
2. Open **Account**.
3. Open **Settings**.
4. In **Approved Integrations**, choose **+ New Access Token**.
5. Give the token a label like `EPS Parent Manager`.
6. Copy the token and save it somewhere safe right away. Canvas may not show it again.

If the parent account observes more than one student, this server can auto-prompt through tool arguments, or you can set a default student with `CANVAS_OBSERVED_USER_ID`.

## Environment variables

Required:

- `CANVAS_BASE_URL` — Full Canvas URL for the district
- `CANVAS_API_TOKEN` — Parent or student Canvas API token

Optional:

- `CANVAS_OBSERVED_USER_ID` — Default observed student ID when one parent account is linked to multiple students

## Install

```bash
cd mcp-servers/canvas
npm install
npm run build
```

## Example MCP client configuration

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": [
        "/absolute/path/to/eps-parent-manager/mcp-servers/canvas/dist/index.js"
      ],
      "env": {
        "CANVAS_BASE_URL": "https://edmondschools.instructure.com",
        "CANVAS_API_TOKEN": "paste-token-here"
      }
    }
  }
}
```

If the parent account is linked to multiple students, add `CANVAS_OBSERVED_USER_ID` to that `env` block or pass `observedUserId` directly to tools.

## Notes

- The server uses Canvas bearer-token authentication.
- IDs are requested as strings to avoid JavaScript precision problems.
- Pagination follows Canvas `Link` headers automatically.
- When Canvas rate-limit headers get low, the client slows down and retries `429` responses.
