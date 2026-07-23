# Ditele — Clean Schema & Process (definitive spec)

> **This is the source of truth for the reconstruction.** Built from the process spec of 2026-07-23.
> Target: **local Supabase only** (`192.168.178.75:56722`). Production is never touched.
> Everything not described here is **removed**.

## The app in one breath
Admin creates an **active** course (title, description, cover image, intro + completion video) → adds **course tasks** and **arena tasks** → adds a **trainer** and **students** to the course. A student runs **two independent chains**: arena tasks (HTML bug-hunts) gated only by the previous arena task, and course tasks gated by (attached arena task done) + (previous task's mandatory question answered). Each course-task submit carries a one-time **emoji** to the admin. The trainer accepts submissions; arena acceptances pay **XP** and grant **badges**. When everything required is accepted the course completes → the **completion video** plays → the student leaves a **5‑star + text** review → done.

**Roles:** `student`, `trainer`, `admin`. No groups, stages, cohorts, tenants/organizations.

---

## Tables (16)

### 1. `profiles`  — one row per user (→ `auth.users`)
`id` (pk = auth uid) · `role` (student|trainer|admin) · `display_name` · `avatar_url` · `locale` · `is_active` · `created_at` · `updated_at`

### 2. `courses`
`id` · `slug` (unique, URL name) · `title` · `description` · `cover_image_url` · `intro_video_url` (plays on START) · `completion_video_url` (plays on FINISH) · `state` (active|inactive|archived|deleted) · `created_by` · `created_at` · `updated_at`
Created **active immediately** — no draft/review/publish.

### 3. `course_tasks`
`id` · `course_id` → courses · `order_index` · `title` · `description` · `hint` · `video_before_url` · `video_after_url` · `mcq_question` (the mandatory question text; null = no gate question) · `arena_task_id` → arena_tasks (nullable, 0 or 1 attached) · `verification_answer` **(trainer/admin only)** · `state` (active|inactive|archived|deleted) · `created_at` · `updated_at`

### 4. `course_task_options`  — MCQ options (several may be correct)
`id` · `course_task_id` → course_tasks · `order_index` · `label` · `is_correct` (boolean)
*(`is_correct` is trainer/admin only; students read only `label`.)*

### 5. `arena_tasks`  — global ordered bug-hunt chain
`id` · `order_index` · `title` · `description` · `html_window` (HTML shown to the student to inspect) · `hint` · `acceptance_criteria` **(trainer/admin only — how to judge)** · `answer_key` **(trainer/admin only — the reference answer / planted bugs)** · `xp_reward` (int) · `badge_id` → badges (nullable) · `state` (active|inactive|archived|deleted) · `created_at` · `updated_at`

### 6. `badges`
`id` · `name` · `description` · `image_url` · `created_at`

### 7. `badge_awards`
`id` · `student_id` → profiles · `badge_id` → badges · `arena_task_id` → arena_tasks (source) · `awarded_at` · unique(student_id, badge_id)

### 8. `enrollments`  — a student is on a course (admin-assigned)
`id` · `student_id` → profiles · `course_id` → courses · `state` (active|completed) · `assigned_by` → profiles · `enrolled_at` · `completed_at` · unique(student_id, course_id)

### 9. `course_trainers`  — a trainer is on a course (admin-assigned)
`id` · `course_id` → courses · `trainer_id` → profiles · `assigned_by` → profiles · `created_at` · unique(course_id, trainer_id)

### 10. `submissions`  — one table for both course-task and arena-task work
`id` · `student_id` → profiles · `task_kind` (course|arena) · `course_task_id` (nullable) · `arena_task_id` (nullable) · `response_text` · `state` (in_progress|submitted|accepted|needs_revision) · `submitted_at` · `created_at` · `updated_at`
- CHECK: exactly one of `course_task_id` / `arena_task_id` is set (matching `task_kind`).
- The `in_progress` row **is** the auto-saved draft (one per student+task). On **submit** it becomes immutable to the student. `needs_revision` reopens it for editing/resubmit.

### 11. `submission_options`  — MCQ answer (course submissions)
`id` · `submission_id` → submissions · `option_id` → course_task_options

### 12. `submission_images`  — arena bug-report attachments (multiple)
`id` · `submission_id` → submissions · `object_key` (in `submission-images` bucket) · `caption` (bug description) · `order_index` · `created_at`
*Visible to the submitting student + the course's trainer(s) + admin only.*

### 13. `reviews`  — trainer decision on a submission
`id` · `submission_id` → submissions · `trainer_id` → profiles · `decision` (accepted|needs_revision) · `comment` · `created_at`

### 14. `task_feedback`  — one-time emoji per course task (→ admin)
`id` · `student_id` → profiles · `course_task_id` → course_tasks · `emoji` · `created_at` · unique(student_id, course_task_id)
Immutable once set; the student can still see their own.

### 15. `course_feedback`  — whole-course review on completion (→ admin)
`id` · `student_id` → profiles · `course_id` → courses · `rating` (1–5) · `comment` · `created_at` · unique(student_id, course_id)

### 16. `xp_ledger`  — XP earned (append-only)
`id` · `student_id` → profiles · `arena_task_id` → arena_tasks (source) · `amount` · `created_at`
Student total XP = sum. Earned when an arena submission is **accepted**.

### Storage buckets
- `avatars` (public) — profile pictures.
- `submission-images` (private) — arena bug-report images; readable only by the owner student, the course trainer(s), and admin.
- Course/task media (cover, intro/completion, before/after videos) and the arena HTML window are **URLs / inline text**, no bucket.

### Answer-key privacy (RLS)
`course_tasks.verification_answer`, `course_task_options.is_correct`, `arena_tasks.acceptance_criteria`, `arena_tasks.answer_key` are **never readable by students** — enforced by RLS + a student-facing read that projects only safe columns.

---

## The two unlock chains (exact)

**ARENA chain** (independent — only looks at the previous arena task):
- Arena task #1 is open. Arena task #n opens when arena task #(n−1) is **accepted** by a trainer.
- A student may finish every arena task before touching course tasks.

**COURSE chain** — course task #n opens when **both** hold:
1. If course task #n has an **attached arena task**, that arena task is **accepted** (else this condition is skipped).
2. If course task #(n−1) has a **mandatory question**, the student has **answered it** (submitted the previous task; auto-approved, no trainer step) (else this condition is skipped).
- Course task #1 is open.
- Trainer **acceptance does not gate** the course chain (records the work + XP only).

No time/schedule anywhere — a task opens purely when its conditions are met.

---

## Flows
- **Student · course task:** open first unlocked task in **TASKS** → read, answer (text + MCQ), watch before/after videos → **auto-saved** continuously → **Submit** (read-only after) → pick a one-time **emoji** (→ admin, can't change, still visible to self).
- **Student · arena task:** open in **ARENA** → HTML window loads inline → inspect, find bug(s), write report, **attach multiple images + descriptions** → **Submit**.
- **Trainer:** one **queue** of submissions (course + arena) for their courses → open one → sees the student's answer + (arena) images, plus the **answer key / acceptance criteria** (trainer-only) → writes a comment → **Accepted** or **Needs revision**.
  - Course task accepted → recorded (chain already advanced on submit).
  - Arena task accepted → student earns the task's **XP**; if a **badge** is attached it's granted; the next arena task unlocks.
- **Completion:** last required item accepted → course `completed` → **completion video** plays → student must submit **5‑star + text** review → total XP + badges show on profile/Arena → admin sees per-student progress, the per-task emojis, and the course review.

## Removed (everything else)
Groups/stages/cohorts/organizations · content versioning + reviews + workflow receipts · all `*_localizations` (content is German, inline) · all `*_receipts` · Q&A/questions · certificates · streaks/levels/missions/leaderboards · skills/mastery/prerequisites/placement · labs · portfolios · AI · analytics · integrations/webhooks/outbox · GDPR/consent · entitlements/product packages · support issues · notifications inbox · applications/request-to-join · media library · audit events · roles/permissions tables (role now lives on `profiles`).
