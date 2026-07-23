# DiTeLe — UI Audit (all roles)

Captured 2026-07-23 from the **local dev app** (`http://127.0.0.1:3107`, seeded data) by logging in as each role. 46 screenshots under `screenshots/{public,student,trainer,admin}/`.

**Two caveats about these captures:**
1. **Unstyled rendering.** The headless capture browser doesn't run the app's client JS, so pages render as raw HTML (no CSS layout). All *content* is present and readable — this is fine for auditing *what exists*, just not the visual polish. (Login still worked via the server-action form.)
2. **4 pages return HTTP 500** (pre-existing bugs, not caused by the DB cleanup — verified: no kept code or DB function references any dropped table):
   - `admin/04-course-people` (assign students/trainers) · `admin/10-arena` · `admin/11-feedback` · `trainer/08-arena`

Local seed logins (all password `123123123`): `learner@ditele.local`, `trainer@ditele.local`, `admin@ditele.local`.

---

## 1. Public (logged out) — `screenshots/public/`
| # | Route | Screenshot | Notes |
|---|---|---|---|
| 01 | `/de` | ![](screenshots/public/01-home.png) | Marketing home. Stats: **4 Kurse im Katalog, 12 Aufgaben, 3 Sprachen**. 4-step "So funktioniert's". Catalog teaser lists published courses. |
| 02 | `/de/catalog` | ![](screenshots/public/02-catalog.png) | Public course catalog with search. |
| 03 | `/de/about` | ![](screenshots/public/03-about.png) | "Über uns" — mission / audience / contact. |
| 04 | `/de/faq` | ![](screenshots/public/04-faq.png) | **⚠ Stage+Group wording:** "Ein Kurs besteht aus mehreren **Stufen**…" and "…weist Sie einer **Gruppe** zu." |
| 05 | `/de/legal` | ![](screenshots/public/05-legal.png) | Impressum (§5 DDG). |
| 06 | `/de/privacy` | ![](screenshots/public/06-privacy.png) | **⚠ Group wording:** "**Gruppenzugehörigkeit**", "…Abgaben und Fragen der **Gruppen**, die sie betreuen." |
| 07 | `/de/login` | ![](screenshots/public/07-login.png) | Email+password. Rate-limits repeated attempts ("Zu viele Versuche"). |
| 08 | `/de/register` | ![](screenshots/public/08-register.png) | Account creation. |

## 2. Student — `screenshots/student/` (learner@ditele.local)
| # | Route | Screenshot | Notes |
|---|---|---|---|
| 01 | `/de/learn` | ![](screenshots/student/01-learn.png) | Dashboard: continue-learning, active courses, open tasks. Badges "Zugeteilt"/"Aktiv". |
| 02 | `/de/learn/courses` | ![](screenshots/student/02-courses.png) | Enrolled courses with progress %. |
| 03 | `/de/learn/courses/<id>` | ![](screenshots/student/03-course-detail.png) | Full course plan; per-task status. **⚠ Locked pattern:** "«<Vorgänger>» spielen, um freizuschalten". |
| 04 | `/de/learn/tasks` | ![](screenshots/student/04-tasks.png) | Flat task list across courses, open first. |
| 05 | `/de/learn/tasks/<id>` | ![](screenshots/student/05-task-detail.png) | Task workspace: quiz + free-text + submission timeline. |
| 06 | `/de/learn/arena` | ![](screenshots/student/06-arena.png) | Arena hub: XP/level, streak, badges, "Jagden". **⚠ Locked:** "1 offen · 36 gesperrt", "Gesperrt · Zuerst: …". |
| 07 | `/de/learn/arena/<id>` | ![](screenshots/student/07-arena-detail.png) | *(arena tasks all locked in seed → no reachable detail link; live capture showed the iframe test-env + bug-report form.)* |
| 08 | `/de/learn/questions` | ![](screenshots/student/08-questions.png) | Learner Q&A list. |
| 09 | `/de/learn/certificates` | ![](screenshots/student/09-certificates.png) | Empty state: "Zertifikate sind noch nicht freigeschaltet." |
| 10 | `/de/learn/history` | ![](screenshots/student/10-history.png) | Learning history. |
| 11 | `/de/learn/notifications` | ![](screenshots/student/11-notifications.png) | In-app notifications. |
| 12 | `/de/learn/profile` | ![](screenshots/student/12-profile.png) | Profile (shared one-screen profile for all roles). |

