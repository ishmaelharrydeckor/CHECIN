# Report a problem: where reports go, and how you read them

## What people see
- A small **flag icon** in the top bar of every screen, for everyone who is signed in (employee, manager, admin).
- A **"Need help?"** card on the Account page.
- Pressing either opens a form: what kind of problem (broken, numbers wrong, confusing, idea), what happened, and an optional screenshot.
- The page they were on and their device type are added automatically, so they do not have to describe them.

## Where a report actually goes
1. **It is saved in the database**, in two collections: `problem_reports` (the text and details) and `problem_report_files` (the screenshot, if any). Both are locked: no browser can read or write them. Only the server can, through `/api/reports`.
2. **It goes to the database of the version being used.** A tester on **staging** saves to the **staging** database. A real user on the **live** app saves to the **live** database. They are two separate inboxes, one per environment, each shown in that version's app.
3. **You are told straight away:** every platform owner gets an item in the app's **bell**, and a **web push** notification if they switched notifications on in that version. The notification says the kind of problem, the role of the sender and the page. It never includes the message text.
4. **You read it in the Reports inbox:** an **inbox icon** appears in the top bar of the app, only for you. It opens `/owner/reports`. There you can filter (New, Seen, Resolved, All), open the screenshot, add a private note, and mark each report seen or resolved.

## Who can read reports
Only the user ids listed in the server setting **`PLATFORM_OWNER_UIDS`**. It is not a company role, so a company admin can never read reports, and neither can anyone in the team unless you add them. If the setting is empty, **nobody** can read them (it fails closed).

## One-time setup (for each version: staging, then live)
1. Sign in to that version once, so your account exists there.
2. Open that version's **Firebase Console, Authentication, Users**, find your account, and copy its **User UID**. Staging and live are separate Firebase projects, so your UID is **different** in each.
3. In **Vercel, Settings, Environment Variables**, add `PLATFORM_OWNER_UIDS` with your UID (several UIDs separated by commas). Staging's value goes in **Preview**; the live value goes in **Production**.
4. Redeploy that version. The inbox icon should appear for you, and nobody else.
5. In the app, switch on **notifications** (the bell) so pushes reach your device.

## Safeguards built in
- The sender's identity (who, which company, which role) is taken from their login, never from the form.
- At most **5 reports per person per hour**. Messages are capped at 2,000 characters, one screenshot at about 450 KB, JPEG only (the browser converts it first).
- The text is only ever shown as plain text.
- The screenshot is only served to an owner, with a header that stops it being treated as anything but an image.

## Privacy and keeping data
- A report stores the sender's **email, role, company, page, device type** and their message and screenshot. Screenshots can show private information, so the form warns people and only owners can see them.
- There is no automatic deletion yet. Decide a retention rule (for example, delete resolved reports after 90 days) before real customers use it, and tell people in the privacy policy.

## Not built yet
- Replying to the person from the inbox.
- Email or WhatsApp alerts (the bell and web push are used for now).
- A summary count on the dashboard.
