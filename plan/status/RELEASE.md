# DiTeLe V3 — Release Report

> Written by **WS-7 (Polish & Integration)**, 2026-07-21, at the end of Wave 2.
> This is the honest state of the build. **A hidden gap is worse than a listed
> one**, so everything known to be missing, broken or unverified is in here —
> including the things that make this report less flattering.

> ## ⚠️ Every number in this report describes commit `f3d8d13`, and only that commit
>
> **The working tree moved underneath this report while it was being written.**
> After `f3d8d13` was committed, another session began an uncommitted change in
> the same tree that, among other things:
>
> - **deletes the entire `/admin/groups` and `/trainer/groups` route trees**
>   (15 files, staged for commit), and edits `scripts/smoke.mjs` to stop
>   requesting them;
> - adds `src/shared/layout/account-menu.tsx`, `account-actions.ts` and
>   `src/shared/auth/identity.ts`, and rewires `app-header`, `app-shell`,
>   `nav-config`, `routes.ts` and all three role layouts to use them.
>
> It looks deliberate and coherent — it pairs with commit `2113f2b`
> ("course-based trainer assignment"), so it reads as cohorts being replaced by
> course-based assignment, which would be a sane answer to I-011 and I-012. It
> is **not** broken: `npx tsc --noEmit` is green on the working tree as it stands.
>
> But it is **uncommitted, in flight, and not verified by WS-7**. Concretely:
>
> - The counts below — **53 route files, 47 smoke-covered** — are `f3d8d13`'s.
>   If that work lands, both numbers drop and §2's table is wrong.
> - The smoke, sweep, SEC and contrast results below were measured against a
>   production build of `f3d8d13`. **They say nothing about the current tree.**
> - Per `02_WORKSTREAMS` §11, WS-7 did not resolve, revert or commit any of it.
>
> **Coordinator: whoever owns that change must re-run the gates before it lands,
> and §2 and §5 of this file need updating with it.** The commands are in §7.

---

## 1. The one-paragraph version

All **53 route files** across Guest / Student / Trainer / Admin are real pages —
**no stub survives**. `node scripts/smoke.mjs` is **47/47 green** against a
production build, `tsc`, `eslint`, `next build` and `check-contrast` are green,
and **SEC-3 passes at the value level**, not merely the documented literal grep.
A browser sweep across **282 route × viewport × theme combinations** finds
**zero horizontal scroll, zero invisible text, zero missing focus rings and zero
text below WCAG AA**. The single biggest find of this wave was that **every one
of the app's 767 design-token references was dead CSS** — the WAMOCON brand red
had never rendered in any browser, on any screen, at any point in the build. It
renders now. What is *not* done is honest and specific: EN and RU are
untranslated, three database capabilities have no write path, and six dynamic
detail routes are outside the smoke test's coverage.

---

## 2. What shipped

| Area | Routes | State |
|---|:--:|---|
| Public & Auth (WS-1) | 15 | ✅ real pages, real data |
| Student Core (WS-2) | 5 | ✅ incl. the task workspace, the product's centre |
| Student Plus (WS-3) | 8 | ✅ |
| Trainer (WS-4) | 11 | ✅ incl. review detail + rubric scoring |
| Admin Content (WS-5) | 6 | ✅ incl. the Content Studio and full lifecycle |
| Admin Ops (WS-6) | 11 | ✅ |
| **Total** | **53 files / 47 smoke-covered** | |

Working end to end against the live database: register → login → role dashboard ·
enrolment request → admin approve → assign to cohort → learner sees the course ·
start attempt → autosave → reload → draft survives → submit · trainer reviews
with rubric scores → decision → learner notified · student asks → trainer claims
and answers · admin authors a course through draft → review → approve → publish.

### Verified gates

