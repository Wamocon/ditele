# Plan Review Log — CEO lens + Engineering lens

> Reviewed: `plan/00_MASTER_PLAN.md` v1.0 and `plan/02_WORKSTREAMS.md` v1.0
> Date: 2026-07-21 · Reviewer: senior engineer + founder lens
> Method: gstack `plan-ceo-review` and `plan-eng-review` lenses applied directly. The skills themselves are 2000-line interactive workflows with blocking question gates; running them live would have consumed the session on preamble machinery instead of on finding real problems. The lenses are what matter and they are applied below in full.
>
> **20 findings. 20 fixes. All fixes are applied to v1.1 of the plan documents.**

---

## Part 1 — Engineering review

**Lenses applied:** blast radius · boring by default (three innovation tokens) · systems over heroes (design for a tired human at 3am, not your best engineer on their best day) · incremental over revolutionary · DRY · edge cases over speed · explicit over clever · right-sized diff.

**State diagnosis:** this team is **repaying debt**, not innovating. 496 files, 13 blockers, a 1808-line bug register, and no usable product. The correct intervention is ruthless deletion plus a narrow, verified rebuild. The plan gets that call right. Everything below is about whether the execution survives contact with six parallel chats.

---

### 🔴 BUG-01 — CRITICAL — Six chats share one `.next` directory and will corrupt each other

**The problem.** Every chat runs `npm run dev` on its own port, but Next.js writes build output to the same `.next/` folder regardless of port. Six dev servers plus six `npm run build` invocations writing to one directory produces corrupted chunks, phantom "module not found" errors, and hours lost to debugging a problem that is not in anyone's code.

**Blast radius:** all six Wave-1 chats, simultaneously, with a symptom that looks like a code bug.

**Fix applied.** One line in `next.config.ts`:
```ts
distDir: process.env.NEXT_DIST_DIR || ".next",
```
Each chat exports its own: `NEXT_DIST_DIR=.next-ws2 npm run dev -- --port 3102`.
Added `.next-*` to `.gitignore`. Added to WS-0's task list and to every workstream's start-up sequence.

**Second half of the fix:** Wave-1 chats do **not** run `npm run build`. They run `tsc --noEmit` and `next lint`. Only WS-0 and WS-7 build. A full build takes 60–90s and six of them in parallel starves the machine.

---

### 🔴 BUG-02 — CRITICAL — The repo lives inside OneDrive, and OneDrive already deleted files during this session

**The problem.** The repo path is `OneDrive - WAMOCON GmbH\Desktop\WMC\ditele_yash`. During this analysis, `anforderung/08`, `09` and `10` **disappeared from the working tree mid-session** and had to be restored with `git checkout`. That was one process reading files. Six chats writing hundreds of files, plus six `.next` directories churning thousands of build artefacts, will produce sync conflicts, `filename-PCNAME.md` duplicates, locked files, and phantom deletions.

**Blast radius:** the entire build. This is the most underrated risk in the plan and it is already proven, not theoretical.

**Fix applied.** Added as **Wave 0, Task 0** — before anything else:
1. Pause OneDrive sync on this folder (right-click the OneDrive tray icon → "Pause syncing → 8 hours"), **or**
2. Move the repo to a non-synced path, for example `C:\dev\ditele_yash`.

Option 2 is better. `.gitignore` already excludes `node_modules` and `.next`, but OneDrive does not read `.gitignore`.

---

### 🔴 BUG-03 — CRITICAL — The seeded password is unverified and I stated it as fact

**The problem.** The master plan lists `Ditele-Local-2026!` for all four accounts. That comes from a comment in `supabase/seed.sql`. But `supabase/seed_role_accounts.sql` says, in its own header: *"The bootstrap password documented in seed.sql is deliberately replaced here"* and then runs `set encrypted_password = extensions.crypt(...)`. **The real password may be different.** I did not log in to confirm it.

**Blast radius:** six chats cannot log in, cannot see real data, and cannot verify anything. Everything downstream stalls.

