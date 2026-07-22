# DiTeLe — What the admin fills in, and where it goes

**Verified against the live database on 2026-07-22.** Every column named here was
read from `information_schema`, and every rule from the constraint or function
that enforces it. Where something is **not** built, it says so.

Read with [`FEATURE_BUILD_PLAN.md`](./FEATURE_BUILD_PLAN.md), which carries the
decisions and the reasons.

---

## 1. The three things being authored

The names matter because two of them are the same database table.

| What the admin calls it | What it is in the database |
|---|---|
| **Course** | `courses` + `course_localizations` |
| **Course task** | `tasks` row, `task_kind` = `knowledge` or `practical` |
| **Arena task** | `tasks` row, `task_kind` = `hunt` |
| **Arena screen** (the interactive UI) | `hunt_scenarios` + `hunt_scenario_defects` |

An **Arena task is a task like any other**. What makes it an Arena task is
`task_kind = 'hunt'` and a sandboxed screen behind it. That is why a hunt task
can carry hints, videos and a gate question exactly like a course task.

---

## 1a. How a course holds its tasks

A task is not created on its own and then attached. **It is created inside a
course, and it stays there.**

```
course                         /admin/courses/[courseId]
 └── content version           the editable draft; publishing freezes it
      └── stage                a section of the course
           └── task            course task OR Arena task, in order
                ├── localizations   de · en · ru
                ├── model answer    trainer only
                ├── hints
                ├── test + options  (during the task)
                └── gate question   (before the task)
```

`tasks.course_id` is `NOT NULL` and there is **no join table** — verified. So a
task belongs to exactly **one** course, for its whole life.

### What "add an existing task" has to mean

Because a task cannot belong to two courses, an "add existing task" button
**cannot share** one. It can only **copy** it into this course: a new `tasks`
row, new localizations, new options, new gate question.

That is a real product consequence, not a technical detail: **editing the
original afterwards will not change the copy.** If courses are meant to share a
task and track its edits, that needs a join table and is a different feature.

### The version is the unit of editing

The admin never edits a live course directly. Tasks hang off a
**content version**, and a version is either a `draft` being edited or
`published` and frozen. Publishing writes
`content_versions.snapshot` — the frozen JSON the learner actually reads.

**Consequence for the admin:** a task added to a published course is not visible
to any learner until a new version is published. Editing something and not seeing
it as a student is usually this, not a bug.

### Where Arena sits

| | Scope | Reusable? |
|---|---|---|
| **Arena screen** (`hunt_scenarios`) | organisation | **yes** — one screen can gate tasks in many courses |
| **Arena task** (`tasks`, `task_kind='hunt'`) | one course | no |

This is the sense in which "the Arena task is independent": the **screen** is
independent and lives at `/admin/arena`. The task a learner attempts sits in a
course, in a stage, in order, next to the course tasks — which is what lets one
stage read *practical → hunt → knowledge*, as the seeded courses already do.

### The admin's path

```
/admin/courses                     cards, two per row, active/inactive
      → + Kurs anlegen             create   (§2)
      → open a course              /admin/courses/[courseId]
            ├── course fields      §2
            ├── People             /admin/courses/[courseId]/people   (§5.2)
            ├── Duplicate          deep copy, incl. every task
            ├── Activate/deactivate
            └── Version            /admin/courses/[courseId]/versions/[versionId]
                  └── stages → tasks
                        ├── create task   (modal, §3)
                        └── add existing  (copies it in, see above)

/admin/arena                       the interactive screens (§4)
```

---

## 2. Course — what the admin fills in

`courses` — one row.

| Form field | Column | Notes |
|---|---|---|
| — | `slug` | URL identifier, unique per organisation |
| Activate the course | `state` | `draft` · `active` · `inactive` · `archived` |
| Course duration (hours) | `estimated_minutes` | stored in minutes |
| Cover image | `hero_image_url` | not translated; `https://…` or `/upload/…` |
| — | `default_locale` | |

`course_localizations` — **one row per language** (`de`, `en`, `ru`).

| Form field | Column |
|---|---|
| Course name | `title` |
| Course description | `description_html` |
| Motivational video — after passing the exam | `exam_video_url` |
| Motivational video — after completing the course | `completion_video_url` |

There is **no redirect-URL field**. It was dropped from the design.

**Deleting a course** sets `state = 'archived'`. Nothing is removed — enrolments,
attempts and certificates reference it, and destroying that history is not what
delete means here.

---

## 3. Course task — what the admin fills in

