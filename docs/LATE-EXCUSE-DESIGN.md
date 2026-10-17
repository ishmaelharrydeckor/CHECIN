# Design note: excusing a late mark (task 2.7)

Status: **proposed, needs owner sign-off** (decisions in section 9).
Why a note first: it changes what "late" means, and that feeds the Today panel, the register, analytics, exports and later payroll.

## 1. The problem
"Late" is set automatically when the first check-in of the day comes after the location's reporting time (or after the shift start plus grace, when shifts are on). The scan is accurate; the **cause is sometimes not the employee's**. On Friday 2026-10-09 (reported 2026-10-17) the manager who opens the workplace and starts the tablet arrived late, so people who were waiting at the door could not scan until the tablet was running, and everyone was marked late.

We considered a rule that stops counting late until the tablet is live. We chose **not** to do that: it adds a hidden condition to the core rule, it depends on tablet uptime we cannot fully trust (a tablet opened late on purpose would hide real lateness), and it does not help with other honest causes (a power cut, a broken tablet, a queue, a manager who sent someone on an errand). A **human excuse with a recorded reason** works for every cause, keeps the automatic rule simple, and leaves a visible trail.

## 2. What it is
A manager (or admin) can **excuse** a late mark with a short reason, for one person or for everyone late on a given day at once. An employee can **add a note** to their own late day explaining it. Nothing is deleted or rewritten: the original scan, the original time and the late flag stay; the excuse sits beside them and every screen that counts lateness honours it.

## 3. Rules (my recommendation)
| Question | Recommendation | Why |
|---|---|---|
| Who can excuse? | **The person's manager (their team only) and org admins.** A manager **cannot excuse their own** late mark: only an admin can | Stops self-forgiveness. The Friday case (the manager was the cause) is handled by the admin |
| Can the employee excuse themself? | **No.** They can add a **note** only, which the manager sees when deciding | The employee is not the decider; the note gives the manager context and gives the employee a voice |
| Reason required? | **Yes**, 3 to 200 characters, plain text | A reason is the point of the trail. An empty or one-word reason is refused |
| One person or many? | **Both.** "Excuse all late arrivals on this day" (optionally for one location) with one reason, up to 200 people in one request | Friday: everyone was late for the same reason. Doing it one by one would never get used |
| How far back? | **Today and the previous 14 days** (organization setting later). Older days are locked | A later payroll period lock will tighten this. Stops quietly rewriting last quarter |
| Can an excuse be undone? | **Yes**, by the person who made it or an admin, with the reason kept in the history | Mistakes happen; undo is also logged |
| Does it change hours? | **No.** It only changes the late judgement. Hours come from the scans | Keeps time and money untouched |
| What about early departure? | **Not in v1.** Same mechanism can be added later | Nobody has asked yet |
| Is it visible to the employee? | **Yes.** They see "Late, excused: {reason}" on their own page | No hidden decisions about them |
| GPS or location | **Never** | Product rule |

## 4. Data
New collection `late_excuses`, one document per person per day, id `{employeeId}_{dayKey}` so a repeat request cannot create a duplicate.

| Field | Meaning |
|---|---|
| `orgId`, `managerId`, `employeeId`, `dayKey` | From the verified login and the stored attendance, never from the request |
| `employeeNote` (optional, 0 to 200) | The employee's own explanation, written by the employee through the server |
| `status` | `"excused"` or `"revoked"` (absent until a manager decides) |
| `reason` | The decider's reason (3 to 200) |
| `decidedBy`, `decidedAt` | Who and when (server time) |
| `history` | Short list of earlier decisions (excused then revoked), capped at 10 |

Written **only by the server** (Admin SDK). **Firestore rule** (default-deny): read for the employee, their manager and org admins of the same organization; `create, update, delete: if false`. **Indexes:** `(orgId, dayKey)` and `(orgId, managerId, dayKey)` for the review list.

