# QRoll — Master Roadmap

Source: Bernard's "Complete App Upgrade and Development Instructions".
Status: [x] done · [~] partial · [ ] pending

## Phase 1 — Scanner + reports + credits (DONE)

- [x] Faster, non-blocking scanner (per-code lock, dedupe, confirmation beep)
- [x] Remove "Scans recorded" from dashboard
- [x] Report filters: Present / Absent / All (exports follow the filter)
- [x] Attendance grading: user-set weight (e.g. 5%) + auto score column
- [x] Developer credit card in Settings → About (Bern Studio / Agbenyo Bernard Atsu)

## Phase 2 — Offline attendance (DONE)

- [x] Local scan queue with original timestamps
- [x] Offline banner + pending count + manual "Sync now"
- [x] Auto-sync on reconnect, duplicate-safe replay

## Phase 3 — Student self-service portal (DONE)

- [x] Homepage "Student Page" button (header + hero)
- [x] Index-number lookup → first-time password creation (hashed, server-side)
- [x] Student login (index + password) + secure reset via email on record
- [x] Student dashboard: attendance %, present/absent sessions, warnings
- [x] Strict isolation: a student sees only their own records
- [x] Self-registration page from the portal link

## Phase 4 — Reports upgrade (DONE)

- [x] Complete compilation report per course (all sessions rolled up)
- [x] Single-session/day report download
- [x] PDF / Excel / CSV export parity

## Phase 5 — Academic semester management + archive

- [x] Academic year + semester terms, current-semester marker
- [x] End-of-semester archive prompt; lock + preserve
- [x] New courses auto-join the current semester
- [x] Academic History dashboard + cross-semester search (course & student views, archive search, Excel/CSV/PDF export)
- [~] Historical reports (course + student attendance done; department/tutor workload pending)
- [ ] Role-based access: super admin / dept head / tutor / TA / student

## Phase 6 — Assignments, announcements, notifications

- [x] Assignments with deadlines + submission links (tutor page + student feed)
- [x] Tutor messaging to a level, several levels, or all classes (Announcements page + student feed)
- [ ] Web push notifications (PWA installed / added to home screen)
- [ ] Smart alerts: attendance < 75%, quizzes, room changes, cancellations

## Phase 7 — Billing (Paystack)

- [~] Plans, billing page, webhook route, test-mode toggle in place
- [ ] Live Paystack keys once the account is verified

## Phase 8 — Hardening, performance, scale report

- [ ] Full bug/security/database sweep + written report
- [ ] Indexes, pagination, query batching for 1000+ users and large attendance tables
- [ ] Geofence + parent-QR verification pass (behaviour unchanged, accuracy fixed)
- [ ] Animation/perf polish pass across all pages

## Cross-cutting

- Single account type: tutors/admins only. Students are records, never auth users.

## Repository / self-hosting (DONE)

- [x] All images, videos, PDF and icons committed as real files in `src/assets` and `public`
- [x] Public backend URL/key committed in `src/config/public-backend.ts` so a plain clone runs without a .env file
- [x] `.env.example` + `DEPLOYMENT.md` (Vercel steps, migrations, webhook URL)
