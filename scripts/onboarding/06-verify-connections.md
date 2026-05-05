---
title: "✅ Step 6: Verify everything is connected and working"
labels: onboarding, verification
step: 6
---
## What this step does
This step confirms your school connections work before you rely on them. It is the quick proof that the toolkit can retrieve real data and store useful notes in your vault.

## Prerequisites
- Steps 2–5 are complete
- Your AI assistant is configured to use the toolkit's MCP servers

## Step-by-step instructions
1. Open your AI assistant.
2. Ask it to run a health check for Infinite Campus.
3. Ask it to run a health check for Canvas.
4. Ask it to run a health check for Google Workspace.
5. If a check fails, reopen the matching setup issue and fix the credentials or IDs.
6. After all health checks pass, ask the assistant to pull one real item from each connected system and save the results into your vault.

## AI Prompts
- "Run a health check on Infinite Campus, Canvas, and Google Workspace, then save the results in an integration-status note in my vault."
- "Pull one fresh grade, one upcoming assignment, and one recent school announcement for [child's name], then save everything to my vault."
- "Verify that all school connections are working for [child's name] and write a parent-friendly setup summary into the vault."

## Acceptance criteria
- [ ] Infinite Campus health check passes
- [ ] Canvas health check passes
- [ ] Google Workspace health check passes
- [ ] At least one real data pull has been saved in my vault
- [ ] I know which setup step to revisit if something breaks later

## Troubleshooting
- **Infinite Campus fails but the username and password look right:** Double-check `IC_BASE_URL` and the student IDs in `config/personal.yaml`.
- **Canvas fails with unauthorized:** Create a fresh token and replace `CANVAS_API_TOKEN`.
- **Google fails with token or permissions errors:** Repeat the Google consent flow and make sure every required scope was approved.
