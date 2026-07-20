# Canonical API Contracts

Last updated: 2026-07-20. All inputs and outputs are runtime-validated. UI code imports canonical contracts only.

## Transport conventions

- Same-origin routes live under `/api/v1`.
- JSON success envelope: `{ "data": T, "meta": { "correlation_id": string } }`.
- Error envelope: `{ "error": { "code": string, "message_key": string, "field_errors": Record<string,string[]>, "correlation_id": string, "retryable": boolean } }`.
- Mutations that create durable events accept `Idempotency-Key`; stale writes require a version/ETag and return `409`.
- Dates are RFC 3339 UTC. IDs are UUIDs. Pagination uses an opaque cursor.
- Authentication is a server-managed cookie; role or tenant headers never grant authority.

## Canonical operations

This table describes the target canonical boundary required by Plan 10; it is not an implementation-completion claim. Only operations listed later under “Implemented transactional database contracts” or “Implemented actor-derived read projections,” and linked to passing evidence, are currently wired. Provider- or policy-dependent operations such as labs, live integrations, AI, certificate issuance and public verification remain disabled, domain-only or blocked as recorded in the checklist and blocker register.

| Domain | Operations | Primary permission | State/concurrency rule | Legacy evidence |
|---|---|---|---|---|
| session | `register`, `login`, `logout`, `resetPassword`, `me`; future `oidcStart|oidcCallback|linkIdentity|provision|deprovision` | public/self; trusted IdP/SCIM service for federation | session rotation; revoked/expired/deprovisioned fail closed; issuer/subject identity and required AAL | `/register/global`, `/register/user`, `/login`, `/password`, `/logout`, `/auth/user`; federation BLK-013 |
| profile | `get`, `update`, `history`, `export` | self or scoped admin | optimistic version on update | `/user/global/profile`, `/user/local/profile`, `/user/global/edit`, `/export/students` |
| catalog | `list`, `get`, `recommend` | public/read | locale fallback is explicit | `/guest/courses/list`, `/guest/courses/show` |
| enrollment | `request`, `listMine`, `listPending`, `decide`, `assign` | self request; admin decide | duplicate key per learner/course; named transition | `/courses/register`, `/courses/requests` |
| content | course/stage/media/task/test/category CRUD; `preview`, `validate`, `publish` | content admin | published version immutable; publish requires complete validation | `/courses/*`, `/stage`, `/task/*`, `/bugs/categories` |
| cohort | `list`, `get`, `create`, `duplicate`, `assign`, `remove`, `changeState`, `changeSchedule` | scoped trainer/admin | `waiting -> active -> completed`; version conflict returns `409` | `/groups*`, `/group/duplicate`, `/task/change_active_date` |
| learning | `getWorkspace`, `saveDraft`, `recordHint`, `submit`, `resubmit`, `rate` | entitled learner/resource | immutable submitted version; idempotent submit; activation enforced server-side | `/tasks`, `/task/show`, `/task/solved/send`, `/task/rate` |
| review | `queue`, `archive`, `get`, `decide`, `transfer`, `history` | assigned trainer/admin scope | stale/concurrent decision returns `409`; comment policy enforced | `/solvings`, `/solvings/archive`, `/task/show/trainer`, `/solving/change/status`, `/solving/transfer` |
| question | `list`, `archive`, `get`, `create`, `answer`, `transfer` | learner resource or assigned trainer | transfer atomically changes owner and writes history | `/question`, `/question/archive/trainer`, `/question/add` plus detail calls |
| skill | `taxonomy`, `mapTask`, `profile`, `recordEvidence`, `recommend`, `override` | learner read; trainer/admin write scope | versioned rules; every recommendation and override has rationale | no V1 endpoint |
| lab | `catalog`, `start`, `status`, `access`, `reset`, `validate`, `destroy` | active learner plus `learning.submit` and explicit current entitlement for active use; exact-tenant `organization.manage` for management/cleanup | required target contract: ID-based authoritative reload; learner/tenant-isolated immutable scenario version/rule fingerprint, credentials, data, state and telemetry; actor/tenant/operation/payload-bound durable intent before provider effects; ready→leased/active→validating reachability; runtime-validated provider/save results; bounded HTTPS lease persistence/revocation; exact crash resume and terminal cleanup. Current TypeScript boundary is in BUG-067 rework and no repository/provider is bound. | V1 target link only |
| portfolio | `get`, `curate`, `publish`, `revoke`, `verifyEvidence`, `employerReport` | self; scoped reviewer; public opaque verification | typed charter/case/bug/automation/reflection provenance; redacted immutable publication snapshots | no V1 endpoint |
| certificate | `list`, `download`, `issue`, `revoke`, `verify` | self/scoped issuer; public opaque verify | idempotent issue; eligibility server-owned | `/certificate/list`, `/certificate/download`, `/certificate/add` |
| reward | `ledger`, `badges`, `missions`, `challenges`, `leaderboardOptIn` | self; rules engine | source-event uniqueness; evidence-only reward; rate/anomaly controls; no login/click reward or XP decay | no V1 endpoint |
| notification | `list`, `markRead`, `preferences` | self | delivery/read writes idempotent | `notifications`, `notifications/[id]/read` |
| analytics | `track`, `learner`, `trainer`, `admin` | matching active consent plus exact tenant scope | schema-version-1 per-event property allowlists; free text and sensitive keys/values rejected; sink sees only pseudonymous subject reference; withdrawal/deletion propagation required; repository/retention adapter not yet bound | simple V1 reports/counts |
| ai | `recommendCourse`, `coach`, `draftFeedback`, `escalate` | public rate-limit or authenticated actor plus explicit task/review resource policy | canonical `recommendation|learning|assessment|trainer_draft`; input and provider output leakage/PII refusal; at most five approved citations; audit/quota/failure states; trainer approval required for drafts; no live endpoint/provider yet | V1 browser chatbot replaced |
| organization | `get`, `members`, `assign`, `report`, `audit` | tenant-scoped organization admin | tenant ID required and RLS enforced | no V1 endpoint |
| integration | `connections`, inbound `launch|deepLink|provision`, outbound `deliveries|reconcile|replay` | verified provider for signed inbound; integration admin for management/replay | tenant-bound active connection; versioned signatures; explicit source owner; exact persisted delivery lifecycle; transactional outbox/idempotent delivery and tenant-exact dead-letter replay; worker/repository not yet bound | no verified V1 endpoint |
| privacy | `consents`, `requestExport`, `requestDeletion`, `cancel`, `decide`, `status` | self or exact-tenant `privacy.manage` scope | exact `requested|processing|completed|rejected|cancelled` lifecycle; positive retention and legal-hold/policy controls; repository and approved legal rules not yet bound | no verified V1 endpoint |
| support | `createIssue`, `listIssues`, `changeStatus`, `health` | public liveness/redacted readiness; public issue create target; support/admin manage | `/api/health` defaults to dependency-free liveness; `?check=readiness` performs a timeout-bounded anonymous PostgREST/Postgres probe and returns only allowlisted status/latency with `200|503`, no-store and correlation ID; issue rate limit/mutations still pending | `/errorReport`, `issues/reports/list`, `issues/reports/change/status` |

