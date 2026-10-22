# Acceptance pass 4.9 (Phase 4 screens)

Run on 2026-10-22 against `staging` after the Phase 4 chain was merged (shell, team roster, reports hub, diary review, style guide). Baseline before any change: **978 tests passing**.

## What was and was not done

I can read and run the code, and render screens with sample data, but I have **no staging login**, so nothing here was clicked through as a real manager, employee or admin, and the **load test (#26) was not run** (it needs staging credentials). Those remain for a person with accounts: see "Still to do by hand".

## Results by criterion

### 1. Every number traces to one calculation (no tile and table can disagree)

| Check | Result |
|---|---|
| The Today tiles and the team roster agree on Present, On site, Late, On leave, Working from home and Absent, over 200 random days, two weekdays, organizations without shifts | **Pass** |
| Same, with day shifts at 07:00, 12:00 and 18:00 (25 random teams each) | **Pass** |
| Saturday and public holiday with no shifts | **Was failing, fixed.** The Today "Absent" tile and the "Not arrived yet" list counted everybody as absent on a weekend or holiday, while the register and the roster correctly said nobody was expected. The Today builder now takes the organization's holidays and treats weekends and holidays as non-working (expected = those who turned up, absent = 0) |
| Arithmetic done inside screens | Only presentation: the setup progress bar, minutes shown as hours, and the review page's totals strip (sums of the rows it was given, so it cannot disagree with them) |
| Screens reading raw scans for a period view | None. The dashboard imported Firestore client functions but used none of them (a leftover); removed |

**Known gaps, recorded not fixed** (decisions needed):

1. **Night shifts.** *Resolved.* A night shift that began yesterday evening and is still running at 02:00 was "On site" in the Today tiles but "Expected later" in the roster, because the roster followed the calendar day and the tiles followed the shift window. The shift evaluation now lives in one function (`evaluateShiftToday`) that both the Today tiles and the roster read, so they cannot disagree. Covered by `figures-agree.test.mjs` (a running night shift, and a mix of day and night shifts at 02:00, 12:00 and 23:00). On the 1st of a month the roster reads yesterday too, so a night shift from the last day of the month is seen. The month's bars still come from the register.
2. **Work from home on a day with no shift** (organizations that use shifts). The roster and the register show "Working from home" and count the day as attended; the Today tiles ignore it (they only count it for people who are rostered). Rare. Decide which rule is right, then make all three follow it.

### 2. Phone width (375 px)

Checked with sample data: the team roster, the reports hub and the diary review list. No sideways scrolling, tap targets 40 px or more, and no collisions (a first version of the roster's bar labels collided and was fixed during #168).
**Not checked** (need real data or a login): the diary day dialog, the diary settings card, the Jump-to search, the phone menu drawer with badges, the employee diary page.

### 3. Meaning never carried by colour alone

Roster, review list, dialog and reports hub: every state is written in words. The register's day cells use a letter code with a legend, and a late day adds an amber ring, which on its own is colour only; each cell does carry a spoken label ("Present 08:14-17:02 (late)"). Low severity; adding a small "L" marker would remove the last colour-only case.

### 4. Read cost

Estimated from the code (the load test has not been run):

| Screen or route | Reads per open | Notes |
|---|---|---|
| Dashboard: `/api/attendance/today` | about one summary per person, plus 20 events, leave, holidays, work from home | Cached 45 s per scope; the page refreshes every 2 minutes while someone is using it |
| Dashboard: `/api/admin/staff-invites` | **up to 2,500** (500 invitations + 2,000 people) | **Not cached.** The dashboard only needs the headcount and how many invitations are waiting. Recommendation: answer those two from count queries |
| Dashboard: `/api/locations` | locations + one kiosk record each | Small |
| Team roster | month-to-date summaries, never more than 6,000 | Cached 45 s. *Resolved for large teams:* the bars now cover the whole month so far when people x days fits the 6,000-record budget, and otherwise the most days that fit (never fewer than 3; for example 15 days for 400 people, 6 days for 1,000). The card says "over the last N days" and why, so every figure is complete for the days it names. A full month for a very large team needs a per-person monthly total (a stored record kept up to date as days are saved): not built, and not needed until a customer wants the whole month at that size |
| Attendance register | same loader | *Resolved:* a range that would be cut off is refused before anything is read, with a plain sentence ("Your team has 400 people, so a register can cover at most 15 days at a time"), instead of showing people as absent on days that were not read |
| Menu badges `/api/nav-counts` | two count queries (about 1 read per 1,000 matches) | Cached 30 s, asked once a minute at most |
| Reports hub | none until a report is generated | |

### 5. Leftovers and rules

| Check | Result |
|---|---|
| Sample or fake data on a real screen | None found |
| GPS, geolocation or permission code | None (the only mention is the privacy page saying we do not use it) |
| Every server route checks who is asking | Pass. Four routes had no obvious check in a text search and were read: the kiosk token route (device secret), the two in-app notification routes (verified caller helper) and the push public key (public by design) |
| Employees kept out of manager pages | Pass by test (`/reports`, `/wfh-review` and the others are on the shell's manager-only list) |
| Style-guide patterns used | Pass |

## Changes made in this pass
- Today tiles: weekends and holidays are non-working (fix above), with the holiday list read in the same request.
- Removed the unused Firestore imports from the dashboard.
- New test `scripts/tests/figures-agree.test.mjs`: the Today tiles and the roster must agree (seven checks), plus the night-shift gap as a `todo`.

## Still to do by hand (needs staging accounts)
1. Click through as an employee, a manager and an org admin: diary session, review and approve, register diary columns, roster filters, reports downloads, menu badges, Jump to.
2. Phone check of the remaining screens listed above.
3. Run the load-test harness (`scripts/load-test.mjs`) against staging and record reads per page.
4. Confirm on staging that the two earlier gaps are closed (a running night shift is on site in the roster; work from home on a day with no shift is not counted) and that a large team sees the shorter period.
5. Decide whether the whole month is ever needed for very large teams (it would need a stored per-person monthly total); until then the roster shows a shorter period and the register refuses a range that is too long, both with a plain sentence.
