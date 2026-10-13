# Design note: work-from-home diary (2.3b)

Status: **proposed, needs the owner's sign-off** (section 9). Nothing is built until it is approved.
Builds on `docs/WFH-DESIGN.md` (a work-from-home day is self-declared and carries no scanned hours). This note adds an **optional diary** that can show hours and activity for those days. It is built **natively inside ChecIN**: no connection to any other product.

## 1. What it is
An organization can switch on a **work-from-home diary**. On a declared work-from-home day, an employee starts a **work session**. While it runs, ChecIN records **10-minute intervals** with a few content-free numbers (never what was typed or seen). The manager reviews the day, and approved **diary hours** appear as their own figure in reports and exports. It is opt-in per organization, and each employee agrees to it before first use.

## 2. What we take from the RemoteWork Africa work diary (ideas only, nothing copied)
Reviewed read-only on 2026-10-12. Worth keeping as ideas: 10-minute intervals; counting event **frequency** only, never content; an interval with **no activity is not counted** and is flagged; an on-screen **disclosure** of exactly what is recorded; **deleting heavy data** (screenshots) after 90 days while keeping the summary; an audit view of intervals. Not carried over: contracts, hourly billing and rates, and anything its own audit flagged. That code also **has no recording side** (nothing calls its logging function), so this is a new build to ChecIN's standards.

## 3. What a web page can and cannot see (the honest limit)
A web page receives keyboard and mouse events **only inside its own tab**. It cannot see work done in other programs, other tabs or other windows, and phones put background tabs to sleep. So there are two tiers:
| Tier | What it measures | What it is good for |
|---|---|---|
| **1. Web work session (this note)** | That a person **started a session, stayed at their device, and answered random "still here?" checks**, plus visibility and, informationally, activity inside the ChecIN tab | Honest evidence of **presence at the device**, not of what they did. Best on a laptop or desktop |
| **2. Desktop agent (a separate, later decision)** | Keyboard and mouse **counts across the whole computer**, from a small signed app | The real "activity" signal. It is a separate product (Windows and macOS), with its own design, installer, updates and privacy review. **Not part of this note** |
So in tier 1, **hours come from verified presence, not from activity counts**. Activity counts are shown to the manager as extra context only.

## 4. Making it hard to fake (layers, and what each one cannot do)
No software can fully stop a hardware mouse jiggler or someone who answers prompts and does nothing. The goal is to make faking **costly, visible and reviewed**, and to keep a human in charge of what counts.
| Layer | What it stops | What it does not stop |
|---|---|---|
| 1. **Real input only.** Count only events the browser marks as genuine (`isTrusted`); synthetic events fired by a script are ignored | A script in the page that invents clicks | An external mouse jiggler or automation outside the page |
| 2. **Random "still here?" checks.** The **server** picks unpredictable times (a configurable number per hour). The person must click within 90 seconds. A missed check makes that interval **unverified** and it is not counted. Each check has a one-time code, so a recorded answer cannot be replayed | An idle jiggler, a session left running while away | A person who answers the prompt but does no work |
| 3. **Pattern checks on the server.** Each interval sends content-free numbers by type (keys, clicks, scrolls, moves, active minutes out of 10). The server flags: identical counts interval after interval, perfectly regular timing, movement with no clicks or keys for hours, activity while the tab is hidden, never a single idle stretch | Crude automation | A careful, randomised imitation. Flags are **shown to the manager as "looks automated", never punished automatically** |
| 4. **Time integrity.** The server clock decides. Each session gets a one-time **session key** at start; every interval is signed with it, so intervals cannot be invented offline, shifted, or replayed from another session. One interval per 10 minutes, no overlaps, nothing in the future, a session lasts at most 12 hours | Back-dated or fabricated entries, copied submissions | Honest-looking submissions from a real session |
| 5. **One session, one device.** Only one active session per person; a second device is refused | Running two sessions to double count; sharing an account on two machines | |
| 6. **Manager approval (the real control).** By default diary hours count **only after the manager approves the day**, with the interval strip and any flags in front of them | Everything above that slips through: a human can spot a day that does not fit the person's work | A manager who approves without looking (the approval is logged) |
| 7. **Optional, not in v1: random screenshot samples.** Stronger evidence, but the highest privacy and legal cost; would need explicit consent, a short retention, and a separate decision | Imitation of activity | |
All layers store **counts and timings only**. Nothing about content, applications or websites is ever recorded.

