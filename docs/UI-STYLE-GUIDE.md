# ChecIN UI style guide

Every screen must look like it belongs to the same app. This guide is taken from the real code (`src/styles.css`, `dashboard.tsx`, `settings.tsx`, `announcements.tsx`, `holidays.tsx`), so the class names below are exact and safe to copy. **When in doubt, copy an existing screen's markup rather than inventing a new look.**

Updated for the Phase 4 screens (shell, roster, review screens, reports hub): see section 5b.

Teammates: add this file to your Claude Project's knowledge, and when you start a task, also paste a screenshot of the most similar existing page and say "match this".

## 1. Principles
1. **Calm and clear.** White cards on a pale grey canvas, dark forest-green text, a lime accent. No gradients, no bright reds and blues, no decorative shadows.
2. **Reuse, don't invent.** Use the components in `src/components/ui/` (Card, Button, Badge, Input, Label, Dialog, AlertDialog, Skeleton, Tabs, Table, Select, Textarea, Switch). Never write your own button or card with raw HTML.
3. **Every screen has four states:** loading (Skeleton), empty (a friendly sentence and one action), error (plain message and "Try again"), and filled.
4. **Phone first for anything an employee sees**, then widen for desktop.
5. **Plain language.** Short sentences, no jargon, no exclamation marks.

## 2. Colors
The brand colors live in `src/styles.css`. Prefer the named tokens when a Tailwind class exists (`bg-card`, `text-muted-foreground`, `border-border`, `text-destructive`). Where the app uses exact hex values, use these:

| Role | Value | Use |
|---|---|---|
| Forest (primary, headings, main text, primary button) | `#0E2322` | titles, body text, primary buttons |
| Forest hover | `#163331` | primary button hover |
| Lime (accent) | `#C0FD9B` | highlights on dark areas, avatar text |
| Lime dark | `#122300` | text on lime |
| Mint | `#CBEED3` | "in / present / good" pills and tiles |
| Butter | `#FCF2CB` (border `#F5E6B0`, text `#854D0E`) | attention tile |
| Amber | `#FFD153` | late markers |
| Page background | `#F8FAFC` | set globally, don't repeat it |
| Card | white | `bg-white` or `bg-card` |
| Borders | `slate-200` (`border-slate-200/80` on cards) | |
| Secondary text | `text-muted-foreground` (`#64748B`) or `text-slate-500` | |
| Error | `text-destructive` (`#EF4444`) | form errors, remove actions |
| Success | `text-emerald-600` | small positive notes |

**Status colors (always the same everywhere):**
- Clocked in / present / approved: mint pill `bg-[#CBEED3] text-[#0E2322]` with an `emerald-600` dot.
- Clocked out / neutral / past: `bg-slate-100 text-slate-700` with a `slate-400` dot.
- Late / early departure / needs attention: `bg-amber-100 text-amber-900`.
- Pending: amber as above. Rejected or failed: `text-destructive`, not a big red block.
Do not invent new status colors.

**Day status (roster, register and reports; always the same everywhere).** A person's state for a day uses these and nothing else. The wording is always shown as words, never colour alone:

| State | Words | Classes |
|---|---|---|
| Here | On site | `bg-[#CBEED3] text-[#0E2322]` with an `emerald-600` dot |
| Left | Left for the day | `bg-slate-100 text-slate-700` |
| Working from home / on leave | Working from home, On leave | `bg-slate-100 text-slate-700` |
| Holiday | Holiday | `bg-slate-100 text-slate-500` |
| Not arrived / absent | Not arrived, Absent | `bg-amber-100 text-amber-900` |
| Not yet due / day off | Expected later, Not working today | `bg-slate-50 text-slate-600` / `text-slate-500` |
| Late, left early | Late, Left early (a tag beside the state) | `bg-amber-100 text-amber-900` |
| Late but excused | Late, excused (a tag) | `bg-slate-100 text-slate-700` |

**Counts waiting for someone** (a number on a menu item): `rounded-full bg-amber-100 text-amber-900 text-[11px] font-semibold`. It is a number, spoken as "N waiting", never a red dot.

