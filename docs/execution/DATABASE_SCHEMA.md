# Database Schema

Last updated: 2026-07-20. PostgreSQL/Supabase is the canonical V2 store. Exact SQL lives in immutable versioned migrations.

## Identity, tenancy and policy

| Entity | Purpose and key constraints |
|---|---|
| `profiles` | one-to-one with `auth.users`; locale/timezone/display fields; soft-deactivation; no password/token storage |
| `roles`, `permissions`, `role_permissions` | named authorization vocabulary; unique codes |
| `user_roles` | scoped assignment with organization/cohort nullable scope, validity period and grant audit |
| `organizations`, `organization_memberships` | tenant boundary; unique membership; lifecycle and residency metadata |
| `impersonation_sessions` | actor, viewed role/user, reason, start/end and audit correlation; never changes underlying authorization |
| `app_private.authentication_rate_limit_buckets` | server-only fixed-window buckets keyed by operation plus HMAC-minimized email/client subjects; forced RLS, bounded expiry and atomic consumption |

`app_private.current_actor_valid_role_assignments()` is the non-API effective-assignment resolver. It admits only an active/non-deactivated profile, current role window, active/unarchived tenant, active/unremoved/unexpired organization membership and, for cohort scope, a matching active/unremoved membership with learner/trainer role coupling. Scoped assignments in more than one valid tenant fail closed until an explicit server-validated tenant selector exists. Only the system roles `admin`, `content_admin`, `support`, `integration_admin` and `dpo` may be globally assigned. The preserved `has_role`, `has_permission`, organization/cohort and resource helpers consume this resolver; cancelled cohorts remain manager/audit history but are not ordinary learner/trainer workspaces.

## Catalog, content and cohorts

| Entity | Purpose and key constraints |
|---|---|
| `courses`, `course_localizations` | stable course identity plus EN/DE/RU content; slug/version uniqueness |
| `content_versions`, `content_reviews` | draft/review/published/archived lifecycle; published payload immutable |
| `stages`, `stage_localizations`, `media_assets` | ordered content and controlled media metadata/signed access |
| `tasks`, `task_localizations`, `task_assessments`, `task_hints`, `task_options`, `bug_categories` | learner-readable task definition, localized instructions/prompts/hints, ordered option labels and classification; no correctness or model answers |
| `task_option_answers`, `task_model_answers` | privileged correctness/model-answer boundary; learner roles have neither table grant nor RLS read path |
| `task_skill_mappings`, `prerequisites` | versioned competency weight and graph edges; cycles rejected |
| `cohorts`, `cohort_memberships`, `task_schedules`, `cohort_schedule_command_receipts` | course/group assignment pinned to an exact immutable published version, trainer/learner attribution membership, audited legacy activation dates, and private idempotent command receipts; terminal cohort transitions atomically close assigned enrollments |
| `app_private.cohort_assignment_revisions` | API-inaccessible per-cohort serialization guard; detects stale READ COMMITTED assignment/terminal and competing-capacity snapshots and forces a safe retry |
| `learning_paths`, `learning_path_items`, `path_assignments` | ordered/conditional progression with rule version and override history |

Learner reads do not traverse these normalized authoring tables from UI repositories. `list_my_learning_courses`, `get_my_learning_course`, and `get_my_learning_task` derive the authenticated actor and project only allow-listed fields from a validated immutable publication. Assigned/completed courses resolve the cohort's exact `content_version_id`; requested/approved rows are explicitly unpinned previews. Migration `100000` evaluates required-task acceptance and organization-qualified required-skill thresholds from that exact snapshot after schedule/entitlement checks, exposes only safe structured lock reasons, preserves active open work and denies never-started direct task access while locked.

`list_my_learning_history` is an actor-derived immutable keyset projection. It authorizes history independently of current workspace access, preserves exact parent/content pins and includes valid cancelled/completed attribution without making a terminal cohort navigable again.

## Learning, review and mentoring

| Entity | Purpose and key constraints |
|---|---|
| `enrollments`, `enrollment_request_receipts` | request/decision/assignment lifecycle plus private immutable actor/key/tenant/course/note/result replay binding; same exact command converges and changed payload/context conflicts |
| `attempts`, `attempt_drafts`, `attempt_command_receipts`, `attempt_hint_usage` | exact enrollment/course/cohort/content-version/task delivery tuple, timer, hint telemetry, optimistic version, resumable work and context/payload-bound command recovery |
| `submissions`, `submission_versions`, `submission_answers`, `submission_version_evidence`, `submission_version_hint_usage` | exact enrollment/course/cohort/content-version/task tuple, immutable answer/selection/evidence/hint snapshots and payload-bound idempotent submit |
| `reviews`, `review_transfers`, `review_rubric_scores` | decision, comment, calibrated criteria, expected submission version per transfer, and immutable ownership history; the latest transfer is the effective decision/transfer owner unless an authorized cohort manager overrides |
| `questions`, `question_messages`, `question_transfers` | task/cohort/learner context, named lifecycle, entitlement-scoped creation, atomic trainer self-claim, idempotent messages and continuous owner transfer; participant display names are exposed only through the actor-scoped `list_my_question_participant_contexts()` projection |
| `ratings` | one scoped task/course rating per learner/version with moderation metadata |

