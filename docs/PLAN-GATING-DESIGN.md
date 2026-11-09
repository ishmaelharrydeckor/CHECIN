# Plan gating: design note

Plain-language summary of how paid features are tied to plans. The rules live in one file, `src/lib/plans.ts`; the server guard is `src/lib/plan-gate.server.ts`.

## The three modes (`PLAN_ENFORCEMENT`)

| Value | What happens |
|---|---|
| empty or `off` (default) | Nothing is checked and nothing is read. Behaviour is exactly as before. |
| `shadow` | Everything is allowed, but every request that would have been blocked is logged (`plan.gate`, `wouldBlock: true`). |
| `on` | A feature the plan does not include gets a 403 with `code: "plan_required"`. |

Roll-out: ship with `off`, set `shadow` on staging, read the logs, then `on`.

## Who gets what

- **Trial (14 days):** every feature, including Enterprise ones.
- **Grandfathered:** organizations created before trial dates were stored have no `trialEndsAt`. They keep everything and never expire until we decide otherwise.
- **Paid (`planStatus: "active"`, set only by billing, which does not exist yet):** features up to the plan's level.
- **Expired trial:** only what every plan has. Nothing is deleted; gated features are switched off. What happens to existing data on expiry is a decision still open (a grace period and read-only mode are suggested).
- **Per-company grants:** `featureGrants: { sso: true }` on an organization switches a feature on for that company whatever its plan (pilots, custom deals). Server-written only. A grant can only add; it never removes.

## Safety

- The plan is read from the caller's own verified organization, never from the request.
- If the organization cannot be read, the request is allowed and the fault is logged.
- Turning a paid setting OFF is never blocked.
- Plan data is cached for 60 seconds per server instance, so a plan change takes up to a minute to show.

## Wired so far

Analytics (`/api/analytics`), work from home (declare and remove), shifts settings (turning shifts or breaks on).

**Shifts routes.** Adding is gated; taking away never is, so a company can always tidy up after a trial ends.

| Route | Gated (feature) | Never gated |
|---|---|---|
| Shift assignments (`/api/shifts/assignments`) | giving people shifts (`shifts`) | removing assignments |
| Repeating patterns (`/api/shifts/patterns`) | creating a pattern, filling it ahead, changing it (`shift_patterns`) | ending a pattern |
| Shift swaps (`/api/shifts/swaps`) | proposing a swap (`shift_swaps`) | accepting, declining, cancelling or approving a swap already in progress |

Each check sits right after the caller and their permission are known and before any work, and asks about the caller's own verified organization.

## Not wired yet (later PRs)

The scan route (hot path: decide whether it needs a check at all); the nightly pattern refill (`/api/cron/shift-patterns`), which fills patterns for every organization and so needs a plan read per organization before it can skip those whose plan no longer includes patterns; screens that show a locked/upgrade state; the trial-end message; billing. The six Enterprise features (audit trail, data export, leave types and balances, scheduled report emails, overtime and payroll export, SSO) are listed in the table as `built: false` so they can never be offered before they exist.
