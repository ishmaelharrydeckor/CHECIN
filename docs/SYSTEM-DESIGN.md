# ChecIN: System Design (v2)

Status: **draft for the integrator's review.** Written against the code as of `staging` on 2026-10-02. Companion to [ChecIN-Architecture-v1.md](ChecIN-Architecture-v1.md) (what v1 set out to be), [ChecIN-V2-Feature-Roadmap.md](ChecIN-V2-Feature-Roadmap.md) (what v2 adds) and [V2-TASK-PLAN.md](V2-TASK-PLAN.md) (who builds what). Security rules in [AGENTS.md](../AGENTS.md) are fixed inputs here, not up for redesign.

How to read this: sections 1–4 describe the system, 5–8 are the design rules the v2 features must follow, 9 lists defects found in today's code, 10 lists decisions that need an owner, 11 maps all of it to tasks. Anything marked **(assumption)** is my estimate and needs confirming.

---

## 1. Goals, constraints, scale

**Goals.** Reliable, tamper-resistant attendance for companies of 10–250 people; a manager sees who's in *right now*; employees see their own history and leave; org admins get reports. Cheap to run at small scale, no re-architecture before ~50 customer orgs.

**Constraints.** No GPS (kiosk QR only). Tenant isolation is absolute (orgId). Roles live in custom claims only. Team is non-technical and builds through AI chats; reviewer is one person. Hosting is Vercel (serverless), data is Firestore, identity is Firebase Auth.

**Scale targets (assumption, confirm with the pilot):**

| Dimension | v2 target | Headroom to design for |
|---|---|---|
| Organizations | 50 | 500 |
| Employees per org | up to 250 | 1,000 |
| Kiosks per org | up to 5 | 20 |
| Managers per org | up to 20 | 100 |
| Scans per org per day | ~500 (250 people x in/out) | 2,000 |

Peak write load is trivial: 250 people arriving over 15 minutes is under one scan per second per org. **The system will not struggle with writes. It will struggle with read amplification (polling, unbounded lists, recomputing from raw events) and with correctness around time.** Sections 5–8 are about those two things.

Data volume: 250 people x 2 events x 260 days = about 130k events per org per year; 50 orgs is about 6.5M documents a year. Fine for Firestore *if* every query is bounded and indexed.

---

## 2. Architecture

```
 Employee phone (PWA)      Kiosk tablet (no user)        Manager/Admin web app
 /scan  signs in as person /kiosk  device secret only    /dashboard etc. signs in as person
        |  ID token                |  device secret header          |  ID token
        v                          v                                v
 +----------------------------------------------------------------------------------+
 |  Vercel: TanStack Start + Nitro server routes  (src/routes/api/**)               |
 |  verifyCallerToken()  -> role/orgId/managerId from verified claims               |
 |  kiosk token, scan, invites, leave, reports, push                                |
 +-------------------------------+--------------------------------------------------+
                                 | firebase-admin (service account, server only)
            +--------------------+---------------------+
            v                                          v
     Firebase Auth                              Firestore (default DB, nam5)
     (users, custom claims)                     rules = default-deny; clients may
                                                read a few collections directly
```

Key properties, all already true in the code:

- **Three clients with three trust models.** Phone proves *who*, kiosk proves *where*, dashboard is a person with elevated reach. Never merged.
- **All privileged writes go through server routes** using the Admin SDK. The few client-side Firestore writes (`users` profile, `user_devices`, `leave_requests` create) are narrowly scoped by rules.
- **Environments.** `main` -> production (Firebase `checin-d172e`). `staging` and every feature branch -> Vercel Preview -> `checin-staging`. Separate service accounts, separate secrets. See [STAGING-SETUP.md](STAGING-SETUP.md).

**What serverless implies for design.** Each request may hit a different instance; in-memory state is per-instance and short-lived. So: caches must be short-TTL and safe to be wrong for that long; rate limits and counters must live in Firestore (as they do); no long-lived connections (so no websockets/SSE from Vercel functions); scheduled work needs Vercel Cron or Cloud Scheduler, not `setInterval`.

