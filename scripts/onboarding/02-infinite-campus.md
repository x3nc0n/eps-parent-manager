---
title: "🏫 Step 2: Connect your Infinite Campus parent portal"
labels: onboarding, credentials, infinite-campus
step: 2
---
## What this step does
This step connects Infinite Campus so your AI assistant can pull grades, attendance, schedule details, and report-card information for the right child.

## Prerequisites
- Step 1 is complete
- You have an active Infinite Campus parent account
- You can sign in to your district's Infinite Campus parent portal in a browser

## Step-by-step instructions
1. Open `.env`.
2. Set `IC_BASE_URL` to your district's Infinite Campus parent portal URL.
3. Set `IC_USERNAME` to your Infinite Campus username.
4. Set `IC_PASSWORD` to your Infinite Campus password.
5. Save `.env`.
6. Sign in to Infinite Campus in your browser.
7. Open each child's profile or student page and copy the numeric `studentID` from the page URL if it appears there.
8. Open `config/personal.yaml`.
9. Replace each `student_id: replace-me` with the real numeric student ID for that child.
10. Save the file.

## AI Prompts
- "Pull [child's name]'s current grades from Infinite Campus and save them to a grade report note in my vault."
- "Get [child's name]'s recent attendance from Infinite Campus and store it in my vault as an attendance log."
- "Fetch [child's name]'s current schedule from Infinite Campus and add it to the student's vault page."
- "Pull [child's name]'s latest report-card data from Infinite Campus and save a summary note in my vault."

## Acceptance criteria
- [ ] `.env` has a real `IC_BASE_URL`
- [ ] `.env` has my real Infinite Campus username and password
- [ ] Every student in `config/personal.yaml` has a numeric `student_id`
- [ ] I can identify which Infinite Campus record belongs to each child

## Troubleshooting
- **I cannot find the student ID:** Check the browser URL after clicking the child profile, demographics page, or grade details page.
- **The portal URL keeps redirecting:** Use the final parent-portal URL after login, not the district home page.
- **My credentials still fail later:** Re-enter them carefully and confirm you can log in through the browser first.
