# DiTeLe — Course Authoring & Arena Build

**Status:** **All phases shipped** — 0, 1a, 1b, 1c, 2, 3, 4 and 5.
**Last updated:** 2026-07-22, at commit `73f68f0`.

The gate chain of [§1.6](#16-the-gate-chain) has been walked end to end against
a production build: a course duplicated, both gates authored on its draft,
published, a learner enrolled, the locked task showing both reasons, the
question skipped and then answered. `npm run verify` passes.

Open items are in [§8](#8-what-is-left); the traps this build found are in
[§7](#7-three-things-a-psql-test-cannot-see).

This is the working spec for the current build. It exists because the
requirements and the design decisions behind them were agreed in conversation
and nothing in the repository recorded them — a later session would have had to
guess. Read this before writing code.

Rules of engagement are in [§5](#5-how-to-work-in-this-repository). They are not
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

## 3. What shipped, phase by phase

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

### Phase 1b — assignment write paths (`6546be3`, see §7)

Six `SECURITY DEFINER` commands: `enroll_learner_in_course`,
`remove_learner_from_course`, `assign_trainer_to_course`,
`remove_trainer_from_course`, `assign_trainer_to_learner`,
`remove_trainer_from_learner`.

The build plan asked whether `cohort_memberships.role` was the right home for
all three relationships. It is the right home for none of them and the answer
differs per relationship:

| | Home | Why |
|---|---|---|
| trainer ↔ course | `course_trainers`, **already existed** | added by `20260721130000`, which explicitly superseded `cohort_memberships(role='trainer')`. Only the write path was missing |
| trainer ↔ learner | `learner_trainers`, **new** | `cohort_memberships` pairs a user with a *cohort*. This pairs a user with a *user*, and there is nowhere to put the second `user_id` |
| learner ↔ course | `enrollments` + a cohort membership | not a choice: `current_actor_pinned_course_context` needs state `assigned`, an **active** cohort with a **published** pin, and an active `cohort_memberships` row |

Cohort administration was removed from the product (QA plan §9) and only one of
five courses had a cohort, so `app_private.ensure_default_course_cohort` creates
one on demand, `flexible` rather than `scheduled` — a scheduled cohort with no
`task_schedules` rows locks every task.

### Phase 1c — Arena schema and the gates (`ac9ec9c`)

- `hunt_scenarios.html` + `start_media_url` / `end_media_url`, nullable and
  additive: null keeps the component-registry engine, non-null renders
  free-form admin HTML.
- **Planted defects are a TABLE**, `hunt_scenario_defects` — this was the
  decision left open. Reasons in the migration header; the short version is that
  `hunt_findings.planted_code` is the join key behind the trainer's "2 von 5
  gefunden", and `unique (scenario_id, code)` makes a typo'd code impossible
  rather than merely wrong. `configuration.defects` stays as what it always was
  (how the *engine* injects a bug) and the grading half was backfilled across.
  **No learner-readable policy at all.**
- `tasks.required_hunt_scenario_id`, matched on the scenario **code** so
  publishing a new scenario version does not re-lock finished learners.
- `task_gate_questions` + `task_gate_responses`, and the
  `gate_question` lock reason.

### Phase 2 — admin UI (`b5fbdde`, completed in `73f68f0`)

- **Card grid, two per row** with enrolled and trainer counts and the
  active/inactive badge (§1.3). Both counts are fetched once for the page, not
  once per card.
- **The duplicate button.** `duplicate_course` had shipped in Phase 1a with no
  caller — and, it turned out, could never have worked from one; see
  [§7](#7-three-things-a-psql-test-cannot-see).
- **`/admin/courses/[courseId]/people`**, wiring all six Phase 1b commands.
  Before it, an admin's only route to putting a learner on a course was to wait
  for the learner to request it and then approve.
- **Course media on the create form** — cover image and both motivational
  videos (§1.1), whose columns had shipped in Phase 1a with no input anywhere.
  Deliberately **no redirect-URL field**; a comment on the form says why, because
  re-adding it from the mock-up is the easiest mistake to make there.
- **The task modal** (§1.4). `TaskEditor` already had every field that section
  lists; what was wrong was that it expanded inline in the stage list. Wrapped
  in a `<dialog>` rather than rebuilt — a second editor writing the same tables
  would drift from the first on the next change to either.
- **Both gates became authorable**, which was the real hole Phase 3 left: the
  Arena gate and the pre-task question had columns, snapshot keys, validators,
  lock reasons and learner UI, and nothing in the studio could set either, so
  the whole chain was reachable only by SQL. The task editor now offers a
  scenario picker (active scenarios only) and a three-locale question,
  all-or-nothing because `set_task_gate_question` enforces the same three-locale
  rule the snapshot validator applies later.

### Phase 3 — Arena authoring and the sandbox (`ccf007a`)

- `/admin/arena` with a scenario **modal** (§1.7): title, description, the HTML
  box, start/end media, and the planted-defect list added and removed a row at
  a time. Calls `upsert_hunt_scenario` and `set_hunt_scenario_defects`, which
  had shipped in Phase 1c with no caller.
- **`HtmlSandbox`** — `srcdoc` with `sandbox="allow-scripts"` and nothing else.
  `html-sandbox.test.tsx` exists solely to fail if anyone adds
  `allow-same-origin`; verified by mutation, adding the flag turns 6 passing
  assertions into 2 failures. It nests inside the practice iframe, which does
  carry `allow-same-origin`; sandbox flags intersect, so the inner frame keeps
  its opaque origin.
- The **pre-task question** panel, and both lock reasons rendered as sentences.
- The trainer's ground truth merges `hunt_scenario_defects` with
  `configuration.defects`, table wins — for an HTML scenario the config array is
  empty, so reading it alone left the ranked match with nothing on exactly the
  scenarios an admin had just authored.

### Phase 4 — Arena for trainer and admin (`ccf007a`)

`/admin/arena` and `/trainer/arena`, plus their nav entries — added only once
both routes rendered, per TC-NAV-02.

The trainer page needed a migration to exist at all: `hunt_scenarios` had two
SELECT-admitting policies, a learner-reachability one and a `FOR ALL`
`content.manage` one, and a trainer satisfied neither. Measured over the API, a
trainer read one scenario — and only because a seeded task happens to point at
it. `hunt_scenario_defects`, the *more* sensitive table, already admitted
`review.manage`, so a trainer could read the answer key but not the scenario it
hangs off.

### Phase 5 — verification

`npm run verify` passes end to end: i18n 1711/1711 in all three locales,
secrets, contrast, typecheck, **0 lint errors**, 178 tests, production build.

Three-role click-through against `npm start`, signed in: 35 destinations across
admin, trainer and learner, including the new screens in de/en/ru. Plus both
sides of the scenario read scope — a learner cannot open a scenario no task
points at, while the admin who wrote it can preview it.

---

## 4. What already exists (do not rebuild it)

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

## 5. How to work in this repository

### 5.1 Migrations

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

### 5.2 Writes are RPC-only

Domain tables refuse direct `insert`/`update` from the app (I-003). Every write
is a `SECURITY DEFINER` function. The idiom, from the existing commands:

```sql
v_actor_id uuid := (select auth.uid());
if v_actor_id is null then
  raise exception 'authentication required' using errcode = '42501';
end if;
if not app_private.has_role('admin', v_organization_id, null) then ...
```

### 5.3 The snapshot is the dangerous part

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

### 5.3a A plpgsql local must never share a name with a column

This cost time **four** times in one session and it is the single most expensive
habit in this schema:

```sql
declare gate_question_id uuid;
...
where response_record.gate_question_id = gate_question_id   -- 42702
```

plpgsql resolves the bare name to the **column**, not the variable, and raises
`42702 column reference is ambiguous`. Fixed in `20260729110000`
(`organization_id`), `20260729120000` (`cohort_id`) and `20260730400000`
(`gate_question_id`); avoided by naming in `20260731100000`.

**The third one was invisible**, and that is the real lesson.
`learner_snapshot_task_lock_reasons` ends with `exception when others then
return reasons || 'configuration'`, so the 42702 became a generic
"misconfigured" lock. The gate rule never evaluated once; answered and skipped
produced byte-identical output. It was found only by running the rule in **all
four states** and comparing — a single-state test sees a lock, which is exactly
what a lock test expects to see.

Name locals `<thing>_row`, `<thing>_record`, `target_<thing>` or
`resolved_<thing>`, as the surrounding code already does.

### 5.3b Postgres regular expressions are not Perl's

Two traps, both of which turned `sanitize_scenario_html` into a silent no-op
before it was caught (`20260730100000`):

- **`\b` is a BACKSPACE character.** The word-boundary escape is `\y`. A pattern
  using `\b` matches nothing and the function returns its input unchanged.
- **Greediness belongs to the whole pattern, not to one quantifier.** The FIRST
  quantifier decides it. `'<script\s[^>]*\ysrc…>.*?</script>'` has a greedy
  `[^>]*` first, so the `.*?` is greedy too and the match runs to the LAST
  `</script>`, deleting everything between.

Both were caught only because the verification asserts on the **result** of
sanitising a hostile string, not on the function existing. A security control
that quietly does nothing looks identical to one that works.

### 5.3c A rolled-back test cannot find a second-request bug

Testing inside `begin; … rollback;` is right for most things and wrong for
anything whose failure needs a previous request to have **committed**. Two bugs
in `20260731100000` — a permanently-taken idempotency key and a duplicated
cohort membership — both required enrol → *commit* → remove → *commit* →
re-enrol, and both passed every rolled-back check before that.

The cheapest way to get this coverage is to drive the real RPCs over PostgREST
with a real JWT, which also proves the `execute` grants, the overload
resolution, and that `auth.uid()` is the signed-in user rather than null. A
200 from a page while signed OUT proves only that the redirect works.

### 5.4 Testing

Sign-in is rate limited to **5 attempts per address and 30 per browser per 15
minutes**, and once tripped it refuses the correct password too. Automated runs
trip it quickly. Buckets live in
`app_private.authentication_rate_limit_buckets`.

`npm run dev` can serve a stale module graph and throw `ReferenceError: X is not
defined` for code that is correct. Confirm against `npm run build && npm start`
before believing it.

### 5.5 Other sessions may be editing this tree

It has happened repeatedly (ISSUES I-042): files changing mid-edit, and work
swept into another session's commit. Check `git status` before you start and
before you commit, and stage explicitly — never `git add -A`.

**It happened again on 2026-07-22.** Commit `6546be3`, whose message is
"Profiles: drop the Appearance section, give every role a profile photo",
contains the three Phase 1b migrations — 2,127 lines of assignment schema — with
no mention of them. They were untracked in the working tree when that session
staged everything.

Nothing was lost and the history was not rewritten, because that session was
still live and rewriting shared history under a running session is worse than a
misfiled commit. But if you are looking for where `learner_trainers` came from,
`git log -- supabase/migrations/20260729100000_assignment_write_paths.sql` is
the only way to find it, and the commit message will not help you.

---

## 6. Where each phase actually landed

Because §5.5 happened, the commit a phase is *in* is not always the commit that
*claims* it.

| Phase | Commit | Message says |
|---|---|---|
| 0 | `3ab611d` | yes |
| 1a | `87129bd` | yes |
| **1b** | **`6546be3`** | **no — says "Profiles… profile photo"** |
| 1c | `ac9ec9c` | yes |
| 2 (part) | `b5fbdde` | yes |
| 3 and 4 | `ccf007a` | yes |
| 2 (rest) | `73f68f0` | yes |

---

## 7. Three things a psql test cannot see

Every failure below passed every `psql` check and appeared only over HTTP. They
are listed together because they are one lesson: **`psql` proves the SQL, not
the request.**

| | Found in | Why psql missed it |
|---|---|---|
| missing `execute` grant / overload resolution | Phase 1b | psql calls the function directly |
| a permanently-taken idempotency key, and a duplicated cohort membership | `20260731100000` | both need a previous request to have **committed**; a rolled-back test cannot reach them |
| **`duplicate_course` never worked over the API** | `20260801300000` | `safeupdate` is loaded for `authenticator`, not for `postgres` |

The third is the one to remember. `duplicate_course` cleared its temp tables
with `delete from tmp_x;`, and this deployment sets
`session_preload_libraries=safeupdate` on the role PostgREST connects as, which
rejects any UPDATE or DELETE with no WHERE — inside a `SECURITY DEFINER`
function too, because definer's rights change *who may touch a row*, not *which
statements the loaded hooks allow*.

Phase 1a verified that function in detail, counting source and copy row by row,
and every assertion was true. The function was correct; it could not be
**called** the way the application calls it. `set local role authenticated` does
not reproduce it either — `session_preload_libraries` is applied when the
connection is established, not when the role is switched.

It shipped, was documented as verified, and Phase 2's "Duplizieren" button would
have failed on first click.

---

## 8. What is left

Nothing in §1 is unbuilt. These are the things found along the way and
deliberately not done:

- **`duplicate_course` does not copy `task_rubric_assignments`.**
  `submit_content_for_review` refuses a version whose practical tasks have no
  active rubric, so **a duplicated course cannot be published** until somebody
  re-attaches them — and no screen does. Unlike the omissions the function
  documents deliberately (enrolments, cohorts, attempts, `course_trainers`,
  `task_schedules`) this one is not mentioned in its header, so it reads as an
  oversight. Fixing it means a follow-up migration that copies the assignments
  onto the new version.
- **Course media has no locale tabs.** §1.1 marks the two motivational videos
  translated and `course_localizations` keeps a row per locale, but the form
  writes German only — the same convention as every other field on it
  (`CONTENT_LOCALES === ["de"]`). Add tabs when content translation starts.
- **The course editor cannot change media after creation.** `updateCourseMeta`
  accepts `heroImageUrl`; the studio has no field for it yet.
- **No screen retires an Arena scenario.** The modal can set any
  `record_state`, so it is reachable, but there is no explicit "retire" action
  and no warning that tasks may still point at the scenario being retired.
