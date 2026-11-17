# ChecIN: Keeping check-in working when the tablet can't (design, revision 2)

Status: **draft for the integrator's approval. No code until agreed.** It adds a second way to record a check-in, by a manager, so [AGENTS.md](../AGENTS.md) rules 6 and 7 and the "three clients" section are touched on purpose (section 7).

Decided by the owner on 2026-11-17: **(1) this is an amendment to AGENTS.md, written down, not a quiet exception; (2) admins and managers the admin has permitted may do it; (3) a check-in made this way is flagged "recorded on a manager's device" and counted as normal; (4) the main route is the manager scanning each person's own code, not the manager showing a code.** Revision 2 follows (4): it is better than my first proposal, for the reasons in section 3.

**Design principle (owner, 2026-11-17): ChecIN must reduce an admin's work, never add to it.** Nothing here may need routine review. Checks are automatic and quiet; the system blocks or flags on its own and tells the admin only when something is unusual. Any page for admins is "there if you want it, never a task".

## 1. The problem in plain words

A normal check-in needs two live connections: the **tablet** must get a fresh code from the server, and the **employee's phone** must send the scan. If the office internet goes down, the tablet loses power or the office Wi-Fi is the only connection people have, nobody can check in. Today the screens say so clearly and a retried scan records once, but there is nothing to do until it comes back.

## 2. What exists today (so we start from facts)

| Thing | Today |
|---|---|
| The door code | `bucket.signature`, a 15-second slot signed with a secret that never leaves the server. The tablet draws the picture but cannot make the contents. Only a paired tablet can get one (its device secret, AGENTS rule 6) |
| How a scan is checked | The scan route loads the paired location, checks the organization, accepts the current slot and one either side (a 45-second window) by the **server's** clock |
| In or out | **Decided by the server from the person's own last scan today.** No code carries a direction. A second scan is an "out" whichever code or method was used |
| Repeat scans | A short cooldown ("you just scanned"); a retried request records once |
| Permissions for managers | The admin grants a claim to a manager through a server route (`kioskAdmin` today) |

## 3. The options, and why scanning people's own codes comes first

| | Option | Employee's phone needs data? | Manager's phone needs data? | Speed | Verdict |
|---|---|---|---|---|---|
| **B** | **Attended check-in: each person has their own code; a permitted manager scans people in** | **No.** The code is saved on the phone (or printed), so it opens with no connection | Yes (their own mobile data) | One person at a time, about 2 seconds each; several managers can scan in parallel | **Build first, for pilots** |
| A | A permitted manager shows a door code on their phone; everyone scans it | **Yes**, every phone | Yes | Everyone at once | Second: for a crowd, when people have data |
| F | Corrections ("I couldn't check in") and an outage window | No | No | Slow, afterwards | Build with B: the net under everything |
| R | The tablet keeps the next ~45 minutes of codes | Yes | No | Everyone at once | Larger customers, later |
| Q | The manager's phone keeps scans and sends them when the connection returns | No | No | One at a time | Later: needs a second design (section 6) |
| Ops | 4G backup for the tablet, a power bank or UPS, office Wi-Fi at the door, a paper fallback | | | | Write it with B |

**Why B beats A for the fallback.** In an outage the weak link is usually *the employees' connection* (the office Wi-Fi was their data), and sometimes their phones and batteries. With A, **every** phone must reach the server to scan. With B, only the manager's one phone does, and the employees need nothing but the code they already have. That is the scalability that matters in an outage: one connection to keep alive instead of two hundred.

**Where A still wins, honestly.** A crowd is faster with A, because everyone scans at the same moment; with B a manager scans one person every couple of seconds, so 100 people take about four minutes (two permitted managers halve it). For a small pilot office that is fine. For a large site at shift change, B is slow, and A (or the tablet) remains the normal way. B is a fallback, not a replacement for the tablet in normal times.

## 4. Option B in detail: attended check-in

