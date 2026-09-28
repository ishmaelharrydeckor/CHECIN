# ChecIN — Fork Inventory & Migration Audit

**Document Status:** Complete Audit (Read-Only Inventory)  
**Governing Security Authority:** `AGENTS.md` (Strictly Binding)  
**Audit Scope:** Every file under `src/` (147 files) plus `firestore.rules` (148 total files audited).  
**Constraint Applied:** Zero modifications, deletions, or file moves performed.

---

## 1. Executive Summary & Inventory Breakdown

The current repository is a fork of the legacy **QRoll / KNUST** academic attendance application. To transform it into **ChecIN** — a multi-tenant corporate workforce check-in and timesheet SaaS — we have conducted a full line-by-line audit against the binding security and architectural principles defined in `AGENTS.md`.

```
===============================================================================
TOTAL AUDITED ARTIFACTS: 148 Files (147 in src/ + firestore.rules)
===============================================================================
  [KEEP]    58 Files ( 39.2% ) — Generic infrastructure, shadcn primitives, rate limiter
  [ADAPT]   37 Files ( 25.0% ) — Tenancy model, auth claims, multi-tenant rules, corporate UI
  [REMOVE]  53 Files ( 35.8% ) — Academic assets, student portals, course grading, legacy queue
===============================================================================
```

### High-Level Summary by Category

| Category | Total Files | KEEP | ADAPT | REMOVE | Primary Rationale |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Root Security** (`firestore.rules`) | 1 | 0 | 1 | 0 | Rewrite academic rules to multi-tenant corporate claims (`orgId`, `managerId`). |
| **App Core** (`src/*`) | 5 | 3 | 2 | 0 | TanStack Start SSR entry generic; clean KNUST tokens from `styles.css`. |
| **Assets** (`src/assets/*`) | 26 | 0 | 0 | 26 | All 26 files are KNUST emblems, QRoll logos, and academic promo videos. |
| **Components** (`src/components/*`) | 53 | 47 | 4 | 2 | 46 shadcn/ui primitives + video player kept; adapt AppShell & notifications; remove stubs. |
| **Config** (`src/config/*`) | 1 | 0 | 1 | 0 | Change `APP_NAME` from "KNUST ATTENDANCE APP" to "ChecIN". |
| **Hooks** (`src/hooks/*`) | 1 | 1 | 0 | 0 | Generic responsive viewport hook (`use-mobile.tsx`). |
| **Integrations** (`src/integrations/*`) | 4 | 1 | 2 | 1 | Enforce strict env vars in Firebase config; remove Lovable stub. |
| **Libraries** (`src/lib/*`) | 19 | 6 | 7 | 6 | Keep rate limiter/error utils; adapt claims & exporters; purge grading/offline queue. |
| **Routes** (`src/routes/*`) | 38 | 0 | 20 | 18 | Adapt landing & corporate routes; purge student portal, courses, and manual routes. |
| **TOTAL** | **148** | **58** | **37** | **53** | **Audit complete. Ready for phased migration upon approval.** |

---

## 2. Complete File-by-File Classification

### 2.1 Root Security Configuration (1 file)

| File Path | Status | Action / Necessary Adaptation for ChecIN |
| :--- | :---: | :--- |
| `firestore.rules` | **ADAPT** | **Rewrite rules for corporate multi-tenancy.** Currently checks `isLecturer()`, `isPlatformAdmin()`, and `ownerId()` on academic collections (`courses`, `students`, `departments`, `attendance_sessions`). Must enforce custom claims `{ role: 'org_admin' \| 'manager' \| 'employee', orgId, managerId }`. Replace collections with `organizations`, `locations`, `departments`, `users`, `kiosks`, `clock_events`, `leave_requests`. Retain strict default-deny `match /{document=**} { allow read, write: if false; }`. |

---

### 2.2 App Root Infrastructure (`src/*` — 5 files)

| File Path | Status | Action / Necessary Adaptation for ChecIN |
| :--- | :---: | :--- |
| `src/router.tsx` | **KEEP** | Generic TanStack Router instance creation, query client provider, and preloading configuration. |
| `src/routeTree.gen.ts` | **ADAPT** | Auto-generated route tree. Will automatically adapt/regenerate when academic routes are pruned and ChecIN routes are registered. |
| `src/server.ts` | **KEEP** | Generic TanStack Start SSR entry handler, request pipeline, and server error capturing. |
| `src/start.ts` | **KEEP** | Generic TanStack Start initialization handler (`createStartHandler`). |
| `src/styles.css` | **ADAPT** | **Purge KNUST branding tokens.** Contains KNUST Forest Green (`#00552b`) and Gold (`#d97706`), plus `@utility bg-knust-gradient` and `@utility ring-knust`. Replace with ChecIN enterprise design system variables and typography. |

---

### 2.3 Assets (`src/assets/*` — 26 files)

All 26 assets are university-specific heraldry, legacy QRoll promo videos, or campus stock images.

