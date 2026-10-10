# DevOps plan

How ChecIN is built, shipped and kept safe, what is already in place, and what to add next. Written for the owner; plain language first, commands second.

Companion to [SCALE-PLAN.md](SCALE-PLAN.md) (speed and cost) and [REVIEW-CHECKLIST.md](REVIEW-CHECKLIST.md) (reviewing PRs).

## 1. What is already in place

| Practice | How it works here |
|---|---|
| Review before release | Feature branch, PR into `staging`, test, then a PR from `staging` to `main`. Both are protected. |
| Automatic checks | CI builds, type checks and runs the tests on every PR. Some tests guard rules (for example "every database read has a limit"). |
| Separate test copy | `staging` has its own Firebase project and its own Vercel site. A Preview deployment that points at the live database refuses to start. |
| Secrets stay out of code | Values live in Vercel settings only. `.env.example` lists them. Nothing secret is committed. |
| Easy undo | Vercel can promote the previous deployment in about a minute. Summaries can be rebuilt from `clock_events`. |
| Careful data jobs | The backfill has a dry run, refuses production without a flag, and is safe to repeat. |
| Rate limits and logs | Sensitive routes are rate limited and write one structured log line with a correlation id. |
| Load testing | `npm run loadtest` (staging only). |

## 2. Gaps, in the order to fix them

### 2.1 Backups (do first)
**Risk:** there is no scheduled backup of the live database, and point-in-time recovery is not switched on. If data were deleted or overwritten we could not restore it.

**What to do (owner, live project, needs the paid Blaze plan):**
1. Confirm the plan: Firebase Console, project `checin-d172e`, bottom left shows Spark or Blaze.
2. Turn on point-in-time recovery (restore to any minute in the last 7 days). Console: Firestore Database, Disaster recovery, Point-in-time recovery.
3. Add a daily scheduled backup kept for 14 days. Console: Firestore Database, Disaster recovery, Scheduled backups.
4. **Practise a restore once** into a throwaway database. A backup that has never been restored is a hope, not a backup.

**Cost:** small for the current size (storage only). **Done when:** step 4 has been done and written down here with the date.

### 2.2 Monitoring and alerts
**Risk:** nobody is told when the app starts failing.
- Uptime check on the sign-in page and `/api/check-in/status` (a free service is enough). Alert by email or phone.
- An error tracker (for example Sentry's free tier) on the server routes and the browser.
- A budget alert in Google Cloud (parked until scale; see the accepted risk in SCALE-PLAN.md).

**Done when:** a deliberately broken staging deploy produces an alert.

### 2.3 Deploy rules and indexes from GitHub
**Risk:** rules and indexes are deployed by hand, so the live copy can drift from the code (this is why the live rules had to be pasted and compared).
- A GitHub Action deploys `firestore.rules` and `firestore.indexes.json` to **staging** automatically when `staging` changes.
- Production stays manual and deliberate, but via one documented workflow with an approval step.

**Done when:** a rules change merged to `staging` appears in the staging console without anyone running a command.

### 2.4 Release safety
**Risk:** a release can be merged by accident (it happened once).
- A release PR template with a required checklist: tested items, production steps in order, rollback.
- Releases are cut as a **slice of staging** that has been tested, never "all of staging".
- Require the release PR to be marked ready before merging (use draft until the production steps are done).

### 2.5 Tests of the real screens
**Risk:** nothing clicks through a scan and checks the result; people do this with checklists.
- Add a small automated browser test (Playwright) for the core path against staging: sign in, scan, see the result, see the Roster.
- Keep the human checklists for the tablet and phone-camera parts, which cannot be automated well.

### 2.6 Key and secret hygiene
- Service-account keys are for one job and then deleted (file **and** the key in Google Cloud). Never leave them in Downloads.
- Rotate the live keys and the kiosk and session secrets on a schedule (for example every 6 months) and after anyone leaves the team.
- Turn on GitHub secret scanning and push protection (free).

### 2.7 Dependencies
- Turn on Dependabot alerts and weekly update PRs. Review them like any other PR.

## 3. Incident basics (write once, keep short)
1. **Stop the harm:** roll back in Vercel (Deployments, previous production deployment, Promote).
2. **Say so:** tell the team and affected customers in one plain message.
3. **Find the cause** from the logs (search by correlation id), fix on a branch, test on staging.
4. **Write down** what happened and what changes so it cannot repeat (a few lines in this folder).

## 4. Order of work
1. Backups and a practised restore (2.1)
2. Uptime check and error tracker (2.2)
3. Release PR template (2.4), secret scanning and Dependabot (2.6, 2.7): all quick
4. Rules and indexes from GitHub to staging (2.3)
5. Automated browser test of the core path (2.5)
