# ChecIN: Email Strategy

Status: **draft for the integrator's approval. No code until agreed.** Companion to [NOTIFICATIONS-DESIGN.md](NOTIFICATIONS-DESIGN.md), which covers email as a *notification channel* (section 7). This file covers email as a whole: who we email, why, from where, and what the law and the inbox providers require. Security rules in [AGENTS.md](../AGENTS.md) are fixed inputs.

## 1. Who we email (three groups, never mixed)

| Group | Who | Relationship | What we may send |
|---|---|---|---|
| **A. Customers' admins** | Org admins and managers who run ChecIN (they pay or trial) | We have a business relationship | Product notices, onboarding, billing, tips, newsletters (with an unsubscribe) |
| **B. Employees (end users)** | People who check in with ChecIN because their employer chose it | **They are not our customers.** They never chose ChecIN. | **Transactional only**: invites, account and security notices, the notifications their employer's setup triggers. **Never marketing.** |
| **C. Prospects** | Someone who asked for a demo, joined a waiting list, or filled the website form | They asked us to contact them | A reply to what they asked, a short follow-up sequence, then newsletters only if they said yes |

The rule that protects us: **employee email addresses never go into a marketing list.** An employer gave us those addresses so the product works, not so we can advertise.

## 2. Three kinds of email, kept apart

| Kind | Examples | Sent from | Can the person unsubscribe? |
|---|---|---|---|
| **Transactional** (must be sent) | Invite, password reset, email verification, security alert, receipt, payment failed, the notifications in NOTIFICATIONS-DESIGN.md | `notify.checin.app` | No for security and billing; yes for optional notifications (preference screen) |
| **Lifecycle** (tied to what the customer is doing) | Welcome, "finish setup", trial day 3 tip, trial ending, "you have not paused your first kiosk yet" | `hello.checin.app` | Yes, one click |
| **Marketing** (we choose to send) | Newsletter, product launch, case studies, event invite | `news.checin.app` | Yes, one click, plus a visible link in every email |

**Why separate sending addresses:** inbox providers (Gmail, Outlook, Yahoo) judge each sending address by how recipients react. If a newsletter gets complaints, it must never drag down a password-reset email. Three subdomains, three reputations. Each gets its own SPF, DKIM and DMARC records and its own stream or API key at the provider.

## 3. Build or buy

**Do not build marketing email.** A mailing tool already handles lists, segments, templates, unsubscribe pages, bounce handling, spam complaints, analytics and legal footers. Building these is a large, risky project that adds nothing to attendance.

| Need | Recommendation | Why |
|---|---|---|
| Transactional (A, B, C) | A transactional provider such as **Resend** or **Postmark**, called from our server | Fast, reliable delivery; one API; separate message streams |
| Lifecycle and marketing | A marketing tool such as **Brevo**, **MailerLite** or **Loops** (check current prices and Ghana support before choosing) | Lists, segments, automations and unsubscribe handled for us |
| Receiving mail (support@, hello@) | A hosted mailbox such as **Google Workspace** or **Zoho Mail** on `checin.app` | People reply to emails; replies must land somewhere a human reads |
| Invoices and receipts | Whatever the billing provider (task 1.7) sends | Do not duplicate; just make sure its sender is on our domain |

Both groups of tools sit behind our own small interface (`src/lib/email.server.ts`) so a provider can be swapped without touching the rest of the code.

## 4. Where customer data lives

- **Source of truth for accounts** stays in ChecIN (Firebase). Group A and B emails come from verified accounts only.
- **The marketing tool holds only what marketing needs:** email, first name, organization name, plan, trial end date, and consent. **Never** attendance data, locations, shifts or anything about employees.
- **Sync is one-way and server-side:** a small server route pushes a Group A contact to the marketing tool when an org admin signs up, changes plan, or unsubscribes. Group B is never synced.
- **Prospects (Group C)** come from the website form. The form posts to a server route that is rate-limited with the Firestore-backed limiter, validates the address, stores a lead in an Admin-SDK-only `leads` collection (email, name, company, message, source, consent, date), and adds them to the marketing tool only if they ticked the consent box.
- Secrets (`EMAIL_API_KEY`, `MARKETING_API_KEY`, webhook signing keys) live only in environment variables, required at startup when the feature is on. No real key ever appears in a file.

## 5. Consent, unsubscribe and the law

Ghana's Data Protection Act, 2012 (Act 843) applies to personal data of people in Ghana, and customers abroad bring in their own rules (for example GDPR in Europe, CAN-SPAM in the United States). **This is not legal advice; have a lawyer review the privacy policy and consent wording before the first marketing email.** The practical rules we build to, which satisfy all of them:

1. **Ask, and record it.** For marketing, a checkbox that is not pre-ticked, saved with the date, the wording shown and the source.
2. **One-click unsubscribe in every non-transactional email**, plus the `List-Unsubscribe` header that Gmail and Yahoo now require from bulk senders. Honour it immediately; never re-add someone who left.
3. **A real postal or business address and a clear sender name** in every marketing email.
4. **A shared suppression list.** If an address bounces hard, complains, or unsubscribes, it is blocked for that stream everywhere, and the block survives a re-import.
5. **No purchased or scraped lists.** Ever.
6. **A "delete my data" path:** we can remove a person from the marketing tool and the `leads` collection on request.
7. **Employees are transactional-only.** An employer cannot consent to marketing on an employee's behalf.

