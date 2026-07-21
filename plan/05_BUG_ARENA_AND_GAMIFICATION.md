# Bug Arena & Gamification — Workflow Proposal

> Status: **DRAFT — awaiting green light.** Nothing in here is built yet.
> Scope: the "play a bug hunt to unlock the next task" loop, the badge/XP engine,
> the admin progress view, and per-student relative scheduling.

---

## 0. The one decision that shapes everything else

**The game is not a new subsystem. It is a task with a different `task_kind`.**

The instinct is to build a parallel "arena" world — its own tables, its own
review queue, its own state machine, bolted onto the side of the learning system.
That would double the surface area, duplicate the review loop, and create a
second place where "is this student allowed to see this?" gets decided. Two
authorization models on one database is how you get a privilege leak.

Instead:

```
Hunt task H  ──prerequisites(target=T, required=H)──▶  Content task T
     │                                                       │
     │ student plays, files defect report                    │ stays locked
     ▼                                                       │ (lock_reasons
  attempt → submitted → trainer review                       │  = prerequisite)
     │                                                       │
     ├─ revision_required ──▶ back to student with comment    │
     └─ accepted ─────────────────────────────────────────────┘ unlocks
                    (+ XP, + badge check, + notification)
```

Every arrow in that diagram **already works in this codebase** except the
`+ XP, + badge check` step. We are not building an unlock mechanic. We are
labelling a kind of task, giving it a better screen, and connecting the reward
plumbing that was laid but never wired.

---

## 1. What already exists (verified, not assumed)

### Working end to end today

| Capability | Where |
|---|---|
| iframe practice panel — student tests a live UI in-page | `src/features/learning/iframe-panel.tsx` |
| Defect report form — summary, severity, URL, steps, expected, actual | `src/features/learning/defect-form.tsx` |
| Attempt state machine `in_progress → submitted → revision_required → resubmitted → accepted` | `20260717098400_attempt_start_telemetry_assessments.sql` |
| Trainer review with comment + accept / request-revision | `src/features/review/decision-panel.tsx`, `20260717098500_rubric_review_effects.sql` |
| Prerequisite gating, with `lock_reasons` already delivered to the UI | `app_private.learner_snapshot_task_lock_reasons`, `src/shared/data/learning.ts:271` |
| Progressive hint cascade with XP penalty field | `hint-cascade.tsx`, `tasks.hint_penalty_basis_points` |
| Autosaved drafts that survive reload | `use-autosave.ts`, `attempt_drafts.evidence_draft` |
| Private evidence upload — bucket, quarantine, server-side byte validation | `20260717100160_private_task_evidence_uploads.sql` |
| Notification fan-out with dedup keys | `notifications`, `delivery_attempts` |
| Trainer↔course scoping | `course_trainers`, `20260721130000_course_based_assignment.sql` |

### Schema exists, **nothing ever writes to it**

These tables were created in `20260717094000_engagement_integrations_compliance.sql`
and given self-read RLS policies in `…095000_authorization_rls_and_workflows.sql:578`.
Then they were never touched again. Grep confirms: zero inserts, zero RPCs.

- `xp_ledger` — with idempotency built in (`unique (learner_id, source_event_id)`)
- `badges`, `badge_awards` — likewise idempotent per source event
- `missions`, `mission_progress`
- `leaderboard_preferences` — opt-in with alias, GDPR-shaped
- `mastery_events`, `mastery_snapshots`
- `bug_categories` + `tasks.bug_category_id`
- `lab_definitions`, `lab_sessions`, `lab_leases`

**This is the single biggest lever in the whole project.** The hard part of a
reward engine is idempotency — making sure a student who double-clicks, or a
retried webhook, does not get 200 XP for one accepted report. That constraint is
already in the schema. We write the RPC that inserts, not the model that holds it.

### Already specified in the approved requirements

`anforderung/01_RESEARCH_LERNPLATTFORM.md` **§8 is a complete gamification spec** —
the XP table, 12 named levels ("Neuling" → "Legende"), 7 badge categories, the
streak rules with freeze allowance, leaderboard reset cadence, and the motivation
triggers. R7 promises trainers can award badges. R15 promises badges on profiles.

We are not designing this from scratch. We are implementing an approved spec.

---

## 2. What is genuinely missing

