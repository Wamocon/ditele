# WS-9 — Sandbox engine (Bug Arena, Wave B)

## RESUME HERE
Updated: 2026-07-21 · Chat: #1 for this workstream

**State:** DONE — engine, authoring contract and one reference scenario built,
seeded to the live database, and verified in a real browser at 72/72 mechanical
checks. `npm run verify` green, `scripts/smoke.mjs` 42/42.

**One box is deliberately left open, and it needs a person, not a chat:** the
last item on the visual-correctness checklist — *a colleague told "there are no
bugs in this build" finds nothing*. Everything a script can check is checked;
that box is the real test and it needs a second pair of eyes on
`/de/arena/sandbox/checkout-v1?draft=1&defects=off`.

**Done and committed:**

| Commit | What |
|---|---|
| `de855de` | The engine — config schema, defect runtime, surface registry, the route, capture-region |
| `dee3a4c` | The reference scenario `checkout-v1`, the seed generated from it, and its consistency check |
| `8533bd3` | `README.md` (the authoring contract) and `ws9-visual-check.mjs` |
| _this one_ | The I-050 workaround, the seeded check, and the handoff |

**Half-finished:** nothing.

**Next, for whoever picks this up:**
1. **Nothing in WS-9 is outstanding.** Wave B's other half (WS-10) may proceed.
2. Two defects outside this tree block the *integrated* experience and are the
   first things WS-13 should do — **I-049** and **I-050** below. Neither blocks
   WS-10, and the sandbox works standalone today.
3. Get the human checklist box ticked before a real cohort sees a hunt.

**Blocked on:** nothing.

---

## ⚠️ Read this before touching the sandbox or running its checks

### The two defects that shape everything here — both outside WS-9's tree

**I-050 — no learner can read `hunt_scenarios`.** WS-8's
`hunt_scenarios_scoped_read` proves entitlement with an `exists` over
`public.tasks`. **A policy body is not `security definer`**, so `tasks`' own RLS
applies inside that subquery, and `RPC_CONTRACTS.md` §10 already records that a
student reads **0 rows** from `tasks`. So the `exists` is false for every
learner, always. Measured in one psql session as `role authenticated` with the
learner's `sub`:

| Query | Result |
|---|---|
| `app_private.can_access_cohort('01980a30-…')` | `t` |
| `select count(*) from public.cohorts` | 1 |
| `select count(*) from public.tasks where external_id='checkout-v1'` | **0** |
| `select count(*) from public.hunt_scenarios` | **0** |

As `postgres` the same join returns 1 row, so the join is right and only the
nested RLS is wrong. **It fails silently** — `getHuntScenarioByCode` returns
`null`, indistinguishable from "no such scenario".

*Worked around*, explicitly and reversibly: the route falls back to the shipped
scenario definition. The branch is commented and marked for deletion. **Cost,
stated plainly:** any signed-in learner can render any shipped scenario by
guessing its code rather than only the ones their cohort reaches. A scenario is
a fake shop with no learner data, so nothing leaks — but WS-8's intended
scoping is not in force and should not stay that way.

**I-049 — the task workspace cannot embed the sandbox.** `next.config.ts` sends
`X-Frame-Options: DENY` on every route, and `DENY` forbids framing even
same-origin. `?embed=1` is built and correct; the frame simply never loads.
Measured with a real iframe appended to a page already on the app origin, not
inferred from the config. One word to fix — `SAMEORIGIN` — but it is an
app-wide security header, so it is a decision, not a typo.

### Running the checks

```bash
NEXT_DIST_DIR=.next-ws9 DITELE_ARENA_AUTHORING=1 npx next build
NEXT_DIST_DIR=.next-ws9 DITELE_ARENA_AUTHORING=1 \
  DITELE_APP_ORIGIN=http://127.0.0.1:3109 \
  npx next start --hostname 127.0.0.1 --port 3109

node scripts/ws9-check-scenario.mjs                                    # no server needed
WS9_BASE_URL=http://127.0.0.1:3109 node --env-file=.env.local scripts/ws9-visual-check.mjs
WS9_BASE_URL=http://127.0.0.1:3109 node --env-file=.env.local scripts/ws9-check-seeded.mjs
```

