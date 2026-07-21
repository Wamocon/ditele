# DiTeLe Bug Arena — Release Report

> Written by **WS-13 (Integration & Test)**, 2026-07-21, at the end of Wave E.
> This is the honest state of the Arena phase. **A hidden gap is worse than a
> listed one**, so everything known to be missing, broken or only partly
> verified is in here — including the parts that make this report less
> flattering.

---

## 0. ⚠️ Read this first

### The working tree contains ~20 files of UNCOMMITTED work that is not WS-13's

`git status` shows modifications this workstream did not make and did not
commit, last touched 18:00–18:44 on 2026-07-21 — the layout components, both
`en.json` and `ru.json`, `learning.ts`, `actions.ts`, the auth layout, the
profile page and the submissions queue page, plus two deleted `scripts/.qa-*`
files.

This is the unregistered session WS-8 reported as **I-042**, and the work is
coherent: it is `RELEASE.md` §8 items 1 and 5 — the EN/RU translation pass plus
routing hardcoded German through i18n — with at least one genuine bug fix
alongside (the `statusLabel` repair on the submissions filter: the status
catalogue is keyed camelCase while the values are database enums, so the filter
was offering trainers a raw `revision_required`).

**WS-13 did not commit it**, because it is another session's unreviewed
in-flight work and committing it would attribute and bless code nobody has
reviewed. **But it is one `git checkout` from gone, and this repo lives inside
OneDrive.** Every number in this report was measured with those changes in
place, because that is the tree the application actually runs from.

**Coordinator: this needs an owner, and it needs one today.**

### `plan/05_…` and `plan/06_…` were untracked

The two documents this entire phase was designed from existed only as untracked
files. Committed unchanged in `28f9412`.

---

## 1. The one-paragraph version

The hunt loop works end to end in a browser: a locked task explains itself and
links to the hunt that opens it, the hunt embeds its sandbox, a planted bug is
observable through the UI, the report is filed as a Jira-shaped ticket, the
trainer decides in **0.5 seconds of reading** with the ground-truth panel, the
gate opens, XP lands and a badge fires. `npm run verify` exits 0, `db:lint` is
clean, smoke is **48/48** (up from 42/42), and a 243-check browser regression
across four roles is green. **Decision D2 delivered** — the three signals a
trainer needs are 9 words on a 309-word screen. **Relative fairness holds** —
two learners 20 days apart each see their own day-N on every screen and nothing
ranks them. The phase also shipped a **live regression that broke the app for
five of the six seeded learners**, undetected through all five workstreams; it
is fixed, and §3 explains why nobody saw it. What is *not* done is specific:
screenshots were never built, and on a non-HTTPS deployment no hunt report can
be submitted at all.

---

## 2. What shipped

| Workstream | Delivers | State |
|---|---|---|
| **WS-8** Foundation | `task_kind='hunt'`, `hunt_scenarios`, `hunt_findings`, relative scheduling, lock-reason enrichment, Arena nav entry | ✅ |
| **WS-9** Sandbox | The scenario engine, the authoring contract, one reference scenario (`checkout-v1`: 4 planted, 1 decoy, 1 known non-bug), capture-region | ✅ |
| **WS-10** Ticket | `description` · `labels[]` · `environment` · `screenshotIds[]`, the matching engine, the ticket view, the trainer ground-truth panel | ✅ except screenshots |
| **WS-11** Rewards | Award engine in the review transaction, XP/levels from §8.1–8.2, badges, streaks with freezes, `/learn/arena`, celebration | ✅ |
| **WS-12** Oversight | `/admin/progress`, risk sort, flag-to-trainer, one role-scoped RPC for both boards | ✅ |
| **WS-13** Integration | 12 cross-tree fixes, 2 migrations, the regression net, the journey, the two risks | ✅ |

### Verified gates

| Gate | Result |
|---|---|
| `npm run verify` | ✅ **exit 0** — i18n · secrets (363 files) · contrast (48 pairs, 0 below AA) · typecheck · lint (0 errors, 6 warnings, all pre-existing or unused test constants) · **167 tests** · build |
| `npm run db:lint` | ✅ `{"results":[]}` across `app_private`, `extensions`, `public` — **now via the documented command**, see I-039 |
| `node scripts/smoke.mjs` | ✅ **48/48** (was 42/42) |
| `grep -r "service_role" .next/static/` | ✅ nothing — **and by VALUE**: the service-role key and the HMAC key are absent from the entire build, not merely the literal string (I-030) |
| `ws13-regression-check.mjs` | ✅ **243/243** — 4 roles × every V3 route, plus 375px, dark mode, reduced motion |
| `ws13-journey-check.mjs` | ✅ **26/27** — the one failure was an assertion reading a page the app had already navigated away from; the accept it doubted is proved by the unlock and the XP two checks later |
| `ws13-risks-check.mjs` | ✅ **14/14** |
| `ws13-integration-probe.sql` | ✅ 5/5, rolled back |
| `ws13-fairness-probe.sql` | ✅ 4/4, rolled back |

