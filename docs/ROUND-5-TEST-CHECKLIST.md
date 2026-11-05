# Test checklist, round 5: everything new on staging

Testers fill in the **Result** column with **P** (passed), **F** (failed) or **S** (skipped), and write what they saw in **Notes**, especially for an F. No ticking needed: it is easy to type from a phone.

**Tester:** ______________   **Date:** ____________   **Device and browser:** ______________

## Read this first
- This is the **TEST (staging)** version only. Never use the real app and never use a real person's details. Staging has fake data, so please try to break things.
- Sign in with **email and password**. Ask the owner for the test address and logins. Never share passwords in chat.
- Start anything you create with the word **TEST** so it is easy to find and delete.
- If something looks wrong, do not guess. Take a screenshot and note the test number.
- Do parts **A to C** first: they create the check-ins that the later parts look at. Part **H** is for the owner only.

## What you need (the owner sets this up before testing)
- One organization on staging with: **1 admin**, **Manager 1** (allowed to manage shifts) and **Manager 2** (not allowed), **Employee 1 and Employee 2** on Manager 1's team, **Employee 3** on Manager 2's team.
- A tablet (or a second browser window) paired to a TEST location whose **reporting time is earlier than the time you will scan**, so scans are late.
- One public holiday added (any future weekday) and one approved leave request for Employee 2 on a future weekday.
- A phone for Employee 1; a computer for the admin and managers.
- **Shifts switched on** for this organization (Shifts page, Settings tab) with two shifts created: "TEST Day 09:00 to 17:00" and "TEST Night 22:00 to 06:00".

## A. Late arrivals and excuses
Needs: Employee 1 and Employee 2 have each checked in **late** today (scan at the tablet after the reporting time, a few minutes apart).

