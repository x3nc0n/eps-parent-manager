# Infinite Campus MCP Server

Parent-friendly MCP server for reading student data from the Infinite Campus parent portal.

## What it exposes

### Tools
- `health_check` — verify Infinite Campus connectivity and login
- `get_grades` — current grades by student, term, or quarter
- `get_attendance` — attendance records
- `get_schedule` — class schedule
- `get_assignments` — assignment details and scores
- `get_report_card` — report card data

### Resources
- `student://profile` — default student profile
- `student://grades/current` — current grades for the default student

## Required environment variables

```bash
export IC_BASE_URL="https://your-district.infinitecampus.org"
export IC_USERNAME="parent-portal-username"
export IC_PASSWORD="parent-portal-password"
```

## Optional environment variables

```bash
export IC_DEFAULT_STUDENT_ID="123456"
export IC_DEFAULT_STUDENT_NAME="Student Name"
export IC_LOGIN_PAGE_PATH="/campus/portal/parents"
export IC_LOGIN_PATH="/campus/portal/parents"
export IC_API_BASE_PATH="/campus/resources/portal"
export IC_SESSION_TTL_MS="1500000"
```

Use the optional values only if your district portal uses different routes or you want resources to target a specific child by default.

## Install

```bash
cd mcp-servers/infinite-campus
npm install
npm run build
```

## Run standalone

```bash
node dist/index.js
```

Or with `npx` from the server folder:

```bash
npx --yes .
```

## Example MCP client config

```json
{
  "mcpServers": {
    "infinite-campus": {
      "command": "node",
      "args": ["/absolute/path/to/eps-parent-manager/mcp-servers/infinite-campus/dist/index.js"],
      "env": {
        "IC_BASE_URL": "https://your-district.infinitecampus.org",
        "IC_USERNAME": "parent-portal-username",
        "IC_PASSWORD": "parent-portal-password"
      }
    }
  }
}
```

## Notes for parents

- Infinite Campus often uses session-based login and district-specific page layouts.
- This server tries JSON endpoints first, then falls back to portal-page scraping.
- The scraping layer includes clear TODO markers where Edmond-specific selectors may need to be tightened after capturing real portal HTML.
- If the server says it cannot connect, first verify your URL, username, and password.
- If login works but grades or attendance do not load, your district may use different page routes; set the optional route overrides above.
