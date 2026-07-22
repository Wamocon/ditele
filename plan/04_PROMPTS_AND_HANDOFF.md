# Prompts & Handoff Protocol

> **This is the file you use every time you open a chat.** Copy a prompt from §2, paste it, done.
> §4 is the part that matters most: what to do when a chat runs out of tokens and dies.

| You are starting… | Prompt | Order of operations |
|---|---|---|
| V3 foundation (WS-0) | §2.1 | §5 phase 1 |
| V3 workstream (WS-1…6) | §2.2 | §5 phase 1 |
| V3 integration (WS-7) | §2.3 | §5 phase 1 |
| **Arena workstream (WS-8…12)** | **§2.4** | **§5 phase 2** |
| **Arena integration & test (WS-13)** | **§2.5** | **§5 phase 2** |
| A read-only status check | §2.6 | — |

⛔ **Before pasting §2.4, check the dependency chain in `06_ARENA_WORKSTREAMS.md` §2.**
The V3 build ran six chats in parallel. The Arena phase does not — it is a chain,
and starting a workstream whose predecessor is still moving means building
against a schema that is about to change.

---

## 1. The core idea

A chat can die at any moment — token limit, account limit, browser crash, you close the tab. When it dies, **its entire memory is gone.** A fresh chat, possibly on a different Claude account, has zero knowledge of what happened.

So the rule is absolute:

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  IF IT IS NOT IN A COMMITTED FILE, IT DOES NOT EXIST.                     ║
║                                                                           ║
║  The chat's memory is not state. Git is state.                            ║
║  plan/status/WS-<N>.md is state.                                          ║
║                                                                           ║
║  A chat that dies without committing has produced nothing.                ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

Which produces three non-negotiable habits for every chat:

| Habit | Why |
|---|---|
| **Commit after every completed route.** Not at the end. After each one. | A dead chat's finished routes survive. A chat that batches 8 routes into one final commit and dies at route 7 loses everything. |
| **Update `plan/status/WS-<N>.md` after every file.** Not at the end. | The status file is the handoff note. If it is written only at the end, a chat that dies never writes one. |
| **Keep the `RESUME HERE` block current at all times.** | This is the first thing the next chat reads. It must always describe the *actual* current position, not the position 40 minutes ago. |

Token limits give no warning. Write the handoff continuously and a death costs you nothing. Write it at the end and a death costs you the whole workstream.

---

## 2. The prompts

### 2.1 The Foundation prompt — Wave 0, run this FIRST, alone

> Paste into a fresh chat. Nothing else runs until this one passes its gate.

```
You are WS-0 (Foundation) on the DiTeLe V3 build.

Read these first, in this order, completely:
1. plan/00_MASTER_PLAN.md
2. plan/02_WORKSTREAMS.md  — sections 1 to 7
3. plan/04_PROMPTS_AND_HANDOFF.md  — sections 1, 3 and 4
4. plan/status/WS-0.md  — IF IT EXISTS, a previous WS-0 chat died. Read its
   "RESUME HERE" block and continue from exactly there. Do not restart.

Then run: git log --oneline -20

Your job is Wave 0a in 02_WORKSTREAMS.md section 6, in order, then the Wave 0b
component work in section 7.

Wave 0a is a hard gate. Six other chats are blocked until every box in section
6.9 is ticked. Do not skip a task, do not declare it done early, do not let a
box pass on "probably fine".

The three highest-risk items, do them before anything else:
- Task 0: OneDrive. Files have already vanished from this repo once.
- Task 1: VERIFY THE LOGIN PASSWORD. The one in the plan is unverified and may
  be wrong. If it fails, reset via service role and record the working one.
- Task 1: introspect the real RPC signatures into plan/status/RPC_CONTRACTS.md.
  Every other chat depends on this being right. Do not guess a single argument
  name.

Checkpoint rules, follow them strictly:
- Commit after each completed task, using explicit paths. Never "git add .".
- After every task, update plan/status/WS-0.md including the RESUME HERE block.
- If you feel your context filling up, STOP building and spend what is left on
  the handoff: commit, then write a precise RESUME HERE block.

Start with Task 0.
```

