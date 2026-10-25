# HR and payroll: design note (proposal for the owner's decisions)

Status: **proposal.** Nothing here is built. It becomes tasks 7.1 to 7.18 in [V2-TASK-PLAN.md](V2-TASK-PLAN.md), Phase 7. It follows attendance, shifts, leave balances, overtime and the Enterprise features, because payroll is only as good as the hours and leave it is built on. The security rules in [AGENTS.md](../AGENTS.md) apply in full, and this note adds stricter ones for money and personal records.

## 1. What it is, in plain words

ChecIN already knows **who was at work, when, and on what shift**. HR and payroll use that to answer the two questions a company asks every month: **who are our people** (records, documents, joining and leaving) and **what do we owe them** (hours, leave, overtime, tax and pension, payslips).

**It is a second flagship product, not a feature.** HR and Payroll is sold on its own as well as together with attendance, with its own landing page and pricing, and every page of every product links to the other products (section 13).

It is **one shared people record with two modules on top, sold separately or together** (the way most small-business suites do it, and the way a buyer who already owns one half thinks):

- **The people record (the core, shared by everything).** One record per person: name, job title, employment type, start and end date, department, manager, contact and emergency contact. Attendance, HR and payroll all read the same record, so a company never types a person in twice. The pay-sensitive parts (bank, tax and pension numbers) live apart, in locked collections (section 3).
- **The HR module** adds what a people team needs beyond the record: documents (contracts, IDs, expiry reminders), joining and leaving checklists, the organization chart, and employee self-service changes.
- **The Payroll module** adds the pay run for a period: it takes approved hours, leave and overtime, works out gross pay, deductions and net pay by the company's own rules and the country's statutory rules, produces payslips, and produces the files the company's bank or mobile-money provider accepts. **It includes the people record it needs, so a company can buy payroll without buying the HR module** (and HR without payroll).

Build order, each part useful on its own: **the people record, then HR, then payroll** (sections 8 and 13).

## 2. What we will not do (decided up front)

- **ChecIN never moves money.** It produces the payment file; the company uploads it to its own bank or mobile-money account. Holding or sending funds makes us a payment institution with its own licence and liability. This keeps us out of that.
- **No tax or pension rate is written in code.** Rates, bands and caps are **data with effective dates** per country, reviewed by an accountant before they are switched on (section 6).
- **No pay figure is ever shown to a manager** unless the company chose that. A manager sees their team's hours; pay is for the payroll role only.
- **Nothing is deleted.** Corrections are new entries that reverse and replace; a closed pay period is locked.

## 3. Why it needs its own security level

Salaries, bank and mobile-money numbers, ID numbers and contracts are the most sensitive data we will hold. The rules:

1. **Separate collections, Admin SDK only** (`allow read, write: if false` for clients), exactly like the kiosk secret. Firestore rules cannot hide a single field from someone who can read the document, so pay and identity numbers are **never** on the `users` document or any document a manager can read.
2. **New roles, set only through the server.** Today claims are `{ role, orgId, managerId }`. Payroll needs a way to say "this person may see pay" without making them an organization admin. Options: add `hr` and `payroll` as roles, or add a small `perms` list to the claims. **This changes a shared, security-critical design, so it is decision D3 and needs its own review before any code.**
3. **Every read and write of pay data is logged** in the audit trail (task 5.3, a prerequisite): who looked at whose pay, and when.
4. **Maker and checker.** The person who prepares a pay run cannot be the only person who approves it. A closed period is locked; changing it needs a new, logged correction.
5. **Fields are encrypted at rest** by the database, and bank numbers are shown masked (last four digits) everywhere except the one place they are entered.
6. **Employees see only their own** record and payslips, through the server, never by reading a collection.
7. **Data protection:** this is personal and financial data under the data protection law. The privacy policy and the data export (5.4) must cover it, and a lawyer reviews the wording before launch.

## 4. The data (sketch)

| Collection | Holds | Who reads it |
|---|---|---|
| `employee_profiles/{uid}` | job title, employment type and status, start and end date, contract type, work location, emergency contact, probation end | the person; their manager (limited fields); HR |
| `employee_private/{uid}` | national ID, tax number, pension number, birth date | HR only (Admin SDK) |
| `employee_pay/{uid}` | effective-dated pay setup: salary or hourly rate, allowances, fixed deductions, bank or mobile-money details | payroll only (Admin SDK) |
| `employee_documents/{id}` | contract, ID copy, certificates: file reference, type, expiry | the person; HR |
| `pay_runs/{id}` | period, status (draft, calculated, approved, locked), totals, who prepared and approved | payroll |
| `pay_run_lines/{runId}_{uid}` | each person's hours, gross, each deduction, net, the rule versions used | payroll; the person sees only their own payslip |
| `pay_rules/{country}_{version}` | the tax bands, pension rates and caps with effective dates, and who reviewed them | payroll (read); platform owner (write) |
| `payslips/{runId}_{uid}` | the final payslip as a file reference | the person; payroll |

