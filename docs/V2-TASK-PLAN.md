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
