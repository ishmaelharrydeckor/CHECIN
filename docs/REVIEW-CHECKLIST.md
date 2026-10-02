# Integrator review checklist

For reviewing teammates' PRs into `staging`. Most teammates are non-technical and work through an AI assistant, so assume the code looks plausible and verify the parts that matter. About 10 minutes per PR.

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
- [ ] CI green (typecheck + build)
- [ ] Pull the branch or use the Vercel preview. Try it as an **employee**, a **manager**, and an **org admin**
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