| File Path | Status | Rationale |
| :--- | :---: | :--- |
| `src/assets/9315935.webp` | **REMOVE** | Stock academic lecture hall photo used on legacy student portal. |
| `src/assets/knust-crest.jpg` | **REMOVE** | Kwame Nkrumah University crest heraldry. |
| `src/assets/knust-login-hero.jpg` | **REMOVE** | KNUST university campus login image. |
| `src/assets/knust-logo.jpg` | **REMOVE** | KNUST university emblem. |
| `src/assets/knust-students-hero.jpg` | **REMOVE** | KNUST student group photo. |
| `src/assets/knust-students-hero.webp` | **REMOVE** | WebP variant of KNUST students photo. |
| `src/assets/qroll-banner.png` | **REMOVE** | QRoll university branded banner. |
| `src/assets/qroll-icon.png` | **REMOVE** | QRoll mobile app icon. |
| `src/assets/qroll-intro-landscape.mp4` | **REMOVE** | QRoll academic walkthrough video (landscape). |
| `src/assets/qroll-intro-video---portrait.mp4` | **REMOVE** | QRoll academic walkthrough video (portrait). |
| `src/assets/qroll-loading.json` | **REMOVE** | Lottie animation with embedded QRoll metadata. |
| `src/assets/qroll-login.png` | **REMOVE** | QRoll branded login visual. |
| `src/assets/qroll-logo.png` | **REMOVE** | QRoll university logo. |
| `src/assets/qroll-promo-landscape.mp4` | **REMOVE** | QRoll promotional video (landscape). |
| `src/assets/qroll-promo-portrait.mp4` | **REMOVE** | QRoll promotional video (portrait). |
| `src/assets/qroll-promo.mp4` | **REMOVE** | QRoll promotional video demo. |
| `src/assets/qroll-splash.png` | **REMOVE** | QRoll splash screen graphic. |
| `src/assets/qroll-wide-banner.png` | **REMOVE** | QRoll wide horizontal banner. |
| `src/assets/students-banner.png` | **REMOVE** | Student portal banner graphic. |
| `src/assets/images/knust_app_favicon_1789376344856.jpg` | **REMOVE** | KNUST favicon graphic. |
| `src/assets/images/knust_app_logo_1789376327510.jpg` | **REMOVE** | KNUST app logo image. |
| `src/assets/images/knust_login_hero_1789376359000.jpg` | **REMOVE** | KNUST login page hero asset. |
| `src/assets/images/knust_official_crest_1789471942228.jpg` | **REMOVE** | KNUST university official crest graphic. |
| `src/assets/images/knust_students_hero_1789471926651.jpg` | **REMOVE** | KNUST campus photo asset. |
| `src/assets/images/knust_user_logo_1789472757321.jpg` | **REMOVE** | KNUST user badge asset. |
| `src/assets/images/landing_page_preview_1789977964355.jpg` | **REMOVE** | Outdated QRoll academic landing page preview. |

---

### 2.4 Components (`src/components/*` — 53 files)

#### Non-UI Components (7 files)

| File Path | Status | Action / Necessary Adaptation for ChecIN |
| :--- | :---: | :--- |
| `src/components/AppShell.tsx` | **ADAPT** | **Replace academic shell with corporate workforce shell.** Currently imports missing `KnustEmblem`, renders "KNUST ATTENDANCE APP", and links to academic menus (Courses, Sessions, Students, Semesters, Assignments, Promotion, TAs). Replace with ChecIN logo, Org selector, and role-based routes: Dashboard, Live Kiosk, Clock Events, Directory, Locations/Geofences, Timesheets, Reports, Settings. |
| `src/components/BrandVideo.tsx` | **KEEP** | Generic responsive video modal dialog using HTML5 video. Completely reusable for ChecIN marketing/onboarding demos. |
| `src/components/DeviceLimitDialog.tsx` | **ADAPT** | Reusable multi-device limit warning dialog. Line 91 hardcodes `"Your KNUST Attendance account is currently signed in on..."`. Replace copy with ChecIN corporate account wording. |
| `src/components/PublicFooter.tsx` | **ADAPT** | Currently imports missing `KnustEmblem`, displays `"© KNUST ATTENDANCE APP · Smart Academic Attendance"`, and links to academic manual. Adapt to clean ChecIN corporate footer linking to Terms, Privacy, and Status. |
| `src/components/PushNotificationManager.tsx` | **ADAPT** | Service Worker push subscription UI. Replace toast messages and iOS PWA instructions referencing "KNUST ATTENDANCE APP" with ChecIN; adapt notification categories from lectures to shifts and clock-in alerts. |
| `src/components/SplashScreen.tsx` | **REMOVE** | Empty stub component returning `null`. Dead code. |
| `src/components/StudentPromotionModal.tsx` | **REMOVE** | Academic progression modal for promoting students between academic years/levels (Level 100 to 400). Irrelevant to corporate check-in. |

#### UI Primitives (`src/components/ui/*` — 46 files)

