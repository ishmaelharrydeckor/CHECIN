# Release checklist

Releasing means putting changes in front of real users (the live app, Firebase project `checin-d172e`). Release **only the tested slice**, never "everything on staging". Open the release pull request into `main` as a **draft** and mark it ready only when every box below is ticked.

How we cut a slice: find the last staging merge that contains only tested work, push a branch at that commit (for example `release/<name>`), and open the draft PR from that branch. Untested work stays on staging for the next release. (Release 1 used this: `release/scan-summaries`.)

## Before you release
- [ ] Everything in this release has been tested on staging, and the filled-in test checklist is kept
- [ ] Untested work is not in the release
- [ ] The release description lists: what is in it, what changes for users, the production steps in order, and how to undo
- [ ] The production steps are known: Firestore indexes, rules, Vercel settings, data jobs
- [ ] Any data job (for example `scripts/backfill-summaries.mjs`) has had a **dry run**, and the result looked sane
- [ ] Backups are on, and a restore has been tried (see [OPERATIONS.md](OPERATIONS.md))
- [ ] Rollback is known: Vercel, project `checin`, Deployments, previous production deployment, Promote
- [ ] It is a quiet moment, and someone trusted is available

## Production steps, in order
Each production command needs the owner's explicit OK and is run by the owner (Claude Code may not run production commands).
1. **Indexes** (wait until they say Enabled in Firebase Console, Firestore, Indexes):
   `npx firebase-tools deploy --only firestore:indexes --project production`
2. **Rules** (compare with the Rules tab first, then deploy):
   `npx firebase-tools deploy --only firestore:rules --project production`
3. **Vercel settings, Production scope only** (project `checin`), for example a temporary `SUMMARY_LEGACY_FALLBACK=1` or `PLATFORM_OWNER_UIDS`
4. **Data job:** dry run, real run, merge, then repeat for today only if the job says so
5. **Merge** the release PR (draft off), and wait for Vercel to show **Ready**
Run steps from a clean copy of the release branch, never from a folder on an older version.

## After releasing
- [ ] Live check: sign in as the owner, Roster shows today's numbers and the weekly chart, one scan in and one scan out, the tablet still shows a code
- [ ] Tell the team and, if users are affected, the users
- [ ] Remove temporary Vercel settings the next day
- [ ] Delete any key created for the job, **both the file and the key in Google Cloud**. Do not delete the key Vercel uses
- [ ] Note anything to do better next time in `docs/SYSTEM-DESIGN.md` or the DevOps plan
