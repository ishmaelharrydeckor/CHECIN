# ChecIN — v2 Feature Roadmap

Planning document only. Nothing here is being built yet. This captures a much larger HR/workforce feature set beyond the v1 core loop (sign up, invite, kiosk check-in/out), sourced from reference screenshots of a comparable product.

**One decision stays fixed regardless of anything below: no GPS, ever.** The reference screenshots include a geo-fenced clock-in feature. ChecIN deliberately does not have this — the kiosk QR mechanism is the only check-in method, verified end to end in the last security review. If this document is ever used to brief someone else (a designer, a new engineer, Antigravity itself), repeat this line to them, because "geofencing" is an easy feature to copy by accident when working from screenshots that include it.

---

## 1. New organizational layer: Division

The reference product has a level between company and team: **Company → Division → Team (Manager) → Employee**. ChecIN's current model is only **Org → Manager → Employee**.

**Proposed approach for v2:** add `divisions` as a grouping label, not a new tier in the claims model. A `divisions/{divisionId}` document (`orgId`, `name`) that a manager references via `divisionId` on their own record. Custom claims stay exactly `{ role, orgId, managerId }` — division-level dashboards are computed by grouping managers by `divisionId` server-side, not by adding a fourth claim. This avoids repeating the exact mistake already found once in this project (adding an identity field that isn't derived from verified claims and ends up trusted somewhere it shouldn't be). Revisit this if a division ever needs its own admin role distinct from org_admin — that would be a real claims-model change, not a label.

## 2. Leave: types and balances, not just requests

v1 has `leave_requests` (create, approve/deny). The reference product tracks actual **balances per leave type**, accrued and drawn down over a year:

| Type | Example |
|---|---|
| Paid Time Off (PTO) | 22 days/year, accrues monthly or as a lump sum |
| Sick | 10 days/year |
| Personal | 5 days/year |
| Parental | 120 days (jurisdiction-dependent) |
| Bereavement | 5 days/year |

**New collection:** `leave_balances/{employeeId}_{year}` — `orgId`, `employeeId`, per-type `{ allotted, used, remaining }`. Approving a leave request decrements the relevant type's balance; this needs to be a transaction (allotment and usage changing together, same "read-check-write" pattern that needed a transaction fix in `check-in/scan.ts`). Leave types themselves (`leave_types/{orgId}_{typeKey}`) are configurable per org, since statutory leave entitlements vary by country — this matters if ChecIN sells outside Ghana.

## 3. Work-from-home as a first-class status

Currently, presence is binary: checked in or not. The reference product has a third state — WFH — that counts as "present" for attendance-rate purposes without requiring a kiosk scan. This needs its own lightweight flow: an employee marks themselves WFH for a day (likely self-declared, with manager visibility, not necessarily requiring approval like leave does), and reporting needs to treat WFH, in-office, on-leave, and absent as four distinct states, not two.

## 4. Overtime tracking

Overtime is currently not calculated at all — v1's `clock_events` just records raw in/out timestamps. Overtime requires: a defined standard shift length per employee (or per org default), computing hours worked beyond that from the clock event pairs, and — this is the part with actual legal weight in some jurisdictions — a policy for how overtime is authorized (does a manager pre-approve it, or is it calculated after the fact from whenever someone clocks out?). This is exactly the kind of "varies by labor law" complexity the original v1 spec deferred shift scheduling over, and the same caution applies here: don't build a specific overtime-pay calculation until a real customer's actual policy is known.

## 5. Shift scheduling

Originally deferred; now confirmed for v2. Needs: shift definitions (Day/Early/Late/Night/Flex, or org-defined equivalents), an assignment of employees to shifts (per day or recurring), and a holiday calendar that shift scheduling and leave calculations both need to reference (a public holiday shouldn't count as an absence). This is the single largest net-new piece of data model in this roadmap — recommend scoping it as its own dedicated design pass when it's actually being built, not squeezed in alongside everything else here.

## 6. Reports & Exports

The reference product has report *generation* (on-demand: attendance register, leave ledger, headcount/absence trend) and report *scheduling* (automatic delivery on a cadence to specific email recipients — e.g. a payroll register sent to `payroll@company.com` on the 1st of each month).

The reference also includes a country-specific statutory filing (India's EPFO-5). ChecIN should **not** copy that specific report — it's irrelevant outside India. If statutory/compliance reporting is wanted for Ghana or wherever ChecIN actually sells, that needs its own research into what's actually required there, not a copy of a report built for a different country's labor law.

Scheduled report delivery is new infrastructure: a `report_schedules` collection plus something that actually sends email on a cadence (a scheduled Cloud Function, most likely) — this is meaningfully more than the request/response server routes everything else in ChecIN has been so far.

## 7. Employee self-service area

Currently the employee-facing surface is just the scan PWA. The reference product gives employees their own area to see their timesheet, their leave balance, and request leave themselves — this is a new set of screens, but no new backend concept: it's read access to the employee's own `clock_events` and `leave_balances`, plus the existing `leave_requests` create path, all already correctly scoped by `employeeId == caller.uid` in the current rules.

## 8. Dashboard analytics

Attendance rate, punctuality (as a metric distinct from attendance), average hours/day, leave utilization, trend charts, per-employee attendance heatmaps, "top drivers of absence." All of this is read-only aggregation over `clock_events` and `leave_balances` that already exist (or will, once the above are built) — no new write paths, but potentially significant read/aggregation cost at scale, worth designing with pre-aggregated summary documents (computed on a schedule) rather than recomputing every chart from raw `clock_events` on every dashboard load, the same class of scaling mistake QRoll's student portal made before it was fixed.

---

## Proposed tier mapping (supersedes the table in ChecIN-Billing-Architecture.md)

| Feature | Starter | Growth | Enterprise |
|---|---|---|---|
| Check-in/check-out, kiosk, today's attendance | ✅ | ✅ | ✅ |
| Leave requests (simple approve/deny) | ❌ | ✅ | ✅ |
| Announcements | ❌ | ✅ | ✅ |
| Leave balances & types | ❌ | ✅ | ✅ |
| Work-from-home tracking | ❌ | ✅ | ✅ |
| Reports & exports (on-demand) | ❌ | ❌ | ✅ |
| Scheduled/automatic report delivery | ❌ | ❌ | ✅ |
| Overtime tracking | ❌ | ❌ | ✅ |
| Shift scheduling & holiday calendar | ❌ | ❌ | ✅ |
| Divisions / multi-level dashboards | ❌ | ❌ | ✅ |
| Employee self-service portal | ❌ | ✅ | ✅ |

Adjust freely — the point of the table is that it's the *only* place this mapping lives, read by the `requireFeature()` check already designed in the billing document, never re-derived per route.

## Build sequencing note

This is a large expansion. When any of this actually moves from "document" to "build," it should go through the same process that worked for v1: a scoped Antigravity prompt per feature (not "build all of section 5"), a verification pass with quoted evidence rather than a narrative summary, and a check against AGENTS.md's principles before anything touches Firestore rules. Leave balances and overtime in particular touch money-adjacent calculations (payroll exports, statutory reporting) where a quiet bug is a business risk, not just a bug.
