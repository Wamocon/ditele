# RPC_CONTRACTS.md — the real, introspected signatures

> **Introspected from the live database at `192.168.178.75:56721` on 2026-07-21 by WS-0.**
> Argument names come from the PostgREST OpenAPI document (`GET /rest/v1/` with the
> service key) — they are the *actual* parameter names, not guesses.
> Return shapes come from really calling each RPC as the correct role.
>
> **Do not guess an argument name. If it is not in this file, introspect it and add it.**
> Regenerate with:
> ```bash
> node --env-file=.env.local scripts/ws0-introspect-rpc.mjs   # signatures
> node --env-file=.env.local scripts/ws0-probe2.mjs           # shapes + RLS
> ```

**48 RPCs · 99 tables. Both match the master plan's count.**

---

## 🚨 0. Five things that will break your code if you skip this section

### 0.1 Every mutation needs three bookkeeping arguments you did not expect

The master plan's example (`{ p_course_id: courseId }`) is correct for *reads*.
**Almost every write additionally requires:**

| Argument | Type | What it is |
|---|---|---|
| `p_correlation_id` | `uuid` | A request-trace id. Generate `crypto.randomUUID()` per call. |
| `p_idempotency_key` | `text` | Dedupe key. Same key + same args = the call is not applied twice. |
| `p_expected_version` | `bigint` | **Optimistic concurrency.** The `version` of the row you read. If it changed underneath you, the RPC rejects the write. |

`p_expected_version` is the important one: **you must read the row's current
`version` before you can write to it.** Every mutation is a read-then-write pair.
A stale version is how WF-3's "concurrent decision by two trainers is detected"
acceptance criterion is actually satisfied — the database does it for you, and
you surface the error.

```ts
// The shape every mutation call takes.
const { data, error } = await supabase.rpc("decide_submission", {
  p_submission_id: id,
  p_submission_version_id: versionId,
  p_expected_version: submission.version,   // ← read this first
  p_decision: "accepted",                   // enum review_decision
  p_comment: comment,
  p_criterion_scores: {},                   // jsonb, REQUIRED (see 0.3)
  p_correlation_id: crypto.randomUUID(),
  p_idempotency_key: `decide:${id}:${submission.version}`,
});
```

### 0.2 Localized text comes back as `{de, en, ru}` objects, not resolved strings

`get_my_learning_task` **ignores locale resolution** and returns every localized
field as an object keyed by locale:

```jsonc
{ "title": { "de": "…", "en": "…", "ru": "…" },
  "instructions": { "de": "…", "en": "…", "ru": "…" } }
```

But `get_public_catalog`, `get_my_learning_course` and `list_my_learning_history`
**do** take `p_locale` and return a resolved `title: string`. **The two families
behave differently.** Do not write one helper that assumes either.

For the `{de,en,ru}` family, resolve with a fallback chain — a locale key can be
missing or empty:
```ts
const pick = (m: Record<string, string>, locale: string) =>
  m?.[locale] || m?.de || m?.en || Object.values(m ?? {})[0] || "";
```

### 0.3 Arguments marked `*` below are REQUIRED even when they feel optional

PostgREST reports no SQL default for them. `p_comment`, `p_reason` and
`p_criterion_scores` are **required** on the RPCs that list them — pass `""` or
`{}` explicitly, never omit the key. Omitting a required argument fails with
`PGRST202` ("could not find the function … in the schema cache"), which looks
like the function does not exist. **It does exist. You got the arguments wrong.**

### 0.4 Only ONE list RPC supports pagination

`02_WORKSTREAMS.md` §5.5 rule 2 says "every list query takes `limit` and `offset`".
**That is not possible for these RPCs.** Only `list_my_learning_history` paginates,
and it is **keyset**, not offset:
`p_limit` + `p_before_event_id` + `p_before_occurred_at` + `p_snapshot_at`.

Every other `list_*` / `get_*` RPC returns the **complete** set with no bound.
Apply the pagination rule to direct table queries (`.range(from, to)`), and paginate
RPC results **client-side**. Note it in your status file; do not invent an argument.

### 0.5 The service-role key CANNOT read or write tables on this deployment

