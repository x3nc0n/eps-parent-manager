---
title: "📅 Step 7 (Optional): Set up your daily or weekly school summary"
labels: onboarding, optional
step: 7
---
## What this step does
This optional step sets the rhythm for your summaries so your AI assistant can keep writing daily or weekly updates into your vault.

## Prerequisites
- Step 6 is complete
- You know whether you want daily check-ins or a weekly digest

## Step-by-step instructions
1. Open `config/personal.yaml`.
2. Find `preferences.summary_delivery`.
3. Set it to `daily` or `weekly`.
4. Save the file.
5. Ask your AI assistant for a test summary so you can see the format in your vault.
6. Adjust your preference later if the summaries feel too frequent or not frequent enough.

## AI Prompts
- "Create a weekly summary note for [child's name] using the latest school data and save it to my vault."
- "Generate today's school update for [child's name] and store it in the vault using my preferred summary schedule."
- "Pull the newest grades, assignments, and announcements for [child's name] and write a digest note in my vault."

## Acceptance criteria
- [ ] `preferences.summary_delivery` is set to `daily` or `weekly`
- [ ] I have generated at least one test summary
- [ ] The summary was saved in my vault
- [ ] I know I can change the schedule later

## Troubleshooting
- **I am not sure which cadence to choose:** Start with `weekly`; it is usually easier to manage.
- **The summary feels too noisy:** Switch from `daily` to `weekly`.
- **The summary is missing useful details:** Ask the assistant to include grades, assignments, announcements, and attendance in the saved note.