**Fix applied.** The password is now marked **UNVERIFIED** in the plan. WS-0 Task 1 must actually log in. If it fails, reset all four passwords via the service-role Admin API and record the working password in `plan/status/WS-0.md`. This moved to the top of Wave 0 and is a gate item.

---

### 🔴 BUG-04 — CRITICAL — Route-group layouts create a blocking dependency between chats

**The problem.** I assigned `(student)/layout.tsx` to WS-2 and `(student)/learn/questions/**` to WS-3. In the Next.js App Router, WS-3's pages cannot render until WS-2 has created the group layout. Same for `(admin)` between WS-5 and WS-6. Two chats are blocked on two other chats for the first 30 minutes.

Worse: if both chats create the layout to unblock themselves, they collide on the exact file the plan forbids them to share.

**Fix applied.** **WS-0 owns every route-group layout.** `(public)`, `(auth)`, `(student)`, `(trainer)`, `(admin)` layouts are all created in Wave 0 with their guards wired. No Wave-1 chat creates or edits a layout. Ownership map updated.

---

### 🟠 BUG-05 — HIGH — `nav-config.ts` points at 42 routes that will 404 for three hours

**The problem.** The plan has WS-0 declare all 42 nav entries up front, which is correct for consistency, but the pages do not exist yet. Every chat spends the afternoon clicking into 404s and cannot tell "not built yet" from "my code is broken."

**Fix applied.** WS-0 generates a **stub `page.tsx` for all 42 routes** — a centred card reading *"Diese Seite wird gerade gebaut"* with the owning workstream's ID. Three benefits:
1. Navigation works from minute one and every chat can see the whole app.
2. Every file already exists with a known owner, so two chats can never race to create the same file.
3. A route still showing a stub at the end is instantly visible as unfinished, instead of silently missing.

---

### 🟠 BUG-06 — HIGH — Wave 0's 75-minute budget is not real

**The problem.** Wave 0 as written is: purge 496 files, install and configure Tailwind, write a full token system, build ~30 components, build the responsive shell, wire auth and guards, introspect and type 48 RPCs, verify RLS per role, and possibly seed the database. That is **three hours of work**, not 75 minutes. A time-box that everyone silently blows past is worse than no time-box — six chats sit idle and the coordinator loses the ability to plan.

**Fix applied.** Wave 0 is split:

| Phase | Contents | Time | Blocks Wave 1? |
|---|---|---|---|
| **0a — BLOCKING MINIMUM** | OneDrive · backup tag · verify login + data · purge · deps · tokens + fonts + logos · **tier-1 components only** (`cn`, Button, Card, Input, Textarea, Field, Badge, StatusBadge, Skeleton, EmptyState, ErrorState, DataTable) · shell + nav-config · all 5 group layouts · 42 stubs · auth guard · `Result<T>` · `rpc.ts` · `RPC_CONTRACTS.md` | **~90 min** | ✅ YES |
| **0b — CONTINUES IN PARALLEL** | tier-2 and tier-3 components (Dialog, Sheet, Dropdown, Toast, Tabs, Tooltip, StarRating, ProgressRing, VideoPlayer, PdfViewer, `IframePanel`) | +60 min | ❌ No |

Wave 1 starts after 0a. WS-0 keeps working on 0b and announces each component as it lands. Until a tier-2/3 component exists, workstreams use the documented fallback (a native `<dialog>`, a plain `<video>`, an inline confirm).

**Exception:** `IframePanel` blocks WS-2's practice task. WS-0 builds it **first** in 0b, or WS-2 builds it inside `src/features/learning/` and WS-7 promotes it later.

---

### 🟠 BUG-07 — HIGH — Workstream load is badly unbalanced

**The problem.** Route count is a terrible proxy for effort.

| WS | Routes | Real effort | Verdict |
|---|:---:|---|---|
| WS-1 | 15 | mostly static + 3 forms | ✅ fine |
| WS-2 | 5 | **the task workspace alone is 2h** | 🔴 overloaded |
| WS-3 | 7 | medium | ✅ fine |
| WS-4 | 11 | review detail is 1h, rest is CRUD | 🟠 slightly heavy |
| WS-5 | 6 | **content studio alone is 2.5h** | 🔴 overloaded |
| WS-6 | 11 | CRUD, repetitive but wide | 🟠 slightly heavy |

