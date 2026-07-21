# The Bug Arena sandbox — authoring contract

> **This file is a deliverable, not a nicety.** WS-9 built the *engine*. The
> real buggy screens are authored later, one brief at a time, by someone who
> was not in the chat that built it. This document is what makes scenario #4 a
> one-afternoon job.
>
> **The rule that decides whether this workstream succeeded:** adding a
> scenario is *data*, plus a component only when the scenario needs a screen we
> do not have. **If a new scenario cannot be added that way, that is a defect
> in WS-9** and it belongs in `plan/status/ISSUES.md`, not in a workaround.

---

## 1. What a scenario is

A scenario exists in **two places, deliberately**:

| | Where | What it is for |
|---|---|---|
| the **definition** | `scenarios/<code>.json` | what the sandbox renders. Ships with the app |
| the **row** | `public.hunt_scenarios` | ground truth for grading (WS-10's panel, `hunt_findings.planted_code`) and the authorization scope |

They cannot drift: `supabase/seed_arena_scenarios.sql` is generated from the
JSON and `scripts/ws9-check-scenario.mjs` diffs the two. The route prefers the
row and falls back to the definition — see §9 for why that fallback exists
today and when to delete it.

The row:

| Column | What |
|---|---|
| `code` | the handle a hunt task points at (`tasks.source_system='arena'` + `tasks.external_id`) |
| `scenario_version` | bump to publish a change without disturbing learners mid-hunt (§7) |
| `title`, `description` | **GERMAN.** Course material — `CONTENT_LOCALES === ["de"]` |
| `configuration` | the document described below |
| `expected_findings` | how many **planted** defects must be found. Decoys never count |
| `state` | `active` for a scenario learners may reach |

A hunt task is an ordinary task with `task_kind='hunt'`. Everything after the
learner clicks — attempt, report, review, unlock — is the machinery that
already shipped. The sandbox only renders the application under test.

### The language rule, which is easy to get wrong

| | Language | Where it comes from |
|---|---|---|
| The chrome around the sandbox — "Testumgebung", the capture button, error and empty states | **de + en + ru** | `arena.sandbox.*` in `messages/de.json`, via `i18n.ts` |
| Everything inside the application under test — product names, prices, form labels, the scenario description | **German only** | the scenario's `configuration` and its `title`/`description` |

`CONTENT_LOCALES === ["de"]` (`src/features/content/model.ts`). A learner
reading an English checkout and reporting the German copy as a bug is a false
report, and a false report costs a trainer a real review.

---

## 2. The `configuration` document

```jsonc
{
  "engineVersion": 1,          // only 1 exists; the engine refuses anything else
  "appName": "…",              // GERMAN. The heading above the sandbox
  "store": { },                // shared, mutable data — §2.2
  "surfaces": [ ],             // what renders — §2.1
  "defects": [ ]               // what is wrong with it — §2.3
}
```

The complete worked example is `scenarios/checkout-v1.json`. Read it beside
this section; everything below is that file, explained.

### 2.1 `surfaces[]` — what renders

```jsonc
{
  "id": "summary",                       // scenario-local handle; defects point at it
  "component": "checkout/cart-summary",  // a key in registry.ts
  "column": "aside",                     // "main" (wide) | "aside" (narrow, lg and up)
  "content": { "heading": "Bestellübersicht", "couponCode": "WMC10" }
}
```

`content` is that surface's **static German copy and settings**. Every surface
component declares its own `content` schema with sensible German defaults, so
you only write the fields you want to change. Look at the `ContentSchema` at
the top of the component.

Below `lg` every surface stacks in declaration order; the `main`/`aside` split
only applies from `lg` up.

> **The test of whether you have understood this section:** two scenarios
> sharing one component with different planted bugs and different copy. If
> adding a scenario means editing a component, the design has drifted.

### 2.2 `store` — shared, mutable data

The scenario's initial state for anything **more than one surface** touches.
`checkout/line-item` writes `checkout.lines`; `checkout/cart-summary` reads it.
Neither imports the other — they meet at a store key, declared in
`surfaces/checkout/cart.ts`.

Seed it here rather than letting a surface publish it on mount: state that
arrives in an effect makes the summary render a zero total and then jump, and
"no layout shift on load" is on the checklist in §5.

### 2.3 `defects[]` — what is wrong with it

```jsonc
{
  "code": "SHIPPING_DOUBLE_COUNTED",   // SCREAMING_SNAKE_CASE, unique in the scenario
  "kind": "planted",                   // planted | decoy | known_non_bug
  "severity": "critical",              // low | medium | high | critical
  "surface": "summary",                // one of surfaces[].id
  "effect": "shipping-double-counted", // a behaviour the component supports
  "trigger": { "type": "afterSignals", "signal": "quantity-changed", "count": 3 },
  "params": { "factor": 2 },           // knobs handed to the effect
  "reproduction": "…",                 // GERMAN, trainer-facing ground truth
  "expected": "…"                      // GERMAN, what should have happened
}
```

**`code` is forever.** A trainer confirms it into `hunt_findings.planted_code`,
which outlives the scenario version. Never recycle a code to mean something
else.

`reproduction` and `expected` are the ground truth WS-10's trainer panel shows
(decision D2 — the mitigation for the trainer-load risk). Write them as if for
a trainer who has never seen the scenario, because that is who reads them.

#### The three kinds

| `kind` | Counts towards `expected_findings` | Why it exists |
|---|:--:|---|
| `planted` | **yes** | a real defect. Finding it is the point |
| `decoy` | no | odd-looking and **correct**. A hunt where everything odd is a bug teaches students to report noise; real testing is mostly deciding what is *not* worth a ticket |
| `known_non_bug` | no | behaviour students report over and over that we have ruled correct. Recorded so a trainer answers it once, here, instead of once per learner forever. May carry **no effect at all** — often it is a property of the design |

**Every scenario should ship at least one decoy.** A scenario where every
observation is a finding does not teach judgement, and judgement is the skill.

#### The three triggers

| `trigger` | Armed when | Use it for |
|---|---|---|
| `{"type":"always"}` | from first render | the ordinary case |
| `{"type":"afterSignals","signal":"…","count":n}` | the named signal has fired *n* times | **stateful** bugs |
| `{"type":"whenInput","field":"…","pattern":"…"}` | the named field matches the regex (case-insensitive) | input-dependent bugs |

**At least one stateful defect per scenario.** Stateful bugs are the whole
reason to own the sandbox in React rather than serve static HTML, and they are
the ones that teach a tester to keep looking after the first pass. A signal
name is whatever the surface component reports — grep the component for
`signal(` to find what it offers.

---

## 3. Adding a scenario — the repeatable task

Once WS-9 is `DONE`, a new scenario is **not** a workstream:

1. **Brief.** The product owner writes what the screen is, what is broken, how
   to trigger it.
2. **Surfaces.** Author the component(s), *if the scenario needs new ones* — §4.
3. **Draft.** Copy `scenarios/checkout-v1.json`, edit it, register it in
   `scenarios/index.ts`.
4. **Preview**, with no database involved:
   ```bash
   DITELE_ARENA_AUTHORING=1 npm run build
   DITELE_ARENA_AUTHORING=1 DITELE_APP_ORIGIN=http://127.0.0.1:3109 \
     npx next start --hostname 127.0.0.1 --port 3109
   # then open
   #   /de/arena/sandbox/<code>?draft=1              the real thing
   #   /de/arena/sandbox/<code>?draft=1&defects=off  the clean baseline
   ```
   ⚠️ Use `next build` + `next start`, **not** `next dev` — Turbopack wedges on
   the build machine (`RELEASE.md` §7) and it looks exactly like an application
   bug.
5. **Run the checklist in §5.** All of it, including the last box.
6. **Seed.** Paste the JSON into `supabase/seed_arena_scenarios.sql` and apply:
   ```bash
   tr -d '\r' < supabase/seed_arena_scenarios.sql | ssh Nvidia-1 \
     'docker exec -i supabase_db_ditele-v2 psql -U postgres -d postgres -v ON_ERROR_STOP=1'
   ```
   `tr -d '\r'` matters — CRLF checkouts break the SQL — and so does piping
   over stdin rather than quoting it into `psql -c`.
7. **Prove it:** `node scripts/ws9-check-scenario.mjs`. It diffs the seed
   against the JSON and re-runs the engine's validation.
8. **Point a hunt at it:** a task with `task_kind='hunt'`,
   `source_system='arena'`, `external_id=<code>`, and
   `target_url=/de/arena/sandbox/<code>?embed=1`.

**No migration. No engine change. No touching WS-8's schema.**

---

## 4. Adding a surface component

Only when a scenario needs a screen that does not exist. Three files, and the
engine enforces that all three agree:

1. **The component**, in `surfaces/<family>/<name>.tsx`. It takes
   `SurfaceProps` (`{ surfaceId, content }`), parses its own `content` with a
   zod schema that has German defaults, and asks
   `useSurface(surfaceId).armed("effect-name")` whether each of its effects is
   on.
2. **`surface-effects.ts`** — the effects it supports, under its registry key.
3. **`registry.ts`** — the key → component mapping.

`registryMismatches()` fails loudly if 2 and 3 disagree, and
`parseScenarioConfiguration` refuses a scenario that arms an effect a component
does not declare. **An unknown effect is an error on the screen, never a bug
that silently never appears** — which is the single most expensive outcome
here, because a missing bug looks exactly like a learner who did not find it.

### How to write an effect

The component owns *how* the wrong behaviour looks; the scenario owns *whether*
and *when*. A surface never learns which defect it is carrying.

```tsx
const allowsNegative = surface.armed("quantity-allows-negative");
// …
quantity: allowsNegative ? next : Math.max(1, next)
```

Two rules, both learned from the checklist in §5:

- **Change a term, not a branch.** An effect that renders *different markup*
  changes the layout, and a layout difference between the clean build and the
  broken one is a second, unplanted defect. `checkout/cart-summary` computes
  its total as one expression and each defect removes or duplicates one term of
  it.
- **No clock, no randomness.** `isTriggerSatisfied` is deterministic on
  purpose. Two renders of the same scenario with the same interactions must be
  identical, or "diff the two renders" in §5 means nothing.

To make a defect stateful, call `surface.signal("some-name")` on the relevant
interaction and let the scenario decide the count.

### Adding a trigger type

The one place a new *category* of bug touches code: extend the union in
`model.ts` (`TriggerSchema`) **and** `isTriggerSatisfied` below it. Both, in
the same commit — the schema accepting something the evaluator ignores is a
defect that never arms.

---

## 5. ⭐ The visual-correctness checklist

**The sandbox must be pixel-perfect except for the planted defect.** This is
the rule the whole feature rests on and it is easy to underrate.

A student cannot tell "this is the bug I was sent to find" from "this screen is
just broken". Every unintentional visual defect becomes a false bug report, and
every false report costs a trainer a real review — precisely the cost decision
D2 exists to control. **A sloppy sandbox does not merely look bad; it
multiplies load on the one human bottleneck in the system.**

A scenario is not shippable until, **with all defects disabled**
(`?draft=1&defects=off`, or `?defects=off` once seeded):

- [ ] renders correctly at **375px, 768px and 1280px**, no horizontal scroll
- [ ] renders correctly in **light and dark** mode, no invisible text
- [ ] **no layout shift on load**, no overlapping elements, no clipped labels
- [ ] every interactive element has a **visible focus state** and a **44px**
      touch target
- [ ] **no console errors**, no failed network requests
- [ ] **German content at full length.** German compounds overflow buttons that
      English fits fine — test with the longest real string, never a short
      placeholder. The interface chrome around the sandbox still switches
      de/en/ru, so check the frame in all three even though the content stays
      German
- [ ] **a colleague told "there are no bugs in this build" finds nothing**

Then, **with defects enabled**, exactly the planted ones are observable and
nothing else moved. Diff the two renders if you can.

`node scripts/ws9-visual-check.mjs` automates the mechanical boxes across both
themes, three viewports and both defect states. **The last box it cannot
automate, and it is the real test.** Budget for a second person.

---

## 6. Screenshots — capture-region

`SandboxCaptureButton` grabs the sandbox's rectangle as a PNG.

```tsx
<SandboxCaptureButton
  strings={sandboxStrings(locale)}
  scenarioCode={scenario.code}
  onCapture={({ blob, fileName }) => attachToReport(blob, fileName)}
/>
```

Without `onCapture` it shows the shot and offers a download, which is what the
sandbox route does today.

Three things worth knowing before changing any of it:

- **Same-origin is the precondition.** Decision D1 put the sandbox in our own
  app; a cross-origin frame cannot be read from JavaScript at any price. **No
  sandbox route may load its content from another origin.**
- **It is `getDisplayMedia`, not a DOM-to-image library**, because no new npm
  dependency is allowed — and because a hand-rolled serialiser renders the
  sandbox *slightly* wrong, which is the one thing this workstream cannot
  afford. The cost is a permission prompt.
- **It runs in the top-level document**, not inside the frame:
  `getDisplayMedia` in an iframe needs `allow="display-capture"`, which
  `iframe-panel.tsx` does not set and WS-9 may not edit (`ISSUES.md` I-047).
  The sandbox posts its rectangle to the parent
  (`ditele.arena.sandbox.region`) so the parent can crop without reaching into
  a DOM it does not own.

---

## 7. Versioning a scenario

`hunt_scenarios` is unique on `(code, scenario_version)`, and the seed upserts
on that pair.

- **Fixing a typo, a colour, a label** → same version, re-run the seed.
- **Changing which defects are planted, or how they behave** → **new
  `scenario_version`.** A learner mid-hunt against v1 is being graded against
  v1's ground truth, and `hunt_findings.planted_code` rows already written
  refer to it. Silently changing the answers under them is how a student gets
  marked wrong for finding what was there when they looked.

`getHuntScenarioByCode` returns the highest **active** version, so publishing
v2 is: seed v2 as `active`, then set v1 to `inactive` once nobody is mid-hunt.

---

## 8. Files, and which of them you will actually touch

| File | You touch it when |
|---|---|
| `scenarios/*.json` | **every scenario** |
| `scenarios/index.ts` | every scenario — one line to register the draft |
| `supabase/seed_arena_scenarios.sql` | every scenario |
| `surfaces/<family>/*.tsx` | only a scenario needing a new screen |
| `surface-effects.ts`, `registry.ts` | only alongside a new surface or effect |
| `model.ts` | only a new trigger type — §4 |
| `defect-context.tsx`, `sandbox-runtime.tsx`, `capture.ts` | **never**, in the normal course of authoring. If you must, that is `ISSUES.md` |

---

## 9. Two open defects you will meet, both outside this tree

Neither is fixable from `features/arena/sandbox/**`. Both are measured, not
inferred, and both are in `plan/status/ISSUES.md` with the exact remedy.

### I-050 — a learner reads zero rows from `hunt_scenarios`

`hunt_scenarios_scoped_read` proves entitlement with an `exists` over
`public.tasks`. A policy body is not `security definer`, so `tasks`' own RLS
applies inside it — and a learner reads **0 rows** from `tasks`
(`RPC_CONTRACTS.md` §10). The `exists` is false for every learner, always, and
it fails *silently*: the read returns `null`, which the caller cannot tell from
"no such scenario".

**Until it is fixed**, the sandbox route falls back to the shipped definition,
which is why §1's two-places split is load-bearing rather than decorative. The
cost: any signed-in learner can render any shipped scenario by guessing its
code. A sandbox holds no learner data, so nothing leaks — but the scoping WS-8
intended is not in force. **When the policy is fixed, delete the fallback
branch in the route**; it is marked. `scripts/ws9-check-seeded.mjs` prints the
current state on every run, so the day it flips you will see it.

### I-049 — the task workspace cannot embed the sandbox

`next.config.ts` sends `X-Frame-Options: DENY` on every route, which forbids
framing even same-origin. `?embed=1` is built and correct; the frame simply
never loads. The standalone route is unaffected. One word — `SAMEORIGIN` — but
it is an app-wide security header and changing it is a decision someone should
make on purpose.
