# ChecIN v2 — Task Plan

Source: `docs/ChecIN-V2-Feature-Roadmap.md` + what we learned building v1 and the first lab pilot.
**One rule never changes: no GPS, ever.** The kiosk QR is the only check-in method.

## How the work is split

- **Teammate-friendly (T):** mostly new screens and read-only views in their own new files. Low risk to existing users.
- **Integrator-only (I):** touches sign-in, roles, Firestore rules, payments, or money/time calculations. Built or reviewed by the integrator, always checked against `AGENTS.md`.
- Sizes: **S** ≈ 1–2 days, **M** ≈ 3–5 days, **L** ≈ 1–2 weeks.
- Flow for everything: feature branch → PR into `staging` → test on staging → PR `staging` → `main`.

## Phase 0 — Foundation (do first; nothing else depends on luck)

| # | Task | Who | Size | Notes |
|---|---|---|---|---|
| 0.1 | Create `staging` branch + separate Firebase project + Vercel staging | I | S | Staging never touches the lab's data |
| 0.2 | Branch protection on `main` and `staging` (PR required) | I | S | GitHub settings |
| 0.3 | GitHub Action: `tsc` + `npm run build` on every PR | I | S | Catches broken code from any contributor |
| 0.4 | `CONTRIBUTING.md` + PR checklist for teammates | I | S | "How to ask Claude", no-secrets rule |
| 0.5 | Plan / feature gating (`requireFeature()` from one tier table) | I | M | Needed before selling tiers; see roadmap tier table |
| 0.6 | First automated tests: scoping, roles, time-window logic | I | M | `attendance-windows.ts` is pure, easy to test |

## Phase 1 — Finish v1 gaps (the pilot will ask for these)

| # | Task | Who | Size | Depends on |
|---|---|---|---|---|
| 1.1 | **Leave requests (basic):** employee requests, manager approves/denies | T + I review | M | Rules already exist; no UI yet. Status starts `pending` |
| 1.2 | **Employee self-service page:** my timesheet, my leave, my notices | T | M | 1.1 |
| 1.3 | **Change password** on Account page (current, new, confirm) | T | S | — |
| 1.4 | **Real email verification + forgot-password by email** once real emails are in use | I | S | Real addresses; currently all emails are marked verified |
| 1.5 | Remove demo/mock leftovers (e.g. fake initial locations list in Settings, `seed-demo`) | T | S | — |
| 1.6 | Dashboard polish for managers: today's attendance, late list | T | M | Late flags already exist |
| 1.7 | Billing (Stripe or similar) per org / per seat | I | L | 0.5. Money: integrator only |

## Phase 2 — Core v2 features

| # | Task | Who | Size | Depends on |
|---|---|---|---|---|
| 2.1 | **Reports, on-demand:** attendance register, leave ledger, headcount/absence trend (CSV/PDF export) | T | M | 1.1 |
| 2.2 | **Leave types + balances** (per org, configurable; approving a request decrements in a transaction) | I | L | 1.1. Money-adjacent: quiet bugs are business risk |
| 2.3 | **Work-from-home status** (self-declared, manager visible, counts as present) | T + I review | M | Four states: in-office, WFH, on leave, absent |
| 2.4 | **Dashboard analytics:** attendance rate, punctuality, avg hours, trends | T (UI) + I (aggregation) | L | Pre-aggregated daily summary docs, not recompute from raw events on every load |
| 2.5 | Public holiday calendar (per org/country) | T | S | Needed by shifts, leave, absence |

## Phase 3 — Heavy features (design pass first, each)

| # | Task | Who | Size | Depends on |
|---|---|---|---|---|
| 3.1 | **Shift scheduling** (Day/Early/Late/Night/Flex, assignments, recurring) | I design, T build UI | L | 2.5. Needs its own design doc |
| 3.2 | **Overtime tracking** (hours over standard shift; approval policy) | I | L | 3.1. Do not hard-code pay rules until a real customer's policy is known |
| 3.3 | **Scheduled report delivery** (email on a cadence) | I | L | 2.1, email infrastructure |
| 3.4 | **Divisions** (grouping label above teams; no new claim) | I | M | Keep claims as `{role, orgId, managerId}` |
| 3.5 | Payroll export formats | I | M | Wait for a customer's actual format |
| 3.6 | **Reporting database (Supabase / Postgres), hybrid with Firebase** | I | L | **Only when a trigger fires** (see `SYSTEM-DESIGN.md` 12.6, decision D9). First a one-day experiment; Firestore stays the source of truth and Firebase Auth the only identity. Not for teammates. |

## Phase 4 — Dashboard redesign (LAST: only after every feature above is built)

