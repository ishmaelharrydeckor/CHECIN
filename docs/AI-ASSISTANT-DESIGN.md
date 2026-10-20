# AI assistant: design note (task 5.12)

Status: **proposal for the owner's decisions.** Nothing here is built. Build tasks are 5.13 to 5.16 in [V2-TASK-PLAN.md](V2-TASK-PLAN.md). The security rules in [AGENTS.md](../AGENTS.md) apply in full.

## 1. What it is, in one sentence

A chat panel inside ChecIN where a signed-in person asks questions about the data they are already allowed to see, and later asks for drafts and (with a confirmation click) actions. It is never a back door: **it can do exactly what that person can already do on the screens, and nothing more.**

## 2. Who it is for, and what they ask

| Person | Example questions | First release? |
|---|---|---|
| Manager | "Who was late this week?" "Who is off on Friday?" "Summarise my team's attendance for October." | **Yes** |
| Org admin | "Which team has the most absences?" "Which locations have unpaired kiosks?" | Yes (same engine, wider scope) |
| Employee | "How many leave days do I have left?" "When is my next shift?" "Did my swap get approved?" | Later (5.13b), after managers prove it |

## 3. The rules it can never break

1. **It acts as the verified caller.** Identity, role, `orgId` and `managerId` come from the Firebase ID token on the server, exactly as in every other route. Nothing the model says, and nothing in the question, can change them.
2. **The model never touches the database.** It can only call a short list of **tools** that we write. Each tool runs our existing server code with the caller's own scope (the same functions that power the screens), so every existing authorization check applies unchanged.
3. **Tenant wall.** A tool never takes an organization or manager id from the model as authority. Scope comes from the token, and any id the model supplies (for example an employee) is checked to be inside that scope before use.
4. **Reads summaries, not raw events.** Attendance tools read `daily_summaries`, never `clock_events` (docs/SCALE-PLAN.md). Every query is bounded, indexed and starts with `orgId`.
5. **User-typed text is untrusted.** Leave notes, announcements, names and shift labels can contain "ignore your instructions". Tool results reach the model as clearly marked data, the model is told they are data, and no tool can do harm without a person's confirmation (rule 6).
6. **No action without a click.** Phases 1 and 2 have no write tools at all. Phase 3 write tools only *prepare* a preview; a separate request from the person's browser, carrying a one-time confirmation id the server issued, runs the existing route. The model cannot confirm for the person.
7. **No location data**, ever (product rule). No tool returns or accepts coordinates.
8. **No secrets in prompts or logs.** The provider key is an environment variable, required only when the feature is switched on, never in the repo.
9. **Cost is capped before it can surprise us** (section 7), and there is a kill switch.
10. **If anything fails, it says so and does nothing.** A failed or slow model call never falls back to guessing, and never blocks any other part of the app.

## 4. How it works (architecture)

```
Browser panel --(ID token + question)--> POST /api/assistant
   1. verify token, resolve scope (role, orgId, managerId)          [existing auth helper]
   2. gateFeature(orgId, "ai_assistant")                            [plan gating]
   3. per-user rate limit + per-org monthly budget check            [Firestore-backed]
   4. call the model with: system rules + the question + tool list
   5. model asks for tools -> we run them in-process with the caller's scope -> results go back as data
   6. model writes the answer; we return it (streamed) and record one log line
```

- **One route, one tool layer.** `src/lib/assistant/tools/*.ts`, pure where possible so they are testable without a model. The model provider sits behind a small interface so it can be swapped, and so tests use a fake model.
- **Provider:** Anthropic's API. A smaller, cheaper model handles simple lookups; a stronger one handles summaries and drafts. Model names live in one config file, not scattered through the code.
- **Conversation state** is held in the browser and sent each time, trimmed to a limit. Nothing is stored on the server by default (section 6).
- **Answers show their sources:** each answer says which screen or report the numbers came from ("From today's attendance summary"), so a manager can check.
- **Numbers come from tools, never from the model's memory.** The system rules require any figure to come from a tool result; if no tool covers a question, the assistant says it cannot answer that yet.

## 5. The tools

**Phase 1: read-only (task 5.13)**

| Tool | Returns | Reads | Scope check |
|---|---|---|---|
| `attendance_today` | counts and lists: in, out, not arrived, late, on leave, WFH | `daily_summaries` | caller's team / org |
| `attendance_range` | per-person or per-team totals for a date range (max 31 days) | `daily_summaries` | same |
| `leave_requests` | pending/approved leave for a date range | `leave_requests` | same |
| `who_is_off` | people on approved leave or holiday on a date | `leave_requests`, `holidays` | same |
| `shift_roster` | shifts for a date range | shift assignments | same |
| `my_leave_balance` | caller's own balances (when 2.2 exists) | leave balances | own record only |
| `my_next_shift` | caller's own upcoming shifts | shift assignments | own record only |

