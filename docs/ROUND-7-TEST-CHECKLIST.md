# Test checklist, round 7: what changed since round 6

Round 6 ([ROUND-6-TEST-CHECKLIST.md](ROUND-6-TEST-CHECKLIST.md)) and round 5 ([ROUND-5-TEST-CHECKLIST.md](ROUND-5-TEST-CHECKLIST.md)) are still valid. **Do them first if they have not been done.** This round covers everything added after round 6: the menu that stays in place, count badges and "Jump to", the team roster, the reports hub, the work diary (the employee's work session, the manager's review and the register columns), work from home on shift days, the timezone warning, and the scanner and tablet changes. It ends with a few owner-only checks.

**Tester:** ______________   **Date:** ____________   **Device and browser:** ______________

Testers fill in **Result** with **P** (passed), **F** (failed) or **S** (skipped), and write what they saw in **Notes**, especially for an F.

## What changed in the earlier checklists (read this so nothing looks like a fault)
- **Round 6, D1 (dashboard order):** the order is now: title, **Today**, the two lists, **Team roster** (new), **Today's check-ins**, then **Attendance analytics** last.
- **Round 6, H7 (Reports):** the Reports menu item now opens a **hub** with report cards. Exports are on the cards or inside each report.
- **Round 6, K6 (diary secret):** the diary screens now exist. Part F and G below test them.
- The left menu and the top bar now stay on screen while the page scrolls.

## Read this first
- This is the TEST copy. Use only the test logins you were given. Never use a real customer's account or details.
- Start anything you create with the word **TEST**, so it is easy to find and delete.
- If something looks wrong, do not guess. Take a screenshot and note the test number.
- Some numbers refresh by themselves every couple of minutes, and the menu numbers can take up to a minute to change. When a test says "refresh", press the small refresh icon or reload the page.
- **Parts F and G take about 30 minutes** (a work session counts time in 10-minute blocks). Start part F first and do other parts while the session runs.

## What you need (the owner sets this up before testing)
- The test address: ______________________
- Test logins (write each email here, never the passwords): organization admin ____________, manager A ____________, manager B ____________, employee on manager A's team ____________, a second employee on manager A's team ____________, and an admin of a **different** organization ____________.
- A **brand new** organization for part B: the tester registers it themselves (name it **TEST New Co**), using an email the owner provides.
- An organization that is **still on the default UTC timezone** (never confirmed), for part I. The owner can create it by registering without choosing a timezone.
- Devices: a computer, a phone (with a camera for part J), and if possible a tablet.
- **Owner checks first (part K, K1 to K3):** the diary indexes are **Enabled**, the diary secret is set, and the latest staging deployment has finished. If not, parts F, G and the register columns will fail for a reason that has nothing to do with the testers. Do a hard refresh (Ctrl+Shift+R) before starting.

## A. The menu, the top bar, "Jump to" and the number badges
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| A1 | On a **computer**, sign in as the admin and open a long page (Reports, or the dashboard). Scroll down a long way. | The left menu **stays in place** the whole time, full height. Only the page content moves. The top bar stays at the top. | | |
| A2 | Make the browser window short (or zoom in with Ctrl and +) so the menu is taller than the screen. | The menu has its **own scroll** inside itself. **Sign Out** can still be reached. | | |
| A3 | Look at the top bar on a computer. | It shows where you are as a trail, for example **Manage › Leave**. | | |
| A4 | Press **Ctrl+K** (on a Mac, Cmd+K). | A box opens: "Jump to a page". | | |
| A5 | Type **rep**. | **Reports** is listed. Press Enter: you go to Reports. | | |
| A6 | Press the **Jump to** button in the top bar instead of the keys. | The same box opens. | | |
| A7 | Sign in as an **employee**, open Jump to. | Only the employee's own pages are listed (no Roster, no Reports, no Settings). | | |
| A8 | As **manager A**, make sure a team member has a **pending leave request**. Look at the menu. | **Leave** shows a small number (how many are waiting). | | |
| A9 | As the employee, send a diary day to the manager (part F), then as manager A look at the menu. | **Work diary** shows a number for days waiting for a decision. | | |
| A10 | Approve the leave request, go to another page, and wait up to a minute. | The number on **Leave** goes down. It does not change instantly. | | |
| A11 | Sign in as an **employee**. | No numbers on the menu at all. | | |
| A12 | Collapse the menu (the button at the top left). | Only icons remain, and a waiting number shows as a small number on its icon. | | |
| A13 | **On a phone**, scroll a long page. | The top bar stays at the top. The menu opens from the left with the three-lines button and shows the same pages and numbers. | | |
| A14 | Sign in as an employee and look at the menu. | There is a **Work diary** entry. As a manager, **Work diary** is under **Manage**. | | |