| # | Gap | Size |
|---|---|---|
| G1 | **The sandbox app itself** — the buggy UI students actually test | Large |
| G2 | `task_kind = 'hunt'` + the planted-bug registry per scenario | Medium |
| G3 | Screenshot attachment in the defect form (bucket exists, form ignores it) | Small |
| G4 | Jira-style **labels** + reporter name on the report | Small |
| G5 | **The award engine** — the RPC that writes xp/badges on accepted review | Medium |
| G6 | Streak tracking — §8.4 is specified, no table exists | Small |
| G7 | Header "Arena" entry + pending-hunt count | Small |
| G8 | Lock reason → deep link "play the hunt that unlocks this" | Small |
| G9 | **Per-student relative scheduling** — today schedules are cohort-absolute | Medium |
| G10 | Admin progress dashboard + "flag this student to their trainer" | Medium |

---

## 3. Design detail per gap

### G1 — The sandbox: in-app buggy routes

`/[locale]/arena/sandbox/[scenarioId]` — deliberately broken screens we own and
deploy with the app: a checkout flow, a login/registration form, a data table
with filters. Each renders from a scenario config that names which defects are
active, so **a bug is data, not a code branch.**

Two scenarios sharing one component with different planted bugs is the proof you
got this right. If adding a bug means editing a component, the design has drifted.

```jsonc
{
  "scenario": "checkout-v1",
  "planted": [
    { "code": "TOTAL_IGNORES_DISCOUNT", "severity": "high",
      "surface": "cart-summary", "trigger": "coupon applied" },
    { "code": "QTY_ACCEPTS_NEGATIVE",   "severity": "medium",
      "surface": "line-item",  "trigger": "type -1 into quantity" },
    { "code": "EMAIL_VALIDATION_BYPASS","severity": "low",
      "surface": "checkout-form", "trigger": "submit with 'a@b'" }
  ],
  "decoys": ["SLOW_IMAGE_LOAD"]          // real-looking, not a defect — teaches judgement
}
```

**Decoys matter.** A hunt where everything odd is a bug teaches students to report
noise. Real testing is mostly deciding what *isn't* worth a ticket. The registry
should also record **known non-bugs**, or trainers will see the same wrong report
from every student forever.

At least one **stateful** bug per scenario — appears only after the third click,
only for a certain input. Stateful bugs are the whole reason to own the sandbox
in React rather than serve static HTML.

#### Scenarios are authored later, one brief at a time

**WS-9 builds the engine, not the catalogue.** The actual buggy screens come
later, from briefs supplied one at a time. So WS-9's real deliverable is a
*scenario engine* plus a written **authoring contract**, proven by exactly one
reference scenario. Adding scenario #4 must then be data plus a component — never
a change to the engine, the schema, or a migration.

#### ⭐ The sandbox must be pixel-perfect except for the planted defect

This is the rule the whole feature rests on, and it is easy to underrate.

**A student cannot distinguish "the bug I was sent to find" from "this screen is
just broken."** Every unintentional visual defect becomes a false bug report, and
every false report consumes a real trainer review — the exact cost D2 exists to
control. A sloppy sandbox does not merely look bad; it multiplies load on the one
human bottleneck in the system.

So every scenario ships only after passing, **with its defects disabled**: three
breakpoints, both themes, all three locales with the *longest* strings, no
console errors, no layout shift, visible focus states — and a colleague told
"there are no bugs in this build" finding nothing. Then with defects enabled,
exactly the planted ones are observable and nothing else moved.

The full checklist lives with the workstream, in `06_…` WS-9.

#### Why in-app, and not the existing shop

There is an OpenCart storefront at `shop.ditele-learn.ai/?taskid=<code>` that
already plants bugs. It was briefly the plan; building our own is the better
call, and probing it on 2026-07-21 showed why:

| | Shop (external) | In-app routes |
|---|---|---|
| Screenshot auto-capture | **impossible** — cross-origin frames cannot be read from JS | works, same-origin |
| Session/stateful bugs | at risk — its cookies lack `SameSite=None; Secure`, so Chrome and Safari drop them in a third-party frame | unaffected |
| Ground truth for D2 | lives in someone else's database, must be mirrored and kept in sync | ours by construction |
| Certificate / uptime | its cert **expired 23 Apr 2026** and a browser will not frame an expired origin | our deploy, our cert |
| Runtime | PHP 7.4.33 — **end of life since Nov 2022** | our stack |

The mechanism it uses is still worth copying. It selects a sabotage server-side
from the `taskid` and mutates the markup — for `p3gn`, appending `-error` to a
class so the theme's JS selector misses and the testimonial carousel's arrows
stop working. That is exactly the "bug as data" model above, proven in practice.

