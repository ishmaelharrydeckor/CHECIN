# Firestore rules review, November 2026

A read of `firestore.rules` (33 collections) against the rules in [AGENTS.md](../AGENTS.md): default-deny, the organization first and then the team, no role stored where a user can edit it, secrets never readable. It complements the route sweep in [SECURITY-SWEEP-2026-11.md](SECURITY-SWEEP-2026-11.md). It was a read of the rules text and a check of what the browser actually writes; it did not run the rules in the emulator against hostile requests.

## What holds

| Check | Result |
|---|---|
| A catch-all closes every collection that is not named | Yes, and it is the last rule |
| Who someone is comes from the verified token (`role`, `orgId`, `managerId`), never from a field a user can edit | Yes; no rule reads a stored role |
| Credentials and server-only working data cannot be read or written from a browser | Yes, 14 collections: kiosks, pairings, invites, rate limits, push keys and inbox, notification settings, problem reports, recent scans and the four work-diary collections |
| Records the server makes (scans, daily summaries, excuses, shifts, assignments, patterns, swaps, work from home, refused scans, team changes) cannot be written from a browser | Yes |
| Reads start with the organization, then the team | Yes, with four named exceptions (a person's own profile and devices, an organization read by its members, the tablet's live-greeting document) |
| A person cannot create a profile with tenancy, team or role, or a leave request that approves itself | Yes: allowed-field lists and `status == "pending"` |
| Only one rule says `if true`: reading one tablet greeting document by its secret address | Yes (documented, and a test fails the build if its fields change) |

## What was found and changed

**R1: announcements could be written straight from a browser.** An org admin or a manager could create, change or delete a notice through the Firestore API with their own sign-in, bypassing the server route that checks who may post to which team, the length of the text and the author. Worse, an update rule did not stop `orgId` or `managerId` changing, so a notice could be moved onto **another organization's** board (a convincing place to put a phishing message) or onto another team's. The organization's id is not secret.

**R2: locations could be written straight from a browser** in the same way by an org admin: no check on the fields, and nothing stopped `orgId` changing, so a location could be moved into another organization's list.

**R3: the organization's name and timezone could be changed straight from a browser** by an org admin. The fields were limited, but the server's checks were skipped (for example that a timezone is a real one), and the server now records when a timezone was confirmed.

**The app needs none of the three.** The browser only ever writes to four collections: leave requests, a person's own profile, a person's own devices, and holidays. Organizations, announcements and locations are changed only by their server routes with the Admin SDK. So all three are now read-only in the rules (`allow create, update, delete: if false`), which changes nothing the app does and closes the gap.

## What stops it coming back

`scripts/tests/firestore-rules-guard.test.mjs` (12 tests) reads the rules file and fails the build if:
- the catch-all deny is missing or not last;
- a collection that holds secrets stops being closed;
- **any collection other than the four named ones (each with a reason) becomes writable from a browser**, so a new writable collection needs a reviewer to accept the reason;
- an update rule in a browser-writable collection stops limiting the fields or the owner;
- a read stops starting with the organization, or a team-owned record stops limiting a manager to their own team;
- the browser code starts writing to announcements or locations;
- anything other than the tablet greeting says `if true`.

It was checked against the old rules: it fails on exactly R1, R2 and R3, and passes on the fix.

## To do after merging (integrator)

The rules are not deployed by merging. Deploy to staging first (`npx firebase-tools deploy --only firestore --project staging`), post a notice, add a location and change the organization's name or timezone as an admin on the staging site (all three go through the server and should work as before), and only then to production, which needs your explicit OK.

## Looked at and left alone

- **`user_devices`** lets a person create a device record with any extra fields, and the record id is built from the person and a device id, so another user cannot overwrite it. A user who guessed a victim's exact record id could create it first and block the victim's own record (a nuisance, not a way into anything). The device id is random, so this is not practical. Revisit if it ever becomes a device-limit problem.
- **Team notices are readable by the whole organization** at the rules level (the screens show a person only their team's). The data model in AGENTS.md says announcements are organization-scoped read, so this is as designed.
- **Not covered:** running the rules in the Firebase emulator with hostile requests (worth adding as a test suite once an emulator is part of CI), and the indexes.
