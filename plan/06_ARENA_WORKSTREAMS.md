# Arena Phase — Workstreams & Chat Protocol (WS-8 → WS-13)

> Companion to `plan/05_BUG_ARENA_AND_GAMIFICATION.md` (the design) and
> `plan/04_PROMPTS_AND_HANDOFF.md` §2.5–2.6 (the prompts you paste).
>
> Same protocol as the V3 build in `02_WORKSTREAMS.md`. **One difference that
> changes everything: this phase is a dependency chain, not six parallel lanes.**

---

## 1. What is different from the V3 build

| V3 build (WS-0 → WS-7) | Arena phase (WS-8 → WS-13) |
|---|---|
| One gate (WS-0), then 6 parallel chats | A **chain**: 8 → (9 ‖ 10) → 11 → 12 → 13 |
| Built on an empty tree; every file was new | Built on a **live, shipped app**. Regression is the main risk, not blank pages |
| Almost no migrations — schema was pre-existing | **Every workstream but WS-9 writes migrations.** Ordering and collisions matter |
| Ownership map assigned each tree to exactly one chat | Several trees are **re-assigned** here because their V3 owner is finished |

Two chats can only run at once during Wave B (WS-9 ‖ WS-10). Everywhere else,
running the next workstream before its predecessor is `DONE` means building
against a schema that is about to change underneath you.

---

## 2. Wave structure

```
WAVE A   ⛔ GATE — blocks everything
  WS-8   Foundation: schema, hunt tables, relative scheduling, lock-reason enrichment
           │
           ├──────────────┬──────────────
WAVE B     ▼              ▼            (these two may run in parallel)
  WS-9   Sandbox       WS-10  Ticket
  ENGINE + authoring   labels, screenshots,
  contract + 1 ref     trainer ground-truth mapping
  scenario  ⟵ real scenarios are authored LATER, from briefs
           │              │
           └──────┬───────┘
WAVE C            ▼
  WS-11  Rewards: award engine, XP, levels, badges, streaks, Arena hub, header
                  │
WAVE D            ▼
  WS-12  Oversight: admin progress board, risk signals, flag-to-trainer
                  │
WAVE E            ▼
  WS-13  Integration & Test  ⛔ SERIAL, LAST, ALONE
```

**Before Wave A starts,** update `plan/status/BOARD.md`. It currently shows
WS-0 → WS-7 as `NOT STARTED`, which is wrong — they are all `DONE` per
`plan/status/RELEASE.md` and the git log. A stale board is how you lose track of
a dead chat.

---

## 3. The first slice — build this before anything else

Inside WS-8, before the full schema work, prove the whole loop end to end with
**one** of everything:

```
one locked task → one hunt → one scenario → one planted bug
    → student reports it → trainer accepts → task unlocks → one badge appears
```

It touches every layer in the phase: the widened enum, the prerequisite gate, the
review loop, the award RPC, the celebration. If any part of the design in
`05_BUG_ARENA_AND_GAMIFICATION.md` is wrong, it surfaces here — in one day,
in one chat — instead of five workstreams deep with four chats' work built on it.

The badge/XP part of this slice may be a deliberately crude hardcoded insert.
WS-11 replaces it properly. The point is proving the round-trip, not shipping it.

**Do not open Wave B until this slice round-trips in a browser.**

---

## 4. File ownership map

Same prime directive: **every path is owned by exactly one workstream, and no
chat writes outside its tree.**

Paths marked ⚠️ are **re-assigned** from a V3 owner that has finished. That
re-assignment is only valid inside this phase.

