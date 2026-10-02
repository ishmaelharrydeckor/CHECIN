## What and why
<!-- One or two sentences. Link the task, e.g. "Task 1.3 from docs/V2-TASK-PLAN.md". -->

## Target branch
- [ ] This PR's base branch is `staging` (only the integrator opens `staging` -> `main`)

## Checklist
- [ ] The PR checks are green (or `npm run check` passes locally)
- [ ] I tried it on the Vercel preview with the staging test logins, never against production
- [ ] No secrets, keys, or `.env` values anywhere in the diff
- [ ] I did not edit shared files (see CODEOWNERS). If I needed to, I said so below
- [ ] No role, orgId, or managerId is read from a request body or query string. Identity comes from the verified ID token
- [ ] Any new server route checks authorization itself, even if the UI never sends bad input
- [ ] No GPS or location permission code of any kind

## Shared-file changes needed (if any)
<!-- e.g. "needs a sidebar entry for /leave and a rule for leave_requests" -->

## Screenshots
<!-- For UI changes: desktop and phone width. -->