All 46 files are standard, generic Radix UI / Tailwind CSS primitives (`shadcn/ui`). They are 100% reusable and should be **KEPT**:

| File Path | Status | Description |
| :--- | :---: | :--- |
| `src/components/ui/accordion.tsx` | **KEEP** | Accessible accordion primitive (Radix) |
| `src/components/ui/alert-dialog.tsx` | **KEEP** | Confirmation modal primitive (Radix) |
| `src/components/ui/alert.tsx` | **KEEP** | Status banner / alert box |
| `src/components/ui/aspect-ratio.tsx` | **KEEP** | Aspect ratio container (Radix) |
| `src/components/ui/avatar.tsx` | **KEEP** | User profile avatar primitive (Radix) |
| `src/components/ui/badge.tsx` | **KEEP** | Status badge primitive |
| `src/components/ui/breadcrumb.tsx` | **KEEP** | Navigation breadcrumb trail |
| `src/components/ui/button.tsx` | **KEEP** | Primary/secondary button primitive |
| `src/components/ui/calendar.tsx` | **KEEP** | Date picker calendar (react-day-picker) |
| `src/components/ui/card.tsx` | **KEEP** | Content container card |
| `src/components/ui/carousel.tsx` | **KEEP** | Image/content slider (embla-carousel) |
| `src/components/ui/chart.tsx` | **KEEP** | Recharts wrapper primitive |
| `src/components/ui/checkbox.tsx` | **KEEP** | Accessible checkbox (Radix) |
| `src/components/ui/collapsible.tsx` | **KEEP** | Expandable disclosure container (Radix) |
| `src/components/ui/command.tsx` | **KEEP** | Search command palette (cmdk) |
| `src/components/ui/context-menu.tsx` | **KEEP** | Right-click context menu (Radix) |
| `src/components/ui/dialog.tsx` | **KEEP** | Modal dialog container (Radix) |
| `src/components/ui/drawer.tsx` | **KEEP** | Mobile bottom sheet drawer (vaul) |
| `src/components/ui/dropdown-menu.tsx` | **KEEP** | Dropdown action menu (Radix) |
| `src/components/ui/form.tsx` | **KEEP** | Form wrapper with react-hook-form integration |
| `src/components/ui/hover-card.tsx` | **KEEP** | Popover hover preview (Radix) |
| `src/components/ui/input-otp.tsx` | **KEEP** | One-time password / PIN code input |
| `src/components/ui/input.tsx` | **KEEP** | Text input primitive |
| `src/components/ui/label.tsx` | **KEEP** | Form label primitive (Radix) |
| `src/components/ui/menubar.tsx` | **KEEP** | Desktop menubar primitive (Radix) |
| `src/components/ui/navigation-menu.tsx` | **KEEP** | Main header navigation menu (Radix) |
| `src/components/ui/pagination.tsx` | **KEEP** | Table pagination controls |
| `src/components/ui/popover.tsx` | **KEEP** | Floating popover primitive (Radix) |
| `src/components/ui/progress.tsx` | **KEEP** | Progress bar indicator (Radix) |
| `src/components/ui/radio-group.tsx` | **KEEP** | Radio button options group (Radix) |
| `src/components/ui/resizable.tsx` | **KEEP** | Resizable split pane layout (react-resizable-panels) |
| `src/components/ui/scroll-area.tsx` | **KEEP** | Custom styled scroll container (Radix) |
| `src/components/ui/select.tsx` | **KEEP** | Custom select dropdown (Radix) |
| `src/components/ui/separator.tsx` | **KEEP** | Visual horizontal/vertical divider (Radix) |
| `src/components/ui/sheet.tsx` | **KEEP** | Off-canvas slide-out sheet (Radix) |
| `src/components/ui/sidebar.tsx` | **KEEP** | Responsive app sidebar primitive |
| `src/components/ui/skeleton.tsx` | **KEEP** | Animated loading placeholder |
| `src/components/ui/slider.tsx` | **KEEP** | Numeric range slider (Radix) |
| `src/components/ui/sonner.tsx` | **KEEP** | Sonner toast notification provider |
| `src/components/ui/switch.tsx` | **KEEP** | Toggle switch primitive (Radix) |
| `src/components/ui/table.tsx` | **KEEP** | Responsive data table component |
| `src/components/ui/tabs.tsx` | **KEEP** | Tabbed interface switcher (Radix) |
| `src/components/ui/textarea.tsx` | **KEEP** | Multiline text input primitive |
| `src/components/ui/toggle-group.tsx` | **KEEP** | Segmented toggle button group (Radix) |
| `src/components/ui/toggle.tsx` | **KEEP** | Single toggle button primitive (Radix) |
| `src/components/ui/tooltip.tsx` | **KEEP** | Hover tooltip primitive (Radix) |

---

### 2.5 Config & Hooks (2 files)

| File Path | Status | Action / Necessary Adaptation for ChecIN |
| :--- | :---: | :--- |
| `src/config/public-backend.ts` | **ADAPT** | Line 3 hardcodes `APP_NAME = "KNUST ATTENDANCE APP"`. Change to `"ChecIN"` and update metadata. |
| `src/hooks/use-mobile.tsx` | **KEEP** | Standard media query hook for responsive layout switching (`<= 768px`). Works as-is. |