## B. The "Get set up" card: inviting your team
Use the brand new **TEST New Co** organization, signed in as its admin.
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| B1 | Open the dashboard. | The card "Get set up" shows **0 of 3 done**. | | |
| B2 | Press **Invite staff**, enter a TEST email, create the invitation. | The third step, **Invite your team**, ticks **at once**, with the note "1 invitation sent. People appear on your team once they open their link and join." | | |
| B3 | Create a second invitation. | The note says "2 invitations sent." | | |
| B4 | Open one invitation link in a **private window** and create the account. Back as the admin, reload the dashboard. | The note about waiting invitations is gone (someone has joined). | | |
| B5 | Add an entrance and pair a tablet (Settings). | The first two steps tick. When all three are done, the card **disappears for good**. | | |
| B6 | Press **Hide for now** on a card that is not finished. | The card hides on this browser. | | |

## C. The dashboard numbers
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| C1 | Look under the dashboard title. | It shows the team size and, if there are any, "pending invitations". The numbers match the people you know are in the organization. | | |
| C2 | As the **admin**, go to **Holidays** and add **today** as a TEST holiday. Open the dashboard and press refresh. | **Absent shows 0** and "Not arrived yet" says nobody is expected. People who still scan in today count as present. (Organizations without shifts.) | | |
| C3 | Remove the TEST holiday. Open the dashboard and refresh. | The normal numbers return. | | |
| C4 | On a **Saturday or Sunday** (if you test then), open the dashboard. | Absent is 0 and nobody is listed as "not arrived". | | |
| C5 | Compare the four boxes (Present, Late, Away, Absent) with the filter buttons on the **Team roster** (Here today, Late, Away, Not here yet). | The numbers agree for the same people. | | |

## D. The team roster (on the dashboard, under the Today lists)
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| D1 | As the admin or a manager, open the dashboard and find **Team roster**. | A card between the Today lists and "Today's check-ins". Under the title: "Where everyone is today, and how they have done this month so far." | | |
| D2 | Look at one row. | Name, department, a **state in words** (On site, Left for the day, Working from home, On leave, Not arrived, Expected later, Not working today, Holiday), the shift if the organization uses shifts, the time they arrived, and two bars: **Attendance** and **On time**, each with a percentage. | | |
| D3 | Press each filter: **Everyone, Here today, Late, Away, Not here yet.** | The list changes, and each button shows how many people it holds. | | |
| D4 | Type part of a name in "Find a person". | Only matching people remain. | | |
| D5 | If the organization has **more than one department**, look for a department list. | It appears and filters the roster. (With only one department it does not appear.) | | |
| D6 | Look at the order. | People who are **not here yet** come first, then late people, then the rest. | | |
| D7 | Look at a **brand new employee** with no history. | The bars show a **dash (–)** and an empty bar, **not 0% and not 100%**. | | |
| D8 | An employee scans in at the tablet. Press the small **refresh icon** on the roster card. | Their row becomes **On site**, with the arrival time. | | |
| D9 | The same employee scans out (after the cooldown). Refresh the roster. | Their row says **Left for the day**. | | |
| D10 | Someone has **approved leave** today, and someone has declared **work from home** today. | Their rows say **On leave** and **Working from home**. | | |
| D11 | Find a late person. | A **Late** tag beside their state. After a manager excuses it, the tag says **Late, excused**. | | |
| D12 | **On a phone**, open the roster. | Cards instead of a table. Each card shows the name, state, shift and both bars. **No label overlaps a number**, nothing scrolls sideways, and "Show more" appears if there are more than 50 people. | | |
| D13 | Sign in as **manager A**, then **manager B**. | Each sees **only their own team** in the roster. The admin sees everyone. | | |
| D14 | Sign in as an **employee** and open the dashboard address. | You are sent to History. You never see the roster. | | |
| D15 | **Night shift** (the owner sets this up): a person with a **22:00 to 06:00 night shift** scans in at about 21:55 and is still working. After midnight, open the roster **and** the Today boxes. | The roster row says **On site**, shows the **Night** shift and the arrival time (21:55). The Today boxes count them as on site too. They do **not** say "Expected later". | | |