| Path | Owner | Others may |
|---|---|---|
| `supabase/migrations/20260722*` · `src/shared/data/arena.ts` · `src/features/arena/model.ts` | **WS-8** | import only |
| ⚠️ `src/shared/layout/nav-config.ts` *(the Arena entry only — see §7)* | **WS-8** | read only |
| ⚠️ `app_private.learner_snapshot_task_lock_reasons` + the projections that call it | **WS-8** | read only |
| `src/app/[locale]/(student)/arena/**` · `src/features/arena/sandbox/**` · `supabase/seed_arena_scenarios.sql` | **WS-9** | read only |
| `src/features/arena/ticket/**` · `supabase/migrations/20260724*` | **WS-10** | import only |
| ⚠️ `src/features/learning/defect-form.tsx` · the defect schema in `src/features/learning/model.ts` | **WS-10** | read only |
| ⚠️ `src/features/review/hunt-*.tsx` *(new files only — never edit `decision-panel.tsx`)* | **WS-10** | read only |
| `src/features/arena/rewards/**` · `src/app/[locale]/(student)/learn/arena/**` · `supabase/migrations/20260725*` | **WS-11** | import only |
| `src/app/[locale]/(admin)/admin/progress/**` · `src/shared/data/progress.ts` · `src/features/admin/progress-*.tsx` · `supabase/migrations/20260726*` | **WS-12** | — |
| everything, **fix-only** · `supabase/migrations/20260727*` | **WS-13** | — |
| `plan/status/WS-<n>.md` | that workstream | — |
| `plan/status/ISSUES.md` | append-only, everyone | append a row, never edit one |
| `plan/00_*.md`, `02_*.md`, `05_*.md`, `06_*.md` | coordinator | read only |

### Collision hot-spots — read this twice

1. **Migration filenames are pre-partitioned by date block.** WS-8 = `20260722*`,
   WS-9 = seeds only, WS-10 = `20260724*`, WS-11 = `20260725*`,
   WS-12 = `20260726*`, WS-13 = `20260727*`. **Never use another workstream's
   block.** Two chats picking the same timestamp is a merge conflict in the one
   file where ordering is semantic.
2. **`decision-panel.tsx` is not WS-10's to edit.** The trainer's ground-truth
   panel goes in *new* `hunt-*.tsx` files that the existing panel composes. If
   composition genuinely requires a one-line change to `decision-panel.tsx`,
   append it to `ISSUES.md` and let WS-13 apply it.
3. **`learner_snapshot_task_lock_reasons` is `security definer` and feeds RLS.**
   Only WS-8 touches it. Adding fields to its return is safe. Changing its
   boolean logic is not — that is a privilege decision, and it is why exactly one
   workstream owns it.
4. **Nobody edits `src/shared/ui/`.** Unchanged from V3. Wrap, do not modify.
5. **Nobody runs `npm install`.** Dependencies stay frozen. The design was
   written specifically to need none.
6. **`src/features/learning/**` is otherwise WS-2's shipped work.** WS-10 gets
   the defect form and its schema. Everything else in that folder — the iframe
   panel, hint cascade, task workspace, autosave — is read-only.

---

## 5. Protocol for every Arena chat

### 5.1 Start-up sequence

1. Read `plan/05_BUG_ARENA_AND_GAMIFICATION.md` completely — especially §5, the
   settled decisions. They are not open for re-litigation.
2. Read this file's §4 (your ownership tree) and your §8 section.
3. Read `plan/status/WS-<n>.md` if it exists — a previous chat died; resume from
   its `RESUME HERE` block, do not restart.
4. Read `plan/status/RPC_CONTRACTS.md` — the real signatures. Never guess one.
5. `git log --oneline -20`

### 5.2 Dev server — copy exactly

| WS | Command |
|---|---|
| WS-8 | `NEXT_DIST_DIR=.next-ws8 DITELE_APP_ORIGIN=http://127.0.0.1:3108 npm run dev -- --port 3108` |
| WS-9 | `NEXT_DIST_DIR=.next-ws9 DITELE_APP_ORIGIN=http://127.0.0.1:3109 npm run dev -- --port 3109` |
| WS-10 | `NEXT_DIST_DIR=.next-ws10 DITELE_APP_ORIGIN=http://127.0.0.1:3110 npm run dev -- --port 3110` |
| WS-11 | `NEXT_DIST_DIR=.next-ws11 DITELE_APP_ORIGIN=http://127.0.0.1:3111 npm run dev -- --port 3111` |
| WS-12 | `NEXT_DIST_DIR=.next-ws12 DITELE_APP_ORIGIN=http://127.0.0.1:3112 npm run dev -- --port 3112` |
| WS-13 | `NEXT_DIST_DIR=.next-ws13 DITELE_APP_ORIGIN=http://127.0.0.1:3113 npm run dev -- --port 3113` |