### The loop, round-tripped in a browser

```
locked task → "»Checkout-Jagd« spielen, um freizuschalten →" → hunt task with
the sandbox framed beside it → quantity stepper driven below its lower bound
("− 1 +" → "− -2 +") → ticket filed with all four new fields, environment
prefilled "Chrome 149 · Windows · 1440×950 · light" → trainer queue → panel
shows "1 VON 4 GEFUNDEN" + "MÖGLICHER TREFFER" + "ALLE PFLICHTFELDER
AUSGEFÜLLT" → verdict recorded → accepted → GATE OPENS → XP 5 → 75 →
badges 1 → 2 → admin board row
```

---

## 3. ⭐ The find that mattered — the app was broken for five of six learners

**Any learner with a locked task got an error page on their course and an empty
task list.** `/learn/courses/[id]` rendered "Etwas ist schiefgelaufen";
`/learn/tasks` rendered **"Keine Aufgaben"** — a confident, well-formed empty
state — to a learner who had three. In production this is every new student
seeing an empty platform on day one.

The cause is one line: `src/shared/data/learning.ts` parsed `lock_reasons` as
`z.array(z.string())`, and `app_private.learner_snapshot_task_lock_reasons`
returns objects. The element fails, the activity row fails with it, and the two
screens degrade differently — one loudly, one silently. The silent one is the
dangerous half.

**Two things about this are worth more than the fix.**

**It was not introduced by the Arena phase; the Arena phase switched it on.**
The RPC has always returned objects — WS-8's own helper says so in a comment.
`public.prerequisites` had **zero rows** before WS-8 and every seeded schedule
was already open, so no learner had ever *had* a lock reason and the mismatch
had never once been evaluated. The phase did not write this bug. It created the
first row that reaches it.

**It survived five workstreams of browser checks for one reason: every one of
them signed in as `learner@ditele.local`,** who completed the hunt in WS-8's
slice and therefore has nothing locked. Five chats, five green browser runs, and
not one of them could have seen it. The regression net now carries a
**`locked-learner`** role for exactly this, with a note not to let a future seed
accept her submission.

Three more defects fell out of the same seam:

* **G8's UI half never landed.** `05_…` calls the link on a locked task "the
  whole feature the user described"; WS-8 shipped the data and `huntTaskHref`,
  WS-11 rendered it on the Arena hub, and the locked task itself — where a
  learner actually meets the wall — had a grey row and a sentence.
* **`lockReasonText` matched `prereq`**, and the real code is `required_task`
  (I-037), so the one lock reason this phase produces fell through to the
  vaguest message available.
* **`toLockReason` was not idempotent.** Both key sets are `nullish`, so
  re-normalising a normalised reason parsed successfully and returned nulls.
  Once the data layer normalised at the boundary the link vanished while the
  lock text beside it kept working. Ten tests now pin it.

---

## 4. The two designed-in risks — verified, not assumed

### Risk 1 · trainer load → **D2 delivered**

`05_…` §6 says a hunt review must be "seconds instead of minutes" or the arena
becomes a trainer's whole job. Measured on a real review of a real report:

| | |
|---|---|
| Click queue row → decision signals on screen | **0.5 s** |
| Signal 1 | `0 VON 4 GEFUNDEN` — where this learner stands |
| Signal 2 | `MÖGLICHER TREFFER` — ranked, never applied |
| Signal 3 | `ALLE PFLICHTFELDER AUSGEFÜLLT` |
| Verdict controls | 2 present, **nothing auto-accepted** |
| Screen size | **309 words**, of which the three signals are **9** |

A trainer who trusts the panel decides from nine words and keeps the full report
one glance away. That is what D2 promised.

**The honest caveat:** a script cannot time a human reading, and this does not
claim to. It measures *how much a trainer must read before they can decide*,
which is what the risk is about. A stopwatch on three real trainers reviewing
ten real reports would be better evidence, and it has not been done.

### Risk 2 · relative fairness → **holds**

Seeded for real (I-058): Jonas Weber anchored 2026-06-30, Lena Learner
2026-07-20 — **20 days apart, committed, not in a rolled-back probe**.