| Gate | Result | How |
|---|---|---|
| `node scripts/smoke.mjs` | ✅ **47/47** | production build + `next start` |
| `npx tsc --noEmit` | ✅ green | |
| `npx eslint .` | ✅ green | 1 pre-existing warning in `scripts/ws5-probe3.mjs` |
| `npx next build` | ✅ green | 2.0 MB static, largest client chunk 304 KB uncompressed |
| `node scripts/check-contrast.mjs` | ✅ **48 pairs, 0 below AA** | |
| `node scripts/check-client-secrets.mjs` | ✅ green | 314 source files |
| **SEC-1** student → `/trainer`, `/admin` | ✅ 307 → `/403` | also trainer → `/admin`, and guest → all three → `/login` |
| **SEC-3** privileged key in client bundle | ✅ **absent** | see §3 — the documented command is not the real check |
| **RESP-1** 375 / 768 / 1440 | ✅ **zero horizontal scroll** | 282 combinations, measured |
| Dark mode | ✅ **zero invisible text**, zero theme failures | 282 combinations, measured |
| **A11Y-1** keyboard | ✅ **zero tab stops without a visible focus ring** | up to 40 stops per route |
| WCAG AA text contrast | ✅ **zero failures** | computed colour vs walked-up background |

---

## 3. ⭐ The find that mattered — 767 dead design tokens

**Every colour, radius, shadow, duration and layout token in the application was
a no-op for the entire build.** Tailwind v4 dropped the v3 `[--var]` shorthand
and now reads brackets as a literal arbitrary value:

```
class="bg-[--color-brand]"   →   background-color: --color-brand    ← invalid, dropped
class="bg-(--color-brand)"   →   background-color: var(--color-brand)
```

All 767 references across 105 files used the bracket form. The app rendered in
browser defaults plus whatever `body {}` set: primary buttons were transparent
with navy text instead of WAMOCON red, cards had no radius or elevation, and
`Button variant="danger"` was **white on white** — because `text-white` is a real
Tailwind class that applied while the background it was meant to sit on did not.

**Nothing in the build could have caught it.** `tsc`, `eslint` and `next build`
are all green either way — it is a string in a `className`. `smoke.mjs` asserts
status codes, not pixels. `check-contrast.mjs` verified the token *values* in
`globals.css`, which were always correct; they were simply never applied. And no
Wave-1 chat had a browser.

**The reason it was still findable at integration is that all six chats were
honest.** Every one of them marked its 375px and dark-mode columns ⚠️/◐/⬜/▲
rather than ticking them. Had any chat ticked those boxes on the strength of
"I only used design tokens", WS-7 would have trusted it and this would have
shipped. That is the single most valuable thing this build did.

Found by `scripts/ws7-sweep.mjs`, which measures computed styles in a real
browser. It flagged one button at a 1:1 contrast ratio; chasing that one button
led to the generated stylesheet.

### SEC-3's documented command does not test what it claims

`grep -r "service_role" .next/static/` passes trivially — the privileged key is
a JWT, so that string never appears in client code even when a key leaks. WS-6
flagged this and was right. The real check reads `SUPABASE_SERVICE_ROLE_KEY` out
of `.env.local` into a shell variable and greps for the **value**. Done: the
value is absent from `.next/static/`, and in fact from `.next/` entirely — it is
read from the environment at runtime and never inlined. The `DITELE_AUTH_RATE_LIMIT_HMAC_KEY`
value is likewise absent.

---

## 4. What WS-7 changed

| Commit | What |
|---|---|
| `8e85f19` | Smoke 47/47, SEC-3 by value, one date voice (`src/shared/format.ts`) |
| `27e9a57` | ⭐ 767 dead design tokens → Tailwind v4 syntax |
| `7bfbb80` | 44px touch targets, one merged `ConfirmDialog`, 53 dead directories removed |
| `ccf6bba` | Dark-mode danger-button contrast (`--color-danger-fg`), German voice outliers |

**Consistency pass.** Six workstreams produced three different dates for the same
instant — `21.07.2026`, `21. Juli 2026`, and `07/21/2026` under `/en` because two
of them passed a bare locale to `Intl` and got en-US. `src/shared/format.ts` now
owns the decision (de-DE / en-GB / ru-RU, day-first in every language); all six
helpers delegate to it with their exported APIs unchanged, so no call site moved.
German voice: the app addresses students informally ("du", 61 strings in `learn.*`)
and staff formally ("Sie", all of `trainer.*`, `adminOps.*`, `public.*`), which
reads as deliberate; three strings crossed the line and were fixed.

**Also closed:** I-025 (`[locale]/not-found.tsx` is the boundary `notFound()`
actually finds, so `/catalog/[slug]` returns a real 404 instead of a soft 200 that
search engines would have indexed) and I-027 (dark-mode brand foreground).

---

## 5. What did NOT ship

### 5.1 Blocked by the database — no write path exists

