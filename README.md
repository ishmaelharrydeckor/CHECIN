# KNUST Attendance Management System (QRoll)
### Kwame Nkrumah University of Science and Technology (KNUST)

A modern, production-ready, mobile-responsive University Attendance Management and Continuous Assessment Web Application engineered for KNUST. The system supports Lecturers, Teaching Assistants, Department Administrators, and Students across Level 100 to 400 courses. It features real-time dynamic QR code generation, GPS geofencing anti-cheating, multi-camera door scanning, offline-capable PWA synchronization, automated 10-mark university grading, push notifications, and detailed Excel/PDF exports.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Folder & File Directory Breakdown](#folder--file-directory-breakdown)
   - [Root Configuration Files](#root-configuration-files)
   - [Public Assets (`/public`)](#public-assets-public)
   - [Automation Scripts (`/scripts`)](#automation-scripts-scripts)
   - [Source Code (`/src`)](#source-code-src)
     - [Entry Points & Routing](#entry-points--routing)
     - [Routes & Pages (`/src/routes`)](#routes--pages-srcroutes)
     - [Shared Components (`/src/components`)](#shared-components-srccomponents)
     - [Design System & UI Components (`/src/components/ui`)](#design-system--ui-components-srccomponentsui)
     - [Core Business Logic & Utilities (`/src/lib`)](#core-business-logic--utilities-srclib)
     - [Firebase & Cloud Services (`/src/integrations/firebase`)](#firebase--cloud-services-srcintegrationsfirebase)
     - [Static Media & Branding (`/src/assets`)](#static-media--branding-srcassets)
3. [Firestore Database Schema](#firestore-database-schema)
4. [Key Operational Workflows & Code Contributions](#key-operational-workflows--code-contributions)
   - [1. Projected QR Code Attendance with Geofencing](#1-projected-qr-code-attendance-with-geofencing)
   - [2. Multi-Camera Door Scanner & Offline Queue](#2-multi-camera-door-scanner--offline-queue)
   - [3. Student QR Pass Portal & Push Notifications](#3-student-qr-pass-portal--push-notifications)
   - [4. Automated 10-Mark Continuous Assessment (CA) Engine](#4-automated-10-mark-continuous-assessment-ca-engine)
5. [Security & Access Control Rules](#security--access-control-rules)
6. [Offline PWA Support](#offline-pwa-support)

---

## High-Level Architecture

```
                                  +-----------------------------------------------+
                                  |              TanStack Start & Router          |
                                  |          Vite + React 18 + Tailwind CSS       |
                                  +-----------------------+-----------------------+
                                                          |
                  +---------------------------------------+---------------------------------------+
                  |                                       |                                       |
    +-------------v-------------+           +-------------v-------------+           +-------------v-------------+
    |    Lecturer / Admin UI    |           |    Student Portal (PWA)   |           |    Self Check-In Portal   |
    |  - Dashboard & Analytics  |           |  - Personal QR Pass       |           |  - Geofence Verification  |
    |  - Camera Scanner (/scan) |           |  - Push Notifications     |           |  - Dynamic Token Match    |
    |  - Sessions & Reports     |           |  - Course Grades & Stats  |           |  - Instant Check-in       |
    +-------------+-------------+           +-------------+-------------+           +-------------+-------------+
                  |                                       |                                       |
                  +---------------------------------------+---------------------------------------+
                                                          |
                                  +-----------------------v-----------------------+
                                  |         Firebase Firestore & Auth             |
                                  |   - attendance_sessions                       |
                                  |   - attendance_records                        |
                                  |   - students & student_users                  |
                                  |   - courses & enrollments                     |
                                  +-----------------------------------------------+
```

---

## Folder & File Directory Breakdown

### Root Configuration Files

*   **`package.json`**: Defines all npm dependencies, scripts (`dev`, `build`, `start`, `lint`), metadata, and project settings.
*   **`vite.config.ts`**: Configures the Vite bundler, TanStack Router Vite plugin, Tailwind CSS integration, and build aliases (`@/*` pointing to `/src/*`).
*   **`app.config.ts`**: TanStack Start / Nitro SSR configuration specifying server routing, assets, and deployment runtime.
*   **`tsconfig.json`**: TypeScript compiler configuration including strict type checking, path mapping, and JSX transformations.
*   **`metadata.json`**: Application registry defining system capabilities, frame permissions (`camera`, `geolocation`), and app description.
*   **`firestore.rules`**: Production Firebase security rules governing authenticated and public access. Enforces that public check-ins can create valid `attendance_records` while restricting administrative modifications to authenticated staff.
*   **`firebase-blueprint.json`**: Structural declaration of all database entities, data types, security relationships, and collections for Firebase provisioning.
*   **`firebase-applet-config.json`**: Environment and runtime credentials connecting the application to Google Cloud and Firebase Firestore.

---

### Public Assets (`/public`)

*   **`app-manual.pdf`**: The official, downloadable 5-page university documentation covering page directories, dynamic QR codes, student onboarding, continuous assessment calculations, and troubleshooting.
*   **`manifest.json` / `manifest.webmanifest`**: Web App Manifest defining standalone PWA capabilities, theme colors (`#00381C`), app name, display modes, and responsive icons.
*   **`sw.js`**: Service worker script providing offline caching of static assets, runtime script management, and web push notification listeners.
*   **`knust-logo.jpg`, `knust-logo.svg`, `favicon.png`, `apple-touch-icon-180x180.png`**: Official KNUST university emblems and responsive browser icons.
*   **`robots.txt`**: Search engine crawler policy indexing public informational pages while protecting private management routes.

---

### Automation Scripts (`/scripts`)

*   **`scripts/generate-manual-pdf.mjs`**: Standalone Node.js script using `jspdf` and `jspdf-autotable` to generate the official university manual (`public/app-manual.pdf`). Includes custom header/footer bands in KNUST deep green (`#00381C`) and gold (`#F5A623`), route directories, operational instructions, and FAQ tables.

---

### Source Code (`/src`)

#### Entry Points & Routing

*   **`src/router.tsx`**: Initializes TanStack Router with history management, custom error boundaries, not-found handlers, and preloading strategies.
*   **`src/routeTree.gen.ts`**: Auto-generated route tree linking all file-based routes in `src/routes/` to type-safe TanStack navigation.
*   **`src/styles.css`**: Global stylesheet importing Tailwind CSS, custom color variables (KNUST Green, Gold, Neutral Grays), and font configurations.
*   **`src/start.ts` & `src/server.ts`**: TanStack Start server runtime handling SSR pipelines and API route executions.

---

#### Routes & Pages (`/src/routes`)

##### Public Routes (Accessible without Lecturer Login)

*   **`src/routes/__root.tsx`**: Root layout wrapper providing top-level error boundaries, TanStack Query providers, and PWA setup across all views.
*   **`src/routes/index.tsx`**: Public institutional landing page. Showcases feature overviews, direct portal entry points for students and tutors, and system status.
*   **`src/routes/student.tsx`**: **Student QR Portal**.
    *   *Sign In & Sign Up*: Students enter their university index number and registered email to activate their account, set a password, or sign in. Includes a prominent KNUST student banner image.
    *   *My QR Pass*: Displays a high-resolution, secure student QR code with one-tap download and screen brightness tips.
    *   *Course & Attendance Overview*: Lists registered courses, total sessions attended, Continuous Assessment score (out of 10), and exam qualification status (75% threshold).
    *   *Push Notification Enrollment*: Includes a high-contrast action button enabling browser push notifications for class alerts.
    *   *Projector Check-In Shortcut*: Direct link to the GPS-based `/check-in` route for instant hall self check-in.
*   **`src/routes/check-in.tsx`**: **Projected Hall Self Check-In Page**.
    *   Permits students in a lecture hall to self-check-in by scanning the rotating projector QR code or entering a session ID.
    *   *Geolocation & Geofencing*: Automatically requests GPS coordinates, computes the distance using the Haversine formula, and verifies whether the student is within the lecturer's venue boundary (e.g., 100 meters).
    *   *Duplicate Protection*: Validates against existing `attendance_records` to prevent double-marking.
*   **`src/routes/manual.tsx`**: **Interactive System Manual & Knowledge Base**.
    *   Searchable guides for Lecturers, Students, and Administrators.
    *   Respects user authentication state: displays a "Dashboard" link for signed-in staff and a "Tutor Sign In" link for unauthenticated visitors.
    *   One-click download link for the official PDF manual (`/app-manual.pdf`).
*   **`src/routes/auth.tsx`**: Lecturer and administrative authentication view (Sign In / Account Registration / Password Reset) using Firebase Authentication.
*   **`src/routes/privacy.tsx` & `src/routes/terms.tsx`**: Academic compliance, privacy policy, and terms of service documents.
*   **`src/routes/portal.$token.tsx`**: Public course portal token gateway for course registration and public enrollment access.

##### Authenticated Tutor & Lecturer Routes (`/src/routes/_authenticated`)

*   **`src/routes/_authenticated/route.tsx`**: Route protection guard verifying active Firebase user sessions. Redirects unauthenticated visitors to `/auth`.
*   **`src/routes/_authenticated/dashboard.tsx`**: Main administrative dashboard displaying aggregate real-time metrics (Total Students, Courses, Active Sessions, Today's Present/Absent counts), quick-action links, and attendance rate charts.
*   **`src/routes/_authenticated/sessions.tsx`**: **Classroom Session Management**.
    *   Create new attendance sessions with course code, venue name, start time, and duration.
    *   Configure GPS geofence coordinates and allowed attendance radius.
    *   *Project QR Modal*: High-contrast, full-screen rotating dynamic QR code display for lecture hall projector screens with a 6-digit backup PIN.
*   **`src/routes/_authenticated/scan.tsx`**: **Multi-Camera QR Code Scanner**.
    *   Connects to front or rear device camera via `html5-qrcode` to scan student QR badges at the door.
    *   Features instant audio feedback (chime on success, beep on error) and visual success cards.
    *   *Manual Fallback Bar*: Allows typing student index numbers directly when a phone is unavailable.
    *   *Offline Resilience*: Seamlessly queues check-ins when internet drops and synchronizes them upon reconnection.
*   **`src/routes/_authenticated/reports.tsx`**: **Attendance Reports & 10-Mark Grading**.
    *   Filters by course, semester, and academic year.
    *   Computes standard KNUST Continuous Assessment scores `(Attended / Total) * 10`.
    *   Highlights at-risk students below 75% attendance with warning badges.
    *   One-click exports to Microsoft Excel (`.xlsx`), CSV, and printable PDF documents.
*   **`src/routes/_authenticated/courses.tsx` & `courses.$courseId.tsx`**: Course creation, syllabus details, assigned lecturers, credit hours, and enrolled student rosters.
*   **`src/routes/_authenticated/students.tsx`**: Student directory management supporting manual student addition and bulk roster spreadsheet import (Excel/CSV).
*   **`src/routes/_authenticated/assignments.tsx`**: Coursework tasks, assignment distribution, deadlines, and student submission tracking.
*   **`src/routes/_authenticated/announcements.tsx`**: Broadcast announcement manager dispatching notices to student dashboards and web push subscribers.
*   **`src/routes/_authenticated/departments.tsx`**: Department taxonomy manager (e.g., Computer Science, Electrical Engineering).
*   **`src/routes/_authenticated/semesters.tsx`**: Academic calendar manager for switching active semesters and archiving previous term records.
*   **`src/routes/_authenticated/history.tsx`**: Historical attendance log viewer for auditing past records.
*   **`src/routes/_authenticated/portal-links.tsx`**: Generates secure shareable student registration portal links with token expiration.
*   **`src/routes/_authenticated/billing.tsx`**: Paystack payment gateway integration for institutional licensing and billing management.
*   **`src/routes/_authenticated/settings.tsx`**: Lecturer profile settings, notification preferences, and device management controls.

##### API Server Functions (`/src/routes/api`)

*   **`src/routes/api/public/student-auth.ts`**: Secure server endpoint for student index number verification, password hashing, and token generation.
*   **`src/routes/api/public/webhooks/paystack.ts`**: Webhook endpoint verifying cryptographic signatures from Paystack for payment receipts.
*   **`src/routes/api/push/subscribe.ts`**: Registers Web Push API endpoints, encryption keys (`p256dh`, `auth`), and user IDs in Firestore.
*   **`src/routes/api/push/vapid-key.ts`**: Exposes the public VAPID key to the client service worker.
*   **`src/routes/api/push/send.ts`**: Server dispatcher utilizing `web-push` to trigger push alerts on student smartphones.

---

#### Shared Components (`/src/components`)

*   **`src/components/AppShell.tsx`**: The master authenticated application layout. Provides the responsive navigation sidebar, mobile bottom bar, user profile dropdown, breadcrumbs, and semester indicator.
*   **`src/components/KnustEmblem.tsx`**: Vector and image emblem component rendering the official KNUST crest across headers and modals.
*   **`src/components/PushNotificationManager.tsx`**: High-contrast UI card and button prompting students to grant web push notification permissions.
*   **`src/components/PublicFooter.tsx`**: Reusable public footer displaying university accreditation, copyright, and system links.
*   **`src/components/SplashScreen.tsx`**: Animated initial loading screen displaying KNUST branding during asset hydration.
*   **`src/components/BrandVideo.tsx`**: Embedded promotional and tutorial video player highlighting the QRoll attendance workflow.
*   **`src/components/DeviceLimitDialog.tsx`**: Security modal warning users when account access limits are detected on unrecognized devices.

---

#### Design System & UI Components (`/src/components/ui`)

Complete accessible component library built using Radix UI primitives and styled with Tailwind CSS:

| Component | File Path | Purpose |
| :--- | :--- | :--- |
| **Button** | `src/components/ui/button.tsx` | Accessible button with variants (default, outline, ghost, destructive, link). |
| **Card** | `src/components/ui/card.tsx` | Container cards for dashboard metrics, forms, and student lists. |
| **Dialog / Modal** | `src/components/ui/dialog.tsx` | Modal overlays for session projection, student creation, and exports. |
| **Tabs** | `src/components/ui/tabs.tsx` | Accessible tabs used in student portal, manual, and course management. |
| **Input / Textarea** | `src/components/ui/input.tsx` | Form input fields with validation states and focus rings. |
| **Table** | `src/components/ui/table.tsx` | Structured data tables for student rosters and attendance sheets. |
| **Badge** | `src/components/ui/badge.tsx` | Status indicators (Present, Absent, Late, Disqualified, Active). |
| **Select / Dropdown**| `src/components/ui/select.tsx` | Dropdown selectors for courses, semesters, and camera choices. |
| **Toast (Sonner)** | `src/components/ui/sonner.tsx` | Real-time toast notifications for user interactions. |

*(Also includes `accordion`, `alert`, `avatar`, `breadcrumb`, `calendar`, `checkbox`, `drawer`, `sheet`, `sidebar`, `progress`, `slider`, `switch`, `tooltip`)*.

---

#### Core Business Logic & Utilities (`/src/lib`)

*   **`src/lib/auth.ts`**: Authentication state machine. Integrates Firebase Auth, manages session tokens, user profiles, and role checks (`isAdmin`, `isLecturer`).
*   **`src/lib/grading.ts`**: **KNUST Continuous Assessment Engine**. Calculates student attendance rates, converts percentages to the 10-mark continuous assessment score, and determines examination eligibility (75% threshold).
*   **`src/lib/offline-queue.ts`**: IndexedDB storage manager that buffers attendance scans when internet is offline and automatically flushes them to Firestore once online.
*   **`src/lib/exporters.ts`**: Data transformation utility producing Excel sheets (`xlsx`), CSV files, and PDF summaries of attendance records.
*   **`src/lib/device-manager.ts`**: Device fingerprinting utility that logs active browser sessions and enforces multi-device security rules.
*   **`src/lib/push-client.ts`**: Client-side Web Push API helper converting VAPID keys, registering service worker push subscriptions, and managing device state.
*   **`src/lib/push-service.server.ts`**: Server-side Web Push dispatcher utilizing `web-push` to broadcast alerts to subscribed devices.
*   **`src/lib/paystack.functions.ts`**: Paystack payment helper for subscription verification and transaction initialization.
*   **`src/lib/query-client.ts`**: TanStack Query (React Query) client configuration with caching, refetching, and hydration policies.
*   **`src/lib/utils.ts`**: Styling helper combining `clsx` and `tailwind-merge` (`cn(...)`).

---

#### Firebase & Cloud Services (`/src/integrations/firebase`)

*   **`src/integrations/firebase/config.ts`**: Initializes client-side Firebase SDK with Firestore and Auth instances using `firebase-applet-config.json`.
*   **`src/integrations/firebase/admin.server.ts`**: Server-side Firebase Admin SDK initialization for privileged background operations and webhook handling.
*   **`src/integrations/firebase/firestore-rest.ts`**: REST API fallback client for querying Firestore in environments where native WebSockets are restricted.

---

#### Static Media & Branding (`/src/assets`)

*   **`knust-crest.jpg` & `knust-logo.jpg`**: High-resolution official university heraldry.
*   **`knust-students-hero.jpg` & `.webp`**: KNUST campus and student photograph utilized on student portal login cards.
*   **`qroll-intro-landscape.mp4` & `qroll-promo.mp4`**: High-definition video demos showcasing scanning workflows and institutional benefits.

---

## Firestore Database Schema

| Collection | Key Fields | Purpose |
| :--- | :--- | :--- |
| **`attendance_sessions`** | `id`, `course_id`, `created_by`, `date`, `start_time`, `duration_minutes`, `is_active`, `geofence_lat`, `geofence_lng`, `radius_meters`, `projector_token` | Represents an individual lecture attendance session. |
| **`attendance_records`** | `id`, `session_id`, `student_id`, `student_index`, `course_id`, `timestamp`, `status`, `method`, `latitude`, `longitude` | Logs individual student attendance entries. |
| **`students`** | `id`, `index_number`, `full_name`, `email`, `department`, `program`, `level`, `academic_year` | University student directory. |
| **`student_users`** | `id` (index number), `email`, `password_hash`, `created_at`, `last_login` | Student portal credentials for dashboard and QR pass access. |
| **`courses`** | `id`, `code`, `title`, `department_id`, `level`, `credit_hours`, `semester_id`, `lecturer_id` | Academic courses directory. |
| **`enrollments`** | `id`, `course_id`, `student_id`, `academic_year` | Many-to-many relationship linking students to registered courses. |
| **`push_subscriptions`**| `id`, `user_id`, `user_type`, `endpoint`, `keys_p256dh`, `keys_auth`, `created_at` | Web push notification subscription tokens. |
| **`announcements`** | `id`, `course_id`, `title`, `content`, `author_id`, `created_at` | Class announcements broadcast to student dashboards. |

---

## Key Operational Workflows & Code Contributions

### 1. Projected QR Code Attendance with Geofencing
1.  **Lecturer Action (`sessions.tsx`)**: The lecturer creates an active session and opens the "Project QR" view. A dynamic QR code with a rotating security token and a 6-digit backup PIN is displayed on the projector screen.
2.  **Student Action (`check-in.tsx`)**: A student in the hall navigates to `/check-in` on their smartphone.
3.  **Validation**:
    *   The app requests GPS coordinates via `navigator.geolocation`.
    *   The Haversine algorithm calculates the student's distance to the lecturer's lecture hall coordinates.
    *   If within the configured radius (e.g., 100m) and the token matches, the check-in is saved to `attendance_records`.
    *   Duplicate check-ins are blocked by querying existing entries for that `session_id` and `student_id`.

### 2. Multi-Camera Door Scanner & Offline Queue
1.  **Scanner Route (`scan.tsx`)**: The lecturer or TA opens `/scan` on their smartphone or laptop.
2.  **Camera Feed**: Leverages `html5-qrcode` to decode student QR passes.
3.  **Feedback**: Plays an instant audio chime and displays a student verification badge.
4.  **Offline Support (`offline-queue.ts`)**: If Wi-Fi or cellular data drops, the check-in is persisted to browser IndexedDB storage and automatically uploaded once connectivity resumes.

### 3. Student QR Pass Portal & Push Notifications
1.  **Student Sign Up & In (`student.tsx`)**: Students authenticate using their university index number and registered email.
2.  **Digital QR Pass**: Generates a high-contrast QR identifier that can be presented to any door scanner.
3.  **Push Notifications (`PushNotificationManager.tsx` & `push-client.ts`)**: Students tap "Enable Notifications" to register their browser's push endpoint. Lecturers can send real-time class alerts and deadline reminders.

### 4. Automated 10-Mark Continuous Assessment (CA) Engine
1.  **Grading Algorithm (`grading.ts`)**:
    $$\text{CA Mark} = \min\left(10, \operatorname{round}\left(\frac{\text{Sessions Attended}}{\text{Total Held Sessions}} \times 10, 1\right)\right)$$
2.  **Disqualification Threshold**: Students with an attendance rate below $75\%$ are flagged as "Disqualified from Examination".
3.  **Reports (`reports.tsx` & `exporters.ts`)**: Lecturers can export comprehensive grading sheets directly to Excel (`.xlsx`) or PDF.

---

## Security & Access Control Rules

*   **Database Rules (`firestore.rules`)**:
    *   `attendance_records`: Public `create` is permitted so students can submit self check-ins from the lecture hall, subject to schema validation. Read, update, and delete actions are restricted to verified lecturers and administrators.
    *   `courses`, `students`, `attendance_sessions`: Only authenticated academic staff can write or modify records.
*   **Anti-Tampering**:
    *   QR codes contain secure identifiers rather than raw student index numbers to prevent spoofing.
    *   Projector tokens refresh periodically to prevent students from sharing static screenshots outside the venue.
    *   Geofence checks ensure that self check-ins originate from within the physical lecture hall.

---

## Offline PWA Support

*   **Service Worker (`public/sw.js`)**: Caches critical application shells, stylesheets, and fonts.
*   **Installable**: Supported on Android Chrome, iOS Safari ("Add to Home Screen"), Windows, and macOS.
*   **Local Data Queue**: The scanner saves records locally if disconnected, ensuring lecture hall check-ins never halt due to network interruptions.
