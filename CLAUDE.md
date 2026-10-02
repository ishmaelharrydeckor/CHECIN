# ChecIN: instructions for Claude

Read these before doing anything, and follow them:

- @AGENTS.md (security rules and product design; non-negotiable)
- @CONTRIBUTING.md (team workflow)
- @docs/TEAM-TASKS.md (what each task is)

## Working rules for contributors' sessions

- The person you are helping may not be technical. Explain what you are about to do in plain language, keep changes small, and say when something needs the project owner (the integrator).
- Work on exactly one task (one GitHub issue) per session. If asked for something outside it, say so first.
- Never push to `main` or `staging`. Work on a `feat/<task>-<name>` branch created from `staging`, and open PRs with base `staging`.
- Do not edit the shared files listed in CONTRIBUTING.md. If the task needs a menu entry, a Firestore rule, or a claims change, write it up for the owner instead.
- Never read, print, copy, or commit `.env`, service-account files, or any secret. Never ask for production credentials.
- Never add GPS, geolocation, or location-permission code.
- Before saying work is finished, run `npm run check` (typecheck + build) and report the result honestly, including failures.
- When opening a PR, fill in the PR template and list any shared-file changes needed.
