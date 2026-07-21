# Assignment board — who owns what, right now

> **Update this whenever you start, finish, or reassign a chat.** Ten seconds each time.
> This is the only place that tells you a workstream has silently died.
> **One owner per workstream at a time. Never two.**

Status values: `NOT STARTED` · `IN PROGRESS` · `DEAD (needs pickup)` · `HANDOFF READY` · `DONE`

| WS | Scope | Status | Chat / account | Last commit seen | Notes |
|---|---|---|---|---|---|
| **WS-0** | Foundation ⛔ gate | NOT STARTED | | | Blocks everything |
| **WS-1** | Public & Auth | NOT STARTED | | | |
| **WS-2** | Student Core ⭐ | NOT STARTED | | | Largest. Splittable into 2a/2b |
| **WS-3** | Student Plus | NOT STARTED | | | |
| **WS-4** | Trainer | NOT STARTED | | | |
| **WS-5** | Admin Content | NOT STARTED | | | Splittable into 5a/5b |
| **WS-6** | Admin Ops | NOT STARTED | | | |
| **WS-7** | Polish & Integration | NOT STARTED | | | Runs last, alone |

---

## Infrastructure (parallel track, not a chat)

| Task | Status | Owner | Notes |
|---|---|---|---|
| OneDrive paused or repo moved | NOT DONE | | ⛔ **Do this before WS-0 starts** |
| Public domain chosen | NOT STARTED | | `01_LAUNCH_READINESS.md` §1 |
| TLS / reverse proxy | NOT STARTED | | |
| SMTP / email delivery | NOT STARTED | | Launch blocker |
| Database backups + restore test | NOT STARTED | | Launch blocker |

---

## Gate log

Record when each gate actually passes and who verified it.

| Gate | Passed | Verified by | Notes |
|---|---|---|---|
| Wave 0a gate (02_WORKSTREAMS §6.9) | ☐ | | All boxes ticked, three logins clicked |
| All Wave-1 workstreams DONE | ☐ | | |
| WS-7 release gate | ☐ | | `RELEASE.md` written |

---

## How to use this

**Starting a chat:** set the row to `IN PROGRESS`, note which account.
**A chat dies:** set it to `DEAD (needs pickup)`. Re-launch with the same §2.2 prompt from `04_PROMPTS_AND_HANDOFF.md` — the new chat reads the status file and resumes.
**Splitting a workstream:** add a row for `WS-2a` / `WS-2b` and mark the parent as split. See `04_PROMPTS_AND_HANDOFF.md` §3.
**Merging workstreams:** one row per workstream still, same owner listed on each, worked in sequence.