---

### 2.2 The Workstream prompt — Wave 1, one chat per workstream

> Replace `<N>` with the workstream number (1–6). **This same prompt works for a fresh start and for resuming a dead chat** — the agent detects which situation it is in by reading the status file.

```
You are WS-<N> on the DiTeLe V3 build.

Read these first, in this order, completely:
1. plan/00_MASTER_PLAN.md
2. plan/02_WORKSTREAMS.md  — sections 1 to 5, then the "WS-<N>" section in
   section 8. Ignore the other workstreams' sections.
3. plan/04_PROMPTS_AND_HANDOFF.md  — sections 1, 3 and 4
4. plan/status/WS-0.md  — the foundation state and the WORKING LOGIN PASSWORD
5. plan/status/RPC_CONTRACTS.md  — the real RPC signatures. Never guess these.
6. plan/status/WS-<N>.md  — IF IT EXISTS, a previous chat worked on this
   workstream and stopped. Read its "RESUME HERE" block and continue from
   exactly there. Do NOT rebuild what is already marked done.

Then run: git log --oneline -20   to see what has actually landed.

Rules that override everything else:
- ONLY create or edit files inside your ownership tree. It is listed in
  02_WORKSTREAMS.md section 4. Other chats are working in this same repo right
  now. Editing their files destroys their work.
- If you need something in a file you do not own: append a row to
  plan/status/ISSUES.md, work around it locally, and move on. Never edit it.
- Never "git add ." or "git add -A". Stage your own paths explicitly.
- Never git checkout a branch, reset --hard, stash, rebase, or force-push.
  Other chats have uncommitted work in this tree.
- No new npm dependencies, ever.
- Never hardcode a UI string. Use the i18n layer, write German into
  messages/de.json only, leave en.json and ru.json alone.
- Never hardcode a colour. Use the tokens in globals.css.
- Every route needs loading.tsx, error.tsx, and an empty state.

Checkpoint rules, follow them strictly:
- Commit after EVERY completed route. Not at the end.
- Update plan/status/WS-<N>.md after EVERY file, including the RESUME HERE
  block at the top.
- Before each commit run: npx tsc --noEmit, npx next lint, node scripts/smoke.mjs
- If you feel your context filling up, STOP building and spend what is left on
  the handoff: commit what works, then write a precise RESUME HERE block so the
  next chat continues without re-reading your code.

Your dev server command (copy exactly, the env vars matter):
  NEXT_DIST_DIR=.next-ws<N> DITELE_APP_ORIGIN=http://127.0.0.1:310<N> npm run dev -- --port 310<N>

Build in the order given in your workstream section. Start now.
```

---

### 2.3 The Integration prompt — Wave 2, run last, alone

```
You are WS-7 (Polish & Integration) on the DiTeLe V3 build.

Read:
1. plan/00_MASTER_PLAN.md  — especially sections 6, 7, 14
2. plan/02_WORKSTREAMS.md  — sections 1 to 5 and section 9
3. plan/04_PROMPTS_AND_HANDOFF.md  — sections 1, 3, 4
4. Every plan/status/WS-*.md  — what each workstream built, deferred, or left
   as a stub
5. plan/status/ISSUES.md  — everything the other chats reported
6. plan/status/WS-7.md  — IF IT EXISTS, resume from its RESUME HERE block

Then: git log --oneline -40

You are the only workstream allowed to edit any file, and only to fix things.

Work through section 9 of 02_WORKSTREAMS.md in order. The hard stops:
- node scripts/smoke.mjs must be fully green
- grep -r "service_role" .next/static/ must return NOTHING
- every route must work at 375px with no horizontal scroll
- every route must work in dark mode with no invisible text

The consistency pass in step 8 is the one that matters most. Six chats built
this. Your job is to make it look like one team did.

Finish by writing plan/status/RELEASE.md: what shipped, what did not, known
bugs, and the next session's list. Be honest about gaps. A hidden gap is worse
than a listed one.

Commit after each numbered step. Update plan/status/WS-7.md as you go.
```

