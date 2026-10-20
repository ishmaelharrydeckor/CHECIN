# Operations: keeping ChecIN healthy

Companion to [DEVOPS-PLAN.md](DEVOPS-PLAN.md) (the order to add things) and [SCALE-PLAN.md](SCALE-PLAN.md) (cost and speed).

## Regular care
| How often | What to do |
|---|---|
| Weekly | Look at errors and uptime. Look at the Firebase Usage tab (reads and writes). Review and merge Dependabot updates. |
| Monthly | Try a restore from backup. Read the access list (GitHub collaborators, Vercel members, Firebase members) and remove anyone who left. Check the reports inbox for open items. |
| Every 6 months | Replace service-account keys, `KIOSK_TOKEN_SECRET`, `SESSION_SECRET` and the VAPID keys (planned, with a re-pair of tablets where needed). Re-read `AGENTS.md`. |

## Backups (status: not yet set up, see DEVOPS-PLAN.md 2.1)
- Point-in-time recovery and a daily scheduled backup on the live database `checin-d172e` (needs the Blaze plan).
- A restore into a throwaway database, written down with the date: ____________
- A backup that has never been restored is a hope, not a backup.

## Needs the paid (Blaze) plan, not switched on yet
- Backups and point-in-time recovery.
- Automatic deletion of expired greeting notes (`kiosk_channels.expireAt`). Add this field override back to `firestore.indexes.json` once the projects are on Blaze. Until then the 15-second freshness check is what stops an old note being shown, and old notes simply stay.
- Deploying `firestore.indexes.json` with a time-to-live override fails on the free plan ("billing disabled").

## Alerts (status: not yet set up, see DEVOPS-PLAN.md 2.2)
- Uptime check on the sign-in page and `/api/check-in/status`.
- An error tracker on the server routes and the browser.
- A Google Cloud budget alert (parked until scale; the read-flood risk of `kiosk_channels` is accepted until then).

## Environments
| | Staging | Live |
|---|---|---|
| Firebase project | `checin-6982` | `checin-d172e` |
| Vercel project | `checin-6982` (Preview) | `checin` (Production) |
| Rules and indexes | `--project staging` | `--project production`, owner only, explicit OK |
A staging deployment pointed at the live database refuses to start (environment guard).

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
