# ChecIN: Keeping check-in working when the tablet can't (design)

Status: **draft for the integrator's approval. No code until agreed.** It changes who may produce a check-in code, which is the proof that someone was physically there, so [AGENTS.md](../AGENTS.md) rules 6 and 7 and the "three clients" section are touched on purpose (section 7). Decided so far by the owner on 2026-11-17: **(1) this is an amendment to AGENTS.md, written down, not a quiet exception; (2) admins and managers the admin has permitted may show a code; (3) a check-in made on a manager's code is flagged "recorded on a manager's device" and counted as normal.**

## 1. The problem in plain words

A check-in needs two live connections: the **tablet** must get a fresh code from the server, and the **employee's phone** must send the scan to the server. If the office internet goes down, or the tablet loses power, nobody can check in. Today the scan page and the tablet say so clearly, and a retried scan records once, but there is nothing to do about it until the connection comes back. Many customers will have this on some mornings.

## 2. What exists today (so we start from facts)

| Thing | Today |
|---|---|
| The code | `bucket.signature`, where the bucket is the current 15-second slot and the signature is made with a secret that never leaves the server (`generateKioskToken`). The tablet draws the picture itself but cannot make the contents |
| Who can get one | Only a paired tablet, by sending its device secret (`/api/kiosk/token`). AGENTS rule 6 requires exactly this |
| How a scan is checked | The scan route loads the paired location, checks it is in the person's organization, and accepts the current slot and the one either side of it (a 45-second window), by the **server's** clock (`verifyKioskToken`) |
| In or out | **Decided by the server from the person's own last scan today.** The code carries no direction, so the same code works for arriving and leaving |
| Who may manage tablets | The admin, and managers the admin permits through a `kioskAdmin` claim (`/api/admin/kiosk-access`) |

Two things follow. First, a check-out never needs "routing": whatever code is on screen, the person's second scan of the day is an "out". Second, any device that can fetch a valid code can stand in for the tablet.

## 3. The options

| | Option | Works when | Needs | Verdict |
|---|---|---|---|---|
| **A** | **A permitted manager shows the code on their own phone** | The tablet or office internet is down, and the manager's phone has data | Manager online; employees' phones online | **Build first, for pilots** |
| **B1** | **A person shows their own rotating code; a permitted manager scans it** | Same, and also when an employee's phone cannot scan | Both phones online | Pilot step 2, if you want it |
| F | A correction: "I couldn't check in", approved by a manager; plus an **outage window** for a whole site | Nothing works at all | Nothing live | **Build with A**: the safety net |
| R | A **code reserve**: the tablet keeps the next ~45 minutes of codes in memory | The tablet's internet drops but phones have data | Tablet online beforehand | Larger customers, later |
| B2 | A personal code made offline on the phone (like an authenticator app), scanned and sent later by the manager | Neither phone has data | A secret per person on their phone | Later, only if a customer needs it |
| C | A printed badge with a fixed QR | Everything | Nothing | **Not planned**: a fixed code can be copied and shared |
| Ops | A written guide: 4G backup for the tablet, a power bank or UPS (power cuts matter as much as internet), office Wi-Fi at the door, a paper fallback and who enters it afterwards | Always | A little money | Write it with A |

## 4. Option A in detail: a manager shows the code

**What a manager sees.** On the dashboard, a button **Show check-in code**. They choose a location they are allowed to use, and a full-screen page shows the code, the location name, the time left and a **Stop** button, with the screen kept awake. If the connection drops, the page says the code has stopped updating, exactly as the tablet does.

**What a "session" is.** A session is the stretch of time the code is switched on: from tapping **Show check-in code** to tapping **Stop**, or until the time limit. Morning arrival is one session; closing time is another. The limit exists so a forgotten phone does not keep making codes all night. **Proposed: 4 hours, an admin setting from 1 to 8.** The manager can start a new one any time.

