# Current Copy Audit — Landing Page Clone (`prezence.framer.website`)

> **Source File**: `preview.html` (lines 90–726, with prototype modules in lines 67–86 & 732–959)  
> **Host / Serve Command**: `node scratch/serve_preview.js` (running at `http://127.0.0.1:8899/`)  
> **Extraction Date**: September 27, 2026  
> **Purpose**: Complete verbatim copy extraction of all current headlines, subheadings, labels, bullet points, numbers/stats, and microcopy for rewriting to fit a new product.

---

## 1. Floating Navigation Bar

**File Location:** `preview.html` (lines 94–124)  
**Component Reference:** `<header id="main-nav">`

* **Brand / Logo:**
  * `ChecIN`
* **Nav Links (in display order):**
  * `Benefits`
  * `Why ChecIN`
  * `Capabilities`
  * `Pricing`
  * `Blog`
* **Button / CTA Labels:**
  * `Sign in`
  * `Book a Demo`

---

## 2. Hero Section

**File Location:** `preview.html` (lines 126–174)  
**Component Reference:** `<section id="hero">`

* **Top Pill Badge:**
  * `Unified Attendance Platform`
* **Headline / Main Title (H1):**
  * `Attendance, Leave & Shifts In One Clear View`
* **Subheading / Supporting Copy:**
  * `ChecIN helps HR teams track attendance, manage leave, plan shifts, and spot gaps in real time.`
* **CTA Buttons:**
  * Primary Button: `Book a Demo`
  * Secondary Button: `Explore Platform`
* **Mockup Image Alt Text:**
  * `ChecIN Real-Time Attendance Dashboard Interface`

---

## 3. Benefits Section

**File Location:** `preview.html` (lines 176–254)  
**Component Reference:** `<section id="benefits">`

* **Section Pill Badge:**
  * `Benefits`
* **Section Headline (H2):**
  * `Less Chasing. More Clarity.`
* **Section Subheading / Supporting Text:**
  * `Stop stitching attendance together from spreadsheets, badge logs and email threads. ChecIN gives every layer of your org the numbers that matter.`

### Card 1 (Stat Card)
* **Number / Stat:**
  * `<2s`
* **Stat Supporting Text:**
  * `to a full org-wide status`
* **Card Headline (H3):**
  * `Real-time visibility`
* **Card Body Description:**
  * `One live snapshot across every division, location, and shift, showing who's present, remote, on leave, or running late.`

### Card 2 (Stat Card)
* **Number / Stat:**
  * `73%`
* **Stat Supporting Text:**
  * `to a full org-wide status`
* **Card Headline (H3):**
  * `Approvals that move`
* **Card Body Description:**
  * `WFH, leave, and overtime requests reach the right approver quickly, reducing delays and conflicts.`

### Card 3 (Stat Card)
* **Number / Stat:**
  * `100%`
* **Stat Supporting Text:**
  * `to a full org-wide status`
* **Card Headline (H3):**
  * `Compliance, handled`
* **Card Body Description:**
  * `Geo-fenced clock-ins, regional leave ledgers, and audit-ready exports help payroll and legal stay compliant every day.`

---

## 4. Why ChecIN Section (Bento Cards)

**File Location:** `preview.html` (lines 256–308)  
**Component Reference:** `<section id="why">`

* **Section Pill Badge:**
  * `Why ChecIN`
* **Section Headline (H2):**
  * `Attendance Data Shouldn't Live In Six Different Systems.`
* **Section Subheading / Supporting Text:**
  * `ChecIN brings attendance, leave, scheduling, and reporting into one connected platform. Give every team a shared view of workforce activity, from daily operations to leadership decisions.`

### Bento Card 1 (Warm Butter Card `#FCF2CB`)
* **Card Headline (H3):**
  * `Run attendance from one place.`
* **Card Body Description:**
  * `Track attendance, capture time, approve leave, and coordinate schedules through a single operational workspace.`
* **Image Alt Text:**
  * `Run attendance from one place UI`

### Bento Card 2 (Soft Mint Card `#CBEED3`)
* **Card Headline (H3):**
  * `See what needs attention.`
* **Card Body Description:**
  * `Turn workforce activity into reports, trends, and executive updates that help teams act faster and with confidence.`
* **Image Alt Text:**
  * `See what needs attention reports UI`

---

## 5. Core Capabilities Section (Interactive Tabs)

**File Location:** `preview.html` (lines 310–364 & lines 1006–1037)  
**Component Reference:** `<section id="capabilities">`

