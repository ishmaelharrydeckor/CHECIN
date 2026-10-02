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

## Local setup

```bash
git clone https://github.com/ishmaelharrydeckor/CHECIN.git
cd CHECIN
git checkout staging
npm ci
cp .env.example .env     # then fill in with the STAGING values the integrator sends you privately
npm run dev              # http://localhost:3000
```

Rules for `.env`:

- Use **staging** Firebase values only. Never ask for, paste, or use production values.
- Never commit `.env`, a service-account JSON, or any key. `.gitignore` covers `.env`, but check `git status` before every commit.
- Secrets are shared through a password manager or a private message, never in a PR, issue, or chat channel the whole company can read.

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

## Working with Claude on your task

Claude is a good pair, but it only knows what you tell it. Start each session with:

> Read AGENTS.md, CONTRIBUTING.md and docs/V2-TASK-PLAN.md. I'm working on task X.Y. I may only create new files and must not edit the shared files listed in CONTRIBUTING.md. Tell me before touching anything else.

Then review what it wrote before you open the PR. You are responsible for the diff, not the tool.

## Before you open the PR

```bash
npx tsc --noEmit
npm run build
git status        # nothing you didn't mean to commit
git diff staging  # read your own diff once
```

The PR template has the full checklist.

## Getting unstuck

Ask in the team channel with the task number, what you tried, and the exact error. Don't work around a failing security rule by loosening it. Ask the integrator.
