# ChecIN: Notification Design

Status: **revision 2, draft for the integrator's approval. No code until agreed.** This is the design note [SCALE-PLAN.md](SCALE-PLAN.md) requires before anything touching presence. Security rules in [AGENTS.md](../AGENTS.md) are fixed inputs. Today's code is in [push-service.server.ts](../src/lib/push-service.server.ts) and `src/routes/api/push/*`.

Revision 2 changes: a simpler two-path engine (section 4), announcements read from their own record instead of being copied into every mailbox, wording kept in one catalog, a free fallback for the scheduler, a fake sender for tests, success measures, a real-phone check first, reminders and digests deferred, and **email and SMS as extra channels (section 7)**.

## 1. Goal in one sentence

When something happens that a person needs to know about, they find out reliably, once, quickly, and only if it is meant for them. A failure to notify must never break the thing that caused it (a check-in, an approval, a post).

## 2. What exists today, and what is wrong with it

| # | Finding | Effect |
|---|---|---|
| F1 | Unsubscribe passes `(uid, endpoint)` to a function that expects `(endpoint, uid)` ([subscribe.ts:82](../src/routes/api/push/subscribe.ts)) | Turning notifications off does nothing; the device keeps receiving |
| F2 | Announcement sends run after the reply with `.catch(() => {})` | On Vercel the function can be frozen once it replies, so sends are silently dropped, and nothing records that |
| F3 | Sending happens inline in the request that caused it | A slow or failing push service slows or breaks the business action |
| F4 | A broadcast reads every user, every preference and every subscription, then writes one inbox document and one subscription update per device | Cost grows with every recipient and a large send can exceed the function time limit |
| F5 | `orgId` and `managerId` on a subscription come from the client's `device` body | Violates "never trust the client"; not used for targeting today but must not become so |
| F6 | No retry, no record of what was sent, no delivery status | A failed send leaves no trace and cannot be re-run |
| F7 | No de-duplication | A retried request can notify twice |
| F8 | Logging out does not remove the device's subscription | On a shared phone the next person receives the previous person's notifications |
| F9 | Missing VAPID keys only log a warning | Push is silently off in a misconfigured environment |
| F10 | Only announcements and reports send anything | Leave, shifts, WFH and the like are silent; the inbox is nearly empty |
| F11 | No tests | Nothing stops the next change breaking delivery |
| F12 | No email or SMS sending exists anywhere in the code | Anyone who does not have the app installed or push allowed can never be reached |

## 3. Principles

1. **The inbox is the truth, every other channel is a nudge.** Every notification is saved in the person's inbox. Push, email and SMS only tell them to look. If every nudge fails, the person still sees it in the app.
2. **Never send inline.** The thing that happened records the notification in the same database write as the business change. Sending is a separate step that can fail and retry.
3. **Idempotent everywhere.** Ids are derived from what happened, so a retried request or a re-run step cannot notify twice.
4. **Who receives it is decided on the server**, from verified claims and the database, never from the request body (AGENTS rules 1 and 7).
5. **Producers say what happened, not what to write.** They pass a type and ids. The wording lives in one catalog in code. The only free text is an announcement the manager typed.
6. **Bounded and indexed.** Every query has a `limit`, starts with `orgId` (the cross-org sweeper in 4.3 is the one deliberate exception, and is bounded and indexed), and has an entry in `firestore.indexes.json` (SCALE-PLAN principle 1).
7. **No polling that reads the database.** The bell refreshes on open, on focus, and when a push arrives, never on a timer.
8. **Minimal content outside the app.** A lock screen, email or SMS shows a short line and a link, never another person's private details.
9. **Time is the org timezone**, computed on the server (`dayKey`).
10. **Every channel is behind one small interface**, so tests use a fake sender and a new channel is an addition, not a rewrite.

## 4. Architecture

### 4.1 Two paths

```
 PATH A: one person (leave decided, shift changed, report ready, ...)
 -------------------------------------------------------------------
 route does its work --(same write)--> inbox row for that person
                                       { push: "pending", escalateAt? }
 route replies --> waitUntil(send now) --> push to the person's devices
                                           --> row marked "sent" / "failed"
 sweep (every few min) retries rows still "pending" from the last hour

 PATH B: many people (announcement to a team or the whole org)
 -------------------------------------------------------------------
 route saves the announcement itself (it already does) + one broadcast job
 bell reads announcements directly (no copy per person)
 route replies --> waitUntil(run job) --> push to devices, one page of
 ~300 people per run, cursor saved --> sweep continues unfinished jobs
```

