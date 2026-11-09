# Privacy Policy: proposed plain-language wording

**Status: proposal for the owner to read and approve. The live page (`/privacy`) is unchanged.**

I am not a lawyer. Once you are happy with the wording, have it checked by someone who knows the data protection law that applies to your customers before it goes live. Lines marked **[CONFIRM]** are decisions or facts only you can supply. I have not guessed at them.

## What is wrong with the current policy

1. **Developer words a customer will not understand:** "multi-tenant", "tenant boundaries (`orgId`)", "TLS 1.3", "timing-safe HMAC verification", "SHA-256 one-way hashing", "Firebase Authentication".
2. **It leaves things out that the product really does:** reasons and notes about late arrivals, work-from-home days, shifts, push notifications, problem reports (with an optional picture and browser details), and the brief use of internet addresses to slow down guessing.
3. **It makes claims that are stronger than we can prove:** "all communication is encrypted via TLS 1.3" (HTTPS is certain, the exact version is the host's choice), and "data is never shared or commingled" (true by design, but "never" is a promise to be careful with).
4. **It does not say who the policy is from.** It reads as if ChecIN decides what is recorded about each employee. In practice the employer's organization does, and ChecIN stores it for them. This matters legally, so **[CONFIRM]** with your adviser which wording is right.
5. **Contact details I cannot verify:** "privacy officer", `privacy@checin.com`, "GDPR".

## Proposed text

> **Privacy Policy**
> Last updated: **[CONFIRM date]**
>
> ### In short
> - ChecIN proves you were at work with a code on a tablet at your entrance. **We never ask for, collect or store your location.**
> - Your organization decides who is invited and what is recorded. ChecIN stores those records and keeps them safe for the organization.
> - Each organization's records are kept apart. Nobody in another organization can see yours.
> - **[CONFIRM]** We do not sell your information or show advertising.
>
> ### 1. Your location and your camera
> ChecIN does not use GPS or any other way of finding where you are. When you check in, your phone's camera only reads the code on the entrance tablet. We do not take, upload or keep photos from it.
>
> ### 2. What we keep, and why
> | What | Why |
> |---|---|
> | **Your account:** your name, your work email, and your profile picture if you sign in with Google. | To sign you in and show your name. |
> | **Check-in records:** the time you checked in or out, which entrance, and whether you were late or left early. | To record attendance for your organization. |
> | **Records your organization keeps about work:** your team and department, leave requests and decisions, days you work from home, your shifts, and the reasons or notes given for a late arrival. | So your organization can run attendance, leave and shifts. |
> | **Notification details:** if you allow notifications, an address for your phone's browser. | To send you notices from your organization. |
> | **Problem reports:** if you send one, your message, an optional picture, the page you were on, your browser and screen size, and who you are. | To find and fix the problem. |
> | **Short-lived technical records:** a count of recent sign-in and pairing attempts linked to your internet address, and a log of important actions (who did what, and when). The attempt counts are removed automatically within about a day. **[CONFIRM how long action logs are kept]** | To stop people guessing codes and passwords, and to investigate problems. |
>
> ### 3. Who can see it
> - **You** can see your own check-ins, leave and shifts.
> - **Your manager** can see the people on their team.
> - **Your organization's administrators** can see the organization.
> - **People in other organizations cannot see any of it.** Every request is checked on our servers, not just on your screen.
> - **ChecIN staff** can see problem reports sent to us. **[CONFIRM]** whether staff can also open an organization's records when giving support, and under what rule. Say so here if they can.
>
> ### 4. Services we use
> We use Google's Firebase to sign people in and store records, and Vercel to run the website. Pages also load text styles from Google Fonts, which means Google can see your internet address when a page loads. **[CONFIRM this list is complete before publishing, and add any service added later, such as payments.]**
>
> ### 5. How we keep it safe
> - Connections to ChecIN are encrypted (HTTPS).
> - Passwords are handled by Google's sign-in service. We never see or store them.
> - Each entrance tablet has a secret that is stored only in scrambled form. Without it, nobody can produce a valid check-in code.
> - Check-in codes are signed and only work for a few seconds.
>
> ### 6. How long we keep it, and your choices
> **[CONFIRM: these are decisions, not facts I can read from the code. There is no self-service "delete my data" feature today, so the policy must not promise one.]**
> - Attendance records are kept for **[how long?]**, or for as long as your organization uses ChecIN.
> - When an organization stops using ChecIN, its records are **[deleted after how long? / returned to the organization?]**.
> - To ask for a copy of your information, a correction or deletion, ask your organization's administrator first, because they decide what is recorded. You can also email us at the address below.
>
> ### 7. Contact
> Questions about your information: **[CONFIRM the address exists and who answers it. The page currently says privacy@checin.com.]**
>
> ### 8. Changes
> If we change this policy we will update the date at the top. **[CONFIRM]** For important changes we will tell organization administrators.

## What I checked in the code (so the text above is true)

| Statement | Checked against | Result |
|---|---|---|
| No location is collected | The scan screen reads a code with the camera and sends only the code; the design rules forbid location code | True |
| No photos from the camera are kept | Nothing in the scan screen uploads or stores an image | True |
| Account details kept are name, email, picture | The user profile fields | True |
| Late-arrival reasons and notes are stored | The late-excuse feature | True, and missing from the old text |
| Problem reports include message, picture, page, browser, screen size | The report dialog | True, and missing from the old text |
| Internet address is used for rate limiting | The rate limiter and the pairing and sign-in routes | True. Counters expire automatically (within about a day after their window) |
| No analytics or advertising tools | Searched the app for analytics and ad code | None found. Google Fonts is loaded on every page |
| Camera, GPS and "delete my data" | Searched for self-service deletion or export | **No such feature exists**, so the text promises none |

## What I need from you

1. Approve the plain wording above, or tell me what to change.
2. Fill in every **[CONFIRM]** line. The retention period and the staff-access rule matter most.
3. Confirm the company name and `privacy@checin.com`.
4. Have the final text checked by a lawyer.

When all that is settled I will put the approved wording on `/privacy`, remove the "GDPR" and "privacy officer" claims if they are not true, and give the Terms page the same plain-language treatment.
