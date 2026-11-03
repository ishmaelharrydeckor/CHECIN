# Test checklist, round 8: only what has not been tested yet

Rounds 5, 6 and 7 are done (see [TEST-LOG.md](TEST-LOG.md)). **This round holds only what still needs testing**: the scanner changes that went on staging after round 7 was written, and the work that was not on the test site when round 7 ran (the timezone warning and the keyboard shortcuts). There is nothing in it that an earlier round already covered.

**Tester:** ______________   **Date:** ____________   **Device and browser:** ______________

**Web address tested:** ______________________   **Which releases are on it (the owner fills this in before you start):** scanner changes: yes / no   timezone warning: yes / no   keyboard shortcuts: yes / no

## How to fill this in (different from earlier rounds)
- **Result:** **P** (passed), **F** (failed) or **S** (skipped). If a part says its release is not on the test site, mark every test in it **S**. Do not mark P on something you did not see.
- **What you saw: write one short line for every test, including the ones that pass** (for example "buzzed, then showed 08:12 at Main Entrance" or "card said UTC, Keep UTC removed it"). A blank line means the test was not done.
- For every **F**, add the test number, what you did, what you expected, the exact words on screen, and a screenshot.
- Use only test logins. Start anything you create with the word **TEST**. Never share passwords in chat.

## What you need (the owner sets this up before testing)
- The test address and which releases are on it (above).
- Test logins (write each email here, never the passwords): organization admin ____________, manager A ____________, an employee on manager A's team ____________.
- For part A: a tablet showing the entrance screen (paired to a TEST location), and **two phones if possible, one Android and one iPhone**.
- For part B: an organization still on the default **UTC** timezone that has never been confirmed, and a second one like it.
- For part C: a computer with a keyboard, and a work-diary day waiting for a decision (an employee who ran a session, as in round 7 part F).

## A. The scanner on a phone (on the test site now)
The scanner was changed to read from further away: a sharper camera picture, automatic focus, a short buzz when a code is read, and a bigger code on the tablet.
| # | What to do | What should happen | Result | What you saw (one line, required) |
|---|---|---|---|---|
| A1 | On a phone, open the scan page and allow the camera. | The camera starts with no error message, and the picture is sharp. | | |
| A2 | Hold the phone about **30 cm** from the tablet's code. | It reads within a second or two and checks you in or out. | | |
| A3 | Hold it at **arm's length** (about 60 to 70 cm). | It still reads quickly. | | |
| A4 | Move back to **2 to 3 metres**, with the tablet in **landscape**, then in **portrait**. | It reads, or you can say how far it reached. **Write the farthest distance it read reliably.** | | |
| A5 | Hold the phone at a slight **angle** to the tablet. | It still reads. | | |
| A6 | **Android only:** read a code. | A short **buzz** the instant the code is read, **before** the result screen. | | |
| A7 | **iPhone only:** read a code. | It works with **no buzz**. (iPhones do not buzz from a web page. That is normal, not a fault.) | | |
| A8 | Point at something close, then at the tablet far away, without tapping the screen. | The picture **focuses by itself** within about a second. | | |
| A9 | If you have an **older or basic phone**, open the scan page. | The camera still starts, even if the picture is less sharp. No error about camera settings. | | |
| A10 | After a successful read, look at the result screen. | "You're checked in" (or out), with the time and the entrance. It does **not** say you were late. | | |
| A11 | Read the same code again a few seconds later. | A clear message that you just scanned (the cooldown). Nothing is recorded twice. | | |

## B. The timezone warning (the timezone release must be on the test site; otherwise mark every test S)
| # | What to do | What should happen | Result | What you saw (one line, required) |
|---|---|---|---|---|
| B1 | As the **admin** of an organization still on UTC, open the dashboard. | A yellow card **"Confirm your timezone"**. It says the timezone is UTC and nobody confirmed it, and that who is late and report dates follow it. | | |
| B2 | Press **Choose timezone in Settings**. | Settings opens, with the same card at the top of the organization details. | | |
| B3 | In Settings, press **Keep UTC**. | The card disappears. **Reload the page: it stays gone.** | | |
| B4 | Use the **second** UTC organization. Press **Choose timezone**, pick your own timezone from the list, save. | The card disappears and the new timezone is shown in the organization details. | | |
| B5 | Sign in as a **manager** and as an **employee** of an organization that still shows the card to its admin. | **Neither** sees the yellow card. | | |
| B6 | Open an organization that chose a timezone when it **registered**. | **No** card. | | |
| B7 | As the admin, open Settings in an organization that has confirmed its timezone. | No card. The timezone is shown, and Edit Details still lets you change it. | | |