* **Section Pill Badge:**
  * `Core Capabilities`
* **Section Headline (H2):**
  * `Everything Needed To Manage Workforce Attendance.`
* **Section Subheading / Supporting Text:**
  * `From time tracking and leave management to scheduling and reporting, ChecIN brings every attendance workflow together in one connected platform.`

### Tab List (Buttons & Dynamic Content)
1. **Tab 1:**
   * **Button Label:** `Workforce Visibility`
   * **Trailing Indicator:** `→`
   * **Associated Description (in `capData`):** `Real-time organization-wide snapshot showing active staff, breaks, remote workers, and shifts across all business divisions.`
2. **Tab 2:**
   * **Button Label:** `Attendance Intelligence`
   * **Trailing Indicator:** `→`
   * **Associated Description (in `capData`):** `Predictive anomaly detection, overtime trend analysis, and early warnings on potential shift vacancies or policy breaches.`
3. **Tab 3:**
   * **Button Label:** `Holiday Calendar`
   * **Trailing Indicator:** `→`
   * **Associated Description (in `capData`):** `Multi-jurisdiction statutory calendar automation with regional bank holiday sync, customized leave ledgers, and team blackout periods.`
4. **Tab 4:**
   * **Button Label:** `Governance Controls`
   * **Trailing Indicator:** `→`
   * **Associated Description (in `capData`):** `Audit-ready role-based access control (RBAC), immutable check-in logs, and regulatory compliance safeguards for legal teams.`
5. **Tab 5:**
   * **Button Label:** `Reporting Automation`
   * **Trailing Indicator:** `→`
   * **Associated Description (in `capData`):** `Automated monthly payroll exports, CSV/XLS generation, and scheduled HR executive summaries delivered straight to leadership.`
6. **Tab 6:**
   * **Button Label:** `Day-Level Filter`
   * **Trailing Indicator:** `→`
   * **Associated Description (in `capData`):** `High-granularity drill-down allowing floor managers to isolate specific hours, individual shifts, or anomalous punch records in seconds.`

* **Mockup Image Alt Text:**
  * `Workforce Visibility Interface`

---

## 6. Built For Every Team Section

**File Location:** `preview.html` (lines 366–413)  
**Component Reference:** `<section id="teams">`

* **Section Pill Badge:**
  * `Built For Every Team`
* **Section Headline (H2):**
  * `One Platform For Everyone Behind Attendance.`
* **Section Subheading / Supporting Text:**
  * `ChecIN gives each team the right view, tools, and workflows to manage workforce presence without switching systems.`
* **Laptop Mockup Image Alt Text:**
  * `ChecIN Desktop Mockup`
* **Floating Role Chips (Audience Tags):**
  * `HR Teams`
  * `Operations Teams`
  * `Executives`
  * `Team Manager`
  * `Finance Team`
  * `Employees`

---

## 7. Pricing Section

**File Location:** `preview.html` (lines 414–514 & lines 982–1004)  
**Component Reference:** `<section id="pricing">`

* **Section Pill Badge:**
  * `Pricing`
* **Section Headline (H2):**
  * `Simple Pricing That Scales With You`
* **Section Subheading / Supporting Text:**
  * `Transparent per-employee pricing: implementation, integrations, and compliance packs included.`
* **Billing Cycle Switcher:**
  * Toggle 1: `Monthly`
  * Toggle 2: `Yearly`
  * Savings Badge: `Save 20%`

### Tier 1: Starter
* **Plan Name (H3):** `Starter`
* **Plan Target / Subtitle:** `For small teams getting attendance under control.`
* **Price Number:** `$0`
* **Price Unit / Cadence:** `/User/Month`
* **Plan Badge / Note:** `Free Up To 15 Employees`
* **Feature Checklist (Bullets):**
  * `Time Clock & Timesheets`
  * `Leave Requests & Balances`
  * `1 Location · Basic Reports`
  * `Email Support`
* **CTA Button Label:** `Get Started`

### Tier 2: Growth (Featured Dark Tier)
* **Plan Name (H3):** `Growth`
* **Plan Target / Subtitle:** `For scaling companies with managers and shifts.`
* **Price Number:** `$8` *(dynamically switches to `$6.40` when Yearly is toggled)*
* **Price Unit / Cadence:** `/User/Month`
* **Billing Note:** `Billed Annually · Or $8 Monthly` *(dynamically switches to `Billed Annually (Save 20%)` or `Billed Monthly`)*
* **Feature Checklist (Bullets):**
  * `Everything In Starter`
  * `Geo & Wi-Fi Verified Clock-In`
  * `Shift Scheduling & Overtime`
  * `Multi-Stage Approvals & WFH`
  * `Unlimited Locations & Exports`
