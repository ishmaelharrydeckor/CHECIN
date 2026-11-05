# Test checklist, round 9: the new Timesheet, and notifications that now use real data

Two things went on the test site after the earlier rounds and have **never been tested by a person**: the rebuilt **Timesheet** (Reports, then Timesheets) and the **notification screens connected to real data** (the bell, the inbox, the settings cards and "Send me a test"). Nothing in this round repeats an earlier round.

**Tester:** ______________   **Date:** ____________   **Device and browser:** ______________

**Web address tested:** ______________________   **Which releases are on it (the owner fills this in before you start):** new Timesheet: yes / no   notifications with real data: yes / no

## How to fill this in
- **Result:** **P** (passed), **F** (failed) or **S** (skipped). If a part says its release is not on the test site, mark every test in it **S**. Do not mark P on something you did not see.
- **What you saw: write one short line for every test, including the ones that pass** (for example "Ama: 38h 20m, same as the register" or "bell showed 3, opened the leave page"). A blank line means the test was not done.
- For every **F**, add the test number, what you did, what you expected, the exact words on screen, and a screenshot.
- Use only test logins. Start anything you create with the word **TEST**. Never share passwords in chat.

## What you need (the owner sets this up before testing)
- The test address and which releases are on it (above).
- Test logins (write each email here, never the passwords): organization admin ____________, manager A ____________, an employee on manager A's team ____________, a manager B with a different team ____________.
- **Real days to look at:** at least one week of check-ins for some people on manager A's team, including one **late** arrival, one **absent** day, one **approved leave** day, one **public holiday**, and one day with a **check-in and no check-out**. If breaks are switched on, one person with a shift that has an unpaid break.
- For part B: an **Android phone** and an **iPhone** (with the app added to the Home Screen), each signed in as a test employee, and a manager who can post an announcement.
- For one test (B14): a test account whose email is **not verified** (the owner can make one).

## A. The Timesheet (Reports, then Timesheets)
The page shows one row per person for a period you choose. Nothing loads until you press **Show timesheet**.

| # | What to do | What should happen | Result | What you saw (one line, required) |
|---|---|---|---|---|
| A1 | Sign in as the **admin**. Open **Reports**, then the **Timesheets** card. | A page with a Period list, From and To dates and a **Show timesheet** button. **No numbers yet**, and a sentence asking you to choose a period and press the button. | | |
| A2 | Leave "Last 7 days" and press **Show timesheet**. | A strip of totals, then one row per person in the organization. Under the title: the dates and the timezone. | | |
| A3 | Open **Reports**, then **Attendance register**, for the **same dates**. Compare **one person** you pick. | Their **days worked, late days, absent days, leave days and hours** are the same on both pages. **Write the person's name and the hours.** | | |
| A4 | Click that person's name. | A box with one line per day: date, status (Present, Absent, On leave, Holiday...), first in and last out, hours. Close it. | | |
| A5 | Find the day with **late** arrival. | The word **Late** is shown on that day (and in the Late column). An **excused** late day says "Late, excused" and is **not** counted in the Late column. | | |
| A6 | Find the day with a **check-in and no check-out**. | That day says **No check-out**, shows **no invented hours** (not 8 hours, not anything), and the person's "No check-out" count goes up by one. | | |
| A7 | Find a person who is on a **shift** and has an **absent** day. | If the page has Expected columns: the absent day is **short by the whole shift**. A person with **no shift** shows a dash for Expected, not 0. | | |
| A8 | Find the **approved leave** day and the **public holiday**. | Each is shown as such and is **never "short"** (no hours are expected on them). | | |
| A9 | Press **Last 14 days**, **This month so far** and **Last month** in turn (press Show each time). | Each shows the dates it says. Last month is the whole previous month. | | |
| A10 | Choose your own dates more than 31 days apart. | A plain sentence says at most 31 days, and **Show timesheet** is disabled. Nothing is requested. | | |
| A11 | Choose dates where the end is **before** the start. | A plain sentence says the end date can't be before the start date. | | |
| A12 | Show a period, then type part of a person's name in **Find a person**. | Only matching people stay, and the totals strip changes to match them. Clear it: everyone is back. | | |
| A13 | If there is more than one department: use the **Department** list. | Only that department. "Everyone" brings all back. | | |
| A14 | If the organization has more than 50 people (otherwise mark **S**): scroll to the bottom. | "Showing 50 of N" and a **Show more** button that adds the next people. | | |
| A15 | Press **CSV**. Open the file in **Excel**. | One row per person. Names with accents read correctly. Hours are **decimals** (7.50), and the columns match the screen. | | |
| A16 | Press **Excel**. Open the file. | Three sheets: **Timesheet**, **Daily detail**, **Details** (the dates, timezone and when it was made). The hours are real **numbers** that Excel can add up. | | |
| A17 | Press **PDF**. Open it. | A landscape page with the title, the dates and timezone, and the table. Text is not cut off. | | |
| A18 | Press **Daily detail (CSV)**. | One row per **person per day** (people times days). Each row has the date, status, first in, last out, hours and flags. | | |
| A19 | With a name typed in Find a person, press **CSV** again. | The file holds **only the people on screen**. | | |
| A20 | Sign in as **manager A**. Show the timesheet. | Only **manager A's team**. Nobody from manager B's team or anyone else. | | |
| A21 | Sign in as **manager B** and show the same dates. | Only manager B's team. | | |
| A22 | Sign in as an **employee**. Try to open the Reports address directly. | You are sent away. You never see the timesheet. | | |
| A23 | Sign in as the admin of a **different** organization (if you have one; otherwise **S**). | They see only their own people. | | |
| A24 | If the organization uses a **work diary** (otherwise **S**): show a week with approved and flagged days. | Extra columns: diary hours (approved), diary flagged, diary waiting. They are **separate** from "Hours at work" and never added to it. | | |
| A25 | If **breaks** are switched on (otherwise **S**): look at a person with a shift that has an unpaid break. | A Break column and a Paid column. Paid = hours at work minus the break (only when the day was long enough). | | |
| A26 | If **nobody has a shift** (otherwise **S**): show the timesheet. | There are **no Expected or Extra/short columns**. Hours are still shown. | | |
| A27 | **On a phone** (375 px wide): show the timesheet. | One card per person, with a **See the days** button. Nothing scrolls sideways. | | |
| A28 | Switch off the internet on the device, then press **Show timesheet**. | A plain "couldn't load" message with **Try again**. Switch the internet on and press Try again: it loads. | | |
| A29 | Open **Reports** (the hub). | The Timesheets card describes hours, expected time and the difference, and **Open** goes to the new page. | | |
| A30 | Open **History**. | History still works as before (it is a different page). | | |