## 6. Deliverability (getting into the inbox, not spam)

- **DNS on each sending subdomain:** SPF, DKIM, and DMARC (start with `p=none` and reports, tighten to `quarantine` once reports look clean).
- **Warm up:** new sending addresses start with low volume and grow over a few weeks; do not send a large newsletter on day one.
- **Hygiene:** verified addresses only for transactional; remove hard bounces immediately; pause a stream if bounces pass about 2% or complaints pass about 0.1% (the thresholds inbox providers watch).
- **Plain, honest subject lines** and a real reply-to address that a human reads.
- **A DMARC report address** so we notice if someone spoofs `checin.app`.
- **Monitor:** the providers' dashboards, plus Google Postmaster Tools for the domain once volume is meaningful.

## 7. Which emails exist (starting catalog)

| Email | Group | Kind | Trigger | Phase |
|---|---|---|---|---|
| Verify your email | A, B | Transactional | Sign-up or email change | with task 1.4 |
| Staff invite | A, B | Transactional | Admin or manager invites someone (replaces copying a link by hand) | E1 |
| Password reset | A, B | Transactional | User requests it | E1 |
| Security notice (new sign-in, password changed, role changed) | A, B | Transactional | Account events | E1 |
| Notification escalations (unread leave decision, shift change) | B | Transactional | Per NOTIFICATIONS-DESIGN.md | E1 |
| Welcome and "set up your first location" | A | Lifecycle | Org created | E2 |
| Trial: day 3 tip, day 10 reminder, trial ending, trial ended | A | Lifecycle | Trial clock | E2 |
| Payment receipt, payment failed, plan changed | A | Transactional | From billing | with task 1.7 |
| Demo request received, and your follow-up | C | Transactional then Lifecycle | Website form | E2 |
| Newsletter, product updates | A, C (consented) | Marketing | Chosen by us | E3 |

## 8. Safeguards in our code

- **No free-text sending to arbitrary addresses.** Every email is a catalog entry with a template; recipients are looked up server-side from verified accounts in the right organization (the same wrong-audience tests as NOTIFICATIONS-DESIGN.md 8.1).
- **Per-org and global daily caps** for each stream; **fail closed** if a counter cannot be read.
- **Webhook endpoints** (bounces, complaints, unsubscribes) verify the provider's signature, are rate-limited, and only update suppression state.
- **Links in emails never sign you in.** They open the normal login page. This avoids teaching people to trust email links and stops forwarded mail leaking access.
- **Prospect form abuse:** rate limit, hidden honeypot field, and a bot check, so the form cannot be used to spam strangers through us.
- **Kill switch** per stream (`EMAIL_TRANSACTIONAL_PAUSED`, `EMAIL_MARKETING_PAUSED`).
- **Log without leaking:** log the event, the stream and an id, never the message body or the full address.

## 9. What "working" means

| Measure | Target |
|---|---|
| Transactional delivered to inbox (not spam) | At least 98% |
| Hard bounce rate | Under 2% |
| Spam complaint rate | Under 0.1% |
| Unsubscribe requests honoured | 100%, immediately |
| Marketing emails reaching an employee address | Zero |

## 10. Delivery order

| Step | What | Done when |
|---|---|---|
| **E0** | Buy domains; create mailboxes (`support@`, `hello@`); add DNS for the three subdomains; choose providers | Test emails from each subdomain pass SPF, DKIM and DMARC and land in a Gmail inbox, not spam |
| **E1** | `email.server.ts` with a fake sender for tests; transactional emails (invite, reset, security, notification escalation); webhook for bounces | Tests pass; an invite arrives in a real Gmail and Outlook inbox |
| **E2** | Website form to `leads`; sync of Group A to the marketing tool; welcome and trial sequences; unsubscribe and consent records | A new trial org gets the welcome, tip and ending emails on schedule; unsubscribing stops them |
| **E3** | Newsletters from the marketing tool; consented prospects only | Lawyer has reviewed the privacy policy; the first send goes to a small test segment |

E1 overlaps N3 in NOTIFICATIONS-DESIGN.md: they share one provider, one interface and one set of caps.

## 11. Decisions needed from the integrator

1. **Mailbox host:** Google Workspace or Zoho Mail for `support@` and `hello@` (needs the domain first).
2. **Providers:** confirm Resend or Postmark for transactional, and pick a marketing tool after comparing price and Ghana-friendly support.
3. **Who owns marketing content:** who writes the newsletter and approves lifecycle wording?
4. **Prospect form:** is there a public website yet? If not, the first form can live on a simple page on `checin.app`.
5. **Legal review:** who reviews the privacy policy and consent wording before E3?
6. **Language:** English only at first?
