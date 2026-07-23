# Ditele — Test Plan & Feature Checklist

Living document. Every feature of the new model (see `ditele_schema.md`) is listed here as a test case so you can verify the site. Status legend: **[ ] to build · [~] in progress · [x] built & self-verified**.

## How to test
- Local app (dev): `npm run dev` → http://127.0.0.1:1234/de
- Accounts (password `123123123`): `admin1@gmail.com` · `trainer1@gmail.com` · `trainer2@gmail.com` · `student1@gmail.com` · `student2@gmail.com`
- Seeded content: course **"Praxiskurs Softwaretester"** (`/de`), 3 course tasks, 2 arena tasks, student1 & student2 enrolled, trainer1 assigned.
- Re-seed anytime: `node --env-file=.env.local scripts/seed-clean.mjs`

## Header / navigation map (must all work, per role)
| Public | Student | Trainer | Admin |
|---|---|---|---|
| Start `/` | Start `/learn` | Übersicht `/trainer` | Übersicht `/admin` |
| Kurse `/catalog` | Kurse `/learn/courses` | Reviews `/trainer/submissions` | Kurse `/admin/courses` |
| Über uns `/about` | Aufgaben `/learn/tasks` | Fortschritt `/trainer/progress` | Arena `/admin/arena` |
| FAQ `/faq` | Arena `/learn/arena` | Profil `/trainer/profile` | Badges `/admin/badges` |
| Datenschutz `/privacy` | Profil `/learn/profile` | | Benutzer `/admin/users` |
| Impressum `/legal` | | | Feedback `/admin/feedback` |
| Anmelden `/login` | | | Fortschritt `/admin/progress` |
| | | | Profil `/admin/profile` |

*Removed from the old nav (not in the new model): Q&A/Fragen, Zertifikate, Benachrichtigungen, Kursanfragen (applications), Fehlermeldungen (issues), Einstellungen.*

---

## 1. Public site  (logged out)
- [ ] **1.1** `/de` home renders (hero, "how it works", active-course teaser, footer).
- [ ] **1.2** `/de/catalog` lists **active** courses; a card opens `/de/catalog/[slug]` (info only — **no self-enroll button**).
- [ ] **1.3** `/de/about`, `/de/faq`, `/de/privacy`, `/de/legal` render; **no "Gruppe"/"Stufe" wording** anywhere.
- [ ] **1.4** Language + light/dark toggle work.

## 2. Auth
- [ ] **2.1** `/de/login` — correct credentials → land on the role's home (`/admin` · `/trainer` · `/learn`).
- [ ] **2.2** Wrong password → generic error, no account disclosure.
- [ ] **2.3** Logout returns to public + protected pages redirect to `/login`.
- [ ] **2.4** A student hitting `/admin/*` or `/trainer/*` gets 403; a trainer hitting `/admin/*` gets 403.

## 3. Admin
### 3.1 Courses
- [ ] **3.1.1** `/admin/courses` lists all courses with state badges.
- [ ] **3.1.2** "Kurs erstellen" → title, description, slug, cover image URL, intro video URL, completion video URL → saved **active immediately** (no draft/publish).
- [ ] **3.1.3** Edit a course; change state (active/inactive/archived/deleted).
- [ ] **3.1.4** Course detail lists its course tasks in order; reorder; add/edit/delete a course task.
### 3.2 Course task authoring
- [ ] **3.2.1** Create course task: title, description, hint, before/after video URLs, MCQ question + options (mark **several** correct), verification answer (trainer-only), optional attached arena task, order.
- [ ] **3.2.2** Edit/reorder/delete a course task.
### 3.3 Arena authoring
- [ ] **3.3.1** `/admin/arena` lists arena tasks in order; create/edit/reorder/delete.
- [ ] **3.3.2** Arena task fields: title, description, HTML window, hint, acceptance criteria (trainer-only), answer key (trainer-only), XP, optional badge, order.
### 3.4 Badges
- [ ] **3.4.1** `/admin/badges` list + create (name, description, image).
### 3.5 Users
- [ ] **3.5.1** `/admin/users` lists users + role; create a user (email, name, role) → can log in.
- [ ] **3.5.2** Edit a user's role / deactivate.
### 3.6 Assign people (per course)
- [ ] **3.6.1** On a course: add/remove **students** (enroll), add/remove **trainers**.
### 3.7 Feedback & progress
- [ ] **3.7.1** `/admin/feedback` shows per-task **emoji** feedback and per-course **5-star + text** reviews.
- [ ] **3.7.2** `/admin/progress` shows each student's position in both chains + total XP + badges.