The fixture is chosen so it cannot pass by accident: **Jonas has more days and
fewer XP.** "Who enrolled first" and "who has more XP" point in opposite
directions, so a screen ranking by absolute XP and a screen confusing tenure
with progress would each be visibly wrong here.

* Admin board: Jonas **Tag 22**, Lena **Tag 2**
* Trainer board: **the identical day for the same learner**, from the same
  role-scoped RPC (I-055 applied)
* Sorted by `risk_score`, never by XP
* **No ranking language on any of the three screens** — board, trainer board, or
  the learner's own Arena hub
* One `offset_days = 15` row resolves to *open* for the day-22 learner and
  *closed* for the day-2 learner — one schedule, two answers, each on its own
  clock

---

## 5. What did NOT ship

### 5.1 🚨 Screenshots — the journey in the brief cannot be completed

`06_…` §8 item 4 asks for "file the ticket **with a screenshot**". **There is no
screenshot upload, and the journey check asserts its absence rather than
skipping it.** WS-10 unit 7 was not built and said so.

The data half ships and works: `screenshotIds` is on the schema, round-trips
through `evidence_draft`, is copied onto `hunt_findings.reported_details`, and
the ticket view renders a count badge. Nothing writes to it, so the badge never
appears. The blocker is real and WS-10 named it: the upload is intent → PUT →
finalize, and finalize must run as `service_role`, which means a new privileged
handler in an app whose evidence flow already passed a security review.

WS-9's capture-region button exists and finds the sandbox region; it has nowhere
to send the image.

### 5.2 🚨 On a non-HTTPS deployment, no hunt report can be submitted at all

`create_external_task_evidence` requires the source URI to match `^https://`.
The defect form prefills the sandbox URL. On this deployment that is
`http://127.0.0.1:3113/…`, so **the prefilled value is refused and submit
fails.**

Worse, until WS-13 fixed the mapping the learner was told *"Für diese Aufgabe
ist ein Fehlerbericht mit Adresse erforderlich. Bitte fülle den Fehlerbericht
vollständig aus."* — on a form that was already full. It cost an hour to
diagnose and was only visible by calling the RPC by hand and reading `invalid
external evidence payload`.

WS-13 added a distinct error so the message names the real problem. **The
underlying wall stands**, and it is the same root cause as `RELEASE.md` §6
launch blocker 1: `NEXT_PUBLIC_SUPABASE_URL` is a plain-HTTP LAN address. On an
HTTPS deployment this resolves itself. **Until then, hunts cannot be submitted
through the UI without hand-typing an https URL.**

### 5.3 Deferred by decision

* **The leaderboard** — decision D4. Nothing reads or writes
  `leaderboard_preferences`, and nothing assumes a global ranking exists.
* **Nine of nineteen XP rules are seeded but unpaid** (I-053). There is no
  video-completion signal, no quiz scoring path, no course-completion event and
  no content-feedback capture in this application.
* **Mission progress** — `public.missions` holds zero rows and nothing authors
  one, so `touch mission_progress` would be code with no data behind it.
* **A catalogue of scenarios** — WS-9 shipped the engine and one reference
  scenario, deliberately. Scenario #4 is a `.json`, a seed row and the checklist.
* **The student's own ticket view.** `listTicketsForAttempt` is written and
  unused; it needs a per-hunt detail route.

### 5.4 Not verified, and honestly so

* **WS-9's last visual-correctness box** — *a colleague told "there are no bugs
  in this build" finds nothing*. Not automatable. Still open, and it is the box
  that decides whether students report our mistakes as their findings.
* **Fan-out of flag-to-trainer to several trainers.** One course, one trainer
  (I-058); the multi-trainer path is unexercised.
* **The revision → resubmit cycle.** The journey proves submit → verdict →
  accept → unlock. `revision_required` and the resubmission are shipped V3
  machinery and were not re-driven through the UI here.

---

## 6. Known bugs and risks