* **CTA Button Label:** `Get Started`

### Tier 3: Enterprise
* **Plan Name (H3):** `Enterprise`
* **Plan Target / Subtitle:** `For 1,000+ employees across regions.`
* **Price Text:** `Custom`
* **Billing Note:** `Volume Pricing & Annual Contract`
* **Feature Checklist (Bullets):**
  * `Everything In Growth`
  * `SSO, SCIM & Audit Logs`
  * `Workday & ADP Integrations`
  * `Statutory Compliance Per Region`
  * `Dedicated CSM & SLA`
* **CTA Button Label:** `Get Started`

---

## 8. Customer Stories / Testimonials Section

**File Location:** `preview.html` (lines 515–588)  
**Component Reference:** `<section id="stories">`

* **Section Pill Badge:**
  * `Customer stories`
* **Section Headline (H2):**
  * `Loved By The People Who Run The Floor`
* **Section Subheading / Supporting Text:**
  * `HR leaders, people-ops teams and frontline managers rely on ChecIN every shift.`

### Story Card 1
* **Quote:**
  * `“We cut our monthly attendance reconciliation from three days to about twenty minutes. The statutory exports alone paid for the whole rollout.”`
* **Author Name:**
  * `Hannah Taylor`
* **Author Title / Role:**
  * `Head of People Ops, Northwind`

### Story Card 2
* **Quote:**
  * `“Geo-fenced clock-in killed buddy-punching overnight. Our overtime is finally accurate and the alerts catch cap breaches before payroll does.”`
* **Author Name:**
  * `Jeff Carter`
* **Author Title / Role:**
  * `Ops Director, Helix`

### Story Card 3
* **Quote:**
  * `“Rolling out across seven regions sounded terrifying. With per-region policies and holiday calendars it took us a fortnight, not a quarter.”`
* **Author Name:**
  * `Aron Klaver`
* **Author Title / Role:**
  * `People Systems, Kodiak`

### Story Card 4
* **Quote:**
  * `“The leave approval flow is so smooth my managers stopped emailing me. Coverage context right in the request is a small thing that changed everything.”`
* **Author Name:**
  * `Paula Menges`
* **Author Title / Role:**
  * `HR Manager, Celadon`

---

## 9. Frequently Asked Questions Section

**File Location:** `preview.html` (lines 590–678)  
**Component Reference:** `<section id="faq">`

* **Section Headline (H2):**
  * `Frequently Asked Questions`

### FAQ Item 1
* **Question:**
  * `How long does a ChecIN rollout typically take?`
* **Answer:**
  * `Standard rollout for a 1,500-person enterprise takes 4-6 weeks: 1 week for HRIS data sync and policy mapping, 2 weeks for division pilot, and the rest for organization-wide deployment.`

### FAQ Item 2
* **Question:**
  * `Does ChecIN work with our existing HRIS and payroll?`
* **Answer:**
  * `Yes. ChecIN integrates natively with Workday, BambooHR, ADP, SAP SuccessFactors, and custom payroll platforms via secure webhooks and scheduled automated exports.`

### FAQ Item 3
* **Question:**
  * `Can employees clock in from outside the physical office?`
* **Answer:**
  * `Physical entrance kiosks require presence at the tablet to scan the rotating 15-second QR. For remote or mobile workforce members, managers can enable geo-fenced mobile clock-ins or WFH permissions.`

### FAQ Item 4
* **Question:**
  * `How does the intelligence engine handle sensitive employee data?`
* **Answer:**
  * `Security and privacy are built into every workflow. All attendance logs and biometric verification hashes are encrypted in transit (TLS 1.3) and at rest (AES-256) with strict role-based access control.`

### FAQ Item 5
* **Question:**
  * `What about statutory and labor law compliance across regions?`
* **Answer:**
  * `ChecIN provides regional rule packs that automatically adapt overtime thresholds, statutory holiday schedules, and mandated rest intervals based on each worker’s primary office location.`

### FAQ Item 6
* **Question:**
  * `Can our team pilot ChecIN before an enterprise rollout?`
* **Answer:**
  * `Absolutely. We offer 30-day proof-of-concept deployments for qualified enterprise teams, complete with temporary kiosk tablets and onboarding assistance from our solutions engineering team.`

