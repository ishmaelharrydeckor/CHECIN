# Test checklist, round 6: what changed since round 5

Round 5 ([ROUND-5-TEST-CHECKLIST.md](ROUND-5-TEST-CHECKLIST.md)) covers late excuses, repeating shifts, work from home, analytics, the rota and manager change. **Do round 5 first if it has not been done.** This round covers everything added after it: the landing page, sign-in, the new organization checklist, the reshuffled dashboard, the tablet change, shift swaps and the menu changes. It ends with a quick pass over the main journeys, to catch anything that broke.

**Tester:** ______________   **Date:** ____________   **Device and browser:** ______________

Testers fill in **Result** with **P** (passed), **F** (failed) or **S** (skipped), and write what they saw in **Notes**, especially for an F.

## Read this first
- This is the TEST copy. Use only the test logins you were given. Never use a real customer's account or details.
- Start anything you create with the word **TEST**, so it is easy to find and delete.
- If something looks wrong, do not guess. Take a screenshot and note the test number.
- Some things move on their own (the headline, the menu fading in). If your computer has **"Animation effects" turned off** (Windows: Settings, Accessibility, Visual effects), they will not move. That is correct, not a fault.

## What you need (the owner sets this up before testing)
- The test address: ______________________
- Test logins (write each email here, never the passwords): organization admin ____________, manager A ____________, manager B ____________, employee on manager A's team ____________, a second employee on manager A's team ____________, and an admin of a **different** organization ____________.
- A **brand new** organization for part C: the tester registers it themselves (name it **TEST New Co**), using an email the owner provides.
- Devices: a computer, a phone, and if possible a tablet.
- **Owner checks first:** in the Firebase console for the test project, the five **shift_swaps** indexes show **Enabled** (not "Building"), and the latest rules are published. If not, part F will fail for a reason that has nothing to do with the testers.

## A. Landing page and public pages (no login needed)
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| A1 | Open the test address on a computer | The headline sharpens in, letter by letter. A dashboard picture rises into view after it. | | |
| A2 | Scroll slowly to the bottom | Each section fades up as it arrives. Photos of real people appear on the cards. Nothing is blank or stuck hidden. | | |
| A3 | Find the "Who it's for" section | A strip of three photos, then six cards: Owners & HR, Team Managers, Employees, Operations, Finance, Leadership. Each says one plain thing. | | |
| A4 | Click **Pricing**, then **FAQ**, then **Why ChecIN** in the top bar | Each scrolls to its section. The heading is fully visible, not hidden under the top bar. | | |
| A5 | Read the FAQ | Eight questions, in plain words. Three cover location tracking, internet going down, and working from home. | | |
| A6 | Look at the top of the browser tab | The ChecIN icon is a **C with a dot**. (If you still see an old icon, refresh with Ctrl+Shift+R, or try a private window.) | | |
| A7 | **On a phone:** open the same address | A menu button (three lines) is in the top bar. | | |
| A8 | On the phone, tap the menu button | A panel slides in with Benefits, Why ChecIN, Capabilities, Pricing, FAQ, plus **Get Started** and **Sign in**. | | |
| A9 | Tap **Pricing** in that panel | The panel closes and the Pricing section is in view, not under the top bar. | | |
| A10 | Open the menu, then press Back or tap outside the panel | It closes. (On a computer with a keyboard, Escape also closes it.) | | |
| A11 | Scroll to the footer | No "Security Architecture" link. Terms of Service and Privacy Policy links work. | | |
| A12 | Open **Terms of Service**, then **Privacy Policy** | Both have the **same top bar as the landing page**. The page title is not hidden under it. | | |
| A13 | On the phone, open Terms, tap the menu, then **FAQ** | You land on the landing page's FAQ. | | |

## B. Sign in and register
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| B1 | Open the sign-in page | The left side says "No GPS. Checked at the door." and three plain ticks. **No** words like "multi-tenant", "tenant", "PWA" or "Zero GPS Spoofing". | | |
| B2 | Look under the sign-in card | The line: "By continuing, you agree to the Terms of Service and Privacy Policy", with both links. They open in a new tab. | | |
| B3 | Press **Continue with Google** | If it works, you sign in. If Google is not available on the test address, you see a **plain message** telling you to use email and password. It must **not** show the name of a Firebase project or a link to a console. | | |
| B4 | Click the **Register company** tab | The text says "Set up your company's workspace to get started." No mention of "tenant". | | |
| B5 | Sign in with a wrong password | A clear message. Nothing technical. | | |