| # | Severity | Issue |
|---|---|---|
| 1 | **Blocker (env)** | Hunt reports cannot be submitted on a non-HTTPS deployment — §5.2. Resolves with the HTTPS domain that `RELEASE.md` §6 already lists. |
| 2 | **High** | No screenshot upload — §5.1. The brief's journey is incomplete without it. |
| 3 | Medium | **`X-Frame-Options` is now `SAMEORIGIN` app-wide**, not `DENY`. Deliberate (I-049) and required by decision D1: `DENY` forbids framing even same-origin, so the practice panel was an empty box. Cross-origin framing is still refused. Rationale in `next.config.ts`. |
| 4 | Medium | **`tasks_target_url_protocol` and the snapshot validator were both widened** to accept a root-relative path. Single leading slash only — `//evil.example` stays refused, asserted in the probe. Two enforcement points existed for one rule and only one had been widened; the assertion that caught it is the reason the course did not silently empty. |
| 5 | Medium | `learner_streaks` is only as fresh as the learner's last Arena visit. The progress board deliberately does **not** refresh it, because `refresh_learner_streak` **awards XP** — refreshing per row would pay every learner because an admin opened a page (WS-12 learning 1). |
| 6 | Medium | The **journey script writes to the live database and does not roll back.** It cannot: the unlock, the XP and the badge are all commits. `ws13-journey-reset.sql` makes it re-runnable, but it cannot fully rewind — `xp_ledger`, `attempt_command_receipts` and `submission_versions` are each append-only. **Re-running needs a learner who has not played the hunt**, or the resubmission collides on the idempotency key. |
| 7 | Low | `'placement'` tasks still cannot be submitted (I-040). The `submit_attempt` OR-guard lists `practical`, `knowledge`, `hunt`. No placement task has ever been authored. A product decision, not a bug to fix blind. |
| 8 | Low | The seeded database now carries several WS-13 journey submissions from different learners. They are real data produced by the real path, not fixtures — but the trainer queue is no longer pristine, and one early hunt row was created by hand during debugging and has **no structured report behind it**. Both browser checks target the *newest* hunt row for that reason. |
| 9 | Low | `database.types.ts` is hand-maintained again. Six objects were added from live psql introspection because **`supabase gen types` needs Docker even with `--db-url`** — measured, not assumed. Regenerate on a machine with Docker and it overwrites cleanly. |
| 10 | Low | `next build` still re-appends redundant `.next-ws*` entries to `tsconfig.json` (I-044). Reverted here; it will come back. |

Everything from `RELEASE.md` §6 that was not code — the HTTPS domain, the legal
company data, SMTP — remains open and still blocks real students.

---

## 7. Cross-tree fixes applied (the ISSUES.md ledger)

| Issue | Resolution |
|---|---|
| **I-046** | ⭐ `HuntPanel` composed into the review route. **This is what turned decision D2 from code into a feature** — it was built, tested 17/17, and unreachable. |
| **I-048** | `target_url` set — in `public.tasks` *and* in the published snapshot, which is the one the learner reads. See §8.2. |
| **I-049** | `X-Frame-Options` → `SAMEORIGIN`, `frame-ancestors 'self'` added so the two headers stop disagreeing. |
| **I-050** | `hunt_scenarios_scoped_read` moved into a `security definer` helper. An enrolled learner now reads the scenario **while still reading 0 tasks**; an unenrolled one reads nothing. WS-9's fallback branch deleted with it. |
| **I-051** | A verdict ruled on after acceptance now pays — measured at 70 XP where there were 0, and a replay pays 0. |
| **I-052 / I-057** | Six objects hand-added to `database.types.ts`; **all four untyped casts deleted.** |
| **I-055** | The trainer progress view now reads the same role-scoped RPC as the admin board. Dead cluster removed. |
| **I-056** | `/admin/progress` in `ADMIN_NAV` and in smoke. |
| **I-039** | `npm run db:lint` passes as written. |
| **I-044 / I-060** | `tsconfig.json` reverted; `next-env.d.ts` audited clean across all history. |
| **I-030 / I-033** | SEC-3 checked by value; smoke gained the missing routes. |
| I-036, I-041, I-047, I-053, I-058 | Informational or coordinator-owned; see §8. |

---

## 8. Things learned the hard way that are written down nowhere else

1. **A projection is not the table.** `get_my_learning_task` reads
   `content_versions.snapshot`, not `public.tasks`. Setting `tasks.target_url`
   — which both workstreams that logged I-048 recorded as the fix — changed
   nothing a learner could see: the hunt rendered with a **THEORIE** badge, no
   iframe, and the generic answer box instead of the defect form. The headline
   feature of this phase did not exist for a learner, on a task that looked
   perfectly healthy in the database.

2. **One rule, two enforcement points, and only one was widened.** Both
   `tasks_target_url_protocol` and `is_valid_learner_content_snapshot` carry
   `^https?://`. A CHECK refuses a write with a clear error; the validator
   invalidates the whole snapshot — and an invalid learner snapshot does not
   degrade a page, it makes `list_my_learning_courses` return zero rows and the
   course vanishes for every enrolled learner with no error anywhere (I-041).
   **The assertion placed before touching it is the only reason the transaction
   rolled back instead of quietly emptying the course.** Assert the invariant
   you are about to risk, in the same transaction.

