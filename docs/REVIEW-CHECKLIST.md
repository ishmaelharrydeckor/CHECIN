# Integrator review checklist

For reviewing teammates' PRs into `staging`. Teammates are non-technical, build in normal Claude chats, and paste code into GitHub through the browser. **Nobody has run their code.** Assume it looks plausible and verify the parts that matter. About 10 minutes per PR.

## Fastest way: let Claude Code do the first pass

In this repo's Claude Code session:

```
/review-pr <number>
```

It checks the base branch and CI, runs the build and typecheck on the branch, does the security/scope/behaviour passes below, and writes a plain-language message you can paste to the teammate. You still decide and merge. The checklist below is what it follows, and what you check by hand when the PR is risky.

## Common problems with browser-built PRs
- Base branch is `main` instead of `staging`. Retarget it.
- A file pasted into the wrong folder, or a duplicate of an existing file.
- Placeholder text or `...` left in the code (partial files).
- Stale `src/routeTree.gen.ts`: harmless, `vite build` regenerates it. Commit the regenerated file after merge if the diff shows it changed.
- Never merge a PR with a red check. Ask the teammate to paste the error into their Claude chat, or fix it yourself and say so in a PR comment.

## 1. Scope (30 seconds)
- [ ] One task, matches the linked issue's "Done when"
- [ ] Files changed are mostly new files. Anything in the shared list (CODEOWNERS) was left for you
- [ ] No unrelated changes (formatting sweeps, `routeTree.gen.ts` churn, dependency changes). If `package.json` changed, is each new package justified?

## 2. Security (the part that can hurt us)
Search the diff for each:
- [ ] `role`, `orgId`, `managerId`, `userId`, `employeeId` read from `req.body`, query, params, or form fields, instead of the verified token claims. **Reject.**
- [ ] A role/claims field written to a Firestore document. **Reject.**
- [ ] Any hardcoded key, token, password, URL with credentials, or `.env` content. Also check added test files and docs. **Reject.**
- [ ] A new server route (`src/routes/api/**`): does it verify the ID token itself and check role and org, before reading or writing anything?
- [ ] A new unauthenticated route: is it rate-limited with the Firestore-backed limiter (`src/lib/rate-limit.server.ts`)?
- [ ] `geolocation`, `navigator.geolocation`, location permission, distance or geofence code. **Reject.**
- [ ] New Firestore collection or a rule change: you write the rule, default-deny, scoped by `orgId` then `managerId`
- [ ] Credential-like collections (invites, device secrets, hashes) readable from the client. **Reject.**

## 3. Behaviour
- [ ] CI green (build + typecheck)
- [ ] Test it yourself (teammates can't run it): open the PR's Vercel preview while signed in to Vercel, or run the branch locally with staging `.env`. Follow the PR's "How to test" steps, then try it as an **employee**, a **manager**, and an **org admin**. Preview URLs use email/password logins, because Google sign-in only works on authorized domains
- [ ] Try it as the wrong role: a manager must not see another manager's team; an employee must not see anyone else's data
- [ ] Empty state, loading state, error state exist
- [ ] Phone width for anything an employee sees

## 4. Shared-file changes the PR asked for
- [ ] Menu entry / route wiring (AppShell): add on top of their branch or in a follow-up commit
- [ ] Firestore rules: add, then deploy to staging with `npx firebase-tools deploy --only firestore --project staging`
- [ ] Task board row updated in `docs/TEAM-TASKS.md` if the status changed

## 5. Merge
- [ ] Merge into `staging` (not `main`)
- [ ] Wait for the staging redeploy; click through the feature once on the staging URL
- [ ] Comment on the issue: "on staging, please test"

## Promotion to `main`
- [ ] Staging has been exercised for at least a day with real tester flows
- [ ] Any new Firestore rules deployed to production **deliberately**: `--project production`
- [ ] Production env vars needed by the feature are set in Vercel (Production scope)
