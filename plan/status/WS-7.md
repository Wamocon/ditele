# WS-7 — Polish & Integration (Wave 2)

Started: 2026-07-21 · Port: 3107 · Account: all four · **Verified against a production build, not `next dev`**

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1**

**State:** ✅ **DONE.** All four hard stops pass. `plan/status/RELEASE.md` is written.

> ### For the coordinator, in one paragraph
> **All four hard stops are green.** `smoke.mjs` 47/47; `grep -r "service_role"
> .next/static/` returns nothing (and so does a grep for the key's actual
> *value*, which is the check that means something); **zero horizontal scroll**
> and **zero invisible text** across 282 route × viewport × theme combinations,
> measured in a real browser rather than eyeballed. The headline find is that
> **all 767 design-token references in the app were dead CSS** — Tailwind v4
> dropped the `[--var]` syntax, so the WAMOCON red had never rendered anywhere,
> in any browser, at any point in the build. It renders now. Read
> `plan/status/RELEASE.md` for the full picture including what did not ship.

**Done and committed:**

| Commit | Step | What |
|---|---|---|
| `8e85f19` | 1, 3, 8a | Smoke 47/47 · SEC-1/SEC-3 · one date voice · I-025 + I-027 closed |
| `27e9a57` | 4, 5 | ⭐ 767 dead design tokens → Tailwind v4 paren syntax |
| `7bfbb80` | 6, 9 | 44px touch targets · one merged `ConfirmDialog` · 53 dead directories |
| `ccf6bba` | 5, 8 | Dark-mode danger contrast (`--color-danger-fg`) · German voice outliers |
| (final) | 2, 10–12 | Auth-logo tap target · `RELEASE.md` · ISSUES I-029…I-035 |

**Half-finished:**
- Nothing.

**Next, in order:** see `plan/status/RELEASE.md` §8. The top item by a wide
margin is the **EN + RU translation pass** (1169 keys), which should also absorb
the six duplicate i18n accessors (I-017) and the hardcoded German in shared
components (I-035).

**Things I learned that are written down nowhere else:**

1. 🚨 **Tailwind v4 silently killed every design token.** `bg-[--color-brand]`
   was v3 shorthand; v4 reads brackets as a literal arbitrary value and emits
   `background-color: --color-brand`, which the browser drops. The v4 form is
   `bg-(--color-brand)`. 767 references, 105 files, all dead. **Nothing in the
   build could have caught it** — it is a string in a `className`, so `tsc`,
   `eslint` and `next build` are green either way; `smoke.mjs` asserts status
   codes; and `check-contrast.mjs` verifies the token *values* in `globals.css`,
   which were always correct and simply never applied. Only a browser measuring
   *computed* styles finds it. That is what `scripts/ws7-sweep.mjs` now does.
2. ⭐ **The six chats' honesty is the only reason this was findable.** Every
   Wave-1 status file marked its 375px and dark-mode columns ⚠️/◐/⬜/▲ rather
   than ticking them on the strength of "I only used design tokens". Had one
   chat ticked them, WS-7 would have trusted it and a brandless app would have
   shipped. **Reward that, and keep the convention.**
3. 🚨 **The dev server is not a usable verification target on this machine.**
   Turbopack compiled two routes then stopped: cached routes served in <100 ms
   while `/de/login` hung **past 400 s** with no compile log line. `smoke.mjs`
   looks like it hangs at guest route 9 of 47 and reads exactly like an app bug.
   The same routes answer in 20–50 ms from `next build && next start`. Build and
   `next start` for anything you intend to believe. (I-031)
4. **Five Wave-1 dev servers were still listening** on 3101–3104 and 3106 long
   after their chats ended, which is what tipped the machine over. Kill them
   before Wave 2.
5. **SEC-3's documented grep proves nothing** — the key is a JWT, so the string
   `service_role` never appears in client code even when a key leaks. Grep the
   key's **value**, read from `.env.local` into a shell variable. (I-030)