`tasks` — one row.

| Form field | Column |
|---|---|
| — | `task_kind` (`knowledge` / `practical` / `hunt`) |
| Task category | `bug_category_id` |
| Position in the stage | `position` |
| Expected minutes | `expected_minutes` |
| Motivational video — before the task | `intro_video_url` |
| Motivational video — after the task | `video_url` |
| Script / document | `document_url` |
| **Which Arena screen must be completed first** | `required_hunt_scenario_id` |

`task_localizations` — one row per language.

| Form field | Column |
|---|---|
| Task name | `title` |
| Task description | `instructions_html` |
| Task hint | `hint_text` |

Children of the task:

| Form field | Table |
|---|---|
| Task answer — **trainer only** | `task_model_answers.model_answer` |
| Extra hints, in order | `task_hints` (`position`, `content_translations`) |
| Test question | `task_assessments.question_translations` |
| Answer options | `task_options` (`option_key`, `labels`, `position`) |
| Which options are correct | `task_option_answers.is_correct` |
| **The question asked before attempting** | `task_gate_questions.question_translations` |

### Two different questions — do not confuse them

| | `task_assessments` | `task_gate_questions` |
|---|---|---|
| When | **during** the task | **before** attempting it |
| Shape | multiple choice, options, correct answers | one free-text question |
| Skippable | no | **yes** |
| Blocks what | submitting this task | the **next** task |

---

## 4. Arena screen — what the admin fills in

`hunt_scenarios` — the interactive screen.

| Form field | Column |
|---|---|
| Name | `title` |
| Description / what this task is about | `description` |
| Code | `code` |
| **The HTML, CSS and JavaScript** | `html` |
| Media at the start | `start_media_url` |
| Media at the end | `end_media_url` |
| How many defects to find | `expected_findings` |
| Active / inactive | `state` |

`hunt_scenario_defects` — **one row per planted bug**. This is the answer key.

| Form field | Column |
|---|---|
| Internal code | `code` |
| Order shown to the trainer | `position` |
| What the bug is | `title` |
| Where to find it | `location_hint` |
| What should have happened | `expected_behaviour` |
| How to reproduce it | `reproduction` |
| Severity | `severity` |

> The defect list is **never** sent into the iframe. It is the answer key, and
> the trainer's *"2 von 5 gefunden"* match depends on it being structured data
> rather than prose.

The Arena task the student attempts is a `tasks` row with `task_kind = 'hunt'`,
so its name, description, hint and videos come from §3.

---

## 5. Information flow

### 5.1 Admin authors

The order matters: a course task cannot point at an Arena screen that does not
exist yet, so the screen is authored first.

```
1  /admin/arena
   create Arena screen ──> hunt_scenarios.html            the interactive UI
                      └──> hunt_scenario_defects          the answer key
                                                          org-scoped, reusable

2  /admin/courses → + Kurs anlegen
   create course ──> courses + course_localizations (de / en / ru)
                     lands on the course, with a draft version

3  /admin/courses/[courseId]/versions/[versionId]
   inside the course, per stage, add tasks in order:

      Arena task     tasks, task_kind='hunt'
                     the screen the learner works in

      course task    tasks, task_kind='knowledge' | 'practical'
        ├── required_hunt_scenario_id ──> the screen from step 1
        ├── task_gate_questions        ──> asked BEFORE attempting, skippable
        ├── task_assessments + options ──> the test DURING the task
        ├── task_model_answers         ──> trainer-only answer
        └── task_hints, videos, category

4  /admin/courses/[courseId]/people
   enrol students, assign trainers

5  publish ──> content_versions.snapshot frozen and validated
              ONLY NOW does any of it reach a learner
```

**Nothing reaches a learner until publish.** Learners never read `tasks`; they
read the frozen `content_versions.snapshot`. A field that is not in the snapshot
does not exist as far as the student is concerned.

### 5.2 Admin assigns

```
student ──> enrollments (many courses per student)
trainer ──> course_trainers (many courses per trainer)
trainer ──> cohort_memberships.role (many students per trainer, many trainers per student)
```

### 5.3 Student runs the loop

```
1  Arena task opens
2  student works in the sandboxed screen        <iframe sandbox="allow-scripts">
3  finds a bug, files a Jira-style ticket  ───> hunt_findings.reported_details
4  submits                                 ───> submissions
5  trainer reviews, matches the report against hunt_scenario_defects,
   and decides                             ───> hunt_findings.verdict
6  approved  ───> the course task pointing at that screen UNLOCKS
7  before attempting, the student sees the gate question
        ├── answers  ──> task_gate_responses.state = 'answered'
        └── skips    ──> task_gate_responses.state = 'skipped'
8  student does the course task and submits
9  the course task counts as FINISHED only when state = 'answered'
10 while it is 'skipped', the NEXT course task stays locked —
   even if that task's own Arena screen is already approved
```