### 5.3 Gates before every commit

```
npm run typecheck
npm run lint
npm run i18n:check          # de + en + ru, every new string
node scripts/smoke.mjs
npm run db:lint             # if you touched supabase/migrations/
```

Full `npm run verify` before declaring the workstream `DONE`.

### 5.4 Rules that override everything else

- **Never edit outside your ownership tree.** Append to `ISSUES.md` and work
  around it locally instead.
- Never `git add .` or `git add -A`. Stage explicit paths.
- Never `git checkout` a branch, `reset --hard`, `stash`, `rebase`, or force-push.
- No new npm dependencies, ever.
- No hardcoded UI strings — i18n layer. ⚠️ **The contract changed after WS-7.**
  Read `scripts/check-i18n.mjs` before writing keys:
  - **German is the source of truth.** New interface strings go in `de.json`.
  - `en.json` / `ru.json` are **optional per key** — a missing key falls back to
    German at runtime by design. That is a WARN, not a failure.
  - `i18n:check` **FAILS** on a key present in `en`/`ru` but absent from `de`
    (stale key), and on an **empty-string** translation. Never add blank
    placeholders to satisfy the gate — that is what breaks it.
  - **INTERFACE = de + en + ru. COURSE MATERIAL = German only**
    (`CONTENT_LOCALES === ["de"]`, `src/features/content/model.ts:21`). Task
    text, hunt descriptions and instructions are German. Do not build a
    three-locale jsonb for content a learner reads.
- No hardcoded colours — tokens in `globals.css`.
- Every route needs `loading.tsx`, `error.tsx`, and an empty state.
- 44px minimum touch targets, works at 375px, works in dark mode. WS-7 fixed all
  of these once already; do not reintroduce them.
- **Migrations are forward-only and idempotent.** This runs against a live
  database. `create table if not exists`, `drop policy if exists` before
  `create policy`, and never a destructive `alter` without a data check first.

### 5.5 Shut-down sequence

Commit after every completed unit. Update `plan/status/WS-<n>.md` — including
`RESUME HERE` — after every file, not at the end. If context starts filling up,
stop building and spend what remains on the handoff. See `04_PROMPTS_AND_HANDOFF.md` §4.

---

## 6. ⛔ THE WAVE-A GATE — coordinator verifies personally

Wave B does not start until every box is ticked by **you**, not by the chat
claiming it.

- [ ] The first slice (§3) round-trips in a real browser: locked task → hunt →
      report → trainer accepts → task unlocks → badge visible
- [ ] `task_kind` accepts `'hunt'`; the three existing kinds still work
- [ ] `hunt_scenarios` and `hunt_findings` exist with RLS enabled and a
      scoped-read policy — **check RLS is actually ON**, not just the table created
- [ ] `task_schedules.offset_days` resolves against `enrollments.decided_at`;
      two learners enrolled 3 weeks apart both see "opens on your day 15"
- [ ] Existing absolute-date schedules still behave exactly as before
- [ ] `learner_snapshot_task_lock_reasons` returns `required_task_id` +
      `required_task_title`, and the title comes from the published-content
      projection the learner may already read (**no content leak**)
- [ ] `npm run verify` green · `npm run db:lint` green
- [ ] Log in as student, trainer, and admin. Click through. Nothing regressed.

The last box is the one people skip. This phase modifies a shipped app.

---

## 7. The `nav-config.ts` exception

`src/shared/layout/nav-config.ts` carries an explicit header: *"⭐ SINGLE SOURCE
OF TRUTH … **Only WS-0 edits it.**"* WS-0 is finished and no longer running.

**WS-8 is granted a narrow, written exception:** it may add exactly one
`STUDENT_NAV` entry for the Arena and adjust which entries carry `primary`.
Nothing else in the file. No other Arena workstream touches it — if WS-11 needs
a nav change, it goes through `ISSUES.md` to WS-13.

Still open for the coordinator to decide before WS-8 reaches this step: the
mobile tab bar caps at 5 including "Mehr", so one current primary entry must move
to the sheet. Recommendation is that "Fragen" moves. **Record the decision in
`ISSUES.md` before WS-8 edits the file**, so the reason survives the chat.

