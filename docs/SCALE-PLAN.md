# ChecIN: Scale Plan

Status: **draft for the integrator's approval.** Turns the findings of the architecture review into ordered, reviewable work. It does not replace [SYSTEM-DESIGN.md](SYSTEM-DESIGN.md), which holds the reasoning; this file says what we do, in what order, and how we know each piece is done. Security rules in [AGENTS.md](../AGENTS.md) are fixed inputs.

## 1. Decisions made

| # | Decision | Detail |
|---|---|---|
| S1 | Stay on Vercel + Firestore | No rewrite, no microservices. Add a SQL store only when a trigger in SYSTEM-DESIGN 12.6 fires. |
| S2 | Design for both scenarios | Many small orgs *and* a few huge ones. Per-person documents only; no shared counters updated on every scan. |
| S3 | **Confirmation lives on the phone** | The scan response is the source of truth for "you are in/out". It comes from the transaction that wrote the record. |
| S4 | Kiosk greeting becomes optional | A per-location setting, **off by default**. The kiosk shows a data-free "scan received" cue. Revisit a push channel only at about 100 kiosks (D7). |
| S5 | Rules are mechanical, not just written | Lint/test and checklist items so AI-built PRs cannot quietly reintroduce unbounded reads or polling. |

## 2. Principles every change must follow

1. Every query is **bounded** (`limit`), **indexed** and **scoped by `orgId`** first.
2. **No polling that reads the database.** Fetch on demand, or check one small doc for change.
3. Time is computed **once, server-side, in the org timezone** (`dayKey`). Never the client clock or server locale.
4. `clock_events` are **immutable**; summaries are **derived and rebuildable** from them.
5. Writes are **idempotent** (deterministic IDs, client-generated `scanId`).
6. Anything touching **time, money or presence** needs a short design note in the PR before UI is built.

## 3. Work, in order

Each row is one PR into `staging`, one task per PR. Integrator-only unless stated.

| Step | Branch | What | Done when |
|---|---|---|---|
| **P0** | `feat/scale-guards` | Guardrails and hygiene (3.1) | CI fails on an unbounded query in `src/routes/api`; checklist updated; items below ticked |
| **P1** | `feat/load-test` | Load-test harness against staging (3.2) | One command simulates N employees and M kiosks and prints p50/p95 latency, reads/writes per scan, errors |
| **P2** | `feat/0-7-scan-summaries` | Scan rewrite plus `daily_summaries` (3.3) | Scan costs about 3 reads; retried request records once; tests pass; baseline vs after numbers recorded |
| **P3** | `feat/scan-confirmation` | Phone confirmation polish and optional greeting (3.4) | Success and failure states are unmistakable; greeting is a per-location toggle, default off |
| **P4** | `feat/1-6-today-from-summaries` | Manager dashboard on summaries (3.5); teammate task 1.6 unblocks | KPIs match event list; no 30/200-event polling |
| **P5** | `feat/team-days-rollup` | Rollups, only when the trigger fires (3.6) | Not started before a measured trigger |

Teammate tasks that do **not** depend on the above and can proceed now: 1.1 leave (done), 1.3 change password, 2.5 holidays. **Hold** 1.6 until P2 lands, and anything report-related until P4.

### 3.1 P0: guardrails and hygiene

- [ ] Test or lint rule: fail the build on a Firestore `.get()` with no `limit()` in `src/routes/api/**` (allow-list for known single-doc reads).
- [ ] [REVIEW-CHECKLIST.md](REVIEW-CHECKLIST.md): add an "access patterns" section (bounded, indexed, org-scoped, no polling, org-timezone times, design note for time/money/presence).
- [ ] [rate-limit.server.ts](../src/lib/rate-limit.server.ts): add an `expireAt` field on `rate_limits` documents (the Firestore **TTL policy** that deletes them needs the Blaze plan: when production moves to Blaze, enable it with `gcloud firestore fields ttls update expireAt --collection-group=rate_limits --enable-ttl --project <project>`; until then old counters simply stay); **fail closed** for kiosk pairing and invite redemption (keep fail-open for login); key authenticated routes by uid, unauthenticated by IP.
- [ ] Add `limit()` to the unbounded reads found in `staff-invites.ts`, `attendance-data.server.ts` and `push-service.server.ts` (page where a limit would hide data).
- [ ] Add `region` (value `nam5`) and `schemaVersion` to new and existing `organizations` documents.
- [ ] Structured log line plus a **correlation id** on scan, pair, invite and approve routes; define the `audit_logs` schema.
- [ ] Environment guard: refuse to start a Preview deployment pointed at the production project id.
- [ ] Ops, no code: turn on **point-in-time recovery** (production), confirm every org's timezone (pilot lab first, warn while on the UTC fallback), start the weekly Firebase usage check.

