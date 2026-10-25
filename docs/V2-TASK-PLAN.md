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

**Exit criteria:** a manager can go organization, then team, then person in at most three clicks; numbers agree everywhere on a screen; nothing is drawn for the future; no screen reads raw events for a period view; the geo-fence screens and India's EPFO filing from the reference are **not** built (no GPS, ever).

## Phase 5: Enterprise plan and AI assistant (all to be built)

Everything here is part of the build. Each feature is gated by plan through `src/lib/plans.ts` (the `FEATURES` table; `built: false` until it ships, so it can never be offered early). Each gets a short design note before UI work.

### Enterprise plan features

| # | Task | Who | Size | Notes |
|---|---|---|---|---|
| 5.1 | **SSO** (company sign-in: Microsoft, Google Workspace, Okta via SAML/OIDC) | I | L | Firebase Auth identity-platform providers. Claims are still set only by the server. Per-organization setup and domain verification |
| 5.2 | **SCIM provisioning** (the company's login system adds and removes people automatically) | I | L | After 5.1. Leavers lose access at once. Token per organization, hashed, Admin-SDK-only, rate limited |
| 5.3 | **Audit trail** (who did what: role changes, approvals, shift edits, settings) | I | L | Append-only `audit_log`, written by the server only, never editable; viewer and export for org admins. Builds on the existing `logEvent` call sites |
| 5.4 | **Full data export** (everything the organization owns, on request) | I | M | Admin only, rate limited, logged in the audit trail. Also serves data-protection requests |
| 5.5 | **Leave types and balances** (this is task 2.2, gated as Enterprise) | I | L | See 2.2 |
| 5.6 | **Scheduled report emails** (this is task 3.3, gated as Enterprise) | I | L | Needs email sending set up (also needed by 1.4) |
| 5.7 | **Overtime and payroll export** (tasks 3.2 and 3.5, gated as Enterprise) | I | L | Design #83. Pay rules are configurable per organization |
| 5.8 | **Live payroll / HRIS integrations** (Workday, BambooHR, Sage and similar) | I | L | After 5.7. One integration at a time, built to a real customer's system |
| 5.9 | **Regional compliance packs** (overtime thresholds, leave entitlements, break rules, public holidays per country/region) | I | L | Design note first: rules are data per region, not code per customer. Start with Ghana |
| 5.10 | **Enterprise contact flow** (a "talk to us" form instead of a price, and the owner's tool to grant features to one company: `featureGrants`) | I | S | Needs the real support address (domain) |
| 5.11 | **Service-level readiness** (backups, alerts, load test, status page) so a written uptime promise can be made | I | M | Issues #24, #25, #26 plus an error tracker. The promise itself is a contract matter |

### AI assistant

Design note first: `docs/AI-ASSISTANT-DESIGN.md` (5.12). Gated as feature `ai_assistant`; plan level decided: Growth (Enterprise includes it); audience decided: org admins and managers only.

| # | Task | Who | Size | Notes |
|---|---|---|---|---|
| 5.12 | **AI assistant design note** (audience, plan level, provider, privacy, cost limits, safety) | I | S | Rules already agreed: acts only as the verified caller with their existing permissions; reads summaries, not raw `clock_events`; never crosses organizations; user-typed text is untrusted; no location data; per-organization monthly limit; every question logged without secrets; privacy policy updated for the AI provider |
| 5.13 | **Assistant, read-only questions** (an admin or manager asks who was late, who is off on Friday; employees do not get the assistant) | I | L | Tools are the existing server routes, called with the caller's own identity |
| 5.14 | **Assistant, drafting** (announcements, report summaries, suggested rosters) | I | M | A person reads and approves every draft |
| 5.15 | **Assistant, confirmed actions** (approve leave, assign a shift) | I | L | Preview and a Confirm click, then the existing route runs with its own checks. Never acts on its own |
| 5.16 | **Assistant usage and cost controls** (per-organization limit, usage page, kill switch) | I | M | Built with 5.13, not after |

## Phase 6: Website analytics (decided: Vercel Web Analytics)

Cookieless visitor counts on the **public pages only** (landing, pricing, sign-up). Never inside the signed-in app, and never any advertising or cross-site tracker.

| # | Task | Who | Size | Notes |
|---|---|---|---|---|
| 6.1 | **Add Vercel Web Analytics** to the public pages only | I | S | Enable it on both Vercel projects (`checin`, `checin-6982`). Add the `@vercel/analytics` package (approved by the owner) |
| 6.2 | **Funnel events:** viewed pricing, started sign-up, completed sign-up, started trial | I | S | Event names only; no emails, names, ids or org details in any event |
| 6.3 | **Cookie, privacy and terms wording** updated to match (what we use: sign-in session, preference settings, cookieless counter; adding ads or social pixels would require a consent banner) | I | S | Edits #158 and the privacy proposal; lawyer confirms the no-banner position |
| 6.4 | **Guard test:** the build fails if a third-party tracker, advertising pixel or analytics script appears in the signed-in app, or any script from an unapproved host | I | S | Same pattern as the self-hosted-fonts test |
| 6.5 | Owner view of the numbers | I | S | Vercel's own dashboard to start; an in-app "Visitors" view only if asked |

## Phase 7: HR and payroll (after everything above; design first)

Design note: [HR-PAYROLL-DESIGN.md](HR-PAYROLL-DESIGN.md), a proposal with seven owner decisions (D1 to D7). **ChecIN never moves money**: it produces payment files for the company to upload. Tax and pension rules are **data with effective dates**, confirmed by an accountant, never constants in code. Pay data lives in Admin-SDK-only collections behind new roles. Gated as new features in `src/lib/plans.ts` (`built: false` until shipped).

| # | Task | Who | Size | Notes |
|---|---|---|---|---|
| 7.1 | **Design sign-off:** owner decisions D1 to D7, the accountant's brief, the **roles design** (`hr` and `payroll` through the server, a security review before any code) | I | S | Needs an accountant (D6) |
| 7.2 | **HR core: employee records** (profile, private fields in an Admin-SDK-only collection, emergency contact, contract details) | I | L | After 5.3 audit trail |
| 7.3 | **Employee documents** (contracts, IDs, expiry reminders) with access control | I | L | Needs file storage (Blaze plan) |
| 7.4 | **Joining and leaving checklists**; a leaver loses access automatically | I | M | Ties to invites and SCIM (5.2) |
| 7.5 | **Organization chart** and employee self-service edits (approved changes) | I | M | Builds on manager change |
| 7.6 | **Pay setup:** effective-dated pay per person (salary or hourly, allowances, fixed deductions), history, an audit entry per change | I | L | Pay data never on a manager-readable document |
| 7.7 | **Pay run engine** as pure, tested code: gather approved hours, leave and overtime; gross to net; rounding; corrections and back pay | I | L | After 2.2 leave balances and 3.2 overtime (design #83). Property tests |
| 7.8 | **Statutory rules for Ghana as data** (income tax withheld, pension and social-security contributions), versioned and dated, with the accountant's golden tests | I | L | Feeds 5.9 regional packs. Rules switched on only after the golden tests pass |
| 7.9 | **Pay run screens:** prepare, review (with things to look at), approve by a second person, lock, correct | I | L | Maker and checker |
| 7.10 | **Payslips:** a file per person, the employee's own self-view | I | M | Emailing needs 1.4 email |
| 7.11 | **Payment files and reports:** bank and mobile-money file formats, a journal for accounting software, statutory filing sheets | I | M | Formats come from the first customer's bank. Never moves money |
| 7.12 | **Access, privacy and plan:** every read of pay data logged, masked numbers, the data export and privacy policy cover it, the plan and price (D5) | I | M | Lawyer reviews the wording |
| 7.13 | **Live integrations** with accounting or payroll software | I | L | Only for the first customer who needs one (same rule as 5.8) |
| 7.14 | **Products and entitlements:** one account, many products; a company has attendance, HR and payroll, or both; the menu shows only what it bought | I | L | A second axis in `src/lib/plans.ts` (plan x product); billing handles each product and a bundle (1.7) |
| 7.15 | **Product switcher and cross-links:** a "products" menu in the app and on every public page, a footer on each product linking to the others, "Learn more" instead of a dead end for a product the company does not have | I | M | Shared shell (`AppShell`) |
| 7.16 | **Second flagship landing page and pricing page** for HR and Payroll, with its own FAQ and a "works with ChecIN Attendance" section; a waiting-list page earlier is fine | I | L | Needs the name and domain (decisions D8, D9) and the copy for its own buyer. Only goes live when the product exists |
| 7.17 | **Standalone payroll:** hours from a typed or imported timesheet or a fixed salary when the company has no attendance, and automatic hours when it has | I | M | Part of the pay run engine (7.7) |

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

Phase 7 (HR and payroll) comes last, after the Enterprise features it depends on (leave balances, overtime, the audit trail). Phase 5 (Enterprise plan features and the AI assistant) is part of the build and is scheduled alongside Phase 3, starting with the design notes. Billing (1.7) and plan gating (0.5) come with it, because plans must exist for features to be sold.

**Last of all:** Phase 4 (dashboard redesign) once every feature above is built and live. See `DASHBOARD-DESIGN-REFERENCE.md`.