## C. The new organization checklist ("Get set up")
Use the brand new **TEST New Co** organization, signed in as its admin.
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| C1 | Register **TEST New Co** and arrive on the dashboard | A green card "Get set up" is at the top: **0 of 3 done**, three steps: Add your entrance, Pair the entrance tablet, Invite your team. | | |
| C2 | Read step 2 | It says to add an entrance first. | | |
| C3 | Press **Open Settings** on step 1. Add a location named **TEST Entrance** | Back on the dashboard (refresh it), the card says **1 of 3** and step 1 has a tick. | | |
| C4 | In Settings, under Entrance Tablet Kiosks, generate a pairing code. On a tablet or a second browser window, open the Kiosk page and enter it | The tablet shows a QR code. Back on the dashboard, **2 of 3**. | | |
| C5 | Press **Invite staff** on step 3 and send an invite to a test email | The invite box opens. Once the person joins, the card says **3 of 3** and **disappears**. | | |
| C6 | Refresh the page after it has gone | It does not come back. | | |
| C7 | In a different new test organization, press **Hide for now** | The card goes away. After a refresh it stays hidden **in this browser**. | | |
| C8 | Sign in as a **manager** and as an **employee** | Neither sees the "Get set up" card. | | |

## D. The dashboard (admin and manager)
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| D1 | Open the dashboard as the admin | From the top, in this order: the title with one plain line under it, then **Today** (four boxes), then the lists, then **Today's check-ins**, and **Attendance analytics last**. | | |
| D2 | Look at the top right of the page | **Only** "Invite staff". No big Refresh or Export buttons up there. | | |
| D3 | Look next to "Last updated" | A small **refresh icon**. Press it. The numbers refresh. | | |
| D4 | Look at the four boxes: Present, Late, Away, Absent | The numbers add up with the lists below. | | |
| D5 | Press the **Late** box (when someone is late) | The page scrolls to "Late today", not hidden under the top bar. | | |
| D6 | Press the **Absent** box | It scrolls to "Not arrived yet". | | |
| D7 | Press the **Present** box | It scrolls to "Today's check-ins". | | |
| D8 | Look at the two lists | **"Not arrived yet"** is first, then **"Late today"**. | | |
| D9 | In "Late today", find the link | "Review late arrivals". It opens the late arrivals page. | | |
| D10 | When someone is working from home, find the thin bar | "Working from home today", with names, closed. Press it: it opens a list with a bin button per person. Press again: it closes. | | |
| D11 | Open the bin on a **test** person | After confirming, that day is removed. | | |
| D12 | In "Today's check-ins", find **Export CSV** | It is next to Search and the In/Out filters. Press it: a file downloads and opens in Excel. | | |
| D13 | Read the page | Text is easy to read. Nothing is tiny. | | |
| D14 | As **manager A**, open the dashboard | Only manager A's team appears. Nobody from manager B's team. | | |
| D15 | On a phone, open the dashboard | The four boxes are two by two. Lists are one under the other. Nothing is cut off sideways. | | |
| D16 | Signed in as an **employee**, type the dashboard address (the test address followed by /dashboard) | You are sent to your **History** page. You never see the dashboard. | | |

## E. The entrance tablet
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| E1 | Open a paired tablet (Kiosk page) | A QR code, a clock and the entrance name. There is **no "Unpair Terminal" button** anywhere. | | |
| E2 | Look at the bottom of the screen | It shows the **entrance name**, not a string of letters and numbers. | | |
| E3 | Try to unpair the tablet from the tablet itself | You cannot. There is no button to do it. | | |
| E4 | As the admin, go to Settings and **revoke** that tablet | The admin sees it marked "Tablet Revoked". | | |
| E5 | Wait up to **one minute**, watching the tablet | It shows "Token Minting Paused" with **Re-pair**. | | |
| E6 | On the tablet press **Re-pair** and enter a **new** pairing code from Settings | It pairs and shows a QR again. | | |
| E7 | Scan the new QR with an employee phone | Check-in works. | | |
| E8 | Turn the tablet's internet off for about a minute | It says it is waiting for the internet and hides the old code. It recovers by itself when the internet returns. | | |

