# Teammate guide: build a task using Claude and your browser

You don't need to install anything or be a programmer. You'll use a normal Claude chat to write the code and your web browser to put it into GitHub. The owner reviews everything before it reaches the app. **Your job: describe the task clearly, put Claude's code in the right place, get the checks green, write clear test steps, and ask for help when stuck.**

If anything here doesn't match your screen, stop and message the owner. Don't guess.

## Words you'll hear

| Word | Meaning |
|---|---|
| Repo | The project's folder on GitHub: https://github.com/ishmaelharrydeckor/CHECIN |
| Branch | Your own private copy of the code to work in, so you can't break anyone else's |
| PR (pull request) | Asking the owner to review your work and add it to the project |
| `staging` | The test version of the app. Safe to break. Real company data is never here |
| `main` | The real, live app. You never touch it |
| Issue | Your task, with a number like #12 |
| CI / checks | Robots that build your code when you open a PR. A green ✓ means it builds; a red ✗ means it doesn't |

## One-time setup (about 15 minutes)

1. **Accept the GitHub invite** (you've done this) and sign in to GitHub in your browser.
2. **Create a Claude Project.** In Claude (claude.ai), create a Project called **ChecIN v2**.
   - Paste the instructions from [docs/CLAUDE-PROJECT-INSTRUCTIONS.md](CLAUDE-PROJECT-INSTRUCTIONS.md) (the part between the lines) into the Project's instructions.
   - Download these three files from GitHub (open the file, click the download icon) and add them to the Project's knowledge: `AGENTS.md`, `CONTRIBUTING.md`, `docs/TEAM-TASKS.md`.
   - Can't make a Project? Paste the instructions at the start of every new chat instead.
3. That's it. You don't run the app yourself. The owner tests your work on a private test site, so you never need logins or settings.

## Finding your task

- **Your tasks:** go to https://github.com/ishmaelharrydeckor/CHECIN/issues/assigned/@me (the Issues tab, filter **Assigned to you**). GitHub also emails you when a task is assigned to you.
- **Everything planned:** https://github.com/ishmaelharrydeckor/CHECIN/issues?q=label%3Av2 shows all v2 tasks and who owns them.
- **Order matters:** some tasks depend on others (the issue says "after #12"). Don't start one before the task it waits on has been merged. You can read it and plan, though.
- **When you finish:** once the owner merges your PR, tell the owner and ask what's next. Don't pick up a task someone else owns. The owner assigns the next one, or you can suggest an unassigned task by commenting on it.
- **If you have no task:** tell the owner. Don't start on your own idea. Add it as a comment on a related issue.

## Doing a task

### 1. Understand the task
Open your issue (https://github.com/ishmaelharrydeckor/CHECIN/issues), read it fully, especially **"Done when"**. Comment "Starting" on it.

### 2. Get a plan from Claude
Open a **new chat inside your Project**. Paste the whole issue text and say: *"This is my task. Tell me which existing files you need to see."* Open those files on GitHub, copy their contents, and paste them into the chat. Claude will propose a plan; check it makes sense, then say "go ahead".

### 3. Get complete files
Ask for **complete files, one code block per file, with the full path**. If Claude gives you a piece ("add this somewhere in the file"), say: *"Give me the entire file."*

### 4. Put the code into GitHub (the browser editor)
1. Go to the repo page. Click the **branch menu** and choose **`staging`**.
2. Press the **`.`** (period) key on your keyboard. The web editor opens (it's github.dev: VS Code in the browser).
3. Click the branch name in the bottom-left corner → **Create new branch...** → type a name like `feat/1-1-leave-requests` (your task number and a short name) → Enter. Check the branch name at the bottom-left shows your new branch.
4. For each file Claude gave you:
   - **New file:** in the left file list, right-click the folder → **New File** → type the name → paste the code.
   - **Existing file:** open it, select everything (Ctrl+A / Cmd+A), paste the new complete version.
   - Check the path matches what Claude said, character for character. A file in the wrong folder is the most common mistake.
5. Click the **Source Control** icon on the left (the branch symbol). Type a short message like "Add leave request form". Click **Commit & Push**.

### 5. Open a draft PR
1. Go back to the repo page on GitHub. A yellow banner shows your branch with **Compare & pull request**. Click it.
2. **Check "base" is `staging`**, not `main`. This is the one setting you must check every time. If it says `main`, click it and change it.
3. In the description write "Closes #NUMBER" (your issue number). Fill in the checklist honestly.
4. Click the arrow beside the green button and choose **Create draft pull request**.

### 6. Wait for the checks, then fix what fails
- At the bottom of your PR, wait for the checks. They take a few minutes.
- **Green ✓:** good.
- **Red ✗:** click **Details**, copy the error text, paste it to Claude: *"This failed on GitHub. Fix it and give me the complete corrected files."* Put the new files in the same branch (the same steps as above, in the same branch) and push again.
- If it fails twice in a row, message the owner.

### 7. Write test steps for the owner
You can't run the app, so the owner will test your feature for you. In the PR description, under a heading **"How to test"**, write numbered steps in plain words: who to sign in as (manager or employee), where to click, and what should happen. Include the wrong-input cases ("leave the dates empty: an error should appear"). Ask Claude: *"Write the How to test steps for the owner, based on what we built."*

### 8. Ask for review
When the checks are green and your "How to test" steps are in, click **Ready for review** on the PR and message the owner with the PR link. The owner reviews the code, tests it on the staging site, and may leave comments. Paste each comment into your Claude chat: *"The reviewer said: ... Fix it and give me the complete files."* Push the changes to the same branch. The owner merges it when it's good.

## Hard rules (the app depends on these)

- **Never** use or ask for anything for the real company database (`checin-d172e`).
- **Never** put passwords, keys or `.env` contents in GitHub, a PR, a comment, or a group chat.
- **Never** push to `main` or `staging` directly, and always check the PR's base is `staging`.
- **Never** add GPS or location features. ChecIN checks people in with the kiosk QR code only.
- **One task per branch.** If you think of something else, comment it on the issue.
- Don't edit these files, even if Claude suggests it: `AGENTS.md`, `firestore.rules`, `AppShell.tsx`, `auth.tsx`, anything in `api/admin/`, `routeTree.gen.ts`. Put it under "Needs the owner" in your PR instead.

## Stop and ask the owner when

- Claude says it needs to change database rules, user roles, sign-in, or payments.
- Claude wants a new package installed.
- The checks fail twice in a row.
- You see data that looks real (real names or emails).
- You're not sure something is safe. Asking costs a minute; a mistake can cost the company's data.

## When you're stuck

Message the owner with: the issue number, the PR link, what you asked Claude, and the exact error (copy-paste or screenshot).
