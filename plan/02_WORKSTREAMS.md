# DiTeLe V3 — Workstreams & Parallel-Chat Protocol

> **Version 1.2** — 20 review fixes applied ([03_REVIEW_LOG.md](03_REVIEW_LOG.md)); time-boxes removed, waves are gated not timed.
> **Read [00_MASTER_PLAN.md](00_MASTER_PLAN.md) first.** Then §1–§5 here plus your own workstream section.
> **Prompts and the token-limit handoff protocol: [04_PROMPTS_AND_HANDOFF.md](04_PROMPTS_AND_HANDOFF.md).**
> **This file is read-only during the build.** Write progress to `plan/status/WS-<n>.md`, never here.

---

## 1. The prime directive

```
╔════════════════════════════════════════════════════════════════════════════╗
║  YOU MAY ONLY CREATE OR EDIT FILES INSIDE YOUR OWN OWNERSHIP TREE.         ║
║                                                                            ║
║  If you need a change in someone else's file:                              ║
║    → append it to plan/status/ISSUES.md                                     ║
║    → work around it locally                                                 ║
║    → DO NOT edit their file. Not even "just one line".                      ║
║                                                                            ║
║  Violating this is the single failure mode that loses the whole day.        ║
╚════════════════════════════════════════════════════════════════════════════╝
```

---

## 2. Wave structure

```
   WAVE 0a — SERIAL, ONE CHAT                   ⛔ BLOCKS EVERYONE
   ┌──────────────────────────────────────────────────────────────┐
   │ OneDrive · backup tag · VERIFY LOGIN + DATA · purge · deps   │
   │ tokens · shell · nav · 5 group layouts · 42 stubs · auth     │
   │ Result<T> · rpc.ts · RPC_CONTRACTS.md · smoke.mjs            │
   │ tier-1 components only                                       │
   └──────────────────────────────────────────────────────────────┘
                              │
                         ⛔ HARD GATE ⛔  (§5.9)
                              │
   ┌──────────────────────────┴───────────────────────────────────┐
   │                                                              │
   WAVE 0b (WS-0 continues)          WAVE 1 — PARALLEL CHATS (1 per workstream)
   ┌───────────────────────┐    ┌──────┬──────┬──────┬──────┬──────┬──────┐
   │ tier-2 + tier-3       │    │ WS-1 │ WS-2 │ WS-3 │ WS-4 │ WS-5 │ WS-6 │
   │ components, announced │    │Public│Learn │Learn │Train │Admin │Admin │
   │ as each one lands     │    │+Auth │ Core │ Plus │  er  │Content│ Ops │
   └───────────────────────┘    └──────┴──────┴──────┴──────┴──────┴──────┘
                              │
                       ✅ INTEGRATION ✅
                              │
   WAVE 2 — SERIAL, ONE CHAT
   ┌──────────────────────────────────────────────────────────────┐
   │  WS-7  POLISH · RESPONSIVE · A11Y · E2E · CONSISTENCY · FIX  │
   └──────────────────────────────────────────────────────────────┘
```

**Why the 0a / 0b split:** every minute of Wave 0 is a minute the parallel chats spend idle. 0a is the true blocking minimum — the things without which nobody can start. Everything else moves to 0b and runs alongside Wave 1.

**Waves are gated, not timed.** A wave is finished when its gate passes. There is no clock.

---

## 3. You are the coordinator

Autonomous chats need one human owner. That is you. Four jobs, nothing else:

1. **Open the Wave 0a gate.** Verify §6.9 yourself before telling anyone to start. Do not take WS-0's word for it — click through the three logins.
2. **Triage `ISSUES.md` periodically.** Route each item to its owner. Most entries are one chat telling another that something is broken. Use the coordinator prompt in [04_PROMPTS_AND_HANDOFF.md](04_PROMPTS_AND_HANDOFF.md) §2.4 for a read-only status sweep.
3. **Assign workstreams and track coverage.** Every workstream needs exactly one owner at a time. If a chat dies from a token limit, reassign it to a fresh chat — [04_PROMPTS_AND_HANDOFF.md](04_PROMPTS_AND_HANDOFF.md) has the prompt and the resume protocol.
4. **Kick off WS-7** once the last Wave-1 chat commits.

---

## 4. File ownership map

**Every path is owned by exactly one workstream. There is no shared write access.**