`SUPABASE_SERVICE_ROLE_KEY` returns `42501 permission denied for table …` on
**every** table. Cause: `20260717095000_authorization_rls_and_workflows.sql:285-287`
grants table privileges to `anon` and `authenticated` and **never grants them to
`service_role`.**

| Service role via… | Works? |
|---|---|
| Auth Admin API (`auth.admin.listUsers`, `createUser`, `updateUserById`) | ✅ yes |
| PostgREST tables (`.from("x").select()`) | ❌ `42501` on every table |
| PostgREST RPCs | ❌ not granted |

**Consequences:**
- **WS-6:** user create / password reset / deactivate still work — those are Auth
  Admin API calls, not table calls. Reading `profiles` and writing `user_roles`
  must go through the **admin's own authenticated session**, not the service client.
- **Seeding** runs as `admin@ditele.local` (an `authenticated` user with
  `grant select, insert, update, delete on all tables`). Verified: admin can
  insert into and delete from `courses`.
- `src/shared/database/service-role.ts` is still correct to keep — but it is only
  usable for Auth Admin operations. Do not reach for it to bypass RLS.

### 0.6 🚨 There is no direct-write path. Every mutation goes through an RPC.

Direct table writes are refused **even for an admin session**:

| Tables | What happens on insert |
|---|---|
| `attempts` `submissions` `questions` `question_messages` `notifications` `ratings` `profiles` `cohorts` | `42501 permission denied for table …` — no DML grant at all |
| `enrollments` `cohort_memberships` `support_issues` `entitlements` | `42501 new row violates row-level security policy` |
| `courses` `course_localizations` `content_versions` | ✅ direct insert works |

Later migrations revoke DML from `authenticated` and route everything through
`SECURITY DEFINER` command RPCs. **Never write `.from("submissions").insert(...)`.**
It will not fail at compile time and it will not fail quietly — it will 42501 at
runtime, in production, on a user action. Use the command RPC every time.

`content_versions.snapshot` is the published-content projection: a single jsonb
document holding the whole course tree (stages → tasks → hints, options,
assessment, rubric, skill mappings, localizations). **This is what the learner
RPCs read** — it is why a student sees 0 rows in `tasks` yet
`get_my_learning_course` returns a full curriculum. **WS-5:** publishing is not
"flip a state column", it is "write a correct snapshot". `publish_content_version`
builds it for you — do not hand-assemble one.

### 0.7 🚨 New learners cannot be enrolled — `entitlements` blocks it (ISSUES.md I-004)

`request_enrollment` first checks `public.entitlements` for a row with
`capability in ('catalog','learning')` for the actor
(migration `…096000` lines 62-70, re-stated in `…100140` lines 91-103).

Inserting that row is **refused by RLS for admin**, and **none of the 48 RPCs
grants an entitlement**. Only `learner@ditele.local` has one (plus a `portfolio`
capability), pointing at `product_package_id 01980a40-0000-7000-8000-000000000001`.

**Consequence:** the six seeded `learner1..6@ditele.local` accounts exist and hold
the `learner` role, but cannot enrol, so they cannot generate submissions,
questions or ratings. Unblocking needs someone with direct Postgres access —
the SQL is in the header of `scripts/seed-mock.mjs`.

**Until then:** `learner@ditele.local` is the *only* account with real learning
data. WS-2, WS-3 and WS-4 build against that one learner, and every list screen
will be short. Build the empty states properly — you will be seeing a lot of them.

---

## 1. Enum values — read them from here, never invent a state name

From `src/shared/database/database.types.ts` (generated, current):

