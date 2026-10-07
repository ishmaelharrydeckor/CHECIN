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
- Times formatted with the org timezone (fixes K8); `department` stops being copied from the client-writable profile (K6).
- Cache user display name and location/org lookups (kiosk-cache pattern) so a scan is about 3 reads.
- **Migration:** if no summary exists for today, fall back to the last-event query once and create it; add a backfill script (rebuilds summaries from events, safe to re-run).
- Shared-file changes (integrator): rule for `daily_summaries` (employee reads own, manager reads team, org-scoped, no client writes), composite indexes, `firestore.indexes.json`; deploy to staging first.
- Tests: `dayKey` (DST, midnight, month ends, UTC+/-13), direction, cooldown, idempotent retry, scoping.
- Missed check-out job (Vercel Cron, per org after local midnight): close yesterday's open summary as `incomplete`.

### 3.4 P3: confirmation and greeting

- Phone: full-screen result (green in, amber out) with time and late/early flag; vibration; clear **failure** states (expired token, cooldown, offline, wrong organization); idle screen shows "Last recorded: IN at 08:52" from the existing status endpoint.
- Kiosk: data-free "scan received" cue driven by the existing token refresh. Greeting with names only where the location setting is on.
- Adaptive interval stays: 4 s around reporting/closing time, 12 s otherwise, 12 s is the ceiling because the QR token lives about 30-45 s.

### 3.5 P4: dashboard on summaries

- "Today" reads `daily_summaries` for the team (bounded by team size), late list from the `late` flag.
- Interim `/api/attendance/today` and `/week` routes retire once this ships.
- Reports (2.1) read summaries, never raw events; large exports are generated server-side in chunks.

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