| Path | Owner | Others may |
|---|---|---|
| `package.json`, `package-lock.json`, `postcss.config.mjs`, `next.config.ts`, `tsconfig.json`, `.gitignore` | **WS-0** | read only |
| `src/app/globals.css`, `src/app/layout.tsx`, `src/app/fonts.ts` | **WS-0** | read only |
| `src/shared/ui/**` | **WS-0** | **import only — never edit** |
| `src/shared/layout/**` (incl. `nav-config.ts`) | **WS-0** | import only |
| `src/shared/auth/**` | **WS-0** | import only |
| `src/shared/data/rpc.ts`, `session.ts`, `result.ts` | **WS-0** | import only |
| `src/shared/database/**`, `src/shared/config/**` | **WS-0** | import only |
| ⭐ **ALL route-group layouts** — `(public)/layout.tsx`, `(auth)/layout.tsx`, `(student)/layout.tsx`, `(trainer)/layout.tsx`, `(admin)/layout.tsx` | **WS-0** | **read only — never edit** |
| `public/**` (logos, favicon) | **WS-0** | read only |
| `scripts/smoke.mjs` | **WS-0** | run it, don't edit it |
| `src/app/[locale]/(public)/**`, `src/app/[locale]/(auth)/**`, `src/app/auth/**` *(pages, not layouts)* | **WS-1** | — |
| `src/shared/data/catalog.ts` | **WS-1** | import only |
| `src/app/[locale]/(student)/learn/page.tsx`, `learn/courses/**`, `learn/tasks/**` | **WS-2** | — |
| `src/shared/data/learning.ts` · `src/features/learning/**` | **WS-2** | import only |
| `src/app/[locale]/(student)/learn/questions/**`, `history/**`, `certificates/**`, `notifications/**`, `profile/**`, `enroll/**` | **WS-3** | — |
| `src/shared/data/questions.ts`, `profile.ts`, `notifications.ts` · `src/features/questions/**` | **WS-3** | import only |
| `src/app/[locale]/(trainer)/trainer/**` · `src/shared/data/review.ts` · `src/features/review/**` | **WS-4** | — |
| `src/app/[locale]/(admin)/admin/page.tsx`, `admin/courses/**`, `admin/tasks/**` | **WS-5** | — |
| `src/shared/data/content.ts` · `src/features/content/**` | **WS-5** | import only |
| `src/app/[locale]/(admin)/admin/users/**`, `groups/**`, `applications/**`, `issues/**`, `ratings/**`, `settings/**`, `profile/**` | **WS-6** | — |
| `src/shared/data/admin.ts` · `src/features/admin/**` | **WS-6** | import only |
| `plan/status/WS-<n>.md` | that workstream | — |
| `plan/status/ISSUES.md` | **append-only, everyone** | append a row, never edit an existing one |
| `plan/00_*.md`, `02_*.md`, `03_*.md` | coordinator | read only |

### Collision hot-spots — read this twice

1. **WS-0 owns every route-group layout.** No Wave-1 chat creates or edits `(student)/layout.tsx`, `(admin)/layout.tsx` or any other. This is why two chats can safely work inside the same route group.
2. **`nav-config.ts` is WS-0's** and lists all 42 routes from the start. No workstream adds nav entries.
3. **Nobody edits `src/shared/ui/`.** If `Button` lacks a variant you need, wrap it in your own feature folder.
4. **`src/features/` subfolders are private.** WS-2 owns `features/learning/`, WS-4 owns `features/review/`. Never open another's.
5. **Nobody runs `npm install`.** Dependencies frozen at the 0a gate.
6. **Every one of the 42 route files already exists** as a WS-0 stub. You *replace* your stubs. You never create a file another chat might also create.

---

## 5. Protocol for every Wave-1 chat

### 5.1 Start-up sequence

```
1. Confirm the Wave 0a commit is present
2. Read plan/00_MASTER_PLAN.md
3. Read plan/status/WS-0.md              ← what actually got built, and the WORKING PASSWORD
4. Read plan/status/RPC_CONTRACTS.md     ← the real RPC signatures. Do not guess.
5. Read your section below
6. Skim src/shared/ui/ and src/shared/layout/ so you reuse instead of rebuild
7. npx tsc --noEmit                      ← must be green before you start
8. Start your dev server (exact command below — copy it, don't improvise)
9. Log in with your role's account
```

### 5.2 Your dev server command — copy exactly

Three things must be per-chat: the port, the build directory, and the app origin. Getting any one wrong causes a failure that looks like a code bug.

| WS | Command |
|---|---|
| WS-1 | `NEXT_DIST_DIR=.next-ws1 DITELE_APP_ORIGIN=http://127.0.0.1:3101 npm run dev -- --port 3101` |
| WS-2 | `NEXT_DIST_DIR=.next-ws2 DITELE_APP_ORIGIN=http://127.0.0.1:3102 npm run dev -- --port 3102` |
| WS-3 | `NEXT_DIST_DIR=.next-ws3 DITELE_APP_ORIGIN=http://127.0.0.1:3103 npm run dev -- --port 3103` |
| WS-4 | `NEXT_DIST_DIR=.next-ws4 DITELE_APP_ORIGIN=http://127.0.0.1:3104 npm run dev -- --port 3104` |
| WS-5 | `NEXT_DIST_DIR=.next-ws5 DITELE_APP_ORIGIN=http://127.0.0.1:3105 npm run dev -- --port 3105` |
| WS-6 | `NEXT_DIST_DIR=.next-ws6 DITELE_APP_ORIGIN=http://127.0.0.1:3106 npm run dev -- --port 3106` |
| WS-7 | `NEXT_DIST_DIR=.next-ws7 DITELE_APP_ORIGIN=http://127.0.0.1:3107 npm run dev -- --port 3107` |

> **Why `NEXT_DIST_DIR`:** Next.js writes build output to `.next/` regardless of port. Six dev servers on one directory corrupt each other's chunks and produce phantom "module not found" errors that are not in anyone's code. WS-0 wires `distDir: process.env.NEXT_DIST_DIR || ".next"` in `next.config.ts` so this works.
>
> **Never edit `.env.local`** to fix an origin problem. Use the inline override above.

