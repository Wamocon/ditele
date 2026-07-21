# Assignment board — who owns what, right now

> **Update this whenever you start, finish, or reassign a chat.** Ten seconds each time.
> This is the only place that tells you a workstream has silently died.
> **One owner per workstream at a time. Never two.**

Status values: `NOT STARTED` · `IN PROGRESS` · `DEAD (needs pickup)` · `HANDOFF READY` · `DONE`

---

## Phase 1 — V3 build ✅ COMPLETE

Shipped. See `plan/status/RELEASE.md` for the honest final state.

| WS | Scope | Status | Notes |
|---|---|---|---|
| **WS-0** | Foundation ⛔ gate | DONE | |
| **WS-1** | Public & Auth | DONE | |
| **WS-2** | Student Core ⭐ | DONE | |
| **WS-3** | Student Plus | DONE | |
| **WS-4** | Trainer | DONE | |
| **WS-5** | Admin Content | DONE | |
| **WS-6** | Admin Ops | DONE | |
| **WS-7** | Polish & Integration | DONE | `RELEASE.md` written, four hard stops green |

### Post-WS-7 work landed directly on main

Not part of any workstream. **Two of these changed rules the Arena phase depends on
— read them before starting WS-8.**

| Commit | What | Why it matters to the Arena phase |
|---|---|---|
| `8a507cb` | Course content is German-only | ⚠️ `CONTENT_LOCALES === ["de"]`. Hunt scenario titles/descriptions are course material → **German only**, not a three-locale jsonb |
| `ccbeb69` | i18n: German is source of truth, per-key fallback | ⚠️ `en`/`ru` keys are **optional**; a missing key falls back to German. `i18n:check` **fails** on stale keys and empty strings — never add blank placeholders |
| `b117929` | Removed content rating; task media with provider-aware video | |
| `e2478fc` | Header: notification bell + language switcher | Arena entry lands next to these |
| `872fb02` | Header account menu; "Gruppen" removed everywhere | |

---

## Phase 2 — Bug Arena ⬅ CURRENT

⛔ **A chain, not parallel lanes.** Only WS-9 ‖ WS-10 may run together.
See `plan/06_ARENA_WORKSTREAMS.md` §2. Prompts: `04_PROMPTS_AND_HANDOFF.md` §2.4 / §2.5.

| WS | Scope | Wave | Status | Chat / account | Blocked until |
|---|---|---|---|---|---|
| **WS-8** | Foundation: hunt schema, relative scheduling, lock-reason enrichment | A ⛔ gate | HANDOFF READY | chat #1 | — all 8 steps built + verified; **coordinator to walk §6 by hand** |
| **WS-9** | Sandbox **engine** + authoring contract + 1 reference scenario | B | NOT STARTED | | WS-8 gate passes |
| **WS-10** | The ticket: description, labels, screenshots, trainer ground-truth panel | B | NOT STARTED | | WS-8 gate passes |
| **WS-11** | Rewards: award engine, XP, levels, badges, streaks, Arena hub | C | NOT STARTED | | WS-9 **and** WS-10 DONE |
| **WS-12** | Oversight: admin progress board, risk signals, flag-to-trainer | D | NOT STARTED | | WS-11 DONE |
| **WS-13** | Integration & Test — serial, last, alone | E | NOT STARTED | | WS-12 DONE |

### Coordinator decisions — ✅ ALL THREE DECIDED 2026-07-21

Decided by the coordinator, taking the documented defaults. Full wording in
`ISSUES.md` I-038 — `06_…` §7 requires decision 2/3 to be in writing *before*
WS-8 edits `nav-config.ts`.

| # | Decision | Outcome | Needed by |
|---|---|---|---|
| 1 | Pause behaviour: does the relative calendar keep running during inactivity, or stretch? | ✅ **Absolute-from-join.** Calendar keeps running. Predictable, no activity accounting; stretching stays additive later | WS-8 step 5 |
| 2 | Arena takes a primary nav slot — which entry moves to "Mehr"? | ✅ **"Fragen" moves** to the sheet; Arena takes the freed slot | WS-8 step 8 |
| 3 | `nav-config.ts` WS-0 exception granted? | ✅ **Yes, narrow** — Arena entry + `primary` flags only, per `06_…` §7. No other Arena workstream touches the file | WS-8 step 8 |

---

## Infrastructure (parallel track, not a chat)

| Task | Status | Owner | Notes |
|---|---|---|---|
| OneDrive paused or repo moved | NOT DONE | | Repo is still under `OneDrive - WAMOCON GmbH`. Files have vanished once before |
| Public domain chosen | NOT STARTED | | `01_LAUNCH_READINESS.md` §1 |
| TLS / reverse proxy | NOT STARTED | | |
| SMTP / email delivery | NOT STARTED | | Launch blocker |
| Database backups + restore test | NOT STARTED | | Launch blocker |
| ⚠️ Expired TLS cert on `*.ditele-learn.ai` | NOT STARTED | | Lapsed 23 Apr 2026; covers `api.`, `shop.`, apex, `fiae-learn.com`, `startsmart360.com`. **Unrelated to this repo** — pass to whoever owns that infra |

---

## Gate log

Record when each gate actually passes and who verified it.

| Gate | Passed | Verified by | Notes |
|---|---|---|---|
| Wave 0a gate (02_WORKSTREAMS §6.9) | ☑ | | Phase 1 |
| All Wave-1 workstreams DONE | ☑ | | Phase 1 |
| WS-7 release gate | ☑ | | `RELEASE.md` written |
| **Wave-A gate (06_ARENA_WORKSTREAMS §6)** | ☐ | | Vertical slice round-trips in a browser; all three roles log in and nothing regressed |
| **WS-13 arena release gate** | ☐ | | `RELEASE-ARENA.md` written |

---

## How to use this

**Starting a chat:** set the row to `IN PROGRESS`, note which account.
**A chat dies:** set it to `DEAD (needs pickup)`. Re-launch with the same prompt — §2.2 for phase 1, §2.4 for phase 2 — and the new chat reads its status file and resumes.
**Splitting a workstream:** add a row for `WS-2a` / `WS-2b` and mark the parent as split. See `04_PROMPTS_AND_HANDOFF.md` §3.
**Merging workstreams:** one row per workstream still, same owner listed on each, worked in sequence.
