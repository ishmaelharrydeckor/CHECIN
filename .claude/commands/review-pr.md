---
description: Review a teammate's pull request into staging against the ChecIN security checklist
argument-hint: <PR number>
---

Review pull request #$ARGUMENTS in this repo. The author is a non-technical teammate who built it in a normal Claude chat and pasted the code into GitHub through the browser. They never ran it. Treat it as untrusted, unrun code.

1. **Read the context.** `gh pr view $ARGUMENTS`, `gh pr diff $ARGUMENTS`, the linked issue (`gh issue view`), and `docs/REVIEW-CHECKLIST.md`, `AGENTS.md`, `docs/TEAM-TASKS.md` for that task's "Done when".
2. **Confirm the base branch is `staging`.** If it's `main`, stop and say so: it must be retargeted.
3. **Check CI** with `gh pr checks $ARGUMENTS`. If it failed, read the log (`gh run view --log-failed`) and explain the failure in plain language.
4. **Check out the branch** in a worktree or a clean checkout, `npm ci` if needed, and run `npm run check`. Report the real result. Note: `vite build` regenerates `src/routeTree.gen.ts`; if the branch added routes, commit the regenerated file to the PR branch only if the integrator agrees.
5. **Security pass** over the diff, using the checklist: identity/role/orgId/managerId from request input, role fields on Firestore docs, secrets, unauthenticated or unauthorized routes, missing rate limits, GPS code, rule changes. A violation is a blocker.
6. **Scope pass:** files outside the task, shared files touched (see CODEOWNERS), unexpected dependency changes, files that look pasted into the wrong path, leftover debug code or placeholder text, `console.log` of user data.
7. **Behaviour pass:** does it satisfy each "Done when" bullet? Empty/loading/error states, phone width for employee-facing screens, wrong-role access.
7b. **Style pass:** compare the diff with `docs/UI-STYLE-GUIDE.md`: only guide colors (grep for hex values and `bg-|text-` colors not in the guide), the standard page header/card/button/form/status-pill patterns, components from `src/components/ui/` (no hand-rolled buttons or cards), no inline `style=`, no new libraries, all four states present. Flag deviations as "Should fix" and name the reference screen to copy.
8. **Report** to the integrator in plain language, in this shape:
   - **Verdict:** ready to merge / fix needed / blocked.
   - **Blockers** (must fix), **Should fix**, **Nice to have**. Each with file:line.
   - **Shared-file changes the integrator must make** (menu entry, Firestore rule, etc.), with the exact code.
   - **A short message the integrator can paste to the teammate**, written for a non-technical person, including, where useful, the exact sentence to give their Claude chat ("Ask your Claude: ...").
9. Offer to push the small fixes to the PR branch. Do not push or merge without the integrator saying so.
