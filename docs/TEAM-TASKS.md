# Team task board (v2)

Companion to [V2-TASK-PLAN.md](V2-TASK-PLAN.md). That file is the full plan; this one is what you pick up and work from.

**Before any task:** read [CONTRIBUTING.md](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md). Branch off `staging`, PR into `staging`. No GPS, ever.

**Not teammate work (integrator only):** 0.x foundation, 0.5 plan gating, 1.4 email verification, 1.7 billing, 2.2 leave types and balances, 3.x everything, except the tasks below that name you. Don't start the others.

**Augustine works with Claude Code** (he can run and test the code locally). His tasks below include server routes and tests, so they follow a stricter bar than screens-only tasks: write the tests first, run `npm run check`, and list in the PR every file you touched and every shared-file change you need (rules, indexes) for the integrator to make.

## Board

| Task | Title | Size | Assignee | Status | Depends on |
|---|---|---|---|---|---|
| 1.3 | Change password on Account page | S | done (integrator) | live | none |
| 1.5 | Remove demo/mock leftovers | S | integrator | live | none |
| 1.1 | Leave requests (basic) | M | Cobberson | live | none |
| 2.5 | Public holiday calendar | S | Augustine | live | none |
| 1.2 | Employee self-service page ("My page") | M | Cobberson (#14) | on staging, not yet tested | 1.1 (done) |
| 2.1 | Reports: attendance register and leave ledger | M | Cobberson (#16) | on staging (screens and real data), not yet tested | 1.1 (done) |
| 1.6 | Manager dashboard: Today panel | M | Augustine (#13) | on staging as a screen with sample data; the integrator connects it to the real data next | none |
| 2.3 | Work from home: employee card and manager list | M | Cobberson (#17, #98) | on staging with real data (card on My page, Today panel, register); not yet tested | 1.1 (done) |
| 2.4 | Dashboard analytics | M | Augustine (#97) | on staging with real numbers (Dashboard, under Today); not yet tested | daily summaries (done) |
| 3.1-P6 | Shifts phase 6: repeating patterns | L | Augustine | todo. Brief below; start now | shifts phases 1 to 5b (done) |
| 2.3b | Work-from-home diary | L | Augustine | todo. Starts after 3.1-P6 is merged. Design approved (docs/WFH-DIARY-DESIGN.md) | 2.3 (done), 3.1-P6 |

Next: nothing is open for teammates right now. Screens for the next features (shift swaps, scheduled reports) are written up as design notes first; new tasks will be added here once approved. Integrator-only work: plan gating, billing, email verification, leave types and balances, shifts phases 6 to 8, and phase 3.

Update the Status column in your PR (`todo` > `in progress` > `in review` > `on staging` > `done`).

---

## 1.3 Change password (S)

**What:** On the Account page, a card with current password, new password, confirm new password. Only for email/password accounts; hide it for Google-only accounts.

**Files:** edit `src/routes/_authenticated/account.tsx` (not a shared file). Put the form in a new `src/components/ChangePasswordCard.tsx`.

**How:** Firebase client SDK `reauthenticateWithCredential` with the current password, then `updatePassword`. Reuse the show/hide and confirm-password patterns already in `src/routes/auth.tsx` (read only, don't edit it).

**Done when:**
- Wrong current password shows a clear error, nothing changes
- New and confirm must match; minimum length matches the sign-up rules
- Success toast; form clears
- No password is logged, stored, or sent to our own server

## 1.5 Remove demo and mock leftovers (S): DONE by the integrator

Removed: the unused `INITIAL_LOCATIONS` sample list in Settings, the automatic creation of a "Main Entrance Lobby" location when an organization first opens Settings (a read request that wrote data), the `seed-demo` route (fake staff and events), the disabled `demo-login` and `login-direct` stubs, and stale demo instructions in `DEPLOYMENT.md`. A new organization now starts with no locations and an "Add Location" form.

## 1.1 Leave requests, basic (M)

**What:** Employee submits a request (type, start date, end date, optional note). Manager sees pending requests for their team and approves or denies. Org admin sees the whole org.

**Files (all new):** `src/routes/_authenticated/leave.tsx`, `src/components/leave/*`, `src/lib/leave.ts` (types, date validation).

**Data:** collection `leave_requests`. Rules already exist ([firestore.rules](../firestore.rules)):
- Employee creates their own: `orgId`, `managerId` and `employeeId` must equal the caller's claims/uid, `status` must be `"pending"`
- Manager/admin may change **only** `status`, `reviewedBy`, `reviewedAt`
- No deletes

Take `orgId` and `managerId` from the signed-in user's token claims (see `src/lib/auth-claims.ts`), never from a form field.

**Done when:**
- Employee can create and see their own requests with status
- Manager sees only their team's pending requests; approving sets `status`, `reviewedBy`, `reviewedAt`
- End date can't be before start date; past start dates are rejected
- Empty, loading and error states exist; works at phone width

**Needs integrator:** sidebar entry for `/leave`. Say so in the PR.

## 1.6 Manager dashboard: today's attendance and late list (M)

**What:** A "Today" section for managers: who's in, who's out, who hasn't arrived, and a late list using the existing `late` flag.

**Files:** new components under `src/components/dashboard/`. The dashboard route itself is 1100 lines; extract and add, don't rewrite. Keep edits to `dashboard.tsx` to mounting your new components, and tell the integrator in the PR.

**Data:** the numbers now come from `GET /api/attendance/today` and `/week`, which read `daily_summaries` (one document per person per day) on the server; the response shape is in `src/lib/attendance-today.ts` (`TodaySummaryData`). Build your components on those routes. Do not query `clock_events` from the page and do not re-implement time rules.

**Done when:** a manager sees only their team (org admin sees all); counts match the event list; "not arrived" excludes people on approved leave once 1.1 lands (fine to skip until then).

## 1.2 Employee self-service page (M, after 1.1)

**What:** One page for an employee: my timesheet (recent in/out events), my leave requests, my notices (announcements).

**Files (new):** `src/routes/_authenticated/me.tsx`, `src/components/me/*`. Reuse the history and announcements queries; don't copy their security logic, import it.

**Done when:** everything shown is the employee's own data; phone-first layout; links to the scan screen and the leave form.

## 2.5 Public holiday calendar (S)

**What:** Org admin manages a list of holidays (date, name) for the org. Used later by shifts, leave and absence.

**Files (new):** `src/routes/_authenticated/holidays.tsx`, `src/lib/holidays.ts`.

**Data:** new collection `holidays/{id}` with `orgId`, `date` (YYYY-MM-DD), `name`. **Needs a new Firestore rule from the integrator** (org-scoped read, org_admin write). Draft the rule in the PR description; don't edit `firestore.rules`.

**Done when:** add, edit and remove work for org admins; managers and employees can view only.

## 2.1 On-demand reports (M, after 1.1)

**What:** Attendance register, leave ledger, and headcount/absence trend for a date range, exportable to CSV and PDF.

**Files:** extend the existing reports route and `src/lib/exporters.ts` with new report types in new files under `src/components/reports/`. `jspdf`, `jspdf-autotable` and `xlsx` are already installed; don't add libraries without asking.

**Done when:** date range validated; manager sees their team, org admin sees all; exports open correctly in Excel; large ranges don't freeze the page.

## 2.3 Work-from-home status (M, integrator review)

**What:** An employee marks a day as work-from-home. Managers see it. WFH counts as present in attendance. Four states: in office, WFH, on leave, absent.

**Why review:** it changes how "present" is computed, which feeds reports and later billing/payroll. Open a short design note in the PR before building UI.

**Needs integrator:** a rule for the new collection, and sign-off on how reports count it.

---

## 3.1-P6 Shifts phase 6: repeating patterns (L, Augustine)

**What:** Today a manager fills a range by hand ("Mon to Fri, 8 weeks"). A **pattern** saves that rule so it keeps going: "Day shift, Monday to Friday, until further notice", or a **rotation** ("two weeks Day, two weeks Night"). Read `docs/SHIFTS-DESIGN.md` (the sections on assignments and repeating patterns) and the merged phases first: `src/lib/shift-requests.ts`, `src/routes/api/shifts/assignments.ts`, `src/components/shifts/RotaTab.tsx`, `AssignShiftsDialog.tsx`.

**The rule that must not change:** the **daily assignments stay the single source of truth** (`shift_assignments`, one per person per day). Everything that reads them (the scan route, Today panel, register, analytics) must keep working unchanged. A pattern only **writes** those daily documents ahead of time.

**Build in this order, one PR per step, tell the integrator when each is ready:**
1. **Pure engine and tests (no database):** given a pattern (weekdays, or a rotation of shifts and week lengths), a start day and optional end day, list the days it produces; "fill from X to Y" never exceeds the existing 62-day limit per run; a pattern never overwrites a day that already has a **manual** assignment or attendance already recorded for today; editing a pattern changes **future days only**. Put it in a new `src/lib/shift-patterns.ts` with `scripts/tests/shift-patterns.test.mjs` (copy the style of `shift-requests.test.mjs`). Include a table of edge cases: month ends, daylight saving, a person with leave, a holiday, an archived shift, rotation week boundaries.
2. **Routes:** `src/routes/api/shifts/patterns.ts` (create, list, end, edit) using the same checks as `assignments.ts` (verified token, `canCallerManageShifts`, a manager only for their own team, rate limit, `logEvent`, bounded queries). The server keeps assignments filled **at least 62 days ahead**: on create and edit, and by a top-up when the Rota loads (bounded, idempotent: a retry cannot duplicate). No scheduled jobs in this version.
3. **Screens:** a "Repeat" option in the assign dialog and a small patterns list on the Rota tab (see, end, edit a pattern). Mobile layout, loading, empty and error states, plain-language errors.

**Data:** collection `shift_patterns/{id}`: `orgId`, `employeeId`, `managerId`, the rule, `startDay`, `endDay` (or none), `filledThrough`, `createdBy`. Written by the server only. **Needs from the integrator:** a default-deny rule (same read scopes as `shift_assignments`) and indexes. Write the exact rule and index text in the PR description; do not edit `firestore.rules` or `firestore.indexes.json`.

**Do not touch:** the scan route (`src/routes/api/check-in/`), `shift-engine.ts`, `shift-scan.ts`, `shift-today.ts`, or the Firestore rules. If a pattern needs something from them, say so in the PR.

**Done when:** the tests above pass and `npm run check` is green; a pattern fills ahead and a retried request creates no duplicates; a manager cannot create patterns for someone outside their team; manual assignments are never overwritten; the PR says plainly what was tried by hand and what was not.

## 2.3b Work-from-home diary (L, Augustine, after 3.1-P6)

**What:** An optional diary for declared work-from-home days: a started work session, random "still here?" checks, 10-minute intervals, manager approval. The approved design is `docs/WFH-DIARY-DESIGN.md`: read all of it, especially the sections on what a web page can and cannot see, and on making it hard to fake. **Hours come from verified presence, never from activity counts.**

**Phases (section 8 of the design), one PR each; do not start the next until the integrator has reviewed the last:**
1. **Pure engine and tests** (interval validation, liveness scheduling, verified-hours calculation, the pattern flags, day summary). No database, no screens.
2. Data, rules, indexes and routes (the integrator makes the rule and index changes from your PR description).
3. Employee work-session page and consent screen.
4. Manager review and the report column (the design note's later phases).

**Hard rules:** counts and timings only, never content, applications or websites. The **server clock** decides all times. Nothing is punished automatically: flags are shown to the manager. No GPS, ever. Anything that touches pay (overtime) stays off unless the admin switches it on, and that switch is the integrator's work.

## Definition of done (every task)

- [ ] PR into `staging`, CI green, checklist in the PR template ticked
- [ ] Tried on the staging URL with at least one manager and one employee account
- [ ] Phone width checked for anything an employee sees
- [ ] Matches the look of the rest of the app (`docs/UI-STYLE-GUIDE.md`), with a "Style check" in the PR
- [ ] Integrator review done; shared-file changes handled by the integrator