> ⚠️ Separately, and nothing to do with this project: that expired certificate
> also covers `api.ditele-learn.ai`, `ditele-learn.ai`, `fiae-learn.com` and
> `startsmart360.com`. They are all serving an expired cert. Worth telling
> whoever owns that infrastructure.

### G2 — Hunt tasks

`tasks.task_kind` is `check (task_kind in ('practical','knowledge','placement'))`.
Add `'hunt'`. One migration, one enum widening, no data change.

New table for ground truth:

```sql
create table public.hunt_scenarios (
  id, organization_id, code, scenario_version,
  labels jsonb,              -- name/description the student reads. GERMAN ONLY —
                             -- CONTENT_LOCALES === ["de"] since commit 8a507cb.
                             -- Match task_localizations' shape; do not invent a
                             -- three-locale structure the studio cannot edit.
  configuration jsonb,       -- the planted-bug list above
  expected_findings integer, -- how many must be found to pass
  state record_state
);

create table public.hunt_findings (      -- one row per reported defect
  id, attempt_id, submission_id,
  planted_code text,         -- trainer-confirmed match, null = not a planted bug
  verdict text check (verdict in ('pending','confirmed','duplicate','invalid','bonus')),
  ...
);
```

`hunt_findings.verdict = 'bonus'` is deliberate: a student who finds a bug we
did not plant should be rewarded more, not marked wrong.

### G3 + G4 — The report becomes a real Jira-shaped ticket

Full field parity, and where each one comes from. **Bold = new work.** The rest
either exists in `DefectReportSchema` today or falls out of the attempt/review
machinery that already runs.

| Jira field | DiTeLe ticket | Source |
|---|---|---|
| Summary / title | `summary` | exists |
| Description | **`description`** | **new** — one free-text field; `steps`/`expected`/`actual` stay separate because they are the teaching |
| Steps to reproduce | `steps` | exists |
| Expected result | `expected` | exists |
| Actual result | `actual` | exists |
| Priority / Severity | `severity` | exists — low · medium · high · critical |
| Labels | **`labels: string[]`** | **new** — from `bug_categories` (functional, UI, data, performance, a11y) |
| Environment | **`environment`** | **new** — prefill browser + viewport from `navigator`, editable |
| Affects / URL | `sourceUri` | exists — prefill with the sandbox URL incl. `scenarioId` |
| Attachments | **`screenshotIds: string[]`** | **new** — → `evidence_uploads` |
| Reporter | the student | automatic — `attempts.learner_id` |
| Assignee | the course trainer | automatic — `course_trainers` |
| Status | `in_progress → submitted → revision_required → resubmitted → accepted` | exists — the attempt state machine |
| Comments | trainer's review comment, student's resubmission | exists — `reviews` |
| Resolution | `hunt_findings.verdict` | new in WS-8 — `confirmed · duplicate · invalid · bonus` |

So the ticket **is** in the plan, and it is WS-10's whole job. Four new fields
plus the verdict; everything else is wiring what exists into a ticket-shaped view.

Screenshots reuse the existing quarantine flow — `evidence_uploads` with
server-side byte validation. Do **not** invent a second upload path; that one
already passed security review.

**Auto-capture is worth building** and is cheap because the sandbox is
same-origin: a "capture region" button on the iframe panel grabs the sandbox area
and pre-attaches it to the report. Manual upload stays available — a real tester
often wants to annotate first — but a one-click attach removes the most common
reason a report arrives with no evidence.

Prefill `sourceUri` with the exact sandbox URL including `scenarioId`, so the
trainer can always reproduce what the student saw.

### G5 — The award engine

One `security definer` RPC, called from inside the existing review-decision
transaction — **not** a trigger, and **not** a background job. Same transaction
means a student can never see "accepted" without the XP that goes with it.

```
app_private.award_for_event(learner, org, source_kind, source_event_id, ...)
  ├── insert into xp_ledger        (unique on learner+source_event → replay-safe)
  ├── evaluate badge rules against the new totals
  ├── insert into badge_awards     (unique on badge+learner+source_event)
  ├── touch mission_progress
  └── enqueue notifications        (dedup key → no double-toast)
```

Point values come from §8.1 verbatim. Levels from §8.2. `rule_version` is already
on every table — so when the values change next year, old awards keep their
provenance instead of silently re-scoring history.

