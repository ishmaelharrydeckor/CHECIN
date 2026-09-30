# ChecIN — Architecture v1
Corporate attendance & workforce check-in. New product, new repo, new Firebase project. (Where this document says "QRoll", it refers to an earlier, unrelated project whose proven patterns informed this design — no QRoll code, credentials or infrastructure is reused.)

---

## 1. Tenancy model

Three levels instead of QRoll's two (QRoll: lecturer → student; ChecIN: org → manager → employee):

```
Organization (company)
  └── Manager (owns a team; can also just be "the company admin" for small companies)
        └── Employee (real account, reports to one manager)
```

- **Organization** is the billing/isolation boundary. Nothing ever crosses an org boundary — this is the hard multi-tenant wall.
- **Manager** is the unit of data ownership within an org, same role QRoll's lecturer plays: a manager's team, their clock-in records, their leave approvals, all scoped to them.
- **Employee** has a real Firebase Auth account (the actual architectural fork from QRoll's "students are records" model) and belongs to exactly one manager.
- **Org Admin** is a role, not a separate entity — an org admin is a user within the org who can see across all managers/teams, same relationship `admin` had to `lecturer` in QRoll but now scoped to their one org instead of the whole platform.

## 2. Identity & custom claims

Every authenticated user (org admin, manager, employee) gets:

```json
{ "role": "org_admin" | "manager" | "employee", "orgId": "<org's id>", "managerId": "<uid of the manager they report to, or their own uid if they ARE the manager>" }
```

This is a direct extension of QRoll's `{ role, ownerId }` pattern — `managerId` plays the same role `ownerId` did, just nested one level under `orgId`. Rules check both: `orgId` for the outer tenant wall, `managerId` for the inner team-scoping.

Employees having real accounts (unlike QRoll's students) actually *simplifies* things here — no session-token workaround needed anywhere, since every request carries a normal Firebase ID token. That whole category of complexity from QRoll (student-session.server.ts, the caller-identity fallback logic) doesn't exist in ChecIN at all.

## 3. Onboarding flow

1. **Company signs up** → creates `organizations/{orgId}` + the signup user becomes `org_admin` for that org.
2. **Org admin invites managers** → same invite-token pattern as QRoll's TA invites (single-use, email-bound, expiring), granting `role: "manager", orgId, managerId: <their own new uid>`.
3. **Manager invites employees** → same pattern again, granting `role: "employee", orgId, managerId: <the inviting manager's uid>`.
4. **Employee accepts, sets up account, clocks in.**

Three uses of the exact same invite mechanism, differing only in what claims get granted — worth building as one generic "invite" system from day one rather than three copies (QRoll only needed the one TA case, so it didn't matter there).

## 4. Firestore data model

| Collection | Key fields | Notes |
|---|---|---|
| `organizations/{orgId}` | name, plan, timezone, createdAt | Billing lives here — unlike QRoll, ChecIN likely **does** need billing (multi-tenant SaaS, not a single institutional license) |
| `users/{uid}` | displayName, email, photoURL, orgId | Profile only — role/managerId stay in custom claims, never in this doc. (This exact mistake — role stored in a client-writable profile doc — was QRoll's root privilege-escalation bug. Not repeating it.) |
| `staff_invites/{token}` | email, role, orgId, managerId, status, expiresAt | Generic invite doc, reused for manager and employee invites alike |
| `locations/{locationId}` | orgId, name, reportingTime, closingTime, checkoutWindowMinutes | Multi-office support from day one — an org can have several, each with its own hours. Holds no secrets and no coordinates (there is no GPS in ChecIN) |
| `clock_events/{eventId}` | orgId, managerId, employeeId, type (`in`/`out`), timestamp, locationId, late, earlyDeparture | Equivalent to QRoll's `attendance_records`. Created only by the server route that verifies the scanned kiosk token |
| `leave_requests/{id}` | orgId, managerId, employeeId, type, startDate, endDate, status, reason | New domain, no QRoll equivalent |
| `announcements/{id}` | orgId, managerId (or org-wide if null), title, body | Direct reuse of QRoll's pattern |
| `push_subscriptions`, `in_app_notifications`, `notification_preferences` | Same shape as QRoll | Near-verbatim reuse — this suite is already hardened and doesn't need re-inventing |

## 4a. Check-in mechanism: rotating QR on a kiosk tablet

No GPS, no geofencing — the physical control is a dedicated tablet, locked into kiosk mode, mounted at the entrance. This is a *stronger* proof of presence than QRoll's geofence model, and removes an entire category of client-side trust problems (location permissions, GPS spoofing apps, battery drain) in one move.

**How it works:**
1. The kiosk displays a QR code that regenerates every ~15 seconds.
2. An employee scans it with their own phone (camera access in a normal browser tab — no separate app install required) to check in or out. The same scan serves both directions; the server decides which one based on whether that employee's last event today was an "in" or an "out."
3. The QR encodes a short-lived, HMAC-signed token — the exact same pattern already proven in QRoll's `student-session.server.ts`, just repurposed with a much shorter TTL (seconds instead of hours).

**The piece that actually makes this secure:** if anyone could call "give me a fresh token for location X," the design collapses instantly — someone could fetch a currently-valid token from anywhere and text it to a remote colleague, who checks in without ever visiting the building. The fix is a **per-kiosk device secret**, established once via a pairing flow, sent as a header on every "mint me a token" request. Only a device holding that secret can generate tokens for that location. This is the direct successor to QRoll's core lesson — never trust anything the *employee's own client* asserts as proof; the kiosk is a separate, trusted client, which is what makes the proof-of-presence real.

**Pairing flow** (mirrors the TA invite pattern — single-use, shown-once secret):
1. Org admin/manager clicks "Add Location" in the dashboard → server creates `kiosk_pairings/{code}` with a short (~10 min) expiry and a random 6-character code.
2. Dashboard shows: *"On the tablet, go to checin.app/kiosk/pair and enter: ABC123"*
3. On the tablet, entering the code calls `/api/kiosk/pair` (rate-limited, single-use, short-lived code — resistant to brute-forcing a 6-character space in 10 minutes).
4. Server generates a device secret, stores only its **hash** (never the raw value — same principle as password storage) in the Admin-SDK-only `kiosks/{locationId}` collection, and returns the raw secret to the tablet exactly once. The tablet stores it locally (localStorage/IndexedDB is acceptable here, since this is a single-purpose, physically-controlled device, unlike a general employee phone).
5. From then on, the kiosk calls `/api/kiosk/token` with that secret in a header every ~12 seconds (slight overlap with the 15s TTL to avoid a visible gap) and re-renders the QR.
6. **Lost/stolen tablet:** org admin clicks "Revoke & Re-pair" on that location, which invalidates the stored hash immediately and generates a fresh pairing code for a replacement device.

**Reporting/closing time windows (per location):** each location gets `reportingTime` and `closingTime` (e.g. "08:00"/"17:00", in the org's configured timezone) plus a `checkoutWindowMinutes` (e.g. 120, giving a 5:00–7:00 PM active check-out window). These do **not** gate whether scanning works — the kiosk's QR is always live and a scan always succeeds. They only drive two things: (1) the label the kiosk displays — "Scan to Check In" before `reportingTime`, "Scan to Check Out" during the closing window, a neutral idle label otherwise — computed server-side and returned alongside the token so the kiosk never decides this itself; and (2) two flags computed server-side on the resulting `clock_event`: `late: true` when a check-in happens after `reportingTime`, `earlyDeparture: true` when a check-out happens before `closingTime`. The actual in/out direction is still derived purely from the employee's own last event, exactly as before — the display mode is cosmetic and must never influence which action actually gets recorded, the same "kiosk is a dumb, trusted display, not a decision-maker" principle everything else here already follows.

**Client shape:** the employee-facing scan screen is an installable PWA (manifest + service worker, `start_url` pointing straight at the scan screen, not a dashboard) so the daily check-in/out is a single home-screen tap. The service worker exists for the install prompt and asset caching, not offline functionality — a scan is meaningless without reaching the server, since proving the token is still fresh *is* the security model. The manager/org-admin dashboard stays a normal (non-installed) web app; only the twice-daily employee action needs the one-tap treatment.



| Collection | Key fields |
|---|---|
| `kiosk_pairings/{code}` | orgId, locationId, status (`pending`/`consumed`), expiresAt |
| `kiosks/{locationId}` | orgId, `kiosk_secret_hash`, `kiosk_paired_at` — Admin SDK only, kept off `locations` because Firestore rules cannot hide one field from a reader |

`clock_events` stays as designed — `locationId` records which entrance the scan happened at, `geo` fields are simply dropped since there's no GPS to capture.



## 5. Firestore security rules pattern

```
function role() { return isSignedIn() ? request.auth.token.role : null; }
function orgId() { return isSignedIn() ? request.auth.token.orgId : null; }
function managerId() { return isSignedIn() ? request.auth.token.managerId : null; }

function inOrg(data) { return isSignedIn() && data.orgId == orgId(); }
function isOwnTeam(data) { return inOrg(data) && data.managerId == managerId(); }
function isOrgAdmin() { return role() == "org_admin"; }
function isManager() { return role() == "manager" || isOrgAdmin(); }
```

Every collection rule is then: org admins see everything in `inOrg()`, managers see `isOwnTeam()`, employees see only their own records within their team. This is exactly QRoll's `isOwnedByCaller()` pattern with one more layer — same shape, same reasoning, same "never trust a client-supplied owner/org id, always read it from custom claims" rule that closed QRoll's original vulnerabilities.

## 6. What's a direct port from QRoll (proven, don't rebuild)

- Admin-SDK-only access pattern for anything sensitive (never the client SDK for privileged writes)
- Vercel service-account credential handling (`admin.server.ts`'s `resolveCredential()`)
- Firestore-backed rate limiter (multi-instance safe)
- The token-verification approach itself (server-side, HMAC-signed, short-lived — the exact mechanism, applied to the rotating kiosk token)
- The invite-token pattern (single-use, email-bound, expiring)
- The whole push-notification suite, essentially unchanged

## 7. What's genuinely new

- The `orgId` tenancy layer and multi-company signup flow
- Real employee authentication (simpler than QRoll's model, not harder)
- Leave requests
- Multi-location support
- Billing (Stripe or similar — ChecIN is sold per-org/per-seat, unlike QRoll's single institutional license)
- Timesheet computation/export (start computed-on-read like QRoll's attendance %, add real aggregation once there's scale pressure)

## 8. Deferred to v2

- Shift scheduling, rotating shifts, overtime rules — high complexity, varies a lot by industry/country labor law, don't build until a real customer needs it
- Payroll system integrations
- Team sub-structure beyond one manager per employee (e.g. departments containing multiple managers)

## 9. Build order

1. Org signup + org_admin account creation
2. Generic invite system (manager invite, then employee invite reusing the same code)
3. Location setup (with reporting/closing hours) + kiosk pairing flow
4. Kiosk display (rotating QR + mode label) + verified-scan check-in/out route (no GPS)
5. Employee PWA shell (installable, one-tap scan)
6. Manager dashboard (team view, today's attendance)
7. Push notifications + announcements
8. Leave requests
9. Billing