Path A has **no separate job collection**: the inbox row is itself the record of "this still needs sending". Path B has one small job per broadcast, only for the push step, because the "inbox" part of a broadcast is the announcement.

### 4.2 Producers and the catalog

A producer calls `notify({ type, orgId, audience, entityId, params })` from `src/lib/notify.server.ts`. It never imports `web-push` or any provider.

- `orgId` comes from verified claims. `audience` is `user(uid)` (Path A) or `team(managerId)` / `org` (Path B).
- `type` is a key in the **catalog** (`src/lib/notification-catalog.ts`). Each entry holds the title and body templates, the deep link, the urgency, the collapse tag, which channels apply (section 7) and which preference category it belongs to. Producers pass only `params` (for example the leave dates). Wording changes are one-file changes, and a buggy route cannot push text nobody approved.
- The inbox row id is `{type}_{entityId}_{uid}` and is created with `create()`, so a second identical call is a no-op (de-duplication).
- When the business change is a transaction or batch, the row goes in the **same commit**. If saving the row fails after a business success, the route logs the error and still succeeds.

### 4.3 Sending and the sweep

- **Right away:** after the route replies, `waitUntil` (from `@vercel/functions`) keeps the function alive until sending finishes (fixes F2).
- **Safety net:** `GET /api/cron/notify`, protected by `CRON_SECRET` (required at startup in deployed environments), does four small bounded jobs each run:
  1. Retry inbox rows whose push is still `pending`, created in the last hour (limit 200).
  2. Continue unfinished broadcast jobs (claim with a lease of about 60 seconds so two instances never run the same job).
  3. Run due **escalations** (section 7).
  4. Record `lastRunAt` in one small health document.
- **Who calls the sweep:** Vercel Cron every minute on the Pro plan. On any plan, a scheduled GitHub Actions workflow calling the same endpoint every 5 minutes works as a free fallback. The design works with either, so the plan choice does not block us.
- **Fairness and limits:** at most 3 pages per org per run so one big org cannot starve others. A failing job or row stops after 5 attempts and is parked as `failed`, logged, and shown in the admin health view.

### 4.4 Delivering to a person

For each recipient on the page:
1. Skip if their `orgId` is not the notification's `orgId`, or they have left the org (hard guard against crossing the tenant wall).
2. Read their preferences (batched `getAll`). Honour the master switch and the category switch. Urgent types ignore the category switch but still honour the master switch.
3. Send to each active device through the push channel (bounded concurrency about 40, 5-second timeout, collapse tag).
4. `201`: record nothing extra (removes today's per-device success write). `404/410`: deactivate the device. `429/5xx`: retry on the next sweep. Five consecutive failures deactivate the device.
5. Add counts (recipients, delivered, failed, expired) to the row or job.

### 4.5 Reading: the bell and unread count

- `GET /api/push/notifications` returns, from the verified token, the person's own inbox rows merged with announcements that apply to them (their org-wide ones and their manager's team ones), newest first, with a cursor and `limit`.
- `notification_state/{uid}` is one small document: `{ unread, seenBroadcastAt }`. Personal rows increment `unread`. For announcements, unread is a bounded count of announcements newer than `seenBroadcastAt`. Opening the bell updates it. One cheap read answers "how many unread".
- The service worker messages open tabs when a push arrives, so the bell updates with no timer.

### 4.6 Devices and subscriptions

- `orgId` and `managerId` on a subscription come from the **verified token** (fixes F5).
- Logging out unsubscribes that device (F8). A phone used by a different account is re-bound, because the document id comes from the endpoint.
- Removing someone from the org or changing their manager deactivates or re-binds their subscriptions. Targeting goes through `users` and claims, never through a role stored on the subscription.
- The Account page shows "this device: on / off" and **Send me a test** (a real end-to-end check).

## 5. What notifies whom (catalog)

v1 is deliberately small. Each is one catalog row plus one `notify()` call.