**Fix applied.**
- `/learn/history` moves **WS-2 → WS-3**. WS-2 keeps 4 routes and pours everything into the task workspace.
- WS-5's content studio gets an explicit **minimum viable version**: list stages, list/create/edit tasks, and the lifecycle bar. Drag-reorder, bulk actions and inline preview are P1 and are cut without discussion if WS-5 is behind at the halfway mark.
- Every workstream section now ends with a **"Cut list, in order"** — the exact things to drop, in the exact order, when running late. Deciding what to cut while behind schedule is how quality dies. Decide it now, in advance, calmly.

---

### 🟠 BUG-08 — HIGH — Zero automated tests, in a plan that claims "no bugs"

**The problem.** Every gate in the plan is a human clicking through a checklist. With six chats and 42 routes, a human will not catch the most common failure mode: **a route that throws on load**. And the eng-review standard is explicit — well-tested is non-negotiable.

**Fix applied.** Not a full test suite (there is no budget), but the highest-value 30 lines available: a **route smoke test**.

`scripts/smoke.mjs` — logs in as each of the three roles, requests all 42 routes, asserts a 2xx/3xx response and no `Application error` in the body, and prints a pass/fail table.

- WS-0 writes it in phase 0a, against the stub pages, so it is green from the start.
- **Every workstream runs it before committing.** A chat that breaks another chat's route finds out in 20 seconds, not at 11pm.
- WS-7 runs it as the release gate.

This is the single highest-leverage test in the build. It catches the "route crashes" class across all six workstreams for near-zero cost.

The other two automated gates already in the plan stay and are the right ones: `tsc --noEmit` as the type gate, and **zod validation at every data boundary** as the runtime gate. Together those three cover type errors, shape drift, and crashes — the three things that actually break a build like this.

---

### 🟠 BUG-09 — HIGH — No rollback path after deleting 496 files

**The problem.** Wave 0 deletes almost the entire application. If the purge takes out something load-bearing that only shows up at hour four, there is no defined way back.

**Fix applied.** Before deleting anything, WS-0 runs:
```bash
git tag pre-v3-purge
git branch backup/pre-v3-purge
```
Recovery for any single file is then `git checkout pre-v3-purge -- <path>`. Added to Wave 0 Task 0. Cost: 10 seconds.

---

### 🟡 BUG-10 — MEDIUM — `package-lock.json` will produce merge conflicts

**The problem.** "No new dependencies" is the right rule, but `npm run dev` and `npm ci` can still touch the lockfile, and six chats committing a churned lockfile is a guaranteed conflict on a file nobody can meaningfully resolve.

**Fix applied.** Explicit rule added to §4.3 of the workstreams doc:
> `package.json` and `package-lock.json` are committed **once**, by WS-0. If yours changed, run `git checkout -- package.json package-lock.json` before you commit. If you genuinely believe you need a dependency, you do not — file it in `ISSUES.md`.

---

### 🟡 BUG-11 — MEDIUM — Deleting `docs/execution/` throws away real knowledge

**The problem.** I put `docs/execution/` on the delete list because `BUG_REGISTER.md` is 1808 lines of noise. But `KNOWN_BLOCKERS.md` in that same folder was one of the most useful files in this analysis — it is what revealed which features are actually blocked by missing external decisions, and it is why the P2 list in the plan is credible rather than arbitrary. `DATABASE_SCHEMA.md` and `TRACEABILITY_MATRIX.md` may hold similar value.

Deleting it costs nothing today and might cost an hour tomorrow. That is a bad trade.

**Fix applied.** `docs/execution/` is **removed from the delete list**. It stays as reference. It is documentation, not code — it does not slow anything down, it does not get imported, and it does not break the build.

---

### 🟡 BUG-12 — MEDIUM — `src/features/` appears in both the delete list and the ownership map

**The problem.** A direct contradiction. A chat reading the plan literally would either delete another chat's folder or refuse to create its own.