6. **A filled button's contrast pair is foreground-on-fill, not fill-on-page.**
   The plan's contrast table checked brand-on-background and passed; white on
   the dark-mode brand was 3.4:1 (I-027) and white on the dark-mode danger red
   was 2.47:1 (I-032). Both are now tokens with their own `-fg` and both are in
   `check-contrast.mjs` so they cannot regress.
7. **The Edit tool wrote a NUL byte** into `src/features/admin/format.ts` where a
   space was intended, which made every later edit fail to match text that was
   plainly visible and made `file` report the source as `data`. If an edit
   "cannot find" a string you can see, run `cat -A`. Rewriting with Write fixed it.
8. **`npx eslint .` fails from Git Bash** on this box ("The system cannot execute
   the specified program") but works from PowerShell. Not a lint error.

**Blocked on:**
- Nothing.

---

## Hard stops (02_WORKSTREAMS §9)

| Gate | Result |
|---|---|
| `node scripts/smoke.mjs` fully green | ✅ **47/47** |
| `grep -r "service_role" .next/static/` returns nothing | ✅ **zero matches**, plus the value-level check |
| Every route at 375px, no horizontal scroll | ✅ **0 findings / 282 combinations** |
| Every route in dark mode, no invisible text | ✅ **0 findings / 282 combinations** |

## All gates

- [x] `npx tsc --noEmit` green
- [x] `npx eslint .` green (1 pre-existing warning, `scripts/ws5-probe3.mjs`)
- [x] `npx next build` green — 2.0 MB static, largest chunk 304 KB
- [x] `node scripts/smoke.mjs` — 47/47
- [x] `node scripts/ws7-sweep.mjs` — **exit 0**: overflow 0 · invisible 0 · theme 0 · AA-text 0 · focus 0
- [x] `node scripts/check-contrast.mjs` — 48 pairs, 0 below AA
- [x] `node scripts/check-client-secrets.mjs` — 316 files
- [x] SEC-1 — student → `/trainer` + `/admin` = 307 → `/403`; trainer → `/admin` = 307 → `/403`; guest → all three = 307 → `/login`
- [x] SEC-3 — literal grep **and** key-value grep both clean
- [x] E2E-1 — all three roles land on their own dashboard
- [x] Stub check — **zero** routes still say "Diese Seite wird gerade gebaut"
- [x] No `TODO`, `FIXME`, `console.log`, `any` or `@ts-ignore` in shipped `src/`
- [ ] `npm run i18n:check` — **red by design.** `de.json` has 1169 keys `en`/`ru`
      lack because the build rule was "German only, one translation pass at the
      end". `de: missing=none` — nothing absent, only extra. P1.

## Remaining tap targets — 12, and why they are left

Down from 129. Every one is an `<a>`, none is a button. The 24px ones are inline
text links inside sentences ("Passwort vergessen?", "Alle Kurse ansehen"), which
WCAG 2.5.8 AA explicitly exempts and which meet its 24×24 minimum; padding them
to 44px would break the sentences they sit in. The 42px ones are question-title
links that fill their whole card row. Fixed instead, in one place each: the
theme toggle, the header login link, the header and auth-page logo links, and
`Button size="sm"` — which alone accounted for ~8 findings across the app.

## Files WS-7 changed

- **New:** `src/shared/format.ts` (one date voice) · `src/shared/ui/confirm-dialog.tsx`
  (the WS-2 + WS-4 merge) · `scripts/ws7-sweep.mjs` (the regression net)
- **Fixed:** 105 files' token syntax · `button.tsx`, `globals.css`,
  `check-contrast.mjs` (danger fg) · `app-header.tsx`, `theme-toggle.tsx`,
  `(auth)/layout.tsx` (tap targets) · six workstream `format.ts`/`i18n.ts`
  (delegate to shared) · `catalog/[slug]/page.tsx` (real `notFound()`) ·
  `de.json` (3 voice outliers)
- **Deleted:** `features/learning/confirm-dialog.tsx`,
  `features/review/confirm-dialog.tsx`, 53 empty directories