---

## 3. Data model

### 3.1 As built today (read from the code)

| Collection | Written by | Read by | Notes |
|---|---|---|---|
| `organizations` | server | members (client) | name, timezone, plan fields server-managed |
| `users` | client (display fields) + server | self / team (client) | `department` is client-writable, see K6 |
| `locations` | org_admin (client) | org members | hours: reportingTime, closingTime, checkoutWindowMinutes |
| `kiosks` | server | server | secret **hash** only |
| `kiosk_pairings`, `staff_invites`, `rate_limits` | server | server | locked |
| `clock_events` | server only (scan) | role-scoped (client + server) | append-only; denormalizes name, email, department, managerId |
| `recent_scans` | server | server | one doc per location, overwritten each scan; drives the kiosk greeting |
| `leave_requests` | client create, manager update | role-scoped | rules exist, **no UI yet** |
| `announcements`, `push_*`, `in_app_notifications`, `notification_preferences` | server | mixed | |
| `user_devices` | client | owner | device/session tracking |
| `audit_logs` | server | none | written, not in rules (default-deny) |

### 3.2 Conventions for every new collection

1. **Every doc carries `orgId`.** Team-scoped docs also carry `managerId`. Rules check these against claims.
2. **Deterministic doc IDs wherever a natural key exists** (`{orgId}_{employeeId}_{dayKey}`), so writes are idempotent and a lookup is a `get`, not a query.
3. **Times.** Instants are stored as ISO-8601 UTC strings (as `clock_events.timestamp` is). **Calendar days are stored as `dayKey` = `YYYY-MM-DD` in the org's timezone**, computed server-side only (see section 6). Never compute "today" from the client clock or the server's local time.
4. **Denormalize display fields, never authority.** Copying `employeeName` onto an event is fine. Copying anything that grants access (`managerId`) is a decision with consequences (K7).
5. **No client may write a document that another role will trust.** If a manager's report reads a field, that field is server-written or manager-written, not employee-written.
6. **Plan gating** (`requireFeature()` from one tier table, task 0.5) is checked on the server for every paid feature. Rules do not check plans.

### 3.3 New collections for v2

| Collection | Doc ID | Key fields | Written by | Feature |
|---|---|---|---|---|
| `leave_types` | `{orgId}_{typeKey}` | name, accrual rule, annualAllowance, paid | org_admin via server | 2.2 |
| `leave_balances` | `{employeeId}_{year}` | per type `{allotted, used, remaining}` | **server only**, in a transaction | 2.2 |
| `leave_requests` (extend) | auto | + typeKey, days (computed server-side excluding holidays/weekends), reviewedBy/At, note | employee create; server approves (see 5.5) | 1.1, 2.2 |
| `day_status` | `{employeeId}_{dayKey}` | status: `wfh` / `leave` / `holiday`, source | employee (WFH) / server (leave, holiday) | 2.3 |
| `holidays` | `{orgId}_{dayKey}` | name | org_admin | 2.5 |
| `daily_summaries` | `{employeeId}_{dayKey}` | firstIn, lastOut, minutesWorked, late, earlyDeparture, state, eventCount, `lastEventType` | **server only**, updated inside the scan transaction | 2.4, 1.6 |
| `team_days` | `{orgId}_{managerId}_{dayKey}` | counts: present, late, onLeave, wfh, absent; `updatedAt` | server only | 1.6, 2.4 |
| `shifts`, `shift_assignments` | auto | definition / employee+day+shift | org_admin / manager | 3.1 |
| `report_schedules` | auto | recipients, cadence, reportType | org_admin | 3.3 |
| `divisions` | auto | name; managers reference `divisionId` | org_admin | 3.4 |
| `subscriptions` | `{orgId}` | plan, seats, status (from billing provider webhook) | **server only** | 1.7 |