| Enum | Values |
|---|---|
| `attempt_state` | `in_progress` · `submitted` · `revision_required` · `resubmitted` · `accepted` · `abandoned` |
| `submission_state` | `submitted` · `revision_required` · `resubmitted` · `accepted` · `withdrawn` |
| `review_decision` | `accepted` · `revision_required` · `transferred` |
| `enrollment_state` | `requested` · `approved` · `rejected` · `assigned` · `cancelled` · `completed` |
| `cohort_state` | `waiting` · `active` · `completed` · `cancelled` |
| `content_version_state` | `draft` · `in_review` · `published` · `archived` |
| `question_state` | `open` · `assigned` · `answered` · `transferred` · `archived` |
| `notification_state` | `pending` · `delivered` · `read` · `failed` · `cancelled` |
| `certificate_state` | `eligible` · `issued` · `available` · `revoked` · `expired` |
| `membership_state` | `invited` · `active` · `suspended` · `removed` |
| `cohort_member_role` | `learner` · `trainer` |
| `record_state` | `draft` · `active` · `inactive` · `archived` |
| `organization_state` | `active` · `suspended` · `archived` |
| `request_state` | `requested` · `processing` · `completed` · `rejected` · `cancelled` |

> `StatusBadge` (WS-0) maps **all** of these to a tone + German label. Import it;
> never write a second mapping.

---

## 2. Public / catalog — WS-1

### `get_public_catalog(p_locale text?)`
Callable by **anon**. Returns an **array**, one row per published course.
```jsonc
[{
  "course_id": "uuid", "slug": "string", "title": "string", "summary": "string",
  "resolved_locale": "string", "default_locale": "string",
  "estimated_minutes": 0, "version_number": 0,
  "published_at": "timestamptz", "task_count": 0,
  "title_localizations":   { "de": "…", "en": "…", "ru": "…" },
  "summary_localizations": { "de": "…", "en": "…", "ru": "…" }
}]
```
`title`/`summary` are already resolved to `p_locale`. The `*_localizations`
objects are there too if you need another language without a second call.

### `get_public_catalog_course(p_course_id uuid?, p_slug text?)`
Callable by **anon**. Both arguments optional — **pass exactly one.**
The route is `/catalog/[slug]`, so pass `p_slug`. Returns a **single object**:
```jsonc
{
  "course_id": "uuid", "slug": "string", "default_locale": "string",
  "estimated_minutes": 0, "version_number": 0,
  "published_at": "timestamptz", "task_count": 0,
  "localizations": [
    { "locale": "de", "title": "…", "summary": "…",
      "description_html": "…", "learning_outcomes": ["…"] }
  ]
}
```
⚠️ **No resolved `title` at the top level.** Find your locale inside
`localizations[]` and fall back to `default_locale`. `description_html` is HTML —
sanitize or render deliberately. `learning_outcomes` is a string array.

---

## 3. Student learning — WS-2

### `list_my_learning_courses(p_locale text?)` → array
```jsonc
[{
  "enrollment_id": "uuid", "enrollment_state": "enrollment_state",
  "course_id": "uuid", "cohort_id": "uuid", "cohort_state": "cohort_state",
  "content_version_id": "uuid", "content_version_state": "content_version_state",
  "version_number": 0, "title": "string", "progression_mode": "string",
  "completed_activities": 0, "total_activities": 0,
  "next_task_id": "uuid", "next_task_title": "string", "next_task_state": "string"
}]
```
> ⭐ **WS-2: your "Weiter lernen" card is already built server-side.**
> `next_task_id` + `next_task_title` + `completed_activities`/`total_activities`
> is exactly the card described in your brief. **One call, no extra query.**

### `get_my_learning_course(p_course_id uuid*, p_locale text?)` → single object
```jsonc
{
  "course_id": "uuid", "title": "string", "summary": "string",
  "cohort_id": "uuid", "cohort_name": "string", "cohort_state": "cohort_state",
  "enrollment_id": "uuid", "enrollment_state": "enrollment_state",
  "content_version_id": "uuid", "content_version_state": "content_version_state",
  "version_number": 0, "progression_mode": "string",
  "completed_activities": 0, "total_activities": 0,
  "stages": [{
    "id": "uuid", "title": "string", "description": "string", "position": 0,
    "activities": [{
      "id": "uuid",                    // ← this is the TASK id for /learn/tasks/[taskId]
      "title": "string", "description": "string", "position": 0,
      "state": "string",               // drives the TaskListItem status icon
      "lock_reasons": ["string"],      // [] when unlocked — render WHY it is locked
      "available_from": "timestamptz", "due_at": "timestamptz",
      "expected_minutes": 0
    }]
  }]
}
```
Resolved to `p_locale`. `lock_reasons` being a populated array is the lock state —
show the reason, do not just grey the row out.

