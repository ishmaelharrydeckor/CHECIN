# Design note: Work from home (task 2.3)

Status: **approved by the owner on 2026-10-12** (decisions 1 to 4 below). Decision 5: no customer has asked for approval, weekly limits or half days yet, so they are not in the first version.
Why a note first: this changes what "present" means, and that feeds the Today panel, the register, analytics and later payroll.

## 1. What it is
An employee can say "I am working from home on these days". Managers can see it. It counts as attending, but it is **self-declared**: unlike a scan at the entrance tablet, nothing proves it. Every screen must say so plainly.

Four states for a working day: **in office** (scanned), **working from home** (declared), **on leave** (approved), **absent** (none of these).

## 2. Rules (my recommendation)
| Question | Recommendation | Why |
|---|---|---|
| Does it need approval? | **No in v1.** Self-declared, instant, visible to the manager | Matches the plan, and keeps it light for the pilot. An organization setting "WFH needs approval" can come later |
| Which days can be declared? | **Today and up to 30 days ahead, Monday to Friday only.** Not holidays, not days with approved leave | Same working-day assumption as the dashboard and register. No back-dating, so nobody fills in last week afterwards |
| Can an employee cancel? | Yes, for today and future days | Plans change |
| What if they also scan at the office that day? | **The scan wins**: shown as present in the office. The WFH day is ignored for that day | A scan is proof; a declaration is not |
| What if leave is approved on a WFH day? | **Leave wins** | Leave is approved by a manager |
| Who can declare for someone else? | **Nobody in v1.** A manager or admin can remove a team member's WFH day | Avoids managers marking people as present |
| Hours worked? | **None are recorded or estimated** for a WFH day | The old Reports page invented 8 hours for a single scan. Never again: no scans means unknown hours |
| Location? | **Never.** No GPS, no location permission, no distance check | Product rule |

Day status order, highest first: **present (scan) > leave > work from home > holiday > day off > absent**.

## 3. Data
New collection `wfh_days`, one document per person per day, with the id `{employeeId}_{dayKey}` so a repeat request cannot create a duplicate.

| Field | Meaning |
|---|---|
| `orgId`, `managerId`, `employeeId` | From the verified login, never from the request |
| `employeeName` | Display label only, saved when declared |
| `dayKey` | `YYYY-MM-DD`, the organization's day |
| `createdAt` | Server time |

Written **only by the server** (Admin SDK): `POST /api/wfh` (declare up to 14 days at once) and `DELETE /api/wfh` (cancel). Clients never write the collection.

**Firestore rule** (default-deny, same read scopes as `clock_events`): read for the employee themself, their manager, and org admins of the same organization; `create, update, delete: if false`.

**New indexes** (deploy before the code): `wfh_days (orgId, dayKey)` and `(orgId, managerId, dayKey)`.

**Server checks on declare:** verified login; the person belongs to an organization and (for managers' teams) has a manager; each day is a real Monday to Friday between today and today + 30 in the organization's timezone; not a holiday; not covered by approved leave; rate limited (30 requests per hour); at most 14 days per request.

## 4. How the numbers change
- **Today panel and `/api/attendance/today`:** `counts.wfh` becomes real: people with a declared WFH day today **and no scan**. `present` stays "scanned today", because that is what the clock events prove. `absent = expected - present - wfh - onLeave`.
- **Register and CSV/PDF (`report-data.ts`):** the `wfh` status appears on declared days that have no scan and no leave. Totals count a WFH day as **attended**, with no hours.
- **Analytics (2.4):** attendance rate counts present plus WFH; hours-based figures **exclude** WFH days and say so.
- **Not affected:** `clock_events` and `daily_summaries` are untouched. WFH is a separate record, so summaries stay rebuildable from scans alone.

## 5. Screens
- **Employee, on "My page":** a card "Working from home" with a button for today, a date picker for the next 30 days (weekdays only), and a list of declared days with Cancel. A line says: "This is your own declaration. Check-ins at the entrance tablet are separate."
- **Manager and admin:** the Today panel shows the WFH tile and a "Working from home today" list (names only); the register shows the `W` status; a manager can remove a team member's day.
- Plain-language errors for each refusal: "Leave is already approved on that day", "That day is a holiday", "You can only choose weekdays in the next 30 days".

## 6. Risks and how we handle them
| Risk | Handling |
|---|---|
| Declared WFH hides real absence | Visible to the manager on the Today panel and register; labelled "self-declared"; a manager can remove it; the scan always wins |
| It later feeds pay | WFH carries no hours. Payroll must not treat it as worked time without an explicit rule from a real customer |
| Teams misuse it | Add an organization policy later (approval, weekly limit) |
| Extra reads | One small query per dashboard load and per report, bounded by team size and days |

## 7. Who builds what
- **Cobberson:** the employee card on My page and the manager's WFH list, as **screens with sample data** in the data shapes below (as for the Today panel and reports). No fetching.
- **Integrator:** the collection, rule, indexes, the two routes, and wiring into the Today route, the register and analytics.

```ts
export interface WfhDay { dayKey: string; declaredAt: string }          // "2026-10-14"
export interface MyWfh { days: WfhDay[]; maxAheadDays: number }         // the next 30 days, newest last
export interface WfhTodayPerson { employeeId: string; name: string; department: string }
```

## 8. Decisions (owner, 2026-10-12)
1. **Self-declared with no approval in v1?** **Decision: yes.**
2. **No back-dating** (today and the next 30 weekdays only)? **Decision: yes.**
3. **WFH counts as attended but not as "present"** on the Today tile, and carries **no hours**? **Decision: yes.**
4. **Only the employee declares**; managers and admins can remove? **Decision: yes.**
5. **Anything customers have asked for?** **Decision: nothing requested yet.** Approval, weekly limits and half days wait until a customer needs them.

Open for later: half days, recurring patterns ("every Friday"), notifying the manager, an organization policy setting.

> **Update (2026-10-12):** an optional work-from-home **diary** (a started work session with presence checks, reviewed by the manager) is designed in `docs/WFH-DIARY-DESIGN.md`. Until it is built and switched on for an organization, this note's rule stands: a work-from-home day carries no hours.
