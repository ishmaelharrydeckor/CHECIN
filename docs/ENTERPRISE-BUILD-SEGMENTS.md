# Enterprise build: what can start now, and what waits on something outside the code

Companion to Phase 5 in [V2-TASK-PLAN.md](V2-TASK-PLAN.md). The point of this page: **never get blocked by a purchase.** For every feature that needs a domain, an account or a customer, it says how to build it now and what changes later.

## The rule that makes this work

Anything that depends on a domain, an email service or a vendor account is built behind **one setting or one small interface**, tested with a fake or sandbox, and switched to the real thing later by changing a value, not code:

- Our public address comes from one setting (`VITE_APP_ORIGIN` on the page side, a server setting for emails and callbacks). No address is written into code.
- Email goes through one `sendEmail()` function with a provider behind it. Tests use a fake that records messages. Staging can use the provider's free test mode.
- Each outside vendor (payments, error tracker, AI model, identity provider) sits behind an interface with a fake used by tests.

## Gate 0: clear these before any Enterprise feature starts

Enterprise features build on the core product, so the core is finished first. Nothing below needs a purchase except where marked.

| # | Item | State | Needs from you |
|---|---|---|---|
| 1 | Plan gating (0.5) | PR #160 open; wire the remaining routes and locked screens | Merge #160 |
| 2 | Work-from-home diary | Employee page PR #154 unreviewed; manager screens and report/export columns not built | OK to review #154 |
| 3 | Phase 4 leftovers: menu count badges, Jump-to search, breadcrumbs, team roster cards, employee detail, reports hub, style-guide update, acceptance pass | Not built | None |
| 4 | Safety work: backups (#24), timezone fallback warning (#25), load test (#26), error alerts | Not done | #24 needs the Firebase **Blaze** plan (billing on); error alerts need a free error-tracker account |
| 5 | Tester rounds 5 and 6 | Checklists merged, not run | Testers' time |
| 6 | Stale issues (#13, #14, #16, #17, #21 to #26, #70) | Open | Your OK to close |
| 7 | Privacy, terms and cookie pages | Proposals open (#147, #148, #158) | Your decisions, then a lawyer |
| 8 | Pricing and trial-end behaviour | Open questions | $4 / $8 confirmation, what happens when a trial ends, who counts as a person |

## Segment A: can be built right now, nothing to buy

| Task | Feature | Notes |
|---|---|---|
| 5.3 | Audit trail | Append-only log written by the server; viewer and export for org admins |
| 5.4 | Full data export | Admin only, rate limited, logged in the audit trail |
| 5.5 | Leave types and balances (2.2) | Money-adjacent: approving decrements in a transaction |
| 5.7 | Overtime and payroll export file (3.2, 3.5) | Needs your sign-off on design #83 (a decision, not a purchase). Pay rules are settings per organization |
| 5.9 | Regional compliance packs | Rules stored as data per region, starting with Ghana. Needs a clear list of Ghana's rules; a lawyer or HR adviser should check them |
| 5.10 (part) | Tool for you to switch a feature on for one company | Server-only, logged |
| 5.12 to 5.16 | AI assistant (admins and managers, Growth plan) | Built with a fake model. Needs only an API key to go live (Segment C) |

## Segment B: needs a domain (or an address on one)

None of these is blocked: each is built against a setting and tested on the staging address. The domain is needed to **go live**.

| Task | Feature | Build now | Needs the domain for |
|---|---|---|---|
| 1.4 | Email verification and forgot-password by email | `sendEmail()` with a fake; templates; token flow | Sending from our own address (SPF/DKIM) so emails do not land in spam |
| 5.6 | Scheduled report emails (3.3) | Scheduler, report rendering, `sendEmail()` | Same sending address |
| 5.1 | SSO | OIDC/SAML flow built and tested on staging with a free Okta, Microsoft Entra or Google Workspace test tenant | The permanent sign-in callback address that customers register with their identity provider. Changing it later means every customer reconfigures |
| 5.2 | SCIM provisioning | Standard SCIM endpoints and per-organization tokens, tested with a scripted SCIM client | The permanent address customers paste into their identity system |
| 5.10 | Enterprise "talk to us" form | Form, storage, notification via `sendEmail()` | A real sales address |
| 5.11 (part) | Status page | Page content | A subdomain such as status.<domain> |
| Policies | Privacy, terms, cookie pages | Done as proposals | Real contact addresses, then lawyer review |

So: **SSO and SCIM are the two that really want the permanent domain first**, because customers store our address in their own systems. Buy the domain before any customer is onboarded to them. Everything else can be finished on staging and switched over by changing settings.

## Segment C: needs an account or a payment method (no domain needed)

| Item | What to open | Used for |
|---|---|---|
| Firebase **Blaze** plan | Billing on the Firebase project | Backups (#24), production readiness (#106), more than free-tier use |
| Payment provider (Paystack) | Business account; answer to "can a Ghana business charge USD and be paid out?" | Billing (1.7). Build against a payments interface; test with Paystack's test keys |
| Anthropic API key | Account with billing | The AI assistant to go live |
| Error tracker (for example Sentry, free tier) | Account | Error alerts (#24, 5.11) |
| Email provider (Resend, Postmark or similar) | Account; sending domain later | `sendEmail()` |

## Segment D: needs a real customer to define it

| Task | Feature | Why it waits |
|---|---|---|
| 5.8 | Live payroll / HRIS integration | Each system differs (Workday, BambooHR, Sage). Build the first one for the first customer who asks, using their sandbox |
| 5.7 (part) | Payroll file layout | The first customer's payroll software decides the columns |
| 5.9 (part) | Regions beyond Ghana | Add when a customer there signs |
| 5.11 | The written uptime promise (SLA) | A contract matter, after backups, alerts and the load test are in place |

## Order I suggest

1. Merge #160; finish plan gating (remaining routes, locked screens).
2. Clear Gate 0 items 2 to 6 while you make decisions on 7 and 8.
3. Start Segment A: audit trail, data export, leave types and balances, then overtime and payroll file.
4. In parallel, build Segment B against settings (email first, since email verification also needs it).
5. Open the Segment C accounts when each feature is ready to go live.
6. Buy the domain **before** SSO and SCIM, and before any policy page is finalised.