---

### 2.4 The Arena workstream prompt — WS-8 to WS-12, one chat each

> For the Bug Arena phase. Replace `<N>` with 8, 9, 10, 11 or 12.
> **Same prompt for a fresh start and for resuming a dead chat** — the agent works out which it is from the status file.
>
> ⛔ **Check the dependency chain in `06_ARENA_WORKSTREAMS.md` §2 before you paste this.** Unlike the V3 build, these are not six parallel lanes. Starting WS-11 before WS-10 is `DONE` means building against a schema that is about to change.

```
You are WS-<N> on the DiTeLe Bug Arena phase.

Read these first, in this order, completely:
1. plan/05_BUG_ARENA_AND_GAMIFICATION.md  — the design. Section 5 lists four
   SETTLED decisions. They are not open for re-litigation. If you think one is
   wrong, say so and stop — do not quietly build something else.
2. plan/06_ARENA_WORKSTREAMS.md  — sections 1 to 7, then the "WS-<N>" entry in
   section 8. Ignore the other workstreams' entries.
3. plan/04_PROMPTS_AND_HANDOFF.md  — sections 1, 3 and 4
4. plan/status/RPC_CONTRACTS.md  — the real RPC signatures. Never guess one.
5. plan/status/RELEASE.md  — what the shipped V3 app already does
6. plan/status/WS-<N>.md  — IF IT EXISTS, a previous chat worked on this and
   stopped. Read its "RESUME HERE" block and continue from exactly there. Do
   NOT rebuild what is already marked done.

Then run: git log --oneline -20

⚠️ THIS PHASE MODIFIES A LIVE, SHIPPED APP. The V3 build started from an empty
tree, so a mistake showed up as a blank page. Here a mistake shows up as a
feature that used to work and now silently does not. Regression is the main
risk in this phase, not unfinished screens.

Rules that override everything else:
- ONLY create or edit files inside your ownership tree, listed in
  06_ARENA_WORKSTREAMS.md section 4. Note the ⚠️ rows: some trees are
  RE-ASSIGNED from a finished V3 workstream, and that re-assignment is narrow.
  Read exactly what you own before writing anything.
- If you need something in a file you do not own: append a row to
  plan/status/ISSUES.md, work around it locally, and move on. Never edit it.
- MIGRATIONS: use ONLY your date block from section 4 (WS-8 = 20260722*,
  WS-10 = 20260724*, WS-11 = 20260725*, WS-12 = 20260726*). Migration order is
  semantic — two chats picking the same timestamp is the worst merge conflict
  in this repo.
- Migrations are forward-only and idempotent: "create table if not exists",
  "drop policy if exists" before "create policy", and never a destructive alter
  without checking the data first. This runs against a live database.
- Never "git add ." or "git add -A". Stage your own paths explicitly.
- Never git checkout a branch, reset --hard, stash, rebase, or force-push.
- No new npm dependencies, ever. The design was written to need none.
- Never hardcode a UI string. ⚠️ THE i18n CONTRACT CHANGED AFTER WS-7 — read
  scripts/check-i18n.mjs before you write a single key:
    * GERMAN IS THE SOURCE OF TRUTH. New interface strings go in de.json.
    * en.json / ru.json are OPTIONAL per key — a missing key falls back to
      German at runtime, by design. That is a WARN, not a failure.
    * i18n:check FAILS on a key that exists in en/ru but NOT in de (stale key),
      and FAILS on an empty-string translation. So do NOT add blank
      placeholders to en.json or ru.json "to satisfy the check" — that is
      exactly what breaks it.
    * INTERFACE speaks de+en+ru. COURSE MATERIAL is GERMAN ONLY:
      CONTENT_LOCALES === ["de"] in src/features/content/model.ts. Anything a
      learner reads as course content — task text, hunt scenario descriptions,
      instructions — is German, not a three-locale jsonb.
- Never hardcode a colour. Use the tokens in globals.css.
- Every route needs loading.tsx, error.tsx, and an empty state.
- 44px touch targets, works at 375px, works in dark mode, honours
  prefers-reduced-motion. WS-7 fixed all of these once. Do not reintroduce them.

Gates before EVERY commit:
  npm run typecheck && npm run lint && npm run i18n:check
  node scripts/smoke.mjs
  npm run db:lint          # if you touched supabase/migrations/
Full `npm run verify` before you declare the workstream DONE.

Checkpoint rules, follow them strictly:
- Commit after EVERY completed unit. Not at the end.
- Update plan/status/WS-<N>.md after EVERY file, including the RESUME HERE
  block at the top.
- If you feel your context filling up, STOP building and spend what is left on
  the handoff: commit what works, then write a precise RESUME HERE block.

Your dev server command — the port and dist dir are yours alone, copy exactly:
  NEXT_DIST_DIR=.next-ws<N> DITELE_APP_ORIGIN=http://127.0.0.1:31<NN> npm run dev -- --port 31<NN>
  (WS-8 → 3108, WS-9 → 3109, WS-10 → 3110, WS-11 → 3111, WS-12 → 3112)

Build in the order given in your section 8 entry.

IF YOU ARE WS-8: your first job is NOT the schema. It is the single vertical
slice in 06_ARENA_WORKSTREAMS.md section 3 — one locked task, one hunt, one
planted bug, one badge, round-tripping in a real browser. Hardcode whatever you
must. It proves the design before four other chats build on it. Only once it
round-trips do you start the real schema work.

Start now.
```