### `get_my_learning_task(p_task_id uuid*)` → single object
**No `p_locale`.** Localized fields are `{de,en,ru}` objects — see §0.2.
```jsonc
{
  "id": "uuid", "stage_id": "uuid", "cohort_id": "uuid", "course_id": "uuid",
  "enrollment_id": "uuid",
  "title":        { "de": "…", "en": "…", "ru": "…" },
  "instructions": { "de": "…", "en": "…", "ru": "…" },
  "access": "string",                  // gate the workspace on this
  "target_url": "string|null",         // ⭐ IframePanel src — null ⇒ theory task
  "activated_at": "timestamptz",
  "cohort_state": "cohort_state",
  "version_number": 0,
  "content_version_id": "uuid", "content_version_state": "content_version_state",
  "assessment": {
    "id": "uuid",
    "question": { "de": "…", "en": "…", "ru": "…" },
    "selection_mode": "string",        // single vs multiple choice
    "options": [{ "id": "uuid", "label": { "de": "…", "en": "…", "ru": "…" } }]
  },
  "hint": { "id": "uuid", "content": { "de": "…", "en": "…", "ru": "…" } }
}
```
> ⚠️ **`hint` came back as a single object, not an array** — but the seeded task
> only has **one** hint row, so this is **not conclusive**. `HintCascade` needs
> several. **WS-2: seed a second hint on one task and re-check before you build
> the cascade.** If it stays singular, read `task_hints` directly (the student
> could not read that table under RLS — see §7 — so it may have to come from a
> Server Component using a trainer/admin context, or via a WS-0 issue).
>
> ⚠️ **No `video_url`, no `pdf_url`, no model answer** in this payload. The
> theory task's video/PDF are not exposed here. Confirm against `tasks` columns
> before promising `VideoPlayer`/`PdfViewer` on this route.

### `start_attempt(p_task_id uuid*, p_enrollment_id uuid*, p_correlation_id uuid*, p_idempotency_key text*)`
Take `p_enrollment_id` from `get_my_learning_task`. Idempotent on the key — this
is the server-side half of "double-submit is blocked".

### `save_attempt_draft(…)` — note the differently-named version argument
```
p_attempt_id            uuid*
p_answer_text           text*
p_selected_option_ids   uuid[]*
p_used_hint_ids         uuid[]*
p_evidence_draft        jsonb*
p_elapsed_seconds       int*
p_expected_draft_version bigint*    ← NOT p_expected_version
```
All required. Pass `[]` / `{}` / `0`, never omit. **This is the autosave call**
and the reason the draft survives a reload.

### `submit_attempt(…)`
```
p_attempt_id          uuid*
p_answer_text         text*
p_selected_option_ids uuid[]*
p_evidence_refs       uuid[]*      ← ids from create_external_task_evidence
p_expected_version    bigint*
p_correlation_id      uuid*
p_idempotency_key     text*
```

### `list_my_learning_history(p_limit int?, p_locale text?, p_before_event_id text?, p_before_occurred_at timestamptz?, p_snapshot_at timestamptz?)` → array
The **only** paginated RPC, and it is keyset. To page: keep the last row's
`event_id` + `occurred_at` and pass them as `p_before_*`. Hold `p_snapshot_at`
constant across a paging session for a stable view.
```jsonc
[{ "event_id": "string", "event_kind": "string", "occurred_at": "timestamptz",
   "ordinal": 0, "organization_id": "uuid", "course_id": "uuid",
   "cohort_id": "uuid", "task_id": "uuid", "question_id": "uuid|null",
   "course_title": "string", "task_title": "string" }]
```
⚠️ **Trainer and admin get `42501: learner history requires one active tenant
scope`.** This RPC is student-only in practice. F22's "trainer read-only" column
in the feature matrix is **not deliverable through this RPC.**

---

## 4. Q&A — WS-3 / WS-4