Presence has **four states per employee per day**: in-office (scan), WFH, on leave, absent. Absent is *derived* (no scan, no leave, no WFH, not a holiday, a working day), never stored per employee.

---

## 4. Authorization

Unchanged from AGENTS.md; v2 adds only these rules:

- Rules pattern for every new collection: `orgId` first, then `managerId`/`employeeId`, default-deny for anything not listed.
- **Anything derived from money or time off is server-written** (`leave_balances`, `daily_summaries`, `subscriptions`). Clients may read their own; they never write.
- Every new route starts with `verifyCallerToken`, then an explicit role check, then an org check on any ID taken from the request (`locationId`, `employeeId`) against `caller.orgId`. `docs/REVIEW-CHECKLIST.md` is the review gate.
- Employees acting on a record always match `employeeId == caller.uid` from the **token**, never from the body.

---

## 5. Core flows: design and cost budgets

Firestore bills per document read/write, so "cost" below is **document reads per operation**. The Spark (free) plan hard-stops at about 50k reads and 20k writes a day; on Blaze (pay as you go) the same volume costs cents to a few dollars a month, so **the real risk of overshooting is an outage on Spark, not a big bill** (D1).

### 5.1 Kiosk token + greeting

Today (`src/routes/api/kiosk/token.ts`, `src/routes/kiosk.tsx`): the kiosk calls `/api/kiosk/token` **every 2.5 s**; each call does 4 reads (`kiosks`, `recent_scans`, `locations`, `organizations`). That is 1,440 calls/hour x 4 = **5,760 reads per kiosk-hour, about 46k per 8-hour day, roughly the whole free daily quota for one entrance.**

Design:

1. The token is a pure function of `(locationId, timeBucket)` and needs **no read**. Only the secret check, label and greeting need data.
2. **Cache `{kiosk hash, orgId, location hours, org timezone}` per location in server memory for 60 s.** Consequence: revoking a stolen tablet takes up to 60 s to take effect (acceptable for a physical-presence control; if not, revocation can also write a short denylist doc, see D2).
3. **Greeting check = one read** of `recent_scans/{locationId}`; poll every **4 s**, not 2.5 s.
4. Budget: about 900 reads/hour/kiosk, **under 10k per day**, a reduction of roughly 85%.
5. AGENTS.md says the kiosk requests a token every ~12 s; the code is far chattier than the spec. The spec value is fine for the QR itself; only the greeting needs to be faster.

### 5.2 Scan (check-in / check-out)

Flow stays: phone sends `{token, locationId}` + its own ID token; server verifies kiosk token, tenancy, then records the event in one transaction. Changes for v2:

1. **Direction from the employee's state today**, not "last event ever" (K1, K2): read `daily_summaries/{employeeId}_{dayKey}` (a `get`, 1 read). `lastEventType` there decides in vs out. No query, no index, no 10-event scan.
2. **One transaction writes three things:** the `clock_events` doc (immutable audit record), the `daily_summaries` doc (firstIn, lastOut, minutes, late, state) and the `recent_scans` doc.
3. Cache the kiosk/location/org lookups as in 5.1. Remaining reads: user display name (or put the name in the token), the summary, about 2–3 total (today about 14).
4. 60 s cooldown stays, evaluated against `summary.lastEventAt`.
5. Idempotency: a retry of the same request must not double-record. Use a client-generated `scanId` as the event document ID (`create`, not `set`), so a retried POST fails safely.

### 5.3 Manager dashboard ("today")

Today the page polls `/api/attendance/feed` every 60 s while visible, and each call reads up to 30 `clock_events` (**30 reads/min = about 14k reads per 8-hour day per open tab**), plus 200 events on load (`/api/attendance/history`). KPIs such as "present today" are computed on the client from those capped lists, so they become **wrong** once a team produces more events than the cap (K3).

Design:

1. KPIs come from **`team_days/{orgId}_{managerId}_{dayKey}`** (1 read), maintained by the scan transaction and by leave/WFH changes. Org admins read the org rollup (`{orgId}_ALL_{dayKey}`).
2. The live feed shows **today's events only, `limit(20)`**, using an index on `(orgId, managerId, dayKey, timestamp desc)`.
3. Polling checks `team_days.updatedAt` (1 read) every 30 s and fetches the feed **only if it changed**. A quiet dashboard costs about 120 reads/hour.
4. Late list = `daily_summaries where managerId == X and dayKey == today and late == true`, bounded by team size.
5. Budget: **under 1k reads per manager-day** instead of about 15k.

### 5.4 History, timesheets, reports

1. Always **paginated and date-bounded** (`dayKey` range, cursor-based). No query without `limit` in `src/routes/api` (K, section 9).
2. **Reports read `daily_summaries`, not `clock_events`.** A month for 250 people is 250 x 22 = 5,500 reads, not 11,000 raw events. The raw events remain the audit trail and are used only to answer disputes for one person/day.
3. Large exports (year, whole org) are **generated server-side in chunks** and streamed; client-side CSV building from a full dataset is not allowed beyond a few thousand rows.
4. Scheduled delivery (3.3) uses Vercel Cron to run a route that is idempotent per `(scheduleId, periodKey)`.

### 5.5 Leave

1. Employee creates a request (client write allowed by rules today: `status == pending`, own team).
2. **Approval goes through a server route**, not a client update, once balances exist (2.2): in one transaction it checks the request is still pending and owned by the caller's team, recomputes `days` excluding weekends/holidays (server-side, not trusted from the client), decrements `leave_balances`, writes `day_status` docs for each leave day, then sets `status`.
3. Negative balance policy is an org setting (block / allow / warn). **Default: block.** (D5)
4. Holidays and weekends never consume leave days.

### 5.6 Work-from-home