---

### 2.5 The Arena Integration & Test prompt — WS-13, run last, alone

```
You are WS-13 (Integration & Test) on the DiTeLe Bug Arena phase.

Read:
1. plan/05_BUG_ARENA_AND_GAMIFICATION.md  — the design, especially section 5
   (the settled decisions) and section 6 (the two risks)
2. plan/06_ARENA_WORKSTREAMS.md  — sections 1 to 7 and the WS-13 entry in
   section 8
3. plan/04_PROMPTS_AND_HANDOFF.md  — sections 1, 3, 4
4. EVERY plan/status/WS-8.md through WS-12.md  — what each built, deferred, or
   left as a stub
5. plan/status/ISSUES.md  — everything the five chats reported
6. plan/status/RELEASE.md  — what the V3 app shipped, so you know what must
   still work
7. plan/status/WS-13.md  — IF IT EXISTS, resume from its RESUME HERE block

Then: git log --oneline -40

You are the only workstream allowed to edit any file, and only to fix things.
Your migration block is 20260727*.

Work through the WS-13 entry in section 8 in order. Two things matter more than
the rest:

FIRST — REGRESSION. This phase modified four load-bearing pieces of a shipped
app: learner_snapshot_task_lock_reasons (security definer, feeds RLS),
task_schedules, defect-form.tsx, and nav-config.ts. Walk every V3 route as
student, trainer and admin, and confirm nothing that used to work is broken.
A new feature that works while an old one silently died is a failed release.

SECOND — VERIFY THE TWO DESIGNED-IN RISKS, do not assume them:
  1. Trainer load. Time a real review using the ground-truth panel WS-10 built.
     If it is not dramatically faster than reading a report cold, then decision
     D2 did not deliver what it was chosen for. Say so in the release file.
  2. Relative fairness. Seed two learners enrolled about 3 weeks apart. Every
     screen must show each of them their OWN day-N, and no screen may rank one
     above the other on absolute XP. The whole point of relative scheduling is
     that the person who enrolled first does not automatically win.

Then the full journey, as a real user, in a real browser — not a unit test:
  enrol → locked task → follow the unlock link → play the hunt → find a real
  bug → correctly ignore a decoy → file the ticket with a screenshot → trainer
  reviews → requests a revision → student resubmits → trainer accepts → task
  unlocks → XP lands → badge fires → admin sees the progress row

Hard stops, every one must be green:
- npm run verify
- npm run db:lint
- node scripts/smoke.mjs
- grep -r "service_role" .next/static/   must return NOTHING
- every new route at 375px, no horizontal scroll
- every new route in dark mode, no invisible text
- prefers-reduced-motion respected by every celebration animation

The consistency pass is the one people skip. Five chats built this. Your job is
to make it look like one team did.

Finish by writing plan/status/RELEASE-ARENA.md: what shipped, what did not,
known bugs, and the next session's list. Be honest about gaps. A hidden gap is
worse than a listed one.

Commit after each numbered step. Update plan/status/WS-13.md as you go.
```

