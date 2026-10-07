# Dashboard design reference (target for Phase 4)

**Status:** reference and plan. **Nothing here is built yet, and nothing here changes how teammates work today.** Teammates keep following [UI-STYLE-GUIDE.md](UI-STYLE-GUIDE.md). This is the target look for the final redesign, done **after every feature is built** (task plan, Phase 4).

**Source:** a set of reference screenshots supplied by the owner (company dashboard, division dashboard, team roster, employee detail, reports and exports, and a geo-fenced clock-in page) from another HR product. They show a *pattern to learn from*. We adopt ideas, not branding, wording, icons or layouts pixel for pixel. **The screenshots themselves are not stored in this repository** (it is public, and they are someone else's design); keep them in the owner's private files.

---

## 1. What the reference does well (learn from this)

1. **One layout, repeated at every level.** Company, then Division, then Team, then Employee. Every level has the same skeleton: breadcrumbs, a title with a "live snapshot" subtitle, a row of KPI cards, a main chart, and a table of the *children* of that level (divisions, then teams, then people) where each row drills down. A manager learns the screen once and can navigate any level. This is the strongest idea in the set.
2. **Grouped left navigation with counts.** Sections (Dashboards, My workspace, Manage, Reports, Admin), a "Jump to…" search, and small numeric badges on items that need action (pending leave 14, work-from-home 3, overtime 6). Work that needs the manager is visible from anywhere.
3. **One time control for the whole page.** Today / Week / Month / Quarter / YTD, plus a date picker, plus removable filter **chips** (division, location, employment type, shift) with an "Add filter" chip. Filtering is visible and reversible.
4. **KPI cards with context.** Small-caps label, big number with unit, a change against the previous period (green up arrow or red down arrow with the number), and a tiny trend line or bars. A number alone says little; a number with its change says whether to worry.
5. **Inline bars inside tables.** Attendance % and punctuality % as a number plus a thin progress bar; coloured status pills (Present / Remote / On leave) and shift pills (DAY / EARLY / NIGHT); a check-in time column. Rows are scannable in a second.
6. **The employee page is a person's whole month on one screen.** A calendar heatmap (present, work from home, leave, absent, weekend each a fixed colour), a summary strip (attendance, days worked 20/23, current streak), leave balances as bars per leave type, a "Today's timeline", recent leave history, and hours over 12 weeks.
7. **Reports as cards, not a form.** Each report is a card with a category tag, a one-line description, **Preview** and **Generate**, and a "Scheduled reports" table underneath (report, frequency, recipients).
8. **Consistent colour language.** A near-black primary button, a lime accent for the selected item and active chips, white cards with hairline borders. This is already close to ChecIN's own palette (forest `#0E2322`, lime `#C0FD9B`), so the redesign is an evolution, not a rebrand.
9. **Trust cues.** "Live attendance snapshot · 11:42 AM UTC" tells the reader how fresh the data is.

## 2. What is wrong with the reference (do NOT copy these)

The mock-ups contradict themselves. This matters because **a good-looking layout does not make the numbers right**, which is exactly the problem the Roster page had.

| Where | Problem |
|---|---|
| Company page, "On leave 58" tile versus the "Leave composition" donut | The tile says 12 PTO and 31 Sick; the donut says 24 PTO and 18 Sick. Same total, different split. |
| Division page, "Present today 54 / 620 (88.4%)" | 54 of 620 is not 88.4%, and the Teams table below sums to well over 54 present. |
| Company "Trend · Rate" chart | The line drops to zero after the current time: it draws the **future as zero** (the mistake we just removed). The axis runs to **104.2%** (over 100% is impossible), and "Δ vs target −95.0 pts" is meaningless. |
| Team page "Present now" tile | The figures overlap and are garbled ("2 / 28", "3", "89% today"). |
| Division page "Leave forecast" chart | The chart area is empty. |
| Donut charts with many thin striped slices | Hard to read; horizontal bars say the same thing clearly. |
| Eight KPI cards at once | Too many; only about four matter to a given manager. Overtime and leave utilization mean nothing to a small organization. |
| Decorative sparklines on every card | Only honest if backed by real history. Without history they are noise. |
| Tiny 10 to 11 px grey labels | Low contrast and hard to read. |
| 10-column tables | Desktop only. Many ChecIN managers and all employees are on phones. |
| Calendar status shown by colour alone | Not accessible. Add a letter, icon or tooltip as well. |

**Not applicable to ChecIN, never build:**
- **The "Geo-fenced clock-in" page** (map, radius, "inside / outside geofence"). **ChecIN has no GPS, ever.** The kiosk QR is the only check-in method (AGENTS.md). Nothing from this screen is adopted.
- **The statutory "EPFO-5" filing** (India-specific). Already ruled out in the roadmap.
- "Share briefing", "Switch employee", "Message", "Org chart", "Request roster": not planned; revisit with a real customer.

## 3. What we adopt, and what it depends on

| # | Pattern | ChecIN version | Needs first |
|---|---|---|---|
| A | Grouped sidebar with action counts, "Jump to", breadcrumbs | Replace the top navigation in `AppShell.tsx` (a shared file); drawer on phones | Features to link to (leave 1.1, WFH 2.3, reports 2.1, holidays 2.5) |
| B | Period control and filter chips | Today / Week / Month / Quarter / YTD, filters for location (and later shift, division) | Per-day summaries (#23) and period aggregation |
| C | KPI card with change vs previous period | One reusable `KpiCard` (label, value, unit, delta, optional real sparkline); at most **4 per row** | Summaries with history |
| D | Drill-down hierarchy | Organization, then Team (manager), then Employee. **Division is added only after 3.4** | 3.4 for divisions; team and employee levels need manager scoping (exists) |
| E | Team roster table | Status pill, check-in time, attendance and punctuality bars, location; shift pill after 3.1; phone: card list instead of a wide table | Summaries; 3.1 for shifts |
| F | Employee detail | Stats header, **month heatmap**, leave balances, today's timeline, recent leave, hours chart | 1.1 leave, 2.2 balances, 2.3 WFH, 2.5 holidays, 3.2 overtime |
| G | Reports hub | Cards with Preview and Generate, and a Scheduled reports table | 2.1 reports, 3.3 scheduling |
| H | Chart standards | Metric tabs plus Line/Area/Bar toggle; bars not donuts; honest-chart rules from the style guide | none |
| I | Status colour system | One fixed palette used everywhere: present, work from home, on leave, absent, weekend, holiday (see below) | none |

**Proposed status palette** (extends the guide; confirm in the design pass): present = green (`#CBEED3` fill, `#0E2322` text); work from home = lavender; on leave = butter (`#FCF2CB`); absent = rose; weekend / off = slate; holiday = a distinct outline. Always paired with a letter or icon, never colour alone.

## 4. Rules that carry over from our own experience

1. **Numbers come from one server calculation.** A tile and the chart beside it must be built from the same data, so they cannot disagree (see the "On leave" mismatch above).
2. **Never draw the future, never exceed 100%, never show a made-up comparison.** Hide a delta or sparkline until there is real previous-period data.
3. **Every figure states its period and the time it was computed**, in the organization's timezone.
4. **Tables collapse to cards on phones.**
5. **Reads stay bounded.** Period views read pre-aggregated summaries, never raw events (`SYSTEM-DESIGN.md`, sections 5 and 12).

## 5. Phase 4 deliverable (see `V2-TASK-PLAN.md`)

A design pass first (a short Figma or HTML mock in ChecIN's own palette and wording), then build in the order: shell and navigation, KPI card and period control, organization dashboard, team roster, employee detail, reports hub, and finally an update to `UI-STYLE-GUIDE.md` so teammates' screens follow the new pattern. Exit criteria are in the plan.