**The person's code ("My check-in card").**
- A page in the employee portal shows the person's **name, photo (if they have one) and a QR code**. It is made once and **saved on the phone**, so it opens with no connection; the picture is drawn on the phone. It can also be saved as an image or printed, for someone with no smartphone.
- The code is fixed per person (not rotating): `ck1.{organization}.{person}.{version}.{signature}`, signed by the server with a secret that never leaves it. It cannot be guessed or forged. The `version` is stored server-side (`checkin_cards/{person}`, server-written only, default-deny).
- An admin (or the person's manager) can **replace** a person's code if it is lost or shared: the version goes up and the old code is refused from that moment.

**What a code can and cannot do.** **A code alone checks nobody in.** The employee's own phone cannot submit it; only a permitted manager's active session can. So a screenshot of someone's code is worthless without a permitted manager who scans it, and that manager is looking at the person in front of them.

**The manager's side ("Scan people in").**
1. **Start a session.** The manager taps **Scan people in**, chooses a location they are allowed to use, and a session starts. A session is the stretch of time the scanner is switched on, from Start to Stop or the time limit. **Proposed: 4 hours (admin setting, 1 to 8), one active session per manager.** Morning arrival is one session, closing time another.
2. **Scan.** The camera stays open and reads one code after another. Each result fills the screen briefly: the person's **name and photo**, and **"Checked in 08:02"** or **"Checked out 17:05"**. The manager confirms the face matches the name. A running count and the last scans are listed.
3. **Mistakes.** The same manager can undo a scan within two minutes (the same idea as a person undoing their own scan). A repeat scan inside the cooldown says so and records nothing.
4. **Self-scans refused.** A manager cannot scan their own code; another permitted manager or an admin scans them.

**What the server does with each scan.** `POST /api/check-in/attended` (verified token and permission; the session must be active, the caller's, unexpired and for that location; the code's signature, organization and version must be good; the person must be in the caller's organization). It then records the check-in **exactly as the scan route does**: the person's own direction, the shift rules (Strict or Lenient, so a scan far outside a shift is refused or noted the same way), the cooldown and the retry-once rule, the summary and the late flag. The time is the **server's clock**.

**Flagged, counted.** The event and the day carry `viaManagerId` and the session id. History, the register and the timesheet show **"recorded on a manager's device (Kofi)"**, and the numbers count as normal.

**Seen, if wanted.** The admin can open a page of **active sessions** (who, where, since when, how many people) and the last seven days of finished ones. It is there if they want to look; it is never something they have to do. Starts and stops are logged once with the counts; each scan is the normal logged check-in.

**Who can be scanned.** Anyone in the organization (a manager at the door sees everyone arriving, not only their team). Every scan is attributed to the manager.

**Which team the check-in belongs to.** The scanned person's own. The event takes its organization and manager from **that person's verified claims**, never from the manager holding the phone. So Ama (finance, reports to Esi), scanned by Kofi (sales), appears as "In" on Esi's Today panel, roster, register and timesheet like any check-in, with the mark "recorded on a manager's device (Kofi)". Kofi sees only his own session list.

**The engineering risk, and how I'd handle it.** The scan route is the busiest and most sensitive code in the product. The attended route must record a check-in the same way, so I would first **pull the "record a check-in for this person" step out into one shared function with the scan route's behaviour unchanged**, protected by new tests that pin down today's behaviour (direction, cooldown, shifts, retries, summaries), and only then add the attended route on top. That refactor is its own PR, reviewed before the feature.

**What it does not claim.** It does not prove where the manager is (no GPS, ever). It adds accountability: a permitted, named person looked at each person and answers for the scan, and the admin can see it. A fixed code can be copied, so on its own it would be weak; the controls are that only a permitted manager's active session can submit it, the manager sees the face and name, every scan is flagged and attributed, and a code can be replaced at once. I called fixed badge codes "not planned" in the first revision; with the human check and the session limit they are acceptable **as a fallback**, and still not as the normal way to check in.

### Guarding against misuse, with no routine work for the admin

In an outage everyone knows the tablet is down, so some will try their luck. The guard in the moment is a manager looking at a person; the rest must be automatic.

**In the pilot (all automatic, nobody has to review anything):**
- **The photo is shown large**, and a person with **no photo** shows "no photo on file: check ID", which also nudges everyone to add one at onboarding (section 6b).
- **A speed limit, enforced by the system.** A real queue cannot be scanned faster than about one person a second. Faster than that, or the same card twice in a row, is **refused on the spot** with a message to the manager. No one reviews it later.
- **Marked in the records.** Every scan carries the manager's name and the mark "recorded on a manager's device", inside the reports that already exist. No new report to read.
- **One quiet alert, only when something is unusual:** a single line in the admin's existing notices if a session records an unusually large number of people, or one person's check-ins are mostly on a manager's device over a week. Normal sessions say nothing.
- **A lost or shared code is replaced in one tap** (section 4) by the admin or the person's manager.

**Left off unless a customer asks (they add work):** a head-count the manager must enter at the end of a session (could be a per-company switch, off by default); a "were you there?" message to the person; a second admin look at very large sessions.

**What cannot be prevented:** a dishonest permitted manager is still the weak point. That is why permission is given by the admin to trusted managers only, and why every scan carries the manager's name. The design aims at making misuse hard, visible after the fact and cheap to ignore when nothing is wrong.

## 5. Option A: a manager shows a door code (second)

For a crowd, a permitted manager can show the door code on their own phone (an "active session" of kind "shown code", a full-screen code, the same 12-second refresh as the tablet, flagged and counted the same way). Everyone then scans with their own phone as usual, so it needs every phone to have data. A code carries the session id as a third part so the scan can be attributed; the scan route otherwise checks it exactly as today. A manager's own scan on their own code is refused. Same permission, same session limit, same admin view as B. Build it after B proves itself, and only if pilots ask for it.

## 6. The safety net (F) and what comes later

**F: when even the manager's phone is down.** Reuse the time-corrections work (#212, #214): **"I couldn't check in"**, a correction for a day with no check-in (reason, a manager or admin approves, nobody approves their own, flagged); an **outage window** the admin marks ("entrance offline 08:50 to 09:35") so managers can confirm who was in, in one pass; and a record of when a tablet went quiet, as evidence.

**Q (later): the manager's phone keeps scans and sends them later.** This needs the manager's phone to **verify codes without the server**, which means signing codes with a key pair (the phone holds only the public half), and to **start a session without the server**, which needs a time-limited pass issued earlier. Times would be the phone's own clock, which is a real weakening of "the server clock decides" (so such scans would be flagged "recorded offline" and bounded by the session and by the upload time). It is a second design, worth doing only after a pilot shows a customer who has no mobile data at all.

**R (later, larger customers):** the tablet keeps ~45 minutes of future door codes in memory so it keeps working when only its own connection drops.

**Ops (no code):** a one-page guide: a 4G SIM or router for the tablet, a power bank or UPS (power cuts matter as much as internet), office Wi-Fi that phones can use at the door, a paper register for the worst case and who enters it afterwards.

## 6a. Photos, and a longer road to face checks

Stage 1 and 2 are in this work; stages 3 and 4 are long term.

| Stage | What | Risk |
|---|---|---|
| 1 | A profile photo when someone joins (an admin can require it) | Low |
| 2 | The manager sees the photo when scanning | Low |
| 3 (long term) | **The phone's own unlock as the check** (passkeys: fingerprint or face unlock on the person's phone). ChecIN never receives the face or fingerprint, only "the owner unlocked it" | Medium; the safest real verification |
| 4 (long term) | ChecIN comparing a face to the photo | High: biometric data is especially sensitive under data-protection laws (Ghana's included). Needs explicit consent, careful storage, probably registration, a defence against someone holding up a photo, and it must work on cheap phones. Get a lawyer's view first |

## 6b. Onboarding worth completing

Today a new person gives an email and a password and nothing else. A short, friendly onboarding would also collect **a name and a photo**, show **their check-in card straight away** (so it is saved on the phone for an outage), offer to **add ChecIN to the home screen** and **allow notifications**, and show a **three-line tour** (scan, leave, shifts). For an organization's first admin it would end in the existing setup checklist. The photo needs somewhere to be stored (small, resized on the phone); that, the screens and the order of steps are a **separate design note** (onboarding and profile photo), written next. This note only needs the photo to exist.

## 7. The amendment to AGENTS.md

Add when the first build PR lands, so the rules and the code agree:

> **Amendment 1 (2026-11-17): attended check-in.** Rule 6 stands for the door code: only a paired tablet, proven by its device secret tied to that location, may produce it. A check-in may also be recorded by **attended check-in**: an organization admin, or a manager the admin has permitted, with a verified token and a logged, expiring session on a location they may use, scans a person's own signed card. A card alone checks nobody in; only an active attended session may submit it; the scan is recorded by the same code as a normal scan, with the server's clock, and is marked as recorded on a manager's device. The kiosk client still has no user account, and attended check-in is a feature of the manager dashboard client, never of the tablet. Rule 7 applies to every route involved.
>
> A manager may also show a door code from their own session (option A in docs/CHECKIN-CONTINUITY-DESIGN.md) under the same permission, session and marking.

## 8. Build plan (each is one PR into `staging`)

| Step | What | Done when |
|---|---|---|
| P1 | This note, approved | You approve or change it |
| P2 | **Pin down the scan route**: tests that fix today's behaviour, then extract the shared "record a check-in" function with no change in behaviour | The scan route passes every old and new test, unchanged on screen |
| P3 | **My check-in card** (page, saved on the phone, printable), the signed code and version, the admin's **Replace code** | A person's code opens with no connection and is replaced on request |
| P4 | The permission claim and its admin route, the **session** routes, the attended route, the manager's **Scan people in** screen, the flag, the amendment in AGENTS.md | A permitted manager scans three colleagues in on staging, with the tablet switched off |
| P5 | The admin's sessions page and the "recorded on a manager's device" mark in History, the register and the timesheet | The admin sees who scanned whom |
| P6 | "I couldn't check in" corrections, the outage window and the tablet's gap record | A person is fixed by their manager afterwards |
| P7 | The operations guide | A customer can set up the 4G backup and a power bank from it |
| Later | Option A, then Q, then R, in that order, only if a customer needs them | |

## 9. Decisions

**Made by the owner (2026-11-17):** an amendment, written down; admins and permitted managers; flagged as on a manager's device and counted; the main route is the manager scanning each person's own code.

**Taken as agreed on 2026-11-17 unless you say otherwise (every one can be changed later):**
1. **Session length 4 hours** (admin setting, 1 to 8), **one active session per manager**.
2. **Anyone in the organization** can be scanned by a permitted manager (not only their own team).
3. **Only locations that already have a paired tablet** can be used, because the scan route needs the location's record. (A site with no tablet at all is a later option.)
4. **Undo within two minutes** by the manager who scanned.
5. **The card shows the photo** if the person has one, and the name always.
6. **Replacing a code:** an admin, or the person's manager.
7. **Option A (the manager shows a door code)** after B, only if pilots ask.
