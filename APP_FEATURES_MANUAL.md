# KNUST QR Attendance & Academic Management System
## Comprehensive System Manual & Feature Guide

This document provides a thorough walkthrough of every portal, page, role, and feature in the KNUST QR Attendance web application.

---

## 1. System Architecture & Core Technology

- **Framework**: React 18, Vite, TypeScript, Tailwind CSS, TanStack Router.
- **Backend & Persistence**: Firebase Firestore (`ai-studio-qrollapp-a10865e3-4f6f-44a2-a492-ba59ffef6658`) & Firebase Authentication.
- **Offline / PWA**: Progressive Web App with service worker caching (`sw.js`), web app manifests (`manifest.webmanifest`), and install prompts for Android/iOS/Desktop.
- **Notifications**: Web Push (VAPID via PushManager) and In-App persistent notification bell feed stored in Firestore.
- **Attendance Verification**:
  - **Dynamic Rolling QR Code**: 10-second auto-refreshing cryptographic token displayed on classroom projector/lecturer screen.
  - **GPS Geofencing**: Validates student coordinates against classroom location within defined radius (e.g., 50m).
  - **Single Device Lock**: Anti-proxy hardware/device fingerprinting prevents one student logging in for others.
  - **Universal Student QR Badge**: Static/persistent student QR code for rapid physical scanning by Lecturer or TA.

---

## 2. Pages & Portals Overview

### 1. Landing Page (`/` or `/login`)
- **Role Routing Gateway**: Clean entry point for Students, Lecturers, TAs, and System Administrators.
- **PWA Install Guide**: Browser detection showing installation steps for Safari (iOS "Add to Home Screen"), Chrome (Android/Desktop), and Edge.
- **System Status Bar**: Visual badge indicating system connectivity and live database status.

---

### 2. Student Portal (`/student`)
Accessible by students using their official KNUST Index Number.

#### A. Authentication & Onboarding
- **Index Number Lookup**: Validates whether the student is on university rosters.
- **First-time Activation**: Secure password creation with verification.
- **Password Reset Flow**: Self-service reset using student registration credentials.

#### B. Dashboard Header & Academic Standing
- **Verified Student Badge**: Displays Name, Index Number, Program, and Academic Level (e.g., Level 200).
- **Running Attendance Indicator**: Overall semester attendance percentage with letter grade standing.
- **Attendance Risk Warnings**: Automatic banners alerting students when attendance in any course falls below the mandatory 75% final exam eligibility threshold.
- **Multi-Lecturer Scope Filter**: Filter courses and metrics by individual lecturer or view consolidated across all courses.

#### C. Student Dashboard Tabs
1. **My QR Pass (Universal Pass)**:
   - Unique QR code tied to the student's index number.
   - Works across **all courses and all lecturers** without needing separate codes.
   - **Save PNG** & **Print Pass** buttons for offline physical ID presentation.
2. **Attendance Tab**:
   - Detailed course cards showing Percentage, Total Held Sessions, Attended, Missed, and Late counts.
   - Exam eligibility status badge ("Eligible" vs "At Risk (<75%)").
   - Direct lecturer contact link via email.
3. **Coursework & Submissions**:
   - View pending, submitted, and graded assignments.
   - Upload homework/assignment files with timestamps.
4. **Timetable / Schedule**:
   - Weekly lecture timetable, classroom venues, and course start times.
5. **Excuses & Absence Requests**:
   - Submit medical/official absence justifications with document attachments.
   - Track approval status (Pending, Approved, Rejected) from course lecturers.
6. **Academic Resources**:
   - Download syllabus, lecture slides, past questions, and recommended readings.
7. **Announcements**:
   - Course and departmental notices published by lecturers or administrators.
8. **In-App Notification Bell**:
   - Dropdown bell in the top navigation with unread count badge.
   - Clicking opens full alert details in a modal dialogue with related page links.

---

### 3. Student Projector Check-In (`/check-in`)
Designed for students inside lecture halls when a dynamic QR is projected:
- **In-Browser Camera Scanner**: Scans the rotating QR code projected at the front of the classroom.
- **GPS Verification**: Automatically verifies the student is inside the lecture theatre.
- **Anti-Proxy Device Lock**: Verifies device identity to block proxy attendance.
- **Fallback Code Entry**: 6-digit backup entry code if camera scanning is unavailable.

---

### 4. Lecturer & Admin Portal (`/_authenticated/*`)

#### A. Dashboard (`/`)
- Real-time attendance statistics, active classroom sessions, total enrolled students, and at-risk student summaries.

#### B. Live Attendance Session (`/session` or `/active-session`)
- **Projector Mode**: Fullscreen high-contrast display generating dynamic rolling QR codes that refresh every 10 seconds.
- **Live Roster Feed**: Real-time counter of students checking in second-by-second.
- **Manual Attendance Fallback**: Quick search to mark students present/late/excused if their device has a battery failure.

#### C. Courses Management (`/courses`)
- Add, edit, or archive courses.
- Assign course codes, credit hours, semesters, and departments.
- Bulk student roster import via CSV/Excel spreadsheets.

#### D. Student Rosters (`/students`)
- Directory of all registered students with index numbers, programs, levels, and contact info.
- Export student QR badges in bulk for printing physical class identification cards.

#### E. Absence Requests (`/absences` or `/excuses`)
- Review submitted absence excuses from students.
- View doctor's notes/attached evidence and approve or deny with custom notes.

#### F. Announcements (`/announcements`)
- Compose and broadcast notices to specific courses or the entire department.
- Triggers instant push notifications to enrolled students' devices.

#### G. Reports & Analytics (`/reports`)
- Comprehensive exportable attendance sheets (CSV, Excel, PDF).
- 75% exam disqualification list generation for university examination offices.
- Trend analytics comparing attendance rates by time of day, day of week, and course.

#### H. Settings & Device Control (`/settings`)
- Geofence classroom coordinates (latitude, longitude, radius).
- Anti-proxy strictness controls.
- Device reset requests (allows students who lost or changed their phone to re-register).

---

### 5. Teaching Assistant (TA) Scanner (`/scanner`)
- Optimized for mobile phone cameras.
- Enables TAs and lecturers to rapidly scan students' Universal QR Passes at classroom doorways.
- Audible beep and visual confirmation on successful check-in.

---

## 3. How the Offline & PWA Features Function
- The web app installs as a native-like icon on mobile home screens.
- Cached shell allows viewing timetables and previous attendance records even without active internet.
- Push notifications wake the device for urgent class cancellations or room reassignments.
