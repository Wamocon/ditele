# WS-3 — Student Plus

Started: 2026-07-21 · Port: 3103 · Dist: `.next-ws3` · Account: `learner@ditele.local` / `123123123`

---

## RESUME HERE
Updated: 2026-07-21 · Chat: **#1**

**State:** IN PROGRESS

**Done and committed:**
- Data layer — `src/shared/data/profile.ts`, `questions.ts`, `notifications.ts`
- WS-3 helpers — `src/features/questions/i18n.ts`, `format.ts`, `components/`
- German keys — `messages/de.json` → new top-level `learn.*` namespace
- `/learn/notifications` — real data, day grouping, mark-read, mark-all-read
- `/learn/questions` — list, waiting-first ordering, empty state
- `/learn/questions/new` — context picker, validation, values survive an error
- `/learn/questions/[questionId]` — thread, system rows, honest no-reply notice
- `/learn/profile` — account, theme, notification preferences, password, sign out
- `/learn/enroll/[courseId]` — course summary, request form, existing-request status

**Half-finished:**
- Nothing.

**Next, in order:**
1. `/learn/history`
2. `/learn/certificates`

**⭐ Things I learned that are written down nowhere else:**

1. **Use `learner1@ditele.local`, not `learner@ditele.local`, to look at WS-3
   screens.** WS-0's seed put the questions, messages and most notifications on
   `learner1..6`, **not** on the account named in the plan. Measured:

   | account | notifications | questions | question_messages | enrollments | certificates |
   |---|--:|--:|--:|--:|--:|
   | `learner@ditele.local` | 1 | **0** | **0** | 1 | 0 |
   | `learner1@ditele.local` | 4 | 1 | 3 | 1 | 0 |
   | `learner2@ditele.local` | 4 | 1 | 3 | 1 | 0 |

   All share the password `123123123`. `scripts/smoke.mjs` uses
   `learner@ditele.local`, so **smoke green ≠ the screen has data** — it proves
   the empty state renders. Check both accounts.

2. **`list_my_question_participant_contexts` is not a question list.** Despite
   the name it returns `{question_id, user_id, display_name}[]` — the people in
   each thread. `list_my_question_task_contexts` returns `{question_id,
   task_title}[]`. Neither returns the questions. **The list comes from the
   `questions` table directly** (RLS scopes it to the learner) and the two RPCs
   only decorate it. The master plan's route table (§11.3) is wrong about this.

3. **The participant RPC is the only way to get a trainer's name.** A learner
   sees exactly 1 row in `profiles` — their own. Joining `question_messages` to
   `profiles` for an author name silently returns nothing.

4. **A learner cannot reply in a thread.** The only Q&A write RPCs are
   `create_question` (learner) and `answer_question` / `claim_question` /
   `transfer_question` / `archive_question` (all trainer-scoped). There is **no
   learner follow-up message RPC**, so the "reply composer" in the WS-3 brief
   cannot be built. The thread renders read-only with an honest notice and a
   "new question" action. Logged as I-014.

5. **`p_idempotency_key` must be 16–200 characters** on every command RPC
   (checked in every migration). A short key fails with `22023`, which reads
   like a validation error about the *data*. Prefix + `crypto.randomUUID()` is
   always safe.

6. **Notification read state is `read_at`, not `state`.** After
   `mark_notification_read` the row still has `state: "pending"` — only
   `read_at` and `row_version` change. Filtering on `state = 'read'` would show
   every notification as unread forever.

7. **A stale CAS version raises `40001`, which WS-0's `mapPostgrestError` does
   not know**, so it lands on the generic "Die Aktion konnte nicht ausgeführt
   werden." `refineDataError()` in `shared/data/profile.ts` maps it to a real
   message. Logged as I-014 for WS-0/WS-7 to fold into `result.ts`.

8. **`notification_preferences` starts completely empty.** No row means
   "default", and `set_notification_family_preferences` treats
   `expected_version = 0` as "create it". The five accepted families are
   `enrollment, review, question, submission, certificate` — anything else is
   `22023`.