| Event | Audience | Path | Urgency | Collapse tag | Phase |
|---|---|---|---|---|---|
| Announcement posted | team or org | B | normal (important = high) | `announcement_{id}` | N1 |
| Leave requested | the employee's manager | A | normal | `leave_{id}` | N1 |
| Leave approved / denied | the employee | A | high | `leave_{id}` | N1 |
| Report or export ready | the requester | A | normal | `report_{id}` | N1 |
| Shift assigned or changed | the employee | A | high | `shift_{id}` | N2 |
| Manager changed / role changed | the employee | A | normal | `account_{uid}` | N2 |
| WFH approved / declined (if approval applies) | the employee | A | normal | `wfh_{id}` | N2 |
| Scan result | **no notification**: the phone's result screen already confirms it (SCALE-PLAN S3) | | | | never |

**Deferred until a pilot customer asks:** shift-start reminders, manager "not arrived" digests, missed-check-out nudges, kiosk-offline alerts. They need scheduled jobs and add real complexity for features nobody has requested. When they are wanted, they become new catalog rows plus a due-time field on Path A rows, using the same sweep.

Rules for the catalog: a notification must be actionable or informative to its recipient; no "someone checked in" chatter; managers get digests, never one push per employee.

## 6. Safeguards

- **Per-sender limit** on `/api/push/send` and announcements (Firestore-backed limiter keyed by uid).
- **Per-recipient cap:** at most 20 pushes per person per hour; beyond that, inbox only. The counter **fails closed**: if it cannot be read, send to the inbox only.
- **Size limits** (title 120, body 500, relative URLs only) move into `notify()` and the catalog so they apply to every producer.
- **Environment guard:** startup throws in a deployed environment if `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` or `CRON_SECRET` is missing (F9; AGENTS rule 3).
- **Kill switch:** `NOTIFICATIONS_PAUSED=1` stops sending without a deploy; inbox rows are still written.
- **Legacy switch:** `NOTIFY_ENGINE=legacy|jobs` keeps today's send path available until the new one is proven.

## 7. Email and SMS

### 7.1 The idea: the same notification, more ways to reach the person

"Gmail" here means **delivering to people's email inboxes** (Gmail, Outlook, company mail), not sending *from* a Gmail account. Sending from a personal Gmail account (app password, SMTP) is capped at a few hundred messages a day, is often blocked as spam, ties the product to a personal account and needs a secret nobody should keep. We use a transactional email provider (Resend, Postmark, Amazon SES or similar) with a verified company domain.

Both are **channels** behind the same interface as push. A catalog row says which channels apply and when. Three policies:

| Policy | Meaning | Example |
|---|---|---|
| `inbox+push` | Default. Nothing else. | Most things |
| `escalate` | Inbox and push now. If still **unread** after N minutes, send email (then SMS if critical and still unread). | Leave decision, shift change |
| `also-email` | Inbox, push and email together, because the person may not be in the app at all. | Invites, password-reset style notices, account/role change, a report that finished while they were away |

SMS is for a short list of genuinely critical events, never announcements by default.

### 7.2 Escalation (how "still unread" works)

A Path A row with an `escalate` policy gets an `escalateAt` time (for example 15 minutes after creation). The sweep's step 3 finds rows where `escalateAt <= now`, `readAt` is empty and `escalated` is false, then sends the next channel and sets `escalated`. If the person read it in the meantime, nothing is sent. The id of the email or SMS is derived from the row id, so a retry cannot send twice.

### 7.3 Contact details and consent

| Channel | Where the address comes from | Rules |
|---|---|---|
| Email | The account's **verified** sign-in email. Never an unverified address (it would bounce and damage the sending reputation). Depends on email verification, task 1.4 (integrator). | Unsubscribe link on non-critical email; bounce and complaint reports mark the address suppressed |
| SMS | The person adds a number on the Account page and **confirms it with a one-time code** sent by SMS (rate-limited, fails closed). Stored in `contact_channels/{uid}`, **Admin SDK only**, because phone numbers are personal data. | Explicit opt-in; "STOP" turns it off; only transactional text; number format E.164; re-verify if the number changes |

Contact details are never put in the `users` document (client-writable) and never returned to other users.

### 7.4 Security and content rules