## E. The reports hub
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| E1 | As the admin, press **Reports** in the menu. | A page with three report cards: **Timesheets, Attendance register, Leave ledger**, and under "Reviews": **Late arrivals** and **Work diary**. | | |
| E2 | Read the cards. | Each says what it holds and who it covers: "Covers the whole organization" for the admin, "Covers your team" for a manager. | | |
| E3 | On the **Attendance register** card, choose **Last 7 days** and press **CSV**. | A file downloads. Open it in Excel: one row per person, one column per day, dates that match the last 7 days. | | |
| E4 | Press **PDF** on the same card. | A PDF downloads and opens. | | |
| E5 | On the **Leave ledger** card, press **CSV**. | A file downloads with leave requests in that period. | | |
| E6 | Press **Preview and choose dates** on the register card. | The register opens on the Attendance register tab. On the Leave ledger card, it opens on the **Leave ledger** tab. | | |
| E7 | On **Timesheets**, press **Open**. | The timesheets page works as before. Its **All reports** button brings you back to the hub. | | |
| E8 | Choose **Last month** for a period with no data (or an organization that is new). | A clear message: "There is nothing to include for that period." No empty file. | | |
| E9 | Press **Open** on **Late arrivals**, then on **Work diary**. | Each opens its own page. | | |
| E10 | As **manager A**, open Reports. | The cards say "Covers your team", and the files hold only manager A's team. | | |
| E11 | As an **employee**, type the address /reports. | You are sent away. You never see Reports. | | |
| E12 | **On a phone**, open the hub. | Cards are stacked, the Period list and the CSV and PDF buttons are easy to tap, and nothing scrolls sideways. | | |

## F. The work diary: the employee's work session
**Owner first:** the admin switches the diary on (part G, G1). Then start here, because the session takes time. A session counts time in blocks of **10 minutes**, so allow about 30 minutes.
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| F1 | As **employee 1**, open **My page**. Under the work-from-home card look for a line about the work diary. | A link to the **work diary**. | | |
| F2 | Open **Work diary** from the menu **before** declaring work from home today. | "Today is not a work-from-home day", with a button to **My page**. | | |
| F3 | On My page, declare **today** as work from home, then open Work diary. | The first time: **"Before your first work session"**, with the notice and four plain points (only numbers kept, nothing outside this page, hours come from your session and answers, your manager decides). | | |
| F4 | Look at the **Agree and continue** button before ticking the box. | It is disabled. Tick the box: it is enabled. Press it. | | |
| F5 | Look at the next screen. | **Start your work session**, with a warning that phones and some browsers put background tabs to sleep. Press **Start session**. | | |
| F6 | Look at the session card. | The status **Recording**, how long it has run, three figures: **Counted, Waiting for a check, Not counted**, and the sleep warning. | | |
| F7 | Press **Pause**. | The status says **Paused**. Press **Resume**: **Recording** again. | | |
| F8 | Keep the page open and use the mouse and keyboard on it. Wait for a **"Still here?"** box. | It opens at some point (about 2 an hour by default), with a **90-second countdown**. Press **I'm here**: a message "Thanks, that's confirmed." | | |
| F9 | When the next "Still here?" opens, **do not answer** and wait for the countdown. | The box closes by itself. Later, that 10-minute block shows as **Not counted**. | | |
| F10 | Reload the page (F5) while the session runs. | The session is still **Recording**. | | |
| F11 | Open the Work diary page in a **second tab** (same browser). | A warning: "This tab did not start the session, so it cannot record it." The first tab keeps recording. | | |
| F12 | Press **Stop for today**. | A question first: it says the session **cannot be started again today**. Confirm. | | |
| F13 | After stopping, look at the card. | "Your session lasted ...", the figures, and a status **"Waiting for your manager"**. If anything was flagged it is listed under "Shown to your manager for a look". **You see everything your manager sees.** | | |
| F14 | **On a phone**, open the Work diary page. | Everything fits, the buttons are easy to tap, and the sleep warning is visible. | | |