| RPC | Arguments |
|---|---|
| `create_question` | `p_task_id uuid*`, `p_cohort_id uuid*`, `p_subject text*`, `p_body text*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `list_my_available_question_contexts` | `p_locale text?` |
| `list_my_question_task_contexts` | `p_locale text?` |
| `list_my_question_participant_contexts` | **no arguments** — call as `rpc(name)` or `rpc(name, {})` |
| `list_active_question_trainers` | `p_cohort_id uuid*` |
| `claim_question` | `p_question_id uuid*`, `p_expected_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `answer_question` | `p_question_id uuid*`, `p_body text*`, `p_expected_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `transfer_question` | `p_question_id uuid*`, `p_to_trainer_id uuid*`, `p_reason text*`, `p_expected_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `archive_question` | `p_question_id uuid*`, `p_expected_version bigint*`, `p_correlation_id uuid*` — **no idempotency key** |

`list_my_available_question_contexts` → the "ask about which task" picker:
```jsonc
[{ "cohort_id": "uuid", "cohort_name": "string", "task_id": "uuid", "task_title": "string" }]
```

---

## 5. Trainer review — WS-4

### `get_submission_review_context(p_submission_id uuid*, p_locale text?)`
⚠️ **UNVERIFIED SHAPE — `submissions` had 0 rows at introspection time.**
Signature is confirmed from OpenAPI; the return shape is not. **WS-4: log the raw
payload once and append the real shape to this file before building against it.**

### `decide_submission(…)` — 8 required arguments
```
p_submission_id         uuid*
p_submission_version_id uuid*       ← a SEPARATE id from p_expected_version
p_expected_version      bigint*
p_decision              review_decision*   'accepted' | 'revision_required' | 'transferred'
p_comment               text*
p_criterion_scores      jsonb*      ← REQUIRED. Pass {} if not doing rubrics.
p_correlation_id        uuid*
p_idempotency_key       text*
```
> ⚠️ **`p_criterion_scores` is required.** The master plan lists rubric scoring
> (F28) as P1, but the RPC demands the argument regardless. Pass `{}` for P0.
> `p_submission_version_id` and `p_expected_version` are **two different things** —
> get both from the review context payload.