---

### 2.6 Integrations (`src/integrations/*` — 4 files)

| File Path | Status | Action / Necessary Adaptation for ChecIN |
| :--- | :---: | :--- |
| `src/integrations/firebase/admin.server.ts` | **ADAPT** | **Enforce strict env vars & eliminate hardcoded fallback.** Currently imports `firebase-applet-config.json` and falls back to old project ID `gen-lang-client-0546939058` if env vars are unset. Per `AGENTS.md`, remove hardcoded fallback, require `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT`, and configure dedicated ChecIN instance. |
| `src/integrations/firebase/config.ts` | **ADAPT** | **Eliminate hardcoded client credentials.** Imports `firebase-applet-config.json` and falls back to hardcoded API key (`AIzaSy...`). Strip `appletConfig` fallback and require `VITE_FIREBASE_*` environment variables. |
| `src/integrations/firebase/firestore-admin-helpers.ts` | **KEEP** | Generic 30-item chunking utility for Firestore `where("id", "in", ...)` queries. Clean and reusable. |
| `src/integrations/lovable/index.ts` | **REMOVE** | Stub integration for `@lovable.dev/cloud-auth-js`. Dead code; ChecIN authenticates directly via Firebase Auth. |

---

### 2.7 Libraries (`src/lib/*` — 19 files)

| File Path | Status | Action / Necessary Adaptation for ChecIN |
| :--- | :---: | :--- |
| `src/lib/auth-claims.ts` | **ADAPT** | **Implement ChecIN claims structure.** Currently defines `UserRole = "admin" \| "super_admin" \| "lecturer" \| "teaching_assistant"` and claims `{ role, ownerId }`. Must implement `AGENTS.md` claims: `{ role: 'org_admin' \| 'manager' \| 'employee', orgId: string, managerId?: string }`. |
| `src/lib/auth.ts` | **ADAPT** | Client `useAuth` hook and context. Currently tracks `role` and `ownerId` with academic helpers (`isLecturer`, `isTA`). Update to expose `orgId`, `managerId`, `isOrgAdmin`, `isManager`, and `isEmployee`. |
| `src/lib/caller-identity.server.ts` | **ADAPT** | Request authentication parser. Currently contains fallbacks for legacy student session tokens. Remove student sessions; verify Firebase ID token custom claims exclusively. |
| `src/lib/class-matching.ts` | **REMOVE** | Academic algorithms for matching student levels (100–400) and course codes. Irrelevant to ChecIN. |
| `src/lib/device-manager.ts` | **ADAPT** | Device fingerprinting utility. Line 35 hardcodes `KEY = "qroll_device_id"`. Change key to `checin_device_id` and align with corporate employee/kiosk device management. |
| `src/lib/error-capture.ts` | **KEEP** | Circular in-memory error buffer for capturing SSR rendering faults. Fully generic. |
| `src/lib/error-page.ts` | **KEEP** | Generic fallback HTML 500 error page template with stack trace rendering. |
| `src/lib/exporters.ts` | **ADAPT** | Excel and PDF report generator. Currently hardcodes "KWAME NKRUMAH UNIVERSITY OF SCIENCE AND TECHNOLOGY", KNUST green theme, and academic columns (Index Number, Level, Programme). Adapt to ChecIN workforce timesheets: Employee Name, Department, Shift, Clock In, Clock Out, Total Hours, Verification Mode. |
| `src/lib/grading.ts` | **REMOVE** | KNUST Continuous Assessment scoring engine (`(Attended / Total) * 10` and 75% examination clearance threshold). Purely academic. |
| `src/lib/lovable-error-reporting.ts` | **REMOVE** | Third-party error telemetry stub. Dead code. |
| `src/lib/offline-queue.ts` | **REMOVE** | **Violates `AGENTS.md` Rule 87.** Queues check-in scans in localStorage (`qroll.offline.scans.v1`). Rule 87 strictly prohibits offline scan queueing because dynamic scan tokens have a 15-second TTL and require real-time server-side freshness verification. |
| `src/lib/public-origin.ts` | **ADAPT** | Origin detector. Line 6 hardcodes fallback `"https://qroll-app.lovable.app"`. Update to ChecIN production origin fallback. |
| `src/lib/push-client.ts` | **ADAPT** | Push subscription client. Remove academic role metadata from subscription payloads. |
| `src/lib/push-service.server.ts` | **ADAPT** | Server Web Push delivery. Line 40 hardcodes `mailto:project1232026@gmail.com`; lines 12–13 contain commented legacy VAPID keys; notification types are academic. Require `VAPID_EMAIL` via env var and update payload types to workforce check-in events. |
| `src/lib/query-client.ts` | **KEEP** | Standard TanStack Query client configuration with default stale times. Works as-is. |
| `src/lib/rate-limit.server.ts` | **KEEP** | **Compliant with `AGENTS.md` Rule 8.** Firestore-backed sliding window rate limiter ensuring protection against brute-force attacks across serverless instances. |
| `src/lib/student-portal-data.server.ts` | **REMOVE** | Server loader for academic student portal data (grades, course attendance records). Academic-specific. |
| `src/lib/student-session.server.ts` | **REMOVE** | HMAC-SHA256 session token generator for passwordless student logins. ChecIN employees are real Firebase Auth accounts with custom claims (`AGENTS.md` Rule 31). |
| `src/lib/utils.ts` | **KEEP** | Standard Tailwind `cn()` helper (`clsx` + `tailwind-merge`). Generic and clean. |

