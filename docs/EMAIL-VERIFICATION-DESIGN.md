# ChecIN: Email Verification Design (task 1.4)

Status: **draft for the integrator's approval. No code until agreed.** Integrator-only task (see [TEAM-TASKS.md](TEAM-TASKS.md)). It touches identity and claims, so [AGENTS.md](../AGENTS.md) rules 1, 2, 7 and 8 apply in full. It is a prerequisite for the email channel in [NOTIFICATIONS-DESIGN.md](NOTIFICATIONS-DESIGN.md) and [EMAIL-STRATEGY.md](EMAIL-STRATEGY.md).

## 1. The problem in plain words

Nobody is asked to prove they own the email address they sign up with, and every new account is marked "verified" automatically.

| # | Finding | Where |
|---|---|---|
| V-1 | Organization sign-up creates the Firebase user with `emailVerified: true`, makes them `org_admin` and logs them in at once. No email is sent. | [register-org.ts:105](../src/routes/api/auth/register-org.ts) |
| V-2 | Accepting a staff invite creates the user with `emailVerified: true`. The invite link proves the admin chose them; it does not prove the mailbox is real, and links are shared by hand today. | [staff-invites.ts:474](../src/routes/api/admin/staff-invites.ts) |
| V-3 | The "already signed in" branch of org registration trusts `caller.email` without checking the token says the email is verified. | register-org.ts:68 |
| V-4 | Every existing account is therefore marked verified without proof. | production and staging data |

What can go wrong:
1. **Squatting and pre-hijacking.** Someone registers `ceo@somecompany.com`. The real owner later cannot sign up ("already exists") and may find the stranger's account tied to their own Google sign-in.
2. **Typos lock people out.** A mistyped admin address makes password recovery impossible.
3. **Email and SMS reputation.** The planned email channel sends only to verified addresses; today that rule protects nothing.
4. **Fake organizations.** Free trials can be created in bulk with made-up addresses.

## 2. Principles

1. **"Verified" only ever means "this person clicked a link sent to this mailbox"** (or Google confirmed it). We never set it to true ourselves.
2. **No organization, no role and no admin rights exist until the email is verified.** Until then there is only a small, expiring *pending sign-up*.
3. **An unverified account never blocks a verified owner.** If the real owner of an address signs up, the unverified claim on it is replaced. The squatter never proved ownership, so they lose.
4. **The server decides from the verified ID token** (`email_verified`, `uid`), never from a field in the request (AGENTS rule 1).
5. **Do not lock existing users out.** Verification gates new sign-ups and email delivery, not check-ins or access for people already using the app.
6. **Use Firebase's built-in verification email now** (free, needs no domain), and move to our own sender on `checin.app` later without changing the flow.

## 3. The new sign-up flow (organization admins)

```
 1. Person fills the form (org name, timezone, departments, email, password)
 2. POST /api/auth/register-org/start      (not signed in, rate-limited)
      - creates the Firebase user with emailVerified: false
      - saves pending_signups/{uid}: orgId (pre-generated), orgName, timezone,
        departments, expiresAt (24 hours)
      - nothing else: no organization, no claims, no users document
 3. Browser signs in with email + password and calls sendEmailVerification
      -> Firebase emails a link
 4. Screen: "Check your email" - Resend (60 s cooldown) - Wrong address? Start over
 5. Person clicks the link (any device) -> Firebase marks the email verified
      -> returns to the app
 6. POST /api/auth/register-org/finish     (signed in)
      - ID token must say email_verified: true and have no orgId claim
      - pending_signups/{uid} must exist and not be expired
      - one transaction: create the organization (using the pre-generated orgId,
        so a retry cannot make two), set claims role=org_admin + orgId,
        write the users display document, delete the pending sign-up
 7. Browser refreshes its ID token (claims now present) and opens the dashboard
```

Details that make it robust:
- **Different device or later:** the link may be opened on another phone. Signing in on any device with a pending, verified sign-up runs step 6 automatically ("finishing setting up your organization").
- **Wrong address:** "Start over" deletes the unverified user and the pending sign-up, then returns to the form.
- **Takeover rule (principle 3):** if `start` finds an existing account for that email that is **unverified and has only a pending sign-up**, it deletes that account and replaces it. If the existing account is **verified**, the response is the current "an account already exists, please sign in".
- **Expiry cleanup:** unverified users and pending sign-ups older than 24 hours are deleted by a bounded sweep (limit per run, indexed on `expiresAt`). Reuse the notification sweep route's schedule (see NOTIFICATIONS-DESIGN.md 4.3) or a small separate one. The Firestore TTL policy can replace it after the move to Blaze.
- **Google sign-up:** Google confirms the address, so the token already has `email_verified: true`; the flow can skip steps 3 to 5 (there is nothing to verify) but still creates the organization through `finish`, so there is one code path.
- **Fix V-3:** the signed-in branch rejects a token whose `email_verified` is not true.
- **Password rule:** raise the minimum from 6 to 8 characters in the same change (cheap, and verification does not protect a weak password).

## 4. Staff invites (employees and managers)

- New accounts created by redeeming an invite are created with **`emailVerified: false`** (fixes V-2). Using the app is **not** blocked; the invite link already proved the admin authorized this person.
- A non-blocking banner on the Account page, "Verify your email to receive email notifications", with a send button (cooldown 60 s).
- Email notifications, escalation emails and billing mail go **only** to verified addresses. Push and the in-app inbox are unaffected.
- **Option for later:** once invites are delivered by email (EMAIL-STRATEGY E1), redeeming the emailed link could mark the address verified, because the link proves mailbox access. We decide that then. Until invites are emailed, they stay unverified.