## 3. Typography
- Font: **Inter** (already global). Never set a font family.
- Page title: `text-2xl font-bold tracking-tight text-[#0E2322]`
- Page subtitle: `text-sm text-muted-foreground mt-0.5`
- Card title: `text-base font-semibold` (inside `CardTitle`)
- Section heading inside a custom panel: `text-base font-bold text-[#0E2322]` with `text-xs text-slate-500` under it
- Small label above a number: `text-xs font-semibold uppercase tracking-wider`
- Big number: `text-3xl font-extrabold text-[#0E2322]`
- Body and table text: `text-sm`; helper and meta text: `text-xs`; tiny tags: `text-[11px]`

## 4. Page layout
The app shell already provides the width (`max-w-7xl`) and padding. A page starts like this:

```tsx
<div className="space-y-6">
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#0E2322]">Page title</h1>
      <p className="text-sm text-muted-foreground mt-0.5">One line saying what this page is for.</p>
    </div>
    {/* primary action, if any */}
    <Button className="bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium self-start sm:self-auto">
      <Plus className="size-4 mr-1.5" /> Add thing
    </Button>
  </div>
  {/* cards below, spaced by space-y-6 */}
</div>
```
Do not add your own outer padding or max width. Set `<title>` and description in `head()` like the other routes ("Page name — ChecIN").

## 5. Components and patterns

**Card** (the default container): `<Card className="border-border/80 shadow-sm">` with `CardHeader` (`pb-3`), `CardTitle className="text-base font-semibold"`, optional `CardDescription className="text-xs"`, then `CardContent`.