---

## 8. The workstreams

### WS-8 — Foundation ⛔ BLOCKS EVERYONE · port 3108 · migrations `20260722*`

**Build in this order. The slice comes first.**

1. **The first slice (§3), crudely.** Hardcode whatever you must. Prove the loop.
2. `task_kind` widened to include `'hunt'`.
3. `hunt_scenarios` — code, scenario_version, labels, configuration (the
   planted-bug list), expected_findings, state. RLS: learners read published
   scenarios for tasks they can see; authors write.
   ⚠️ **Scenario title and description are COURSE MATERIAL — German only**
   (`CONTENT_LOCALES === ["de"]`). Follow whatever shape `task_localizations`
   uses today; do not invent a three-locale jsonb the studio has no editor for.
4. `hunt_findings` — one row per reported defect: attempt_id, submission_id,
   planted_code, verdict `pending|confirmed|duplicate|invalid|bonus`.
   `'bonus'` is deliberate — an unplanted real bug is worth more, not less.
5. **Relative scheduling.** `task_schedules.offset_days` + `window_days`, with the
   check constraint enforcing exactly one mode per row. Resolve against
   `enrollments.decided_at` inside the lock-reason function.
6. **Lock-reason enrichment** — return `required_task_id`, `required_task_kind`,
   `required_task_title` alongside `code: 'prerequisite'`.
7. `src/shared/data/arena.ts` + `src/features/arena/model.ts` — the types and
   pure helpers the later workstreams import. Mirror the split in
   `features/learning/model.ts`: **no server imports**, because client components
   need these at runtime.
8. The nav entry (§7).

**Highest-risk item:** step 5 and 6 both modify a `security definer` function
that feeds RLS. Read `20260717100050_content_integrity_and_trainer_scope.sql:671`
before you touch it. Widen the return, never the permission.

---

### WS-9 — Sandbox engine · port 3109 · seeds only, no migrations

Owns `src/app/[locale]/(student)/arena/**` and `src/features/arena/sandbox/**`.

> ⭐ **Your deliverable is the ENGINE, not the scenarios.** The real buggy screens
> get authored later, from briefs the product owner supplies one at a time. If
> adding scenario #4 next month requires touching anything you built, you built
> the wrong thing.
>
> Ship **one reference scenario** — enough to prove the engine and to serve as the
> worked example future authors copy. Do not invent a catalogue of bugs nobody
> asked for.

1. `/[locale]/arena/sandbox/[scenarioId]` — resolves the scenario from
   `hunt_scenarios`, renders its surfaces, applies its planted defects.
2. **The defect registry is data.** A scenario names which defects are active;
   the components read that and mutate their own behaviour. Adding a bug must
   never mean adding a code branch. Prior art: the DiTeLe shop does exactly this
   server-side — for `p3gn` it appends `-error` to a class so the theme's JS
   selector misses and the carousel arrows die.
3. **The authoring contract**, written down in
   `src/features/arena/sandbox/README.md`. This is a real deliverable, not a
   nicety — it is what makes scenario #4 a one-afternoon job for someone who was
   not in your chat:
   - the `configuration` JSON shape, every field, with the reference scenario as
     a worked example
   - how a defect declares its surface and trigger
   - how to add a **stateful** defect (fires only after N interactions, or only
     for certain input)
   - how to add a **decoy** — odd-looking but correct behaviour
   - the visual-correctness checklist below
   - how to preview a scenario locally before seeding it
4. **One reference scenario** exercising every capability the contract claims:
   at least one stateless defect, one stateful defect, one decoy. If the contract
   documents a feature the reference scenario does not use, you have not proven it.
5. Capture-region button — grabs the sandbox area, hands the image to WS-10's
   upload flow. **Same-origin is what makes this possible; do not break it.**
   No sandbox route may load its content from another origin.

#### ⭐ The visual-correctness bar — higher here than anywhere else in the app

**The sandbox must be pixel-perfect except for the planted defect.** This is the
rule that decides whether the whole feature works.

