---
title: "⭐ Step 1: Set up your family profile"
labels: onboarding, no-credentials-needed
step: 1
---
## What this step does
This step fills in the family details the toolkit uses everywhere else: names, schools, grade levels, contacts, and summary preferences.

## Prerequisites
- The toolkit has been installed in your personal repo
- You know each child's school and current grade
- You have at least one parent or guardian contact to add

## Step-by-step instructions
1. Open `config/personal.yaml`.
2. Replace `Spaid` with your family name.
3. Update `home_timezone` if you do not live in `America/Chicago`.
4. For each child, fill in `name`, `preferred_name`, `school`, and `grade`.
5. Leave `student_id: replace-me` for now — you will fill that in during Step 2.
6. Add at least one real guardian name, email, and phone number under `contacts.guardians`.
7. Review `preferences.summary_delivery` and leave it as-is for now unless you already know you want a different rhythm.
8. Save the file.

## AI Prompts
- "Read my family profile from `config/personal.yaml` and create or update a student overview note for [child's name] in my vault."
- "Use my family config to create a school contact note for [child's name] and save it in the vault."
- "Initialize [child's name]'s notebook page from my family profile and store it in the vault so future grade and assignment updates have a home."

## Acceptance criteria
- [ ] `family_name` uses my real last name
- [ ] Every child has the right name, school, and grade
- [ ] At least one guardian contact is real
- [ ] `student_id` is still `replace-me` for now
- [ ] `config/personal.yaml` saves cleanly

## Troubleshooting
- **`config/personal.yaml` is missing:** Re-run `./scripts/setup.sh` or `./scripts/setup.ps1` from the repo root.
- **I have more than one child:** Copy the sample student block and repeat it for each child.
- **I am not sure what time zone to use:** Use an IANA time zone like `America/Chicago` or look up your city at <https://en.wikipedia.org/wiki/List_of_tz_database_time_zones>.
