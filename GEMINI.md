# Project Rules

## Continuous Auto-Commit & Push Policy
- Whenever any code modifications, fixes, or additions are made in the local repository files, ALWAYS automatically stage (`git add`), commit with a descriptive message (`git commit`), and push (`git push origin main`) to GitHub immediately.
- Do NOT prompt, ask, or wait for user permission before committing and pushing code changes.

## Strict Prohibition on Dummy / Sample Data & Absolute Preservation of Existing Data
- NEVER create, generate, seed, or inject dummy/mock NC records, dummy CAP records, dummy users, or sample data during any update, modification, new feature implementation, or bug fix.
- Always use the existing database and actual project data.
- Preserve all existing NC/CAP records, user details, assignments, and historical records.
- NEVER delete, overwrite, reset, clear, or replace existing database or store data unless explicitly instructed by the user.
- This rule applies unconditionally to every future modification across all modules of the project.