- Provider keys (`EMAIL_API_KEY`, `SMS_API_KEY`, sender identity) come from environment variables, required at startup **only if that channel is enabled**. No fallback values.
- Provider webhooks (bounces, delivery receipts, STOP replies) are verified by the provider's signature, rate-limited, and update only suppression and delivery status.
- Email and SMS contain **no private details and no login links that sign you in**. They say what kind of thing happened and link to the normal app page, which asks for login. This stops a forwarded message from exposing anything and keeps us from teaching people to trust links in messages.
- Email is sent from one fixed address on a company subdomain (for example `notify.<company-domain>`) with SPF, DKIM and DMARC set up. SMS uses a fixed sender name. Consistent senders make phishing look-alikes easier for staff to spot.
- Recipients are resolved exactly as for push (section 4.4), including the organization guard.

### 7.5 Cost and limits (SMS especially)

SMS costs money for every message and email has a reputation cost for every bounce. So:
- **Per-org monthly SMS budget** and a **global daily cap**, enforced before sending, **failing closed** (inbox and push only when exceeded or when the budget cannot be read).
- **Per-person cap:** for example 3 SMS a day and 20 emails a day.
- **Decided: SMS and email are both billed add-ons**, tied to plan gating (task 0.5) and metered per org, so cost per seat is known before pricing (SCALE-PLAN section 4, per-seat pricing). Inbox and push stay free and are part of every plan.
- **Trial allowance (decided):** an organization on trial gets a small fixed allowance of each paid channel, for example 50 SMS and 500 emails in total (numbers to be set from the provider's real prices). When the allowance is used up, the channel pauses (inbox and push keep working) until the org subscribes to the add-on. Counted in one small `org_usage/{orgId}` document, fails closed.
- **Until billing exists (task 1.7):** the add-ons are switched on per organization by the integrator only, with the trial allowance as the cap. No org can enable them itself.
- Bounce rate above a threshold pauses email for that org and logs an alert.
- The admin health view shows counts per channel: sent, delivered, failed, suppressed, cost.

### 7.6 Build order for the channels

The channel interface and the fake sender are built in **N1**, with push as the first adapter, so adding email or SMS is a small separate PR. Email comes first (cheap, high value, no per-message fee at our scale). SMS follows only after a country and provider are chosen and a budget is agreed.

## 8. Failure modes

| What fails | Result | Recovery |
|---|---|---|
| Push service is down | Inbox still has it; retried on the sweep; may escalate to email | Automatic |
| Route replies, then the function is frozen | The inbox row (Path A) or job (Path B) already exists with push "pending" | Sweep picks it up |
| Two instances take the same job | Lease claim lets one run; ids are deterministic anyway | None needed |
| Saving the notification fails | Business change still succeeds; error logged with correlation id | Re-run from the log |
| Device dead or uninstalled | `404/410` deactivates it | Automatic |
| User turned push off or blocked it | Inbox only (or email/SMS if the policy and their consent allow) | Settings page explains how to re-enable |
| iPhone not added to Home Screen | Push impossible; inbox works | Existing prompt explains it |
| VAPID key rotated | Old devices fail and resubscribe on next open | Rotation steps in OPERATIONS.md |
| Sweep endpoint called by a stranger | Rejected without `CRON_SECRET` | None |
| Firestore quota reached | Sending backs off, rows wait | Move to Blaze (already planned) |
| Email provider down / bounces climb | Email retries; high bounce rate pauses email for that org | Alert in health view |
| SMS provider down or budget reached | SMS skipped (inbox and push still delivered) | Alert; budget reset or raised |

### 8.1 Worst cases and the guards that answer them

| Worst case | Guard (required) |
|---|---|
| **Wrong audience: reaches people it was not meant for, or crosses the org wall** | Recipients resolved only from `orgId` in verified claims and the database; every recipient's `orgId` re-checked before anything is written or sent. **Tests that must pass before N1 merges:** another org's user never receives it; a manager cannot target another team; a removed user is skipped; a record with a missing or mismatched `orgId` is rejected and logged. |
| **Notification storm** | Deterministic ids; 20 pushes per person per hour (fails closed); per-sender limit; collapse tags; `NOTIFICATIONS_PAUSED`. |
| **Quota or bill runs away, and check-ins fail because they share the quota** | Daily notification budget per org and global, enforced in the sender; over budget, rows wait and an alert is logged. A cloud billing alert before the first paying customer. Notifications never take priority over scans. SMS and email have their own budgets (7.5). |
| **System silently stops** | Alert if rows or jobs are pending more than 15 minutes past due while none completed; the sweep records `lastRunAt`; startup fails if `CRON_SECRET` is missing. |
| **One bad item blocks the rest** | Attempt cap of 5, then parked as `failed`; at most 3 pages per org per sweep run. |
| **Migration breaks announcements or leave, which work today** | `NOTIFY_ENGINE` switch; events move one at a time, each in its own commit. |
| **People expect a push and it never comes** | The inbox is the truth; per-device status and "Send me a test"; manager screens say "delivered to the inbox", never "everyone was notified". |
| **SMS or email abuse: someone makes the system message strangers, or runs up cost** | Recipients only from verified accounts in the same org; numbers must be OTP-verified; budgets and per-person caps fail closed; no free-text sending to arbitrary addresses. |
| **Email reputation damaged (the domain lands in spam)** | Verified addresses only; bounce and complaint suppression; DMARC; volume caps; separate sending subdomain. |

## 9. How we test it

- All sending goes through the channel interface. Tests use a **fake sender** that can succeed, time out, return "device gone" or "rate limited", so retries, expiry, escalation and budgets are tested automatically with no real phone or provider.
- The wrong-audience tests in 8.1 are required for N1. Tests also cover: duplicate call creates one notification, a read notification does not escalate, over-budget fails closed, an unverified email is never used.
- `npm test` keeps its rule against unbounded reads; the sweep queries are added to its allow-list explicitly with a reason.

## 10. What "working" means (measured, not assumed)

| Measure | Target |
|---|---|
| Delivery rate to active, allowed devices | At least 95% |
| Time from event to push | 95% within 10 seconds |
| Duplicates | Zero |
| Unread-but-escalated that were read within the hour anyway | Tracked (shows whether escalation delay is right) |
| Opt-outs after launch | Tracked; a rising number means we send too much |

N4 adds a notification scenario to the load-test harness ([LOAD-TEST.md](LOAD-TEST.md)). Until then these are targets, not claims.

## 11. Capacity

Cost of one org-wide announcement in a 2,000-person org (1.5 devices each):

| | Revision 1 (copy to every mailbox) | Revision 2 (read from the announcement) |
|---|---|---|
| Inbox writes | ~2,000 | 0 (the announcement is read directly) |
| Other writes | ~3,000 device updates + job | 1 job; device updates only on failure |
| Reads | ~7,000 | ~7,000 (users, preferences, devices) |
| Time to finish | One request, could exceed the limit | About 7 pages of ~300 people, resumable |

The big saving is writes and reliability. Reads stay about the same. These are model figures; N4 replaces them with measured ones.

| Trigger (measure first) | Add |
|---|---|
| An org above ~5,000 members broadcasting often | Skip reading every user: keep a per-org device list or page by device |
| More than ~100,000 notifications a day | Managed queue (Cloud Tasks / Pub/Sub) behind the same `notify()` |

## 12. Data and rules

| Collection | Access | Notes |
|---|---|---|
| `in_app_notifications` | Admin SDK only | Id `{type}_{entityId}_{uid}`; holds `delivery`, `readAt`, `escalateAt`, `escalated`, `expireAt` (30 days TTL, needs Blaze) |
| `notification_jobs` | Admin SDK only | New; Path B push jobs only; short retention |
| `notification_state` | Admin SDK only | New; one small doc per person |
| `push_subscriptions` | Admin SDK only | Claims-derived fields |
| `notification_preferences` | Admin SDK only | Add per-category switches; also holds which of email/SMS the person allows |
| `contact_channels` | Admin SDK only | New; verified phone numbers and suppression flags |
| `notification_health` | Admin SDK only | New; the sweep's `lastRunAt` and counters |

All default-deny with no client access (AGENTS rule 5). New indexes: `in_app_notifications (userId, createdAt desc)`, `in_app_notifications (delivery.push, createdAt)`, `in_app_notifications (escalated, escalateAt)`, `notification_jobs (status, leaseUntil)`, `push_subscriptions (userId, isActive)`.

## 13. Delivery order (each is one PR into `staging`, integrator-only)

| Step | What | Done when |
|---|---|---|
| **N0** | Fix F1, F5, F8, F9; `waitUntil` on the announcement send | Unsubscribe stops pushes; a missing key fails at startup; **a real announcement arrives on a real Android phone and a real iPhone with the app on the Home Screen, from a Vercel preview** |
| **N1** | `notify()`, catalog, channel interface with push adapter and fake sender, Path A and Path B, sweep route, scheduler (Vercel Cron or GitHub Actions), rules, indexes, health document; move announcements, reports and leave onto it behind `NOTIFY_ENGINE` | Killing the function mid-send still delivers; a retried request notifies once; wrong-audience, dedupe, paging, preference and expiry tests pass |
| **N2** | Bell and inbox UI with unread count, preference screen, "Send me a test", shift/account/WFH events | Works at phone width; unread count right after a push without a reload |
| **N3** | **Email channel** with escalation, bounce handling, unsubscribe, budgets | An unread leave decision becomes an email after the delay and not if it was read; bounces suppress; over-budget fails closed |
| **N4** | Limits, TTL, admin health view, load-test scenario, runbook in OPERATIONS.md, measured numbers replace the model in section 11 | Section 10 targets measured |
| **N5** | **SMS channel** with OTP verification, STOP handling, trial allowance and per-org budget, add-on gating | Provider tested on MTN, Telecel and AirtelTigo; cost per message known; first SMS event agreed (none in v1) |
| Later | Reminders, digests, kiosk-offline alerts | Only when a pilot customer asks |

Rollout for N1 onward: staging with the legacy switch on, then `jobs` on for staging and every event tested, then one pilot org in production, then everyone. N1 does not merge without the wrong-audience tests.

## 14. Decisions

**Decided by the integrator**
1. **Start market: Ghana.** SMS must reach MTN, Telecel (formerly Vodafone) and AirtelTigo numbers, so the provider is chosen for Ghana delivery, not global brand. Phone numbers are stored in international format (+233...).
2. **Billing: SMS and email are both paid add-ons**, with a small trial allowance (7.5). Push and inbox are included in every plan.
3. **Email events:** leave decisions and shift changes escalate to email if unread. Nothing uses SMS in v1.

**Recommended, awaiting a yes**
4. **Sending domain. Not bought yet (integrator, confirmed). `checin.app` and `getchecin.com` were both available when checked; plan is `checin.app` as the main address (email from `notify.checin.app`) and `getchecin.com` bought defensively and redirected.** Email (N3) is blocked until a domain exists; push, inbox and N0 to N2 are not affected. Buy the product domain **before real users install the app**, because an installed app and its push subscriptions belong to the address they were created on; changing the address later forces everyone to reinstall and re-enable notifications. Until then, `VAPID_SUBJECT` should be a real contact address, not the placeholder `checin.app`. Use the product's own domain (the one customers see) and send from a dedicated subdomain such as `notify.checin.app`. Keep the main domain's email separate so a spam problem on notifications can never block ordinary company mail. The integrator must be able to edit the domain's DNS records, because the email provider needs three records added (SPF, DKIM, DMARC). Avoid sending from a free Gmail or a customer's domain.
5. **Email provider.** A transactional service such as Resend or Postmark (simple setup, good inbox delivery). Amazon SES is cheapest at large volume but takes more setup; revisit at scale.
6. **SMS provider.** Choose one of the Ghana-focused providers (for example Hubtel, Arkesel or mNotify) with Africa's Talking or Twilio as a backup, behind the same channel interface so switching is a small change. **Not yet verified:** current prices, sender-name registration rules, and real delivery on all three networks. Before choosing, send test messages to numbers on each network and compare cost per message.
7. **Quiet hours** for non-urgent push and email: 21:00 to 07:00 org time; urgent ignores.
8. **Retention:** 30 days of inbox history.

**Dependency**
9. **Email verification (task 1.4)** must land before N3, because email goes only to verified addresses.
10. **A bought domain with editable DNS** must exist before N3 (email) and should exist before the first pilot users install the app.