9. 🚨 **A `"use server"` module may export ONLY async functions.** I exported
   `initialProfileState` / `initialAskState` next to the actions that use them —
   the natural place for them. Next replaces every non-function export with a
   server reference, so on the client `state.fieldErrors` was `undefined`, the
   component threw during SSR, and **the route still answered `200` with an
   empty `<main>`**. `smoke.mjs` cannot catch this: there is no "Application
   error" in the body, just nothing. Declare `useActionState` initial values in
   the client component. Symptom to recognise: page renders the `loading.tsx`
   skeleton in the HTML and the content only appears after hydration.

10. **`get_public_catalog_course` returns a one-element ARRAY**, not the single
    object `RPC_CONTRACTS.md` §2 documents. A `zod` object schema fails at the
    boundary and the page shows its error state with no hint why. Logged as
    I-015 — **WS-1 calls the same RPC on `/catalog/[slug]`.**

11. **`de.json` and `ISSUES.md` lose writes.** Both are shared, and a
   read-modify-write from another chat lands on top of yours. My first
   `ISSUES.md` row vanished within seconds. Always write, then **read back and
   confirm**. See I-013.

**Blocked on:**
- Nothing.

---

## Routes

| Route | Built | Real data | Loading | Empty | Error | 375px | Dark | Keyboard |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `/learn/notifications` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/learn/questions` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/learn/questions/new` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/learn/questions/[questionId]` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/learn/profile` | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| `/learn/enroll/[courseId]` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/learn/history` | ⬜ | | | | | | | |
| `/learn/certificates` | ⬜ | | | | | | | |

## Data functions added

- `src/shared/data/profile.ts` → `refineDataError()`, `failPostgrest()`,
  `shapeError()`, `getMyProfile()`, `saveMyProfile()`, `changeMyPassword()`,
  `getMyEnrollmentForCourse()`, `requestCourseEnrollment()`,
  `getCourseSummary()`, `listMyHistory()`, `listMyCertificates()`
- `src/shared/data/questions.ts` → `listMyQuestions()`, `getQuestionThread()`,
  `listAskableContexts()`, `askQuestion()`
- `src/shared/data/notifications.ts` → `listMyNotifications()`,
  `markOneNotificationRead()`, `markEveryNotificationRead()`,
  `listMyNotificationPreferences()`, `saveNotificationFamilyPreference()`,
  `NOTIFICATION_FAMILIES`, `NOTIFICATION_CHANNELS`

## Files outside `src/app` that WS-3 owns

- `src/features/questions/i18n.ts` — WS-3's message accessor. It types against
  **de.json** because `getMessages()` types against **en.json**, which by the
  build rules never receives WS-3's German keys. Untranslated keys fall back to
  German instead of vanishing.
- `src/features/questions/format.ts` — `Intl` date/time helpers, day bucketing,
  initials.
- `src/features/questions/components/` — `SubmitButton` (pending state),
  `FormStatus` (the documented inline fallback for WS-0's not-yet-landed Toast).

> `features/questions/` is the only `features/` folder WS-3 owns, so the shared
> WS-3 helpers live there rather than in a folder with no owner.

## Gates

- [x] `npx tsc --noEmit` — no errors in WS-3 files
- [x] `npx eslint` on WS-3 paths — clean
- [x] `node scripts/smoke.mjs` — **47/47 routes OK**
- [x] committed

> ⚠️ `tsc --noEmit` on the whole tree is **not** green: other chats have
> in-flight errors in `(auth)/_components/*` and `features/content/model.ts`.
> Not WS-3's files, not WS-3's to fix (02_WORKSTREAMS §11).

## Deferred / not yet built

- Avatar upload — Storage is unresolved (MASTER_PLAN §16 Q6). Initials only.

## Issues found in someone else's area

- **I-013** — concurrent read-modify-write silently drops rows in `ISSUES.md`
  and keys in `de.json`. It happened to me twice.
- **I-014** — see below, filed with the route work.