3. **`supabase gen types` needs Docker even with `--db-url`.** Three workstreams
   stopped at "`db:types` is `--local`". The obvious next move is not a fix —
   `gen types` runs `pg_meta` in a container wherever the database lives.

4. **A `null`-returning Server Component is safe to render, not safe to *tab*.**
   `HuntPanel` returns `null` for non-hunts so it can be dropped in
   unconditionally — right for a stacked layout, wrong for a tab bar, where it
   produces a tab with nothing behind it.

5. **`aria-disabled` on a wrapper disables what is inside it.** Adding an action
   to a locked row meant removing both `opacity-80` (which dims a child's focus
   ring in a way a computed-colour audit cannot see, because the child's own
   opacity is still 1) and `aria-disabled` (which told assistive technology —
   and Playwright — that the one actionable thing on the row was unavailable).

6. **A normaliser that is not idempotent is a trap for its second caller.**
   `toLockReason` accepted both shapes and quietly returned nulls for its own
   output, because both key sets were `nullish`. No error, no warning, and a
   link that vanished while the text beside it kept working.

7. **The gate assertion has to fail on the broken version.** Three separate
   checks in this workstream passed green against a broken system: `<main>` was
   extracted from a streamed response and read 0 characters on *every healthy
   page* (39 false failures); "the report submits" matched `/eingereicht/`
   against a progress checklist that contains those words permanently; and the
   trainer-load check reviewed the oldest queue row, which had no structured
   report, and reported D2 as undelivered. **Ask what the check does when the
   feature is broken, and when it is fine.**

8. **The append-only guards are a coherent statement, not obstacles.**
   `xp_ledger`, `attempt_command_receipts` and `submission_versions` each refuse
   a DELETE, and `attempts_validate_transition` refuses a rewind. Evidence of
   what a learner did is not rewritable on this deployment. A test script does
   not get to argue with that — it works around it or picks a fresh learner.

9. **Test as the user who has the problem.** Every browser check in this phase
   used the one learner for whom the feature under test was already complete.
   Five workstreams, five green runs, and a bug that broke the app for everyone
   else. Pick the account that is *in* the state you are testing.

---

## 9. The next session's list, in order

1. **Give the uncommitted tree in §0 an owner.** It is the EN/RU pass plus real
   fixes, it is not committed, and the repo is inside OneDrive.
2. **The HTTPS domain.** It unblocks hunt submission (§5.2) and it is already
   `RELEASE.md` §6 blocker 1. Nothing in the arena is shippable to students
   without it.
3. **Screenshot upload** (§5.1) as its own focused unit, with the privileged
   finalize handler given the review it deserves. Everything downstream of it
   already works.
4. **Get WS-9's colleague check done** — a person told "there are no bugs in
   this build", looking at `/de/arena/sandbox/checkout-v1?draft=1&defects=off`.
   Until then, every unintentional visual defect is a false report and a wasted
   trainer review, which is precisely the cost D2 exists to control.
5. **Reconcile the migration ledger** (I-036) — 45 recorded, 50 files now, four
   applied by hand and unrecorded, one recorded with no file. Any future
   `supabase db push` will try to re-run them.
6. **Reconcile the two documents against reality** (coordinator): §G1's scenario
   `configuration` shape is not what WS-9 shipped (I-047), §G8 names a
   lock-reason code that does not exist (I-037), and §8.1 contradicts the §G5
   guard rail (I-053).
7. **Decide `'placement'`** (I-040) — either wire it into `submit_attempt`'s
   guard or drop the kind.
8. Re-drive the **revision → resubmit** half of the journey through the UI.

---

## 10. Verdict

The thing this phase set out to build works: a student meets a locked task, is
told exactly how to open it, plays a hunt against a sandbox we own, files a real
ticket, and a trainer rules on it in seconds with the ground truth in front of
them — after which the gate opens and the reward lands. Both risks the design
named were measured rather than assumed, and both held.

It is not shippable to students yet, and the reasons are specific rather than
vague: without HTTPS a hunt report cannot be submitted at all, and without
screenshot upload the ticket is missing the evidence a real defect report
carries. Neither is a design failure; both are a deployment and a deferred unit.

The most valuable thing this phase produced is not in the feature list. Five
workstreams ran green browser checks over an application that was broken for
five of its six learners, because every one of them tested as the learner who
did not have the problem. That is written down in §8, and the regression net now
has a role whose whole job is to be in the broken state.