### 5.4 Where each rule is enforced

| Rule | Enforced by |
|---|---|
| A hunt task cannot require a hunt screen | `check ((required_hunt_scenario_id is null) or (task_kind <> 'hunt'))` |
| An Arena screen in use cannot be deleted | `foreign key … on delete restrict` |
| "Answered" must carry real text | `check ((state <> 'answered') or (btrim(answer_text) <> '' and answered_at is not null))` |
| A response is only ever answered or skipped | `check (state = any (array['answered','skipped']))` |
| Which tasks are locked, and why | `app_private.learner_snapshot_task_lock_reasons` |

That last function is the one that matters. It already knows about both gates —
it references `hunt` and `gate` — and it is where every lock reason a learner
sees is produced.

---

## 5.5 Where each kind of task is worked — decided 2026-07-22

| | Listed in `/learn/tasks` | Attempted where |
|---|---|---|
| **Arena task** (`task_kind='hunt'`) | yes | **Arena only** |
| **Course task** (`knowledge` / `practical`) | yes | the task page |

Both kinds appear in the learner's **Aufgaben / Tasks** list so one screen still
answers "what is outstanding". They must be **visually distinct** — a different
icon, colour or badge — because they behave differently when opened: an Arena row
sends the learner to Arena, a course row opens the task.

The **gate question stays on the course task**, where it is today
(`GateQuestionPanel` in `task-workspace.tsx`). It belongs to the course task,
gates that task's completion, and is not part of the Arena attempt.

> **Read this if you are implementing it.** The instruction was *"the question
> will be open there and only and not in the tasks"*, taken to mean the **Arena
> task** opens in Arena and not from the tasks list — not that the gate question
> moves into Arena. Moving the gate question into Arena would contradict
> §1.6, where answering it is what marks the **course** task finished. If the
> intent was the opposite, this is the paragraph to correct.

**What this costs.** No migration. `task_kind` is already in the snapshot, but
`LearningActivity` (`features/learning/model.ts`) does not carry it, so it has to
be threaded through, then rendered by `TaskListItem`, and an Arena row's link
pointed at Arena instead of the task workspace.

---

## 5.6 Task ordering and what a skipped question blocks — decided 2026-07-22

**Arena tasks run in sequence, expressed through `prerequisites`.** Arena tasks
are `tasks`, `prerequisites` already links `target_task_id → required_task_id`,
and `learner_snapshot_task_lock_reasons` already reads it. One row per link, no
migration, and a mixed chain — Arena, then course task, then the next Arena
task — expresses itself naturally. A `previous_scenario_id` column was rejected:
it would attach ordering to the *screen*, so a screen reused by two courses would
drag one course's ordering into the other.

**A skipped gate question blocks only the next COURSE task.** The Arena chain is
unaffected: a learner may keep working through Arena tasks with an unanswered
question behind them. What they cannot do is start the next course task.

```
Arena 1 ─ approved ─→ Course 1 ─ question SKIPPED
   │                                  │
   ↓ still open                       ↓ blocked
Arena 2 ─ approved ─→ Course 2   ← locked until Course 1's question is answered
```

So Arena progress and course progress can legitimately drift apart, and a learner
can hold several Arena approvals while stuck at course task 1. That is intended.

---

## 6. What is still to build

The decisions are settled (§5.5, §5.6). None of the three below is built yet, and
none needs a migration.

**1 — Arena tasks in sequence.** Write `prerequisites` rows between consecutive
hunt tasks, and give the admin a way to set the order. The lock function already
reads the table, so the learner side should need no change; confirm that rather
than assume it.

**2 — Distinguish the two kinds in the tasks list.** Thread `task_kind` from the
snapshot through `LearningActivity` into `TaskListItem`, render a distinct icon
or colour, and point an Arena row at Arena instead of the task workspace.

**3 — Only course tasks are blocked by a skipped question.** Verify
`learner_snapshot_task_lock_reasons` does not also lock the next hunt task. If it
does, restrict that lock reason to non-hunt tasks.

Verify each against a running build, not against the SQL alone: a lock reason can
be correct in the database and still render as a dead end.