---

### 2.8 Routes (`src/routes/*` — 38 files)

#### Public & Root Routes (13 files)

| File Path | Status | Action / Necessary Adaptation for ChecIN |
| :--- | :---: | :--- |
| `src/routes/__root.tsx` | **ADAPT** | Root HTML document shell. Contains KNUST page titles, meta descriptions, and `/knust-logo.svg` link. Replace with ChecIN branding, meta tags, and PWA configuration. |
| `src/routes/accept-invite.$token.tsx` | **ADAPT** | Onboarding for invited users. Currently branded as "QRoll" and designed for Teaching Assistants under a Lecturer. Adapt to corporate staff onboarding (Employee/Manager accepting invite to join Organization). |
| `src/routes/auth.tsx` | **ADAPT** | Authentication page. Currently geared for university staff. Adapt to corporate sign-in (Email/Password, Google OAuth) and Organization registration flow (Org Admin sign-up). |
| `src/routes/check-in.tsx` | **REMOVE** | Legacy student self-check-in screen (manual 6-digit code or screen scan). Superseded by ChecIN's dedicated kiosk display (`/kiosk`) and employee camera scan (`/scan`). |
| `src/routes/index.tsx` | **ADAPT** | Current landing page displays old KNUST student/lecturer marketing copy. Replace with the approved ChecIN marketing landing page (migrated from `preview.html`). |
| `src/routes/manual.tsx` | **REMOVE** | Embedded viewer for KNUST university attendance manual. Academic-specific. |
| `src/routes/portal.$token.index.tsx` | **REMOVE** | Student portal index via invite token. Academic-specific. |
| `src/routes/portal.$token.register.tsx` | **REMOVE** | Student course registration screen with KNUST crest. Academic-specific. |
| `src/routes/portal.$token.tsx` | **REMOVE** | Layout wrapper for student portal routes. Academic-specific. |
| `src/routes/privacy.tsx` | **ADAPT** | Privacy Policy page. Adapt from university student data policy to ChecIN SaaS: employee attendance logs, biometric/geofence privacy, and GDPR data processor commitments. |
| `src/routes/README.md` | **REMOVE** | Outdated QRoll route documentation. |
| `src/routes/student.tsx` | **REMOVE** | Complete student attendance portal application. Academic-specific. |
| `src/routes/terms.tsx` | **ADAPT** | Terms of Service page. Adapt from university policies to ChecIN B2B SaaS terms. |

#### API Routes (8 files)

| File Path | Status | Action / Necessary Adaptation for ChecIN |
| :--- | :---: | :--- |
| `src/routes/api/admin/roles.ts` | **ADAPT** | Admin SDK endpoint that sets Firebase custom claims. Adapt to set ChecIN claims `{ role, orgId, managerId }` where role is `org_admin \| manager \| employee`. Enforce caller authorization: only `org_admin` can assign roles within their own `orgId`. |
| `src/routes/api/admin/ta-invites.ts` | **ADAPT** | Staff invitation endpoint. Adapt from lecturer TA invites to corporate staff invites: `org_admin` invites managers and employees with pre-assigned roles and departments. |
| `src/routes/api/public/student-auth.ts` | **REMOVE** | Passwordless index-number authentication for students. Obsolete since all ChecIN users have standard Firebase Auth accounts. |
| `src/routes/api/push/notifications.ts` | **ADAPT** | Push notification delivery endpoint. Keep delivery logic, but update payload types to corporate check-in reminders and approval alerts. |
| `src/routes/api/push/preferences.ts` | **ADAPT** | User notification preferences endpoint. Update preference categories to match workforce events. |
| `src/routes/api/push/send.ts` | **ADAPT** | Push broadcast endpoint. Ensure sender is authorized as `org_admin` or `manager` within the target organization. |
| `src/routes/api/push/subscribe.ts` | **ADAPT** | Push subscription registration endpoint. Remove student session token handling; verify Firebase ID token directly. |
| `src/routes/api/push/vapid-key.ts` | **KEEP** | Public endpoint returning `process.env.VITE_VAPID_PUBLIC_KEY`. Generic and works as-is. |

#### Authenticated Routes (`src/routes/_authenticated/*` — 17 files)