### 3.2 P1: load-test harness

- A script under `scripts/` that mints test employees on **staging only** and drives scans and kiosk polling at a chosen rate. Refuses to run against the production project id.
- Run it **before P2** to record the baseline (reads/writes per scan, latency at 50, 200 and 1,000 employees). Run again after P2 and compare. Every capacity claim in the docs cites a run.

### 3.3 P2: scan rewrite (task 0.7)

- `daily_summaries/{employeeId}_{dayKey}`: firstIn, lastOut, minutesWorked, late, earlyDeparture, state, eventCount, `lastEventType`, `lastEventAt`, `schemaVersion`. Server-written only.
- Client sends a generated `scanId`; it becomes the `clock_events` doc id (`create`, not `set`), so a retried POST cannot double-record.
- One transaction writes the event, the summary and `recent_scans`. Direction and cooldown come from one `get` of the summary, replacing the last-event query.
- Times formatted with the org timezone (fixes K8: `formatClock` in `attendance-day.ts`).
- Cache the kiosk/location/org lookup (shared with the token route through `kiosk-loader.server.ts`) and the person's display name (5 minutes), so a scan reads today's summary and, on the **first scan of the day only**, the person's profile: **1 to 2 reads (about 1.5 on a normal in-and-out day), 2 writes**, down from about 4 to 5 reads. Measured on staging: about 2 reads per scan when every person scans once (the profile cache never helps across hours); the name and department now live on the summary so the second scan of the day skips the profile read.
- **Missed check-out is derived, not scheduled.** A summary still `state: "in"` on a day that has ended is "incomplete" (`isIncomplete()` in `daily-summary.ts`), decided when read. This replaces the nightly Vercel Cron job in the earlier draft: nothing to schedule, nothing to fail silently.
- **Not in P2:** K6 (`department` is still copied from the client-writable profile). Making it admin-set needs a rules change and a screen; it is its own small task.
- **Rollout order:** deploy `firestore.rules` (staging first) -> deploy the code -> run `node scripts/backfill-summaries.mjs --from <first day> --to <today>` once (or set `SUMMARY_LEGACY_FALLBACK=1` for the first day, then remove it). Summaries are derived, so the backfill is safe to re-run.
- Tests: `daily-summary.test.mjs` (summary maths, direction, cooldown, forgotten check-out, rebuild-equals-live) and `formatClock`; `dayKey` boundary tests already exist in `attendance-day.test.mjs`.

### 3.4 P3: confirmation and greeting