⚠️ **Never rebuild while that server is running.** `next start` serves the
files it finds, so a rebuild under a live server produces a torn tree: 33 of 70
checks failed with impossible results — surfaces missing at one viewport only,
two builds rendering differently at rest — and none of it was real. Kill the
port first. This is WS-8's trap 4 in a different disguise, and it cost about
twenty minutes here too.

⚠️ **`next start`, never `next dev`** (RELEASE.md §7).

### Applying the seed

```bash
tr -d '\r' < supabase/seed_arena_scenarios.sql | ssh Nvidia-1 \
  'docker exec -i supabase_db_ditele-v2 psql -U postgres -d postgres -v ON_ERROR_STOP=1'
```
Already applied on 2026-07-21: `INSERT 0 1`, then
`NOTICE: scenario checkout-v1 v1 active, 4 planted defects`. The seed asserts
its own invariant — `expected_findings` equal to the number of planted defects
in the configuration it just wrote — so a silent mismatch is not possible.

---

## Delivered

| # | What | Verified by |
|---|---|---|
| 1 | `/[locale]/arena/sandbox/[scenarioId]` + `loading` + `error` + empty state | `ws9-visual-check` · `ws9-check-seeded` |
| 2 | The defect registry is **data** — scenario config drives behaviour, no branch on a scenario code exists anywhere | `registryMismatches()` · `parseScenarioConfiguration` |
| 3 | `README.md` — the authoring contract, all six required sections plus the two open defects | — |
| 4 | One reference scenario exercising every claimed capability | `ws9-check-scenario` prints the kinds and triggers it covers |
| 5 | Capture-region, with the seam WS-10 mounts | manual; `getDisplayMedia` needs a user gesture |

### The reference scenario — `checkout-v1`

Four planted defects, one decoy, one known non-bug. It uses **all three**
trigger types and **all three** defect kinds, which is the contract's own test:
a contract that documents a capability the reference scenario does not use has
not proven it.

| Code | Kind | Trigger | What |
|---|---|---|---|
| `QTY_ACCEPTS_NEGATIVE` | planted · medium | always | the stepper's lower bound stops being enforced |
| `TOTAL_IGNORES_DISCOUNT` | planted · high | always | the discount line renders, the total does not subtract it |
| `SHIPPING_DOUBLE_COUNTED` | planted · critical | **afterSignals(3)** | shipping counted twice — *correct on load*, wrong after the learner has been working |
| `EMAIL_VALIDATION_BYPASS` | planted · low | **whenInput** | accepts a domain with no top-level domain, and only then |
| `SLOW_THUMBNAIL` | **decoy** | always | images resolve late. Odd-looking and entirely correct |
| `SHIPPING_NOT_FREE_BELOW_THRESHOLD` | **known non-bug** | — | no effect at all: a property of the design, recorded so a trainer answers it once |

## Migrations written
**None, and none were allowed** — WS-9's block is seeds only. Nothing here
needed a schema change, which is the point: adding scenario #4 must never need
one either.

## Data functions added
None. WS-8's `getHuntScenarioByCode` was the only read required.

## Gates

| Gate | Result |
|---|---|
| `npm run verify` | ✅ green — i18n, secrets, contrast, typecheck, lint (0 errors, 4 pre-existing warnings), 133 tests, build |
| `node scripts/smoke.mjs` | ✅ **42/42** against a production build on 3109 |
| `node scripts/ws9-check-scenario.mjs` | ✅ the seed and the source are byte-identical |
| `node scripts/ws9-visual-check.mjs` | ✅ **72/72** — 3 viewports × 2 themes × defects on/off |
| `node scripts/ws9-check-seeded.mjs` | ✅ 3/3 route checks · WARN for I-050, by design |
| `npm run db:lint` | not run — **no migrations touched.** WS-8 also records it cannot pass as written (I-039) |

### The visual-correctness checklist, box by box