## 3. Trainer — `screenshots/trainer/` (trainer@ditele.local)
| # | Route | Screenshot | Notes |
|---|---|---|---|
| 01 | `/de/trainer` | ![](screenshots/trainer/01-dashboard.png) | Trainer dashboard (review queue entry points). |
| 02 | `/de/trainer/submissions` | ![](screenshots/trainer/02-submissions.png) | Submission review queue. |
| 03 | `/de/trainer/submissions/<id>` | ![](screenshots/trainer/03-submission-detail.png) | Review a submission (decision + rubric). |
| 04 | `/de/trainer/questions` | ![](screenshots/trainer/04-questions.png) | Question queue. |
| 05 | `/de/trainer/questions/archive` | ![](screenshots/trainer/05-questions-archive.png) | Archived questions. |
| 06 | `/de/trainer/questions/<id>` | ![](screenshots/trainer/06-question-detail.png) | Answer a question thread. |
| 07 | `/de/trainer/progress` | ![](screenshots/trainer/07-progress.png) | Learner progress (the trainer's mentees). |
| 08 | `/de/trainer/arena` | ![](screenshots/trainer/08-arena.png) | **⚠ HTTP 500 (pre-existing bug).** |
| 09 | `/de/trainer/history` | ![](screenshots/trainer/09-history.png) | Trainer activity history. |
| 10 | `/de/trainer/profile` | ![](screenshots/trainer/10-profile.png) | Profile. |

## 4. Admin — `screenshots/admin/` (admin@ditele.local)
| # | Route | Screenshot | Notes |
|---|---|---|---|
| 01 | `/de/admin` | ![](screenshots/admin/01-dashboard.png) | Admin dashboard. |
| 02 | `/de/admin/courses` | ![](screenshots/admin/02-courses.png) | Course list. |
| 03 | `/de/admin/courses/<id>` | ![](screenshots/admin/03-course-detail.png) | Course studio (content authoring). |
| 04 | `/de/admin/courses/<id>/people` | ![](screenshots/admin/04-course-people.png) | **⚠ HTTP 500.** Assign learners/trainers/mentors — the enrollment screen. |
| 05 | `/de/admin/courses/new` | ![](screenshots/admin/05-course-new.png) | Create course. |
| 06 | `/de/admin/tasks` | ![](screenshots/admin/06-tasks.png) | Task management. |
| 07 | `/de/admin/users` | ![](screenshots/admin/07-users.png) | User list. |
| 08 | `/de/admin/users/<id>` | ![](screenshots/admin/08-user-detail.png) | User detail. |
| 09 | `/de/admin/users/new` | ![](screenshots/admin/09-user-new.png) | Create user. |
| 10 | `/de/admin/arena` | ![](screenshots/admin/10-arena.png) | **⚠ HTTP 500 (pre-existing bug).** |
| 11 | `/de/admin/feedback` | ![](screenshots/admin/11-feedback.png) | **⚠ HTTP 500 (pre-existing bug).** |
| 12 | `/de/admin/issues` | ![](screenshots/admin/12-issues.png) | Reported issues. |
| 13 | `/de/admin/progress` | ![](screenshots/admin/13-progress.png) | Cross-cohort progress. |
| 14 | `/de/admin/settings` | ![](screenshots/admin/14-settings.png) | Settings. |
| 15 | `/de/admin/applications` | ![](screenshots/admin/15-applications.png) | Course-request/applications review. |
| 16 | `/de/admin/profile` | ![](screenshots/admin/16-profile.png) | Profile. |

---

## Group / Stage / Cohort messaging to remove (the pain points)
These are the exact places the UI exposes the grouping model you want gone:

- **FAQ** (`/de/faq`): "Ein Kurs besteht aus mehreren **Stufen**, jede Stufe aus einzelnen Aufgaben." · "Die Administration prüft die Anfrage und **weist Sie einer Gruppe zu**."
- **Privacy** (`/de/privacy`): "…**Gruppenzugehörigkeit**…" · "…Abgaben und Fragen der **Gruppen**, die sie betreuen. Die Administration sieht Konten, **Gruppen** und Kursanfragen."
- **Student course detail**: locked tasks — "«<Vorgänger-Aufgabe>» spielen, um freizuschalten".
- **Student arena**: "Jagden — 1 offen · **36 gesperrt**", "**Gesperrt** · Zuerst: <task>".
- **Applications flow** (`/de/admin/applications`, student "request a course"): the whole request→approve→assign-to-a-group path is replaced by admin-direct enrollment.

## Pages that currently 500 (fix or replace during reconstruction)
`admin/courses/<id>/people`, `admin/arena`, `admin/feedback`, `trainer/arena`.