## G. The work diary: the manager's review, the settings, and the register columns
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| G1 | As the **admin**, open **Work diary** (Manage menu). Find **Work diary settings** at the top. | A card with an on/off switch, "how often Still here? is asked" (0 to 4 an hour) and "how long block detail is kept". **Switch the diary on.** | | |
| G2 | As **manager A** (not the admin), open **Work diary**. | **No** settings card. Only the review part. | | |
| G3 | As manager A, look at the day box at the top. | Today is chosen. Previous and next buttons and a date box change the day. | | |
| G4 | After employee 1 has stopped the session (part F), find them in the list. | Their name, "Counted ... · not counted ...", a status **"Waiting for your decision"**, and a count such as "2 things to look at" if anything was flagged. | | |
| G5 | While employee 1's session is **still running** (or a check has not been answered), look at the **Approve** and **Flag** buttons. | They are disabled, with the reason written under them. | | |
| G6 | Open the person (press their name). | Their figures (Counted, Not counted, Paused, Waiting), **"Worth a look"** (with a line saying these are prompts, not findings), each **10-minute block** with a state (Counted, Not counted, Paused), and the **Still-here checks** as answered or missed. | | |
| G7 | Look at how times are shown. | As **time into the session** ("0:00 to 0:10", "0:47"), **not** as clock times. | | |
| G8 | Press **Approve this day**. | The status becomes **Approved**, and "Approved hours" at the top of the list goes up. | | |
| G9 | Press **Flag this day** on the same person. | The status becomes **Flagged**. | | |
| G10 | Sign in as **manager B** and open Work diary for the same day. | Employee 1 is **not** in the list (not manager B's team). | | |
| G11 | As the **admin**, open Work diary for the same day. | Everyone appears, including employee 1. | | |
| G12 | As an **employee**, type the address /wfh-review. | You are sent away. | | |
| G13 | As the admin, open **Reports**, then **Preview and choose dates** on the register, and choose a range that includes the diary day. | Three extra columns: **Diary hrs, Diary flagged, Diary waiting**. The approved day's hours are in Diary hrs. **"Hours" (scanned time) is not changed** by the diary. | | |
| G14 | Download the register as **CSV**. | The extra columns are **"WFH diary hours (approved)", "WFH diary days flagged", "WFH diary days awaiting approval"**. Flagged and waiting days are counts only, never hours. | | |
| G15 | As the admin, **switch the diary off** (G1). Reload the register. | The three diary columns are gone. Employees opening Work diary see "The work diary is not switched on". | | |
| G16 | **On a phone**, open Work diary as a manager. | The list is cards, the **Approve** and **Flag** buttons are tall enough to tap, and nothing scrolls sideways. | | |

## H. Work from home on days with and without a shift (organizations that use shifts)
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| H1 | Employee 1 **has a shift** on a day. They declare **work from home** for that day. After the day, open the Attendance register. | The day shows **W** (work from home) and counts as a day attended. | | |
| H2 | Employee 1 declares work from home for a day on which they have **no shift** (a day off). Look at the register and the roster for that day. | The register shows **day off**, **not W**, and the roster does **not** say Working from home. It does not lift their attendance. | | |
| H3 | In an organization **without shifts**, declare work from home on any day. | It shows **W** on that day in the register, as before. | | |
| H4 | A scan on a day with a declaration. | The scan wins: the day shows as present. | | |

## I. The timezone warning
Needs an organization still on the default **UTC** that nobody confirmed. Skip this part if the safety release (timezone card) is not on the test site yet.
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| I1 | As the **admin** of that organization, open the dashboard. | A yellow card **"Confirm your timezone"**, saying the timezone is UTC and nobody confirmed it, and that who is late and report dates follow it. | | |
| I2 | Press **Choose timezone in Settings**. | Settings opens. The same card is at the top of the organization details. | | |
| I3 | In Settings, press **Keep UTC**. | The card disappears. **Reload the page: it stays gone.** | | |
| I4 | Use a different organization still on UTC. Press **Choose timezone**, pick your timezone from the list, save. | The card disappears and the timezone is shown in the details. | | |
| I5 | Sign in as a **manager** and an **employee** of that organization. | **Neither** sees the yellow card. | | |
| I6 | Look at an organization that chose a timezone when it **registered**. | **No** card. | | |

## J. The scanner and the entrance tablet
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| J1 | On a phone with a camera, open the scan page (/scan). | The zoom choices **1x, 2x, 3x** are small buttons above the "Scan to clock IN/OUT" words. The flash is a round **lightning-bolt button at the bottom right**. | | |
| J2 | Look at the page with the offline banner showing (turn the internet off briefly). | The controls **do not overlap** the words or the banner. | | |
| J3 | Scan a code until a result appears. | The zoom and flash controls **hide** while the result is on screen. | | |
| J4 | On the tablet, open the entrance screen (/kiosk). | The QR code is **big and square**, as large as the screen allows, and fits **fully** in both **portrait** and **landscape**. | | |
| J5 | Scan the tablet's code with an **iPhone's camera** and with the **scan page on an Android** phone, from **arm's length**. | It scans and checks you in or out. | | |
| J6 | Try again from **2 to 3 metres** away. | It still scans (hold the phone steady). | | |
| J7 | Wait for the code to change (every ~15 seconds), then scan again. | The new code works. A screenshot of an **old** code is refused. | | |

## K. Owner only
Testers cannot do these. The owner does, on staging.
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| K1 | Firebase console, test project, Firestore, Indexes: look for **wfh_diary_days** | Two indexes (organization and day; organization, manager and day) show **Enabled**. If missing, run `npx firebase-tools deploy --only firestore:indexes --project staging` and wait until they say Enabled. | | |
| K2 | Check `WFH_DIARY_SIGNING_SECRET` is set on the test site (at least 32 characters). | Set. Without it the diary shows "not set up yet". | | |
| K3 | Check the latest staging deployment finished and the test address shows the new menu and roster. | Both visible after a hard refresh. | | |
| K4 | Check `PLAN_ENFORCEMENT` is **empty** (not set) on Vercel, Preview and Production. | Empty. Plan checks are off, so **nothing is locked** for any test organization. Nobody should see a message about a plan. | | |
| K5 | Open the browser's developer tools (F12), Network tab, filter **font**, and reload a page. | The fonts load from the **site's own address** (a path starting /fonts/). **None** from fonts.googleapis.com or fonts.gstatic.com. | | |
| K6 | Check `ALERT_WEBHOOK_URL` on production is **empty** until you pick a channel for alerts. | Empty means alerts are off and nothing changes. | | |
| K7 | Set up a **night-shift test person** for D15: a shift 22:00 to 06:00 assigned for yesterday and today, and ask them to scan in about 21:55. | The person can be seen on site after midnight (part D15). | | |

## Always include these
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| Z1 | Do the main action as each kind of user | It works, and each user sees only what they should | | |
| Z2 | Try something a user should NOT be allowed to do | It is refused with a clear message | | |
| Z3 | Open it on a phone | Nothing is cut off, no sideways scrolling | | |
| Z4 | Turn the internet off and try | A clear message, nothing is lost or duplicated | | |
| Z5 | Look at a screen with no data yet | A friendly empty message, not a blank page | | |
| Z6 | Sign in as the admin of a **different** organization | They never see the first organization's people or records | | |
| Z7 | Look at every status on the roster, the review and the reports | Each is **written in words**, not only a colour | | |

## What to send back
For each **F**: the test number, what you did step by step, what you expected, what happened (the exact words on screen), a screenshot, and your device, browser and the time.

## If you get stuck
Do not work around it. Write down the test number and what you tried, and ask the owner.

## Sign-off
Passed (P): ____   Failed (F): ____   Skipped (S): ____   Signature: ______________