All written by the server only; every document carries `orgId`; every query is bounded and starts with `orgId`.

## 5. A pay run, step by step

1. **Open a period** (for example 1 to 31 October). Choose who is in it.
2. **Gather** (read only, from what already exists): approved **hours** per person from the daily summaries and approved work-from-home diary days; **leave** taken, from the leave records and balances (2.2); **overtime** by the company's rule (design #83); **holidays** from the calendar.
3. **Calculate** gross pay from each person's pay setup, then the statutory deductions and the company's own deductions, then net pay. Every line shows **how it was worked out** (hours x rate, band, rate, cap), so an accountant can check it by hand.
4. **Review:** the payroll person sees every line and a list of things to look at (no hours recorded, hours far above normal, a rate change, a new joiner or leaver). Fixes are made at the source (attendance corrections, leave) and the run is recalculated.
5. **Approve** by a second person. The run locks.
6. **Produce** the payslips and the payment file(s) and reports (bank format, mobile-money format, a journal for accounting software).
7. **Afterwards**, mistakes are fixed by a correction in the next run (back pay, reversal), never by editing the locked one.

## 6. Statutory rules are data, per country

Each country has income tax, pension or social-security contributions, and sometimes other levies, with bands, rates, caps and filing formats that **change by law, often yearly**. So:
- A rule set is a **versioned document with an effective date**, never a constant in code. A pay run records which version it used.
- **Start with Ghana** (income tax withheld from pay, and the social-security and pension contributions), the pilot's country. The exact rates and the filing formats are **taken from the revenue and pension authorities' published guidance and confirmed by a Ghana accountant before they are switched on.** I will not enter numbers from memory.
- Each rule set has a **golden test file**: a table of example employees with the expected result, written or approved by the accountant. A rule set cannot be marked active until its golden tests pass.
- This is the same idea as the regional compliance packs (task 5.9); payroll is the biggest user of them.

## 7. Plan level and price

- **The people record** comes with any product (attendance, HR or payroll), because all of them need it.
- **HR** and **Payroll** are two modules, each priced **per person per month**, with a **bundle price** for both. Payroll costs more because it costs more to support and carries more liability. Gated with new features (for example `hr`, `payroll`) in the single feature table, `built: false` until shipped. The people record is a shared feature, not a module a company can switch off.
- Decision D5.

## 8. Build order (Phase 7)

Each step is a PR with its own tests, reviewed before the next.
1. **Design sign-off** (this note), the accountant's brief, and the role design (D3).
2. **HR core:** employee profile, private fields, documents, joining and leaving checklists (leavers lose access: ties to SCIM, 5.2), org chart.
3. **Pay setup:** effective-dated pay per person, with history and an audit entry for every change.
4. **Pay run engine as pure, tested code** (no database): gather, calculate, rounding rules, corrections. Property tests: the lines add up to the totals, a retry changes nothing, rounding never loses or invents a cent.
5. **Statutory rules for Ghana** as data, with the accountant's golden tests.
6. **Pay run screens:** prepare, review, approve, lock, correct.
7. **Payslips** (a file per person, an employee self-view) and **reports and payment files**.
8. **Live integrations** with accounting and payroll software only for the first customer who needs one (the same rule as HRIS, 5.8).

## 9. Risks (and what keeps them small)

| Risk | What keeps it small |
|---|---|
| A wrong deduction costs real people real money | Rules as data with golden tests from an accountant; every line shows its working; maker and checker; locked periods; corrections not edits |
| A leak of salaries | Admin-SDK-only collections, a separate role, masked numbers, every read logged, no manager access by default |
| Law changes | Versioned, dated rule sets; the run records the version; an owner task to review rules each year |
| We become liable for payments | No money movement, only files |
| Scope creep into a full HR suite (performance reviews, recruitment, training) | Deliberately out of scope until a customer asks; named in section 10 |

## 10. Out of scope for now
Recruitment and applicant tracking, performance reviews, training records, benefits administration, expense claims, loans and advances (a simple fixed deduction is in scope; a loan with interest is not), multi-currency payroll, and paying people from inside ChecIN.

