# Design note: shifts (3.1) and night shifts (E2)

Status: **revised on 2026-10-12 after the owner's answers** (section 9). Decisions 4, 5, 6 and 8 are answered below; 1, 2, 3 and 7 are taken as agreed unless the owner says otherwise. Nothing is built until the owner confirms the open points in section 9.
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
| Who defines shifts | **Org admin always. A manager only when the admin has allowed it** (a per-manager switch, "Turn on for all managers" like tablet access). A manager can edit only shifts they created | See 3b |
| Assignment | **One assignment per person per date**, saved by the server as a document with a deterministic id (`{employeeId}_{dayKey}`). "Repeat on these weekdays until this date" is a helper that writes those documents, at most **62 days per request** | Simple to read, index and audit. A retry cannot duplicate |
| Who assigns | **Org admin: anyone. A manager with the switch on: their own team only** | See 3b |
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

## 3b. Added after the owner's answers
| Topic | Rule |
|---|---|
| Manager permission | One switch per manager, **"Manage shifts"** (create their own shifts and assign their own team). Off by default. Stored as a custom claim `shiftAdmin`, written only by the server, exactly like the tablet-access claim (`kioskAdmin`). The manager is signed out once so it applies |
| How assigning works | The person picks **people, a shift, weekdays and an end date**; the server writes **one assignment per matching day**, within a range of **at most 62 days**. Nothing is assigned automatically. For longer, the range is filled again |
| Repeating patterns (later) | A **pattern** such as "Night, Monday to Friday, until further notice" or a **rotation** ("two weeks Day, two weeks Night") is saved as a rule, and the server keeps the daily assignments filled **at least 62 days ahead**. The daily assignments stay the single source of truth, so everything that reads them (late, expected, reports) is unchanged. Edits to a pattern change future days only |
| A scan outside the shift window | **Refused, not recorded** (owner's decision, 2026-10-12). The phone shows the usual "not recorded" screen with a plain reason, for example **"Your check-in was not recorded. Your shift starts at 22:00. Scanning opens at 20:00."** or, after a shift, **"Your shift ended at 06:00 and scanning closed at 08:00. Please speak to your manager."** **When it applies (all must be true):** shifts are on for the organization; the person has an assignment whose shift day is **today or yesterday** (organization timezone); and **no window is open right now**. The reason names the nearest such shift. **When it does not apply:** a person with no assignment today or yesterday is **not refused**; the scan is recorded as today (location hours, calendar day), so extra shifts and rest-day work still show. If the shift data cannot be read, the scan is **recorded as today**, never refused by mistake |
| The window length | An **organization setting** (default **120 minutes** before start and after end; allowed 30 to 240). A shift's start is judged only by scans inside its window |
| A wrong assignment must never lock someone out | The refusal text always tells the person to speak to their manager. A manager or admin who fixes the assignment (replace the day's shift) lets the next scan through at once, because assignments are read with a short cache of at most 30 seconds. Refusals are logged with a reason so they can be counted |
| Strict or Lenient (organization setting) | **Strict is the default** and is the refusal described above. **Lenient** accepts the scan instead: it is recorded as a normal check-in marked **"outside shift window"**, with no late / early judgement, and it **does not count as the start or end of the shift**. The admin can switch between them at any time, so a customer who finds Strict blocking real people has an exit without waiting for a code change. Both modes write a refused-scan note (below) |
| Refused-scans list | Every scan that is refused (Strict) or marked (Lenient) writes one short **note** in a separate collection, `refused_scans`: who, when, which shift, the reason. It is **not** an attendance record and never changes hours, late or present. Admins see the whole organization and managers their own team, on a **"Refused scans"** tab in History. It shows the latest 50 with a "Load more", so if someone really was there, something shows it, and a manager can spot a wrong assignment (for example the same person refused twice) quickly |
| Shift swaps | An **organization setting, off by default** ("Allow shift swaps"). An employee proposes a swap with a colleague for one date; the colleague accepts; the manager of both (or the admin) approves; on approval the server swaps the two assignments **atomically**. Past dates cannot be swapped; each person's leave and holidays are checked. Swaps are recorded in a history collection |
| Breaks | An **organization setting, off by default** ("Track breaks"). Each shift can have a **fixed unpaid break** (minutes). Reports show **worked time, break, and paid time** separately; the raw minutes from the scans are never overwritten. Recording actual break scans is **not** in this feature |

## 4. Data
- `shifts/{id}`: `orgId`, `name`, `type`, `start`, `end`, `graceMinutes`, `expectedMinutes` (for Flex), `createdAt`. Org admin writes (server routes), org members read.
- `shift_assignments/{employeeId_dayKey}`: `orgId`, `managerId`, `employeeId`, `employeeName`, `dayKey`, `shiftId`, plus a **copy of the shift's name, start, end, grace** taken when assigned (so editing a shift later never rewrites history). Server writes only. Employee reads own, manager reads team, admin reads all.
- `organizations/{id}.shiftsEnabled`, `shiftSwapsEnabled`, `breaksEnabled` (booleans) and `shiftScanMode` (`"strict"` default, or `"lenient"`) and `shiftWindowMinutes` (default 120, 30 to 240), admin only through the server.
- `refused_scans/{id}`: `orgId`, `managerId`, `employeeId`, `employeeName`, `at`, `reason` (`too_early`, `too_late`), `shiftId`, the shift's start and end, and when scanning opens or closed. Server writes only; admin reads the organization, a manager reads their team; indexes `(orgId, at desc)` and `(orgId, managerId, at desc)`. No automatic deletion on the free plan, so reads are always paged.
- `shift_patterns/{id}` (later phase): `orgId`, `employeeId`, `managerId`, rule (weekdays, or a rotation of shifts and week lengths), `startDay`, `endDay` (or none), `filledThrough`. Server writes only.
- `shift_swaps/{id}` (swap phase): `orgId`, both employee ids, both assignment ids, `dayKey`, `status` (pending, accepted, approved, declined, cancelled), who decided and when. Server writes only.
- A shift also has `unpaidBreakMinutes` (default 0) once breaks exist.
- Daily summaries and `clock_events` keep their `dayKey`, which for a shift scan **is the shift day**; summaries also store the `shiftId` and the copied start/end.
- **Indexes:** `shift_assignments (orgId, dayKey)`, `(orgId, managerId, dayKey)`, `(orgId, employeeId, dayKey)`. `shifts (orgId)`.
- **Scan route budget (revised 2026-10-13):** Firestore bills one read per document, so "+1 read" was wrong. When shifts are on, a scan reads up to 3 assignment documents (yesterday, today, tomorrow) and up to 3 summary documents, in parallel in one round trip: **at most 5 extra document reads**, only for organizations with shifts on. With shifts off, or for a person with no shift, the scan is unchanged. If the assignment read fails or takes longer than 800 ms, the scan falls back to today's behaviour.

## 5. Build plan (each phase is one PR, reviewed before the next)
1. **Pure engine and tests** (no screens, no database): shift windows including across midnight, which shift a scan belongs to, late / early with grace, direction by shift day, expected / absent. A large table of tests.
2. **Data and routes:** collections, rules, indexes, create/list/edit shifts, assign (with the repeat helper), the organization switch.
3. **Scan integration** behind the switch: choosing the shift, late / early, direction by shift day, **refusing a scan outside the window** (Strict only in this phase) with the new reasons on the phone, the refused-scan note, a load test and fallback tests (missing data records the scan as today).
3b. **Lenient mode:** a scan outside the window is recorded but not counted. It needs its own design pass, because an uncounted event must not change the direction of the next scan or the hours; until then the setting behaves as Strict.
4. **Today panel, week chart, register and reports** read the shift rules (expected, absent, late, "still on a night shift").
5. **Screens:** shift templates, a rota grid (week view) for admins and managers, "My shifts" for employees, the per-manager "Manage shifts" switch, the Strict / Lenient setting, the "Refused scans" tab in History, phone first.
6. **Repeating patterns and rotations** (the alternative to filling ranges by hand), with the server keeping assignments filled ahead.
7. **Shift swaps**, behind the organization setting.
8. **Breaks** (fixed unpaid break per shift), behind the organization setting.

## 6. Risks and how we handle them
| Risk | Handling |
|---|---|
| Breaking the scan route (the hot path) | Behind the switch; at most +1 read; fall back on any missing data; `npm run loadtest` before and after |
| Wrong day for a night shift | One engine function, tested with a table of midnight cases and timezone / daylight-saving days |
| Rewriting history by editing a shift | Assignments store a copy of the shift's times |
| Today panel at 01:00 hides the night shift | Phase 4 counts shifts that started yesterday and have not ended |
| Daylight-saving days | Times are compared as local clock times in the organization's timezone, with tests for the changeover days |
| A wrong or missing assignment blocks a real person from checking in (a refused scan is not recorded) | The refusal applies only when an assignment exists for today or yesterday and no window is open; no assignment means recorded as today; data that cannot be read means recorded as today; the window length is adjustable; assignments take effect within 30 seconds; refusals are logged and counted; **a manager correction for a forgotten check-out is not in this feature**, so a missed check-out stays visible as "No check-out" |

## 7. Who builds what
- **Antigravity** builds phases 1 to 5 from prompts I write, one at a time.
- **The integrator** reviews each PR, deploys rules and indexes to staging, tests as admin / manager / employee, and decides when to move on.

## 8. Not in this feature
Overtime rules (3.2), shift bidding, giving a shift away to anyone (open shifts), per-location shifts, recording actual break scans, payroll export (3.5), notifications about new shifts.

## 9. Decisions (owner, 2026-10-12)
1. **Off by default, per organization.** Taken as agreed.
2. **A night shift belongs to the day it started.** Taken as agreed.
3. **Someone with no shift, in an organization using shifts, is "not rostered", not absent.** Taken as agreed.
4. **Grace is per shift, default 0, and Flex shifts are never late.** **Decision: yes.**
5. **Admins and managers can both create and assign, but a manager only when the admin allows it** (per-manager switch). **Decision: yes** (details in 3b; confirm that a manager edits only shifts they created).
6. **Assignments are per person per date, filled by a helper (at most 62 days per go), and repeating patterns are considered as the alternative** (phase 6). **Decision: yes to both.**
7. **The scan window opens 120 minutes before a shift starts** (adjustable per organization, 30 to 240), and a scan outside it is **refused, not recorded**. **Decision: yes** (owner chose refusing over recording-and-marking).
8. **Swaps and breaks are built, as organization settings the admin can switch on.** **Decision: yes** (swaps as in 3b; breaks as a fixed unpaid break per shift, not break scans; **confirm that**).

Decided since: (a) **a manager edits only the shifts they created: yes**; (d) **a swap needs the colleague's acceptance and the manager's (or admin's) approval: yes**; (e) **refused scans write a note on a "Refused scans" list, and the admin can choose Strict or Lenient: yes**.

Decided since (continued): (c) **breaks: Way 1. A fixed unpaid break per shift, deducted only when the person was there longer than a set time (for example more than 6 hours); reports keep time at work, break and paid time as three separate figures. Real break scans are only built if a customer must prove exact break times.**

All points are now decided. Next: the phase 1 prompt (`docs/antigravity/prompts/3.1-phase-1-shift-engine.md`).

> **Update (2026-10-13):** the status check on the phone (`/api/check-in/status`) also looks up "today" and must use the shift day, or a night worker would see "checked out" while still on shift. It is part of phase 3.
