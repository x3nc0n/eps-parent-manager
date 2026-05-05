---
title: "📚 Step 3: Get your Canvas API token"
labels: onboarding, credentials, canvas
step: 3
---
## What this step does
This step gives the toolkit read-only-style access to Canvas data like classes, assignments, grades, announcements, and calendar items.

## Prerequisites
- You have an active Canvas parent or observer account
- You can sign in to your district's Canvas site in a browser

## Step-by-step instructions
1. Sign in to Canvas in your browser.
2. Open **Account** → **Settings**.
3. Scroll to **Approved Integrations**.
4. Click **+ New Access Token**.
5. Name it `EPS Parent Manager`.
6. Leave the expiration blank unless your district requires one.
7. Click **Generate Token**.
8. Copy the token right away.
9. Open `.env`.
10. Set `CANVAS_BASE_URL` to your district's Canvas URL.
11. Set `CANVAS_API_TOKEN` to the token you copied.
12. Save `.env`.

## AI Prompts
- "What assignments are due this week for [child's name] in Canvas? Save the answer to my vault."
- "Pull [child's name]'s current Canvas grades and store them in a course summary note in my vault."
- "Check Canvas for missing or late work for [child's name] and update my vault with an action list."
- "Get the latest Canvas announcements for [child's name]'s courses and save a parent-friendly summary in the vault."

## Acceptance criteria
- [ ] `.env` has a real `CANVAS_BASE_URL`
- [ ] `CANVAS_API_TOKEN` is no longer placeholder text
- [ ] I copied the token before leaving the Canvas page
- [ ] I know which child account I want to observe in Canvas

## Troubleshooting
- **I do not see Approved Integrations:** Make sure you are signed in as a parent or observer, not the student.
- **I closed the page before copying the token:** Generate a new token — Canvas will not show the old one again.
- **The token later shows unauthorized:** Revoke the old token, create a fresh one, and replace it in `.env`.