Target look and structure: [DASHBOARD-DESIGN-REFERENCE.md](DASHBOARD-DESIGN-REFERENCE.md). **Do not start any of this early.** The redesign needs the real data and features it displays, and teammates keep following `UI-STYLE-GUIDE.md` until 4.8. Every task starts with a design pass (mock in ChecIN's own palette and wording), and the integrator reviews against the "do not copy" list in the reference doc.

**Gate to start:** 0.7b summaries (#23), 1.1 leave, 1.2 employee page, 2.1 reports, 2.2 leave balances, 2.3 work from home, 2.4 analytics data, 2.5 holidays are all done and on `main`. Phase 3 items (shifts, overtime, divisions, scheduled reports) join the redesign only if they have shipped; otherwise their slots are left out, not faked.

| # | Task | Who | Size | Depends on |
|---|---|---|---|---|
| 4.1 | **Design pass:** a mock of the shell, KPI row, organization, team, employee and reports screens in ChecIN's palette; confirm the status colour system (present / work from home / on leave / absent / weekend / holiday) | I | M | Gate above |
| 4.2 | **App shell:** grouped left sidebar with action-count badges, "Jump to" search, breadcrumbs, period control area; drawer on phones | I (shared file `AppShell.tsx`) | L | 4.1 |
| 4.3 | **`KpiCard` and period control:** Today / Week / Month / Quarter / YTD, filter chips (location first), change vs previous period, real sparklines only when history exists | I design, T build | M | 4.1, summaries with history |
| 4.4 | **Organization dashboard:** up to 4 KPI cards per row, trend chart with metric tabs and Line/Area/Bar toggle, leave composition as horizontal bars, table of children (teams; divisions only if 3.4 shipped) with drill-down | I data, T UI | L | 4.2, 4.3 |
| 4.5 | **Team roster:** status and shift pills, check-in time, attendance and punctuality bars, location, filters; **card list on phones** | T + I review | M | 4.3 |
| 4.6 | **Employee detail:** stats header, month heatmap, leave balance bars, today's timeline, recent leave, hours chart | I data, T UI | L | 4.5, 2.2, 2.3, 2.5 |
| 4.7 | **Reports hub:** report cards with Preview and Generate, plus a scheduled reports table | T + I review | M | 2.1, 3.3 |
| 4.8 | **Update `UI-STYLE-GUIDE.md`** and the teammate Claude Project instructions to the new pattern; migrate the remaining old screens | I | M | 4.2 to 4.7 |
| 4.9 | **Acceptance pass:** every figure on every screen traces to one server calculation (no tile and chart can disagree), phone check at 375 px, accessibility check (no colour-only status), read-cost check with the load-test harness (#26) | I | M | 4.2 to 4.8 |
| 4.10 | **Landing page rewrite, honest and original** (owner decision, 2026-10-06: happens after the build). New copy in ChecIN's own words describing only what exists at that time: no invented features (the current page lists SSO, SCIM, statutory compliance, leave balances), no invented pricing or plans, no testimonials or numbers we cannot back. New layout and wording, not a 1:1 copy of any other site. Plain language, per the copy guide. | I (owner approves wording) | M | Everything above is built, 4.8 style guide updated |
| 4.11 | **Remove the clone artifacts from the repository:** `preview.html`, `current-copy-audit.md` (a verbatim extraction of another company's site text), and the comments saying the page is "Exact 1:1 from preview.html" in `src/routes/index.tsx` and `src/styles.css`. | I | S | With 4.10 (can be done earlier, see the risk note) |

**Public launch gate (owner decision).** The landing page rewrite (4.10) and clone removal (4.11) happen **after the build**. Until they are done, ChecIN's public page must not be promoted, linked from outreach or shown to customers, and no one should rely on its feature or pricing claims. The risks while it waits, so they are known and accepted on purpose:
- The current landing page (`src/routes/index.tsx`) was built 1:1 from `preview.html`, a clone of another company's landing page, and about 19 lines of that company's text are still on it word for word. `preview.html` and `current-copy-audit.md` are committed in a **public** repository. Copying another company's text and layout one-to-one is a copyright and reputation risk. (Not legal advice: take real advice before launch.)
- It promises things that do not exist: SSO, SCIM, audit logs, statutory compliance per region, leave balances, a free tier and named plans.
- Cheap steps that reduce the exposure without waiting for the rewrite, if the owner wants them: delete the two clone files from the repo (the app does not use them), and ask search engines not to index the landing page.

**Exit criteria:** a manager can go organization, then team, then person in at most three clicks; numbers agree everywhere on a screen; nothing is drawn for the future; no screen reads raw events for a period view; the geo-fence screens and India's EPFO filing from the reference are **not** built (no GPS, ever).

## Shared files — teammates do not edit these (integrator wires them in)

`src/components/AppShell.tsx`, `src/routes/auth.tsx`, `src/integrations/firebase/admin.server.ts`,
`firestore.rules`, `AGENTS.md`, `src/routeTree.gen.ts` (generated), anything in `src/routes/api/admin/`.
New features go in **new files**; the integrator adds menu entries and rules.

## Questions to answer from the lab pilot before building Phase 2–3

1. Which leave types does the lab actually use, and how many days each?
2. Do they work fixed hours or shifts? Any overtime rules?
3. Who needs reports, how often, and in what format (CSV, PDF, email)?
4. Do people work from home, and should that count as present?
5. Are real work emails available (for verification and reset emails)?

## Suggested order of execution

Phase 0 (tomorrow) → 1.3, 1.5 (quick wins, good first tasks for teammates) → 1.1 → 1.2 / 1.6 / 2.1 in parallel → 2.2 / 2.3 / 2.4 → Phase 3 after the lab's answers.

**Last of all:** Phase 4 (dashboard redesign) once every feature above is built and live. See `DASHBOARD-DESIGN-REFERENCE.md`.
