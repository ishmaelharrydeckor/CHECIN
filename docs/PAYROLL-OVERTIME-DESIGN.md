# Design note: overtime (3.2), pay periods and payroll exports (3.5, E3)

Status: **proposed, needs the owner's sign-off** (section 9). Nothing is built until it is approved.
Why a note first: this is where attendance turns into money. A quiet bug here underpays or overpays real people. The plan also says: do not hard-code pay rules until a real customer's policy is known, and wait for a customer's actual payroll format. This note is designed around both.

## 1. The principle
**ChecIN measures time. It never calculates pay.** It stores no hourly rates, no salaries and no money amounts. It produces exact, repeatable **hours** (worked, break, paid, expected, overtime) that a payroll system or an accountant turns into pay. That keeps us out of pay law, tax and currency, and it keeps one place responsible for the numbers.

## 2. What the code does today (so we start from facts)
| Thing | Today |
|---|---|
| Worked time | `daily_summaries.minutesWorked`: whole minutes in **completed** in-to-out sessions. A session still open (no check-out) is **not counted**. It can be rebuilt from `clock_events` |
| A forgotten check-out | Shows as "No check-out". There is **no way to correct it**, and the hours for that day are short. Payroll cannot be exact until this is fixed (see 3.4) |
| Expected hours | None. A day has no "expected" length until shifts (3.1) exist |
| Overtime, pay periods, exports | None. The Reports page still estimates hours in the browser and must not be used for pay |
| Unpaid breaks | Coming with shifts (a fixed unpaid break per shift, deducted only after a set time) |
| Leave, holidays, work from home | Leave and holidays are known per day. Work-from-home days carry **no hours** (by design) |

## 3. Rules (my recommendation)
### 3.1 Overtime
| Question | Recommendation | Why |
|---|---|---|
| What is overtime? | **Paid time beyond the expected time for that day**, counted per day. Expected time is the assigned shift's paid length, or, when the person has no shift, the organization's **standard day** (default 8 hours, a setting) | Simple, explainable, and it works with or without shifts. Weekly thresholds (for example over 40 hours) are a later option |
| Small overruns | Extra time **under a threshold (default 15 minutes) counts as zero**; at or over it, the **whole** extra time counts | Stops a 3-minute stay-late becoming an approval chore. Both numbers are organization settings |
| Rounding | **None.** Whole minutes are kept; hours are shown to 2 decimals only at the end, from the total minutes (never adding rounded numbers) | Rounding rules are a pay-policy decision we should not make for customers |
| Approval | Overtime is **recorded automatically as pending**; the person's manager **approves or declines** it (per day, or "approve all" for a period). The admin can approve anyone's. Only **approved** overtime exports as overtime; **unapproved extra time is exported in its own column**, never silently dropped and never silently paid | Pay should never depend on a number nobody looked at |
| Which manager approves | The manager stored on that **day's summary** (so a move to another manager does not reroute old days; see the manager-change note) | Consistent with how history is kept |
| When is it worked out | **On demand**, when someone opens the overtime screen or locks a period (the server fills in the pending entries for the days in range). **Nothing is added to the scan route** | The scan route is the hot path |
| Off by default | An organization setting "Track overtime", off until switched on | Nobody is surprised |
| Pay multipliers (time and a half, night rates) | **Not in this feature.** Overtime is one number of minutes. Night work and holiday work are exported as separate columns so payroll can apply its own rules | Pay rules differ by country and customer |

### 3.2 Pay periods
| Question | Recommendation |
|---|---|
| Types | One type per organization: **weekly**, **every two weeks**, **twice a month (1st to 15th, 16th to the end)**, or **monthly**. A start day anchors weekly and two-weekly periods. Periods are whole calendar days in the organization's timezone (`dayKey`), so daylight saving cannot move a boundary |
| States | **Open** (being reviewed), **Locked** (approved; numbers frozen). A locked period can be **reopened by the admin with a written reason**; this raises its **version** and is logged. Closing for good and carrying adjustments into the next period are for later |
| Who locks | **Org admin only** |
| What locking does | The server computes every person's totals for the period once and **stores them as a frozen snapshot**. Exports are always built from the snapshot, so the same period gives the same file every time, even if summaries are rebuilt later |
| Locking checks | A lock is **blocked** while the period has (a) people with a **missing check-out**, or (b) overtime still **pending**, unless the admin ticks "Lock anyway", which is recorded in the log with the count of each |

### 3.3 Exports
| Question | Recommendation |
|---|---|
| Formats now | **CSV and Excel (xlsx)**. Both are generic: no customer's payroll system is assumed. Named formats come only when a real customer names theirs |
| Two files | **Pay period summary** (one row per person) and **Daily detail** (one row per person per day) |
| Summary columns (default) | Payroll code, name, department, days worked, hours worked, break hours, paid hours, expected hours, approved overtime hours, unapproved extra hours, leave days, holiday days, work-from-home days, absent days, late count. The admin can **choose and reorder columns** and pick **decimal hours (7.50) or HH:MM (7:30)**, saved per organization |
| Matching people | A new optional **payroll code** on each person (set by the admin), exported first, so rows can be matched to the payroll system |
| Safety | Names that start with `=`, `+`, `-` or `@` are escaped so Excel cannot run them (the report exports already do this and will be reused) |
| Work from home | Counted in a **days** column with **no hours**; payroll decides what to do with them |
| Repeatable | The file header carries the period, the **version** and the lock time, not "downloaded at", so identical content gives an identical file |