### 5.3 Git rules

- **Commit only your own paths, explicitly:** `git add "src/app/[locale]/(trainer)" src/shared/data/review.ts`
- **Never** `git add .` · **never** `git add -A` · **never** `git commit -a`
- **`package.json` and `package-lock.json` are committed once, by WS-0.** If yours changed, run `git checkout -- package.json package-lock.json` before committing. If you genuinely believe you need a dependency: you do not. File it in `ISSUES.md`.
- Never `git checkout <branch>`, `git reset --hard`, `git stash`, `git rebase`, or force-push. Five other chats have uncommitted work in this tree.
- Message format: `WS-<n>: <what>` — e.g. `WS-4: trainer review queue + decision flow`

### 5.4 Shut-down sequence

```
1. npx tsc --noEmit           → green
2. npx next lint              → green
3. node scripts/smoke.mjs     → green   ← catches routes you broke for other chats
4. Walk every route you own through the 8-point checklist (MASTER_PLAN §14.2)
5. Fill in plan/status/WS-<n>.md
6. git add <your paths only> && git commit
7. Report to the coordinator
```

> ⚠️ **Do NOT run `npm run build`.** A full build takes 60–90s; six in parallel starves the machine. Only WS-0 and WS-7 build.

### 5.5 Rules for every chat

- **Reuse before you write.** If it exists in `src/shared/ui/`, use it. Do not write a second Button.
- **No hardcoded colours.** Only tokens from `globals.css`.
- **No new dependencies. Ever.**

**⭐ The four launch-grade rules.** A real launch is coming ([01_LAUNCH_READINESS.md](01_LAUNCH_READINESS.md)). These four cost seconds now and days later:

1. **Never hardcode a UI string.** Every user-visible word goes through i18n with a typed key: `{t("learn.task.submit")}`, never `Abgeben`. **You write German into `messages/de.json` only** — leave `en.json` and `ru.json` alone, they get one dedicated translation pass at the end. Key format: `<area>.<screen>.<element>`.
2. **Every list query takes `limit` and `offset`** from the start, even when it returns 8 rows today. Adding pagination to 20 screens later is a full day.
3. **Every destructive action writes an `audit_events` row.** The table exists. History that was not logged never existed.
4. **Never inline a URL or key.** `NEXT_PUBLIC_SUPABASE_URL` and `DITELE_APP_ORIGIN` are read from env, always. They change to a public HTTPS domain at go-live and that must be one env edit, not a grep across the codebase.

- **All routes are under `/[locale]`.** `src/app/[locale]/(student)/learn/…` renders at `/de/learn`, `/en/learn`, `/ru/learn`.
- **Every route gets `loading.tsx` and `error.tsx`.** No exceptions.
- **Every list gets an empty state.**
- **`SUPABASE_SERVICE_ROLE_KEY` never appears in a file containing `"use client"`.**
- **Respect the quality tiers** (MASTER_PLAN §1). Signature screens get polish. Functional screens get correctness and nothing more.
- If a tier-2/3 component has not landed from WS-0 yet, use the documented fallback (native `<dialog>`, plain `<video>`, inline confirm) and move on. Do not wait.
- Blocked >10 minutes: write it into `ISSUES.md`, stub it with a visible `Vorschau` badge, move on. Do not stall.

---

## 6. WAVE 0a — Foundation ⛔ BLOCKS EVERYONE

### 6.1 Task 0 — Protect the work — BEFORE ANYTHING ELSE

**1. Deal with OneDrive.** The repo sits in `OneDrive - WAMOCON GmbH\...`. During the analysis for this plan, three requirement docs **vanished from the working tree** and had to be restored from git. That was one process reading files. Six chats writing thousands of files plus six `.next` directories will be far worse.

Either:
- Right-click the OneDrive tray icon → **Pause syncing → 8 hours**, or
- **Move the repo out of OneDrive** — `C:\dev\ditele_yash`. This is the better option.

`.gitignore` excludes `node_modules` and `.next`. OneDrive does not read `.gitignore`.

**2. Make the purge reversible:**
```bash
git tag pre-v3-purge
git branch backup/pre-v3-purge
```
Any single file is then recoverable with `git checkout pre-v3-purge -- <path>`.

