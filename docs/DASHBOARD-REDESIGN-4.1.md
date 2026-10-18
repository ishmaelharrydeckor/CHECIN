# Dashboard redesign: design pass (task 4.1)

Status: **proposed, needs owner sign-off** (decisions in section 6). Nothing here is built.
Companion to [DASHBOARD-DESIGN-REFERENCE.md](DASHBOARD-DESIGN-REFERENCE.md) (what we learned from the reference) and Phase 4 of [V2-TASK-PLAN.md](V2-TASK-PLAN.md).
The mock is [design/dashboard-mock.html](design/dashboard-mock.html): open it in a browser. It has four screens (Organization, Team roster, Person, Reports hub) and works at phone width. It uses ChecIN's palette and wording only, and every figure in it adds up (each screen ends with a "Numbers check").

## 1. What changes, in one picture
| Today | After the redesign |
|---|---|
| A top menu that keeps growing (Roster, History, Reports, Notices, Leave, Holidays, Shifts, Departments, Settings, Late arrivals) | A **grouped left menu** (Dashboards, My workspace, Manage, Reports, Admin) with **small counts on things that need action** (late arrivals to review, pending leave, working from home today) and a **Jump to** search. A drawer on phones |
| Roster page with tiles, feed and chart that each came from different places | **One layout at every level**: Organization, Team, Person. Same skeleton each time: breadcrumbs, title with a "live snapshot" line, up to four KPI cards, one main chart or table, a table of the next level down (click to drill in) |
| No single time control | **One period control** for the page: Today, Week, Month. Quarter and YTD appear (greyed until then) once there is that much history |
| Filters hidden in pages | **Filter chips** you can see and remove (team, location, shift) |
| A list of events | A **roster table** with status pills, check-in time and inline bars; **cards on phones** |
| No person page | A **person page**: stats, a month calendar, today's timeline, recent leave, hours over 8 weeks |
| Reports as a form | **Report cards** with Preview and Generate |

## 2. The rules the mock follows (from our own mistakes)
1. **Numbers come from one server answer**, so a tile and the table beside it cannot disagree. The mock's tiles and team table sum exactly: 40 people, 34 present, 2 working from home, 2 on leave, 2 absent; expected is 38 because leave is not expected.
2. **At most four KPI cards** per row. Present, Late, Away (working from home and leave), Absent. Overtime and leave utilisation come back only if they exist and matter.
3. **Never draw the future.** The week chart stops at today, today's bar is dashed and labelled "today so far", weekends are not drawn. No line that drops to zero after the current time.
4. **Never over 100%, never a made-up comparison.** The "change against the previous period" line appears only when there is real previous data; the mock leaves it out rather than invent it.
5. **Every figure says its period and when it was computed** ("Live snapshot, Friday 16 Oct, 11:42, Africa/Accra").
6. **Tables become cards on phones.** The mock does this for the teams table and the roster.
7. **Status is a colour and a letter**, never colour alone.
8. **Late is a note, not a status.** A person is Present; "Late" or "Late, excused" is a tag beside it (this follows the excuse feature).
9. **No decoration that is not data.** No sparklines until there is real history behind them; bars not donuts.

## 3. The status colour system (proposed)
| Status | Letter | Fill | Text |
|---|---|---|---|
| Present | P | mint `#CBEED3` | forest `#0E2322` |
| Working from home | W | lavender `#E9E3FA` | `#4A3A8A` |
| On leave | L | butter `#FCF2CB` | `#7A4B00` |
| Absent | A | rose `#FADFDC` | `#8C2B22` |
| Weekend or day off | – | slate `#F1F5F9` | `#475569` |
| Holiday | H | white with an outline | `#475569` |
| Late (tag) | none | amber `#FDE7A6` | `#7A4B00` |
| Late, excused (tag) | none | mint | forest |

Lavender and rose are new; everything else is already in the style guide.

## 4. What is left out on purpose
Not built yet, so no slot is faked: **leave balances by type** (the person page shows recent leave instead), **overtime and pay periods**, **scheduled report delivery**, **divisions**. Their cards and tiles appear when the feature exists. Never built: the geo-fence page and any map (no GPS, ever).

## 5. How it would be built (Phase 4, in order)
| # | Task | Notes |
|---|---|---|
| 4.2 | App shell: grouped left menu, counts, Jump to, breadcrumbs, phone drawer | `AppShell.tsx` is a shared file: integrator. The counts need three small reads (cached) |
| 4.3 | `KpiCard` and the period control | Reuses the analytics numbers already built |
| 4.4 | Organization dashboard | Replaces the Today and analytics panels with one layout; the same server answers |
| 4.5 | Team roster | Status and shift pills, bars, cards on phones |
| 4.6 | Person page | Month calendar needs one bounded read of the person's summaries; leave section waits for leave types |
| 4.7 | Reports hub | The four report cards that exist today |
| 4.8 | Update `UI-STYLE-GUIDE.md` and the teammate instructions | So later screens match |
| 4.9 | Acceptance pass | Every figure traces to one calculation; phone at 375 px; no colour-only status; read cost with the load test |

Teammate-friendly pieces (screens with sample data, then the integrator connects them): 4.5, 4.6 (without the leave balances) and 4.7.

## 6. Decisions for the owner
1. **Grouped left menu with counts and a Jump-to search, replacing the top menu?** Recommended: yes.
2. **The status palette in section 3** (new lavender for working from home, rose for absent)? Recommended: yes.
3. **The four KPI cards: Present, Late, Away, Absent?** Recommended: yes; swap any you prefer.
4. **Quarter and YTD greyed out until there is history, rather than hidden?** Recommended: yes, so people see they are coming.
5. **Order:** shell first, then Organization, then Team, Person, Reports? Recommended: yes.
6. **Anything in the mock you do not like?** Say it now, while changing it costs a few minutes and not a few days.