## C. Keyboard shortcuts (the shortcuts release must be on the test site; otherwise mark every test S). Use a computer with a keyboard.
Press **?** at any time to see the list. They never fire while you are typing in a box or while a box is open.
| # | What to do | What should happen | Result | What you saw (one line, required) |
|---|---|---|---|---|
| C1 | As a **manager**, click an empty part of the dashboard and press **?** | A card "Keyboard shortcuts" with three groups: Everyone, Daily work, Reviewing the work diary. | | |
| C2 | As an **employee**, press **?** | The list has only the employee's shortcuts: no Reports, no Settings, no Approve. | | |
| C3 | As a manager, press **g**, let go, then **r**. | You go to **Reports**. | | |
| C4 | Press **g** then **w**; then **g** then **d**; then **g** then **,** (comma). | Work diary review; the Dashboard; Settings. | | |
| C5 | As an **employee**, press **g** then **d**; then **g** then **m**. | My History; My page. | | |
| C6 | As an employee, press **g** then **r**. | **Nothing happens.** An employee never reaches a manager page. | | |
| C7 | Press **g**, wait about 3 seconds, then press **r** (as a manager, on the dashboard). | You do **not** go to Reports. The **r** just refreshes the numbers. | | |
| C8 | On the dashboard, press **r**. | The Today numbers **and** the Team roster refresh together. | | |
| C9 | On the roster, press **1**, **2**, **3**, **4**, **5**. | The filter changes each time: Everyone, Here today, Late, Away, Not here yet. | | |
| C10 | Press **i** on the dashboard. | The **Invite staff** box opens. Press Esc to close it. | | |
| C11 | Press **/** on the roster. | The cursor jumps into **Find a person**, and a "/" is **not** typed. | | |
| C12 | Click into **Find a person** and type the letters **grjf**. | The letters are typed normally. **Nothing else happens** (no page change, no filter change). | | |
| C13 | While the **Invite staff** box is open, press **r** and **g**. | Nothing happens behind the box. | | |
| C14 | Open **Work diary** (Manage menu) on the day that has a person waiting. Press **]** and **[**. | The day moves forward and back. | | |
| C15 | Press **j** a few times, then **k**. | An outline moves down and up the list of people. It stops at the ends and does not wrap round. | | |
| C16 | With a person outlined, press **Enter**. | Their day opens. | | |
| C17 | Close it (Esc). Outline a person who can be decided, then press **a**. | A box asks **"Approve ...'s day?"** Nothing is approved yet. Press **Cancel**: nothing changed. | | |
| C18 | Press **a** again and confirm with the button. | The day becomes **Approved**. | | |
| C19 | Outline another person and press **f**, then **Cancel**. | A box asks to flag the day. Cancel changes nothing. | | |
| C20 | Open a person's day, then press **a**; then press **j**. | **a** opens the approve question; **j** does nothing while the day is open. | | |
| C21 | Press **Ctrl+K** (Cmd+K on a Mac). Type a few letters. | The Jump to box opens and the letters are typed into it. No shortcut fires. | | |
| C22 | Press **Ctrl+B** (Cmd+B). Reload the page. | The left menu collapses. Press it again: it opens. The choice is remembered after a reload. | | |
| C23 | Open **My account** and find the **Keyboard shortcuts** card. Switch single-letter shortcuts **off**. | **?** and **g** now do nothing. **Ctrl+K** and **Ctrl+B** still work. | | |
| C24 | Switch them **on** again and reload. | The shortcuts work again, and the switch stays on. | | |
| C25 | With shortcuts on, press **Ctrl+R**, **Ctrl+F** and **F5**. | The browser's own reload and find still work. | | |
| C26 | As an employee on **My page**, press **s**. | The scanner opens. | | |

## D. Owner only: confirm these yourself
Testers cannot do these. They were marked passed in earlier rounds, but they are the owner's checks, so please confirm them here.
| # | What to do | What should happen | Result | What you saw (one line, required) |
|---|---|---|---|---|
| D1 | Firebase console (test project), Firestore, Indexes. | Every index says **Enabled**, including the two on **wfh_diary_days** and the five on **shift_swaps**. | | |
| D2 | Firestore, Rules. | The rules are the latest version. | | |
| D3 | Vercel (test project), the latest deployment. | It says **Ready**, and it is the one with the releases listed at the top. | | |
| D4 | `WFH_DIARY_SIGNING_SECRET` and `CRON_SECRET` are set on the test site (and `CRON_SECRET` also on production, with its own value). | Set. Without them the diary and the nightly refill do nothing. | | |
| D5 | `PLAN_ENFORCEMENT` is **empty** on the test site and on production. | Empty. Plan checks are off, so nothing is locked for anyone. | | |
| D6 | `ALERT_WEBHOOK_URL` on **production**. | **Empty** until you choose a channel for alerts. (Setting it on the test site is optional. There is no safe way to trigger a test message yet, so alerts are not tested in this round.) | | |
| D7 | Open the browser tools (F12), Network, filter **font**, reload a page. | Fonts come from the site's **own address** (a path starting /fonts/). **None** from fonts.googleapis.com or fonts.gstatic.com. | | |
| D8 | Ask the person who ran round 7 part D15 (the night shift) whether a **real** 22:00 to 06:00 shift was scanned in around 21:55 and checked after midnight. | They did it, and the roster and the Today boxes both said on site. If not, set up a night-shift person and run D15 of round 7 now. | | |

## E. A quick check for every kind of user
| # | What to do | What should happen | Result | What you saw (one line, required) |
|---|---|---|---|---|
| E1 | Sign in as an **employee** and try to open the dashboard and Reports addresses directly. | You are sent away. You never see manager pages. | | |
| E2 | Sign in as the admin of a **different** organization. | They never see the first organization's people or records. | | |
| E3 | **On a phone**, open the pages touched in this round (the scan page, Settings, My account). | Nothing is cut off and nothing scrolls sideways. | | |

## What to send back
For each **F**: the test number, what you did step by step, what you expected, what happened (the exact words on screen), a screenshot, and your device, browser and the time. For every test, **the one line of what you saw**.

## If you get stuck
Do not work around it. Write down the test number and what you tried, and ask the owner.

## Sign-off
Passed (P): ____   Failed (F): ____   Skipped (S): ____   Signature: ______________
