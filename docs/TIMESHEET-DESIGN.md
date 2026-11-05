# ChecIN: Timesheet Design (replaces the Timesheets report)

Status: **decisions 1 to 6 approved by the integrator on 2026-11-05 (section 10); building in the order of section 9.** This is a design note because it is about hours, and hours become pay ([REVIEW-CHECKLIST.md](REVIEW-CHECKLIST.md), section 2b). It follows the approved principle in the overtime and payroll note (PR #83, `PAYROLL-OVERTIME-DESIGN.md`): **ChecIN measures time and never calculates pay.** This note builds the live review screen. The overtime note later freezes the same numbers into pay periods; it does not need a second calculation.

## 1. The goal in one sentence

A manager or admin picks a range of days and sees, for every person, how long they worked, what was expected, and what was missing, with the same numbers as the roster and the attendance register, and can open any person to see each day, and download it.

## 2. What exists today, and what is wrong

The page is Reports, then Timesheets (`src/routes/_authenticated/reports.timesheets.tsx`).

| # | Finding | Effect |
|---|---|---|
| T1 | It asks `/api/attendance/history` for events with **no range**, so the server answers with its default: **today, one page of 50 events**. "Week", "Month" and "All" then filter that same small set in the browser | It cannot show past days at all. On a busy day it is not complete even for today |
| T2 | Every day is **expected to be 8 hours**, for everyone | Ignores shifts, part-time, half days |
| T3 | **One scan counts as exactly 8.0 hours** | Invents hours nobody worked |
| T4 | "Late" means after **09:15 on the viewer's own computer clock** | Wrong for any other start time or timezone |
| T5 | Days are cut at midnight **UTC**, not the organization's timezone | A late shift can fall on the wrong day |
| T6 | Breaks, leave, holidays, excused late arrivals, work from home and night shifts are ignored | The numbers disagree with the roster and the register |
| T7 | The sums are done in the browser | Not the server's figures; nothing can check them |

The attendance register and the roster do not have these problems: they read `daily_summaries` on the server, in the organization's timezone. The overtime note already says "the Reports page still estimates hours in the browser and must not be used for pay". Until it is replaced, the Timesheets link should be hidden (section 9).

## 3. Principles

1. **One source of truth.** Everything comes from `daily_summaries` on the server, the same data as the register. The browser only displays.
2. **Whole minutes, converted once.** Keep minutes; show hours to two decimals (or `7h 30m`) only at the end, from the total minutes. Never add rounded numbers.
3. **Never invent time.** A day with a check-in and no check-out is shown as **"no check-out"** with the hours it has, and counted in a "missing check-out" figure. It is never filled in with a guess.
4. **Show, do not decide.** Extra time and short time are shown. Whether extra time is paid, approved or capped is the overtime note's job. Nothing here is called "overtime" until a manager has approved it.
5. **The server clock and the organization's timezone** decide every day (`dayKey`). Never the viewer's.
6. **Kept apart:** scanned hours, approved work-diary hours and work-from-home days are separate figures that are never added together (as in the register).
7. **Bounded and indexed.** Same read budget as the register. Nothing is added to the scan route.
8. **Who sees whom is decided on the server** from the verified token: an admin sees the organization, a manager their team, an employee only themselves. Nothing identity-related is read from the request.

## 4. The screen

Reports, Timesheets (same address, so bookmarks keep working). Standard page title and card pattern from the [style guide](UI-STYLE-GUIDE.md).

**Choose what to see**
- A date range: ready-made (Last 7 days, Last 14 days, This month so far, Last month) or two dates. At most 31 days (fewer for a big team, with the register's plain sentence).
- Department (admins), and a "find a person" box.
- A **Show** button. Nothing loads until pressed, so a heavy range is a choice, not a surprise.

**Summary strip:** people, hours at work, paid hours, expected hours, extra and short hours, late days, absent days, missing check-outs.

**One row per person**

| Column | Meaning |
|---|---|
| Name, department | |
| Days worked | Days with hours or an approved presence |
| Hours at work | Sum of completed in-to-out time (whole minutes) |
| Break | Unpaid break taken off (only if the organization tracks breaks) |
| Paid hours | Hours at work minus the break |
| Expected | Total expected on the days they were due (section 5) |
| Difference | Paid minus expected, as "+1h 20m" or "-45m". Not called overtime |
| Late, Absent, Leave, WFH | Day counts, as in the register (an excused late day is not counted as late) |
| No check-out | Days with an open session |

**Open a person:** a panel with one line per day in the range: date, status, first in, last out, hours, break, paid, expected, and flags (late, excused, left early, no check-out). This is the "daily detail".

**On a phone:** one card per person with the main figures; tap for the days. Nothing scrolls sideways.

**States:** nothing chosen yet, loading, no data in the range, error with "Try again", the "too many people for this range" sentence, and "showing the first 500 people" when capped.

**Downloads:** CSV, Excel and PDF of the summary, and a **daily detail** CSV (one row per person per day). Formula injection is escaped (names starting with `=`, `+`, `-`, `@`), as in the register export. The file header carries the range, the timezone and the generation time.

**Employees** keep the timesheet on My page (their last seven days). A longer range for themselves is a later, small addition using the same route.

## 5. The rules for each figure

| Figure | Rule |
|---|---|
| Hours at work | `minutesWorked` from the day's summary: completed in-to-out sessions. An open session is not counted |
| No check-out | A summary with a first scan and an open session (`openSince` set). On **today** it only counts once the shift has ended or the day is over (so someone still working is not flagged) |
| Break and paid time | The existing calculation (`src/lib/shift-breaks.ts`) from the shift copied onto the day. Raw minutes are never changed |
| Expected for a day | The assigned shift's length minus its unpaid break (a night shift counts to the day it started). **No shift: see decision 1.** Weekends, holidays, approved leave and days off: expected is **zero**, so they never show as short |
| Difference | Paid minus expected, on days that have an expected figure; extra and short are shown, **never netted across people** |
| Late, excused, left early | Taken from the summary exactly as the register does |
| Work from home | A day count with **no hours**. If the work diary is on, **approved diary hours** are a separate column |
| A person who joined, left or moved team mid-range | Only the days they were on the viewer's team are included (same rule as the register) |

## 6. Data and routes

- **No new collections, no rules and no new indexes.** The numbers come from the register's existing reads of `daily_summaries`, holidays, leave and shifts.
- **One new route, `GET /api/reports/timesheet?from=&to=`.** It reuses the register's builder (so the two can never disagree) and adds expected time, the difference, the missing check-out count and the per-day paid figures. The register's own response is not changed.
- Server checks (as in the register): verified token; role from claims; a manager only for their own team; range of at most 31 days and the headcount budget (`maxRegisterDays`); at most 500 people with a "truncated" flag; rate limit; one `logEvent` line (action, outcome, org, verified uid, correlation id).
- **Pure code:** `src/lib/timesheet.ts` (expected time, difference, missing check-out, the summary strip) with no Firebase or clock reads, so the overtime and pay-period work can reuse it.
- **Exports** are built from the route's JSON, using the register's CSV and PDF helpers, plus the existing Excel helper.

## 7. How it relates to the rest of the plan

| Later work | Relationship |
|---|---|
| Corrections for forgotten check-outs (overtime note 3.4) | This screen shows the "no check-out" days; corrections fix them. Until then they are visible and counted, not guessed |
| Overtime approval (3.1) | Extra time on this screen is the raw difference. Approved overtime is a separate, later figure |
| Pay periods and locking (3.2) | A lock freezes these same numbers into a snapshot; this screen stays the live view |
| Payroll exports (3.3) | Built from locked snapshots, not from this screen |
| HR and payroll product | Reads locked periods only; this screen is attendance-side review |

## 8. Tests that must pass before merge

1. **The figures agree.** For the same people and days, the timesheet's days worked, late, absent, leave and hours equal the register's, and its present/absent counts equal the roster's.
2. A pure table of cases: normal day, night shift, break deducted and not deducted, missing check-out, a day with two sessions, holiday, weekend, approved leave, work from home, a half day, no shift, a person who joined mid-range, the 15-minute and one-minute edges, zero and very large minutes.
3. **No invented time:** one scan with no check-out never adds 8 hours.
4. An employee is refused; a manager never sees another team; nobody sees another organization; the range limit and the headcount budget refuse with the plain sentence.
5. Extra and short are never netted across people; totals equal the sum of the daily minutes, converted once.
6. The route's reads are bounded (`npm test` already fails on an unbounded query).
7. Exports escape formulas, carry the range and timezone, and the daily detail row count equals people times days.
8. The old estimate code is gone: no `new Date().getHours()`, no fixed 8 or 09:15, no `/api/attendance/history` in the Timesheets page.

## 9. Build plan (each is one PR into `staging`, integrator-only)

| Step | What | Done when |
|---|---|---|
| **T0** | Hide the Timesheets link and the hub card text "worked out from entrance scans", or show a one-line "being replaced" notice, so nobody sends the estimates to payroll | Merged first, small |
| **T1** | `src/lib/timesheet.ts` and its tests (rules in section 5) | Tests 2, 3 and 5 pass |
| **T2** | `GET /api/reports/timesheet` and its security tests | Tests 1, 4 and 6 pass |
| **T3** | The screen, the daily detail panel, phone layout, CSV, Excel, PDF and daily detail CSV | Test 7; checked by hand on staging as admin, manager and employee |
| **T4** | Delete the old page logic, point the hub at the new page, update the Round checklist | Test 8 |

## 10. Decisions (integrator, 2026-11-05: all six recommendations accepted)

1. **No shift, no "Expected".** People with no shift show hours at work and paid hours only, with no Expected or Difference. A "Standard workday" organization setting (hours and weekdays) comes later, together with overtime.
2. **Wording:** "Extra" and "Short", not "Overtime", until a manager has approved it.
3. **Daily detail download:** included.
4. **Employees:** keep their own seven-day timesheet on My page; a longer range later.
5. **Excel:** kept.
6. **T0 now:** hide the old page's estimates this week, before the replacement is built.

## 11. Not in this version

Pay rates, money, overtime approval and multipliers, locking, payroll exports, corrections for missing check-outs (all in the overtime and payroll note), weekly thresholds, and any comparison between people.