**Guard rail:** XP is awarded on *trainer acceptance*, never on submission alone.
Otherwise the optimal strategy is to spam low-effort reports, and the game teaches
the opposite of what the course teaches.

### G6 — Streaks

`learner_streaks (learner_id, current_length, longest, last_activity_date,
freezes_remaining, freeze_resets_at)`. Day-granularity, computed in the learner's
timezone, one row per learner. §8.4 allows 2 freezes/month — implement it; a
streak that breaks because someone had a hospital day is a reason to quit, not
a reason to try harder.

### G7 — Header

`STUDENT_NAV` in [nav-config.ts](src/shared/layout/nav-config.ts#L38) currently
has 4 primary items and a "Mehr" sheet. Add:

```ts
{ path: "/learn/arena", label: "Arena", primary: true, owner: "WS-8" },
```

Note the file's own warning: *"Only WS-0 edits it."* That rule needs an explicit
exception in writing before WS-8 touches it, or the workstream boundary breaks.

The pending count belongs next to it — same visual treatment as the existing
`notification-bell.tsx`, which already solves the unread-count problem.

Mobile tab bar caps at 5 including "Mehr", so something moves to the sheet.
My call: Arena earns a primary slot; "Fragen" moves. Yours to overrule.

### G8 — The link from a locked task

`learner_snapshot_task_lock_reasons` returns `[{ "code": "prerequisite" }]` today.
It needs to also return **which** task is missing:

```jsonc
{ "code": "prerequisite", "required_task_id": "…", "required_task_kind": "hunt",
  "required_task_title": "Checkout-Jagd" }
```

Then the lock chip on a task card becomes a button: *"🔒 Gesperrt — Jagd spielen,
um freizuschalten →"*. That is the whole feature the user described as "a link on
the locked tasks that redirects to gamification mode."

Careful: that function is `security definer` and feeds RLS decisions. Adding
fields to its return is safe; changing its boolean logic is not. The title must
come from the same published-content projection the learner is already allowed to
read, or we leak the existence of content they should not see.

### G9 — Relative scheduling *(the requirement most likely to be underestimated)*

Today: `task_schedules (cohort_id, task_id, available_from timestamptz, due_at timestamptz)`
— absolute dates shared by a whole cohort. The requirement is that two students
who joined three weeks apart both see "task 4 opens on your day 15."

**Recommended: resolve at read time.**

```sql
alter table public.task_schedules
  add column offset_days integer,          -- days after the enrollment anchor
  add column window_days integer,          -- days the task stays open
  add constraint task_schedules_mode check (
    (available_from is not null and offset_days is null) or
    (offset_days     is not null and available_from is null)
  );
```

Anchor = `enrollments.decided_at` (already populated, already constrained
NOT NULL for every non-`requested` state — verified). Resolution happens inside
the lock-reason function that already runs per learner.

Rejected alternative: materializing per-enrollment schedule rows on approval.
It looks simpler, but every schedule edit then needs a backfill across every
active enrollment, and a student who joined before the edit silently keeps the
old plan. Resolve-at-read has no backfill and no drift.

Open question for you: for a student who pauses for two weeks, does the calendar
keep running, or does the plan stretch? Absolute-from-join is simpler and
predictable; elapsed-active-days is kinder but needs activity accounting. **I'd
ship absolute-from-join first** and only add stretching if students actually
complain — it is an additive change later.

### G10 — Admin progress

New route `/admin/progress`, one row per active enrollment:

```
Student · Kurs · Tag 23 · 8/24 Aufgaben · Level 5 · 🔥12 · 2 offene Jagden
· zuletzt aktiv vor 6 Tagen · [Trainer benachrichtigen]
```

Sorted by risk, not alphabetically. The three signals worth flagging:
**stalled** (no activity ≥ 7 days), **behind** (completed ≪ elapsed schedule),
**stuck** (same hunt rejected ≥ 3 times — that is a teaching problem, not a
student problem).

"Trainer benachrichtigen" writes a `notifications` row scoped to the assigned
`course_trainers` — the plumbing exists.

Data note: `trainer/progress` was rebuilt from `cohort_memberships` because
trainers read 0 rows from `enrollments` (issue I-018). The course-trainer
migration fixed the policy; the admin view should read `enrollments` directly
and the trainer view should be migrated to match, or the two screens will show
different numbers and nobody will trust either.

---

## 4. Build order

Sequenced so each phase is shippable and testable on its own. No phase depends
on a later one.

| Phase | Delivers | Depends on |
|---|---|---|
| **WS-8** Foundation | `task_kind='hunt'`, `hunt_scenarios`, `hunt_findings`, relative scheduling (G9), lock-reason enrichment (G8) | — |
| **WS-9** Sandbox | The scenario **engine**, the authoring contract, **one** reference scenario, capture-region. Real scenarios are authored later from briefs — see `06_…` WS-9 | WS-8 |
| **WS-10** Ticket | Labels, screenshots, environment on the report; trainer sees planted-bug mapping | WS-8, existing upload flow |
| **WS-11** Rewards | Award engine, XP, levels, badges, streaks, celebration UI, Arena hub + header | WS-8, WS-10 |
| **WS-12** Oversight | Admin progress board, risk signals, flag-to-trainer, trainer view unified | WS-8, WS-11 |

**Suggested first slice to prove the loop end to end** — one hunt, one scenario,
one planted bug, one badge. Locked task → play → report → trainer accepts →
task unlocks → badge appears. Once that round-trips, everything after it is
breadth, not risk.

Each phase keeps the existing hard gates: `npm run verify` (i18n, no client
secrets, contrast, typecheck, lint, test, build) plus `supabase db lint`.
Three locales — `en`, `de`, `ru` — every new string in all three, which
`i18n:check` enforces.

---

## 5. Decisions

### Settled — 2026-07-21

| # | Decision | Consequence |
|---|---|---|
| D1 | **Sandbox = in-app buggy routes.** `/[locale]/arena/sandbox/[scenarioId]`, rendered from a DB scenario config. **We build it; we do not embed the existing shop.** | Same-origin, so screenshot capture works and the iframe panel needs no change. We own ground truth — which is what D2 depends on. No external cert, cookie or uptime dependency. Rationale and the shop comparison are in §G1. |
| D2 | **Grading = trainer-assisted with ground truth.** System maps the report to a planted bug and shows "matches `TOTAL_IGNORES_DISCOUNT` — 2 of 5 found". Trainer still decides. | This is the primary mitigation for the trainer-load risk in §7. It must be built in WS-10 alongside the ticket, not deferred. Requires `hunt_scenarios.configuration` from WS-8. |
| D3 | **Coverage = stage/milestone boundaries.** One hunt guards entry to each stage, not each task. | ~6 hunts per course, ~60 reviews per 10-student cohort. Prerequisite rows target the *first task of a stage*, so `prerequisites(target_task_id = first_of_stage_N, required_task_id = hunt_N)`. |
| D4 | **Leaderboard deferred.** Not in phase 1. | `leaderboard_preferences` stays as-is, untouched. When it does land it ranks by **plan-relative progress**, never absolute XP — see §7. Nothing in WS-8..WS-12 may assume a global ranking exists. |

### Still open

1. **Pause behaviour (G9).** Does the relative calendar keep running during
   inactivity, or stretch to match active days? My recommendation is
   absolute-from-join for phase 1 — predictable, no activity accounting, and
   stretching is an additive change later if students actually complain.
2. **Nav slot (G7).** Arena takes a primary tab; the mobile bar caps at 5
   including "Mehr", so something moves to the sheet. My call is that "Fragen"
   moves. Yours to overrule.
3. **WS-0 exception.** `nav-config.ts` carries an explicit *"Only WS-0 edits it"*
   rule. WS-8 needs to add the Arena entry — that exception needs to be granted
   in writing, or the workstream boundary silently breaks.

None of the three blocks the start of WS-8.

---

## 6. Two risks worth naming now

**Trainer review load.** Every hunt is a human review. Ten students × one hunt
per milestone × six milestones = 60 reviews per cohort, each a free-text report
needing real judgement. If a trainer covers three cohorts, the arena becomes
their whole job. Mitigations: the planted-bug mapping (decision 2) makes a review
seconds instead of minutes; a "matches known planted bug, all fields present"
report could be provisionally accepted and spot-checked. **Design this in from
the start** — it is much harder to retrofit once trainers are drowning.

**Gamification pointing the wrong way.** XP on submission rewards volume; XP on
acceptance rewards quality. Streaks reward showing up; leaderboards reward being
ahead of peers who joined earlier — which is exactly backwards when start dates
differ by months. Since the whole point of G9 is that every student is on their
own clock, any leaderboard must rank by **progress relative to one's own plan**,
never by absolute XP. Otherwise the person who enrolled in January wins forever.