Employee declares a day (`day_status` doc, status `wfh`, written via a small server route so it can check the day isn't already a leave day and the plan allows it). Counts as **present** in `team_days`/summaries. Managers see it; no approval flow in v2 (D6).

---

## 6. Time and "the attendance day"

This is the single biggest correctness area and the source of bugs K1, K2 and K8.

1. Each organization has an IANA timezone (`organizations.timezone`). **Sign-up already captures it** (browser-detected default, editable, "Primary Timezone"); an invalid value silently falls back to `UTC`. Gaps: orgs created before this existed or that fell back to UTC (check the pilot lab's org), and no warning when an org is still on UTC.
2. `dayKey(instant, tz)` is one shared pure function in `src/lib/` and the *only* place days are computed, alongside `attendance-windows.ts`. It gets unit tests (DST, midnight, month ends, UTC+/-13).
3. **Missed check-out.** If an employee's last event was `in` on a previous `dayKey`, that day's summary is closed as `incomplete` by a **daily reconciliation job** (Vercel Cron, per org, shortly after local midnight), and the next day's first scan is `in`. Today the first scan the next morning wrongly becomes `out`.
4. **Night shifts (3.1)** cross midnight. Attribute an event to the **shift's start day**: the summary key is the shift day, not the calendar day. Do not build shift logic until this model is agreed; keep `dayKey` a stored field so it can be recomputed.
5. Every user-visible time is formatted with the **org timezone** on the server or on the client with `Intl` and an explicit `timeZone`; never the server's locale (K8).

---

## 7. Reliability, operations, failure modes

| Failure | Effect | Design response |
|---|---|---|
| Firestore daily quota hit (Spark) | Reads/writes fail, **check-ins stop** | D1: move production to Blaze with a budget alert; fix polling (5.1, 5.3) |
| Kiosk offline / tablet asleep | No QR rotation | Kiosk shows "offline" state locally and retries with backoff; no decisions made locally |
| Clock skew on tablet | Token bucket mismatch | Server already owns the bucket (`secondsRemaining` returned) and accepts current +/-1 bucket (45 s window, `kiosk-crypto.server.ts`); no change needed |
| Double scan / retried request | Duplicate events | `scanId` as doc ID (5.2) + 60 s cooldown |
| Stolen/lost tablet | Anyone could mint tokens | Revoke hash; cache TTL bounds the delay (D2) |
| Staging pointed at production data | Test data in prod | Separate projects and keys (done), build-time check below |
| Bad deploy | Broken app | Vercel instant rollback to previous deployment; `main` only changes via reviewed `staging` |
| Data loss / bad admin action | Lost records | Enable Firestore point-in-time recovery or scheduled exports on production (D3) |

Operations to put in place:

- **Budget alert** on production (needs Blaze). Alert at a low threshold.
- **Environment guard:** at server start, log `FIREBASE_PROJECT_ID`, and refuse to start if `VERCEL_ENV == "preview"` and the project ID equals the production project ID. This would have caught the earlier staging mix-up automatically.
- **Structured logs** for scan, pair, invite, approve actions (who, org, action, outcome). `audit_logs` exists; define its schema and write to it from every privileged action.
- **Quota and error monitoring:** Firebase usage dashboard weekly during the pilot; Vercel function error rate.
- **Secrets:** rotation procedure documented; the production admin key must not live in Downloads/OneDrive.
- **Backups/retention:** decide retention for `clock_events` and personal data per the markets served (Ghana's Data Protection Act applies; get a short legal read before the first paying customer).

---

## 8. Scaling path (what breaks first, in order)

1. **Polling reads** (now). Fixed by 5.1 and 5.3.
2. **Reports and dashboards over raw events.** Fixed by `daily_summaries` and `team_days`.
3. **Per-instance caches** become less effective as Vercel scales out; acceptable because the data is tiny and TTL is short.
4. **Hot documents.** `team_days` for a large team updated by many scans in a few minutes can hit Firestore's roughly 1 write/second per-document sustained limit. At 250 people that is fine; at 1,000 in one team, shard the counters (N sub-docs summed on read).
5. **Report generation time** exceeds Vercel function limits for big orgs: move to chunked/background generation.
6. **Beyond about 500 orgs**, revisit whether reporting wants a relational store (BigQuery export of `clock_events` is the low-effort first step). Not before.

---

## 9. Defects found in the current code

Found while reading the code for this design; **none of these are fixed by this document.** Severity is about customer impact. Each maps to a task in section 11.

| # | Severity | Where | Problem |
|---|---|---|---|
| K1 | **High** | `src/routes/api/check-in/scan.ts` (event lookup) | The direction/cooldown query is `where employeeId == uid .limit(10)` with **no `orderBy`**. Firestore returns the first 10 by document ID (random), not the latest, so after about 10 events per employee the "last event" is arbitrary: wrong in/out and wrong cooldown. |
| K2 | **High** | same | Direction ignores the day: if someone forgets to check out, the next morning's first scan is recorded as **out**. AGENTS.md says "last event *today*". |
| K3 | **High** | `src/routes/_authenticated/dashboard.tsx` | KPIs derive from capped lists (feed 30, history 200), not from today's data; they silently undercount as volume grows. Needs confirming against the exact computation. |
| K4 | Medium | `kiosk.tsx`, `kiosk/token.ts` | 4 reads per 2.5 s per kiosk (about 46k reads/day). Section 5.1. |
| K5 | Medium | `dashboard.tsx`, `attendance/feed.ts` | 30 reads/min per open dashboard tab, plus 200 on load. Section 5.3. |
| K6 | Medium | `firestore.rules` (`users`), `scan.ts` | `department` is self-writable and copied onto every event, so an employee can label themselves into any department in manager reports. Make it manager/admin-set, server-written. |
| K7 | Medium | `clock_events.managerId` | Denormalized at write time. If an employee changes manager, old events stay with the old manager and vanish from the new one's history. Needs a reassignment policy (D4). |
| K8 | Low | `scan.ts`, `feed.ts`, `kiosk/token.ts` | `toLocaleTimeString()` on the server uses server locale/UTC, not org timezone. Greeting and feed times can be wrong. |
| K9 | Low | `admin/seed-demo.ts` | Writes **fake clock events and fake employees into the caller's real org**. Authorized (org_admin only) but pollutes real data and reports. Remove or gate to non-production (task 1.5). |
| K10 | Low | `routes/auth.tsx` | Error help text hardcodes the production Firebase project ID; wrong on staging. Derive from env. |
| K11 | Low | `api/auth/demo-login.ts`, `login-direct.ts` | Disabled stubs returning 410; harmless but dead. Delete. |
| K12 | Low | docs vs code | Kiosk poll interval (2.5 s) vs spec (about 12 s). |

---

## 10. Decisions needed

Each has a recommendation; none is irreversible except where noted.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Production Firebase plan | Stay on Spark / upgrade to Blaze with budget alert | **Blaze + alert.** Spark's hard daily cap would stop check-ins during the pilot. Needs your billing details. |
| D2 | Kiosk revocation latency | Up to 60 s via cache TTL / instant via denylist read | **60 s TTL.** Revoke is for lost tablets, not live attacks. Revisit if a customer demands instant. |
| D3 | Backups on production | Firestore PITR / scheduled export / none | **PITR on**, small cost, enable before the pilot grows. |
| D4 | Employee changes manager | Events follow the employee / events stay with the old manager | **Events stay (immutable audit)**; reports query by `employeeId` and reach history through the *current* team membership. Needs a short design note before building 1.6. |
| D5 | Leave over balance | Block / allow negative / warn | **Block by default**, org-configurable later. |
| D6 | WFH approval | Self-declared / manager-approved | **Self-declared in v2**, as the roadmap says; revisit with a customer. |
| D7 | Greeting latency vs cost | 4 s poll (about 900 reads/h) / 12 s with the token / push channel | **4 s poll with caching.** A push channel (websocket/SSE) is not available on serverless without extra infrastructure. |
| D8 | Org timezone | Keep browser-detected default / make it an explicit required choice / warn when on UTC | **Keep the default, add a visible warning while an org is on UTC and verify the pilot org's value.** Everything in section 6 depends on it being right. |

---

## 11. Implementation order

Maps onto [V2-TASK-PLAN.md](V2-TASK-PLAN.md). New work items added by this design are marked **NEW**.

**Phase 0 additions (integrator, before teammates' features land):**
- **NEW 0.7** Fix K1 + K2: shared `dayKey` util with tests, `daily_summaries`, scan transaction rewrite, idempotent `scanId`. (Largest single risk reduction.)
- **NEW 0.8** Kiosk polling fix (5.1): cache, single read, 4 s greeting poll. Fixes K4, K12.
- **NEW 0.9** Production on Blaze + budget alert; PITR on; environment guard at startup (D1, D3, section 7).
- **NEW 0.10** Verify every existing org's timezone (pilot lab first); warn admins while an org is on the UTC fallback (D8).
- 0.6 tests: cover `dayKey`, scan direction, cooldown, scoping.

**Phase 1:** 1.1 leave (client-create stays), 1.3, 1.5 (now also K9, K11), 1.6 dashboard **built on `team_days`** (waits for 0.7; do not build it on the 30/200 lists), 1.2 employee page (reads own summaries).

**Phase 2:** 2.1 reports read summaries; 2.2 leave balances with server-side approval (5.5); 2.3 WFH on `day_status`; 2.4 analytics from rollups; 2.5 holidays (needed by leave day counting).

**Phase 3:** each starts with its own design note that extends sections 3, 5 and 6 of this document.

**Teammate impact.** 1.6 (Augustine) should **not** start on the current feed/history approach. Either wait for 0.7's `team_days`, or build the UI against a documented response shape and let the integrator provide the data route. Task 1.1 (leave) and 1.5/1.3 are unaffected.
