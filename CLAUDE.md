# ChecIN: instructions for Claude Code

Read and follow these before doing anything:

- @AGENTS.md (security rules and product design; non-negotiable)
- @CONTRIBUTING.md (team workflow)
- @docs/TEAM-TASKS.md (what each task is)
- @docs/REVIEW-CHECKLIST.md (how PRs are reviewed)

## How this repo is worked on

Claude Code runs only on the **integrator's** account. Teammates are non-technical and build in normal Claude chats, then paste the code into GitHub through the browser and open PRs into `staging`. They cannot run the app, `git`, or `gh`. So a PR from a teammate is **untrusted, unrun code**: it may be incomplete, mix up files, or break a security rule without anyone noticing.

Claude Code's jobs here:

1. **Review teammate PRs** (`/review-pr <number>`): security first, then behaviour, then scope.
2. **Fix what's broken** on the PR branch when it's small, or say precisely what the teammate should ask their own Claude to change. Explain fixes in plain language the integrator can relay.
3. **Do the integrator-only work** (shared files, Firestore rules, claims, billing) and the integrator's own tasks.

## Rules for any session

- Never push to `main` or `staging` directly. Use a branch and a PR. The integrator merges.
- Never read, print, copy, or commit `.env`, service-account files, or any secret. Never use production credentials (`checin-d172e`) for testing; staging only. A bare `firebase deploy` targets staging; production must say `--project production` and needs the integrator's explicit OK.
- Never add GPS, geolocation, or location-permission code.
- Pushing commits to a teammate's PR branch is allowed for small fixes the integrator asked for; say what you changed in a PR comment so the teammate isn't surprised.
- Before saying work is finished, run `npm run check` (build + typecheck) and report the result honestly, including failures.
- Explain things in plain language. The integrator coordinates a non-technical team and needs wording they can pass on.