## Implemented transactional database contracts

These actor-derived RPCs are the current same-origin server-action persistence boundary. Browser code never receives privileged credentials. Direct authenticated table mutation is not yet globally closed; BUG-028 and migration `100100`/pgTAP `023` track that release-critical correction without overstating the current boundary.

| Workflow | Contract | Atomic guarantees |
|---|---|---|
| WF-01 | receipt-bound `request_enrollment(course_id, idempotency_key, request_note?, correlation_id)`; `decide_enrollment(enrollment_id, expected_version, decision, reason, correlation_id)`; `assign_enrollment(enrollment_id, cohort_id, expected_version, reason, correlation_id)` | request receipts bind actor, key, organization, course, normalized note and result; exact replay converges, changed context/payload conflicts, authorization is revalidated, and canonical states are `requested/approved/rejected/assigned/cancelled/completed`. The remaining WF-01 gap is the eligible-cohort/path assignment UI, not the command boundary. |
| WF-02 | exact-context `start_attempt(enrollment_id, task_id, idempotency_key, correlation_id)`, serialized `save_attempt_draft(...)`, `record_attempt_hint_usage(...)`, `create_external_task_evidence(...)`, and payload-bound `submit_attempt(...)` | active exact authorization before replay, constrained publication tuple, flexible/revision continuity, one aggregate lock order, bounded response/evidence validation, immutable evidence/hint linkage and context/payload receipts are implemented. Ambiguous transport failure replays the byte-equivalent command; if both responses are lost, the client retains and reconciles that exact command without resaving a terminal draft. |
| WF-04 | `list_active_cohort_trainers(cohort_id)`; `get_submission_review_context(submission_id, locale)`; `decide_submission(submission_id, submission_version_id, expected_version, decision, comment, criterion_scores, idempotency_key, correlation_id)`; `transfer_submission(submission_id, expected_version, to_trainer_id, reason, idempotency_key, correlation_id)` | implemented exact immutable submission publication/rubric context, version/owner/CAS, lifecycle-aware trainer destination/tenant scope and atomic tenant-qualified evidence/mastery/history effects; direct DML remains BUG-028 |
| WF-03 | `list_my_available_question_contexts(locale)`; `list_my_question_task_contexts(locale)`; `list_my_question_participant_contexts()`; `create_question(...)`; `claim_question(...)`; `answer_question(...)`; `transfer_question(...)` | exact immutable cohort/task pin, historical titles, revision continuity, lifecycle-aware trainer claim/destination, current-owner CAS, payload replay and atomic effects are implemented. Participant names come only from an actor-scoped display-name projection; question UI never performs a broad profile read. The full create→claim→stale-conflict→answer→notification→archive browser workflow passes. |
| WF-06 | `transition_cohort(cohort_id, expected_version, target_state, reason, correlation_id, idempotency_key?)`; `update_task_schedule(cohort_id, task_id, expected_version, available_from, due_at, reason, correlation_id, idempotency_key?)` | exact immutable content-version pin, actor-derived trainer/manager scope, named transition, CAS/payload-bound replay, atomic terminal enrollment effects, audit/outbox and one cohort notification; assignment/terminal and capacity races return retryable `40001`; certification/mastery remain separate policy-owned commands |