## F. Shift swaps (needs the swaps indexes to be Enabled, see the owner check above)
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| F1 | As the admin, go to **Shifts**, then **Settings**. Switch on **Allow shift swaps** | "Shift swaps are on." A **Swaps** tab is available. | | |
| F2 | As an **employee** with a shift, open **My shifts** and press **Ask to swap** on a future day | A box asks you to **Choose a colleague**. Only people on your own team with a different shift that day are listed. | | |
| F3 | Choose a colleague and **Send request** | You see it under **Your swaps**. | | |
| F4 | Sign in as that colleague | It appears under **Waiting for you**. Accept it: "Accepted. A manager will now decide." | | |
| F5 | Sign in as the **manager**, open **Shifts**, then **Swaps** | The swap loads (**no error "Couldn't load shift swaps"**). Approve it: "Swap approved. Both rotas are updated." | | |
| F6 | Check both people's **My shifts** | The two shifts have swapped for that day. | | |
| F7 | Start another swap and have the colleague **decline** it | "Swap declined." Nothing changes. | | |
| F8 | Start another swap and **cancel** it yourself | "Request cancelled." | | |
| F9 | Try to ask to swap on a day you have **leave** or **no shift** | It is refused, or you are told you have no shift to swap. | | |
| F10 | As an employee, try to swap with someone on **manager B's team** | They are not offered. | | |
| F11 | As manager B, open Swaps | You do **not** see manager A's team's swaps. | | |
| F12 | As the admin, switch **Allow shift swaps** off | "Ask to swap" disappears for employees. | | |

## G. Menus and moving around
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| G1 | Sign in and look at the left menu | Grouped, and the current page is highlighted. | | |
| G2 | Press the menu button at the top left to collapse it | Only icons remain. Press it again to open it. The choice is remembered after a refresh. | | |
| G3 | Look under **Sign Out** in the left menu | Small **Terms** and **Privacy** links. They open in a new tab. | | |
| G4 | Press **Tab** once on a signed-in page (a computer, with a keyboard) | A button "Skip to main content" appears. Press Enter: you jump past the menu. | | |
| G5 | On a phone, open the menu | It slides in from the left, and every page is reachable. | | |

## H. Quick pass over the main journeys (to catch anything that broke)
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| H1 | As an employee, scan the tablet QR from a phone | "You're checked in", with the time and the entrance. Nothing about being late is shown here. | | |
| H2 | Scan again to check out | "You're checked out." | | |
| H3 | Employee: open **My page** | Their own check-ins, leave, and any late days. | | |
| H4 | Employee: ask for **leave** | It appears as pending. The manager can approve it. | | |
| H5 | Manager: approve it | The status changes. The person is not counted absent on those days. | | |
| H6 | Admin: post an **announcement** | Employees see it. | | |
| H7 | Admin: open **Reports** and export | A file downloads and opens. | | |
| H8 | Admin or manager: open **Late arrivals** and excuse one late day with a reason | It is marked excused and no longer counts as late. | | |

## Always include these
| # | What to do | What should happen | Result | Notes |
|---|---|---|---|---|
| Z1 | Do the main action as each kind of user | It works, and each user sees only what they should | | |
| Z2 | Try something a user should NOT be allowed to do | It is refused with a clear message | | |
| Z3 | Open it on a phone | Nothing is cut off, no sideways scrolling | | |
| Z4 | Turn the internet off and try | A clear message, nothing is lost or duplicated | | |
| Z5 | Look at a screen with no data yet | A friendly empty message, not a blank page | | |
| Z6 | Sign in as the admin of a **different** organization | They never see the first organization's people or records | | |

## What to send back
For each **F**: the test number, what you did step by step, what you expected, what happened (the exact words on screen), a screenshot, and your device, browser and the time.

## If you get stuck
Do not work around it. Write down the test number and what you tried, and ask the owner.

## Sign-off
Passed (P): ____   Failed (F): ____   Skipped (S): ____   Signature: ______________