## 5. Rules (my recommendation)
| Question | Recommendation |
|---|---|
| Opt in | An **organization setting "Work-from-home diary"**, off by default |
| Consent | Before an employee's first session they see the disclosure ("ChecIN records when you start and stop, answers to still-here checks, and counts of keyboard and mouse events inside this page. It never records what you type or see.") and must agree. The agreement is stored with its date and wording version |
| When it can run | Only on a day the person has **declared work from home** (2.3), and only while the page is open and a session is started. A visible indicator is always shown; the person can pause and stop |
| Interval | 10 minutes. An interval counts as **verified** when it passed the still-here checks and was signed correctly. Hours = verified intervals x 10 minutes |
| Paused or unverified time | Not counted, and shown to the manager as such |
| Approval | A manager (or the admin) approves or flags each person-day. Unapproved diary time is exported separately and never counted as hours |
| Reports and exports | A separate **"WFH diary hours (approved)"** column and a count of flagged days. Never mixed into scanned entrance hours unless the admin chooses; counts toward overtime **only if the admin switches that on** |
| Employee's view | The person sees their own intervals, flags and approval status, so nothing is hidden from them |
| Retention | Interval detail is deleted after a set time (organization setting, default 12 months); the daily summary stays |

## 6. Data
- `wfh_diary_sessions/{id}`: `orgId`, `managerId`, `employeeId`, `dayKey`, `startedAt`, `endedAt`, `status`, `keyHash` (the session key is stored only as a hash). Server writes only.
- `wfh_diary_intervals/{sessionId_n}`: `orgId`, `managerId`, `employeeId`, `dayKey`, interval start, counts by type, active minutes, `visibleSeconds`, `livenessOk`, `verified`, `flags`. Deterministic ids so a retry cannot duplicate. Server writes only.
- `wfh_diary_days/{employeeId_dayKey}`: the daily summary the manager and reports read: verified minutes, unverified minutes, flags, `status` (pending, approved, flagged), `decidedBy`, `decidedAt`. Reports read **these**, never the raw intervals.
- `diary_consents/{employeeId_version}`: `orgId`, `employeeId`, `agreedAt`, `textVersion`. Server writes only.
- Organization settings: `wfhDiaryEnabled`, `livenessChecksPerHour` (0 to 4, default 2), `diaryRetentionMonths`, `diaryCountsTowardOvertime`.
- Rules default-deny: employees read their own, managers read their team's, admins read all; nobody writes from the client. Indexes by `(orgId, dayKey)`, `(orgId, managerId, dayKey)`, `(orgId, employeeId, dayKey)`. Every read bounded.

## 7. Server routes (all identity and organization from the verified token only)
Start a session (needs the diary on, a declared work-from-home day and a recorded consent); post an interval (signed, validated, idempotent); answer a still-here check; pause and stop; list a team's days for review; approve or flag a day. All rate limited, all logged with one `logEvent` line.

## 8. Build plan (each phase is one PR, reviewed before the next; built by Antigravity from prompts I write)
1. **Pure engine and tests:** interval validation (contiguous, no overlap, not future, signature check function), liveness scheduling, verified-hours calculation, the pattern flags (each with a table of tests including the "too regular" and "never idle" cases), day summary building.
2. **Data, rules, indexes and routes.**
3. **Employee work-session page and consent screen** (phone-aware: warns that background tabs may sleep).
4. **Manager review screens, the report column and export column.**
Later and separate: the desktop agent (tier 2) and screenshot samples.
Dependencies: work from home (2.3) built and connected; payroll (3.5) for the export column.

## 9. Risks
| Risk | Handling |
|---|---|
| Employee monitoring law and notice (Ghana, Nigeria, Kenya, the EU) | Opt-in, clear disclosure and recorded consent; content-free counts only; the employee sees their own data; **a short legal read per country before the first paying customer** (already in the system design) |
| Pretending the web version proves work | The note and the screens say it shows presence, not output; approval stays with a human |
| Being gamed anyway | Layers 1 to 6, flags, and logged approvals; a hardware jiggler remains possible and is stated |
| Trust and morale | Off by default; the employee's own view; no automatic penalties |
| Phones sleeping tabs | A clear warning; unverified time is shown, not hidden |

## 10. Decisions needed from the owner
1. **Tier 1 first (a web session with presence checks), with the desktop agent left as a separate later decision?** (recommended: yes)
2. **Hours come from verified presence; activity counts are shown to the manager as context only?** (recommended: yes)
3. **Random "still here?" checks, default 2 an hour, adjustable 0 to 4?** (recommended: yes)
4. **Diary hours count only after the manager approves the day?** (recommended: yes)
5. **No screenshots in v1?** (recommended: yes)
6. **Consent is required and recorded before the first session?** (recommended: yes)
7. **Interval detail kept 12 months by default, daily summary kept?** (recommended: yes)
8. **Anything customers have asked for?** (nothing assumed)
