# Team task board (v2)

Companion to [V2-TASK-PLAN.md](V2-TASK-PLAN.md). That file is the full plan; this one is what you pick up and work from.

**Before any task:** read [CONTRIBUTING.md](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md). Branch off `staging`, PR into `staging`. No GPS, ever.

**Not teammate work (integrator only):** 0.x foundation, 0.5 plan gating, 1.4 email verification, 1.7 billing, 2.2 leave types and balances, 3.x everything. Don't start these.

## Board

| Task | Title | Size | Assignee | Status | Depends on |
|---|---|---|---|---|---|
| 1.3 | Change password on Account page | S | done (integrator) | live | none |
| 1.5 | Remove demo/mock leftovers | S | integrator | live | none |
| 1.1 | Leave requests (basic) | M | Cobberson | live | none |
| 2.5 | Public holiday calendar | S | Augustine | live | none |
| 1.6 | Manager dashboard: Today panel (real data now available) | M | Augustine (#13) | todo | none |
| 1.2 | Employee self-service page | M | Cobberson (#14) | todo | 1.1 (done) |
| 2.1 | On-demand reports: screens and downloads with sample data (integrator adds the data routes) | M | Cobberson (#16) | todo, starts after #14 | 1.1 (done) |
| 2.3 | Work-from-home status | M | _unassigned_ (#17) | blocked: needs a design note first | 1.1, integrator review |

Next assignments: **1.2** (Cobberson) and **1.6** (Augustine) are ready now. **2.1** goes to Cobberson after 1.2 (screens first; the integrator builds the data routes). **2.3** waits for a short design note.

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

## Definition of done (every task)

- [ ] PR into `staging`, CI green, checklist in the PR template ticked
- [ ] Tried on the staging URL with at least one manager and one employee account
- [ ] Phone width checked for anything an employee sees
- [ ] Matches the look of the rest of the app (`docs/UI-STYLE-GUIDE.md`), with a "Style check" in the PR
- [ ] Integrator review done; shared-file changes handled by the integrator