### 3.4 Corrections (a dependency, not an extra)
Because a forgotten check-out cannot be fixed today, exact payroll is impossible. Recommendation: **a time correction**: an employee (or their manager) records the missing check-out with a **reason**; the manager approves; it is stored **append-only** as its own record (the original scans are never edited) and the summary is rebuilt from scans plus approved corrections. Corrections are visible in History and in the export detail. Without this, "lock anyway" would become the norm.

## 4. Data
- `pay_periods/{orgId_startDay}`: `orgId`, `startDay`, `endDay`, `status`, `version`, `lockedAt`, `lockedBy`, `reopenLog` (reason, by, at). Server writes only.
- `pay_period_lines/{periodId_employeeId_version}`: the frozen totals for one person (minutes for worked, break, paid, expected, approved overtime, unapproved extra; counts for leave, holiday, WFH, absent, late) plus a small per-day list (at most 31). Server writes only.
- `overtime_entries/{employeeId_dayKey}`: `orgId`, `managerId` (from the day's summary), `employeeId`, `dayKey`, `minutes`, `status` (pending, approved, declined), `decidedBy`, `decidedAt`. Deterministic ids; a decided entry is never overwritten by re-generating. Server writes only.
- `time_corrections/{id}` (section 3.4): `orgId`, `managerId`, `employeeId`, `dayKey`, the proposed times, `reason`, `status`, who decided and when. Server writes only.
- `organizations/{id}`: `overtimeEnabled`, `standardDayMinutes`, `overtimeThresholdMinutes`, `payPeriodType`, `payPeriodAnchor`, `payrollColumns`, `hoursFormat`. `users/{uid}.payrollCode` (admin sets, 30 characters at most).
- **Reads:** locking reads the period's summaries: about people x days (250 people x 31 days is 7,750 reads, once per lock). It is paged and capped, with a clear "too many people; contact support" message beyond the cap. No new reads on the scan route.
- **Indexes:** `overtime_entries (orgId, dayKey)`, `(orgId, managerId, dayKey)`, `(orgId, employeeId, dayKey)`; `pay_periods (orgId, startDay)`; `time_corrections (orgId, status, dayKey)`.

## 5. Build plan (each phase is one PR, reviewed before the next; built by Antigravity from prompts I write)
1. **Pure engine and tests** (no database): period boundaries for all four types and anchors; expected, paid and overtime minutes (including a night shift, a half day, a holiday, a missing check-out, the threshold edge); frozen totals; lock warnings; export rows, column choice, decimal and HH:MM formatting, safe CSV. A very large table of tests.
2. **Data, rules, indexes and routes:** settings, payroll code, generating and deciding overtime, creating, locking and reopening periods, building exports from snapshots.
3. **Time corrections** (3.4).
4. **Screens:** overtime approval for managers, the pay period page (review, warnings, lock, export) for the admin, settings, the payroll code on the People card, phone first for managers.
5. **Export templates:** choosing and ordering columns, Excel output.

Dependencies: shifts phases 1 and 2 (assignment snapshots and breaks) must be merged first. Breaks (shifts phase 8) must be done before overtime is switched on in real use.

## 6. Risks and how we handle them
| Risk | Handling |
|---|---|
| A wrong number becomes someone's pay | ChecIN never computes pay; totals come from minutes; locked snapshots; every reopen is logged with a reason; an automated test for each rule |
| Hours change after payroll was run | The snapshot is frozen; a reopen raises the version and the export shows it |
| Rounding differences between tools | One rule: keep whole minutes, convert to hours once at the end |
| Forgotten check-outs | Lock is blocked by default; corrections (3.4) fix them properly |
| Daylight saving and midnight | Periods are whole `dayKey` days; a night shift's hours belong to the day it started |
| Someone changes manager mid-period | Approval routes by the manager on each day's summary; the admin can always approve |
| Large organizations | Locking is paged and capped; the cap is shown to the admin, not hidden |

## 7. Not in this feature
Pay rates and any money amounts, pay multipliers, tax, payslips, direct integrations with named payroll software (until a customer names one), weekly overtime thresholds, closing a period for good and carrying adjustments, approval chains with more than one approver, notifications.

## 8. Who builds what
Antigravity builds phases 1 to 5 from prompts I write, one at a time. The integrator reviews each PR, deploys rules and indexes to staging, tests as admin, manager and employee, and checks the numbers by hand against a worked example before anything is switched on for a real customer.

## 9. Decisions needed from the owner
1. **ChecIN measures time and never calculates pay** (no rates, no money)? (recommended: yes)
2. **Overtime is paid time beyond the expected time for the day** (shift length, or a standard 8-hour day when there is no shift), counted per day, with an adjustable **15-minute threshold**, and **no rounding**? (recommended: yes)
3. **Overtime needs the manager's approval; unapproved extra time is exported separately, never dropped?** (recommended: yes)
4. **One pay period type per organization (weekly, two-weekly, twice a month, monthly)?** (recommended: yes)
5. **Only the admin locks; locking freezes a snapshot; the admin can reopen with a reason, and each reopen raises a version?** (recommended: yes)
6. **Locking is blocked by missing check-outs or pending overtime unless the admin ticks "Lock anyway"?** (recommended: yes)
7. **Build time corrections for forgotten check-outs (append-only, manager-approved) as part of this?** (recommended: yes)
8. **Work-from-home days are exported as a day count with no hours?** (recommended: yes)
9. **First exports are generic CSV and Excel with admin-chosen columns, decimal hours by default, and a payroll code on each person?** (recommended: yes)
10. **Which payroll software or spreadsheet do your first customers use?** (no answer assumed; named formats wait for this)
