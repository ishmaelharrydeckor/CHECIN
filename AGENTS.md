# ChecIN — Build Spec for Antigravity

Corporate attendance/workforce check-in SaaS. New product, new repo, new Firebase project — do not reuse or reference any existing QRoll/KNUST project, credentials, or Firebase instance.

**Stack:** TanStack Start (React 19, SSR), Firebase Auth + Firestore, firebase-admin (server-only), Vercel hosting, web-push for notifications.

---

## Non-negotiable security principles

These exist because an earlier project built the same way, without these rules stated up front, shipped with critical vulnerabilities: world-readable/writable Firestore rules, a hardcoded VAPID private key committed to a public repo, an unauthenticated endpoint capable of broadcasting to every user, and several endpoints that trusted a client-supplied user ID with no verification at all. Follow these from the first commit, not as a later fix:

1. **Never trust an identity, role, or organization ID sent by the client.** Every privileged operation must derive who's calling from a verified Firebase ID token (`request.auth`), never from a value in a request body or query string.
2. **Roles and tenancy live in Firebase custom claims only** (`{ role, orgId, managerId }`), set exclusively through a server route using the Admin SDK. Never store a role field on a user's own Firestore profile document — a client-writable role field is a privilege-escalation bug waiting to happen.
3. **No hardcoded secrets, ever, with no exceptions for "just a fallback."** VAPID keys, kiosk device secrets, session-signing secrets — all from environment variables, all required at startup (throw a clear error if missing, don't silently fall back to a baked-in value).
4. **Firestore rules default-deny.** Every collection gets an explicit rule; anything not explicitly listed is `allow read, write: if false`. Scope every rule by `orgId` first (the hard tenant wall), then `managerId` (team-level scoping) using this pattern:
   ```
   function role() { return isSignedIn() ? request.auth.token.role : null; }
   function orgId() { return isSignedIn() ? request.auth.token.orgId : null; }
   function managerId() { return isSignedIn() ? request.auth.token.managerId : null; }
   function inOrg(data) { return isSignedIn() && data.orgId == orgId(); }
   function isOwnTeam(data) { return inOrg(data) && data.managerId == managerId(); }
   ```
5. **Any collection holding credentials or secrets (password hashes, device secrets, invite tokens) is `allow read, write: if false` — Admin SDK only, no exceptions**, even for the server's own convenience.
6. **The kiosk device secret is the proof of physical presence.** The "mint a fresh check-in token" endpoint must require a valid device secret header tied to that specific location. Without this check, anyone can fetch a currently-valid token remotely and defeat the entire point of requiring a physical scan.
7. **Every server route that changes state or reads another person's data needs its own explicit authorization check** — don't assume a route is safe just because the UI never calls it with bad input. Assume it will be called directly with arbitrary values.
8. **Rate-limit anything unauthenticated** (login, invite redemption, kiosk pairing) using a shared, persistent store (Firestore-backed), not an in-memory counter — the app will run multiple server instances, and an in-memory limiter is trivially bypassed across them.
9. **No file in this repo should ever contain a real secret.** `.env.example` documents every required variable; actual values only ever go in Vercel's environment settings.

---

## Tenancy & identity model

```
Organization (company) — the hard isolation boundary, nothing crosses it
  └── Manager (owns a team)
        └── Employee (real Firebase Auth account, reports to one manager)
```

Custom claims on every authenticated user: `{ role: "org_admin" | "manager" | "employee", orgId, managerId }`. A manager's `managerId` is their own uid. An org admin can act across the whole org; a manager is scoped to `managerId == their own uid`; an employee is scoped to their own records within their manager's team.

Employees get **real Firebase Auth accounts** — this is a deliberate difference from a similar prior project that modeled its end-users as passwordless "records," which caused significant complexity later. Building on real accounts from day one avoids that entirely.

## Onboarding flow

1. Company signs up → creates `organizations/{orgId}` and the signup user becomes `org_admin`.
2. Org admin invites managers via a single-use, email-bound, expiring invite token.
3. Manager invites employees the same way, with `managerId` set to the inviting manager's uid.
4. Build the invite system generically once (same mechanism grants either role, differing only in the claims issued) — don't build it three times.

## Check-in mechanism: kiosk QR, not GPS

A dedicated tablet (kiosk mode) at each entrance displays a QR code that regenerates every ~15 seconds. Employees scan it with their own phone (camera in a normal browser tab, no native app) to check in or out — the same action serves both directions; the server determines which based on the employee's last event today.

- The QR encodes a short-lived, HMAC-signed token (`sign(locationId, timeBucket)`), verified server-side on scan.
- **The kiosk token-minting endpoint requires a device secret** established via a one-time pairing flow (see below). Without this, the design is trivially defeated by screenshotting and forwarding a token remotely.
- No GPS, no location permissions, no geofence math anywhere in this system.

**Kiosk pairing flow** (mirrors the invite pattern — single-use, shown-once secret):
1. Org admin adds a location → server creates a short-lived (~10 min), single-use pairing code.
2. On the physical tablet, entering the code calls a pairing endpoint (rate-limited).
3. Server generates a device secret, stores only its **hash** in the Admin-SDK-only `kiosks/{locationId}` collection (never on the `locations` document), and returns the raw secret to the tablet exactly once. The tablet persists it locally.
4. The kiosk sends that secret as a header on every subsequent token request.
5. A lost/stolen tablet is handled by revoking the stored hash and re-pairing a replacement.

## Data model

| Collection | Key fields | Access |
|---|---|---|
| `organizations/{orgId}` | name, plan, timezone | org members read; org_admin writes |
| `users/{uid}` | displayName, email, photoURL, orgId | **Display fields only — never a role field.** Self read/write own doc. |
| `staff_invites/{token}` | email, role, orgId, managerId, status, expiresAt | Admin SDK only |
| `kiosk_pairings/{code}` | orgId, locationId, status, expiresAt | Admin SDK only |
| `locations/{locationId}` | orgId, name, reportingTime, closingTime, checkoutWindowMinutes | Org-scoped read. Holds no secrets, because Firestore rules cannot hide a single field from a reader who can read the document. The time fields drive the kiosk's display label and `late`/`earlyDeparture` flags — they never gate whether a scan succeeds |
| `kiosks/{locationId}` | orgId, kiosk_secret_hash, kiosk_paired_at | Admin SDK only (`allow read, write: if false`) |
| `clock_events/{eventId}` | orgId, managerId, employeeId, type (`in`/`out`), timestamp, locationId | Employee reads own; manager reads their team's; created only via the verified-scan server route |
| `leave_requests/{id}` | orgId, managerId, employeeId, type, startDate, endDate, status | Employee creates own; manager approves within their team |
| `announcements/{id}` | orgId, managerId (nullable = org-wide) | Manager/org_admin write; org-scoped read |
| `push_subscriptions`, `in_app_notifications`, `notification_preferences` | userId-scoped | Admin SDK only, identical pattern regardless of app |

## Client shape

There are three distinct clients in this system. They are not variations of the same screen — they have different trust models, and conflating them is the single easiest way to accidentally break the security design. Build each as its own separate route/app shell from the start.

### Employee scan screen (installable PWA)
- Tied to a **person**, not a place. The employee signs in with their own real Firebase Auth account, same as any normal app login.
- Installable (manifest + service worker), `start_url` pointing directly at the scan screen, not a dashboard — one tap from the home screen to check in/out.
- The service worker exists for the install experience and asset caching only, **not offline functionality** — a scan is meaningless without reaching the server, since proving the token is still fresh *is* the security model. Never let this screen queue a scan for later; if there's no connection, the check-in simply fails and says so.
- This client's job is entirely: open camera → read QR → send `{token, locationId}` + the employee's own ID token to the server.

### Kiosk display (entrance tablet)
- Tied to a **place** (one specific location/entrance), not a person. **It has no user account and must never be asked to log in as one.** Its only identity is the device secret established during pairing (see the Kiosk pairing flow above).
- Its job is entirely: call the token-minting endpoint (authenticated with its device secret) every ~12 seconds, render whatever token comes back as a QR code, and optionally show a brief "Welcome, {name}" after a scan completes (fetched over that same device-secret-authenticated channel — never a public, unauthenticated read).
- It makes **no decisions** about who is allowed to check in, whether someone is late, or anything else business-logic-related. It is a dumb, trusted display — all real decisions happen server-side when the employee's phone submits the scan.
- Anti-pattern to avoid: do not build a "kiosk user" account and sign the tablet into it. That would make the kiosk's credential a normal, phishable/exportable login instead of a narrowly-scoped device secret, and it would blur the line between "this device is a trusted door" and "this is somebody's session" — exactly the ambiguity this split is meant to prevent.

### Manager/org-admin dashboard
- Tied to a **person** with elevated visibility (their team, or the whole org). Ordinary, non-installed web app — nobody needs one-tap access to a dashboard the way they do a daily check-in action.

**The one-sentence version, if anything above is ambiguous during implementation:** the kiosk proves *where* something happened; the employee's phone proves *who* it happened to. Neither client should ever try to do the other's job.

## Build order

1. Org signup + org_admin account creation
2. Generic invite system (manager invite → employee invite, same code path)
3. Location setup + kiosk pairing flow
4. Kiosk display route (rotating QR) + scan/check-in server route
5. Employee PWA shell (installable, one-tap scan)
6. Manager dashboard (team view, today's attendance)
7. Push notifications + announcements (near-verbatim port of the proven pattern)
8. Leave requests
9. Billing (Stripe or similar — this product is sold per-org/per-seat, unlike a single-institution license)

## Deferred to v2 — do not build yet

- Shift scheduling, rotating shifts, overtime rules (high complexity, varies by industry/labor law — wait for a real customer to define the need)
- Payroll system integrations
- Multi-manager departments (v1 is one manager per employee)