| File Path | Status | Action / Necessary Adaptation for ChecIN |
| :--- | :---: | :--- |
| `src/routes/_authenticated/account.tsx` | **ADAPT** | User profile and active devices. Remove university staff ID / academic department fields; display Organization Name, Corporate Department, Role badge (`org_admin`, `manager`, `employee`), and Manager name. |
| `src/routes/_authenticated/announcements.tsx` | **ADAPT** | Broadcast notice board. Scope announcements by `orgId` and `departmentId` rather than lecturer course announcements. |
| `src/routes/_authenticated/assignments.tsx` | **REMOVE** | Academic assignment creation and student submission. Completely irrelevant to ChecIN. |
| `src/routes/_authenticated/courses.$courseId.tsx` | **REMOVE** | Academic course roster and syllabus view. Irrelevant to ChecIN. |
| `src/routes/_authenticated/courses.tsx` | **REMOVE** | Academic course catalog. Irrelevant to ChecIN. |
| `src/routes/_authenticated/departments.tsx` | **ADAPT** | Academic department list. Adapt to Organization Department Management (e.g. Engineering, Sales, Operations) managed by `org_admin` scoped by `orgId`. |
| `src/routes/_authenticated/history.tsx` | **ADAPT** | Attendance history log. Adapt from lecture sessions to employee clock-in/out records, showing timestamp, verification mode (Kiosk QR / Mobile GPS), location, and duration. |
| `src/routes/_authenticated/portal-links.tsx` | **REMOVE** | Generates student registration links for university courses. Irrelevant to ChecIN. |
| `src/routes/_authenticated/promotion.tsx` | **REMOVE** | Academic student promotion screen (promoting cohorts between levels). Irrelevant to ChecIN. |
| `src/routes/_authenticated/reports.tsx` | **ADAPT** | Analytics and export dashboard. Replace academic grading metrics (continuous assessment marks, 75% exam threshold) with workforce metrics: total hours worked, overtime, late arrivals, absence rates, and department timesheet exports. |
| `src/routes/_authenticated/route.tsx` | **ADAPT** | Layout guard for authenticated routes. Ensure custom claims `{ role, orgId }` are validated and redirect unauthorized roles (e.g. employee attempting to access org settings). |
| `src/routes/_authenticated/scan.tsx` | **REMOVE** | Lecturer QR code display during class. Replaced in ChecIN by dedicated `/kiosk` (fixed tablet display with rolling HMAC QR codes) and mobile employee camera scanner (`/scan`). |
| `src/routes/_authenticated/semesters.tsx` | **REMOVE** | Academic semester/trimester scheduler. Irrelevant to ChecIN. |
| `src/routes/_authenticated/sessions.tsx` | **REMOVE** | Academic lecture session runner. Replaced in ChecIN by live attendance monitoring and kiosk check-ins. |
| `src/routes/_authenticated/settings.tsx` | **ADAPT** | System settings. Adapt to Organization Settings: Organization Profile, Office Locations & Geofences, Kiosk Device Pairing, Work Shift Schedules, and Employee Invite Management. |
| `src/routes/_authenticated/students.tsx` | **REMOVE** | Academic student directory with student index numbers and levels. Replaced in ChecIN by an Employee / Staff Directory. |
| `src/routes/_authenticated/teaching-assistants.tsx` | **REMOVE** | Lecturer TA delegation. Replaced in ChecIN by Staff & Manager management. |

---

## 3. Hardcoded Secrets, Project IDs & Configuration Audit

The following sensitive credentials, project identifiers, and fallback configurations exist in the current codebase and must be remediated:

### 3.1 Hardcoded Secrets & Firebase Project Identifiers

| File Path | Line(s) | Hardcoded Value / Identifier | Severity | Required Remediation |
| :--- | :---: | :--- | :---: | :--- |
| `firebase-applet-config.json` | 2, 4, 5, 6, 7, 9 | `apiKey: "AIzaSyCtd8StOstj9HSp6Keq0Wl18WEYWW1ap0I"`<br>`projectId: "gen-lang-client-0546939058"`<br>`firestoreDatabaseId: "ai-studio-qrollapp-a10865e3-4f6f-44a2-a492-ba59ffef6658"`<br>`storageBucket: "gen-lang-client-0546939058.firebasestorage.app"`<br>`messagingSenderId: "367375080031"`<br>`appId: "1:367375080031:web:1e138a4d1fa3a4d04efb9e"` | **HIGH** | Delete or purge `firebase-applet-config.json`. Do not reuse this old QRoll Firebase project or credentials per `AGENTS.md`. |
| `src/integrations/firebase/config.ts` | 24, 27, 30, 33, 36, 39, 56 | Imports `firebase-applet-config.json` and uses its `apiKey`, `projectId`, and `firestoreDatabaseId` as default fallbacks. | **HIGH** | Remove import of `firebase-applet-config.json`. Enforce strict runtime requirement of `import.meta.env.VITE_FIREBASE_*`. |
| `src/integrations/firebase/admin.server.ts` | 91, 105 | Falls back to `appletConfig.projectId` and `appletConfig.firestoreDatabaseId` if environment variables are missing. | **HIGH** | Remove import of `firebase-applet-config.json`. Require `process.env.FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT`. |
| `src/lib/push-service.server.ts` | 12–13 | Commented-out sample / compromised VAPID key pairs in code comments. | **MEDIUM** | Remove commented key snippets from codebase. |
| `src/lib/push-service.server.ts` | 40 | Hardcoded fallback email: `mailto:project1232026@gmail.com` in `webpush.setVapidDetails()`. | **MEDIUM** | Require `VAPID_SUBJECT_EMAIL` from environment variables; fail fast if missing. |
| `APP_FEATURES_MANUAL.md` | 11 | References database ID `ai-studio-qrollapp-a10865e3-4f6f-44a2-a492-ba59ffef6658`. | **LOW** | Update documentation to reflect ChecIN architecture. |
| `.env.example` | 43 | Lists `STUDENT_SESSION_SECRET=`. | **LOW** | Remove academic student session secret; not used in ChecIN. |

