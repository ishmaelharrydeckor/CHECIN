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

Firestore bills per document read/write, so "cost" below is **document reads per operation**. The Spark (free) plan allows 50,000 reads, 20,000 writes and 20,000 deletes a day and then **stops serving requests**. Blaze (pay as you go) has no such stop, and Google Cloud budgets **alert but do not cap spending by default**. So the two plans fail differently: Spark fails as an **outage**, Blaze fails as a **bill**. Neither is acceptable as the plan for a design that wastes reads, which is why **fixing the read patterns comes first and the plan decision second** (D1). Exact per-read prices were not verified for this draft; check the Google Cloud Firestore pricing page for the nam5 rate before relying on any dollar figure.

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

**Interim implementation (shipped before the summaries exist).** `/api/attendance/today` and `/api/attendance/week` compute the same numbers on the server straight from today's (or this week's) raw `clock_events`, bounded by the org-timezone day and capped (1,500 / 4,000 events), with the roster and timezone cached for 5 minutes. This fixes correctness (K3) now. It does **not** meet the budget above: a poll costs about one read per event today plus nothing for the cached roster, so it is fine for a pilot-sized organization (tens of people) but must be replaced by the `team_days` rollup (task #23) before an organization passes roughly 100 people. The dashboard polls every 2 minutes while the tab is visible **and the person has touched the page in the last 10 minutes** (idle pause, `src/lib/idle-refresh.ts`), and the server keeps each answer for 45 seconds per organization (admin) or per team (manager) so several viewers share one calculation; the Refresh button bypasses it (not more than once every 5 seconds).

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

- **Usage monitoring on Spark** during the pilot: check the Firebase usage page against the daily quotas (reads 50k, writes 20k). **Budget alert** once on Blaze, at a low threshold. Alerts do not stop spending.
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
| D1 | Production Firebase plan | Stay on Spark / upgrade to Blaze with budget alert | **Fix the read patterns first (0.8, then 5.3), stay on Spark through the pilot while usage is monitored, and move to Blaze only before paying customers.** Blaze removes the hard stop, so it must not be the way we absorb wasteful reads. When on Blaze: budget alert at a low threshold, a daily-usage check, and the environment guard (section 7). Revisit if the pilot nears the 50k/day read quota before the fixes ship. |
| D2 | Kiosk revocation latency | Up to 60 s via cache TTL / instant via denylist read | **60 s TTL.** Revoke is for lost tablets, not live attacks. Revisit if a customer demands instant. |
| D3 | Backups on production | Firestore PITR / scheduled export / none | **PITR on**, small cost, enable before the pilot grows. |
| D4 | Employee changes manager | Events follow the employee / events stay with the old manager | **Events stay (immutable audit)**; reports query by `employeeId` and reach history through the *current* team membership. Needs a short design note before building 1.6. |
| D5 | Leave over balance | Block / allow negative / warn | **Block by default**, org-configurable later. |
| D6 | WFH approval | Self-declared / manager-approved | **Self-declared in v2**, as the roadmap says; revisit with a customer. |
| D7 | Greeting latency vs cost | 4 s poll (about 900 reads/h) / adaptive by location hours / 12 s with the token / push channel / drop the greeting | **Now: caching plus adaptive polling (4 s around reporting/closing time, 12 s otherwise). 12 s is a hard ceiling: the QR token is only valid for about 30-45 s, so the kiosk must refresh it at least that often.** At scale (section 12) polling cannot be the mechanism; decide push channel vs dropping the kiosk greeting before about 100 kiosks. A push channel is not available on serverless without extra infrastructure. |
| D8 | Org timezone | Keep browser-detected default / make it an explicit required choice / warn when on UTC | **Keep the default, add a visible warning while an org is on UTC and verify the pilot org's value.** Everything in section 6 depends on it being right. |
| D9 | Add a SQL database (Supabase / Postgres) | Switch everything / never / **hybrid later for reporting only** | **Hybrid, later, and only when a trigger fires** (section 12.6). Not now: it would not fix the polling cost, and a switch means redoing sign-in, rules and the security review while the pilot is live. |

---

## 11. Implementation order

Maps onto [V2-TASK-PLAN.md](V2-TASK-PLAN.md). New work items added by this design are marked **NEW**.

**Phase 0 additions (integrator, before teammates' features land):**
- **NEW 0.7** Fix K1 + K2: shared `dayKey` util with tests, `daily_summaries`, scan transaction rewrite, idempotent `scanId`. (Largest single risk reduction.)
- **NEW 0.8** Kiosk polling fix (5.1): cache, single read, 4 s greeting poll, adaptive by location hours. Fixes K4, K12. **Do this first:** a single kiosk left on all day used about the whole free read quota on Sep 28.
- **NEW 0.9** Usage monitoring on production (weekly check of the Firebase usage page against the 50k/day quota), PITR on, environment guard at startup. Blaze + budget alert is a later gate before the first paying customer, not a prerequisite (D1, D3, section 7).
- **NEW 0.10** Verify every existing org's timezone (pilot lab first); warn admins while an org is on the UTC fallback (D8).
- 0.6 tests: cover `dayKey`, scan direction, cooldown, scoping.

**Phase 1:** 1.1 leave (client-create stays), 1.3, 1.5 (now also K9, K11), 1.6 dashboard **built on `team_days`** (waits for 0.7; do not build it on the 30/200 lists), 1.2 employee page (reads own summaries).

**Phase 2:** 2.1 reports read summaries; 2.2 leave balances with server-side approval (5.5); 2.3 WFH on `day_status`; 2.4 analytics from rollups; 2.5 holidays (needed by leave day counting).

**Phase 3:** each starts with its own design note that extends sections 3, 5 and 6 of this document.

**Teammate impact.** 1.6 (Augustine) should **not** start on the current feed/history approach. Either wait for 0.7's `team_days`, or build the UI against a documented response shape and let the integrator provide the data route. Task 1.1 (leave) and 1.5/1.3 are unaffected.

---

## 12. Designing for millions

Sections 1-11 size the system for about 50 organizations. This section answers "what if ChecIN really grows to millions of users": which design choices must be right **now** because they are cheap today and brutal to change later, and which pieces of infrastructure to add **only when a measured threshold is crossed**. Firestore and Vercel can scale horizontally; what does not scale is a design that polls, recomputes, or funnels writes into one document.

### 12.1 What "millions" means (pick the one that is true)

| Scenario | Shape | Dominant pressure |
|---|---|---|
| A. Many small/medium orgs | 1M employees, 10,000 orgs, about 1 kiosk per 100 people | Total request volume, kiosk polling, cost per seat |
| B. A few huge enterprises | 100k employees in one org | Hot documents, report generation, per-tenant isolation |
| C. Millions of *events*, not users | What section 1 plans: 6.5M events a year | Bounded queries and summaries (already designed) |

The numbers below use **A** (the harder one for infrastructure). Assumptions: 2 scans per employee per day, 30% of staff scan within one 15-minute window in a time-zone band.

| Quantity | Result |
|---|---|
| Scans | 2M/day, about 23/s average, **about 330/s at the morning peak** |
| Kiosks | 10,000 |
| Kiosk polling **today** (2.5 s) | 4,000 requests/s around the clock = **346M requests/day**, about **576M Firestore reads/day** (10 h of use) |
| Kiosk polling after fix 5.1 (4 s, 1 read) | **about 90M reads/day** |
| Kiosk polling, adaptive (4 s in the hours around reporting/closing time, 12 s otherwise; this is what PR #27 implements) | **about 54M reads/day** |
| An employee's own usage after the fixes | about 230 reads/month (scans, dashboards, reports) |
| Kiosk reads per employee per month | about **2,700** after fix 5.1 with a flat 4 s poll; about **1,600** adaptive |

**The finding: after the section 5 fixes, the kiosk's polling is still 5-10x larger than all employee activity combined.** At millions of users it would be the largest line in the infrastructure bill and the biggest risk to availability, and no amount of caching removes a request that arrives every few seconds from thousands of devices. Polling is the wrong shape at that scale (D7). Note the floor: because a QR token lives only about 30-45 s, an idle kiosk can't poll slower than every 12 s, so adaptive polling roughly halves, not eliminates, the load. Only a push channel, or dropping the server-side greeting, changes the shape.

### 12.2 What breaks, in the order it will

1. **Kiosk polling (above).** Needs a different mechanism before the kiosk count reaches the hundreds: either adaptive polling by location hours (cheap, ships with 0.8), or removing the server-side greeting (the phone already confirms the scan; the kiosk greeting is a nicety), or a push channel with a narrowly scoped **device** credential. The last one must be designed against the AGENTS.md rule that a kiosk has no user account.
2. **Hot documents.** A single `team_days`/org rollup updated on every scan sustains about 1 write/second per document. A 50,000-person org with 40% scanning in 15 minutes is about **22 writes/second on one document**. Rollups must be **sharded counters** (N sub-documents, summed on read) or built **asynchronously** (a queue/cron job aggregating `daily_summaries`), not updated inline for large orgs. Per-person summaries (`daily_summaries`, one doc each) do not have this problem.
3. **Reports at volume.** Whole-org exports run past a serverless function's time limit. Move to background generation writing a file, and stream the raw-event history to **BigQuery** (export) for analytics so dashboards for big tenants don't query Firestore.
4. **Unit economics.** Cost per seat must be known and below the price per seat. Reads/writes per employee per month (above) feed that; so do auth, push and email. **Per-active-user pricing for Firebase Auth beyond its free tier**, SMS/email delivery, and Vercel invocations all scale with users. Verify current prices before setting a plan price (not verified in this draft).
5. **Data residency and latency.** The database is `nam5` (US). Customers in Ghana/EU have legal and latency considerations (Ghana Data Protection Act, GDPR). At scale, expect **regional deployments** (a database per region, tenants pinned to a region at signup). Keep `region` as a field on `organizations` from now, even though it only has one value.
6. **Noisy neighbors.** One huge or misbehaving org must not exhaust shared capacity: per-org rate limits and per-org daily quotas on expensive routes (reports, exports, invites), enforced with the existing Firestore-backed limiter.
7. **Operational maturity.** Service-level objectives (for example, "99.9% of scans complete under 2 s"), alerting on them, on-call, load testing, tested disaster recovery (a restore drill, not just backups enabled), an external penetration test, and (for enterprise buyers) SOC 2 or ISO 27001 evidence.

### 12.3 Cheap now, expensive later (do these in v2)

These cost almost nothing today and are painful to retrofit. Each is already in sections 3-6; this is the checklist:

- [ ] **Immutable, append-only `clock_events`** with deterministic ids and a client-generated `scanId` (idempotent retries).
- [ ] **`dayKey` computed once, server-side, in the org timezone**, stored on every event and summary.
- [ ] **Summaries and rollups are derived data**: always rebuildable from events by a job. Never the only copy.
- [ ] **Every query bounded** (limit + date range + cursor) and covered by an index. A route with an unbounded `.get()` is a defect.
- [ ] **No polling that reads a database.** New features use fetch-on-demand or change-detection on one small doc; the exception (kiosk) has a written budget and an adaptive interval.
- [ ] **`orgId` on every document**, `region` on `organizations`, and **no cross-org query anywhere** (so tenants can later be moved or sharded).
- [ ] **Schema versions** (`schemaVersion` on documents that will evolve) so migrations can run lazily.
- [ ] **Feature flags / plan gating on the server** (task 0.5), so expensive features can be switched off per tenant.
- [ ] **Per-org quotas and rate limits** on expensive routes.
- [ ] **Structured audit log** and a **correlation id** on every request, for tracing one scan across the system.
- [ ] **Environment guard** and separate staging (staging is done; the guard is task 0.9).
- [ ] **Load-test harness** in the repo: a script that simulates N employees scanning against staging. Without it, every capacity claim is a guess.

### 12.4 Add only when a measured threshold is crossed

| Trigger (measure it first) | Add |
|---|---|
| More than about 100 kiosks, or kiosk requests above about 100/s | Replace greeting polling (push channel or drop the greeting) |
| One org above about 2,000 people scanning in a short window | Async or sharded rollups |
| Any report taking over about 10 s | Background report generation, BigQuery export |
| First customer outside the US/Ghana with residency needs | Regional database + tenant pinning |
| Paying customers above about 50 orgs | SLOs, on-call rota, quarterly restore drill |
| First enterprise security questionnaire | Penetration test, SOC 2 readiness |
| Firestore cost per seat above target | Revisit data access patterns before anything else |

### 12.5 What not to do

- **No rewrite, no microservices, no Kubernetes.** A modular Vercel + Firestore monolith comfortably handles scenario C and a long way into A. The risk at scale is a bad access pattern, not the wrong platform.
- **Do not build sharding, BigQuery, regional deployments or a push gateway before the trigger fires.** They are real work and each has its own failure modes. Prepare the data model (12.3), measure, then build.
- **Do not claim a scale number you haven't load-tested.** "Millions" is a target; the load-test harness is how it becomes a fact.

### 12.6 Planned for later: Supabase (Postgres) for reporting, alongside Firebase

**Decision (D9): the owner agreed to use both, later.** Firebase stays the system of record and the identity provider. A SQL database is added **only for reporting and analytics** when one of the triggers below fires. Nothing is switched, and nothing is built for this before then.

**Why not now.** The database pressure comes from how often screens ask for data (kiosk polling, dashboard refresh), and those habits would follow us to any database. The fixes for that are #32 (kiosk and scan), the quick dashboard savings, and daily summaries (#23). Switching would also mean migrating sign-in, rewriting every access rule as row-level security, and repeating the security review, for no immediate benefit.

**Triggers (any one):**
1. Reports or insights need joins and aggregates that are painful in Firestore (for example "late arrivals by team by month", leave balances against attendance).
2. Firestore cost per customer becomes a number worth cutting.
3. A customer asks for a SQL export or direct read access to their data.
4. Phase 4 period views (week, month, quarter, year to date) become slow or expensive over raw summaries.

**Shape of the hybrid (guardrails, so adding it does not weaken what we have):**
- **Firebase Auth stays the only identity.** The server verifies the Firebase ID token and derives role, organization and manager from its claims, exactly as today. Supabase Auth is not used.
- **Server-only access.** The browser never talks to the SQL database. Only our server routes do, with a key held in environment variables (never in the repository, never `NEXT_PUBLIC`-style exposed). Every query is scoped by `orgId` (and `managerId` for managers) from the verified claims. Row-level security is turned on as a second layer, default-deny.
- **Firestore is the source of truth.** `clock_events` and the daily summaries keep being written first, in the same transaction as today. The SQL tables are a **derived copy** (loaded by a job or a write-behind step) that can be dropped and rebuilt from Firestore at any time. If the two ever disagree, Firestore wins.
- **Same design rules apply:** `orgId` on every row, `dayKey` computed in the organization's timezone, no polling that reads it, every query bounded.
- **Separate projects per environment:** a staging Supabase project and a production one, with different keys, like the Firebase split.
- **Plan tier:** a free Supabase project pauses after a quiet period, so production would use a paid plan with predictable cost (check current pricing at that time).

**First step when a trigger fires (a time-boxed experiment, about a day, nothing live changes):** load a copy of staging `clock_events` and summaries into a test Supabase project, run the real dashboard and report queries, and compare speed, cost and code simplicity against Firestore. Decide with those results.

**Risks to track:** two stores to keep consistent, one more secret to protect, a second place where tenant isolation must be right, and extra cost to run. If a trigger can be met cheaply inside Firestore (more summaries, BigQuery export), prefer that and keep the hybrid on hold.
