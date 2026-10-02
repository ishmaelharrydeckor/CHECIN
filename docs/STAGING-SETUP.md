# Staging environment: one-time setup

Goal: a copy of ChecIN that teammates can break freely, with **its own Firebase project, its own secrets, and its own URL**, so nothing can touch the lab's real data.

```
main      -> Vercel Production   -> Firebase  checin-d172e   (real data)
staging   -> Vercel Preview      -> Firebase  checin-staging (throwaway data)
feat/*    -> Vercel Preview      -> Firebase  checin-staging
```

Vercel Preview env vars apply to every non-`main` branch. That is the point: a feature branch can never reach production data, even by mistake.

Steps marked **(you)** need your accounts. The repo side (workflow, CODEOWNERS, `.firebaserc`, PR template) is already committed.

## 1. Git branch and protection (you)

```bash
git checkout main && git pull
git checkout -b staging && git push -u origin staging
```

GitHub > Settings > Branches > add a rule for **`main`** and another for **`staging`**:

- Require a pull request before merging
- Require status checks: **Typecheck and build** (appears after the first PR runs CI)
- Require review from Code Owners (uses `.github/CODEOWNERS`)
- Block force pushes
- On `main` only: restrict who can push; teammates should not merge to it

Settings > Collaborators: add teammates with **Write** (not Admin). Tip: set the default branch to stay `main`; teammates pass `--base staging` or pick it in the PR UI.

## 2. Staging Firebase project (you)

1. Firebase Console > Add project > `checin-staging` (if the ID is taken, use another and update `.firebaserc`).
2. Build > Authentication > enable **Email/Password** and **Google**.
3. Build > Firestore Database > create the database. If production uses a named database, use the same name so `FIREBASE_DATABASE_ID` matches the code.
4. Project settings > General > add a **Web app** > copy the `VITE_FIREBASE_*` values.
5. Project settings > Service accounts > **Generate new private key**, then base64 it:
   ```bash
   base64 -w0 service-account.json
   ```
   Delete the JSON afterwards. This is a real secret.
6. Authentication > Settings > Authorized domains: add your staging domain (step 4 below). Google sign-in only works on listed domains. Per-PR preview URLs are not listed, so teammates should test on the staging URL; email/password works anywhere.
7. Deploy rules and indexes to staging only:
   ```bash
   npx firebase-tools deploy --only firestore --project staging
   ```
   `.firebaserc` makes `default` = staging, so a bare `firebase deploy` can't hit production. Deploying to production must say `--project production` explicitly.

## 3. Staging secrets: generate fresh, never copy from production

```bash
openssl rand -hex 32     # KIOSK_TOKEN_SECRET
openssl rand -hex 32     # SESSION_SECRET
npx web-push generate-vapid-keys   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

Using different secrets on staging means a leaked staging value is worthless in production, and a staging kiosk token can't be replayed against production.

## 4. Vercel (you)

Use the existing project. Settings > Environment Variables: add each variable below with **only the "Preview" box ticked**. Keep production values on "Production" only.

| Variable | Staging (Preview) value |
|---|---|
| `NITRO_PRESET` | `vercel` (also on Production if already there) |
| `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`, `_DATABASE_ID` | from the staging web app (step 2.4) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_ID` | staging project / database |
| `FIREBASE_SERVICE_ACCOUNT` | base64 from step 2.5 |
| `KIOSK_TOKEN_SECRET`, `SESSION_SECRET` | fresh values from step 3 |
| `VAPID_PUBLIC_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | fresh pair from step 3 |
| `APP_ORIGIN`, `VITE_APP_ORIGIN` | `https://staging.<your-domain>` |

Then give the `staging` branch a stable URL: Settings > Domains > add `staging.<your-domain>` (or use a `*.vercel.app` alias) and assign it to Git branch `staging`.

Keep **Deployment Protection** on for previews so staging isn't public. Teammates then need Vercel access, or you can enable a shareable link / password.

## 5. Seed the first staging admin (you)

1. Open the staging URL, sign up. That account becomes `org_admin` for a new staging org.
2. Use the app's invite flow to create a staging manager and employee accounts for testers. Share those logins privately.
3. Optional: add a few fake locations and pair a browser tab at `/kiosk` as the test kiosk.

Wipe and re-seed staging whenever it gets messy; it is meant to be disposable.

## 6. Smoke test before handing it over

- [ ] Sign up and land on `/dashboard` on the staging URL
- [ ] Create a location, pair `/kiosk`, QR rotates
- [ ] Invite an employee, accept the invite, scan from `/scan`, see the event on the dashboard
- [ ] Open the Firebase console for **checin-d172e** and confirm none of the above data appeared there
- [ ] A test PR shows CI running and a Preview deployment pointing at staging

## Promotion flow

1. Teammate opens PR `feat/*` -> `staging`. CI runs, integrator reviews.
2. Merge. Vercel redeploys the staging URL. Team tests there.
3. When staging is healthy, integrator opens PR `staging` -> `main`. Any new Firestore rules ship with it: `npx firebase-tools deploy --only firestore --project production`, done deliberately by the integrator.