## 4. Student
### 4.1 Dashboard & lists
- [ ] **4.1.1** `/learn` dashboard: enrolled courses, next task, XP, badges.
- [ ] **4.1.2** `/learn/courses` — enrolled courses with progress %.
- [ ] **4.1.3** `/learn/tasks` — course tasks with correct locked/unlocked state (flat list, **no stages**).
- [ ] **4.1.4** `/learn/arena` — arena tasks with locked/unlocked state; XP + badges summary.
### 4.2 Do a course task
- [ ] **4.2.1** Open first unlocked task: description, before/after videos, MCQ (several correct), free-text.
- [ ] **4.2.2** **Auto-save** — reload loses nothing.
- [ ] **4.2.3** Submit → task becomes **read-only**; goes to trainer.
- [ ] **4.2.4** After submit, pick a **feedback emoji** (one-time, can't change, still visible to self).
- [ ] **4.2.5** Student **cannot** see verification answer / which option is correct.
### 4.3 Do an arena task
- [ ] **4.3.1** Open unlocked arena task: HTML window renders inline; write bug report.
- [ ] **4.3.2** Attach **multiple images + captions** (multiple bugs); submit → goes to trainer.
- [ ] **4.3.3** Student **cannot** see acceptance criteria / answer key.
### 4.4 Completion
- [ ] **4.4.1** When all required accepted → course completes → **completion video** plays.
- [ ] **4.4.2** Student must submit **5-star + text** course review (separate from per-task emoji).
- [ ] **4.5** `/learn/profile` — total XP, earned badges, own emoji feedback.

## 5. Trainer
- [ ] **5.1** `/trainer` overview: queue size, assigned courses.
- [ ] **5.2** `/trainer/submissions` — queue of submitted course + arena work for their courses.
- [ ] **5.3** Open a course submission: student's answer + MCQ, plus **verification answer** (trainer-only) → comment → **Accepted / Needs revision**.
- [ ] **5.4** Open an arena submission: report + **images**, plus **acceptance criteria + answer key** (trainer-only) → comment → decision.
- [ ] **5.5** On **arena accepted** → student gets the task's **XP**; attached **badge** granted; next arena task unlocks.
- [ ] **5.6** On **needs revision** → returns to student, editable again.
- [ ] **5.7** `/trainer/progress` — progress of students in the trainer's courses.

## 6. Unlock logic (the two chains) — critical
- [ ] **6.1 Arena chain:** arena #1 open; #2 unlocks only when #1 **accepted**; independent of course tasks.
- [ ] **6.2 Course chain:** course task #n opens when **(a)** its attached arena task (if any) is **accepted** AND **(b)** task #(n-1)'s mandatory question was **answered** (submitted; auto-approved). Trainer acceptance of a course task does **not** gate.
- [ ] **6.3** Task with no attached arena → only condition (b). Previous task with no mandatory question → only condition (a). First task always open.

## 7. Security / RLS
- [ ] **7.1** Student API cannot read `course_task_answer`, `arena_task_answer`, or `course_task_options.is_correct`.
- [ ] **7.2** Student sees only their own submissions/XP/badges; trainer sees only their courses' students; admin sees all.
- [ ] **7.3** Arena submission images readable only by owner + course trainer + admin.

---
*Update the checkboxes as each is built and verified. Anything discovered missing gets added here first.*