| # | Capability | Detail |
|---|---|---|
| I-011 | **Create a cohort** | `/admin/groups/new` renders an honest blocked notice. A migration (`20260721140000_cohort_insert_policy_fix.sql`) is **committed but WS-7 did not verify it is applied to the live database.** Re-probe before believing it is fixed. |
| I-012 | **Add a member or trainer to a cohort** | Only `assign_enrollment` creates a membership, and a trainer has no enrolment — so F52 has no path. Same caveat on the migration. |
| I-015 / I-028 | **Audit rows for 5 admin actions** | Role change, deactivate, password reset, user creation, cohort rename and issue triage cannot write `audit_events`. The `SECURITY DEFINER` RPCs write their own, so publish/archive/enrolment decisions *are* audited. |
| I-014 | **A learner cannot reply in a question thread** | No learner follow-up RPC exists. The thread is read-only with an explicit notice. |
| — | **Theory media** | `get_my_learning_task` exposes no `video_url`/`pdf_url`, so `VideoPlayer` and `PdfViewer` cannot be wired. Not a cut — a missing data source (I-010). |
| — | **Certificates, support issues** | 0 rows and no RPC creates either. Honest empty states. |

### 5.2 Deliberately deferred (P1)

- **EN and RU are untranslated.** `de.json` carries **1169 keys** the other two
  lack. `npm run i18n:check` exits 1 for exactly this reason — `de: missing=none`,
  only extra. Every locale currently renders German through per-workstream
  fallback dictionaries, so nothing shows a raw key, but `/en` and `/ru` are
  German pages with localised dates. **This is the largest single piece of
  remaining work.**
- Avatar upload (Storage unresolved), certificate download, rubric *comments*,
  admin "view as" impersonation, email delivery (no SMTP), Playwright E2E suite.
- Pagination is client-side in `listAdminCourses` / `listAdminTasks` /
  `listCatalogCourses` — correct at 4 courses, needs `.range()` at scale. The
  `limit`/`offset` arguments are already in the signatures.

### 5.3 Not done, and why — WS-7's own judgement calls

- **`IframePanel` was not promoted to `shared/ui`.** The plan expected it. Its
  signature takes WS-2's `LearnStrings` type and it has exactly one consumer, so
  promoting it would point `shared/ui` at a feature module to serve a single
  caller. The reason to promote — two chats building the same thing — never
  materialised. Left in `features/learning/`, deliberately.
- **Six i18n accessor helpers still exist**, one per workstream, all doing the
  same "German base, overlay the locale" job with five different APIs. They are
  correct and each is used only by its own tree. Consolidating them is a real
  cleanup but it is churn with no user-visible effect, and it should happen
  *with* the EN/RU translation pass, not before it (I-017).
- **Token classes could be shorter.** `text-(--color-fg-muted)` can be written
  `text-fg-muted` now that the tokens live in `@theme`. The paren form is
  correct and verified; the canonical form is cosmetic. Not worth a second
  767-site rewrite in the same session.

---

## 6. Known bugs and risks

| # | Severity | Issue |
|---|---|---|
| 1 | **Launch blocker** | `NEXT_PUBLIC_SUPABASE_URL` is `http://192.168.178.75:56721` — a private LAN address over plain HTTP. Real students cannot reach it and secure auth cookies will not persist. Infrastructure, not code. `01_LAUNCH_READINESS.md`. |
| 2 | **Launch blocker** | `/privacy` and `/legal` ship structurally complete with a visible notice that the mandatory company data (address, Vertretungsberechtigte, Handelsregister, USt-IdNr., DPO contact) is missing. **§5 DDG requires them.** Coordinator to supply; it is then a `de.json` edit (I-019). |
| 3 | **Launch blocker** | SMTP is unverified. `POST /auth/v1/recover` returns 200 but delivery was never confirmed, and `mailer_autoconfirm` is on. At 200 users, ~20 will be locked out in week one. |
| 4 | High | **A stale `p_expected_*_version` HANGS instead of erroring** (I-007/I-009). Kong 504s and the PostgREST pool is unusable for ~30 s, failing unrelated requests. Guarded in `content.ts` and `use-autosave.ts`; any *new* CAS call must guard too. A genuine database bug worth reporting upstream. |
| 5 | Medium | **6 dynamic detail routes are outside smoke's coverage**: `/trainer/submissions/[id]`, `/learn/questions/[id]`, `/admin/users/[id]`, `/admin/courses/[id]/versions/[id]`, `/learn/courses/[id]` variants, `/auth/callback`. They were exercised by hand by their workstreams and by WS-7's sweep, but a regression in one would not fail the automated gate. |
| 6 | Medium | **smoke.mjs cannot detect an empty page.** WS-3 hit a route that returned 200 with an empty `<main>` (a `"use server"` module exporting a non-function). Smoke greps for "Application error"; there was none. Worth adding a body-content assertion. |
| 7 | Low | `Button variant="danger"` uses `hover:brightness-110`, which *lightens* the already-light dark-mode pink. Contrast still passes; it is the wrong direction. |
| 8 | Low | Hardcoded German remains in three shared components: `ErrorState`'s "Erneut versuchen", `ThemeToggle`'s two aria-labels, `app-header`'s "Anmelden", and every label in `StatusBadge`. They break the "never hardcode a UI string" rule and will need routing through i18n during the EN/RU pass. |
| 9 | Low | Age badges (amber >24 h, red >72 h) have never been *seen* — all seeded submissions were created seconds apart and `created_at` is not writable. Logic exercised, colours not. |
| 10 | Low | Two Turbopack/Windows hazards, both environmental: `next dev` wedges on this machine (see §7), and six parallel dev servers exhaust the thread pool. |

