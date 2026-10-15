# Browser test of the main path

A small automatic test that opens the **staging** site in a real browser, signs in as a test org admin or manager, and checks the Roster. It catches the case where a change silently breaks sign-in or the main screen. It does not replace the human checklists: a robot cannot judge a phone camera or a tablet.

It is not part of `npm test` and is not type-checked with the app. It has its own `package.json`.

## Set it up (once)
1. Create a **test org admin or manager** on staging (never a real person).
2. In the GitHub repository, Settings, Secrets and variables, Actions: add secrets `E2E_BASE_URL` (the staging address), `E2E_EMAIL`, `E2E_PASSWORD`.
3. Add the repository **variable** `E2E_ENABLED` with the value `true`.

The CI job runs only when `E2E_ENABLED` is `true`, so it never fails a pull request before this is set up.

## Run it on your computer
```bash
cd e2e
npm install
npx playwright install chromium
E2E_BASE_URL=https://your-staging-address E2E_EMAIL=test@example.com E2E_PASSWORD=... npx playwright test
```

## Rules
- Staging only. Never point it at the live site.
- The password lives in the GitHub secrets only, never in this folder.
- The test is skipped (not failed) when the settings are missing.
- The selectors (`#loginEmail`, `#loginPassword`, the "Sign In with Email" button, the "Present today" tile) come from `src/routes/auth.tsx` and the Roster. If those screens change, update this test in the same pull request.