A student cannot tell "this is the bug I was sent to find" from "this screen is
just broken". Every unintentional visual defect becomes a false bug report, and
every false report costs a trainer a real review — which is precisely the cost
D2 exists to control. A sloppy sandbox does not merely look bad; it multiplies
the load on the one human bottleneck in the system.

So a scenario is not shippable until, **with all defects disabled**:

- [ ] renders correctly at 375px, 768px and 1280px, no horizontal scroll
- [ ] renders correctly in light **and** dark mode, no invisible text
- [ ] no layout shift on load, no overlapping elements, no clipped labels
- [ ] every interactive element has a visible focus state and a 44px touch target
- [ ] no console errors, no failed network requests
- [ ] **German content at full length.** Course material is German-only
      (`CONTENT_LOCALES === ["de"]`), and German compounds overflow buttons that
      English fits fine — so test with the longest real string, not a short
      placeholder. Any *interface* chrome around the sandbox still switches
      de/en/ru, so check the frame in all three even though the content stays
      German.
- [ ] a colleague told "there are no bugs in this build" finds nothing

Then, **with defects enabled**, exactly the planted ones are observable and
nothing else changed. Diff the two renders if you can.

The last checkbox is the real test and it needs a second person. Budget for it.

**Do not** put the defect form here. That is WS-10's. The sandbox renders the
buggy UI and nothing else.

#### Adding scenarios later — the repeatable task

Once this workstream is `DONE`, a new scenario is **not** a workstream. It is:

```
1. Product owner writes the brief: what the screen is, what is broken,
   how to trigger it
2. Author the surface component(s), if the scenario needs new ones
3. Add the scenario row + configuration to seed_arena_scenarios.sql
4. Run the visual-correctness checklist above
5. Point a hunt task at it via tasks.external_id
```

No migration, no engine change, no touching WS-8's schema. **If a future scenario
cannot be added this way, that is a defect in WS-9 and it goes in `ISSUES.md`.**

---

### WS-10 — The ticket · port 3110 · migrations `20260724*`

1. Extend `DefectReportSchema` with the four new fields — `description: string`,
   `labels: string[]` (from `bug_categories`), `environment: string` (prefill
   browser + viewport from `navigator`, editable), `screenshotIds: string[]`.
   The full Jira field-parity map is in `05_…` §G3+G4 — every other ticket field
   already exists or falls out of the attempt/review machinery.
2. Screenshot upload — **reuse `evidence_uploads`** and its quarantine +
   server-side byte validation. Do not invent a second upload path; that one
   already passed security review.
3. Ticket view — the report as the student and trainer both see it, Jira-shaped.
4. **The trainer's ground-truth panel** (decision D2, the load mitigation):
   shows the likely planted-bug match, "2 of 5 found", and whether all required
   fields are present. Trainer still decides. New `hunt-*.tsx` files that
   `decision-panel.tsx` composes — never edit that file.
5. Writes `hunt_findings` rows on submit (`verdict='pending'`) and on trainer
   decision (`confirmed|duplicate|invalid|bonus`).

**The matching must never auto-accept.** It ranks and annotates. A trainer who
disagrees with the match overrides it in one click, and that override is what
`hunt_findings.verdict` records.

---

### WS-11 — Rewards · port 3111 · migrations `20260725*`

1. **The award engine** — `app_private.award_for_event(...)`, `security definer`,
   called **inside the existing review-decision transaction**. Not a trigger, not
   a background job. Same transaction means a student never sees "accepted"
   without the XP that goes with it.
2. XP values from `anforderung/01_RESEARCH_LERNPLATTFORM.md` §8.1 **verbatim**.
   Levels from §8.2. Set `rule_version` on every write so a future re-scoring does
   not silently rewrite history.
3. **XP on trainer acceptance, never on submission alone.** Otherwise the optimal
   strategy is spamming low-effort reports, and the game teaches the opposite of
   the course.
4. Badge rule evaluation → `badge_awards`. Idempotency is already in the schema
   (`unique (badge_id, learner_id, source_event_id)`) — use it, do not work
   around it.
5. `learner_streaks` — day granularity in the learner's timezone, **2 freezes per
   month** per §8.4. A streak that breaks because someone had a hospital day is a
   reason to quit, not to try harder.