**Fix applied.** Made explicit: WS-0 deletes the **existing contents** of `src/features/`, then each workstream creates its **own subfolder** (`src/features/learning/`, `src/features/review/`, …). No workstream ever touches another's subfolder.

---

### 🟡 BUG-13 — MEDIUM — The purge may break files the plan says to keep

**The problem.** `src/shared/database/repository.ts` and `src/shared/config/*` may import from `src/shared/api/contracts/` or `src/entities/`, both of which are on the delete list. Deleting them breaks a "keep" file, and the plan does not say what to do.

**Fix applied.** The purge is now **incremental**: delete one group, run `tsc --noEmit`, fix or delete what breaks, then continue. Order: `app/[locale]` → `entities` → `features` → `shared/api` → `shared/ui` → the rest. If a kept file only depended on deleted code, the dependency was decorative and it gets trimmed too.

---

### 🟡 BUG-14 — MEDIUM — Tailwind v4 is an innovation token, and the plan should say so

**The problem.** "Boring by default — every company gets about three innovation tokens." This build is already spending on Next 16 and React 19 (both inherited, not chosen). Tailwind v4's CSS-first `@theme` config is the third token, spent by choice, in a build with zero debugging budget.

**Assessment: keep v4, but eyes open.** It is what `create-next-app` ships today, it is stable, and it deletes `tailwind.config.ts` entirely — which means one fewer shared file for six chats to collide on. That last point is a real parallel-work benefit, not a fashion argument.

**Fix applied.** The fallback is now a hard, time-boxed rule rather than a suggestion:
> WS-0 has **10 minutes**. If Tailwind v4 is not rendering correctly by then, switch to `tailwindcss@3.4` + `postcss` + `autoprefixer` + a `tailwind.config.ts`, record it in `WS-0.md`, and move on. Do not debug a build tool while six people wait.

---

### 🟡 BUG-15 — MEDIUM — No coordinator is named

**The problem.** The plan assumes someone opens the Wave 0 gate, triages `ISSUES.md`, and decides what gets cut. It never says who. With six autonomous chats and no human owner, the first cross-cutting problem has nowhere to go.

**Fix applied.** Section added to the workstreams doc: **you are the coordinator.** Four jobs, nothing else:
1. Open the Wave 0 gate — verify the checklist yourself before telling anyone to start.
2. Read `ISSUES.md` roughly every 30 minutes and route each item to its owner.
3. Make the cut calls at the halfway mark, using each workstream's pre-written cut list.
4. Kick off WS-7 once the last Wave-1 chat commits.

---

### 🟢 BUG-16 — LOW — `DITELE_APP_ORIGIN` mismatch will silently break auth redirects

Six chats on six ports, one origin value used for CSRF and auth-redirect checks. Login may appear to succeed and then bounce.
**Fix applied.** Every workstream's start-up command now includes the inline override, not as a footnote but as the command they copy:
```bash
NEXT_DIST_DIR=.next-ws2 DITELE_APP_ORIGIN=http://127.0.0.1:3102 npm run dev -- --port 3102
```

---

## Part 2 — CEO review

**Mode selected: SCOPE REDUCTION.** Not because ambition is bad, but because the constraint is real. Six hours, one deadline. In scope-reduction mode the only question that matters is: **what would make this a 10-star product, and what is merely present?**

---

### 💡 CEO-01 — The plan optimises for "42 routes exist," not "this product is good"

**The challenge.** A plan that treats all 42 routes as equal will produce 42 equally mediocre screens. That is how software ends up feeling generated instead of designed. Nobody has ever loved a product because its settings page was competent.

Ask the real question: **if DiTeLe could only have three great screens, which three?**

1. **The landing page** — it decides whether anyone signs up at all.
2. **The task workspace** — it *is* the product. It is where a student spends 95% of their time, and it is the only screen that contains the actual differentiator (scenario → live test website → defect report).
3. **The trainer review screen** — it decides whether trainers keep using the platform or go back to email.

Everything else is table stakes. An admin user list needs to be correct and fast. It does not need to be beautiful.

**Fix applied.** A **quality budget** section added to the master plan:

| Tier | Screens | Standard |
|---|---|---|
| **Signature** | Landing · Task workspace · Trainer review detail | Every animation, every empty state, every micro-interaction. Should feel expensive. Spend polish time here without guilt. |
| **Core** | Student dashboard · Course detail · Review queue · Catalog · Admin dashboard | Clean, consistent, well-spaced. No custom flourishes needed. |
| **Functional** | All admin CRUD · settings · profile · history · notifications | Correct, fast, uses the components as-is. **Plain is fine.** Do not spend time here. |

This single reallocation is the difference between "we built 42 pages" and "this feels like a real product."

---

### 💡 CEO-02 — "Production-ready" is undefined, and it changes the whole quality bar

**The challenge.** The plan says "production-ready" but never says who is using it on Monday. A client demo, an internal pilot with 5 people, and 200 real students are three completely different products with three different bars for error handling, empty states and data integrity.

Building for the wrong one is either wasted effort or a launch failure.

**Fix applied.** Added as **Q8** to the open questions, and it needs an answer before Wave 0:
- **Demo** → skip edge cases, make the happy path shine, seed pretty data.
- **Pilot (5–20 users)** → what the plan currently describes. Correct, honest empty states, no data loss.
- **Real launch (200 users)** → then 6 hours is genuinely not enough, and the right move is to ship the pilot version to a small group first.

The plan is written for **pilot** and says so explicitly now.

---

### 💡 CEO-03 — The competitive premise deserves one challenge

**The challenge.** The research doc concludes "custom build" after comparing Moodle, Open edX, CYPHER and a hybrid — and it is right, but for one reason above all others: **the defect-management practice loop is the entire product.** Theory delivery (video, PDF, quiz) is commodity. Any LMS does it. Nobody would choose DiTeLe for its video player.

So the strategic question is not "did we build all 16 requirements." It is: **is the practice loop noticeably better than doing the same exercise with a spreadsheet and a shared browser tab?**

**Fix applied.** Added to the master plan as the product's north star, with three concrete consequences for the build:
1. `IframePanel` gets real engineering, not a bare `<iframe>` — resize, fullscreen, reload, open-in-tab, honest mobile fallback.
2. The defect form is designed like a professional bug tracker (severity, steps, expected, actual), because the students being trained are learning to write real defect reports. The form is part of the teaching.
3. The trainer review screen shows the submission **next to** the task, with hints used and time taken, so a review takes 90 seconds instead of five minutes. Trainer throughput is what makes the platform economically viable.

---

### 💡 CEO-04 — Gamification is cut, and that is the right call, but say why out loud

**The challenge.** The research document spends an entire chapter on XP, levels, badges, streaks and leaderboards, and the database has the tables. Cutting it will feel like a loss.

**The position.** Gamification on top of a learning loop nobody has used yet is decoration on an unproven product. `10_ENTWICKLUNGSPLAN_NEUBAU.md` §3.2 already states the constraint that matters: *"Gamification belohnt nachgewiesenes Lernen. Es gibt keinen strafenden XP-Verfall und keine Punkte für reine Logins/Klicks."* That is a **rules decision that has not been made yet.** Building the UI before the rules exist means building it twice.

Ship the learning loop. Watch 10 real students use it. Then design the gamification around what actually motivated them. That is a better product and less total work.

**Fix applied.** Rationale documented in the master plan §15 so the cut reads as a decision, not an omission.

---

### 💡 CEO-05 — The one thing worth *adding* to scope

**The challenge.** Scope reduction mode still asks: is there a cheap addition that disproportionately improves the product?

Yes, one. **The student dashboard's "Weiter lernen" card.**

A learner who logs in and sees a course list has to decide what to do. A learner who logs in and sees *"Weiter mit: Aufgabe 7 — Testfälle aus Anforderungen ableiten"* with a big red button just carries on. Duolingo, Pluralsight and every product with real retention does exactly this. It costs about 20 minutes: one RPC call for the next available task, one card component.

**Fix applied.** Promoted from "a card on the dashboard" to **WS-2's second-highest priority after the task workspace**, and specified: largest element on the page, above the fold, single primary action, showing course name, task title, and progress within the course.

---

## Part 3 — Fixes applied to the plan