**Who.** The admin, and managers the admin has permitted. Permission is a claim written only by the server through an admin-only route, the same pattern as `kioskAdmin` (`/api/admin/kiosk-access`), switched off by default and revoked at once (the route also revokes the manager's sessions, as the existing one does). A permitted manager may use only the locations the admin lists for them.

**How it works.**
1. **Start.** `POST /api/kiosk/roaming/start` (verified token, permission, a paired location in the caller's organization) creates `roaming_sessions/{id}`: organization, location, manager, start, expiry, status. One active session per manager.
2. **The code.** `POST /api/kiosk/roaming/token` (verified token and the session id; the session must be active, unexpired, the caller's and the location's) returns the same kind of code and the same "seconds left" the tablet gets. The page asks every 12 seconds, like the tablet. Because a code depends only on the location and the slot, a tablet and any number of managers' phones show codes that are all valid at the same moment.
3. **The picture.** The code carries the session id as a third part (`location::code::session`). The scan route is otherwise unchanged: same freshness check, same direction logic, same shift rules (Strict or Lenient). If a session id is present it also checks the session is active, unexpired, in the person's organization and for that location.
4. **Not their own.** A scan whose person is the session's manager is refused ("Ask someone else to show the code"). Managers use the tablet or another permitted person's code.
5. **Marked.** The event and the day's summary carry `viaManagerId` and the session id. History, the register and the timesheet show **"recorded on a manager's device (Kofi)"**; the numbers are counted normally.
6. **Seen.** The admin gets a list: **active sessions** (who, where, since when, how many check-ins) and the last seven days of finished ones. Each start and stop is logged once with the counts; the 12-second code requests are not logged one by one.
7. **Stopped.** Stop, expiry, the admin ending it, or the permission being removed. Scans on its codes are refused from the next scan.

**What it is not.** It does not prove where the manager is: ChecIN has no GPS and will not get any. It adds **accountability** (a named person is responsible for every check-in on their code, and the admin sees it) in place of a fixed place. Forwarding a screenshot is exactly as hard as photographing the tablet today: the code is worthless after about 45 seconds.

**Data.** `roaming_sessions`: server-written only, default-deny for browsers (a rules guard test lists it), read through the admin's route. An index on `(orgId, startedAt desc)` for the admin's list and one on `(orgId, managerId, status)` for the one-active-session check. No change to `clock_events` rules (still server-written).

**Tests that must pass before merge.** A stopped, expired, other-organization, other-location or other-manager session is refused; a manager without permission, or whose permission was removed, cannot start or get a code; a manager cannot check themselves in; the same code scanned twice records once (the existing retry rule); flagged events carry the manager and are counted; token requests are rate limited and the session limit holds; the admin can end any session; **the tablet's own route and secret are untouched**.

## 5. Option B1: the person's code, scanned by a manager (pilot step 2)

The person opens **My check-in code** in their portal: a code that changes every 30 seconds, signed by the server for that person. A permitted manager with an active session taps **Scan people in** and points their camera at it. The server records an in or an out (the person's own direction logic) flagged with the manager, and the manager's screen shows the **name and the result**, so they can see it is the person in front of them. A person can only be scanned by someone permitted for their team or location.

Why you might want it: it works when an employee's phone cannot scan (camera, permission, an old browser), and a person is checked in by a human who sees them, which is the strongest answer to buddy punching. Why it is step 2: it needs a new page for the person, a new scanner for the manager and a new kind of code, and A already covers the main outage. Say if you want it in the first pilot.

## 6. The safety net (F): when nothing works at all

Reuse the time-corrections work (#212, #214).
- **"I couldn't check in."** A correction for a day with no check-in, with the same flow: a reason, the manager (or an admin) approves, nobody approves their own, an audit trail, shown flagged. It is the fallback for a person with no data.
- **Outage window.** The admin marks "entrance offline 08:50 to 09:35". Managers then confirm who was in, in one pass, with the same approval and flag. Recorded times are the ones the manager enters, never the browser's.
- **The tablet's gap.** When a tablet reaches the server again after a long silence it says so, and the admin sees "tablet offline 08:50 to 09:35", which gives the outage window its evidence.

## 7. The amendment to AGENTS.md

Add when the first build PR lands, so the rules and the code agree:

> **Amendment 1 (2026-11-17): who may produce a check-in code.** Rule 6 stands: a code may only be produced by a party that can be held to account for where it is. That is (a) a paired tablet, proven by its device secret tied to that location, or (b) an organization admin or a manager the admin has permitted, with a verified token, a logged and expiring session on a location they are allowed to use, and the check-ins made on their code marked as recorded on a manager's device. The kiosk client still has no user account. Option (b) is a feature of the manager dashboard client and never makes the tablet a person's login. Rule 7 applies to both: each route checks its own authorization.

## 8. Build plan (each one PR into `staging`)

| Step | What | Done when |
|---|---|---|
| P1 | This note, approved | You approve or change it |
| P2 | The permission claim and its admin route, the session routes, the manager's **Show check-in code** page, the scan attribution and flag, the amendment text in AGENTS.md, tests | A permitted manager shows a code and a colleague checks in on staging |
| P3 | The admin's sessions list and the "recorded on a manager's device" mark in History, the register and the timesheet | The admin sees who showed which code and how many check-ins |
| P4 | "I couldn't check in" corrections, the outage window and the tablet's gap record | A person with no data is fixed by their manager afterwards |
| P5 | The operations guide | A customer can set up a 4G backup and a power bank from it |
| P6 (if wanted) | Option B1 | A manager scans a person's own code on staging |
| Later | Option R, B2 | Only when a larger customer needs them |

## 9. Decisions

**Made by the owner (2026-11-17):** an amendment, written down (section 7); admins and permitted managers; flagged as on a manager's device and counted.

**Proposed, please confirm or change:**
1. **Session length 4 hours**, an admin setting from 1 to 8 hours; the manager can restart at any time.
2. **One active session per manager.**
3. **Only locations that already have a paired tablet** can have a manager's code (the scan route needs the location's record). A site with no tablet at all is a later option.
4. **Option B1 in the first pilot, or after?** (recommended: after.)
5. **Who may end a session:** the manager who started it and any org admin.