---

## 10. Footer Section

**File Location:** `preview.html` (lines 680–726)  
**Component Reference:** `<footer>`

* **Brand / Logo:**
  * `ChecIN`
* **Brand Positioning Statement / Slogan:**
  * `Modern Attendance For Modern Corporate Teams. Eliminate buddy-punching and streamline workforce scheduling.`
* **Column 1 Header:**
  * `Company`
* **Column 1 Links:**
  * `Benefits`
  * `Why ChecIN`
  * `Capabilities`
  * `Pricing`
* **Column 2 Header:**
  * `Legal`
* **Column 2 Links:**
  * `Privacy Policy`
  * `Terms of Service`
  * `Security & Audits`
* **Column 3 Header:**
  * `Newsletter`
* **Column 3 Subtext:**
  * `Stay updated with workforce tech.`
* **Email Input Placeholder:**
  * `Your email`
* **Email Submit Button:**
  * `→`
* **Copyright Notice (Bottom Left):**
  * `© 2026 ChecIN Technologies Inc. All rights reserved.`
* **Tagline (Bottom Right):**
  * `Modern Attendance For Modern Teams`

---

## 11. Interactive Operational Prototype Modules (Linked from CTAs & Dock)

These additional sub-views exist in `preview.html` and are triggered by the floating bottom-right dock and landing page CTA buttons:

### Module A: Floating Prototype Switcher Dock
**File Location:** `preview.html` (lines 67–86)  
* **Label:** `Preview:`
* **Buttons:**
  * `Landing Page (1:1)`
  * `Entrance Kiosk`
  * `Employee Scanner`
  * `Manager App`

### Module B: Entrance Kiosk Tablet (`/kiosk`)
**File Location:** `preview.html` (lines 732–813)  
* **Terminal Header:** `Main Entrance Terminal #01`
* **Terminal Subtext:** `Device Secret Authenticated • Accra Head Office`
* **Live Clock Example:** `08:59:45 AM`
* **Date Example:** `Saturday, September 26`
* **Scan Instruction Badge:** `Scan with Phone Camera to Check In / Out`
* **HMAC Progress Info:** `Rotating HMAC Token:` (e.g. `e7a8...9f12`) | `Refreshes in 12s`
* **Scan Confirmation Toast:**
  * Icon: `✓`
  * Heading: `Welcome, Kofi Manu`
  * Status Subtext: `Clocked IN • 08:59:50 AM`
  * Signoff: `Have a productive day at the office!`
* **Simulation Controller Box:**
  * Header: `Simulation Mode: Trigger an employee scan event to test the 3-second toast`
  * Action Buttons: `Simulate Scan IN` | `Simulate Scan OUT`

### Module C: Employee Mobile PWA Scanner (`/scan`)
**File Location:** `preview.html` (lines 818–868)  
* **App Bar Title:** `ChecIN PWA`
* **Status Badge:** `Online • Verified`
* **Profile Card:** `Kofi Manu` | `Operations Team • Accra Office`
* **Status Indicator:** `Status today: Not Clocked In`
* **Scanner Target Overlay:** `Point at Entrance Tablet`
* **Cooldown Alert:** `⚠️ Cooldown active: Clocked in 45s ago. Scan again after 2 mins to prevent double-clocking.`
* **Action Button:** `📷 Scan Kiosk QR`
* **Helper Footnote:** `One tap from your home screen. No GPS permission needed.`

### Module D: Manager & Admin Dashboard (`/app`)
**File Location:** `preview.html` (lines 873–959)  
* **Top Meta:** `Corporate Admin • Acme Global Ltd (40 Employees)`
* **Page Title:** `Workforce Attendance Roster`
* **Top Actions:** `Export CSV` | `+ Invite Staff Member`
* **Metric Cards:**
  * Card 1: `Present Today` — `36 / 40` (`90% attendance rate`)
  * Card 2: `Late Arrivals` — `3` (`Within 15m threshold`)
  * Card 3: `Remote (WFH)` — `2` (`Manager approved`)
  * Card 4: `On Approved Leave` — `1` (`Annual leave`)
  * Card 5: `Unplanned Absent` — `1` (`Alert sent to manager`)
* **Table Header:** `Today's Activity Log (Real-Time Scan Events)`
* **Table Subhead:** `Auto-refreshes on new scan`
* **Table Columns:** `Employee`, `Role & Manager`, `Entrance Location`, `Event Type`, `Time`, `Verification`
