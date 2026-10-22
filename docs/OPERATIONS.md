# Operations: keeping ChecIN healthy

Companion to [DEVOPS-PLAN.md](DEVOPS-PLAN.md) (the order to add things) and [SCALE-PLAN.md](SCALE-PLAN.md) (cost and speed).

## Regular care
| How often | What to do |
|---|---|
| Weekly | Look at errors and uptime. Look at the Firebase Usage tab (reads and writes). Review and merge Dependabot updates. |
| Monthly | Try a restore from backup. Read the access list (GitHub collaborators, Vercel members, Firebase members) and remove anyone who left. Check the reports inbox for open items. |
| Every 6 months | Replace service-account keys, `KIOSK_TOKEN_SECRET`, `SESSION_SECRET` and the VAPID keys (planned, with a re-pair of tablets where needed). Re-read `AGENTS.md`. |

## Backups (status: not yet set up; in the backlog as B4 until the live project moves to Blaze)
Needs the Blaze plan, so it is switched on when the live project moves to Blaze (before the first paying customer). Do it for the live database `checin-d172e`; staging does not need it.

1. **Point-in-time recovery** (lets you rewind to any minute in the last 7 days). With the Google Cloud CLI signed in as an owner of the project:
   ```
   gcloud firestore databases update --database="(default)" --enable-pitr --project=checin-d172e
   ```
2. **A daily backup kept for 14 days:**
   ```
   gcloud firestore backups schedules create --database="(default)" --recurrence=daily --retention=14d --project=checin-d172e
   ```
3. Check both in the Firebase console, Firestore, Disaster recovery. (Check the exact flag names against the current Google Cloud documentation before running; they have changed before.)
4. **Prove it:** restore the latest backup into a throwaway database (not the live one) and open a few records. Write the date here: ____________
- A backup that has never been restored is a hope, not a backup. Repeat the restore test monthly (see Regular care).

## Usage and cost (the weekly look)
- Firebase console, project, Firestore, Usage tab. On the free plan the daily limits are 50,000 reads and 20,000 writes; going past them stops the app until the next day. Write the weekly numbers in the team channel.
- A dashboard open should cost a few hundred reads at most (see `docs/ACCEPTANCE-PASS-4-9.md`). A sudden jump after a release usually means a screen reading a list it should count: find it with the correlation id in the Vercel logs.
- When on Blaze: set a **budget alert** in Google Cloud, Billing, Budgets and alerts, at an amount that would surprise you, with email to the owner.

## Load test (never run yet: needs the staging service account)
The harness is `scripts/load-test.mjs` and it refuses to run against the live project. To run it:
1. Get the **staging** values (never live): the staging site address, the staging service-account JSON and the staging web API key. Put them in the terminal for this session only: `LOADTEST_BASE_URL`, `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_WEB_API_KEY` (see the top of the script).
2. Note the Firestore Usage numbers on a quiet staging project.
3. Run a small test first: `node scripts/load-test.mjs --employees 20 --kiosks 1`, then the rush: `node scripts/load-test.mjs --employees 200 --kiosks 4 --ramp 900`.
4. Note the Usage numbers again. (After minus before) divided by the number of scans is the cost of one scan. Record the latencies it prints (p50 and p95) and the error count in `docs/SCALE-PLAN.md`.
5. The harness deletes its own test organization afterwards. Check Firestore for leftovers.
Do this before the first customer with more than about 100 people, and after any change to the scan route.

## Needs the paid (Blaze) plan, not switched on yet
- Backups and point-in-time recovery.
- Automatic deletion of expired greeting notes (`kiosk_channels.expireAt`). Add this field override back to `firestore.indexes.json` once the projects are on Blaze. Until then the 15-second freshness check is what stops an old note being shown, and old notes simply stay.
- Deploying `firestore.indexes.json` with a time-to-live override fails on the free plan ("billing disabled").