---

### 2.6 The Coordinator prompt — for you, in a separate chat

Use this when you want a read-only picture of where everything stands. Works for
either phase.

```
You are the coordinator for the DiTeLe build. READ ONLY — do not edit code.

Read plan/status/BOARD.md, every plan/status/WS-*.md, and plan/status/ISSUES.md.
If plan/06_ARENA_WORKSTREAMS.md exists, read its section 2 (the dependency
chain) — the Arena phase is a CHAIN, not parallel lanes, so "what can start
next" has a different answer there than it did for the V3 build.
Then run: git log --oneline -40

Report back:
1. Which workstreams are done, in progress, dead, or not started
2. Which routes are still stubs
3. Every open item in ISSUES.md and who needs to act on it
4. Anything two chats appear to have both built
5. For the Arena phase only: whether the predecessor of each unstarted
   workstream is genuinely DONE, or only claimed DONE. Starting a chat whose
   dependency is still moving is the main way this phase goes wrong.
6. What I should start next, and with which prompt from
   plan/04_PROMPTS_AND_HANDOFF.md

Flag anything in BOARD.md that contradicts the git log. A stale board is how a
dead chat goes unnoticed.
```

---

## 3. Running more or fewer chats than six

The six workstreams are **units of file ownership, not a headcount.** Run any number of chats. The only rule that cannot bend: **two chats must never own the same files at the same time.**

### Fewer chats — merge workstreams

One chat takes several workstreams **in sequence**, finishing one before starting the next.

| Chats | Assignment |
|---|---|
| 1 | WS-0 → WS-1 → WS-2 → WS-3 → WS-4 → WS-5 → WS-6 → WS-7, one at a time |
| 2 | **A:** WS-0, then WS-1 → WS-2 → WS-3 · **B:** waits for the gate, then WS-4 → WS-5 → WS-6 |
| 3 | **A:** WS-1 + WS-3 · **B:** WS-2 + WS-4 · **C:** WS-5 + WS-6 |
| 6 | One each, as written |

Prompt for a merged chat: use the §2.2 prompt and write `You are WS-1 and WS-3` — plus this line:

```
Work WS-1 to completion first, then WS-3. Keep two separate status files:
plan/status/WS-1.md and plan/status/WS-3.md.
```

### More chats — split the two big workstreams

Only **WS-2** and **WS-5** are worth splitting. They are the largest and have a clean internal file boundary.

| Split | Owns | Files |
|---|---|---|
| **WS-2a** | The task workspace | `learn/tasks/**` · `features/learning/task-*` · the `getMyLearningTask` / `startAttempt` / `saveAttemptDraft` / `submitAttempt` functions in `learning.ts` |
| **WS-2b** | Dashboard + course browsing | `learn/page.tsx` · `learn/courses/**` · `features/learning/course-*` · the `listMyLearningCourses` / `getMyLearningCourse` functions |
| **WS-5a** | Content Studio | `admin/courses/[courseId]/versions/**` · `features/content/**` |
| **WS-5b** | Course list, create, detail, task inventory, admin dashboard | `admin/page.tsx` · `admin/courses/page.tsx` · `admin/courses/new` · `admin/courses/[courseId]/page.tsx` · `admin/tasks/**` |