| # | What to do | What should happen | Result (P / F / S) | Notes |
|---|---|---|---|---|
| A1 | As Employee 1 on the phone, scan in after the reporting time. | The result screen says only that you are checked in, with the time and place. It does **not** say "late". | | |
| A2 | As Employee 1, open My page. | A "My late days" card shows today with a **Late** label and an **Add a note** button. | | |
| A3 | Press Add a note, write "Waited at the door", save, then refresh the page. | A saved message appears; after refresh the note is still shown. | | |
| A4 | As Manager 1, open **Late arrivals** in the menu. | Today is listed with Employee 1 and Employee 2, earliest arrival first, and Employee 1's note is shown. | | |
| A5 | Look for a way to tick every person at once. | There is **no** "tick all" button. | | |
| A6 | In today's box, type a time **between** the two arrivals in "Tick everyone who arrived by", press Tick. | Only the earlier person is ticked. The later person stays unticked. | | |
| A7 | Press **Excuse selected**, type just "ab" as the reason, press Excuse. | It refuses with a clear message (the reason is too short). Nothing is excused. | | |
| A8 | Type a real reason ("Tablet was switched on late") and press Excuse. | The person's row shows **Excused**, the reason, and your name. | | |
| A9 | Open the manager **Roster (dashboard)** and press Refresh (it can take up to a minute). | The Late tile is one lower and says "1 excused". The excused person is not in the Late list. | | |
| A10 | In Reports, open the Attendance register for today and download the CSV. | The excused person is still **present**, with no late mark. The CSV says "late, excused". | | |
| A11 | As Employee 1 (the excused one), open My page and History. | My page shows **Excused** with the reason and no Add note button. The timesheet and History say "Late, excused". | | |
| A12 | As Manager 1, press **Undo** on the excused row, give a reason. | The row is late again; the dashboard goes back to counting them as late. | | |
| A13 | As Manager 1, look at the row for **your own** late arrival, if you have one. | It cannot be ticked, and a message says only an administrator can excuse it. The admin **can** excuse it. | | |
| A14 | As Manager 2, open Late arrivals. | Employee 1 and Employee 2 are **not** shown (they are not Manager 2's team). | | |
| A15 | As Employee 1, try to open the Late arrivals address directly. | You are sent away; the page is not shown. | | |

## B. Repeating shifts (patterns)
Needs: shifts on, the two TEST shifts, and Manager 1 (allowed to manage shifts).

| # | What to do | What should happen | Result (P / F / S) | Notes |
|---|---|---|---|---|
| B1 | As Manager 1: Shifts, Rota, **Assign shifts**, choose **Repeat**, TEST Day, Monday to Friday, start today, **until further notice**, tick Employee 1 and Employee 2, save. | A success message. The Rota shows the Day shift on weekdays for about the next two months. | | |
| B2 | Look at the patterns list on the Rota tab. | The pattern is listed for each person, with a "filled to" date about 2 months ahead. | | |
| B3 | Press Save twice quickly (or save, then reload and look). | Only **one** pattern per person exists. No doubled shifts. | | |
| B4 | Try to create another pattern for Employee 1 that also uses Mondays. | It is refused with a clear message to end or change the first one. | | |
| B5 | Create a **rotation** for Employee 2 on other weekdays or after ending theirs: one week Day, one week Night. | The Rota alternates Day and Night by week. | | |
| B6 | Edit Employee 1's pattern to use TEST Night. | **Tomorrow onwards** changes to Night; **today** stays as it was. | | |
| B7 | In the Rota, change one future day for Employee 1 by hand to a different shift, then edit the pattern again. | The hand-changed day is **kept**; it is not overwritten. | | |
| B8 | End Employee 1's pattern with an end date 10 days from now. | Days after that date disappear from the Rota; days before stay. | | |
| B9 | As Manager 2 (not allowed), open Shifts and the Rota. | You can look, but there are no buttons to create, edit or end. | | |
| B10 | As Manager 1, try to set up a pattern for Employee 3 (Manager 2's team). | It is refused, or Employee 3 is not offered. | | |
| B11 | As Employee 1, open **My Shifts**. | The pattern's days are listed, each with the allowed check-in time. | | |

## C. Work from home
| # | What to do | What should happen | Result (P / F / S) | Notes |
|---|---|---|---|---|
| C1 | As Employee 1, My page, press **Working from home today**. | Today appears in "Your declared days". | | |
| C2 | As Manager 1, open the dashboard and press Refresh. | The Working-from-home tile shows 1, Employee 1 is in "Working from home today", and Absent is one lower. | | |
| C3 | As Employee 1, try to add a Saturday, a past day, the public holiday, and the day Employee 2 is on leave (use Employee 2 for this one). | Each is refused with a clear message. | | |
| C4 | Declare the same day twice. | Only one entry. | | |
| C5 | As Employee 1, cancel today. | It disappears from the card, and (after Refresh) from the manager's list. | | |
| C6 | Declare today again, then scan in at the tablet. | Employee 1 now counts as **Present**, not working from home. | | |
| C7 | As Manager 1, remove someone's declared day from the Today list. | They disappear from the list; their own card no longer shows the day. | | |
| C8 | In the Attendance register, find a declared day with no scan. | It shows **W** (work from home); the CSV has a "Work from home days" column. | | |

## D. Dashboard analytics
| # | What to do | What should happen | Result (P / F / S) | Notes |
|---|---|---|---|---|
| D1 | As Manager 1, open the dashboard and scroll below Today. | The Attendance analytics panel loads with three figures, a chart and departments. | | |
| D2 | Press each period button (This week, Last 7, Last 14, Last 30). | The numbers and dates change each time, with no error. | | |
| D3 | Compare one day's attendance with the register for the same day. | The numbers agree. | | |
| D4 | Pick a period with no check-ins (or a brand-new organization). | A friendly "no check-ins in this period" message. | | |
| D5 | As Manager 2, open the same panel. | You see only your own team's numbers. | | |

## E. Shifts: rota, scanning and the refused list
| # | What to do | What should happen | Result (P / F / S) | Notes |
|---|---|---|---|---|
| E1 | As the admin, open Shifts, Settings and switch shifts **off**, then check in as Employee 1. | It works exactly as before shifts existed. Switch shifts back **on** afterwards. | | |
| E2 | As Manager 1, assign TEST Day to Employee 1 for a **future** day, then clear it. | Assigning shows it on the Rota; clearing removes it. | | |
| E3 | As Employee 1 (shifts on, a shift assigned today), scan **more than 2 hours before** the shift. | The scan is **refused** with a clear message that nothing was recorded. | | |
| E4 | As Manager 1, open the **Refused check-ins** tab. | The refused scan is listed with who, when, and why. | | |
| E5 | As Employee 1, scan inside the window. | It is recorded normally. | | |
| E6 | As an Employee, look for the Shifts page in the menu. | Employees have **My Shifts** only. | | |
| E7 | On a phone, look at the Rota and My Shifts. | Cards, nothing cut off, no sideways scrolling. | | |

## F. Manager change
| # | What to do | What should happen | Result (P / F / S) | Notes |
|---|---|---|---|---|
| F1 | As the admin, change Employee 1's manager to Manager 2 (Settings, the People card, the Manager dropdown). | A clear message, including that the person must sign in again. | | |
| F2 | As Manager 2, look at the roster and reports. | Employee 1 is on Manager 2's team now, with their earlier history visible. | | |
| F3 | As Manager 1, look at the roster. | Employee 1 is no longer listed, but the days Manager 1 managed still show in their reports. | | |
| F4 | Have Employee 1 submit a leave request **before** the move, still pending. After the move, check who can approve it. | **Manager 2** can approve it, not Manager 1. | | |
| F5 | Try to move a manager who has people to a different role, or remove them. | It is refused until their team is moved. | | |
| F6 | Check Employee 1's future shifts. | They moved with Employee 1 to Manager 2; past ones stay. | | |

## Always include these
| # | What to do | What should happen | Result (P / F / S) | Notes |
|---|---|---|---|---|
| Z1 | Do the main action as each kind of user. | It works, and each user sees only what they should. | | |
| Z2 | Try something a user should **not** be allowed to do. | It is refused with a clear message. | | |
| Z3 | Open each new screen on a phone. | Nothing is cut off, no sideways scrolling. | | |
| Z4 | Turn the internet off and try a change. | A clear message; nothing is lost or duplicated. | | |
| Z5 | Look at a screen with no data yet. | A friendly empty message, not a blank page. | | |
| Z6 | Sign in as someone from a **different organization**. | They never see the first organization's data. | | |

## H. Owner only
| # | What to do | What should happen | Result (P / F / S) | Notes |
|---|---|---|---|---|
| H1 | In the Firebase console (staging), Firestore, Indexes, check the **Status** of every index. | All say **Enabled**. | | |
| H2 | In Firestore, Rules, check the rules are the latest version. | The rules include `shift_patterns`, `late_excuses` and `wfh_days`. | | |
| H3 | In Vercel (staging project), check the latest deployment. | It says **Ready**. | | |

## What to send back
1. The list of test numbers that **passed** and the ones that **failed** (for example "A1 to A15 passed, B7 failed").
2. For each failure: the steps you did, what you expected, what happened (the exact words on screen), a screenshot, your device and browser, and the time.
3. Anything that looked or felt odd even if the test passed: text too small, a slow screen, a confusing message.

Do not send passwords, keys or screenshots that show them.

## If you get stuck
- Sign-in fails: use email and password, not Google. Ask the owner to check your login.
- A late arrival is not showing: late marks need a scan **after** the location's reporting time, within the last 14 days.
- A number on the dashboard did not change: press Refresh and wait up to a minute.
- Anything else: stop, take a screenshot, and ask. Please do not work around an error message.

## Sign-off
Passed (P): ____   Failed (F): ____   Skipped (S): ____   Signature: ______________