6. Arena hub at `/learn/arena` — pending hunts, level, XP-to-next, streak, badges.
7. Celebration UI on level-up and badge award. **Respect `prefers-reduced-motion`.**
8. Notifications reuse the existing dedup keys — no double-toast.

**Not in this workstream:** the leaderboard (decision D4, deferred). Do not build
it, and do not let anything you write assume a global ranking exists.

---

### WS-12 — Oversight · port 3112 · migrations `20260726*`

1. `/[locale]/admin/progress` — one row per active enrollment: student, course,
   **day N of their own plan**, tasks done, level, streak, open hunts, last active.
2. **Sorted by risk, not alphabetically.** Three signals:
   `stalled` (no activity ≥ 7 days) · `behind` (completed ≪ elapsed plan) ·
   `stuck` (same hunt rejected ≥ 3 times — a teaching problem, not a student one).
3. "Trainer benachrichtigen" → `notifications` row scoped to the assigned
   `course_trainers`.
4. **Unify the trainer view.** `trainer/progress` was rebuilt from
   `cohort_memberships` because trainers read 0 rows from `enrollments`
   (`ISSUES.md` I-018). The course-trainer migration fixed that policy. Migrate
   the trainer view to read `enrollments` directly, or admin and trainer will show
   different numbers and nobody will trust either.
5. Every number is **plan-relative**, never absolute. Two students on different
   start dates must be comparable.

---

### WS-13 — Integration & Test ⛔ SERIAL, LAST, ALONE · port 3113 · migrations `20260727*`

The only workstream allowed to edit any file, and **only to fix**.

1. Read every `plan/status/WS-8..12.md` and all of `ISSUES.md`.
2. Apply the cross-tree fixes the other chats had to work around.
3. **Full regression pass on the pre-existing app.** This phase modified
   `learner_snapshot_task_lock_reasons`, `task_schedules`, `defect-form.tsx` and
   `nav-config.ts` — all load-bearing for features that shipped in V3. Walk the
   V3 routes and confirm nothing broke.
4. **The end-to-end hunt journey, as a real user, in a browser:**
   enrol → see locked task → follow the link → play the hunt → find a real bug →
   miss a decoy → file the ticket with a screenshot → trainer reviews with the
   ground-truth panel → requests a revision → student resubmits → trainer accepts
   → task unlocks → XP lands → badge fires → admin sees the progress row.
5. **The two designed-in risks, verified rather than assumed:**
   - **Trainer load** — time an actual review with the ground-truth panel. If it
     is not dramatically faster than reading cold, D2 did not deliver and that
     goes in `RELEASE.md` as a known gap.
   - **Relative fairness** — two seeded learners enrolled ~3 weeks apart. Every
     screen must show each of them their own day-N, and no screen may rank one
     above the other on absolute XP.
6. Hard stops, all must be green:
   - `npm run verify`
   - `npm run db:lint`
   - `node scripts/smoke.mjs`
   - `grep -r "service_role" .next/static/` returns **nothing**
   - every new route at 375px, no horizontal scroll
   - every new route in dark mode, no invisible text
   - `prefers-reduced-motion` respected by every celebration
7. Consistency pass — five chats built this. Make it look like one team did.
8. Write `plan/status/RELEASE-ARENA.md`: what shipped, what did not, known bugs,
   next session's list. **Be honest about gaps. A hidden gap is worse than a
   listed one.**

---

## 9. Status file template

Every `plan/status/WS-<n>.md` starts with the `RESUME HERE` block from
`04_PROMPTS_AND_HANDOFF.md` §4.4, then:

```markdown
# WS-<n> — <name>

## Delivered
- <route or capability> — gates passed

## Migrations written
- 2026072X_<name>.sql — what it does, whether it is reversible

## Data functions added
- src/shared/data/<file>.ts — function names only

## Gates
- typecheck / lint / i18n / smoke / db:lint — pass or fail, with the failure

## Deferred / not built
## Issues found in someone else's area  → also appended to ISSUES.md
## Things I learned that are written down nowhere else
```

That last section is the valuable one. Anyone can read the code to see what
exists. **Nobody can recover what you learned the hard way** unless you write it.
