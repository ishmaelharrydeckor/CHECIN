# Design note: shifts (3.1) and night shifts (E2)

Status: **proposed, needs the owner's sign-off** (section 9). Nothing is built until it is approved.
Why a note first: shifts change what "today", "late", "present" and "expected" mean, and they touch the scan route, which is the hot path. Overtime (3.2) and payroll exports (3.5) will stand on this.

## 1. What it is
An organization can define **shifts** (Day, Early, Late, Night, Flex) and assign people to them for specific dates. When shifts are in use, lateness, early departure, "who is expected today" and "absent" follow the person's assigned shift instead of one reporting time per location. A shift that crosses midnight is handled correctly.

## 2. How it works today (so we start from facts)
| Thing | Today |
|---|---|
| Late / early departure | One `reportingTime` and `closingTime` per **location**. `late` = an "in" scan after reporting time; `earlyDeparture` = an "out" scan before closing time. Minutes since local midnight |
| What "today" is | The calendar day in the organization's timezone (`dayKey` of the scan time) |
| In or out? | Decided from the person's events with the **same dayKey** (their summary's last event). The first scan of a calendar day is "in" |
| Who is expected | Everyone on the roster, every day, Monday to Friday |
| Night shift (22:00 to 06:00) | Breaks. The 06:00 scan has a new dayKey, so it is read as a new "in", the hours are split across two days, and late/early flags use the wrong times |

## 3. Rules (my recommendation)
| Question | Recommendation | Why |
|---|---|---|
| Opt in? | **An organization setting "Use shifts", off by default.** Off means everything works exactly as today | Nobody is broken by the feature. The pilot lab keeps working |
| Shift definition | Name, type (Day / Early / Late / Night / Flex), start `HH:MM`, end `HH:MM`, grace minutes (default 0). **Crosses midnight** when end is earlier than start. **Flex** has expected hours but no start time, so it is **never late** | Covers the five types in the plan with one shape |
| Who defines shifts | Org admin | |
| Assignment | **One assignment per person per date**, saved by the server as a document with a deterministic id (`{employeeId}_{dayKey}`). "Repeat on these weekdays until this date" is a helper that writes those documents, at most **62 days per request** | Simple to read, index and audit. A retry cannot duplicate |
| Who assigns | Org admin: anyone. Manager: their own team | |
| Which day does a shift belong to (E2) | **The day it started.** A 22:00 to 06:00 shift on Monday is Monday's shift, including the Tuesday 06:03 check-out | Simple, matches how rotas are written, and keeps one summary per shift |
| Which shift does a scan belong to | The person's assigned shift whose window contains the scan time. The window opens **120 minutes before start** and closes **the location's check-out window after end** (default 120). Look at yesterday's, today's and tomorrow's assignments. No assignment found means **today's behaviour (location hours, calendar day)** | Keeps scans working for anyone not rostered and if shift data is missing |
| Late | An "in" scan after **shift start + grace**, counted across midnight correctly | |
| Early departure | An "out" scan before **shift end** | |
| Direction (in or out) | From the events with the same **shift day**, not the calendar day | Fixes the night-shift bug |
| Expected / absent (Today panel and reports) | When shifts are on: **expected = people with a shift today** (plus anyone still on a shift that started yesterday). Someone with no shift is "not rostered", not absent. Absent = rostered and no scan after start + a limit (default 60 minutes) | Without this, shifts would not change who is called absent |
| Leave and holidays | Approved leave or a holiday on the shift day wins: they are not expected and not absent. A scan always wins and shows as present | Same order as the register today |
| Hours | A shift's hours are measured from the scans, never assumed. Night shift hours belong to the start day | No invented hours (lesson from the old Reports page) |
| Work from home | A WFH day (2.3) replaces the shift for that day: not expected at the entrance | |
| Overtime | **Not in this feature.** The shift's start and end are only the base that 3.2 will use | |
| Location | A shift has no location in v1. Scans at any location of the organization count | |

## 4. Data
- `shifts/{id}`: `orgId`, `name`, `type`, `start`, `end`, `graceMinutes`, `expectedMinutes` (for Flex), `createdAt`. Org admin writes (server routes), org members read.
- `shift_assignments/{employeeId_dayKey}`: `orgId`, `managerId`, `employeeId`, `employeeName`, `dayKey`, `shiftId`, plus a **copy of the shift's name, start, end, grace** taken when assigned (so editing a shift later never rewrites history). Server writes only. Employee reads own, manager reads team, admin reads all.
- `organizations/{id}.shiftsEnabled` (boolean, admin only through the server).
- Daily summaries and `clock_events` keep their `dayKey`, which for a shift scan **is the shift day**; summaries also store the `shiftId` and the copied start/end.
- **Indexes:** `shift_assignments (orgId, dayKey)`, `(orgId, managerId, dayKey)`, `(orgId, employeeId, dayKey)`. `shifts (orgId)`.
- **Scan route budget:** at most **+1 read** per scan (the person's assignments for yesterday, today and tomorrow in one `in` read by id, or one small query), served from a short cache. If the read fails, fall back to today's behaviour.

## 5. Build plan (each phase is one PR, reviewed before the next)
1. **Pure engine and tests** (no screens, no database): shift windows including across midnight, which shift a scan belongs to, late / early with grace, direction by shift day, expected / absent. A large table of tests.
2. **Data and routes:** collections, rules, indexes, create/list/edit shifts, assign (with the repeat helper), the organization switch.
3. **Scan integration** behind the switch, with a load test and a fallback test.
4. **Today panel, week chart, register and reports** read the shift rules (expected, absent, late, "still on a night shift").
5. **Screens:** shift templates, a rota grid (week view) for admins and managers, "My shifts" for employees, phone first.

## 6. Risks and how we handle them
| Risk | Handling |
|---|---|
| Breaking the scan route (the hot path) | Behind the switch; at most +1 read; fall back on any missing data; `npm run loadtest` before and after |
| Wrong day for a night shift | One engine function, tested with a table of midnight cases and timezone / daylight-saving days |
| Rewriting history by editing a shift | Assignments store a copy of the shift's times |
| Today panel at 01:00 hides the night shift | Phase 4 counts shifts that started yesterday and have not ended |
| Daylight-saving days | Times are compared as local clock times in the organization's timezone, with tests for the changeover days |

## 7. Who builds what
- **Antigravity** builds phases 1 to 5 from prompts I write, one at a time.
- **The integrator** reviews each PR, deploys rules and indexes to staging, tests as admin / manager / employee, and decides when to move on.

## 8. Not in this feature
Overtime rules (3.2), swap or cover requests, shift bidding, per-location shifts, payroll export (3.5), notifications about new shifts.

## 9. Decisions needed from the owner
1. **Off by default, per organization**, so nothing changes for anyone until it is switched on? (recommended: yes)
2. **A night shift belongs to the day it started**? (recommended: yes)
3. **Someone with no shift, in an organization using shifts, is "not rostered", not absent**? (recommended: yes)
4. **Grace minutes per shift, default 0**, and **Flex shifts are never late**? (recommended: yes)
5. **Managers may assign their own team; only admins define shifts**? (recommended: yes)
6. **Assignments are per person per date, with a "repeat weekly" helper (62 days at most)**, not a free-form recurring pattern? (recommended: yes)
7. **The scan window opens 120 minutes before a shift starts**? (recommended: yes)
8. Anything customers have asked for, such as shift swaps, per-location shifts or break times? (nothing assumed)
