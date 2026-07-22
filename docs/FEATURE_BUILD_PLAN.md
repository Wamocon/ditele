# DiTeLe — Course Authoring & Arena Build

**Status:** Phase 0 and Phase 1a shipped. Phases 1b onward not started.
**Last updated:** 2026-07-22, at commit `87129bd`.

This is the working spec for the current build. It exists because the
requirements and the design decisions behind them were agreed in conversation
and nothing in the repository recorded them — a later session would have had to
guess. Read this before writing code.

Rules of engagement are in [§6](#6-how-to-work-in-this-repository). They are not
style preferences; each one is there because ignoring it has already cost time.

---

## 1. What the product owner asked for

### 1.1 Course creation

Admin creates a course with these fields. **En / De / Ru tabs** where marked.

| Field | Translated | Notes |
|---|---|---|
| Course name | yes | shown in every list, to all roles |
| Course description | yes | shown on the group page, to trainers and admins |
| Cover image | no | shown on the group page |
| Motivational video — after passing the exam | yes | |
| Motivational video — after completing the course | yes | |
| Course duration (hours) | no | shown to admin and student |
| "Activate the course" toggle | no | |

There is **no redirect-URL field.** It was in the first mock-up and was
explicitly dropped.

### 1.2 Course duplication

One action duplicates the course **and every task under it**. A duplicate is a
new, editable course — not a second copy of a live one.

### 1.3 Course list

The current table is to be replaced by **cards, two per row**. Each card shows
the course, how many users are on it, other course facts, and its **active /
inactive** state.

### 1.4 Task creation

Admin creates each task by hand, in a **modal** — explicitly not a page and not
a dropdown, "for better user experience".

| Field | Translated |
|---|---|
| Task name | yes |
| Task description | yes |
| Task answer — **visible to the trainer only** | yes |
| Task hint | yes |
| Task category | no |
| Test question | yes |
| Answer options (repeatable, add / remove) | yes |
| Which options are correct | no |
| Motivational video — before the task | yes |
| Motivational video — after the task | yes |

Task fields are duplicated along with the course.

**No bug definitions on a course task.** Bugs belong to the Arena.

### 1.5 People and assignment

- A student can be on **many courses**.
- A student can have **many trainers**.
- A trainer can have **many students**.
- A trainer can be assigned **to a course** as well as to students.
- The admin adds students to a course and assigns a trainer to a student.

### 1.6 The gate chain

This is the heart of the feature and the easiest part to get subtly wrong.

```
Arena task submitted  →  trainer approves  →  course task unlocks
        →  student is asked the task's question before attempting
        →  they may ANSWER NOW or SKIP AND DO IT LATER
        →  the course task counts as FINISHED only once the question is answered
        →  until then the NEXT course task stays locked,
           even if its own Arena task is already approved
```

So a skipped question does not block the current task — it blocks **progression
past** it. An Arena approval is necessary but not sufficient to move on.

### 1.7 Arena, admin-authored

Arena tasks are authored by the admin, not by shipping code.

An **Arena scenario** is presented as a card like a course: name, description,
and an image or video for the start and the end.

Inside it, an **Arena task** carries: name, description, hint, "what is this
task about", and an **HTML box** where the admin writes the interactive screen.

- The student sees that HTML **rendered as a working UI**, never as source.
- The student hunts bugs in it, captures a screenshot, and files a
  **Jira-style ticket**: title, description, label, and the other fields a real
  report needs.
- The trainer reviews and decides.
- The admin can preview.
- Authoring happens in a **modal**, as with course tasks.

The product owner confirmed the HTML is **free-form: HTML, CSS and JavaScript**,
because the UI has to be genuinely interactive.

### 1.8 Deleting a course

A deleted course is **not accessible by anyone**. Implemented as the existing
`archived` state, not a row deletion — enrolments, attempts and certificates
reference it, and destroying that history is not what "delete" means here.

---

## 2. Decisions taken, and why

These were judgement calls. Change them deliberately, not by accident.

### 2.1 Admin HTML runs in a sandboxed iframe

```html
<iframe srcdoc={adminHtml} sandbox="allow-scripts" />
```

`allow-scripts` **and nothing else**. The frame gets a unique opaque origin, so
scripts run — the UI is really interactive — but the frame cannot read cookies
or `localStorage`, and cannot call the API as the signed-in student.

> **Never add `allow-same-origin` beside `allow-scripts`.** Together they cancel
> the sandbox and hand every author script the student's session. This is the one
> line in the feature that turns a bug into an account-takeover.

Sanitise on save as well — strip external `<script src>`, block form posts to
our own origin. That is defence in depth, not the control.

### 2.2 Planted defects stay structured data, beside the HTML

The HTML is presentation only. The bugs an admin plants are stored as rows:
`{code, title, where, hint}`.

The reason is the trainer, not tidiness. The review screen matches a student's
report against known defects and shows *"2 von 5 gefunden"*; that ranked match is
the entire mitigation for a trainer facing sixty free-text reports per cohort
(`plan/05_…` §6). Free-form HTML with no declared defect list would destroy it.

**The defect list must never be sent into the iframe.** It is the answer key.
Same rule the existing `hunt-panel.tsx` already follows.

### 2.3 The pre-task question is a new table, not a flag on `task_assessments`

`task_assessments` is the **in-task test** and is already embedded in every
published `content_versions.snapshot`. Adding a `phase` column would change the
meaning of a structure that historical snapshots already contain, and those
snapshots are re-validated on read.

So: a new `task_gate_questions` table with its own snapshot key. New shape, no
reinterpretation of old data.

### 2.4 The duplicate refuses to copy people

`enrollments`, `cohorts`, `attempts`, `submissions`, `evidence`, `questions`,
`certificates` and `course_trainers` all hang off a course or its tasks and are
**not** copied. Copying them would enrol live learners into an unpublished
course and mint attempts nobody made.

---

## 3. Shipped so far

### Phase 0 — migration ledger (`3ab611d`)

The dev database recorded 45 migrations; the repository had 62. A production
push would have replayed 18 already-applied files.

Each of 17 was confirmed applied **by schema effect** before being recorded —
never by assuming the file had run. One orphan ledger row was marked reverted.
One migration was genuinely unapplied and was run properly: badges held
`0 EN / 11` rows, which is why Arena badge names were German on `/en` and `/ru`.
They now carry all three locales.

**Ledger is now 62 in sync, nothing local-only, nothing remote-only.**

### Phase 1a — course media and deep duplicate (`87129bd`)

Migrations `20260728100000` … `20260728130000`.

- `courses.hero_image_url`; `course_localizations.exam_video_url` and
  `.completion_video_url`, with protocol check constraints.
- **No state column was added.** `record_state` already has
  `draft / active / inactive / archived`, so the "Activate" toggle is
  active↔inactive and "deleted" is archived.
- `public.duplicate_course(p_source_course_id uuid, p_new_slug text, p_title_suffix text default ' (Kopie)') returns uuid`,
  `SECURITY DEFINER`, admin-only, checked against the **source** course's
  organisation so one tenant cannot clone another's course.

Verified against the seeded course in a rolled-back transaction:

| | source → copy | |
|---|---|---|
| course_localizations | 3 → 3 | ok |
| stages | 1 → 1 | ok |
| tasks | 3 → 3 | ok |
| task_localizations | 9 → 9 | ok |
| task_hints / task_options | 1 → 1 / 2 → 2 | ok |
| enrollments | 7 → **0** | correctly not copied |
| cohorts | 1 → **0** | correctly not copied |
| snapshot | rebuilt | ok |
| new course state | `draft` / v1 `draft` | ok |

Three defects the schema caught, each fixed in its own migration:

1. `content_versions.snapshot` is NOT NULL. Copying the source's snapshot would
   have satisfied the constraint and been worse — a snapshot freezes one
   version's *ids*, so the copy would have served the original's content. It is
   inserted as `{}` and rebuilt at the end with the same builder publishing uses.
2. `(source_system is null) = (external_id is null)` on courses, stages and
   tasks. Only found because the seeded course has a hunt task carrying
   `source_system='arena'`.
3. `stage_localizations` has `description_html`, not `summary`; `prerequisites`
   carry organisation/skill/rule columns a two-column insert would have dropped.

---

## 4. What is left

### Phase 1b — assignment write paths

Direct inserts are refused today (`42501`, ISSUES I-011/I-012). Needed as
`SECURITY DEFINER` RPCs:

- enrol a learner on a course
- assign a trainer to a course
- assign a trainer to a learner
- remove each of the above

`cohort_memberships` already has a `role` column, so trainers and learners share
the membership table. Check whether that is the right home before adding a new
one.

### Phase 1c — Arena schema and the gates

Each of these changes the **snapshot**, so each needs the column, the snapshot
builder and the validator changed **in the same migration** — see
[§6.3](#63-the-snapshot-is-the-dangerous-part).

- `hunt_scenarios.html` plus a planted-defects store (new table, or a jsonb
  column with a shape check — decide and record which).
- `tasks.required_hunt_scenario_id` — the Arena gate.
- `task_gate_questions` — the pre-task question, its answers, and a skipped
  state; plus the "next task stays locked until answered" rule, which belongs in
  `app_private.learner_snapshot_task_lock_reasons` where the existing lock
  reasons already live.

### Phase 2 — admin UI

Course form (no redirect URL), duplicate button, card grid two per row with
enrolled counts and active/inactive, task modal, assignment screens.

### Phase 3 — Arena authoring and the sandbox

Admin authoring modal, the sandboxed renderer, the student ticket form, the
trainer review, the course-task gate in the learner UI.

### Phase 4 — Arena for trainer and admin

New routes plus nav entries. Arena is missing from those headers today because
`/learn/arena` exists only in `STUDENT_NAV`.

### Phase 5 — verification

`npm run verify`, a three-role click-through, and an update to
`docs/QA_TEST_PLAN.md`.

---

## 5. What already exists (do not rebuild it)

Most of the task fields in §1.4 already have schema. Check before creating
anything.

| Requirement | Existing home |
|---|---|
| Task name / description | `task_localizations.title` / `.instructions_html` |
| **Task answer, trainer-only** | `task_model_answers` |
| Task hint | `task_localizations.hint_text`, `task_hints` |
| Task category | `tasks.bug_category_id` |
| Test question | `task_assessments.question_translations` |
| Answer options | `task_options.labels` |
| Which options are correct | `task_option_answers.is_correct` |
| Video before / after the task | `tasks.intro_video_url` / `.video_url` |
| Active / inactive / archived | `record_state` enum |
| Trainer on a course | `course_trainers` |
| Learner on a course | `enrollments`, `cohort_memberships` |

Also already built and working: the Arena hub, XP, levels, streaks, badges, the
sandbox runtime, and the trainer's `HuntPanel` (mounted at
`trainer/submissions/[submissionId]/page.tsx`, despite a stale comment in
`hunt-panel.tsx` claiming otherwise).

---

## 6. How to work in this repository

### 6.1 Migrations

Apply through the CLI so the ledger stays honest:

```bash
HOST=$(grep '^NEXT_PUBLIC_SUPABASE_URL' .env.local | sed 's|.*://||; s|[:/].*||')
npx supabase migration up --db-url "postgresql://postgres:postgres@$HOST:56722/postgres?sslmode=disable"
```

`?sslmode=disable` is required; without it the CLI fails in a way that reads
like a wrong password.

- **Never edit an applied migration.** Add a follow-up. Phase 1a has three
  correction migrations for exactly this reason.
- **Never apply by hand with `psql`.** That is what produced the 18-file drift
  Phase 0 had to repair.
- **Verify by schema effect, not by "the file ran"** — query for the column,
  constraint or function, and check its *definition* where a migration replaces
  something rather than adds it.

### 6.2 Writes are RPC-only

Domain tables refuse direct `insert`/`update` from the app (I-003). Every write
is a `SECURITY DEFINER` function. The idiom, from the existing commands:

```sql
v_actor_id uuid := (select auth.uid());
if v_actor_id is null then
  raise exception 'authentication required' using errcode = '42501';
end if;
if not app_private.has_role('admin', v_organization_id, null) then ...
```

### 6.3 The snapshot is the dangerous part

Learners never read `tasks`. They read `content_versions.snapshot`, a frozen
JSON blob shaped `{schema_version, course, content_version, stages[].tasks[]}`,
validated by `app_private.is_valid_learner_content_snapshot`.

**A new field that is not added to the snapshot will never reach a learner. A
snapshot that fails validation makes the learner's course silently return zero
rows, with no error anywhere** — this is ISSUES I-041, and it has already cost
one session an afternoon.

Relevant functions: `app_private.build_content_snapshot`,
`snapshot_task_payload`, `is_valid_learner_content_snapshot`,
`learner_snapshot_task_lock_reasons`.

### 6.4 Testing

Sign-in is rate limited to **5 attempts per address and 30 per browser per 15
minutes**, and once tripped it refuses the correct password too. Automated runs
trip it quickly. Buckets live in
`app_private.authentication_rate_limit_buckets`.

`npm run dev` can serve a stale module graph and throw `ReferenceError: X is not
defined` for code that is correct. Confirm against `npm run build && npm start`
before believing it.

### 6.5 Other sessions may be editing this tree

It has happened repeatedly (ISSUES I-042): files changing mid-edit, and work
swept into another session's commit. Check `git status` before you start and
before you commit, and stage explicitly — never `git add -A`.