---

## 7. ⚠️ For whoever verifies this next — read before you debug

**Do not sweep against `next dev` on this machine.** Turbopack compiled
`/[locale]` in 6 s and `/[locale]/403` in 74 s, then stopped compiling entirely:
already-cached routes kept serving in under 100 ms while `/de/login`,
`/de/register` and `/de/403` hung **past 400 seconds** with no compile log line.
`smoke.mjs` appears to hang at guest route 9 of 47 and looks exactly like an
application bug. It is not — the same routes answer in 20–50 ms from
`npx next build && npx next start`. Every number in this report was measured that
way. Five Wave-1 dev servers were also still running on ports 3101–3104 and 3106
after their chats finished, which is what pushed the machine over the edge; kill
them first.

```bash
npx next build && DITELE_APP_ORIGIN=http://127.0.0.1:3107 npx next start --hostname 127.0.0.1 --port 3107
SMOKE_BASE_URL=http://127.0.0.1:3107 node --env-file=.env.local scripts/smoke.mjs
WS7_BASE_URL=http://127.0.0.1:3107  node --env-file=.env.local scripts/ws7-sweep.mjs
node scripts/check-contrast.mjs
```

`scripts/ws7-sweep.mjs` is the regression net for everything in §2's bottom half.
It needs `npx playwright install chromium` once.

---

## 8. The next session's list, in order

1. **EN + RU translation pass.** One chat, from the complete `de.json`, filling
   `en.json` and `ru.json`. 1169 keys. Finish by making `npm run i18n:check`
   green and deleting the six per-workstream fallback dictionaries in favour of
   one shared accessor (I-017). This is the biggest remaining item.
2. **Verify the two new migrations are actually applied** to the live database,
   then build `/admin/groups/new` for real and add the cohort member + trainer
   pickers (I-011, I-012). The data layer is already shaped for it.
3. **The three launch blockers** in §6 — HTTPS domain, company legal data, SMTP.
   None is code; all three block real students.
4. **Harden the smoke test**: add the 6 uncovered dynamic routes, and assert that
   `<main>` is non-empty rather than only that "Application error" is absent.
5. **Route the remaining hardcoded German** (§6 item 8) through i18n — do it
   inside the translation pass, not separately.
6. P1 features: certificates, avatar upload, rubric comments, ratings from the
   submitted state, impersonation banner.
7. Push server-side pagination into the three client-side list queries.

---

## 9. Verdict

The practice loop — the thing MASTER_PLAN §1 calls the entire product — works:
a learner opens a task, sees the scenario beside a sandboxed test target, writes
a structured defect report, autosaves, reloads without losing it, submits, and a
trainer reviews it against a rubric in one screen. That loop is real, exercised
against the live database, and now it is also *branded*, responsive and readable
in both themes, which it demonstrably was not before this wave.

It is not shippable to 200 students yet, and the reasons are the three launch
blockers in §6 — none of which is application code. The application itself is in
good shape, and the gaps that remain are written down here rather than waiting to
be discovered.