| RPC | Arguments |
|---|---|
| `transfer_submission` | `p_submission_id uuid*`, `p_to_trainer_id uuid*`, `p_reason text*`, `p_expected_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `list_active_cohort_trainers` | `p_cohort_id uuid*` → the transfer-target picker |
| `list_visible_skill_prerequisites` | **no arguments** |

---

## 6. Admin — WS-5 / WS-6

| RPC | Arguments |
|---|---|
| `submit_content_for_review` | `p_content_version_id uuid*`, `p_expected_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `decide_content_review` | + `p_decision text*` (**plain `text`, not an enum**), `p_comment text*` |
| `publish_content_version` | `p_content_version_id uuid*`, `p_expected_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `archive_content_version` | + `p_reason text*`, **`p_impact_fingerprint text*`** |
| `get_content_archive_impact` | `p_content_version_id uuid*` |
| `transition_cohort` | `p_cohort_id uuid*`, `p_target_state cohort_state*`, `p_reason text*`, `p_expected_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text?` (**optional here**) |
| `decide_enrollment` | `p_enrollment_id uuid*`, `p_decision enrollment_state*`, `p_reason text*`, `p_expected_version bigint*`, `p_correlation_id uuid*` — **no idempotency key** |
| `assign_enrollment` | `p_enrollment_id uuid*`, `p_cohort_id uuid*`, `p_reason text*`, `p_expected_version bigint*`, `p_correlation_id uuid*` |
| `update_task_schedule` | `p_task_id uuid*`, `p_cohort_id uuid*`, `p_available_from timestamptz*`, `p_due_at timestamptz*`, `p_reason text*`, `p_expected_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text?` |
| `list_organization_member_profiles` | `p_organization_id uuid*` → returned 4 rows for admin |

> ⭐ **`archive_content_version` needs `p_impact_fingerprint`.** You must call
> `get_content_archive_impact` **first** and pass its fingerprint back. This is a
> deliberate "you have seen the impact" interlock — WS-5's flow is forced to show
> the impact screen before archiving. That is the feature, not an obstacle.
>
> ⚠️ **`decide_content_review.p_decision` is `text`, but `decide_enrollment.p_decision`
> is the `enrollment_state` enum.** Do not copy one call into the other.

---

## 7. Student / profile / notifications — WS-3

| RPC | Arguments |
|---|---|
| `request_enrollment` | `p_course_id uuid*`, **`p_organization_id uuid*`**, `p_idempotency_key text*`, `p_request_note text?` |
| `update_own_profile` | `p_display_name text*`, `p_locale text*`, `p_timezone text*`, `p_expected_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `mark_notification_read` | `p_notification_id uuid*`, `p_expected_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `mark_all_notifications_read` | `p_before timestamptz*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `set_notification_family_preferences` | `p_event_family text*`, `p_in_app_enabled bool*`, `p_email_enabled bool*`, `p_push_enabled bool*`, `p_expected_in_app_version bigint*`, `p_expected_email_version bigint*`, `p_expected_push_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `rate_course` | `p_course_id uuid*`, `p_score int*`, `p_comment text*`, `p_expected_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `rate_task` | `p_task_id uuid*`, `p_score int*`, `p_comment text*`, `p_expected_version bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |

> ⚠️ **`request_enrollment` requires `p_organization_id`** and the master plan
> never mentions it. There is exactly **one** organization on this deployment:
> `01980a10-0000-7000-8000-000000000001`. WS-0 exposes it as
> `getDefaultOrganizationId()` — **do not hardcode that uuid in a page.**
>
> ⚠️ `mark_all_notifications_read` needs `p_before` — pass `new Date().toISOString()`.
> ⚠️ `set_notification_family_preferences` needs **three separate** expected-version
> values, one per channel.

---

## 8. Evidence — WS-2 (P1)

| RPC | Arguments |
|---|---|
| `create_external_task_evidence` | `p_attempt_id uuid*`, `p_title text*`, `p_source_uri text*`, `p_sha256_hex text*`, `p_idempotency_key text*` |
| `finalize_task_evidence_upload_service` | `p_upload_id uuid*`, `p_actor_id uuid*`, `p_verified_sha256 text*`, `p_verified_mime_type text*`, `p_verified_byte_size bigint*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `reject_task_evidence_upload_service` | `p_upload_id uuid*`, `p_actor_id uuid*`, `p_rejection_code text*`, `p_correlation_id uuid*`, `p_idempotency_key text*` |
| `claim_task_evidence_upload_cleanup` | `p_claim_token uuid*`, `p_worker_id text*`, `p_limit int*` |
| `complete_task_evidence_upload_cleanup` | `p_claim_token uuid*`, `p_worker_id text*`, `p_upload_id uuid*`, `p_deleted bool*`, `p_error_code text?`, `p_retry_at timestamptz?` |

`create_external_task_evidence` needs a **sha256 of the referenced content** —
it is not a plain "paste a URL" call. For a URL-only defect report, hash the URL
string itself and document that choice.

> ⚠️ **There is no `task_evidence` table** (`PGRST205: Could not find the table
> 'public.task_evidence' in the schema cache`). The master plan §8/§10 refers to
> one. Find the real table name before building the evidence list.

## 9. Infrastructure

| RPC | Arguments |
|---|---|
| `consume_authentication_rate_limit` | `p_client_subject text*`, `p_email_subject text*`, `p_operation text*` |
| `publish_portfolio` / `revoke_portfolio_publication` | P2 — do not build |

---

## 10. What each role can actually read — measured, not assumed

Row counts from a real session per role. **`0` means RLS returned an empty set;
`DENIED` means the table refused the query.**