| # | Finding | Severity | Status |
|---|---|:---:|:---:|
| BUG-01 | Shared `.next` corruption across 6 chats | 🔴 | ✅ Fixed — per-chat `NEXT_DIST_DIR` |
| BUG-02 | OneDrive sync will eat files | 🔴 | ✅ Fixed — Wave 0 Task 0, pause or move |
| BUG-03 | Seeded password unverified | 🔴 | ✅ Fixed — marked unverified, WS-0 must confirm |
| BUG-04 | Route-group layouts block chats | 🔴 | ✅ Fixed — WS-0 owns all 5 layouts |
| BUG-05 | 42 nav links pointing at 404s | 🟠 | ✅ Fixed — WS-0 generates all 42 stubs |
| BUG-06 | Wave 0 time-box unrealistic | 🟠 | ✅ Fixed — split into 0a blocking / 0b parallel |
| BUG-07 | Workstream load unbalanced | 🟠 | ✅ Fixed — rebalanced + per-WS cut lists |
| BUG-08 | No automated test of any kind | 🟠 | ✅ Fixed — `scripts/smoke.mjs`, run by everyone |
| BUG-09 | No rollback after the purge | 🟠 | ✅ Fixed — `git tag pre-v3-purge` |
| BUG-10 | Lockfile merge conflicts | 🟡 | ✅ Fixed — explicit checkout rule |
| BUG-11 | Deleting useful documentation | 🟡 | ✅ Fixed — `docs/execution/` kept |
| BUG-12 | `src/features/` contradiction | 🟡 | ✅ Fixed — per-workstream subfolders |
| BUG-13 | Purge may break kept files | 🟡 | ✅ Fixed — incremental purge + typecheck |
| BUG-14 | Tailwind v4 innovation token | 🟡 | ✅ Fixed — 10-minute hard fallback rule |
| BUG-15 | No coordinator named | 🟡 | ✅ Fixed — role defined, 4 duties |
| BUG-16 | `DITELE_APP_ORIGIN` port mismatch | 🟢 | ✅ Fixed — inline override in start command |
| CEO-01 | Optimising for route count, not quality | 💡 | ✅ Fixed — 3-tier quality budget |
| CEO-02 | "Production-ready" undefined | 💡 | ✅ Fixed — Q8 added, plan targets pilot |
| CEO-03 | Practice loop is the whole product | 💡 | ✅ Fixed — north star + 3 consequences |
| CEO-04 | Gamification cut without rationale | 💡 | ✅ Fixed — rationale documented |
| CEO-05 | Missing the highest-leverage feature | 💡 | ✅ Fixed — "Weiter lernen" promoted |

---

## Part 4 — Final verdict

**Is the plan sound?** Yes, after these 20 fixes. The core strategic call — keep the database, delete the frontend — is right, and it is right for the reason that matters: the database already contains every workflow as a tested server-side RPC, and the frontend contains none of the product.

**Will it produce a working app in 5–6 hours?** The **P0 scope** will, if and only if:
1. OneDrive is paused or the repo is moved (BUG-02),
2. Wave 0a completes fully before any parallel chat starts,
3. the RPC contracts are verified rather than guessed,
4. and the database has real content to render.

Miss any one of those four and the day is lost — not degraded, lost. They are not four risks among many. They are the four preconditions.

**What will *not* happen in 6 hours:** all 16 requirements from the research document, gamification, AI, labs, portfolios, integrations, multi-tenancy, or email. Those are correctly deferred, and the plan says so plainly instead of quietly hoping.

**The honest bottom line.** You will have a branded, responsive, three-role learning platform running against your real database, with the core learn → submit → review loop working end to end. That is a genuinely good day's work. It is not the full research document, and any plan that told you otherwise would be lying to you.

**Status: DONE_WITH_CONCERNS.**

Concerns, in priority order:
1. The seeded password is unverified — this is the first thing to check, and it can stop everything.
2. Whether the database contains real course content is unknown, and it is the second thing to check.
3. Six parallel chats in one repo is inherently fragile. The file-ownership rules are the only thing preventing chaos, and they only work if every chat actually obeys them.