## Alerts
- **Server errors (built, switched on by one setting).** Set `ALERT_WEBHOOK_URL` in Vercel (Production and Preview scopes, with different channels if you like) to an incoming-webhook address. Every server error that is logged is posted there, at most once per kind of error every 15 minutes per server instance, with: what failed, the environment, the organization id and the correlation id to search for in the Vercel logs. Nothing secret or personal is sent. Empty means off. To test, point it at a throwaway channel and trigger a failing request on staging.
  - Slack: Slack app, Incoming Webhooks. Discord: channel settings, Integrations, Webhooks. Teams: the Workflows app, "Post to a channel when a webhook request is received". Email: any "webhook to email" service.
- **Uptime check** (needs a free account at an uptime service, not built): on the sign-in page and `/api/check-in/status`, alerting the same channel.
- **Browser errors** (needs an error-tracker account, not built).
- A Google Cloud budget alert (parked until scale; the read-flood risk of `kiosk_channels` is accepted until then).

## Environments
| | Staging | Live |
|---|---|---|
| Firebase project | `checin-6982` | `checin-d172e` |
| Vercel project | `checin-6982` (Preview) | `checin` (Production) |
| Rules and indexes | `--project staging` | `--project production`, owner only, explicit OK |
A staging deployment pointed at the live database refuses to start (environment guard).

## Timezones
Every organization's timezone decides which day a scan belongs to, who is late and every report date. An organization with no timezone, or plain UTC that nobody chose, shows its admin a yellow "Confirm your timezone" card on the dashboard and in Settings until they choose one or press "Keep UTC". Check the pilot organizations once: Firestore, `organizations`, look at `timezone` and `timezoneConfirmed`. A real zone that happens to match UTC (for example `Africa/Accra`) needs no confirmation.

## Keys and secrets
- A key created for one job is deleted afterwards, **both the file and the key at Google Cloud**. Never leave keys in Downloads, chat or screenshots.
- Vercel holds its own service-account key. Never delete a key unless its ID is the one you created.
- The Firebase web API key in `DEPLOYMENT.md` is public by design (access is controlled by the Firestore rules), but should be restricted by website in Google Cloud Console, APIs and Services, Credentials.

## Scheduled jobs: the nightly pattern refill

**What it does.** Every night at 01:30 UTC, `/api/cron/shift-patterns` tops up every organization's repeating shift patterns to 62 days ahead, so a pattern never runs dry. It is safe to run any number of times: it only writes days that are not filled yet and never overwrites a manual assignment. If it is missed, nothing breaks: opening the Rota also tops up that team's patterns, and the next night's run catches up.

**Set it up (once per environment).**
1. In Vercel, add an environment variable **`CRON_SECRET`**: a long random string of at least 16 characters (for example `openssl rand -hex 32`). Use a different value for each environment, and never put it in a file or a message.
2. Redeploy. Vercel then sends `Authorization: Bearer <CRON_SECRET>` on each scheduled call.
3. **Vercel only runs scheduled jobs on the production deployment**, not on preview deployments. The staging site will not run it on its own, so on staging trigger it by hand (below) when you want to test.

**Run it by hand** (to test, or to catch up). Replace the address and the secret:

```bash
curl -s -H "Authorization: Bearer YOUR_SECRET" https://YOUR-ADDRESS/api/cron/shift-patterns
```

It answers with a short summary, for example `{"ok":true,"batches":1,"checked":3,"written":186,"failed":0,"partial":false,"stoppedBecause":"done"}`. `written` is the number of shift assignments added. `partial: true` means some patterns were left for the next run (it stops after about 20 seconds, or if a batch changes nothing).

**What the answers mean.** `503`: `CRON_SECRET` is not set or is too short, so the job refuses everyone (the safe default). `401`: wrong secret. `429`: too many wrong attempts from one address; wait 15 minutes. Every run is logged as `cron.shift_patterns` with the counts; `failed` above 0 shows as an error line, naming no one.

**Check it is working.** In Vercel, open the project, then **Settings, Cron Jobs**, to see the last run and its result.

## When something goes wrong
1. **Stop the harm:** Vercel, project `checin`, Deployments, promote the previous production deployment.
2. **Say so:** one plain message to the team and the affected customers.
3. **Find the cause** in the Vercel logs (search by correlation id, for example `scan.record`), fix on a branch, test on staging.
4. **Write down** what happened and what changes so it cannot repeat, and add a test or rule if one would have caught it.
