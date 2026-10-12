# Staging test checklist: scan, tablet and dashboard changes

For a team member to follow on real devices. No coding needed. Allow about 45 minutes, plus a second short check the next morning.

**What changed:** the phone now shows a big result screen after scanning, check-in and check-out are saved in a new way, the tablet's "welcome" message is now optional, and the manager dashboard reads its numbers a new way. The computer checks pass, but nobody has tried it on a real phone or tablet yet. That is your job.

## Read this first

- **Use the staging site only.** Never test on the real (production) site. Staging address: `https://checin-6982-git-staging-deckorharry-s-projects1.vercel.app` (if it does not open, ask the integrator for the current address).
- Staging has fake data. You cannot hurt anything real, so try to break things.
- On staging, sign in with **email and password**. "Continue with Google" only works on the main site.
- Do not share passwords in chat. Ask the integrator for the test logins.
- If something looks wrong, do not guess what it means. Take a screenshot and fill in the "What to send back" section at the end.

## What you need

| Item | Notes |
|---|---|
| 1 phone with a camera | Ideally try two kinds: an iPhone (Safari) and an Android phone (Chrome) |
| 1 tablet or a second screen to show the QR code | A laptop screen works if you have no tablet |
| An **org admin** login | To change settings |
| A **manager** login with 2 or more employees on their team | |
| 2 **employee** logins on that manager's team | |
| A **second manager** (with their own employee) | To check teams stay separate |
| One employee login from a **different organization** (optional) | For test 8 |

Ask the integrator if the tablet has not been paired to a location yet. The location also needs opening hours set (Settings, then the location).

---

## A. Check in and check out (phone)

Sign in on the phone as **Employee 1**, open the scan page, and point the camera at the QR code on the tablet.

- [ ] **1. First scan.** A big **mint-green** screen says "You're checked in", with the time and the location name. The time matches your phone's clock.
- [ ] **2. The phone buzzes** when the scan works (not every phone does, so note if yours does not).
- [ ] **3. "Last recorded".** Tap "Scan again", or reopen the page. A line says "Last recorded: IN at HH:MM" with the right time.
- [ ] **4. Second scan.** Wait **at least 15 seconds**, then scan again. A big **cream/butter** screen says "You're checked out" with the new time.
- [ ] **5. Reopen the app** (close it fully, then open it again). The status still says you are checked out. Switch to another app and come back: the status is still right.
- [ ] **6. Screen fit.** On the result screen, nothing is cut off, you do not need to scroll, and the button is easy to tap with your thumb. Try the phone upright only.

## B. Late and early departure

An admin sets the location's hours in Settings. For this test, set **reporting time to a few minutes ago**, and **closing time to a few hours from now**.

- [ ] **7. Marked late.** Sign in as **Employee 2** and check in. The result screen shows an amber **"Marked late"** tag.
- [ ] **8. Left early.** Check out of the same account (after 15 seconds). The screen shows an amber **"Left early"** tag, because it is before closing time.
- [ ] **9. On time.** Ask the admin to set reporting time to **later today**. Check in as Employee 1 on a new day, or use an employee with no scan today. There is **no** late tag.

## C. When something goes wrong (phone)

Each of these should show a **full-screen message** that says your check-in was **not recorded** (except the first one, which says the earlier scan counts). Take a screenshot of each.

- [ ] **10. Scanning twice quickly.** Scan, then scan again within 15 seconds. The message says it is already recorded and tells you to wait.
- [ ] **11. No internet.** Turn on airplane mode, then scan. The message says there is no connection and the check-in was not recorded. Turn airplane mode off and scan again: it works, and you are **not** checked in twice (check the Timesheet page, there should be one entry for it).
- [ ] **12. Old QR code.** Take a photo of the tablet's QR code, wait about a minute, then scan the **photo**. The message says the code has expired.
- [ ] **13. Wrong company (optional).** Sign in as the employee from a **different organization** and scan. The message says it is not your workplace.
- [ ] **14. The "Try again" button** on each error screen returns you to the camera.

## D. The tablet

- [ ] **15. The QR code changes** every 10 to 15 seconds, and the tablet never shows an error while sitting still for 5 minutes.
- [ ] **16. With the welcome OFF** (the default): after a scan, the tablet shows **no** "Welcome" message. Under the QR code, it says "Your phone shows your check-in result".
- [ ] **17. Switch the welcome ON.** As admin, go to Settings, edit the location's hours, tick **"Show a welcome on the tablet after each scan"**, and Save. Within a minute the footer shows "Greeting: live". Scan as an employee: **within about one second** the tablet shows a card that says "Welcome" (check-in) or "Goodbye" (check-out), the words "Clocked IN" or "Clocked OUT", and the time. **It must not show anyone's name.**
- [ ] **18. Switch it OFF again.** Untick it and Save. After a minute, scans no longer show a welcome, and the footer no longer mentions the greeting.
- [ ] **18a. The link drops and recovers.** With the welcome on, switch the tablet's Wi-Fi off for 30 seconds, then on. The footer shows "Greeting: reconnecting" and then "live" again. A scan made after it reconnects shows the card. (A scan made while the Wi-Fi was off cannot reach the server, so that one is not expected to show.)
- [ ] **18b. No old cards.** Scan, wait 2 minutes, then reload the tablet page. It must **not** show a card for the old scan.

## E. Manager and admin dashboard

First make sure Employees 1 and 2 have scanned today (some on time, one late).

- [ ] **19. Manager's numbers.** Sign in as the **manager**. The Today section shows the right counts: how many are in, how many were late, who has not arrived. Compare with what you did.
- [ ] **20. The late list** shows the late employee and the time they arrived.
- [ ] **21. Recent activity** lists today's check-ins and check-outs, newest first, with correct times (in your organization's time, not the wrong timezone).
- [ ] **22. Weekly chart.** The Monday to Friday chart shows today's check-ins. Days that have not happened yet are empty.
- [ ] **23. Teams stay separate.** Sign in as the **second manager**: they see only their own team, not the first manager's staff.
- [ ] **24. Org admin** sees everyone in the organization.
- [ ] **25. An employee login** does not get the team numbers. If they open the dashboard page they see an error or an empty page, never another person's data. Write down exactly what they see, so the integrator can decide if the wording is friendly enough.

## F. The next morning (one short check)

- [ ] **26.** If an employee **forgot to check out** yesterday (checked in, never checked out), their first scan today says **"checked in"**, not "checked out". To set this up, check an employee in near the end of the day and do not check them out.

---

## What to send back

Send the integrator one message with:

1. **A list of the test numbers that passed** (for example "1 to 12 passed") and **the ones that did not**.
2. For each problem:
   - the test number
   - a **screenshot** of what you saw
   - the **phone model and browser** (for example "iPhone 13, Safari")
   - the **time** it happened
   - what you expected to see, in a sentence
3. Anything that **looked or felt odd** even if the test passed, such as text too small, a slow screen, or a confusing message.

Do not send passwords, keys or screenshots that show them.

## If you get stuck

- The page will not load, or the camera will not start: check the phone gave the browser permission to use the camera (browser settings, this site, camera allowed).
- Sign-in fails: use email and password, not Google. Ask the integrator to check your login.
- Anything else: stop, take a screenshot, and ask. Please do not work around an error message.
