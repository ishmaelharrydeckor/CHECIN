# R1: HR and payroll market research (Cobberson)

**Why:** After attendance, we want to grow ChecIN into a fuller set of products: HR (people records, onboarding, leave, documents) and payroll. ChecIN must also connect to the HR and payroll tools companies already use. Before anyone designs or builds anything, we need to know how the existing platforms work and where they fall short, so we build for the gaps and not a copy.

**This is research only. No code, no app changes, no Firestore changes.** The deliverable is a written document.

## Ground rules

- Use **public information only**: vendor websites, pricing pages, help centres, API documentation, review sites (G2, Capterra, TrustRadius), app marketplaces, YouTube demos. Free trials are fine if you use your own email; never use ChecIN credentials, company data or real staff data.
- **Do not copy text** from vendor sites or reviews. Summarise in your own words. Quote at most one short phrase per source, with a link.
- Every claim needs a **link**. If you could not verify something, write "not verified". Pricing and features change; put the **date you checked** on each platform.
- No GPS, no location features, anywhere in what we propose (project rule).
- Do not put any secret, key or login in the document.

## What to research

**Part A: platforms (about 10 to 12).** Mix of: global (e.g. Workday, BambooHR, Rippling, Gusto, Deel, Zoho People / Zoho Payroll, Sage, Personio, HiBob), time-and-attendance tools (UKG/Kronos, Deputy, Homebase), and **local players for Ghana and the wider region** (find out what Ghanaian and West African companies really use; Excel and in-house systems count too). Pick the list yourself and justify it in two lines.

For each platform, one short profile:
1. Who it is for (company size, industries, countries) and **price per person per month**
2. Main modules (people records, onboarding, leave, performance, recruitment, payroll, benefits, documents, expenses...)
3. **How payroll works in it**: inputs (hours, leave, allowances, deductions), approvals, payslips, payment (bank file, mobile money?), statutory filings
4. **Where its attendance/time data comes from** (own clocking, imports, integrations)
5. **Integrations**: public API? marketplace? what it can import/export (CSV, API, webhooks)? What does a partner like ChecIN have to do to connect (partner programme, fees, approval time)?
6. What users **praise** and what they **complain about** (take from several reviews, summarise the themes)

**Part B: Ghana and region payroll realities.** What a payroll must handle there: PAYE income tax bands, SSNIT and Tier 2/3 pensions, other statutory deductions, filing deadlines, payslip requirements, mobile money / bank payments. Name your sources. Do the same briefly for one other market we may enter (Nigeria or Kenya, your choice). This is not legal advice; mark anything a payroll professional should confirm.

**Part C: the gaps.** Across all the profiles, answer:
- What do small and mid-size companies in our region still do by hand or in Excel, even though they have software?
- Where do attendance and payroll **fail to line up** today (late fixes, manual re-entry of hours, disputed overtime, leave not reaching payroll)? ChecIN already holds the verified attendance, shifts and leave, so this is our strongest angle.
- What is too expensive, too complex, or badly supported locally?
- What do companies need that none of the platforms do well?

**Part D: integration options for ChecIN.** From your findings, a ranked list of the 5 platforms we should connect to first, and for each: the likely method (file export, API, marketplace listing), how hard it looks, and why customers would care. Also list what we would need to **export** from ChecIN to feed a payroll (hours, overtime, absences, leave) in a form payroll people actually want.

## Deliverable

One file in the repo: `docs/HR-PAYROLL-RESEARCH.md`, sections matching Parts A to D, plus at the top a **one-page summary**: the 5 biggest gaps, ranked, and your recommendation for **which one or two products ChecIN should build first after attendance** (for example "leave and people records", or "payroll export and calculation") with the reasoning.

Also include a comparison table (platforms down the side; price, modules, public API yes/no, Ghana support yes/no, payroll yes/no).

## How to work

Use a normal Claude chat (a Claude Project with the research tool on works best): ask it to search the web, give it the Part list above, and **check its links yourself** before pasting; chat assistants sometimes invent facts or sources. Then follow `docs/TEAMMATE-GUIDE.md`: branch `docs/r1-hr-payroll-research` off `staging`, add the one file, open a PR into `staging`. Edit no other files.

## Done when

- All four parts are filled in, with a link and a "checked on" date for every platform
- Unverified claims are marked "not verified"
- The summary page ends with a clear first-product recommendation
- Nothing copied word for word; no secrets; no code

## What happens next

The integrator reviews it, and we use it to decide scope and write a design note (as we did for shifts and work-from-home) before any build. Note that payroll integrations and compliance packs are already on the plan as later Enterprise items (5.7 to 5.9 in `docs/V2-TASK-PLAN.md`); this research decides whether and how that grows into full HR and payroll products.