> ⚠️ `learning.ts` and `content.ts` are each shared by their split pair. **The `a` chat creates the file and writes its functions first, commits, and only then does `b` start** and append its own functions below. Never both at once.

Do not split beyond this. More chats than files produces collisions, not speed.

### Track it on the board

`plan/status/BOARD.md` is the one place that records who owns what right now. Update it whenever you start or reassign a chat. It costs 10 seconds and it is the only thing that tells you a workstream has silently died.

---

## 4. When a chat hits its token limit ⭐

### 4.1 If you can see it coming

The chat is still alive but running low. **Stop building immediately.** Do not start another route. Spend everything that is left on the handoff:

```
Stop building. You are close to your context limit. Do the handoff now:

1. Commit everything that currently works, with explicit paths.
2. If something is half-finished and does not compile, either finish the
   minimum to make it compile, or revert just that file. Never commit a
   broken tree.
3. Rewrite the RESUME HERE block at the top of plan/status/WS-<N>.md so a
   fresh chat with zero context can continue. It must say:
   - the exact last thing you completed
   - the exact next thing to do
   - any file you left half-done and its state
   - anything you learned that is not written down anywhere else
     (an RPC that behaves unexpectedly, a table that returns nothing,
      a component that does not do what its name suggests)
4. Commit the status file.
5. Reply with just: "HANDOFF READY — WS-<N>"
```

An orderly handoff costs about two minutes of context and saves the next chat an hour of archaeology.

### 4.2 If it died without warning

Nothing is lost, provided the chat was committing as it went. Open a fresh chat — **any account** — and paste the **exact same §2.2 prompt** for that workstream number. It will read `plan/status/WS-<N>.md`, find the `RESUME HERE` block, and continue.

If the status file looks stale or you are not sure how far it actually got, paste this first:

```
The previous WS-<N> chat died without a handoff. Before building anything,
work out the true state:

1. git log --oneline -30
2. git status
3. Read plan/status/WS-<N>.md — treat it as possibly out of date
4. List the actual files under this workstream's ownership tree and check
   which routes are real pages and which are still "Diese Seite wird gerade
   gebaut" stubs
5. npx tsc --noEmit    — is the tree even green?
6. node scripts/smoke.mjs

Then rewrite the RESUME HERE block in plan/status/WS-<N>.md to match what is
ACTUALLY on disk, commit it, and tell me the real state before you continue.
```

That reconstruction takes a few minutes and is far safer than trusting a stale note.

### 4.3 Switching to a different Claude account

Nothing special is needed. Every piece of state lives in the repo. A fresh chat on a different account, given the same prompt, reaches the same place.

Two things to check first:
1. **The new machine or session has the repo** at the same path, at the same commit — `git pull` if you are using a remote, otherwise the same folder.
2. **`.env.local` is present.** It is git-ignored, so it does **not** travel with a clone. If you set up on a new machine, copy `.env.local` across by hand. Without it nothing connects to Supabase.

### 4.4 The `RESUME HERE` block

Every `plan/status/WS-<N>.md` starts with this. Keep it current the whole time, not just at the end.

```markdown
## RESUME HERE
Updated: <when> · Chat: #<n> for this workstream

**State:** IN PROGRESS | HANDOFF READY | DONE

**Done and committed:**
- /de/trainer            — dashboard, real data, all 8 checks pass
- /de/trainer/submissions — queue with filters, all 8 checks pass

**Half-finished:**
- /de/trainer/submissions/[id] — layout and data wired, decision bar NOT built.
  File compiles. `decide_submission` is not called yet.

**Next, in order:**
1. Finish ReviewDecisionBar in features/review/decision-bar.tsx
2. Wire decide_submission + transfer_submission
3. Then /de/trainer/questions

**Things I learned that are written down nowhere else:**
- `get_submission_review_context` returns `hints_used` as an array of ids,
  not a count. Resolve names from `task_hints`.
- The `reviews` table is empty for the seeded trainer, so the history page
  shows its empty state. That is correct, not a bug.

**Blocked on:**
- Nothing / see ISSUES.md I-004
```

