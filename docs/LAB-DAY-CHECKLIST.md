# ChecIN — Lab Day Checklist

Pilot at the research lab. Work top to bottom. Tick each box before moving on.

## A. Before you leave (the day before)

- [ ] `main` has all three PRs merged (hours + Late badge, security fixes, employee view).
- [ ] Vercel production shows the **latest** deploy of `main`, and the site loads **with styling**.
      (If it is raw HTML: Vercel → Settings → Environment Variables → `NITRO_PRESET=vercel`, then redeploy.)
- [ ] All Vercel environment variables are set (see `DEPLOYMENT.md`), including `KIOSK_TOKEN_SECRET`,
      `FIREBASE_SERVICE_ACCOUNT`, and the VAPID keys.
- [ ] Firestore rules deployed (they were deployed on 2026-09-30). Redeploy only if `firestore.rules` changed:
      `firebase deploy --only firestore:rules --project checin-d172e`
- [ ] Test organizations and accounts deleted from the live Firebase project (see below).
- [ ] Tablet for the kiosk: charged, charger packed, screen timeout off, browser set to full screen.
- [ ] Tablet can open the live site on the lab's Wi-Fi (try it at home on a hotspot too).
- [ ] Your own phone + one spare phone for the employee scan test.
- [ ] Decide who is the **org admin** (one person), the **manager(s)**, and the **employees**.
      Collect the work emails you'll invite.

## B. Setup at the lab (about 20 minutes)

1. [ ] Register the lab's organization on the live site (admin email + strong password).
2. [ ] Settings → set the **timezone** (e.g. `Africa/Accra`). Every late/early flag depends on this.
3. [ ] Settings → add a **location** (the entrance). Set **reporting time**, **closing time** and the
       **check-out window**. Example: 08:00, 17:00, 120 minutes.
4. [ ] Invite the **manager(s)**, then have each manager invite their **employees**.
       Each person opens their invite link and sets a password.
5. [ ] On the tablet: open `/kiosk` → in Settings click **Pair Tablet** → type the `CHK-…` code into the tablet
       (the code lasts 10 minutes and works once).
6. [ ] The kiosk shows a QR code that changes every 15 seconds, plus the label (Scan to Check In / Out).

## C. First scans (the real test)

- [ ] An employee signs in on their phone, opens `/scan`, scans the screen. Kiosk shows "Welcome, <name>".
- [ ] Their dashboard/history row appears as **Clocked IN**. Manager's dashboard shows them as well.
- [ ] Scan **after** the reporting time → the row shows **Late**.
- [ ] Wait 60+ seconds and scan again → **Clocked OUT**; before closing time it shows **Early departure**.
- [ ] Scan twice within 60 seconds → the second scan is refused (cooldown). This is normal.
- [ ] Employee sees only **My History** and **Notices**. Manager sees their team only. Admin sees everyone.
- [ ] Employee types `/dashboard` or `/settings` in the address bar → lands on My History.
- [ ] Post one **Notice** as the admin; employees can read it.
- [ ] Install the scan page to the phone home screen ("Add to Home Screen"), then open it from there.

## D. If something goes wrong

| Symptom | Likely cause / fix |
|---|---|
| Site looks like plain unstyled text | `NITRO_PRESET=vercel` missing on Vercel, or a stale service worker. Redeploy; on the device: browser settings → clear site data. |
| Kiosk says "credentials expired / re-pair" | Tablet was revoked or re-paired elsewhere. Settings → Pair Tablet → new code → **Unpair/Re-pair** on the tablet. |
| Pairing code rejected | Codes last 10 min and work once. Generate a fresh one. After many wrong tries you're rate-limited for ~10 min. |
| "Token expired" when scanning | The QR rotates every 15 s. Re-scan the current code. Make sure the phone's clock is correct. |
| Employee cannot sign in after role change | Role changes sign the user out on purpose. Sign in again. |
| Nothing is flagged Late | Location hours not set, or timezone wrong. Check Settings. |
| Employee sees "permission denied" / blank profile | Open the browser console and send the message to the developer; rules may need a redeploy. |
| Scan works but kiosk shows no welcome | Kiosk polls every ~2.5 s; check the tablet's connection. |

## E. Record for the next version (v2)

During the day, write down:
- [ ] Anything employees found confusing at the scan step.
- [ ] How long a scan took from opening the app to the kiosk confirmation.
- [ ] Were the reporting/closing/check-out times right for this lab? What did they want instead?
- [ ] Missing features they asked for (leave, WFH, reports, shifts).
- [ ] Any false "Late" flags, and why.

## F. End of day

- [ ] Export the day's attendance (Dashboard → Export CSV) as a backup.
- [ ] Leave the tablet plugged in and pairing intact, or unpair if it goes home with someone.
- [ ] Share the admin login only with the admin; do not share it in chat or email.
