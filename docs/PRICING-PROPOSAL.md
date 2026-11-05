# Pricing: the decision, the numbers, and what must exist before anyone is charged

**Status: proposal for the owner. The numbers are a starting point to test with real customers, not a market-proven price.** The public page already shows them (see "What changed on the page"). Lines marked **[CONFIRM]** need your decision.

## What you decided

| Question | Your answer |
|---|---|
| How is ChecIN priced? | **Per person, per month** (you were unsure which was feasible; this is the one the product is already shaped for, see below) |
| Currency | **US dollars** |
| Free offer | **A free trial only, no free plan** |
| What separates the plans | **Features** |

## Why per person, per month is the feasible one

- **The product already counts people.** An organization's headcount is known, and the dashboard shows it. A flat price by company size would need bands, and a company at the top of a band pays the same as one at the bottom.
- **Cost grows with people, so price should too.** What ChecIN costs to run is the database work each person causes: about two check-ins a day. Per person is the model where income rises when cost rises.
- **It is the easiest to say on one page,** and it matches the design notes (`SYSTEM-DESIGN.md`, `SCALE-PLAN.md`), which already assume per-seat pricing.

## The plans

Prices are **per person, per month, in US dollars**. Yearly billing takes **20% off** (the figure on the page is the monthly equivalent). Every plan starts with a **14-day free trial of every feature**.

| | **Starter** | **Growth** | **Enterprise** |
|---|---|---|---|
| Monthly | **$4** | **$8** | Let's talk |
| Yearly (per month) | **$3.20** | **$6.40** | |
| QR check-in and check-out at the entrance | yes | yes | yes |
| Live Today view (who is in, late or away) | yes | yes | yes |
| Late arrival review with excuses | yes | yes | yes |
| Leave requests and approvals | yes | yes | yes |
| Announcements and notifications | yes | yes | yes |
| Holiday calendar and departments | yes | yes | yes |
| Attendance register and leave reports (CSV, PDF) | yes | yes | yes |
| Shifts: rota, repeating patterns, swaps | | yes | yes |
| Unpaid breaks with paid time in reports | | yes | yes |
| Work from home days | | yes | yes |
| Attendance analytics and trends | | yes | yes |

Everything above is **built and on staging today**. The page lists nothing that is not built. The plan names are the ones the app already stores (`growth` is what every new organization's trial is labelled).

**Not offered yet, so not on the page.** These were in the old template text or the old roadmap table and do not exist: leave balances and types, overtime, payroll exports, scheduled report emails, sign-in through a company directory (SSO, SCIM), integrations with payroll or HR systems, regional compliance packs, an uptime promise (SLA), and the work-from-home diary (engine and routes only, no screens). When one ships, add it to the right plan in `src/lib/pricing.ts`, which is the only place features and prices are written down. **[CONFIRM]** where each belongs when it ships (my suggestion: leave balances, overtime and the diary in Growth; scheduled reports and anything for large companies in Enterprise).

This **replaces the old tier table** in `ChecIN-V2-Feature-Roadmap.md`, which put shifts and reports in Enterprise only. Those are built now, and a company running shifts is exactly who Growth is for.

## Why these numbers

- **They start from the price already on the page ($8 and the 20% yearly discount).** Growth stays at $8. Starter used to be free, so it needed a paid price: $4 is half of Growth, low enough to be an easy yes for a small team and high enough that it is not free in disguise.
- **Cost is not the limit.** I have not measured cost per person: the load test (`docs/LOAD-TEST.md`) has never been run to produce numbers. From the code, a person's day is about two scans of a handful of database operations each, so the database cost is, by a rough estimate, **well under a cent per person per month**. Hosting and sign-in are small fixed costs on top. **This is an estimate, to be confirmed by running the load test before you rely on it.** So price should follow the value a company gets, not our cost.
- **What I could not check:** what competing attendance products charge in your market, and what your first customers will pay. I did not guess at either. **[CONFIRM]** test $4 and $8 with the first pilot companies, and change them if they say yes too easily or too fast.
- **A rough feel:** a team of 50 pays $200 a month on Starter or $400 on Growth ($160 and $320 paid yearly).

## What must exist before anyone is charged

None of this is built. **Today there is no billing at all, and the 14-day trial is only a label stored when an organization signs up; nothing ends it.**

1. **A payment provider that works for your business and takes US dollars.** **[CONFIRM]** Stripe is the usual choice, but it may not be available for a business registered in Ghana: check before building. Paystack and Flutterwave are common local alternatives. Which one decides how billing is built, so decide this first.
2. **Plan gating** (task 0.5): the server must check a company's plan before it allows a Growth-only feature, from one table (`src/lib/pricing.ts` is where it will read), never route by route. Today every feature is open to every organization.
3. **A real trial:** a stored end date, a reminder before it ends, and what happens at the end (read-only, or locked until they pay). **[CONFIRM]** what happens to a company that does not pay.
4. **Counting people.** **[CONFIRM]** who counts as a "person": everyone with an account, including managers and admins, or only people who check in? My suggestion: everyone with an active account, counted each billing day, so the price is simple to explain.
5. **Money details:** invoices or receipts, what happens when a payment fails, changing plan mid-month, tax (VAT or sales tax where it applies), and refunds. **[CONFIRM]**
6. **The paid Firebase plan (Blaze)** must be switched on before the first paying customer (it is noted in `OPERATIONS.md`).
7. **Terms and Privacy must agree with this.** The Terms proposal (section 6, price and payment) can now be filled in from this document, and what happens to records when a company stops paying must match the retention period in the Privacy Policy.

## What changed on the page (in this PR)

- The pricing section now has **Starter ($4), Growth ($8) and Enterprise (Let's talk)**, with a monthly or yearly switch (yearly is the default, as before) and a **14-day free trial** button on both paid plans.
- **Removed:** the free plan ("Free up to 15 employees"), and every promise that does not exist (SSO, SCIM, payroll and HR integration, regional compliance, dedicated account manager, volume pricing and a guarantee, "multi-manager workgroups", "email support", leave balances).
- The heading and subtitle no longer use the template's words.
- The sign-up form line now says "Includes a 14-day free trial of every feature. No credit card required." (it used to name the Growth plan).
- Prices and plan features live in `src/lib/pricing.ts`; 11 tests keep the page, the numbers and the "only what is built" rule in step.
- **Enterprise** only lists "Everything in Growth" and an honest invitation to tell us what you need. It uses the support address the page already had, which I could not verify exists. **[CONFIRM]**

## Decisions I need from you

1. Are $4 and $8, with 20% off yearly, the numbers you want to launch with?
2. Is a 14-day trial right (it is what the app already says), and what happens when it ends?
3. Which payment provider, and is it available to your business?
4. Who counts as a "person" for billing?
5. Is the Enterprise contact address real, and who answers it?

When these are settled, the next work is plan gating and the trial end date, then billing.
