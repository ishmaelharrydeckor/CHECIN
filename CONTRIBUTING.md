# Contributing to ChecIN

Welcome. This guide is the short version of how we work. The long version of the security rules is [AGENTS.md](AGENTS.md); read it once before your first task.

## The flow

```
feature branch  ->  PR into `staging`  ->  test on staging  ->  integrator opens `staging` -> `main`
```

- Never push to `main` or `staging` directly. Both require a PR.
- Branch off `staging`, name it `feat/<task>-<short-name>`, e.g. `feat/1-3-change-password`.
- One task per PR. Small PRs get reviewed fast.
- CI (typecheck + build) must be green before review.

## Two ways to work

**Browser path (default for non-developers).** No installs. Build with a normal Claude chat, paste the code into GitHub's web editor (press `.` on the repo page), open a draft PR, and write "How to test" steps for the integrator, who tests it on staging. Full steps: [docs/TEAMMATE-GUIDE.md](docs/TEAMMATE-GUIDE.md). Paste [docs/CLAUDE-PROJECT-INSTRUCTIONS.md](docs/CLAUDE-PROJECT-INSTRUCTIONS.md) into your Claude Project first. Nobody runs your code before review, so the green CI checks are your safety net and the integrator does the hands-on testing.

**Local path (developers).**

```bash
git clone https://github.com/ishmaelharrydeckor/CHECIN.git
cd CHECIN
git checkout staging
npm ci
cp .env.example .env     # fill in with the STAGING values the integrator sends you privately
npm run dev              # http://localhost:3000
npm run check            # build + typecheck, run before every PR
```

Rules for `.env` (both paths):

- Use **staging** Firebase values only. Never ask for, paste, or use production values.
- Never commit `.env`, a service-account JSON, or any key. Check `git status` before every commit.
- Secrets are shared through a password manager or a private message, never in a PR, issue, or chat channel the whole company can read.

Reviews are done by the integrator using Claude Code (`/review-pr <number>`). Expect plain-language feedback you can paste straight into your Claude chat.

## What you can and can't edit

Your task lives mostly in **new files** (a new route, new components). Do **not** edit these. The integrator wires them in:

`src/components/AppShell.tsx`, `src/routes/auth.tsx`, `src/integrations/firebase/admin.server.ts`, `firestore.rules`, `AGENTS.md`, anything in `src/routes/api/admin/`, and the generated `src/routeTree.gen.ts`.

If your feature needs a menu entry, a Firestore rule, or a custom-claim change, write it in the PR description under "Shared-file changes needed". The integrator adds it.

## Security rules you must follow (summary of AGENTS.md)

1. **Never trust identity from the client.** `role`, `orgId`, `managerId`, `userId` come from the verified Firebase ID token on the server, never from a request body or query string.
2. **Roles live in custom claims only.** Never add a role field to a Firestore document.
3. **No hardcoded secrets**, not even as a "temporary fallback". Read from environment variables and throw if missing.
4. **Every server route checks authorization itself.** Assume it will be called directly with hostile input.
5. **Firestore is default-deny.** New collection = new rule, added by the integrator.
6. **No GPS, ever.** The kiosk QR is the only check-in method. Do not add location permission, geofencing, or distance code.
7. Anything unauthenticated must be rate-limited with the Firestore-backed limiter, not in-memory.

## Before you open the PR

- Developers: `npm run check`, then read your own diff once.
- Browser path: wait for the green checks on the PR and fill in "How to test".

The PR template has the full checklist.

## Getting unstuck

Ask in the team channel with the task number, what you tried, and the exact error. Don't work around a failing security rule by loosening it. Ask the integrator.