---

## 4. Brand Leakage Audit: "QRoll" and "KNUST" Occurrences

The following occurrences of legacy brand names ("QRoll" and "KNUST") were identified across the codebase:

### 4.1 "QRoll" Occurrences

| File Path | Line(s) | Context / Snippet | Remediation |
| :--- | :---: | :--- | :--- |
| `src/routes/accept-invite.$token.tsx` | 19, 88 | Title: `"Accept Invitation — QRoll"`<br>Heading: `<h1>QRoll</h1>` | Change to ChecIN branding |
| `src/routes/_authenticated/teaching-assistants.tsx` | 23 | Title: `"Teaching Assistants — QRoll"` | Route marked for removal |
| `src/lib/device-manager.ts` | 35 | `const KEY = "qroll_device_id";` | Rename to `checin_device_id` |
| `src/lib/offline-queue.ts` | 15 | `const KEY = "qroll.offline.scans.v1";` | File marked for removal (`AGENTS.md` Rule 87) |
| `src/lib/public-origin.ts` | 6 | `const PUBLISHED_ORIGIN = "https://qroll-app.lovable.app";` | Update to ChecIN production domain |
| `src/routes/student.tsx` | 391, 392 | `qroll_student_profile_*`, `qroll_student_data_*` | Route marked for removal |
| `src/assets/qroll-loading.json` | 8 | `"nm": "QRoll Loading Animation"` | File marked for removal |
| `public/sw.js` | 1, 4, 60, 64, 100 | `// QRoll Official Web Push...`<br>`CACHE_NAME = "qroll-pwa-v2"`<br>`"New academic update from QRoll"`<br>`"qroll_${Date.now()}"`<br>`// Look for already open QRoll window` | Rebrand Service Worker to ChecIN |
| `firebase-blueprint.json` | 5 | `"description": "...staff member in QRoll."` | Update schema documentation |
| `DEPLOYMENT.md` | 1, 50 | Mentions QRoll repository and `qroll-logo.png` | Update deployment documentation |
| `README.md` | Multiple | Legacy QRoll README documentation | Update README for ChecIN |
| `roadmap.md` | 1 | `# QRoll — Master Roadmap` | Update roadmap for ChecIN |
| `scripts/generate-manual-pdf.mjs` | Multiple | Generates manual for `KNUST-ATTENDANCE-APP (QRoll)` | Script marked for removal |

---

### 4.2 "KNUST" Occurrences in `src/`

| File Path | Line(s) | Context / Snippet | Remediation |
| :--- | :---: | :--- | :--- |
| `src/config/public-backend.ts` | 3 | `export const APP_NAME = "KNUST ATTENDANCE APP";` | Change to `"ChecIN"` |
| `src/components/AppShell.tsx` | 18, 204, 208 | `import { KnustEmblem }...`<br>`<KnustEmblem size={28} />`<br>`KNUST ATTENDANCE APP` | Replace with ChecIN logo & nav |
| `src/components/DeviceLimitDialog.tsx` | 91 | `"Your KNUST Attendance account is currently signed in on..."` | Replace with ChecIN account copy |
| `src/components/PublicFooter.tsx` | 3, 10, 16 | `import { KnustEmblem }...`<br>`© KNUST ATTENDANCE APP · Smart Academic Attendance` | Replace with ChecIN footer |
| `src/components/PushNotificationManager.tsx` | 206, 269, 310 | `"Add KNUST ATTENDANCE APP to Home Screen..."`<br>`"KNUST Attendance Push Verified"`<br>`"KNUST Attendance app icon"` | Rebrand push notifications to ChecIN |
| `src/lib/exporters.ts` | 9, 21, 37, 53, 59, 77 | `"KNUST Attendance Report"`<br>`# KWAME NKRUMAH UNIVERSITY OF SCIENCE AND TECHNOLOGY (KNUST)`<br>`// Embed official KNUST crest logo`<br>`doc.setTextColor(0, 85, 43); // Official KNUST Green` | Rebrand report headers & colors for ChecIN |
| `src/styles.css` | 42, 49, 57, 77, 120, 135 | `/* KNUST Institutional Theme... */`<br>`--primary: oklch(0.38 0.125 148); /* KNUST Green */`<br>`--gold: oklch(0.76 0.17 80); /* KNUST Gold */`<br>`@utility bg-knust-gradient`<br>`@utility ring-knust` | Remove KNUST tokens; insert ChecIN theme |
| `src/routes/__root.tsx` | 82, 86, 88, 92, 97, 106, 109, 113, 118, 137 | Page title, OpenGraph tags, Apple meta tags, and `/knust-logo.svg` link | Update to ChecIN metadata & favicon |
| `src/routes/index.tsx` | 6, 7, 13, 17, 65, 68, etc. | Mentions "KNUST ATTENDANCE APP", imports `knust-students-hero.jpg` and `KnustEmblem` | Replace with ChecIN landing page |
| `src/routes/portal.$token.register.tsx` | 44, 50, 54, 317 | Mentions KNUST attendance QR code and imports `KnustEmblem` | Route marked for removal |