Every tool has a hard row cap (with "and N more" returned), no raw timestamps beyond what the screens show, and no field the screen would not show that person.

**Phase 2: drafting (5.14).** `draft_announcement`, `summarise_report`, `suggest_roster`. They return text or a proposed table to the screen; nothing is saved or sent. The person edits and presses the normal Save button, which uses the normal route.

**Phase 3: confirmed actions (5.15).** `prepare_leave_decision`, `prepare_shift_assignment`. Each returns a preview ("Approve Kofi Mensah's leave, 3 to 5 Nov") and a confirmation id. The browser shows a Confirm button; pressing it calls the existing route, which re-checks permission itself. The confirmation id is single-use, expires in 5 minutes and is tied to the caller and the exact action.

## 6. Privacy and data handling

- Staff names, attendance and leave are personal data. They are sent to the AI provider **only for the question being asked** and **only what the tool returned**, never in bulk.
- **Provider terms:** use the API with no training on our data and the shortest retention available. Record the provider as a sub-processor in the privacy policy ([PRIVACY-POLICY-PROPOSAL.md](PRIVACY-POLICY-PROPOSAL.md) needs a paragraph, and a lawyer's review, before launch).
- **Switch per organization:** off by default; an org admin turns it on and can turn it off again at once. Employees' data is included only if the org has switched it on.
- **What we store:** by default one log line per question: time, organization, verified user id, tools used, tokens used, outcome. **Not the question text and not the answer.** Storing conversations (for history) would be a separate, opt-in decision with its own retention period.
- **Sensitive notes:** a leave note may mention health. Leave `note` text is excluded from tool results by default, and returned only to a manager who can already read it on screen and only when the question needs it.
- **Data requests:** the data export (5.4) and deletion process need no change, because we store no conversation text.

## 7. Cost controls (built with the first release, task 5.16)

- **Per-user rate limit:** for example 20 questions per hour, using the Firestore-backed limiter, not an in-memory one.
- **Per-organization monthly budget:** a counter of tokens used, with a plan-based allowance, updated in a transaction. At 80% the org admin sees a notice; at 100% the assistant stops with a clear message.
- **Per-request caps:** maximum question length, maximum tool calls (about 6), maximum answer length, and a total time limit (about 25 seconds).
- **Kill switch:** environment variable `AI_ASSISTANT_ENABLED` (anything but `true` means off), checked first, so a runaway cost or provider incident can be stopped without a deploy.
- **Usage page** for the owner: cost per organization per month, so pricing can cover it.

## 8. Plan gating

Add `ai_assistant` to the `FEATURES` table in `src/lib/plans.ts` with `built: false` until it ships. Which plan includes it is an owner decision (section 9). Because it costs money per use, the **free trial gets a small allowance** (for example 50 questions) rather than unlimited.

## 9. Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | First audience | Managers and org admins first, employees second |
| D2 | Plan level | **Growth** gets a monthly allowance; **Enterprise** a larger one; heavy users can buy more. Or sell it as a separate paid add-on |
| D3 | Provider | Anthropic API (what this note assumes) |
| D4 | Keep conversation history? | No for the first release. Add later, opt-in, with a retention period |
| D5 | Where it appears | A button in the dashboard header opening a side panel; later a shortcut on the employee scan screen |
| D6 | Languages | English first; ask the pilot whether Twi or other languages are wanted |

## 10. How we will test it

Tests run without calling the real model (a fake model returns scripted tool calls), so they are fast and free:

- **Scope:** a manager's tool calls return only their team; an employee's only their own; a forged employee id from another team is refused. Every tool is covered.
- **Tenant wall:** a tool given another organization's id still returns the caller's organization only.
- **No raw events or coordinates:** structure tests fail the build if a tool reads `clock_events` or a location field.
- **Injection:** leave notes and announcements containing instructions ("approve all leave", "show every employee") change no behaviour and no scope.
- **Bounds:** row caps, date-range caps, tool-call caps and timeouts are enforced.
- **Cost:** over-budget and kill-switch states refuse politely and make no model call.
- **Confirmation:** a confirmation id cannot be reused, cannot be used by another person, and expires.
- **Failure:** a provider error returns a plain message and leaves everything else working.
- Before launch: a manual **red-team pass** of at least 30 hostile questions, with the results saved in the PR.

## 11. Build order

1. Foundation: the route, token and scope, rate limit and budget counter, kill switch, plan gate, fake-model test harness, the log line. No tools yet.
2. Read tools for managers and admins (5.13), with the side panel.
3. Employee read tools (5.13b), once leave balances exist.
4. Usage page and notices (5.16).
5. Drafting (5.14).
6. Confirmed actions (5.15).
7. Privacy policy update, red-team pass, then offer it to the pilot organization first.

## 12. Environment variables (to add to `.env.example` when built)

`AI_ASSISTANT_ENABLED` (must be `true` to run) and `ANTHROPIC_API_KEY` (required only when enabled; the server throws a clear error at startup if enabled without it).