## Skills, evidence, labs and credentials

| Entity | Purpose and key constraints |
|---|---|
| `skills`, `skill_edges`, `rubrics`, `rubric_criteria` | versioned taxonomy/graph and assessment definitions |
| `evidence`, `evidence_artifacts`, `validation_results` | immutable source/ownership/hash, safe media metadata and deterministic validation output |
| `mastery_events`, `mastery_snapshots` | append-only explainable mastery history; rule/taxonomy version |
| `placement_assessments`, `placement_items`, `placement_attempts` | calibrated baseline evidence and recommendation inputs |
| `lab_definitions`, `lab_sessions`, `lab_leases` | provider-neutral scenario, isolated lease, health/reset/destroy lifecycle and expiry |
| `portfolios`, `portfolio_items`, `portfolio_publications` | curated evidence plus immutable public snapshot and opaque verifier token |
| `certificates`, `certificate_events` | eligibility/issue/available/revoke/expire lifecycle, unique idempotency key and verification hash |

## Engagement, operations and compliance

| Entity | Purpose and key constraints |
|---|---|
| `xp_ledger`, `badges`, `badge_awards`, `missions`, `mission_progress`, `leaderboard_preferences` | append-only demonstrated-learning rewards with unique source event; explicit opt-in |
| `notifications`, `notification_preferences`, `delivery_attempts` | deduplicated in-app/email/push lifecycle and channel consent |
| `analytics_events`, `analytics_consents` | minimized, versioned events tied to current consent and retention class |
| `audit_events` | append-only security/business events with actor, scope, correlation and redacted metadata |
| `outbox_events`, `integration_connections`, `integration_deliveries`, `integration_checkpoints` | transactional integration delivery, retry, DLQ, reconciliation and replay audit |
| `ai_conversations`, `ai_messages`, `ai_safety_decisions`, `ai_usage_events` | redacted context, mode/policy/refusal/escalation, latency/token/cost accounting |
| `consent_records`, `retention_policies`, `data_export_requests`, `data_deletion_requests` | versioned legal basis, request lifecycle, holds/exceptions and audit |
| `product_packages`, `entitlements` | server-enforced capability grants independent of UI |
| `support_issues` | safe issue report, status, correlation and restricted attachments |

The advanced runtime boundary imports canonical persistence constants for record, organization, membership, AI, lab-session, integration-delivery and privacy-request states. `tests/unit/advanced-persistence-state-contracts.test.ts` compile-checks those exhaustive arrays against the generated `Database["public"]["Enums"]` unions and rejects superseded prototype names. This proves enum convergence only: repository adapters and database integration tests must still verify field projections such as lab definition versions/retention, integration acknowledgements and package labels before those modules can be called live.

## Cross-cutting database rules

- UUID primary keys and UTC `timestamptz`; stable `external_id` plus source system where migration needs legacy mapping.
- Every tenant-owned table carries non-null `organization_id`; RLS checks active membership and resource scope.
- Foreign keys specify intentional restrict/cascade behavior. Unique and check constraints encode idempotency and valid local invariants.
- Partial indexes cover live queues and active memberships; composite indexes match cohort/tenant/status/created-at filters.
- Append-only ledgers/events reject update/delete for normal roles. Sensitive deletion uses approved anonymization or tombstones.
- Evidence identity, ownership, tenant, source, task and integrity provenance are immutable once linked; submission-version evidence and hint-use junctions freeze the exact reviewed facts.
- User-facing mutations execute in database transactions and emit an outbox/audit record atomically.
- Service role is server-only. User requests execute with user claims so RLS remains effective.
- External `integration_connections.organization_id` is non-null. Platform-global outbox events may remain internal, but external delivery requires explicit tenant/connection equality.
- Upload tables store metadata/hash/object key only; access uses policy-controlled signed URLs.
- External evidence links must be credential-free HTTPS URLs with an explicit, syntactically valid authority. Browser normalization cannot relax this rule; both the database command and every renderer fail closed.
- Composite foreign keys are backed by matching composite indexes, including the complete enrollment receipt result-context tuple `(enrollment_id, organization_id, actor_id, course_id)`.

Checked-in generated database types cover the schema through migration `100140`; migration `100150` is index-only and therefore introduces no type delta.