## 5. Existing accounts

- A one-off script `scripts/mark-unverified.mjs` sets `emailVerified: false` on email/password users and **leaves Google users alone** (Google already verified them).
- **Dry run by default** (prints counts, changes nothing). **Staging first.** Production runs only with the integrator's explicit OK and `--project production`.
- Nobody is locked out. Affected people see the Account banner; once they click the emailed link they are verified.
- Order: ship the banner and "send verification email" button **before** running the script, so no one is flagged without a way to fix it.

## 6. What requires a verified email

| Needs verified | Does not need it |
|---|---|
| Creating an organization (new sign-up) | Checking in and out |
| Receiving email notifications and escalations | Using the dashboard, leave, announcements |
| Billing and plan changes (task 1.7) | Receiving push and inbox notifications |
| Changing the account email (uses Firebase "verify before update") | Sign-in itself |
| Enabling the email or SMS add-on for an organization | |

## 7. Forgot password

Already exists on the client ([auth.tsx:70](../src/routes/auth.tsx), Firebase `sendPasswordResetEmail`), so this task only checks it: the message must not reveal whether an address has an account, requests are rate-limited, and the reset link sends people back to the sign-in screen. The admin tool `reset-link.ts` stays as an admin-only fallback.

## 8. Security checks and abuse limits

| Risk | Guard |
|---|---|
| Mass fake sign-ups | `start` rate-limited per IP (fail closed, as today) and per email (3 per hour); disposable-address blocking can be added later |
| Verification email used to spam a victim | Resend limited per user (1 per minute, 5 per hour); Firebase also limits |
| Someone calls `finish` for another person | It only reads the pending sign-up of the **token's own uid** |
| Replay or double-click makes two organizations | Pre-generated `orgId` plus one transaction; `finish` is idempotent |
| Unverified user reaches protected data | They have no `orgId` or role claim until `finish`, so every existing rule already denies them |
| Verification state read from the client | Only from the verified ID token on the server |
| Enumeration ("is this email registered?") | Same wording today; we keep it but rate-limit it; consider a neutral message later |

New collection `pending_signups`: **Admin SDK only**, default-deny in `firestore.rules`. Index on `expiresAt` for cleanup. No secret is stored; the password is held only by Firebase Auth, never by us.

## 9. Tests that must pass before merge

1. An unverified token cannot finish a sign-up and creates no organization.
2. A verified token with no pending sign-up creates nothing.
3. An expired pending sign-up is refused and cleaned up.
4. Calling `finish` twice (or two at once) produces exactly one organization.
5. `start` for an address held by an **unverified** pending account replaces it; for a **verified** account it refuses.
6. The signed-in branch refuses a token with `email_verified` false.
7. One person cannot finish another person's pending sign-up.
8. The cleanup sweep is bounded and deletes only expired, unverified, pending-only accounts.
9. Invite redemption creates an unverified account, and the email channel skips unverified addresses.
10. The migration script is a dry run unless told otherwise and refuses to run against production without the explicit flag.

## 10. Delivery order (each one PR into `staging`, integrator-only)

| Step | What | Done when |
|---|---|---|
| **V1** | `start` and `finish` routes, `pending_signups` rule and index, cleanup sweep, "check your email" and "finish setup" screens, password minimum 8, tests 1 to 8 | On staging: a new sign-up gets a real email, no organization exists until the link is clicked, an expired one disappears |
| **V2** | Account banner and send button, email change with re-verification, the existing-accounts script (staging, then production with OK) | Existing admins see the banner and can verify; nobody is locked out |
| **V3** | Invites create unverified accounts; email channel and billing check `emailVerified`; forgot-password review | Test 9 passes; unverified employees still check in and get push |

Firebase console settings for V1: set the verification email template and action URL, add the staging and preview domains to **Authorized domains**, and confirm the sender name. When the domain exists, switch the sender to `checin.app` (EMAIL-STRATEGY E0), or generate the link on the server and send it ourselves (`generateEmailVerificationLink`) without changing the flow.

## 11. Risks

- **The Firebase default email may land in spam** for some providers. Mitigations: the "check your spam folder" line on the waiting screen, resend, and the later move to our own authenticated sender.
- **People who never click:** their pending sign-up quietly expires. The trial never starts, which is the intent.
- **Extra step lowers sign-up completion.** Accepted: a real, reachable admin is worth more than a larger count of fake organizations. Measure completion after launch.
- **Time zone and template text** are set at `start`, held by the pending sign-up and not editable until `finish`; a person who closes the tab and returns after expiry re-enters them.

## 12. Decisions needed from the integrator

1. **Confirm: no organization until the email is verified** (recommended), instead of letting people in and gating features.
2. **Pending sign-up lifetime:** 24 hours (suggested).
3. **Existing accounts:** mark as unverified with a banner and no lockout (suggested), staging first.
4. **Employees:** verify lazily through the banner (suggested), or mark verified when an emailed invite is redeemed once invites are emailed.
5. **Password minimum:** raise from 6 to 8 now (suggested).
6. **Sender:** use Firebase's built-in email until the domain exists (suggested).
7. **Order against the other work:** V1 before the notification engine (N1) or alongside N0? V1 is independent of N0.