| Box | Result |
|---|---|
| 375 / 768 / 1280, no horizontal scroll | ✅ measured, 0px at every combination |
| light **and** dark, no invisible text | ✅ computed colour vs walked-up background, every text node |
| no layout shift on load | ✅ CLS = 0.0000 |
| visible focus state · 44px touch targets | ✅ global `:focus-visible` + measured heights at 375 and 768 |
| no console errors, no failed requests | ✅ (the `/learn/arena` 404 is WS-11's unbuilt route, I-043, and app-wide) |
| German at full length | ✅ the scenario uses real long compounds, not placeholders |
| **defects on ≡ defects off until the learner acts** | ✅ identical at all six combinations |
| each planted defect observable, and absent from the clean build | ✅ all four, with the arithmetic checked |
| **a colleague finds nothing** | ⏳ **needs a person.** Not automatable, and it is the real test |

## Deferred / not built
- **A catalogue of scenarios.** Deliberate, and the workstream brief is
  explicit: WS-9 ships the engine and *one* reference scenario. Scenario #4 is
  a `.json` file, a seed row and the checklist — §3 of the README.
- **Capture inside the practice frame.** Blocked by I-049 and unnecessary: the
  capture is initiated top-level, which is where WS-10's defect form is anyway.
- **A scenario index/browse route.** Not asked for; `?draft=1` covers authoring.

## Issues found in someone else's area → all appended to ISSUES.md
- **I-046** — resolves WS-10's I-044 (my own uncommitted zod-4 errors; fixed).
- **I-047** — `iframe-panel.tsx` has no `allow="display-capture"`. Informational:
  the capture runs top-level instead, so nothing is blocked.
- **I-048** — the hunt task's `target_url` is NULL, so a learner cannot reach
  the sandbox from the task. The exact value is in the seed's footer.
- **I-049** — `X-Frame-Options: DENY` blocks same-origin framing.
- **I-050** — `hunt_scenarios_scoped_read` can never be true for a learner.

## Things I learned that are written down nowhere else

- **A Postgres RLS policy body is not `security definer`.** An `exists` over
  another table inside a policy is evaluated under *that* table's RLS as well.
  WS-8's scenario policy joins through `tasks`, which learners cannot read, so
  it can never be true for the role it was written for — and it fails by
  returning an empty set, which every caller reads as "not found". This is the
  single most expensive shape of bug in this codebase and it now has two
  instances (I-050 here, `bug_categories` in WS-10's I-045). **Any new policy
  that references another table should be reviewed for it.**

- **A planted bug can be arithmetically unfindable, and only a browser says
  so.** `SHIPPING_DOUBLE_COUNTED` doubled a shipping cost that was already zero,
  because the cart's subtotal sat above the free-shipping threshold. It
  type-checked, it seeded, the configuration was valid, and no learner could
  ever have found it. **Every planted defect needs a test that observes it
  through the UI**, not merely a scenario that declares it.

- **Comparing two builds only means something if the interactions are
  identical.** The first defect probe drove all four defects down one page and
  compared totals — but the armed build could push a quantity negative and the
  clean build could not, so by the coupon step the two carts held different
  goods and the comparison was noise that happened to pass. Four isolated
  probes now, one per defect, each on a fresh page.

- **`z.record(z.unknown())` is a compile error in zod 4** — it wants
  `z.record(z.string(), z.unknown())`, and the one-argument form yields
  `Record<string | number | symbol, unknown>`, which then fails somewhere else
  entirely. Four of my errors traced to that one call shape.

- **Format money by hand, not with `Intl`.** `Intl.NumberFormat("de-DE", …)`
  emits a narrow no-break space before the € on some ICU builds and an ordinary
  one on others, so server and client renders can differ by one invisible
  character. React then reports a hydration mismatch **on a price**, which
  reads exactly like a planted bug. `cart.ts` formats by hand for that reason.

- **`page.evaluate(someFunctionSourceString)` silently returns `undefined`.**
  Playwright evaluates a string as an *expression*, so a string containing
  `() => {…}` evaluates to a function object, which is not serialisable. It has
  to be `(${source})()`. The failure looks like the page returning nothing.

- **The sandbox uses no image files, on purpose.** A broken or missing `<img>`
  is a defect a learner would report, and it is not one we planted. Thumbnails
  are token-coloured tiles with the article's initials.

- **`?embed=1` rather than sniffing `window.top`.** Whether to cover the DiTeLe
  shell has to be known on the *server*, at the first byte. Deciding it in the
  browser means a hydration flash, and "no layout shift on load" is on the very
  checklist the decision exists to satisfy.