| Table | service | anon | student | trainer | admin |
|---|--:|--:|--:|--:|--:|
| `organizations` | DENIED | DENIED | 1 | 1 | 1 |
| `profiles` | DENIED | DENIED | 1 | 2 | 4 |
| `user_roles` | DENIED | DENIED | 1 | 1 | 5 |
| `courses` | DENIED | **1** | 1 | 1 | 1 |
| `course_localizations` | DENIED | **3** | 3 | 3 | 3 |
| `content_versions` | DENIED | DENIED | **0** | 1 | 1 |
| `stages` | DENIED | DENIED | **0** | 1 | 1 |
| `tasks` | DENIED | DENIED | **0** | 1 | 1 |
| `task_options` | DENIED | DENIED | **0** | 2 | 2 |
| `task_hints` | DENIED | DENIED | **0** | 1 | 1 |
| `cohorts` | DENIED | DENIED | 1 | 1 | 1 |
| `cohort_memberships` | DENIED | DENIED | 2 | 2 | 2 |
| `enrollments` | DENIED | DENIED | 1 | **0** | 1 |
| `attempts` | DENIED | DENIED | 1 | **0** | **0** |
| `submissions` | DENIED | DENIED | 0 | 0 | 0 |
| `notifications` | DENIED | DENIED | 1 | 0 | 0 |
| `audit_events` | DENIED | DENIED | 0 | 0 | 1 |
| `reviews` `questions` `question_messages` `ratings` `certificates` `support_issues` `attempt_hint_usage` | DENIED | DENIED | 0 | 0 | 0 |
| `task_evidence` | **does not exist** (`PGRST205`) | | | | |

### The findings that change how you build

1. **⭐ A student cannot read `tasks`, `stages`, `task_hints` or `content_versions`
   directly — all return 0 rows.** Student learning content is available **only**
   through the `SECURITY DEFINER` RPCs. **WS-2 and WS-3: never `.from("tasks")`.
   Always `get_my_learning_task` / `get_my_learning_course`.** A direct query
   will silently return `[]`, which reads as "no data" rather than "forbidden" —
   the most expensive bug available in this codebase.
2. **A trainer sees 0 `enrollments` and 0 `attempts`.** WS-4's progress screen
   cannot be built from those tables under the trainer's own session. Use the
   review-context RPC, or file an issue.
3. **`anon` sees `courses` and `course_localizations` only** — exactly the two
   tables granted at migration line 286. The public catalog must come from
   `get_public_catalog`, which is granted to `anon` explicitly.
4. **`audit_events` is admin-visible (1 row) and invisible to everyone else.**
   §5.5 rule 3 (log every destructive action) is enforceable and checkable.
5. `attempts`: the **student** sees 1, admin and trainer see **0**. Ownership-scoped.

---

## 11. Seed-data reality at introspection time

The database is **nearly empty** — this is the master plan's "database is empty →
nothing verifiable" risk, and it is real:

> **1 organization · 1 course (3 localizations) · 1 content version · 1 stage ·
> 1 task (2 options, 1 hint) · 1 cohort · 2 memberships · 1 enrollment ·
> 1 attempt · 1 notification · 4 profiles · 5 user_roles**
>
> **0 submissions · 0 reviews · 0 questions · 0 ratings · 0 certificates ·
> 0 support_issues.**

Every list screen would render its empty state and no developer could see a real
table. **WS-0 Task 1d seeds this up to the §4.5 table.** Known ids:

| Thing | Id |
|---|---|
| organization | `01980a10-0000-7000-8000-000000000001` |
| course | `01980a20-0000-7000-8000-000000000001` |
| content version | `01980a22-0000-7000-8000-000000000001` |
| stage | `01980a23-0000-7000-8000-000000000001` |
| task | `01980a26-0000-7000-8000-000000000001` |
| cohort | `01980a30-0000-7000-8000-000000000001` |
| enrollment (learner's) | `01980a33-0000-7000-8000-000000000001` |
| learner user | `01980a00-0000-7000-8000-000000000001` |
| trainer user | `01980a00-0000-7000-8000-000000000002` |
| admin user | `01980a00-0000-7000-8000-000000000003` |
| org-admin user | `01980a00-0000-7000-8000-000000000004` |

---

## 12. Open items for the workstream that gets there first

Append your finding here rather than working around it silently.

- [ ] **WS-4** — record the real `get_submission_review_context` return shape (§5).
- [ ] **WS-2** — is `get_my_learning_task.hint` singular or an array with >1 hint? (§3)
- [ ] **WS-2** — where do a theory task's video and PDF URLs come from? Not in the payload.
- [ ] **WS-2/WS-3** — what is the real evidence table, given `task_evidence` does not exist?
- [ ] **WS-6** — confirm `user_roles` is writable by an admin session (service role cannot).