## B. Notifications with real data
The bell in the top bar, the **Notifications** page, and two cards on the **Account** page ("This device" and the settings) now use real information.

| # | What to do | What should happen | Result | What you saw (one line, required) |
|---|---|---|---|---|
| B1 | Sign in as a **test employee**. Look at the top bar. | A bell. With nothing waiting there is **no number** on it. | | |
| B2 | As a **manager**, post a TEST announcement to the employee's team. Then, as the employee, reload the page. | The bell shows **1** (a number). | | |
| B3 | Open the bell. | The announcement is the newest line, with its **time in the organization's timezone** (for example "5 Nov, 09:14"). **Write the time you see.** | | |
| B4 | Click the announcement in the bell. | The bell closes and you go to the page the notification points to. Open the bell again: the number is gone and the line is quieter (read). | | |
| B5 | Post two more TEST announcements. In the bell press **Mark all read**. | The number disappears and Mark all read is disabled. | | |
| B6 | Press **See all** (or open **Notifications** in the menu, or in Jump to). | The inbox page lists the notifications, newest first, with a tick on unread ones. | | |
| B7 | In the inbox, tick one unread notification. | It becomes read. Reload the page: it **stays** read. | | |
| B8 | As **another** employee, open the bell and the inbox. | They see **only their own** notifications, never the first employee's. | | |
| B9 | Open **My account**. | A **This device** card and a **notification settings** card (switches for push, announcements, leave, shifts and account). The old long notifications card is gone. | | |
| B10 | Turn **announcements off** in the settings card, reload the page. | The switch is **still off**. Turn it on again. A failed save would show a message and put the switch back. | | |
| B11 | **On the Android phone:** press **Turn on** on the This device card and allow it. | The card says it is **on**. | | |
| B12 | Press **Send me a test**. | A notification arrives on the phone within a few seconds. | | |
| B13 | **On the iPhone** (app on the Home Screen): press Turn on, then Send me a test. If the app is **not** on the Home Screen, open the page in the browser instead. | Works from the Home Screen. In the browser the card says to **add ChecIN to the Home Screen first**. | | |
| B14 | As the **unverified-email test account**, open My account. (If you have none, mark **S**.) | A yellow banner asks you to verify your email, with **Send verification email**. After pressing it: "We sent a link", then a countdown before you can send again. Nothing else on the page is blocked. | | |
| B15 | As a **normal** account, open My account. | **No** verification banner. | | |
| B16 | Post an announcement while the employee's phone has notifications on. | It arrives on the phone. Switch notifications **off** on the phone's card, post another: **nothing** arrives. | | |
| B17 | Sign out on the phone. Sign in as **another employee** on the same phone. Post an announcement for the **first** employee only. | The phone receives **nothing** for the first employee. | | |
| B18 | Press **Send me a test** several times in a row (more than 5 in 15 minutes). | After a few, a plain message says to wait. It does not crash. | | |
| B19 | **On a phone**, open the bell and the Notifications page. | Nothing is cut off, and nothing scrolls sideways. | | |
| B20 | Look in the browser tools (F12), Network, while the bell opens. | The calls go to the site's own address. **No** calls carry a user id in the address. | | |

## C. Owner only: confirm these yourself
| # | What to do | What should happen | Result | What you saw (one line, required) |
|---|---|---|---|---|
| C1 | Vercel (test project), Settings, Environment Variables. | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VITE_VAPID_PUBLIC_KEY` are set, and `VAPID_SUBJECT` is a **real contact address** (mailto: or https://), not the placeholder. | | |
| C2 | Same page, on **Production** (not the test project). | The same push settings, each with **its own** values (never copied from the test site). | | |
| C3 | Vercel, the latest deployment of the test project. | **Ready**, and it is the one that has both releases listed at the top. | | |

## What to send back
For each **F**: the test number, what you did step by step, what you expected, what happened (the exact words on screen), a screenshot, and your device, browser and the time. For every test, **the one line of what you saw**.

## If you get stuck
Do not work around it. Write down the test number and what you tried, and ask the owner.

## Sign-off
Passed (P): ____   Failed (F): ____   Skipped (S): ____   Signature: ______________