**Metric tile** (the row of numbers at the top of a page). Grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`. Tile: `bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between`, label row (`text-xs font-semibold uppercase tracking-wider text-slate-500` plus an icon in `p-2 rounded-xl bg-slate-50 text-slate-700`), then the number, then a `text-xs` note. Use **at most one or two** coloured tiles per row: butter (`bg-[#FCF2CB] border-[#F5E6B0]`, text `#854D0E`) for "attention", mint (`bg-[#CBEED3] border-[#B2E2BD]`) for "good". The rest are white.

**Buttons:** primary `bg-[#0E2322] hover:bg-[#163331] text-white text-xs font-medium` (one per screen area); secondary `variant="outline" className="border-slate-200 text-xs"`; row actions `variant="ghost" size="icon"` with an `aria-label`, destructive icon `text-destructive hover:text-destructive`. While saving: disable and show `<Loader2 className="size-3.5 mr-1.5 animate-spin" />`.

**Forms:** `Label className="text-xs font-medium text-[#0E2322]"` above each field, `Input className="h-10 text-sm"`, field wrapper `space-y-1.5`, form `space-y-4`. Errors: `<p role="alert" className="text-xs text-destructive">`. Success and failure messages use `toast.success(...)` / `toast.error(...)` from `sonner`. Validate before sending and say what to fix.

**Status pill:**
```tsx
<span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#CBEED3] text-[#0E2322]">
  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> Clocked IN
</span>
<span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-900">Late</span>
```

**Avatar (initials):** `w-9 h-9 rounded-full bg-[#0E2322] text-[#C0FD9B] font-extrabold flex items-center justify-center text-xs`

**Lists:** `<ul className="divide-y divide-border/70">`, each row `flex items-center justify-between gap-3 py-3`, main text `text-sm font-medium`, secondary `text-xs text-muted-foreground`; use `truncate` and `min-w-0` so long names don't break the layout. Tables: the `Table` components in `ui/`, headers `text-xs uppercase text-muted-foreground`, container `rounded-xl border border-slate-200 overflow-hidden`.

**Loading:** `Skeleton` blocks shaped like the content (`className="h-14 w-full"`), with `aria-busy="true"`.

**Empty state:** centred, `py-12 text-center space-y-3`, a muted icon (`size-8 text-muted-foreground/60`), a `text-sm font-medium` heading, a `text-xs text-muted-foreground` sentence, and (for admins) one primary button.

**Error state:** centred message in `text-sm text-destructive` and an outline "Try again" button.

**Dialogs:** `Dialog` for forms, `AlertDialog` for "Are you sure?" on removals. Footer: Cancel (outline) on the left, primary action on the right.

**Icons:** only from `lucide-react`, `size-4` in buttons and rows, `size-8` in empty states.

## 5b. Patterns added in Phase 4 (copy these; do not invent variants)

**The app shell** (the menu, top bar, breadcrumbs, "Jump to"). The integrator owns it (`AppShell.tsx`); a page never draws its own menu or breadcrumb. Pages need only a title and, if the page is in the menu, an entry the integrator adds. The top bar shows the trail "Group > Page" automatically. "Jump to" (Ctrl or Cmd + K) lists the pages in the person's own menu, so a new page appears in it as soon as it is in the menu.

**Filter chips** (choose one view of a list). A row of `button`s in a `div role="group" aria-label="..."`, each `h-9 rounded-full px-3 text-[13px] font-medium`, with the count after the name. Selected: `bg-[#0E2322] text-[#C0FD9B]` and `aria-pressed="true"`. Not selected: `border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`. The counts always come from the same list that the chip filters.

**Percentage bar** (attendance, on time). The number in words beside the bar, then a thin bar: a `role="meter"` with `aria-valuenow`, `aria-valuetext`, track `h-1.5 rounded-full bg-slate-100`, fill `bg-emerald-600`. **No data is a dash `–` and an empty bar, never 0% or 100%**, and the screen reader hears "No data yet". One bar colour only; never red/green by value.

**Table on a desktop, cards on a phone.** Render both and switch with CSS: the table in `hidden lg:block overflow-x-auto rounded-2xl border border-slate-200`, the cards in `<ul className="space-y-2 lg:hidden">` with `rounded-2xl border border-slate-200 bg-white p-3`. A phone card shows the name and the most important fact first, then the state pill, then the secondary figures (two per row at most). Use `min-w-0` and `break-words`; never let a label collide with a number on a 375 px screen (put labels on their own line).

**Report card** (the reports hub). A `Card` with `CardTitle`, a `CardDescription` of what it contains, one small line saying who it covers, then, if it can be made as a file, a "Period" select and CSV / PDF buttons (`h-10`), and a quiet text link "Preview and choose dates". The hub shows only reports that exist. **Do not draw a table, card or button for something that is not built** (for example scheduled reports); leave it out until it ships.

**Day picker** (review screens). Previous (`size-10` icon button, `aria-label="Previous day"`), a date `Input type="date"` (`h-10 w-40`), Next. "Today" comes from the server in the organization's timezone, not the device. Only real days are accepted.

**Detail dialog** (one person's day). `Dialog` with `max-h-[90vh] overflow-y-auto sm:max-w-2xl`. Order: figures in a small grid (`Figure`: `text-xs font-semibold uppercase tracking-wider text-slate-500` over a `text-base font-bold` value), the status, "Worth a look" (flags are prompts, not findings, and the dialog says so), then the rows, then the decision buttons at the bottom with the reason if they are disabled.

**Settings card with a switch.** `Card` with a `Switch` row (`flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4`): a bold line "The thing is on/off" with a `text-xs text-muted-foreground` line saying what that means now. Loading is a `Skeleton`, an error has "Try again", and a save shows a toast. The card says plainly what is not decided here.

**Times.** Show a clock time only when the server has formatted it in the organization's timezone. Where a time could be read in the wrong zone, show time into the session ("1:10 to 1:20") instead. Never call `toLocaleTimeString` or read the device clock to decide what "today" is.

## 6. Responsive rules
- Test at **375 px wide**. Nothing may scroll sideways; stack columns with `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- Buttons and tap targets at least 40 px high on employee screens (`h-10`).
- Hide secondary table columns on phones (`hidden sm:table-cell`) rather than squeezing. A table with more than four columns becomes a list of cards on a phone (section 5b).
- Anything with a number and its label side by side must still read at 375 px: put the label on its own line rather than letting two labels meet.

## 7. Don'ts
- No new colors, fonts, shadows heavier than `shadow-sm`, or border radii other than `rounded-xl` / `rounded-2xl` / `rounded-3xl` / `rounded-full`.
- No emoji in the interface, no ALL CAPS except the small tile labels above.
- No custom CSS files or inline `style=`; use Tailwind classes.
- No new UI libraries.
- Never colour-code by something other than the status colors in section 2.
- Don't copy the dashboard's *data logic*; copy only the look.

## 7b. Showing data (rules learned from the Roster page)
A screen can follow every colour rule and still be unhelpful. These keep data screens useful:

1. **Lead with the answer.** Start with the numbers and lists a manager opens the page for (who is in, who is late, who has not arrived), not a raw log.
2. **Bound every list.** Either show at most **20 rows**, say "Showing the latest 20 of N" and link to the full page ("View full history"), or, for a roster or a register people filter and scan, show **50 at a time** with "Showing 50 of N" and a "Show more" button, on top of a server limit (500 people). Never render a list that can grow without limit.
3. **Always show which day.** Times without a date are ambiguous. Put the date in the section subtitle or group rows by day, and show times in the organization's timezone exactly as the server sends them.
4. **Never calculate in the screen.** Counts, percentages, "late", "today" and totals come from the server. The screen only displays them. If a number looks wrong, fix the server, not the screen.
5. **Don't show columns that never change.** If every row has the same value (one entrance, "verified" on every row), hide the column. Don't show internal or technical terms such as "HMAC", "token" or "telemetry" to managers.
6. **Don't show placeholders as data.** If a value is missing, leave it out or write a plain label. Do not fill in a default like "General" and present it as real.
7. **Charts must be honest.** Only draw days or points that have happened and have data. Never draw the future as zero. With little or no data, say so in a sentence instead of an empty or misleading curve. Prefer bars for counts per day; avoid smooth area lines for a handful of points.
8. **Say what loading, empty and error mean.** "Loading today's check-ins…", "No check-ins yet today", and "Couldn't load, try again" are three different messages. Never show the empty message while still loading.

9. **Words, never colour alone.** A state is always written ("On site", "Late", "Flagged"); colour only supports it. Bars and meters carry the number and a spoken value.
10. **No data is a dash.** A percentage, average or total with nothing behind it shows `–` and says why if it helps. It is never 0, never 100, never a guess.
11. **Draw only what is built.** If a feature does not exist yet, its card, tab, column or table is left out. Do not show a disabled placeholder, a sample row or a "coming soon" tile on a real screen.
12. **Things waiting for the person go on the menu, not on every page.** A count belongs on the menu item that holds the work (Leave, Work diary), and a page shows its own list; do not repeat the count in a banner.
13. **Keep money, hours and decisions apart.** A figure that is approved, flagged or waiting is shown with that status. Approved diary time is a separate column from scanned hours and is never added to it.

## 8. Reference screens (match these)
| If you are building... | Look at |
|---|---|
| A list with add/edit/remove | `src/routes/_authenticated/holidays.tsx` |
| A settings-style form | `src/routes/_authenticated/settings.tsx` |
| A row of number tiles | the top four tiles in `src/routes/_authenticated/dashboard.tsx` (**tiles only**) |
| A list of events or people | the list in `src/routes/_authenticated/holidays.tsx` (compact rows), **not** the wide table at the bottom of `dashboard.tsx` |
| A feed of posts | `src/routes/_authenticated/announcements.tsx` |
| A profile / account card | `src/routes/_authenticated/account.tsx`, `src/components/ChangePasswordCard.tsx` |
| A roster or list people filter and scan (chips, bars, phone cards) | `src/components/dashboard/TeamRoster.tsx` |
| A hub of reports with preview and generate | `src/components/reports/ReportsHub.tsx` |
| A manager's day-by-day review with a detail dialog | `src/routes/_authenticated/wfh-review.tsx`, `src/components/wfh/diary/DiaryDayDialog.tsx` |
| A settings card with a switch | `src/components/shifts/ShiftSwapSettingsCard.tsx`, `src/components/wfh/diary/DiarySettingsCard.tsx` |
| The menu badge, breadcrumb and "Jump to" (integrator only) | `src/components/AppShell.tsx`, `src/components/nav/JumpTo.tsx` |

## 9. Quick check before opening a PR
- [ ] Looks like the reference screen next to it (same title size, card style, button style, spacing)
- [ ] Only the colors in section 2; status colors used correctly
- [ ] Loading, empty, error and filled states all exist
- [ ] Looks right at 375 px and at desktop width
- [ ] No sideways scroll; long text truncates
- [ ] Plain-language text, no jargon
- [ ] Patterns from section 5b used where they apply (chips, bars, table and phone cards, report card, day picker, detail dialog, settings card)
- [ ] Data screens follow section 7b: bounded lists with a date and a link to the full page, nothing calculated in the screen, no constant columns, honest charts, correct loading/empty/error wording
