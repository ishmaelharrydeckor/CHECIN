# Product decisions (a living log)

What has been decided about where ChecIN and the products after it are going, so nothing lives only in a chat. **It is written to be expanded**: each item says whether it is decided, taken as agreed, or only an idea. Update the status and the date when something changes. The detailed designs live in their own notes; this file is the map.

**How we work (owner, 2026-11-17):** one decision at a time, written down before it is built; plain words; no big plans handed over for a yes. If a proposal is too big to react to, it is split.

**The rule that overrides the rest (owner, 2026-11-17): ChecIN must reduce an admin's work, never add to it.** Nothing may need routine review. Checks are automatic and quiet; the admin is told only when something is wrong. Any admin page is "there if you want it, never a task".

Status key: **Decided** (the owner said so), **Agreed unless changed** (my proposal, taken as agreed, easy to change), **Idea** (raised, not explored), **Open** (needs an answer).

---

## 1. Check-in when the tablet can't (the most pressing)

Full design: [CHECKIN-CONTINUITY-DESIGN.md](CHECKIN-CONTINUITY-DESIGN.md) (in pull request #215; the link works once that is merged).

| Item | Status |
|---|---|
| Every person has **their own fixed QR code** (a "check-in card"), saved on their phone so it opens with no internet, and printable | Decided |
| In an outage (tablet down, no power, no internet) **a permitted manager taps a button and scans people in** with their own phone ("attended check-in") | Decided |
| This is better than the manager showing a door code for everyone to scan, because only the manager's phone needs a connection, not every employee's. Showing a door code stays as a later option for crowds | Decided |
| It is an **amendment to AGENTS.md**, written down, not a quiet exception | Decided |
| **Admins and managers the admin has permitted** may do it | Decided |
| A check-in made this way is **flagged "recorded on a manager's device" and counted as normal** | Decided |
| **No photo** in the check-in flow (it adds storage and a read to every scan for little gain) | Decided |
| The check-in belongs to the **scanned person's own team**, not the scanning manager's | Agreed unless changed |
| In or out is **decided by the server** from the person's own last scan; nothing needs "routing" at closing time | Fact (how it works today) |
| Misuse is guarded **automatically**: a speed limit and duplicate refusal on the spot, the manager's name on every record, one quiet alert only when something is unusual. No review pages | Agreed unless changed |
| A session (the time the scanner is on) lasts **4 hours**, admin setting 1 to 8; **one active session per manager** | Agreed unless changed |
| A permitted manager can scan **anyone in the organization** | Agreed unless changed |
| Only **locations that already have a paired tablet** can be used | Agreed unless changed |
| The manager can **undo a scan within 2 minutes** | Agreed unless changed |
| An **admin or the person's manager** can replace a lost or shared code (the old one stops at once) | Agreed unless changed |
| The safety net when nothing works at all: **"I couldn't check in" corrections** and an **outage window** for a whole site (reusing the time-corrections work) | Agreed unless changed |
| Later, only if a customer needs them: the manager shows a door code; the tablet keeps ~45 minutes of codes; the manager's phone keeps scans offline | Idea |
| An **operations guide** (4G backup for the tablet, a power bank or UPS, office Wi-Fi at the door, a paper fallback) | Agreed unless changed |
| **Build order:** pin down the scan route with tests, then the check-in card, then the manager's scanner and the session, then the admin's list and the marks in the reports, then corrections and the outage window | Agreed unless changed |

## 2. Onboarding (admin, manager, employee)

Nothing is settled yet beyond the items below. We settle it one decision at a time.

| Item | Status |
|---|---|
| The goal is a product that **sells itself: very little friction**, and the time to the first working result is short | Decided |
| Three journeys, each judged by how fast the person gets something that works and how little they were asked: **the admin** (sign-up to a working check-in), **the manager** (joins in about a minute, then "invite your team"), **the employee** (the link, a name, their card, about a minute) | Agreed unless changed |
| **Bulk import from a spreadsheet** (Excel or CSV) for people, departments and managers, so nobody is invited one by one | Decided |
| The import must be **seamless**: any column order and headings, a preview before anything is sent ("142 ready, 6 need a look" with plain-word fixes), good rows go through even when others fail, departments are created from the file, a manager column places people on teams | Decided |
| A **downloadable template** is offered | Decided |
| An **AI helper** may tidy hard files, in layers: template first, then rules, then AI only to decide which column is which. It sees only headings and the *shape* of sample cells, never real names or emails; the key stays on the server; the admin always previews | Idea (liked, not designed) |
| **Links go out by email** automatically. The admin imports managers, each is emailed their link, they import their own people, and so on. A company with one spreadsheet for everyone can use a "manager" column instead | Decided |
| Email sending uses **Brevo**, which needs a verified sending address on our own domain (section 4) | Decided (waiting on the domain) |
| Until email exists, the import gives a **list of links to download** and a **"Send on WhatsApp"** button | Agreed unless changed |
| A role written in a file can **never make anyone an admin**; a manager's import can only add people to their own team | Decided (a security rule) |
| A friendlier first sign-up: a name, the check-in card shown straight away, add to the home screen, allow notifications, a three-line tour | Idea |
| **Open question, first to settle:** when a business owner signs up, what should be working by the end of their first ten minutes? (A: their people invited. B: an entrance set up and a test check-in done. C: both.) | Open |

## 3. Photos and face checks

| Item | Status |
|---|---|
| No photo in the check-in flow | Decided |
| A profile photo when someone joins, and the manager seeing it | Idea (later) |
| **Face verification, long term.** First the phone's own fingerprint or face unlock (ChecIN never sees the face), and only much later any face matching, after a lawyer's view on biometric data and with explicit consent | Idea (long term) |

## 4. The company, the domain and the products

| Item | Status |
|---|---|
| ChecIN is **one product of several**. More business programs will follow (HR and payroll next, others after) | Decided |
| Buy a **neutral parent domain**, with **each product on its own subdomain**, for example `attendance.<neutral>` and `hr.<neutral>` | Decided |
| Each product has **its own sign-in** at first (you sign in to the product you bought). A **landing page at the root** talks about all the products | Decided |
| The domain should be **chosen before the pilots start**: phones install the app and tablets pair against a specific address, and changing it later forces everyone to reinstall and re-pair | Agreed unless changed |
| **One sending address on a mail subdomain** for all products, each with its own friendly sender name, kept separate from staff email. The product-name domains (`checin.app` and similar) are bought defensively and redirect | Agreed unless changed |
| The neutral brand name | **Open** |
| Whether one sign-in should work across products later | Open (not needed for the pilots) |

## 5. Connecting to other systems and chatbots

| Item | Status |
|---|---|
| People should be able to **connect ChecIN to the systems and chatbots they already use**, easily. For example, a company using our attendance but with its own HR system, or asking its assistant "who is late today?" | Idea (raised 2026-11-17, not explored) |
| Already planned and designed, not built: a **read-only export API** with per-organization keys and **signed webhooks** for locked pay periods ([PAYROLL-OVERTIME-DESIGN.md](PAYROLL-OVERTIME-DESIGN.md), section 3.5) | Designed |
| Things to settle when we expand it: which direction first (they read from us, or we read from them); which systems and assistants first; how access is limited per organization and per kind of data; whether we offer a standard connector (MCP) for assistants | Open |

## 6. Where we are, and what comes next

- **Most pressing:** section 1, starting with the design note (PR #215) and, once it is approved, pinning down the scan route with tests.
- **Next, one decision at a time:** section 2, beginning with the open question about the admin's first ten minutes.
- **Soon:** the domain and brand name (section 4), which unblocks email.
- **Later:** section 5, and the HR and payroll product ([HR-PAYROLL-DESIGN.md](HR-PAYROLL-DESIGN.md), in pull request #185; the link works once that is merged).
- Waiting for merge or a decision elsewhere: the overtime and pay-period data and routes, the time-correction screens, the sign-up rebuild with email verification, the older design drafts. See the open pull requests.
