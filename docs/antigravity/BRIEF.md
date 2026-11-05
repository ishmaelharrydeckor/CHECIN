# Antigravity build brief (standing instructions)

Read this at the start of **every** task, together with `AGENTS.md`, `CONTRIBUTING.md`, `docs/REVIEW-CHECKLIST.md` and `docs/UI-STYLE-GUIDE.md`. A task prompt adds to this brief; it never loosens it. If a task prompt seems to conflict with this brief or `AGENTS.md`, **stop and ask** instead of choosing.

## Who does what
- **The owner** pastes each task prompt into Antigravity and merges PRs.
- **Antigravity builds** one phase at a time, on a branch, and opens a PR into `staging`.
- **The integrator (Claude Code) writes the design notes and prompts, reviews every PR, and tests it.** Nothing is merged until the review says "ready to merge". Time, money and presence logic gets the strictest review.

## The rules of the road
1. Branch off `staging`: `feat/<task>-<phase>-<short-name>` (for example `feat/3-1-p1-shift-engine`). **One phase per PR.** Never push to `main` or `staging`. Never merge your own PR.
2. **Stay inside the phase.** Build only what the prompt lists. Do not "also" fix, refactor or improve anything else. If you notice something, write it under "Noticed but did not touch" in the PR.
3. **Do not start the next phase** until the owner says the previous one is merged.
4. Use **staging only**: the staging Firebase project and staging `.env` values. Never the production project (`checin-d172e`). Never read, print, copy or commit `.env`, service-account files, tokens or keys. Never put a secret in code, a test, a doc, a PR or a log line.
5. **Do not run deploys** (`firebase deploy`, `vercel`, scripts with `--allow-production`). Say in the PR what must be deployed (rules, indexes) and the owner will do it.
6. Before you say a phase is done, run `npm run check` (build, typecheck, tests) and paste the real result. If something fails, say so. Do not skip, weaken or delete a test to make it pass.
7. **If you are blocked or unsure, stop and ask** with the exact question. Do not guess at security, time, or money behaviour.

## Security rules (non-negotiable, summary of AGENTS.md)
- Identity, role, `orgId` and `managerId` come **only** from the verified Firebase ID token on the server, never from a request body, query string or form field. Every server route checks authorization itself.
- Roles live in custom claims only. Never store a role on a Firestore document.
- Firestore rules default-deny. A new collection gets an explicit rule (the integrator reviews it; write it in the PR and in a comment, **mark it clearly**). Credential-like data is Admin-SDK-only.
- Anything unauthenticated is rate-limited with the Firestore-backed limiter. Privileged actions write one `logEvent(...)` line (never a secret).
- **No GPS, no geolocation, no location permission, ever.**

## Access-pattern rules (these decide cost and speed)
- Every Firestore query is **bounded** (`.limit()`), **indexed** (add composite indexes to `firestore.indexes.json`) and starts with `orgId`. `npm test` fails on an unbounded read.
- No polling that reads the database. Fetch on demand.
- "Today", "this week" and any date comes from the server in the **organization timezone** (`dayKey`), never the client clock.
- Writes are **idempotent** (a retried request cannot create a duplicate: use deterministic ids). `clock_events` are never edited or deleted.
- Reports and dashboards read **summaries**, not raw `clock_events`.
- **The scan route is the hot path.** Anything you add to it must add at most the number of reads/writes the prompt allows, and must keep working if the new data is missing (fall back to today's behaviour).

## How the code is organised (match it)
- Pure logic goes in `src/lib/<name>.ts` with **relative imports ending in `.ts`** (for example `./attendance-day.ts`), no Firebase, so `node --test` can run it.
- Server code that touches Firestore goes in `src/lib/<name>.server.ts` or a route under `src/routes/api/...`.
- Tests go in `scripts/tests/<name>.test.mjs` (Node test runner). **Every rule and edge case in the design note gets a test.** Include the boring cases (nothing configured, empty data, a retry, a different organization).
- Screens follow `docs/UI-STYLE-GUIDE.md`: components from `src/components/ui/`, guide colours only, loading / empty / error states, phone width. No new libraries without asking.
- Match the surrounding code's comment density, naming and idiom. Comments say **why**, in plain language.

## What every PR must contain
- **What and why** (two or three sentences) and the task/phase number.
- **What changed**, file by file, in plain language.
- **Security notes:** which routes were added, how each checks authorization, any new collection or rule.
- **Deploy notes:** new indexes, new rules, new environment variables (names only).
- **Decisions and assumptions** you made, and anything you were unsure about.
- **Noticed but did not touch.**
- **How to test** on staging, step by step, as an admin, a manager and an employee.
- The real `npm run check` result.

## Definition of done for a phase
The prompt's "Done when" list is met, every listed test exists and passes, `npm run check` is green, and the PR description above is complete. Then **stop** and wait for the review.
