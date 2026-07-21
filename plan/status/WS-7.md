# WS-7 — Polish & Integration (Wave 2)

Started: 2026-07-21 · Port: 3107 · Dist: `.next-ws7` (dev) / `.next` (prod build) · Accounts: all four

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1**

**State:** IN PROGRESS — steps 1–3 done, sweep running.

> ### For the coordinator, in one paragraph
> The three hard stops are being driven off a **production build**, not the dev
> server, because Turbopack wedges on this machine (see "Things I learned").
> `node scripts/smoke.mjs` is **47/47 green**, `npx tsc --noEmit` and
> `npx eslint .` are green, `npx next build` is green, and **SEC-3 passes at the
> value level** — not just the documented literal grep, which WS-6 correctly
> warned proves nothing. Steps 4–7 are being measured by a new Playwright sweep
> (`scripts/ws7-sweep.mjs`) rather than eyeballed, because every Wave-1 chat
> marked its 375px / dark / keyboard columns unverified.

**Done and committed:**

| Step | What |
|---|---|
| 0 | Baseline gates; killed five stale Wave-1 dev servers that were starving the box |
| 1 | Smoke 47/47 against a production build; `/de/login` dev hang diagnosed as Turbopack, not app code |
| 3 | SEC-1 / SEC-3 verified — SEC-3 by grepping the **key's value**, not the string `service_role` |
| 8a | One date voice: `src/shared/format.ts`, all six workstream helpers repointed at it |
| — | I-025 closed: `[locale]/not-found.tsx` boundary works, `/catalog/[slug]` restored to a real `notFound()` (was a soft 200) |
| — | I-027 closed: dark-mode `--color-brand-fg` fix verified by `scripts/check-contrast.mjs` — 46 pairs, 0 below AA |

**Half-finished:**
- `scripts/ws7-sweep.mjs` written and running; findings not yet triaged.

**Next, in order:**
1. Triage the sweep's OVERFLOW / INVISIBLE / TAP-TARGET / FOCUS findings and fix.
2. Steps 2 (E2E journeys), 9 (promote duplicates), 10 (stub check), 11 (perf).
3. `plan/status/RELEASE.md`.

**Things I learned that are written down nowhere else:**

1. 🚨 **The dev server is not a usable test target on this machine.** Turbopack
   compiled `/[locale]` in 6 s and `/[locale]/403` in 74 s, then stopped
   compiling entirely: already-cached routes kept serving in <100 ms while
   `/de/login`, `/de/register` and `/de/403` hung **past 400 s** with no compile
   log line. `smoke.mjs` therefore appears to hang at guest route 9 of 47.
   **It is not an app bug** — the same routes serve in 20–50 ms from
   `npx next build && npx next start`. This is the same class as WS-6's note 3
   (Turbopack exhausting the Windows thread pool). **WS-7 and anyone verifying
   anything should build and `next start`, never sweep against `next dev`.**
2. **Five Wave-1 dev servers were still running** on 3101–3104 and 3106 after
   their chats finished, which is what pushed this machine over the edge.
   Kill them before starting Wave 2.
3. ⭐ **SEC-3's documented command is not the real check.** `grep -r "service_role"
   .next/static/` passes trivially — the string never appears in client code
   even when a key leaks, because the key is a JWT. The check that means
   something is to read `SUPABASE_SERVICE_ROLE_KEY` out of `.env.local` into a
   shell variable and grep the **value**. Done, and it passes; the value is
   absent from `.next/static/` and, in fact, from `.next/` entirely — it is read
   from the environment at runtime and never inlined.
4. **`npx eslint .` fails from the Bash tool** on this box ("The system cannot
   execute the specified program") but works from PowerShell. Not a lint error.
5. **The Edit tool wrote a NUL byte** into `src/features/admin/format.ts` in place
   of a space, which made the file unmatched by every subsequent edit and made
   `file` report it as `data`. If an edit "cannot find" text you can plainly see,
   run `cat -A` on it. Rewriting the file with Write fixed it.

**Blocked on:**
- Nothing.

---

## Hard stops (02_WORKSTREAMS §9)

| Gate | Status | Evidence |
|---|---|---|
| `node scripts/smoke.mjs` fully green | ✅ **47/47** | against `next start`, production build |
| `grep -r "service_role" .next/static/` returns nothing | ✅ **PASS** | plus the value-level check in §3 above |
| Every route at 375px, no horizontal scroll | ⏳ measuring | `scripts/ws7-sweep.mjs` |
| Every route in dark mode, no invisible text | ⏳ measuring | `scripts/ws7-sweep.mjs` |

## Gates

- [x] `npx tsc --noEmit` green
- [x] `npx eslint .` green (1 pre-existing warning in `scripts/ws5-probe3.mjs`)
- [x] `npx next build` green
- [x] `node scripts/smoke.mjs` green — 47/47
- [x] `node scripts/check-contrast.mjs` green — 46 pairs, 0 below AA
- [ ] `node scripts/ws7-sweep.mjs` green
- [x] `node scripts/check-client-secrets.mjs` green — 314 files
- [ ] `npm run i18n:check` — **red by design**, see below

### `i18n:check` is red and that is expected, not a defect
`de.json` carries **1169 keys that `en.json` and `ru.json` do not have**, because
the build rule was "write German only; EN and RU get one translation pass at the
end" (MASTER_PLAN §11.0). The script compares every locale against `en.json`, so
German being *ahead* reads as a failure. `de: missing=none` — nothing is absent,
only extra. The EN/RU pass is P1 and is listed in `RELEASE.md`.

## Files WS-7 changed

- `src/shared/format.ts` — **new.** One date/number voice for the whole app.
- `src/features/{learning,questions,review,admin}/format.ts`,
  `src/features/content/i18n.ts`, `src/app/[locale]/(public)/_lib/format.ts` —
  repointed at it; exported APIs unchanged, so no call site moved.
- `src/app/[locale]/(public)/catalog/[slug]/page.tsx` — real `notFound()`.
- `scripts/ws7-sweep.mjs` — **new.** The responsive / dark / a11y measurement.