The last two sections are the valuable ones. Anyone can read the code to see which routes exist. **Nobody can recover what you learned the hard way** unless you write it down.

---

## 5. Order of operations

### Phase 1 — the V3 build (WS-0 → WS-7) · ✅ complete

```
1.  Pause OneDrive, or move the repo out of it            ← you, once
2.  Start the infrastructure work (domain, TLS)           ← parallel, separate person
                                                             01_LAUNCH_READINESS.md
3.  Open ONE chat with the §2.1 Foundation prompt         ← everything waits on this
4.  Verify the Wave 0a gate yourself                      ← you, 02_WORKSTREAMS §6.9
5.  Open your Wave-1 chats with the §2.2 prompt           ← however many you are running
6.  Update plan/status/BOARD.md as you assign each one    ← 10 seconds each
7.  Check ISSUES.md and the board periodically            ← §2.6 coordinator prompt
8.  Re-launch any chat that dies, same prompt             ← §4
9.  When all Wave-1 workstreams are DONE: §2.3 prompt     ← WS-7
10. Read plan/status/RELEASE.md                           ← the honest final state
11. Then P1, then go-live from 01_LAUNCH_READINESS.md
```

### Phase 2 — the Bug Arena (WS-8 → WS-13)

⛔ **This one is a chain, not parallel lanes.** At most two chats run at once,
and only during Wave B. See `06_ARENA_WORKSTREAMS.md` §2.

```
1.  Fix plan/status/BOARD.md                              ← it still says WS-0..7
                                                             NOT STARTED. They are DONE.
2.  Decide the three open items in 05_… §5 "Still open"   ← you: pause behaviour,
                                                             nav slot, WS-0 exception
3.  Open ONE chat with the §2.4 prompt, N=8               ← WS-8, blocks everything
4.  ⛔ WS-8 builds the ONE VERTICAL SLICE first           ← 06_… §3. Do not let it
                                                             skip to the schema.
5.  Verify the Wave-A gate yourself, in a browser         ← you, 06_… §6.
                                                             The last box — log in as
                                                             all three roles — is the
                                                             one people skip.
6.  Open WS-9 and WS-10 with the §2.4 prompt              ← these two may run together
7.  When BOTH are DONE: WS-11, alone                      ← §2.4, N=11
8.  When WS-11 is DONE: WS-12, alone                      ← §2.4, N=12
9.  Update BOARD.md at every handover                     ← 10 seconds each
10. When WS-12 is DONE: §2.5 prompt                       ← WS-13, last, alone
11. Read plan/status/RELEASE-ARENA.md                     ← the honest final state
```

The step people get wrong is 5. WS-8 modifies a `security definer` function that
feeds RLS, and four later chats build on whatever it produced. A bad gate here is
not a bug — it is four workstreams of rework.

---

## 6. The five ways this goes wrong

| Mistake | What happens | Prevention |
|---|---|---|
| Starting Wave 1 before the 0a gate passes | Several chats build against a foundation that then changes underneath them. Everything has to be redone. | Verify §6.9 yourself. Click the three logins. |
| A chat edits a file it does not own | Another chat's work is silently overwritten. Usually discovered hours later. | The ownership map is in the prompt. `git log -p <file>` finds the culprit. |
| Batching commits to the end | A chat dies at 90% and leaves nothing. | Commit after every route. It is in the prompt. |
| Two chats on the same workstream | Same-file collisions and duplicated screens. | `BOARD.md`. One owner per workstream at a time. |
| Trusting a stale status file after a crash | The new chat rebuilds work that already exists, or skips work that does not. | §4.2's reconstruction prompt. Verify against disk before continuing. |