## Implemented actor-derived read projections

| Consumer | Contract | Confidentiality and consistency boundary |
|---|---|---|
| Public catalog | `get_public_catalog(locale)`; `get_public_catalog_course(slug?, course_id?)` | latest validated global publication only; localized allow-list; no draft, answer, object-key or tenant-private fields |
| Learner dashboard | `list_my_learning_courses(locale)` | derives the actor; requested/approved rows receive an unpinned safe preview, while assigned/completed rows use only the exact cohort pin |
| Learner course | `get_my_learning_course(course_id, locale)` | canonical `assigned+active` or `completed+completed` context with active membership; immutable stage/task summaries and accepted-or-locked history |
| Learner task | `get_my_learning_task(task_id)` | canonical active assignment only; schedule/flexible-entitlement plus exact-snapshot required-task/organization-qualified required-skill gate; open work remains readable; safe lock reasons on course projection; no correctness, model answer, rubric, competency definition or storage fields |
| Learner history | `list_my_learning_history(locale, cursor?, limit?)` | actor-derived immutable keyset history independent of current workspace cohort access; exact parent/content pins and privacy-minimized titles; includes authorized completed/cancelled attribution without resurrecting a workspace |
| Trainer review context | `get_submission_review_context(submission_id, locale)` plus exact-pinned solution reads | active exact-cohort reviewer or cohort manager only; exact latest submission version/cohort publication, localized options, immutable rubric criteria and schedule-independent exact-pin solution access; storage metadata excluded |
| Question participants | `list_my_question_participant_contexts()` | returns only `(question_id, user_id, display_name)` for participants in questions the actor can already access; no email, contact data or unrelated profile enumeration |
| Admin member detail | application-layer exact membership-first projection over RLS-protected reads | platform-admin route plus active organization and `organization.manage`; exact target membership is the first target read; absent/cross-tenant becomes 404; allowlisted profile, current roles, cohort assignments, enrollment/attempt aggregate and certificate lifecycle only; every child is runtime checked against the proved user/tenant; no contact/auth/answer/verification/artifact fields and no mutation claim |

`create_question` deliberately creates `open`/unassigned questions because Version 1 does not expose a deterministic initial-routing rule. An active trainer in the question's cohort explicitly calls `claim_question`; its compare-and-set transition permits exactly one owner, records immutable system history, and keeps answer/transfer unavailable until ownership exists.

`create_external_task_evidence` accepts only the original credential-free, whitespace-free HTTPS value with a valid authority. Application input parsing and learner/trainer rendering repeat the restriction for usability and defense in depth, but PostgreSQL remains authoritative.

Authentication server actions deliberately distinguish three non-enumerating outcomes: invalid credentials, distributed throttling, and retryable provider unavailability. The first two never disclose whether an account exists; provider transport/5xx failures use localized `unavailable` copy rather than masquerading as a bad password.

## Compatibility boundary

The observed Version 1 base URL is evidence only and is not called until a non-production contract and authorization review is approved. Observed inconsistent envelopes are normalized by `LegacyApiAdapter`; numeric values map as follows and unknown values fail validation:

| Legacy field | Value | Canonical state |
|---|---:|---|
| group `is_active` | null | `waiting` |
| group `is_active` | 1 | `active` |
| group `is_active` | 0 | `completed` |
| solving `solving_status` | missing/null | `draft` |
| solving `solving_status` | 0 | `submitted` |
| solving `solving_status` | 1 | `accepted` |
| solving `solving_status` | 2 | `revision_required` |
| question `is_answered` | false | `open` or `assigned` based on owner |
| question `is_answered` | true | `answered` |
| course/user `status` | 1 | `active` |
| course/user `status` | 0 | `inactive` |
| certificate `cert_type` | 0 | `course_completion` |
| certificate `cert_type` | 1 | `exam` |

## Domain events

Canonical events are versioned and persisted with event ID, aggregate ID/version, actor, correlation/causation IDs, consent basis, occurrence time, and redacted payload. Tenant-owned events also carry organization scope. Platform-global events may remain tenantless for internal processing, but only an event with explicit tenant scope, active connection and canonical mapping may enter an external delivery. External adapter envelopes align with CloudEvents concepts and declare schema compatibility; consumers reject incompatible major versions and deduplicate per event/connection.

Required families include enrollment, cohort, task, submission, review, question, mastery, lab, certificate, reward, notification, consent, export/deletion, impersonation, publishing, and integration delivery/replay.

## Source-of-record defaults

Until a product-specific ownership matrix overrides a configurable field, DiTeLe owns practical tasks, evidence, reviews and practice-derived mastery; an external LMS owns referenced/launched theory content; and the identity provider owns the federated issuer/subject. Enrollment and certificate each require one explicitly configured owner and a mapped reference in the non-owning system. Adapters report conflicts and never silently create a second writer.
