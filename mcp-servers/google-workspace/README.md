# Google Workspace MCP Server

This MCP server connects Edmond Public Schools families to Google Workspace data they already have permission to see: Google Classroom, Google Drive, Google Sheets, and Google Calendar.

## What it exposes

### Tools
- `google_workspace_health_check`
- `classroom_get_courses`
- `classroom_get_assignments`
- `classroom_get_announcements`
- `drive_list_files`
- `drive_get_file`
- `sheets_read`
- `calendar_get_events`

### Resources
- `google://classroom/courses`
- `google://classroom/upcoming`
- `google://drive/recent`

## Required environment variables

Set these in your local environment or MCP host configuration:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

## Google API scopes

The server requests read-only scopes:

- `https://www.googleapis.com/auth/classroom.courses.readonly`
- `https://www.googleapis.com/auth/classroom.coursework.students.readonly`
- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/spreadsheets.readonly`
- `https://www.googleapis.com/auth/calendar.readonly`

## Setup for parents

The Google account you connect must already have access to the classroom, drive files, sheets, or calendars you want to read. If the school only shares content with a student account, the parent will need a family-approved workflow for that account before this server can see the data.

### 1. Create a Google Cloud project
1. Visit <https://console.cloud.google.com/>.
2. Create a new project, or choose an existing private family project.
3. Open **APIs & Services** → **Library**.
4. Enable these APIs:
   - Google Classroom API
   - Google Drive API
   - Google Sheets API
   - Google Calendar API

### 2. Configure the OAuth consent screen
1. Open **APIs & Services** → **OAuth consent screen**.
2. Choose **External**.
3. Fill in a simple app name like `EPS Parent Manager`.
4. Add your own email address as the support and developer contact.
5. On the scopes step, add every scope listed above.
6. Add your Google account as a **Test user** if Google asks for it.

### 3. Create OAuth client credentials
1. Open **APIs & Services** → **Credentials**.
2. Click **Create credentials** → **OAuth client ID**.
3. Choose **Web application**.
4. Name it something easy to remember, like `EPS Parent Manager Local`.
5. Add this Authorized redirect URI exactly:
   - `http://127.0.0.1:3000/oauth2callback`
6. Save the client.
7. Copy the **Client ID** and **Client secret**.

### 4. Install dependencies and build
```bash
cd mcp-servers/google-workspace
npm install
npm run build
```

### 5. Generate a consent URL
Set your client ID and secret in the shell first:

```bash
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"
export GOOGLE_REFRESH_TOKEN="placeholder"
node dist/auth.js consent-url
```

Google will print a long URL. Open it in a browser.

### 6. Approve access and copy the code
1. Sign in with the Google account that should connect to school data.
2. Approve the requested permissions.
3. Google will try to open `127.0.0.1` and may show a blank page or connection error. That is okay.
4. Copy the `code=` value from the browser address bar.

### 7. Exchange the code for a refresh token
```bash
node dist/auth.js exchange-code "paste-the-code-here"
```

The command prints a refresh token.

### 8. Save the final environment variables
```bash
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"
export GOOGLE_REFRESH_TOKEN="your-refresh-token"
```

## Local development

```bash
npm run check
npm run build
```

## Running the server

Use the compiled entry point:

```bash
node dist/index.js
```

## Parent-friendly troubleshooting

- **“Your Google connection expired — run the setup again to refresh it.”**  
  Google revoked the refresh token or the consent needs to be repeated.
- **“Google signed you in, but this connection is missing one or more permissions.”**  
  Re-run setup and approve every requested scope.
- **“This Google account does not have access to that classroom, file, sheet, or calendar item.”**  
  The connected Google account does not currently have permission to see that content.