**How the numbers honour it, without extra reads on every screen:** when the server excuses a day it also stamps `lateExcused: true` on that person's `daily_summaries` document in the **same transaction**. Every screen that counts lateness already reads summaries (Today panel, register, analytics, My page, week trend), so each only needs `late && !lateExcused`. Summaries stay rebuildable: the rebuild script reads `late_excuses` for the range and re-stamps. `clock_events` are untouched (events are immutable). The History list, which shows events, reads the excuses for the visible days (one bounded query) to show "Late, excused".

## 5. Server routes (identity, role, organization and team come only from the verified token)
- `GET /api/attendance/late-review?from&to` , the late arrivals the caller may review (admin: whole organization; manager: own team), with each person's note and any existing excuse. Bounded (summaries for the range, capped), organization timezone for the days.
- `POST /api/attendance/late-excuse` , body `{ dayKey, employeeIds[], reason }` excuses (max 200 people). Checks: caller may act on each person (team or admin), nobody excuses their own day unless admin, day inside the allowed window, the person is actually marked late that day, reason valid. Idempotent: repeating it changes nothing.
- `DELETE /api/attendance/late-excuse` , revoke (same checks).
- `POST /api/attendance/late-note` , the employee adds or edits a note on **their own** late day (day inside the window, rate limited).
All rate limited, all logged with one `logEvent` line (action, outcome, org, verified uid, count; never the reason text).

## 6. Screens
- **Manager and admin:** a "Late arrivals" review list (this week by default, a date picker for the allowed window), grouped by day, showing name, arrival time, the employee's note, and an **Excuse** button; a "Select all on this day" bulk action with one reason box; excused rows show who excused and why, with an Undo.
- **Employee, on My page:** a late day shows "Late" with an **Add a note** button; once excused it reads "Late, excused: {reason}".
- **Scan screen:** unchanged by this note. Whether the scan screen should show "late" at all is a separate decision (section 9, decision 5).
- Register, Today panel, analytics: "late" counts drop excused days; an "Excused" count is shown beside it so nothing is hidden.

## 7. Risks and how we handle them
| Risk | Handling |
|---|---|
| A manager excuses everything | Every excuse carries a reason and a name; the admin sees an "excused lates by manager" count; a limit on bulk size |
| Self-excusing | A manager cannot excuse their own day; only an admin can |
| Rewriting history | Window of 14 days; events untouched; every change logged and kept in `history` |
| Someone excused who was not late | Server checks the stored summary says late |
| Extra database reads | Screens read the stamp on summaries they already read; the review list is one bounded range read |
| Later payroll | Late excuses never touch hours; payroll must treat "late" as the excused-aware figure |

## 8. Build plan (each step one PR, reviewed before the next)
1. **Pure rules and tests** (can be a teammate task): who may excuse whom, reason and window validation, bulk limits, the stamp calculation. No database.
2. **Integrator:** collection, rule, indexes, the four routes, the summary stamp in a transaction, the rebuild-script change.
3. **Screens:** the review list and bulk action, the employee note and excused label (screens with sample data are fine for a teammate; the integrator connects them).
4. **Wiring:** Today panel, register and CSV, analytics, My page, History honour `lateExcused`.

## 9. Decisions for the owner
1. **Excuse model instead of a "tablet must be live" rule?** Decided 2026-10-17: yes.
2. **A manager cannot excuse their own late mark; only an admin can?** Recommended: yes.
3. **Reason required (3 to 200 characters) and bulk "everyone late on this day" in one action?** Recommended: yes.
4. **A 14-day window for excusing?** Recommended: yes.
5. **Should the scan result screen show "late" to the employee at the moment of scanning, or only show "Checked in at 08:12" with the late status on their own page?** Not decided; recommended: neutral at the scan, late status on their page.
6. **Early-departure excuses?** Recommended: not in v1.

Open for later: an organization setting for the window, notifying the employee when excused, tablet-uptime display on the manager's screen as an extra hint (not a rule).
