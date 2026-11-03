# Test log

What has been tested on staging, by whom, and what is still open. One row per round. A round counts as done when the owner has seen the results **and** some proof that it was really run (screenshots or answers to specific questions). Update this file when a round comes back; the checklists themselves are `ROUND-5-TEST-CHECKLIST.md`, `ROUND-6-TEST-CHECKLIST.md` and `ROUND-7-TEST-CHECKLIST.md`.

| Round | Returned | Tests | Result | Tester | Proof | Still open |
|---|---|---|---|---|---|---|
| 5 | 26 Oct 2026 | 61 | All passed, no failures, no notes | Augustine Opoku (the name on the file) | Word file saved by him | Part H (owner-only: Firebase indexes, rules, Vercel deployment) is marked passed in the file; the owner should confirm H1 to H3 themselves |
| 6 | 31 Oct 2026 | 113 | All passed, no failures, no notes | The tester (no name on the file) | The tester showed the owner proof when asked (3 Nov 2026) | Part K (owner-only: the nightly refill and the diary secret) |
| 7 | 31 Oct 2026 | 113 | All passed, no failures, no notes | The tester (no name on the file) | The tester showed the owner proof when asked (3 Nov 2026) | Part K (owner-only: indexes, secrets, plan checks, fonts, alerts, night-shift set-up); **part I (the timezone warning) depends on the safety release, which was still an open PR when the file came back, so repeat part I once it is merged**; the keyboard shortcuts were added after Round 7 was written and are not covered |

## How to read this
- "All passed with no notes" is a result, not a guarantee: a note on every test costs the tester little and makes a result much easier to trust. The next round (Round 8) asks for **one line of what was seen on each test, plus the tester's name, date and device**.
- A passed test that depends on code that was not yet on staging when the round was run has to be repeated after that code is merged. The "Still open" column says which.
- Owner-only parts (the Firebase and Vercel consoles, secrets, server settings) are for the owner; a tester's P on them is not enough.

## Next round (Round 8)
- The keyboard shortcuts (press `?`), the timezone warning, and the HR and payroll pages once they exist.
- Part I of Round 7, if it was not run on the merged code.
- Anything that failed or looked odd in earlier rounds, once fixed.