### 6.2 Task 1 — Verify the backend 🚨 HIGHEST RISK

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/health"   # expect 200
```

**1. 🚨 VERIFY THE PASSWORD.** Log in as `learner@ditele.local` with `Ditele-Local-2026!`.
That password comes from a comment in `seed.sql`, but `seed_role_accounts.sql` says it *"deliberately replaces"* it. **It may be wrong.** If login fails, reset all four accounts through the service-role Admin API and write the working password into `plan/status/WS-0.md`. Nothing downstream works until this is settled.

**2. Introspect every RPC signature** (MASTER_PLAN §13.3) and write `plan/status/RPC_CONTRACTS.md`. Argument names, return shapes, exact spelling. **Six chats guessing = six chats failing.** This is the highest-value 15 minutes in the entire build.

**3. Count rows** in `courses`, `content_versions`, `stages`, `tasks`, `cohorts`, `cohort_memberships`, `enrollments`, `profiles`, `user_roles`.

**4. Seed mock data — do this regardless of what you find.** ✅ This is a test environment and production will have real content, so seed freely. No permission needed.

Follow the table in MASTER_PLAN §4.5: 3 courses (published / in review / draft), 4 stages each, 8–10 tasks each with at least 3 practice tasks, 2 cohorts (1 active, 1 completed), 6–8 learners, mixed enrolments, 10–15 submissions across all states, 5–6 questions, notifications, ratings.

Write it as `scripts/seed-mock.mjs` using the service-role client — a script beats raw SQL here because it can call the same RPCs the app calls, which validates your `RPC_CONTRACTS.md` at the same time.

**Design the seed for the screens.** Every list needs enough rows that sorting, filtering and pagination are meaningful, and every status badge needs at least one row showing it. No developer should ever open a screen, see an empty table, and have to guess what it looks like with data.

> ⚠️ Seeding means **inserting rows**. Still never run `npm run db:reset`, `supabase start`, or `supabase db push` — those wipe or re-migrate the deployed schema.

**4. Record what each role can actually read.** RLS may block things the UI assumes. Log in as each account, query the main tables, write the results into `WS-0.md`. This is how the other six chats know what is real.

### 6.3 Task 2 — Purge

Delete per MASTER_PLAN §5.1 — **incrementally**. Delete one group, run `npx tsc --noEmit`, fix or trim what breaks, continue.

Order: `app/[locale]` → `entities` → `features` (contents only) → `shared/api` → `shared/ui` → the rest.

Some "keep" files may import from deleted ones. If a kept file only depended on deleted code, that dependency was decorative — trim it. `docs/execution/` is **not** deleted.

Gate: `npx tsc --noEmit` green before continuing.

### 6.4 Task 3 — Dependencies & config

```bash
npm i -D tailwindcss@^4 @tailwindcss/postcss@^4
npm i clsx tailwind-merge class-variance-authority
```

Write `postcss.config.mjs`. Add to `next.config.ts`: `distDir: process.env.NEXT_DIST_DIR || ".next"` and the `frame-src` CSP header. Add `.next-*` to `.gitignore`.

> ⏱ **Do not sink time into Tailwind v4.** If it is not rendering correctly quickly, switch to `tailwindcss@3.4` + `postcss` + `autoprefixer` + `tailwind.config.ts`, record it in `WS-0.md`, move on. Do not debug a build tool while other chats wait.

**Dependencies are now frozen.** Commit `package.json` + `package-lock.json` here.

### 6.5 Task 4 — Design system, tier 1 only

- `public/` ← copy `logo.svg`, `footerlogo.svg`, `mobilelogo.svg`, `favicon.ico` from `ditele_daniel/public/`
- `src/app/fonts.ts` — Rosario + Raleway, **`latin-ext` subset** (German umlauts live there)
- `src/app/globals.css` — every token from MASTER_PLAN §6.3, the 9 keyframes from §6.6, the scrollbar policy from §7.3, the `prefers-reduced-motion` block
- `src/app/layout.tsx` — font variables, no-flash theme script, `<Toaster/>` mount point

**Tier-1 components only** (`src/shared/ui/`):
`cn()` · `Button` · `Card` · `Input` · `Textarea` · `Select` · `Field` · `Badge` · `StatusBadge` · `Skeleton` · `EmptyState` · `ErrorState` · `DataTable`

Everything else is Wave 0b.

### 6.6 Task 5 — Shell, layouts, and 42 stubs

**Shell** (`src/shared/layout/`, per MASTER_PLAN §7.4). `nav-config.ts` lists **all 42 routes for all 3 roles** now — it is the contract the other six chats navigate by.

**All five route-group layouts,** with guards wired:
`(public)/layout.tsx` · `(auth)/layout.tsx` · `(student)/layout.tsx` · `(trainer)/layout.tsx` · `(admin)/layout.tsx`

> This is why WS-2 and WS-3 can share `(student)/`, and WS-5 and WS-6 can share `(admin)/`, without ever touching the same file.

**⭐ Generate a stub `page.tsx` for all 42 routes** — a centred card reading *"Diese Seite wird gerade gebaut"* plus the owning workstream ID. Three reasons this matters:
1. Navigation works from minute one; every chat can see the whole app.
2. Every file already exists with a known owner — two chats can never race to create the same file.
3. A route still showing a stub at the end is instantly visible as unfinished, rather than silently missing.

Verify the shell at 375px, 768px and 1440px before moving on.

### 6.7 Task 6 — Auth & data layer

- `src/shared/auth/role.ts` — the 8→3 mapping (MASTER_PLAN §9.2)
- `src/shared/auth/guard.ts` — `requireRole()`
- `src/shared/data/result.ts` — `Result<T>` + `mapPostgrestError` with German messages
- `src/shared/data/session.ts` — `getPrincipal`, `signIn`, `signOut`, `register`, `postAuthDestination`
- `src/shared/data/rpc.ts` — typed wrappers for **all P0 RPCs**, signatures from Task 1
- `/403` page
- Regenerate `database.types.ts` **only if** Task 1 showed it is stale

### 6.8 Task 7 — The smoke test

`scripts/smoke.mjs`: log in as each of the three roles, request all 42 routes, assert 2xx/3xx and no `Application error` in the body, print a pass/fail table, exit non-zero on failure.

Written against the stubs, so it is green from the start. Every workstream runs it before committing. It catches "route crashes on load" — the most common failure in a parallel build — across all six chats for near-zero cost.

### 6.9 ⛔ THE GATE — coordinator verifies every box personally

- [ ] OneDrive paused, or repo moved out of OneDrive
- [ ] `git tag pre-v3-purge` exists
- [ ] 🚨 **Login verified for all three accounts** — working password recorded in `WS-0.md`
- [ ] 🚨 **`RPC_CONTRACTS.md` written with real, introspected signatures**
- [ ] 🚨 **Seed data confirmed present** (or seeded) — courses, stages, tasks, a cohort with the learner in it
- [ ] RLS findings per role recorded in `WS-0.md`
- [ ] `npx tsc --noEmit` green
- [ ] `npx next lint` green
- [ ] `npm run build` green
- [ ] `node scripts/smoke.mjs` green — all 42 routes respond
- [ ] All three roles land on their own dashboard after login
- [ ] Header + footer + mobile tab bar correct at 375 / 768 / 1440
- [ ] Dark mode toggles with no flash and no invisible text
- [ ] All 42 stubs exist and are reachable from the nav
- [ ] `WS-0.md` written: what exists, what was cut to 0b, tables with data, RLS findings
- [ ] Committed

**Only when every box is ticked, release the six Wave-1 chats.**

---

## 7. WAVE 0b — WS-0 continues alongside Wave 1

Tier-2, then tier-3. **Announce each component in `WS-0.md` as it lands.**

**Tier 2:** `Avatar` · `Progress` · `Dialog` · `Sheet` · `DropdownMenu` · `Toast` · `Tabs` · `ConfirmDialog` · `Pagination` · `SearchInput` · `StatTile`

**Tier 3:** `Tooltip` · `StarRating` · `ProgressRing` · `VideoPlayer` · `PdfViewer` · **`IframePanel`**

> ⚠️ **`IframePanel` blocks WS-2's practice task — build it FIRST in 0b.** If WS-0 has not delivered it by the time WS-2 needs it, WS-2 builds it inside `src/features/learning/` and WS-7 promotes it to `shared/ui` later.

---

## 8. WAVE 1 — the six parallel workstreams

> Running fewer than 6 chats? Merge in this order:
> 3 chats → (WS-1+WS-3) · (WS-2+WS-4) · (WS-5+WS-6)
> 2 chats → (WS-1+WS-2+WS-3) · (WS-4+WS-5+WS-6)

---

### WS-1 — Public & Auth · port 3101 · quality tier: **Landing = Signature**

**Routes (15):** `/` · `/catalog` · `/catalog/[slug]` · `/about` · `/faq` · `/privacy` · `/legal` · `/403` · `not-found` · `error` · `/login` · `/register` · `/reset-password` · `/update-password` · `/auth/callback`

**Owns:** `src/app/[locale]/(public)/**` and `src/app/[locale]/(auth)/**` *(pages only — WS-0 owns the layouts)* · `src/app/auth/callback/route.ts` · `src/shared/data/catalog.ts`

**Build in this order**
1. `catalog.ts` — `get_public_catalog`, `get_public_catalog_course`
2. **Auth pages** — centred card, DiTeLe logo, German validation, rate-limit error handled, post-login redirect via WS-0's `postAuthDestination()`. **Do these before the landing page** — five other chats need working login.
3. ⭐ **Landing** — Signature tier. Full-bleed hero (Rosario display, red CTA, the ●●● mark), 3 value props, 6-course preview grid, "So funktioniert's" 4-step, footer CTA. Staggered `fade-in-up` on scroll via `IntersectionObserver`. **This is the first thing anyone sees — it sets the quality bar for the whole app. Spend your polish budget here.**
4. **Catalog** — responsive grid (1/2/3 cols), `SearchInput`, level filter, `CourseCard`, empty state
5. **Course detail** — hero, curriculum accordion, ratings, "Jetzt anmelden" → `/register` for guests, `/learn/enroll/[id]` for students
6. **Static pages** — real German content, not lorem
7. **`/403`, 404, error boundary** — branded, with a way back

**Build order — the items below are last, so a handoff mid-workstream still leaves something coherent:** FAQ accordion → plain list · About/Legal → minimal real text · catalog filters → search only · landing scroll animations → static

**Done when:** a logged-out visitor can browse, open a course, register, log in, and land on the correct dashboard — at 375px and 1440px, light and dark.

---

### WS-2 — Student Core ⭐ THE CRITICAL PATH · port 3102 · quality tier: **Signature**

**Routes (4):** `/learn` · `/learn/courses` · `/learn/courses/[courseId]` · `/learn/tasks/[taskId]`

*(`/learn/history` moved to WS-3 — you have the hardest screen in the app, you get fewer routes.)*

**Owns:** those four route folders · `src/shared/data/learning.ts` · `src/features/learning/**`
**Does NOT own:** `(student)/layout.tsx` — that is WS-0's.

**Build in this order**
1. `learning.ts` — `list_my_learning_courses`, `get_my_learning_course`, `get_my_learning_task`, `start_attempt`, `save_attempt_draft`, `submit_attempt`
2. ⭐⭐ **`/learn/tasks/[taskId]` — the task workspace.** Build this first and give it the most time. It *is* the product.
   - **Desktop:** two columns — left = description, video, hints (68ch); right = sticky answer panel + submit
   - **Mobile:** single column, tabs (`Aufgabe` / `Antwort`), sticky bottom submit bar. **Build mobile first, then widen** — 375px is the hardest layout in the app.
   - Theory: `VideoPlayer` → `PdfViewer` → quiz options
   - Practice: intro video → scenario → `IframePanel` (desktop) or "Testumgebung öffnen" button (mobile) → `DefectForm`
   - `DefectForm` is designed like a professional bug tracker — severity, steps, expected, actual. **The form is part of the teaching**; these students are learning to write real defect reports.
   - `HintCascade` — reveal one at a time, record usage **before** revealing
   - Autosave every 20s and on blur, "Gespeichert HH:MM" indicator
   - Submit → `ConfirmDialog` → `submit_attempt` → success state → back to course
   - Attempt counter + retry when repeatable
   - **The draft must survive a page reload. Test this explicitly.**
3. ⭐ **`/learn` dashboard — the "Weiter lernen" card is the second-highest priority in this workstream.**
   A learner who sees a course list has to decide what to do. A learner who sees *"Weiter mit: Aufgabe 7 — Testfälle aus Anforderungen ableiten"* with a big red button just carries on. Every product with real retention does exactly this, and it costs about 20 minutes.
   Largest element on the page, above the fold, single primary action, showing course name, task title, and progress within the course.
   Then: active-course cards with progress rings, recent notifications, stat tiles. Empty state: "Noch kein Kurs — Katalog ansehen".
4. **`/learn/courses`** — course grid with progress
5. **`/learn/courses/[courseId]`** — stage accordion → `TaskListItem` rows with status icons (locked / available / in progress / submitted / accepted / revision). Sticky progress header.

**Watch out:** double-submit (disable the button **and** rely on server idempotency) · a locked submission renders read-only · `IframePanel` may not exist yet — check `WS-0.md`, and build it in `features/learning/` if WS-0 is behind.

**Build order — the items below are last, so a handoff mid-workstream still leaves something coherent:** hint cascade → show all hints at once · progress rings → plain bars · course-detail sticky header → static · dashboard stat tiles → drop
**Never cut:** the task workspace, autosave, or the "Weiter lernen" card.

**Done when:** WF-2 (MASTER_PLAN §12) passes end to end on mobile and desktop.

---

### WS-3 — Student Plus · port 3103 · quality tier: **Functional**

**Routes (8):** `/learn/questions` · `/learn/questions/new` · `/learn/questions/[questionId]` · `/learn/history` · `/learn/enroll/[courseId]` · `/learn/notifications` · `/learn/profile` · `/learn/certificates`

**Owns:** those route folders · `src/shared/data/questions.ts`, `profile.ts`, `notifications.ts` · `src/features/questions/**`
**Does NOT own:** `(student)/layout.tsx`.

**Build in this order**
1. `questions.ts`, `notifications.ts`, `profile.ts`
2. **Notifications** — grouped by day, unread dot, `mark_notification_read`, "Alle als gelesen markieren", deep links. Build early: WS-2 and WS-4's flows produce notifications, and this is where they land.
3. **Questions list** — status badges (offen / zugewiesen / beantwortet / archiviert), unanswered first
4. **New question** — task context picker, title, body
5. **Question thread** — `QuestionThread` message list, reply composer, trainer name + avatar
6. **Profile** — display name, bio, language, timezone; notification preferences; theme toggle; password change; sign out. Avatar upload only if Storage exists (MASTER_PLAN §16 Q6) — otherwise initials.
7. **Enrol** — course summary + `request_enrollment` + pending/approved/rejected state
8. **History** — `DataTable` of past attempts with status and score
9. **Certificates** — list + download, or an honest empty state (P1 / BLK-003)

**Watch out:** the notification bell count lives in WS-0's header and reads the same source — do not build a second one. Profile save shows a toast, not a silent redirect.

**Build order — the items below are last, so a handoff mid-workstream still leaves something coherent:** certificates → honest empty state · avatar upload → initials only · history filters → plain list · notification day-grouping → flat list

---

### WS-4 — Trainer · port 3104 · quality tier: **Review detail = Signature**, rest Core

**Routes (11):** `/trainer` · `/trainer/submissions` · `/trainer/submissions/[submissionId]` · `/trainer/questions` · `/trainer/questions/[questionId]` · `/trainer/questions/archive` · `/trainer/groups` · `/trainer/groups/[cohortId]` · `/trainer/progress` · `/trainer/history` · `/trainer/profile`

**Owns:** `src/app/[locale]/(trainer)/trainer/**` · `src/shared/data/review.ts` · `src/features/review/**`
**Does NOT own:** `(trainer)/layout.tsx`.

**Build in this order**
1. `review.ts` — `get_submission_review_context`, `decide_submission`, `transfer_submission`, `claim_question`, `answer_question`, `transfer_question`, `archive_question`, `list_active_cohort_trainers`
2. ⭐ **Review detail** — Signature tier. Task description and learner answer **side by side**, plus evidence, hints used, time taken, attempt number, previous attempts, comment box, `ReviewDecisionBar` (Annehmen / Überarbeitung anfordern / Weitergeben). Mobile: stacked with tabs, sticky decision bar.
   **Target: a review takes 90 seconds, not five minutes.** Trainer throughput is what makes this platform economically viable. Every extra click here is a cost multiplied by every submission ever made.
3. **Review queue** — `DataTable` (learner, task, cohort, submitted-at, waiting-time badge). Filters in the URL. **Oldest first by default.** Age badge amber >24h, red >72h.
4. **Dashboard** — stat tiles (open reviews, open questions, oldest waiting, decided today), queue preview, active cohorts
5. **Questions** — open queue, claim, answer, transfer, archive; archive view
6. **Groups** — cohort cards → detail with member progress table
7. **Progress** — learner × task completion matrix; card list on mobile
8. **History** — past decisions
9. **Profile** — reuse WS-3's pattern, keep it plain

**Watch out:** the decision is irreversible — require confirmation · handle the concurrent-review conflict error explicitly with a readable German message · never render a submission the database refused (show `ErrorState`, do not crash).

**Build order — the items below are last, so a handoff mid-workstream still leaves something coherent:** progress matrix → simple per-learner list · history → drop · questions archive → drop · dashboard tiles → counts only

**Done when:** WF-3 and WF-4 pass end to end against WS-2's and WS-3's screens.

---

### WS-5 — Admin Content · port 3105 · quality tier: **Core**

**Routes (6):** `/admin` · `/admin/courses` · `/admin/courses/new` · `/admin/courses/[courseId]` · `/admin/courses/[courseId]/versions/[versionId]` · `/admin/tasks`

**Owns:** `admin/page.tsx`, `admin/courses/**`, `admin/tasks/**` · `src/shared/data/content.ts` · `src/features/content/**`
**Does NOT own:** `(admin)/layout.tsx`.

**Build in this order**
1. `content.ts` — `publish_content_version`, `submit_content_for_review`, `decide_content_review`, `archive_content_version`, `get_content_archive_impact`, `update_task_schedule` + CRUD on `courses`, `stages`, `tasks` and their localizations
2. ⭐ **Content Studio — MINIMUM VIABLE VERSION FIRST.** It is the largest single screen in the app. Build it in this order so it is coherent at every point:
   - **(a)** Stage list with add + delete
   - **(b)** Task list per stage, and the task editor: type (Theorie/Praxis), title, description, duration, video URL, options/answers, hints, model answer; practice adds the external target URL + intro video
   - **(c)** The lifecycle bar: Entwurf → Zur Prüfung (`submit_content_for_review`) → Freigegeben (`decide_content_review`) → Veröffentlicht (`publish_content_version`) → Archiviert (`archive_content_version`, showing `get_content_archive_impact` first)
   - **(d)** Then the rest, in this order: autosave, unsaved-changes guard, up/down reordering, inline preview, bulk actions.
3. **Course list** — `DataTable` with status, version, actions
4. **Create course** — title, description, level, duration, thumbnail
5. **Course detail** — metadata + version list with lifecycle badges
6. **Dashboard** — KPI tiles (users by role, courses, active cohorts, pending reviews, open requests, open issues) + recent activity
7. **Task inventory** — searchable table across all courses

**Watch out:** a published version is read-only · destructive actions need typed confirmation · never invent a state name, read it from the database enum.

**Build order — the items below are last, so a handoff mid-workstream still leaves something coherent:** drag-reorder → up/down buttons → nothing · task inventory → drop · inline preview → drop · dashboard KPIs → three tiles instead of six
**Never cut:** the task editor or the lifecycle bar.

---

### WS-6 — Admin Ops · port 3106 · quality tier: **Functional — plain is fine, do not polish**

**Routes (11):** `/admin/users` · `/admin/users/new` · `/admin/users/[userId]` · `/admin/groups` · `/admin/groups/new` · `/admin/groups/[cohortId]` · `/admin/applications` · `/admin/issues` · `/admin/ratings` · `/admin/settings` · `/admin/profile`

**Owns:** those route folders · `src/shared/data/admin.ts` · `src/features/admin/**`
**Does NOT own:** `(admin)/layout.tsx`.

**Build in this order**
1. `admin.ts` — profiles / user_roles / cohorts / cohort_memberships / enrollments / support_issues / ratings + `transition_cohort`, `assign_enrollment`, `decide_enrollment`, `list_organization_member_profiles`
2. **Applications** — pending enrolment requests → approve (`decide_enrollment`) → assign to a cohort (`assign_enrollment`) → reject with a reason. **Build first: WF-1 is blocked without it, and WS-1 and WS-3 need it to test end to end.**
3. **User list** — `DataTable` (name, email, role badge, status, last login), search + role filter
4. **User detail** — profile, role change, password reset, activate/deactivate, enrolments. Every destructive action behind `ConfirmDialog`.
5. **Create user** — email, name, role → **service-role, in a Server Action only**
6. **Groups** — cohort list → detail with members, trainer assignment, lifecycle (`transition_cohort`), schedule
7. **Issues** — `support_issues` inbox, status + priority triage, filters
8. **Ratings** — aggregate per course and per task, average + distribution, worst-rated first, free-text comments
9. **Settings** — roles reference, platform info, read-only display of the disabled providers
10. **Profile** — same pattern as WS-3

> ⚠️ **`SUPABASE_SERVICE_ROLE_KEY` must only ever be touched inside a Server Action or Route Handler.** If it reaches the client bundle, SEC-3 fails and the build does not ship. Verify before you finish:
> ```bash
> grep -r "service_role\|SERVICE_ROLE" .next-ws6/static/ && echo "FAIL" || echo "OK"
> ```

**Build order — the items below are last, so a handoff mid-workstream still leaves something coherent:** settings → static info page · ratings → simple average list · issues → read-only list, no triage · group schedule editing → drop
**Never cut:** applications, or user role change.

---

## 9. WAVE 2 — WS-7 Polish & integration ⛔ SERIAL, LAST · port 3107

Runs after all six Wave-1 chats have committed. **The only workstream with cross-cutting write access**, and only for fixes.

1. **Smoke + integration sweep** — `node scripts/smoke.mjs`, then click all 42 routes as all three roles. Log every break in `ISSUES.md`.
2. **The six E2E journeys** (MASTER_PLAN §14.5) — manually, end to end.
3. **Security gates** — SEC-1, SEC-2, SEC-3. **SEC-3 is a hard stop:** `grep -r "service_role" .next/static/` must return nothing.
4. **Responsive sweep** — every route at 375 / 768 / 1440. Zero horizontal scroll.
5. **Dark mode sweep** — every route. Zero invisible text.
6. **Accessibility** — keyboard through each role's main flow, focus visible, dialogs trap and release, alt text, form labels.
7. **Motion pass** — page transitions, list stagger, hover lift, skeletons. Consistent everywhere. Verify `prefers-reduced-motion`.
8. ⭐ **Consistency pass** — same spacing, same empty-state voice, same button hierarchy, same date format across all six workstreams' output. **This is where six chats stop looking like six chats.** Budget real time for it.
9. **Promote** anything a workstream built locally that belongs in `shared/ui` (likely `IframePanel`). Delete duplicates — if two chats built the same thing, keep the better one.
10. **Stub check** — any route still showing "Diese Seite wird gerade gebaut" is unfinished. List them in the release report; do not hide them.
11. **Performance** — `npm run build`, check bundle size, confirm heavy components are dynamically imported.
12. **Final report** — `plan/status/RELEASE.md`: what shipped, what did not, known bugs, next session's list.

---

## 10. Status file template

Copy into `plan/status/WS-<n>.md`, fill in as you go.

```markdown
# WS-<n> — <name>
Started: <time> · Port: 310X · Dist: .next-wsX · Account: <email>

## Routes
| Route | Built | Real data | Loading | Empty | Error | 375px | Dark | Keyboard |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| /example | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Data functions added
- `src/shared/data/<file>.ts` → listX(), getY(), doZ()

## Gates
- [ ] tsc --noEmit green
- [ ] next lint green
- [ ] node scripts/smoke.mjs green
- [ ] committed (paths: …)

## Deferred / not yet built
- …

## Still a stub
- …

## Issues found in someone else's area
- (also appended to ISSUES.md)
```

---

## 11. If something goes wrong

| Situation | Do this |
|---|---|
| `tsc` fails on a file you do not own | Do not fix it. Append to `ISSUES.md`, tell the coordinator, work on files that compile. |
| An RPC does not exist or has different arguments | Check `RPC_CONTRACTS.md`. If it is wrong there, append to `ISSUES.md` and query the table directly with RLS as a fallback. |
| A table returns zero rows for your role | RLS is doing its job. Append to `ISSUES.md`. Build the empty state and move on. |
| A tier-2/3 component has not landed yet | Check `WS-0.md`. Use the documented fallback (native `<dialog>`, plain `<video>`, inline confirm). Do not wait, do not build it in `shared/ui`. |
| You need a component that will never exist | Build it in **your own** `src/features/<yours>/`. Never in `src/shared/ui/`. |
| Weird "module not found" that makes no sense | Check you are using your own `NEXT_DIST_DIR`. Shared `.next` corruption is the usual cause. |
| Two chats built the same thing | WS-7 keeps the better one and deletes the other. Note it in `ISSUES.md`. |
| You are running low on context / near the token limit | **Stop adding features. Spend what is left on the handoff.** Commit what works, fill in the `RESUME HERE` block in your status file, list precisely what is done and what is next. [04_PROMPTS_AND_HANDOFF.md](04_PROMPTS_AND_HANDOFF.md) §4. |
| Git says your file was modified by someone else | **Stop. Do not resolve it yourself.** Tell the coordinator. Someone violated §1. |
| Files disappear from disk | OneDrive. `git checkout -- <path>`, then tell the coordinator to pause sync immediately. |
