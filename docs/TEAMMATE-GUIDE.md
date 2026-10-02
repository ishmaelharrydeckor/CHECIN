# Teammate guide: your first task, step by step

You don't need to be a programmer to do this. You'll work with Claude (an AI assistant) inside the project, and Claude does the coding and the Git steps. Your job is to **tell it clearly what to build, check that it works, and ask for help when stuck.**

If anything here doesn't match what you see on your screen, stop and message the project owner. Don't guess.

## Words you'll hear

| Word | Meaning |
|---|---|
| Repo | The project's folder on GitHub |
| Branch | Your own private copy of the code to work in, so you can't break anyone else's |
| PR (pull request) | Asking the owner to review your work and add it to the project |
| `staging` | The test version of the app. Safe to break. Real company data is never here |
| `main` | The real, live app. You never touch it |
| Issue | Your task, with a number like #12 |

## One-time setup (about 30 minutes)

You need: a GitHub account (you already have one), and these installed:

1. **Node.js** (the LTS version): https://nodejs.org
2. **Git**: https://git-scm.com/downloads
3. **The Claude desktop app** (use the **Code** tab): https://claude.ai/download
4. **GitHub CLI** (lets Claude open pull requests for you): https://cli.github.com

Then:

1. In the Claude desktop app, open the **Code** tab and start a session in an empty folder (e.g. `Documents/ChecIN-work`).
2. Paste this to Claude:

   > Clone https://github.com/ishmaelharrydeckor/CHECIN.git into this folder, check out the `staging` branch, and run `npm ci`. Tell me in plain language what you're doing as you go.

3. The project owner will **privately** send you a block of text for a file called `.env`. Paste this to Claude along with it:

   > Create a `.env` file from `.env.example` using these staging values. Never print them back to me or commit them: *(paste the values)*

   Those values are for the **test** environment only. If anyone ever sends you values that mention `checin-d172e`, stop: that's the real company data. Ask the owner.

4. Sign in to GitHub once. Ask Claude: *"Run `gh auth login` and walk me through it step by step."* Choose GitHub.com, HTTPS, and sign in with your browser.
5. Ask Claude: *"Run the app with `npm run dev` and tell me the address."* Open the address (usually http://localhost:3000). You should see the ChecIN site.

The owner will give you a test login (a manager and an employee account on staging). If you can sign in, setup is done.

## Doing a task

Each task is a GitHub issue (https://github.com/ishmaelharrydeckor/CHECIN/issues). Open yours and read it fully, including **"Done when"**.

### 1. Start the session

Open a **new** Claude session in the project folder, and paste this, replacing the number:

> Read CLAUDE.md, AGENTS.md, CONTRIBUTING.md and docs/TEAM-TASKS.md. I'm doing GitHub issue #NUMBER. Read that issue with `gh issue view NUMBER`. Create a branch from `staging` named `feat/<task>-<short-name>`. Before writing code, tell me in plain language what you plan to build and which files you'll create. Wait for my OK.

Read its plan. If it plans to edit one of the shared files (AGENTS.md, firestore.rules, AppShell.tsx, auth.tsx, anything in `api/admin/`), say: *"Don't edit that. Note it for the owner instead."*

### 2. Build, in small steps

Ask for one piece at a time ("first the form, then saving it"). After each piece:

> Run `npm run dev` and tell me exactly what I should click to test this.

Then actually click through it in the browser on your test login. Try the wrong thing too: empty fields, a wrong password, a date in the past.

### 3. Check before you finish

> Run `npm run check` and tell me the result. If it fails, fix it.

It must pass (typecheck + build). Don't open a PR while it fails.

### 4. Open the PR

> Commit your changes with a clear message, push the branch, and open a **draft** pull request with base branch `staging`. Fill in the PR template honestly. Add "Closes #NUMBER" in the description. List any shared-file changes I need the owner to make.

Open it as a **draft** early, even before it's finished. The owner can then see progress and warn you if you're heading the wrong way. When it's done, click **Ready for review** on the PR page.

### 5. After review

The owner may leave comments on the PR. Paste them to Claude: *"The reviewer said this: …. Fix it, run `npm run check`, and push."* When the owner merges, the change appears on the staging site. Test it there too.

## Hard rules (the app depends on these)

- **Never** use, ask for, or paste anything for the real company database (`checin-d172e`).
- **Never** put passwords, keys or `.env` contents in GitHub, in a PR, or in a group chat.
- **Never** push to `main` or `staging` directly. Always a PR.
- **Never** add GPS or location features. ChecIN checks people in with the kiosk QR code only.
- **One task per session.** If you think of something else, add a comment on the issue instead.

## Stop and ask the owner when

- Claude says it needs to change a Firestore rule, user roles, sign-in, or payments.
- Claude wants to install a new package or delete files you didn't mention.
- `npm run check` keeps failing after two attempts.
- You see data that looks real (real names, real emails).
- You're not sure whether something is safe. Asking costs a minute; a mistake can cost the company's data.

## When you're stuck

Message the owner with: the issue number, what you asked Claude, and the exact error (copy-paste the text or send a screenshot). Don't try to work around a security rule.