---

### 4.3 "KNUST" Occurrences Outside `src/`

| File Path | Line(s) | Context / Snippet | Remediation |
| :--- | :---: | :--- | :--- |
| `public/manifest.json` | 2, 3, 9, 10, 43 | `"name": "KNUST-ATTENDANCE-APP"`, `"short_name": "KNUST Attend"`, `theme_color: "#00552b"` | Update PWA manifest for ChecIN |
| `package.json` | 8 | `"prebuild": "node scripts/generate-manual-pdf.mjs"` | Remove script hook |
| `metadata.json` | 2, 3 | `"name": "KNUST ATTENDANCE APP"` | Update to ChecIN |
| `scripts/generate-manual-pdf.mjs` | Multiple | Generates KNUST university manual | Remove script |
| `public/app-manual.pdf` | Binary/PDF | Compiled university manual | Remove file |

---

## 5. Architectural Alignment with `AGENTS.md`

Every classification in this inventory is directly derived from the mandatory rules in `AGENTS.md`:

1. **Rule 2 (No Client-Trusted Roles):** `user_roles` collection is obsolete. Roles must live exclusively in Firebase Auth custom claims `{ role, orgId, managerId }` set via Admin SDK.
2. **Rule 3 & 4 (No Multi-Tenancy Leaks):** All database operations must be tenant-scoped by `orgId`. A user with claim `orgId: "org_abc"` cannot read or write data belonging to `orgId: "org_xyz"`.
3. **Rule 7 (Fresh Firebase Project):** Old credentials (`gen-lang-client-0546939058`) and `firebase-applet-config.json` must be completely abandoned.
4. **Rule 8 (Rate Limiting):** `src/lib/rate-limit.server.ts` is Firestore-backed and persistent across serverless invocations — explicitly retained as **KEEP**.
5. **Rule 31 (Real Firebase Accounts):** No passwordless student portals or HMAC session hacks (`student-session.server.ts` marked as **REMOVE**). All employees and managers authenticate via real Firebase Auth accounts.
6. **Rule 87 (Freshness & No Offline Scans):** Check-in QR codes have a 15-second TTL and require kiosk device proof. `src/lib/offline-queue.ts` is explicitly marked as **REMOVE** because offline queueing allows time-shifted replay attacks.

---

## 6. Proposed Next Steps (Awaiting User Review)

Once you review and approve this inventory, the recommended execution plan is:

1. **Step 1: Clean Up & Purge (No Risk):**
   - Delete the 26 academic asset files in `src/assets/`.
   - Delete the 6 obsolete libraries (`grading.ts`, `class-matching.ts`, `offline-queue.ts`, `student-session.server.ts`, `student-portal-data.server.ts`, `lovable-error-reporting.ts`).
   - Delete the 18 academic routes and portals.
   - Remove `scripts/generate-manual-pdf.mjs` and remove `"prebuild"` from `package.json`.

2. **Step 2: Core Infrastructure Adaptation:**
   - Update `src/styles.css` with ChecIN branding design tokens (replacing KNUST green/gold).
   - Harden `src/integrations/firebase/config.ts` and `admin.server.ts` (strip hardcoded config fallbacks; require env vars).
   - Update `src/lib/auth-claims.ts` and `src/lib/auth.ts` to implement `{ role: 'org_admin' | 'manager' | 'employee', orgId, managerId }`.

3. **Step 3: Security & Tenancy Rules:**
   - Rewrite `firestore.rules` for ChecIN multi-tenancy and default-deny protection.

4. **Step 4: Corporate Navigation & Route Migration:**
   - Adapt `src/components/AppShell.tsx` for ChecIN corporate navigation.
   - Migrate ChecIN marketing landing page into `src/routes/index.tsx` (using copy from `ChecIN-Landing-Copy.md` / `preview.html`).
   - Implement core ChecIN workforce routes (`/kiosk`, `/scan`, `/reports`, `/settings`).