- Phone ([ScanResultOverlay.tsx](../src/components/scan/ScanResultOverlay.tsx)): full-screen result (mint for in, butter for out) with the time, location and "Marked late" / "Left early"; vibration and a short tone where the phone allows; every **failure** is a full-screen message that says the check-in was **not recorded**, in plain language ([scan-result.ts](../src/lib/scan-result.ts), tested). The idle screen shows "Last recorded: IN at 08:52" from the status endpoint.
- A retry after a dropped connection reuses the same `scanId` (per entrance, for 60 s), so it records once; a cooldown answer says the earlier scan counts.
- Kiosk greeting is a per-location setting (Settings > location hours), **off by default**. With it off the tablet never asks for scans and shows "Your phone shows your check-in result".
- **Live greeting (approach 7, decided after comparing ten options).** Where the greeting is on, each paired tablet has a private channel: one document `kiosk_channels/{channelId}` holding only `{ type, at }`. The scan route writes it **after** the check-in is saved (best effort, 400 ms cap, throttled to one write per 500 ms), and the tablet watches it, so the card appears in about a second. The card is **nameless** ("Welcome" / "Goodbye", "Clocked IN" / "Clocked OUT", the time).
  - **Security.** The rules add ONE deliberate exception to default-deny: anyone who knows a channel's address may read that single document (`get` only; never list or write). The address is 32 random bytes, known only to the server and that tablet, never in the QR code. The note holds nothing identifying, and a test fails the build if its fields change or anything else writes to `kiosk_channels`. Re-pairing a tablet rotates its address. Anyone who can open developer tools on the tablet already holds its device secret, which is worse, so this adds no new reader.
  - **Fallback.** If the live link is down (no connection within 10 s, or the browser reports it offline) the tablet asks the server every 4 s for any scan newer than the last one it showed, and returns to the live link when it recovers. Fallback costs one read per ask and only while down. It also fixes the old "12-second window" bug: the tablet says which scan it last saw, so none is lost between slow polls.
  - **Cost.** About one read per scan (the tablet's listener), instead of 2,400 to 7,200 per tablet per day for polling. The QR refresh no longer reads anything for the greeting.
  - **Stale and clock safety.** The tablet judges a note's age by the server's clock (sent with every QR refresh), shows nothing older than 15 s, and never shows a note twice.
  - **Known risks (see the design discussion):** anyone with the address can run up reads (mitigate with App Check and a budget alert, both set up in the Firebase/Google Cloud consoles, not in code); a dead connection means no greeting (the status line on the tablet says "reconnecting"); not yet tested on a physical tablet or over days of uptime.
  - **Rollout:** deploy `firestore.rules` to staging first, then merge. Tablets pick up their channel address on their next QR refresh (no re-pairing). The old `recent_scans` collection is no longer written; delete it when convenient.

### 3.5 P4: dashboard on summaries

- `/api/attendance/today` and `/api/attendance/week` now read `daily_summaries` (one document per person per day) instead of folding raw events. The response shape is unchanged, so the dashboard page needed no change and **teammate task 1.6 is unblocked**: build on those two routes.
- Cost per refresh: about (people on the team + 20) reads for "today", (people x 5) for the week, regardless of how many scans happened. A 250-person team is about 270 reads per refresh (cached 45 s per team). That is a large drop for big teams but still grows with team size: the `team_days` rollup in P5 is what makes it constant, and it waits for the trigger below.
- One meaning changed: "average shift" is the mean of each person's total worked minutes for the day (it used to average each separate in-to-out session).
- New composite indexes for the week range: `daily_summaries (orgId, dayKey)` and `(orgId, managerId, dayKey)`. Deploy `firestore.indexes.json` before the code; a missing index shows up as a failed weekly chart.
- **Rollout order matters:** deploy rules and indexes, deploy the code, run `scripts/backfill-summaries.mjs` for the days you want history for. Until summaries exist for a day the dashboard shows that day as empty.
- Not done: `/api/attendance/feed` is no longer called by any page. It can be deleted (it is a route that reads other people's data with no caller left); left in place because removing a route is the integrator's call.
- Reports (task 2.1) should read summaries too: `loadScopedSummaries` in `attendance-data.server.ts` is the shared loader.

### 3.6 P5: only when a trigger fires

| Trigger (measure first) | Add |
|---|---|
| One org above about 2,000 people scanning in one window | Sharded or asynchronous `team_days` rollups |
| Any report over about 10 s | Background generation, BigQuery export |
| More than about 100 kiosks | Replace greeting polling (push channel or drop it) |
| First customer with residency needs | Regional database, tenant pinning by `region` |
| First enterprise questionnaire | Penetration test, SOC 2 readiness |
| Cost per seat above target | Re-examine access patterns before anything else |

## 4. Design notes required before the feature (no code until agreed)

| Topic | Question | Recommendation |
|---|---|---|
| **K7: employee changes manager** | Do events follow the employee or stay put? | Events stay (immutable audit); reports reach history through the *current* team. Needed before P4. |
| **Shifts and night shifts (3.1)** | What is "the day" when a shift crosses midnight? | Attribute events to the shift's start day; keep `dayKey` a stored field so it can be recomputed. |
| **Payroll integrations** | How do exports stay exact and repeatable? | Rebuildable summaries plus a "lock this pay period" state after approval. |
| **Scheduled reports (3.3)** | How do cron jobs avoid sending twice? | Idempotent per `(scheduleId, periodKey)` on Vercel Cron. |
| **Per-seat pricing** | What does one employee cost per month? | Take reads/writes per employee from the P1 harness before setting a price. |

## 5. Roadmap features against this plan

| Feature | Status |
|---|---|
| Leave (1.1, 2.2), WFH (2.3), holidays (2.5), billing (1.7), push, announcements | Fit as designed; no changes needed |
| Dashboard (1.6), reports (2.1, 2.4), employee page (1.2) | Wait for P2 (reports for P4) |
| Shifts, divisions, payroll | Wait for their design notes above |

## 6. Risks

- **A single unbounded query or poll undoes this.** Mitigation: P0 lint and checklist.
- **Rule or index changes are integrator-only** and gate P2; deploy to staging first, production only with explicit OK and `--project production`.
- **Spark plan quota** (50k reads/day) can stop check-ins before fixes ship. Check usage weekly; move to Blaze with a budget alert before the first paying customer.
- **No measurements yet.** "Millions" stays a target until P1 numbers exist.

## 7. Open items for the integrator

1. Approve this order (P0, P1, P2, P3, P4).
2. Confirm the greeting default: off.
3. Confirm who writes the K7 note (suggest: integrator, short).
4. Confirm Blaze timing: before first paying customer.