## 11. Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | Build both, or the people record and HR first and payroll later? | **The people record first, then HR, then payroll.** Payroll only after overtime, leave balances and the audit trail are live |
| D2 | Payment: files only, or integrate with a bank or mobile-money API later? | **Files only.** Integrations later, one provider for the first customer who asks |
| D3 | How to give someone pay access without making them an admin | **Add `hr` and `payroll` roles through the server**, reviewed as a security design before code |
| D4 | Which countries | **Ghana first.** Add a country when a customer there signs |
| D5 | Plan and price | **HR core in Growth or a small add-on; payroll as a per-person add-on** |
| D6 | Who is the accountant who reviews the rules and writes the golden tests | **You need one before payroll starts.** Without that review we do not switch payroll on |
| D7 | Can managers see pay | **No.** Hours only, unless a company turns on a specific view |

## 12. Dependencies
Leave types and balances (2.2), overtime (3.2, design #83), the audit trail (5.3), regional compliance packs (5.9), email sending (for payslip delivery, 1.4), file storage for documents (needs the Blaze plan), and the privacy policy update with a lawyer's review. SSO and SCIM (5.1, 5.2) make leaver handling automatic but are not required.

## 13. A second flagship product: one family, linked everywhere

The idea: ChecIN becomes a family of products. **Attendance** is the first. **HR and Payroll** is the second. A company can buy either, or both, and every page shows the other.

**What we recommend (all proposals, decisions D8 to D12):**

1. **One account, many products.** A person signs in once. The company's account holds which products it has (**entitlements**: attendance, HR and payroll, or both). The menu shows only what the company bought. People, the organization and roles are shared, so a company with both never types a person in twice.
2. **A product switcher**, in the app's top bar and on the public pages, like a "grid" menu in other software: ChecIN Attendance, ChecIN HR and Payroll (and later anything else). A company that has not bought a product sees it with a "Learn more" link instead of a dead end.
3. **A separate landing page for each product**, with its own headline, features, pricing and FAQ, written for its own buyer (HR and finance, not just operations). **Every page of every product carries links to the others**: the top bar of each landing page, the footer, and the signed-in menu. Each landing page also has a "Works with ChecIN Attendance" section: hours flow into payroll with no retyping, which is the strong reason to buy both.
4. **Same app, same codebase, same login, at first.** Separate **landing pages under the same domain** (for example `/` for attendance and `/payroll` for the second product). Separate domains or a separate brand name can come later if the brand needs it; splitting later is easy, merging is not.
5. **It must work alone.** A company without our attendance can still run payroll. Hours come from a typed or imported timesheet, or the person is on a fixed salary. When the company also has attendance, approved hours flow in automatically.
6. **Plans have two axes, and the modules sit on the products axis.** The plan (Starter, Growth, Enterprise) says how much of a product a company gets; the **products** say which products it has. The single feature table in `src/lib/plans.ts` grows a "product" field (`attendance`, `hr`, `payroll`), and a feature is allowed when the company has the product **and** its plan includes the feature. The people record is allowed when the company has **any** product. Billing, the trial and the pricing page handle each product, and a bundle price for both.
7. **The Enterprise "payroll and HRIS integration" line shrinks.** With our own system it only matters for a company that keeps someone else's payroll or HR software; that connector stays in the plan (5.8, 7.13), later and smaller.
8. **The safety rules do not change**: we never move money, rates are data checked by an accountant, pay data is locked down (sections 2 and 3).

**What needs a decision before building (D8 to D12):**

| # | Decision | Recommendation |
|---|---|---|
| D8 | The second product's **name and brand** | A name that sits with ChecIN (for example "ChecIN Pay" or "ChecIN People"). Choose before the landing page; the domain depends on it |
| D9 | Domain: one domain with a page per product, or a separate domain per product | **One domain, a page per product**, to start (the domain is not bought yet; this keeps it to one purchase) |
| D10 | Can a company buy HR and Payroll **without** attendance | **Yes.** It is the point of a second flagship |
| D11 | Are HR and Payroll sold separately or together | **Separately from the start, built on one shared people record, with a bundle price.** Payroll includes the people record, so it can be bought without the HR module. One flagship page shows the two modules inside it |
| D12 | When the second landing page goes up | **Only when the product exists** (the plan's rule: nothing is drawn for what is not built). A "coming soon" waiting-list page is fine and useful earlier |

**What it needs from the app (tasks 7.14 to 7.17):** the product switcher and shared account, the products axis in the plan table and billing, the second landing page with its own pricing and cross-links on every page, and standalone mode for payroll.
