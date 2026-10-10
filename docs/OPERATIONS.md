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

## When something goes wrong
1. **Stop the harm:** Vercel, project `checin`, Deployments, promote the previous production deployment.
2. **Say so:** one plain message to the team and the affected customers.
3. **Find the cause** in the Vercel logs (search by correlation id, for example `scan.record`), fix on a branch, test on staging.
4. **Write down** what happened and what changes so it cannot repeat, and add a test or rule if one would have caught it.
