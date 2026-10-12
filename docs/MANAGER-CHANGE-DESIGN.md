# Design note: an employee changes manager (E1)

Status: **approved by the owner on 2026-10-12** (decisions 1 to 5 below). Decision 6: no customer has asked for future-dated moves or manager-requested transfers, so they are not in the first version.
Why a note first: it decides who can see whose history, and it feeds the Today panel, reports, leave approval, analytics and later payroll.

## 1. The question
An employee moves from Manager A's team to Manager B's. **What happens to the check-ins, summaries and leave requests they already have?** Who sees them, and who sees the new ones?

## 2. What the code does today (so we start from facts)
| Thing | Today |
|---|---|
| Who someone reports to | Custom claim `managerId`, plus a copy on `users/{uid}.managerId` that the roster reads |
| Changing it | Only `POST /api/admin/roles`, which has **no screen**. It changes the **claims only**. It does **not** update `users/{uid}`, so the roster still lists the person under the old manager. It also does not touch leave requests or write an audit entry |
| `clock_events` | Carry the manager **at the time of the scan** (from the token). Never edited, so history is already a snapshot |
| `daily_summaries` | Carry the manager from the **first scan of that day**. Later scans that day keep it (`...prev`), so the changeover day belongs wholly to the old manager |
| `leave_requests` | Carry the manager **when the request was made**. A manager may approve a request if `managerId` equals their uid, so a **pending** request stays with the old manager after the move |
| Manager views | Dashboard roster = `users.managerId`; reports and history = records whose `managerId` equals the manager. So after a move the two disagree: the person is in the old manager's roster list but their new days are in the new manager's records |
| A manager is removed or demoted | Their team still points at their uid: a team nobody manages. Only the admin can see them |

So today a move leaves the roster, the records and pending leave pointing at different managers. That is the problem to fix, not just a question of policy.

## 3. Rules (my recommendation)
| Question | Recommendation | Why |
|---|---|---|
| Do old records change? | **No.** Events and summaries keep the manager they were written with. Never rewritten | They are facts. Rewriting would silently change past totals and anything built on them (payroll) |
| Who may move someone? | **Org admin only**, through one new server action. Managers cannot move people between teams | Keeps teams from being raided or emptied; one place to audit |
| When does it take effect? | **From the next scan.** Claims change at once and the person is signed out to refresh them. Anything already written today stays with the old manager | Simple and predictable. A "from tomorrow" date adds complexity for no clear need |
| What does the old manager keep seeing? | **The days they actually managed** (records whose manager is them). Not the person's new days, and not the person in their roster | They ran the team then; last month's team report must not change after the fact |
| What does the new manager see? | **Everyone currently on their team, with their full history**, including days before the move | A manager must be able to see their report's pattern. Reached by employee id, not by the old manager id |
| Org admin | Sees everything, unchanged | |
| Pending leave requests | **Move to the new manager** (the server rewrites `managerId` on pending ones only; decided ones stay) | Otherwise the old manager must approve for someone who no longer works for them |
| Work-from-home days (2.3) | Same as check-ins: they carry the manager when declared | |
| Removing or demoting a manager who has people | **Refused** until the team is moved (or "move the whole team to X" is used) | Stops teams nobody manages |
| Payroll (E3) | Uses the manager stored on the day, never the current one | Keeps exports exact and repeatable |

## 4. Data
- **New action** `PUT /api/organization/member-manager` (org admin only): `{ uid, managerId }`. In one go it: validates the new manager is a manager in the **same** organization (token, not the request); updates the claims; revokes the person's sessions; updates `users/{uid}.managerId` and `managerChangedAt`; re-points the person's **pending** leave requests; and writes one history record. It replaces the roles route for this job (the roles route stops accepting `managerId` changes, so there is one path).
- **New collection** `team_changes/{id}` (server writes only, default-deny rule, org-scoped read for the admin): `orgId`, `employeeId`, `fromManagerId`, `toManagerId`, `changedAt`, `changedBy`. This is the audit trail and answers "who managed this person on this date".
- **New index** on `daily_summaries`: `(orgId, employeeId, dayKey)`, deployed before the code. Same for `clock_events` if the history screen needs it.
- **No migration.** Existing records already carry their manager.

## 5. How the screens change
- **Reports, register, analytics and history** for a manager read two things and join them: the records whose manager is them (days they managed), and the records of people currently on their team (found in batches of 30 by employee id). Duplicates are removed by record id. Costs one extra bounded query per 30 people.
- **Today panel and roster:** unchanged in shape; they now agree with the records because the roster is updated in the same action.
- **Admin:** a "Manager" dropdown per person next to the department dropdown on the People card (screen work, after the server action).
- Plain-language messages for each refusal: "That person is not in your organization", "Choose a manager, not an employee", "Move this manager's team first".

## 6. Risks and how we handle them
| Risk | Handling |
|---|---|
| Roster and records disagree (today's bug) | One action updates claims, roster and pending leave together; a test checks all three |
| Changeover day is split | Documented: the day belongs to the manager at the first scan. The new manager sees it through the person's history |
| A manager can read a person's pre-move history | Intended. They are now that person's manager |
| An old manager loses sight of someone | Intended, except for the days they managed |
| Many moves in one go | Rate limited; at most 50 pending leave requests re-pointed per move, with a clear message if there are more |
| Someone is signed out when moved | Expected, and said in the message to the admin |

## 7. Who builds what
- **Integrator:** the server action, the audit collection and rule, the index, the two-sided history reads, and the fix for the roles route.
- **Teammate (after approval, screens only):** the Manager dropdown on the People card and a small "Team history" list for the admin, in sample data first.

## 8. Decisions (owner, 2026-10-12)
1. **Admin only can move people** (managers cannot)? **Decision: yes.**
2. **The new manager sees the person's full history; the old manager keeps only the days they managed**? **Decision: yes.**
3. **Pending leave requests move to the new manager**? **Decision: yes.**
4. **A manager who still has people cannot be removed or demoted** until the team is moved? **Decision: yes.**
5. **Takes effect from the next scan**, with the person signed out once? **Decision: yes.**
6. Anything customers have asked for, such as a future-dated move or managers requesting a move? **Decision: nothing requested yet.**

Open for later: future-dated moves, a manager "request transfer" flow, more than one manager per person, department heads separate from managers.
