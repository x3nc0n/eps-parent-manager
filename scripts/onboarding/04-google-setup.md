---
title: "🔐 Step 4: Connect your Google account (most involved — follow carefully)"
labels: onboarding, credentials, most-complex, google
step: 4
---
## What this step does
This step connects Google Classroom, Drive, Sheets, and Calendar so your AI assistant can retrieve school content your Google account is already allowed to see and store useful notes in your vault.

## Prerequisites
- You have a Google account with access to your child's school information
- You can spend about 15–20 uninterrupted minutes on setup
- Steps 1–3 are complete

## Step-by-step instructions
1. Go to <https://console.cloud.google.com> and create a project named `EPS Parent Manager`.
2. Open **APIs & Services** → **Library**.
3. Enable these APIs one at a time: Google Classroom API, Google Drive API, Google Sheets API, and Google Calendar API.
4. Open **APIs & Services** → **OAuth consent screen**.
5. Choose **External** and create the consent screen.
6. Use `EPS Parent Manager` as the app name and add your own email as the support and developer contact.
7. Add every scope listed in `mcp-servers/google-workspace/README.md`.
8. Add your own Google account as a test user if Google asks for one.
9. Open **APIs & Services** → **Credentials**.
10. Create an **OAuth client ID** for a **Web application** named `EPS Parent Manager Local`.
11. Add `http://127.0.0.1:3000/oauth2callback` as an authorized redirect URI.
12. Copy the client ID and client secret.
13. Open `.env` and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
14. In a terminal, run:
    ```bash
    cd mcp-servers/google-workspace
    node dist/auth.js consent-url
    ```
15. Open the printed URL, approve access, and copy the value after `code=` from the browser URL.
16. Back in the terminal, run:
    ```bash
    node dist/auth.js exchange-code "paste-the-code-here"
    ```
17. Copy the refresh token that prints.
18. Save it as `GOOGLE_REFRESH_TOKEN` in `.env`.
19. Save `.env`.

## AI Prompts
- "Check Google Classroom for any new announcements for [child's name] and save them to my vault."
- "Pull upcoming Google Classroom assignments for [child's name] and store them in the vault."
- "Look for recently shared Google Drive files related to [child's name]'s classes and save a summary note in my vault."
- "Get this week's school calendar events from Google and write them to [child's name]'s vault page."

## Acceptance criteria
- [ ] `.env` has a real `GOOGLE_CLIENT_ID`
- [ ] `.env` has a real `GOOGLE_CLIENT_SECRET`
- [ ] `.env` has a real `GOOGLE_REFRESH_TOKEN`
- [ ] The Google project has the required APIs enabled
- [ ] My Google account is allowed to use the OAuth app

## Troubleshooting
- **Google says access is blocked:** Make sure your account is listed as a test user on the OAuth consent screen.
- **The browser lands on a blank page after approval:** That is expected — copy the `code=` value from the URL bar.
- **The code expires before I paste it:** Re-run the consent URL command and do the exchange again right away.
- **The refresh token stops working later:** Repeat the consent and exchange steps to generate a new one.
