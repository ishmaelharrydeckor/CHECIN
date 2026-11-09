# Security and access sweep, November 2026

A read of every server route (`src/routes/api`, 49 files) against the rules in [AGENTS.md](../AGENTS.md) and the checks in [REVIEW-CHECKLIST.md](REVIEW-CHECKLIST.md). Nothing here is a break-in that was found being used; it is a review of the code as it stands on `staging`.

## What was checked

| Check | Result |
|---|---|
| Every route says who may call it (verified token, or a device secret / pairing code) | Pass. Two routes have no signed-in caller on purpose: the tablet token route (device secret) and the public push key. The pairing route uses a one-time code. Each is now named, with its reason, in a test |
| Role, organization and manager come from the verified token, never from the request | Pass. Where a request names someone (a target person, a manager for a team notice, an invite's manager), the route checks the named person is in the caller's scope first, with the same "not found" answer for unknown and other-organization ids |
| Routes that change roles, reset passwords, assign managers or archive records | Pass. They check the token with revocation, scope the target, refuse admins and self-changes where they should, rate limit where it matters, and the password reset link is audited without storing the link |
| Open entry points (sign-up, invite redemption, tablet pairing) | Pass. All three limit attempts in the shared store, by address, and refuse when the store cannot be read |
| Records fetched by id are checked for the caller's organization | Pass, with one hardening (below) |
| Reads are bounded and start with the organization | Pass. `npm test` already fails on an unbounded query, and still does |

## What was changed

| # | Finding | Why it mattered | Fix |
|---|---|---|---|
| S1 | The tablet token route answered a failure with the internal error text (`detail`) | That route needs no sign-in, so anyone could read internal messages (database errors can name collections and indexes) | The reason stays in the server log; the answer says only that it failed |
| S2 | The notification inbox and settings routes answered a failure with the raw error text | Same, for signed-in users | Plain sentences to the person, the real error in the server log |
| S3 | Saving notification settings stored whatever the browser sent | A person could store any fields, or a very large record, in their own settings document | Only the known on/off switches are kept (`src/lib/notification-preferences.ts`); other fields are dropped; a switch that is not true or false is refused |
| S4 | Deleting a notice compared the notice's organization with the caller's; both can be empty | A caller with no organization could match a notice that has none | A caller with no organization is refused first |
| S5 | The tablet token route read the database for every made-up tablet id | An unauthenticated caller could run up database reads with random ids | An id found not to be a paired tablet is remembered for 15 seconds (never a secret; bounded to 1,000 ids; pairing or revoking clears it at once) |
| S6 | `locationId` was not checked to be text | A number sent as the id raised an error | It must be text |

## What now stops it coming back

`scripts/tests/security-sweep.test.mjs` (15 tests):
- **Every route file must verify its caller or be on a short list of exceptions with a written reason.** A new route without either fails the build.
- No route may send an error's own text, or its details, to the browser. Two routes answer with the message of an error class made for that (a refusal with its own status) and are named.
- The three open entry points must limit attempts and fail closed.
- No route may take the caller's role, organization or manager from a request body.
- The settings validator, the missing-tablet memory (including its expiry, its limit and its clearing) and the notice deletion guard.

## Looked at and left alone

- **No rate limit on role changes and similar admin actions.** They need a verified admin or manager, and each is audited or logged. A limit would add a database write to every call for little gain. Revisit if admin accounts are ever shared.
- **The tablet token route checks the secret against a stored hash in constant time on every request**, cached or not; the cache holds the hash, never the secret. Revoking a tablet can take up to a minute to reach a server that cached it (a known trade-off in `SYSTEM-DESIGN.md`).
- **`/api/push/vapid-key` needs no sign-in.** It returns only the public key, which is public by design; a test checks it never mentions the private key.

## Not covered

This is a code read. It did not include running the app against hostile input, a dependency vulnerability scan, the Firestore rules (reviewed when each was written), or the hosting settings. A penetration test by someone else is still worth doing before the first large customer.
