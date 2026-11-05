# Backlog

Things we have **deliberately left for later**. Nothing here is broken today. Each item says why it was left, where it lives, and what would make it worth doing. Add new items at the bottom of the open list; when one is done, move it to "Done" with the PR number.

How to read an entry: **Size** is S (an hour or two), M (a day), L (several days). **Do it when** is the signal that it has started to matter.

## Open

### B1. Speed: checking every person against every leave record
- **Where:** `src/lib/shift-today.ts`, the function that checks whether someone is on approved leave (`isApprovedLeaveCovering`); added in shifts phase 4 (#96).
- **What happens now:** for each person on the team, the code looks through the whole list of approved leave to see whether any belongs to them. With 20 people and 30 leave records that is about 600 quick checks; with 2,000 people and 1,500 records it is about 3 million checks every time the dashboard refreshes.
- **What to do:** sort the leave records by person once (a lookup by employee id), then look each person up directly. Results do not change.
- **Why it was left:** it only matters for a very large organization. The answers are cached for 45 seconds.
- **Size:** S. **Do it when:** an organization has more than about 500 people with shifts switched on, or the Today panel starts to feel slow.
- **Done when:** a test with 2,000 people and 1,500 leave records finishes in a few milliseconds, and the existing shift tests still pass.

### B2. Shifts on but nobody has an assignment: loading the same data twice
- **Where:** `src/routes/api/attendance/today.ts` and `src/routes/api/reports/register.ts` (shifts phase 4, #96).
- **What happens now:** if an organization has switched shifts on but has not yet assigned anyone, the route first loads everything it needs for the shift view, finds no assignments, then falls back to the normal view and loads the attendance and recent check-ins again.
- **What to do:** reuse what was already loaded, or look for assignments first and only load the rest if there are some.
- **Why it was left:** harmless. The numbers are right; it only costs some extra reads during the short time between switching shifts on and assigning people.
- **Size:** S. **Do it when:** read counts matter (free-plan limits) or many organizations switch shifts on before assigning anyone.
- **Done when:** the fallback path reads each collection once, shown by a test or a read-count line in the PR.

### B3. The live activity list shows only the calendar day's check-ins
- **Where:** `loadScopedEvents` in `src/lib/attendance-data.server.ts` and the activity list in `src/lib/shift-today.ts`; the panel itself is `TodayPanel.tsx`.
- **What happens now:** the "Live activity" list on the Today panel shows today's check-ins and check-outs, midnight to midnight. A night worker who checked in at 10pm on Monday appears on Tuesday's panel (the counts say they are on site), but their 10pm check-in is "yesterday", so it is missing from the list. Only their morning check-out shows. The counts are right; only the list looks out of step.
- **What to do:** when shifts are on, read events from the start of the earliest running shift (usually yesterday evening) instead of from midnight, and cap the list as now.
- **Why it was left:** it costs extra reads and only affects night shifts.
- **Size:** M. **Do it when:** night-shift customers say the list is confusing, or after the shift screens (phase 5) are in use.
- **Done when:** at 01:00, a worker who checked in at 22:00 the day before appears in the list, with a test.

### B4. Backups, point-in-time recovery and a budget alert (need the Blaze plan)
- **Where:** the live Firebase project `checin-d172e` (a console and command-line action, not code). The exact steps are in `docs/OPERATIONS.md`, "Backups" and "Usage and cost".
- **What happens now:** the live database has no scheduled backup and no point-in-time recovery, and there is no budget alert. The free plan does not offer them.
- **What to do:** when the live project moves to the Blaze plan: turn on point-in-time recovery, create a daily backup kept for 14 days, set a Google Cloud budget alert with email to the owner, and do one restore test into a throwaway database (then repeat monthly).
- **Why it was left:** it needs the paid plan and a console action by the owner, and there is no real customer data to lose yet.
- **Size:** S (about an hour, plus the restore test). **Do it when:** before the first paying customer, and at the same time the live project moves to Blaze (decision D1).
- **Done when:** the Firebase console shows point-in-time recovery and a daily schedule on `checin-d172e`, a budget alert exists, and the restore test date is written in `docs/OPERATIONS.md`.

## Done
_Nothing yet._
