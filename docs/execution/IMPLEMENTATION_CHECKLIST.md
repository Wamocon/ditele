# DiTeLe V2 Implementation Checklist

Last updated: 2026-07-20. A row becomes `✅ VERIFIED DONE` only after implementation, migration/model, server/database authorization, tests, browser screenshots, error/empty states, connected regression, and documentation all pass. `Preview` is never equivalent to done.

## Release 0 requalification snapshot — 2026-07-20

| Gate | Evidence | Status |
|---|---|---|
| R0-RUNTIME | Dedicated `127.0.0.1:3100` local runtime, healthy local Supabase, deterministic four-role seed accounts, safe mode-0600 local environment and bounded exact-project Auth gateway recovery | ✅ VERIFIED DONE |
| R0-DATABASE | Clean application of 43 migrations through `100150`; `db:lint` empty; 30 pgTAP files / 1,129 assertions | ✅ VERIFIED DONE |
| R0-STATIC | EN/DE/RU 163-key parity, 459-file client-secret scan, strict TypeScript, full ESLint and successful production build | ✅ VERIFIED DONE |
| R0-UNIT | 135 Vitest files / 784 tests plus 7/7 local Auth gateway operational tests; coverage 85.21% statements, 73.80% branches, 88.38% functions, 87.59% lines | ✅ VERIFIED DONE |
| R0-BROWSER | Chromium 32/32 against real local Supabase: public/auth/role isolation, WF-02 revision flow, WF-03 question flow, admin content and EN/DE/RU responsive rendering | ✅ VERIFIED DONE |

This is a working, verified Release 0 vertical slice, not a claim that all Plan 10 modules are complete. Admin authoring CRUD, full cohort membership management, eligible-cohort/path assignment, certificate artifacts/verifier, ratings/issues/reports/exports, production impersonation, recommender/AI, labs, live integrations, GDPR self-service, production deployment/recovery and other rows below remain open or blocked exactly as shown.

## Wave 0 — Discovery and safety

| ID | Deliverable and acceptance | Status | Owner/evidence |
|---|---|---|---|
| DISC-01 | Read the execution prompt and Plan 10 completely before architecture or feature code | ✅ VERIFIED DONE | `/root`; source review |
| DISC-02 | Locate/read repository instructions and Plans 08/09; reconcile their lower-priority requirements and contradictions against Plan 10 | ✅ VERIFIED DONE | no `AGENTS.md`; Plans 08/09 fully read; BLK-002 resolved; deltas persisted in checklist, traceability, ADR, API/test/migration/UI, terminology and blocker registers |
| DISC-03 | Inspect V2 Git/worktree and preserve user changes | ✅ VERIFIED DONE | V2 has no initial commit and all work remains untracked; `anforderung/` preserved; the extensively dirty V1 reference was rechecked read-only with no V1 writes |
| DISC-04 | Inspect V1 read-only; inventory routes, roles, APIs, states, translations, assets and unsafe patterns | ✅ VERIFIED DONE | `/root/reference_audit`; no V1 writes |
| DISC-05 | Verify Node, Docker, Supabase CLI and local capacity | ✅ VERIFIED DONE | Node 22.22.2, Docker 29.2.1, Supabase CLI present, 121 GiB RAM |
| DISC-06 | Identify available backend/providers/test accounts/contracts and exact gaps | ✅ VERIFIED DONE | BLK-001..013 |
| DISC-07 | Create complete parity and new-module checklist | ✅ VERIFIED DONE | this file |
| DISC-08 | Create feature/workflow traceability matrix | ✅ VERIFIED DONE | `TRACEABILITY_MATRIX.md` |
| DISC-09 | Create agent ownership and overlap controls | ✅ VERIFIED DONE | `AGENT_OWNERSHIP.md` |
| DISC-10 | Create architecture decision register | ✅ VERIFIED DONE | `ARCHITECTURE_DECISIONS.md` |
| DISC-11 | Create API contract register | ✅ VERIFIED DONE | `API_CONTRACTS.md` |
| DISC-12 | Create schema and migration plan/register | ✅ VERIFIED DONE | `DATABASE_SCHEMA.md`, `MIGRATION_REGISTER.md` |
| DISC-13 | Create test plan including negative/security matrix | ✅ VERIFIED DONE | `TEST_PLAN.md` |
| DISC-14 | Create bug, UI verification and blocker registers | ✅ VERIFIED DONE | execution docs |
| DISC-15 | Establish and verify learner task, trainer review and admin editor visual direction; generated concept images are waived by explicit user instruction, while code-native design and rendered QA remain required | 🟡 IN PROGRESS | `/root`; ADR-019 and `UI_VERIFICATION.md` |
| DISC-16 | Record current V1 certificate mapping as type 0 course completion, type 1 exam/ISTQB | ✅ VERIFIED DONE | adapter contract evidence |
| DISC-17 | Persist an individual V1 route-to-V2 parity appendix for all 47 recorded App Router pages, including replacements, APIs, tests and visual status | ✅ VERIFIED DONE | `/root/v1_route_parity_inventory` + coordinator count verification; `LEGACY_ROUTE_PARITY.md` |
| DISC-18 | Establish a canonical V1/V2 terminology register and prohibit silent introduction of supporting-plan personas as authorization roles | ✅ VERIFIED DONE | `/root`; `TERMINOLOGY_REGISTER.md`, ADR-022 and traceability persona guardrails |

## Wave 1 — Foundation

| ID | Deliverable and acceptance | Status |
|---|---|---|
| FND-01 | Scaffold supported stable Next.js App Router, React and strict TypeScript with reproducible lockfile | 🟡 IN PROGRESS |
| FND-02 | Domain-oriented `app/features/entities/shared` boundaries and dependency rules | 🟡 IN PROGRESS |
| FND-03 | Semantic light/dark design tokens, accessible primitives, responsive role shell and impersonation banner | 🟡 IN PROGRESS |
| FND-04 | EN/DE/RU locale-prefixed routing, typed message parity and EN fallback tests | 🟡 IN PROGRESS |
| FND-05 | Same-origin BFF, Zod contracts, canonical error envelope and correlation IDs | 🟡 IN PROGRESS |
| FND-06 | Local Supabase config through Docker; safe `.env.example`; secrets ignored | 🟡 IN PROGRESS |
| FND-07 | Versioned canonical migrations with constraints/indexes/retention/external IDs | 🟡 IN PROGRESS |
| FND-08 | Deterministic seed users/data for guest, learner, trainer, admin and organization admin | 🟡 IN PROGRESS |
| FND-09 | Secure server session registration/login/logout/reset/me; expiry and revocation | 🟡 IN PROGRESS |
| FND-10 | Server role/resource/cohort/tenant policies plus RLS; wrong-scope tests | 🟡 IN PROGRESS |
| FND-11 | Named state machines and legacy numeric mapper with unknown-state failure | 🟡 IN PROGRESS |
| FND-12 | Canonical repositories and isolated `LegacyApiAdapter` contract fixtures | 🟡 IN PROGRESS |
| FND-13 | Audit taxonomy, append-only events, outbox and safe structured logging | 🟡 IN PROGRESS |
| FND-14 | Origin/CSRF validation, security headers, rate-limit ports and upload policy | 🟡 IN PROGRESS |
| FND-15 | Unit/component/contract/database/integration/E2E/a11y/visual test harnesses | 🟡 IN PROGRESS |
| FND-16 | CI gates for install, migration, types, i18n, lint, build, tests, secret scan and E2E | 🟡 IN PROGRESS |
| FND-17 | Loading, empty, error, forbidden, offline/retry, not-found and global-error conventions | 🟡 IN PROGRESS |
| FND-18 | Monitoring/health/readiness, redaction and correlation propagation | 🟡 IN PROGRESS |
| FND-19 | Identity-federation readiness covers OIDC subject linking, MFA/AAL claims, session revocation, deprovisioning and SCIM lifecycle without inventing a live provider | ⛔ BLOCKED |
| FND-20 | Browser/platform security policy covers CSP, HSTS and secure headers; CI/release security gates include SAST, DAST, SBOM and container scanning | 🟡 IN PROGRESS |
| FND-21 | PWA/installability and offline-cache policy explicitly excludes sessions, drafts, submissions and evidence from unsafe caching; command/search remains keyboard accessible | ⬜ OPEN |

## Wave 2 — Version 1 feature parity

| ID | Existing capability and complete acceptance | Status |
|---|---|---|
| CUR-01 | Public home/catalog/localized course detail preserve correct course-specific content, media, locale and registration action | 🟡 IN PROGRESS |
| CUR-02 | Registration/login/logout/reset provide secure sessions, explicit validation, expired/revoked handling and no browser role trust | 🟣 IN REVIEW |
| CUR-03 | Profile/edit and actor-derived cursor history including cancelled cohorts are live; certificate list/download still requires safe artifact delivery | 🔁 REWORK |
| CUR-04 | Course request/admin processing/assignment are idempotent and expose requested/approved/rejected/assigned/cancelled/completed states; eligible-cohort/path assignment UI remains incomplete | 🟡 IN PROGRESS |
| CUR-05 | Learner active/completed courses and cohort membership remain server authoritative; trainer/admin scoped views match | 🟡 IN PROGRESS |
| CUR-06 | Legacy date-activated stages/tasks remain available during feature-flagged progression migration; date edits audited | 🟡 IN PROGRESS |
| CUR-07 | Task workspace covers instructions, before/after media, target link, written/MCQ answers, hint, hint telemetry, duration and preview | 🔁 REWORK |
| CUR-08 | Submit/revision/resubmit/review/comment/transfer/archive/history use immutable versions, named states and conflict protection | 🔁 REWORK |
| CUR-09 | Learner question, trainer answer/transfer, queues/archive/history preserve context and atomic ownership | 🟣 IN REVIEW |
| CUR-10 | Admin localized course/stage/video/media/task/test/bug-category CRUD and role/locale preview; uploads validated | 🟡 IN PROGRESS |
| CUR-11 | Cohort create/edit/delete/duplicate/start/stop uses waiting/active/completed lifecycle and impact confirmation | 🟡 IN PROGRESS |
| CUR-12 | Learner/trainer assignment/removal and user/trainer administration enforce resource scope and destructive confirmation | 🟡 IN PROGRESS |
| CUR-13 | Certificates, task/course ratings, issues, notifications, reports and exports cover downloads, feedback, retry and permission errors | 🟡 IN PROGRESS |
| CUR-14 | Admin role-view/impersonation is server-authorized, reasoned, time-bounded, persistently bannered and audited | 🟡 IN PROGRESS |
| CUR-15 | Course recommender moves provider calls server-side with quota, consent/redaction, safety and deterministic fallback | 🟡 IN PROGRESS |

### Role-specific parity detail

| ID | Role | Capability | Status |
|---|---|---|---|
| GUEST-01 | Guest | Home, catalog, course landing, about, privacy/legal, FAQ, success/error pages | 🟡 IN PROGRESS |
| GUEST-02 | Guest | Register, sign in, sign out, password reset and locale preservation | 🟡 IN PROGRESS |
| GUEST-03 | Guest | Optional safe course recommendation assistant | ⬜ OPEN |
| STUD-01 | Student | Dashboard, next action, active/completed courses and request/registration | 🟡 IN PROGRESS |
| STUD-02 | Student | Cohort/path membership, stage/task activation and media | 🟡 IN PROGRESS |
| STUD-03 | Student | Draft, free text, MCQ, hint, timer, evidence, submit and duplicate protection | 🔁 REWORK |
| STUD-04 | Student | Feedback, revision, resubmission and immutable attempt history | 🟣 IN REVIEW |
| STUD-05 | Student | Questions/history, task/course rating and notifications | 🟡 IN PROGRESS |
| STUD-06 | Student | Profile, learning history, certificates/download and portfolio | 🔁 REWORK |
| TRAIN-01 | Trainer | Dashboard, assigned cohorts, start/stop, authorized schedule dates and progress | 🟡 IN PROGRESS |
| TRAIN-02 | Trainer | Submission queue/archive/detail, accept/revision/comment/transfer and history | 🟣 IN REVIEW |
| TRAIN-03 | Trainer | Question queue/archive/detail, answer/transfer, learner/cohort context | 🟣 IN REVIEW |
| ADMIN-01 | Admin | Dashboard and audited role-view mode | 🟡 IN PROGRESS |
| ADMIN-02 | Admin | Localized content/course/stage/media/task/test/category CRUD, versioning and preview | 🟡 IN PROGRESS |
| ADMIN-03 | Admin | Cohort CRUD/duplicate/start/stop and learner/trainer assignment | 🟡 IN PROGRESS |
| ADMIN-04 | Admin | Learner/trainer admin, applications, certificates, reports/issues, notifications and exports | 🟡 IN PROGRESS |

## Wave 3 — New product core (individual module entries)

| ID | Module and release acceptance | Status |
|---|---|---|
| MOD-01 | Identity and access management: lifecycle, scoped roles and audit | 🟡 IN PROGRESS |
| MOD-02 | Secure server-side sessions: rotation, expiry, revocation and fail-closed routes | 🟡 IN PROGRESS |
| MOD-03 | Role/resource authorization: server policy plus RLS including group/tenant isolation | 🟡 IN PROGRESS |
| MOD-04 | Application shell/navigation: responsive role goals, locale/theme/profile, keyboard navigation and command/search | 🟡 IN PROGRESS |
| MOD-05 | EN/DE/RU localization: typed parity, content locale, dates/numbers and fallback | 🟡 IN PROGRESS |
| MOD-06 | Public catalog: real course-specific localized content and accessible filters | 🟡 IN PROGRESS |
| MOD-07 | Enrollment/entitlements: request, decision, assignment, duplicate safety and package check | 🟡 IN PROGRESS |
| MOD-08 | Course/content authoring: server drafts, localized validation, media and preview | 🟡 IN PROGRESS |
| MOD-09 | Content version/review/publish: immutable release and impact-aware archive; authoring CRUD remains separate MOD-08 work | 🟡 IN PROGRESS |
| MOD-10 | Cohorts/groups: lifecycle, capacity, schedule, membership and audit | 🟡 IN PROGRESS |
| MOD-11 | Flexible progression: legacy dates plus fail-closed versioned prerequisite rules; full path/override UX remains incomplete | 🟡 IN PROGRESS |
| MOD-12 | Learning paths/prerequisites: acyclic graph, visible reasons and assignment | 🟡 IN PROGRESS |
| MOD-13 | Tasks/assessments: localized instruction, media, target, MCQ and validation | 🟡 IN PROGRESS |
| MOD-14 | Attempts/revisions: autosave/timer/hints, immutable submission versions, exact command recovery and idempotency | 🟣 IN REVIEW |
| MOD-15 | Trainer review/mentoring: risk/SLA/workload queue, rubric/snippets, evidence plus lab telemetry, decision/transfer/conflict, safe bulk actions and calibration | 🟡 IN PROGRESS |
| MOD-16 | Questions/escalation: contextual thread, scoped participant attribution, atomic owner transfer, notify and archive | 🟣 IN REVIEW |
| MOD-17 | Skill/competency graph: versioned taxonomy and task mappings | 🟡 IN PROGRESS |
| MOD-18 | Evidence ledger: immutable ownership/hash/source/validation, scenario/rubric/reviewer/conditions provenance, confidential-data redaction and access control | 🔁 REWORK |
| MOD-19 | Rubrics/mastery history: exact pinned criteria and explainable append-only updates; production calibration remains BLK-005 | 🟣 IN REVIEW |
| MOD-20 | Placement assessment: knowledge, practical work, confidence and prior evidence; item bank, attempt integrity and initial evidence | 🟡 IN PROGRESS |
| MOD-21 | Next-best action: deterministic, explainable gaps/prerequisites with override history | 🟡 IN PROGRESS |
| MOD-22 | Testing-lab lifecycle: scenario templates/variants, seeded defects/fixtures, instrumentation, budget/timeout/abuse controls and provider-neutral start/health/reset/validate/destroy model | 🔁 REWORK |
| MOD-23 | Lab provisioning/isolation: per-learner attempt data/credential/state isolation, short-lived secret, deterministic validation and cleanup; live provider BLK-004 | ⛔ BLOCKED |
| MOD-24 | Learner portfolio: typed charters/cases/bugs/automation/reflections, traceable evidence, redaction, employer report, revocable publication and privacy controls | 🟡 IN PROGRESS |
| MOD-25 | Verifiable certificates: eligibility/issue/revoke/expire/opaque verify; production rules BLK-003 | ⛔ BLOCKED |
| MOD-26 | Skill-based XP: immutable source-event ledger, no clicks/logins/decay | 🟡 IN PROGRESS |
| MOD-27 | Badges/missions/leaderboards/challenges: rule versioning, idempotency, anti-gaming/rate/anomaly controls, meaningful streaks and opt-in ranking | 🟡 IN PROGRESS |
| MOD-28 | Notifications/preferences: in-app delivery, dedupe, read and channel consent | 🟡 IN PROGRESS |
| MOD-29 | Product/learning analytics: consent-first versioned events and scoped dashboards | 🟡 IN PROGRESS |
| MOD-30 | Server-side AI gateway: no client secrets, redaction, quota, cost and outage fallback | 🟡 IN PROGRESS |
| MOD-31 | Guarded contextual coach: sourced hint cascade, leakage block and escalation | ⛔ BLOCKED |
| MOD-32 | AI trainer feedback draft: mandatory trainer edit/approval; never final decision | ⛔ BLOCKED |
| MOD-33 | Organizations/tenant membership: tenant-safe schema and membership lifecycle | 🟡 IN PROGRESS |
| MOD-34 | Organization admin: people, assignment, competency/report/audit only after isolation proof | 🟡 IN PROGRESS |
| MOD-35 | SSO/OIDC/MFA/SCIM readiness: provider-neutral config, issuer/audience/nonce/state/AAL, account linking and deprovisioning controls | ⛔ BLOCKED |
| MOD-36 | Eloomi adapter: canonical ownership mapping and reconciliation | ⛔ BLOCKED |
| MOD-37 | LTI launch/deep-link/names-roles/grade exchange, xAPI/cmi5 and webhooks: inbound/outbound versioned contracts, signatures, source ownership and consent | ⛔ BLOCKED |
| MOD-38 | Integration retry/reconciliation: transactional outbox, idempotency, DLQ and safe replay | 🟡 IN PROGRESS |
| MOD-39 | Audit logs: append-only security/business taxonomy, scoped viewer and redaction | 🟡 IN PROGRESS |
| MOD-40 | GDPR consent/retention/export/deletion: request workflows; final legal rules BLK-008 | ⛔ BLOCKED |
| MOD-41 | Product packages/entitlements: server policy and disabled payment port pending BLK-007 | ⛔ BLOCKED |
| MOD-42 | Operational monitoring/support: health, logs, correlation, issue workflow and alerts | 🟡 IN PROGRESS |
| MOD-43 | Certificate/portfolio public verification and anti-enumeration | ⛔ BLOCKED |

### Supporting-plan requirement detail

| ID | Requirement and acceptance | Status |
|---|---|---|
| ADV-01 | Flexible progression supports estimated effort, learner confirmation/choice, optional target dates/cohort cadence, branching scenarios, spaced retrieval and challenge mode | ⬜ OPEN |
| ADV-02 | Mastery validity is versioned and explainable; expiry/revalidation/remediation never mutates or decays the XP ledger | ⛔ BLOCKED |
| ADV-03 | Trainer scaling includes reusable snippets, workload/SLA balancing, specialist escalation, calibration samples and inter-rater consistency reporting | ⬜ OPEN |
| ADV-04 | Portfolio artifacts distinguish test charters, test cases, bug reports, automation artifacts and reflections and record assessment conditions | ⬜ OPEN |
| ADV-05 | Lab scenarios cover web, mobile, API, database/log, accessibility, performance and AI targets with variants, reset protection and trusted telemetry | ⛔ BLOCKED |
| ADV-06 | Integrations support inbound OIDC/LTI/SCIM, configurable source-of-record rules, theory launch/reference and CloudEvents-compatible evolution in addition to outbound WF-10 | ⛔ BLOCKED |
| ADV-07 | Practice, ISTQB, Teams, Assess, Partner and Integration product modes have explicit scope/defer decisions; no buyer/employer/partner persona becomes a role implicitly | ⛔ BLOCKED |
| ADV-08 | CTFL 4.0 and specialist curriculum mapping traces each skill to content, evidence, rubric, remediation and revalidation policy | ⛔ BLOCKED |
| ADV-09 | Legacy data cutover has entity-by-entity source/target mapping, reconciliation/checksums, cohort flags, time-boxed dual-write decision and rollback | ⛔ BLOCKED |

## Mandatory workflow gates

| ID | Complete path and key acceptance | Status |
|---|---|---|
| WF-01 | Catalog → localized detail → auth → idempotent request → admin decision → cohort/path → notification → activity; error retention and locale continuity | 🟡 IN PROGRESS |
| WF-02 | Task/media/target → hint/draft/timer/external evidence → immutable submit → review → revision → resubmit → accepted → recalculation; verified vertical slice, while private object upload remains BUG-047 | 🔁 REWORK |
| WF-03 | Task question → assigned trainer → answer/transfer → notification → archive/history; atomic ownership | 🟣 IN REVIEW |
| WF-04 | Filter queue → inspect complete snapshot → rubric/comment → accept/revision/transfer → notify/audit; scope and concurrent-decision tests | 🟣 IN REVIEW |
| WF-05 | Create localized course → stages/media/tasks/tests/categories/skills → role/locale preview → validate → immutable publish → assign | 🟡 IN PROGRESS |
| WF-06 | Create/duplicate cohort → assign → schedule/mode → start → adjust authorized dates → monitor → complete → certificates/report | 🟡 IN PROGRESS |
| WF-07 | Goal/placement/evidence → gap → explainable path → confirmation → learn/assess → mastery → remediation/next; override reason/history | 🟡 IN PROGRESS |
| WF-08 | Start isolated lab → health → test/evidence → deterministic validate → review → mastery/portfolio → retention destroy; provider BLK-004 | ⛔ BLOCKED |
| WF-09 | Help → classify/redact/retrieve → concept/question/partial hint/safe example → escalation → quality/cost; provider/corpus BLK-011 | ⛔ BLOCKED |
| WF-10 | Domain event/outbox → map/adapter → idempotent deliver/ack → retry/DLQ → reconcile/replay; sandbox contracts BLK-006 | ⛔ BLOCKED |

## Wave 5 — Hardening and operations

| ID | Gate | Status |
|---|---|---|
| HARD-01 | Full requirement/traceability/parity gap audit includes the individual 47-route V1 map and has no orphan requirement, route, mutation, state or test | 🟡 IN PROGRESS |
| HARD-02 | Clean database reset/migrate/reseed and generated-type parity pass | ✅ VERIFIED DONE |
| HARD-03 | Authorization matrix and cross-cohort/cross-tenant RLS suite pass | 🟡 IN PROGRESS |
| HARD-04 | Current Release 0 gates pass: 138/799 Vitest, 7/7 operational, 30/1,129 database, 32/32 production Chromium and coverage recorded; complete WF-01/WF-05..10 suites remain | 🟡 IN PROGRESS |
| HARD-05 | EN/DE critical workflows and RU/fallback behavior pass | 🟡 IN PROGRESS |
| HARD-06 | Desktop/tablet/mobile visual QA, console/network checks and required screenshots pass | 🟡 IN PROGRESS |
| HARD-07 | WCAG 2.2 AA automated/manual focus, keyboard, labels, contrast, errors, reduced-motion and screen-reader checks pass | 🟡 IN PROGRESS |
| HARD-08 | Security scan/test covers secrets, sessions, CSRF/origin, uploads, rate limits, AI and replay | 🟡 IN PROGRESS |
| HARD-09 | Performance budgets and realistic-volume request/bundle/layout checks pass | ⬜ OPEN |
| HARD-10 | Deployment, health/monitoring, backup/restore and rollback/forward-fix rehearsal pass | ⛔ BLOCKED |
| HARD-11 | No unresolved P0/P1 defects; all closed bugs have regression evidence (current P1 implementation gaps include BUG-045, 047, 049..053) | ⬜ OPEN |
| HARD-12 | Environment, local startup, operations, migration/cutover and final handoff docs complete | ⬜ OPEN |
| NFR-01 | Core-learning availability is measured against the provisional 99.9% target; sandbox availability is reported separately | ⬜ OPEN |
| NFR-02 | Supported mobile P75 LCP is measured below 2.5 seconds in a named environment and data volume | ⬜ OPEN |
| NFR-03 | Normal API P95 is measured below 400 ms reads and 800 ms writes, excluding file processing, with query evidence | ⬜ OPEN |
| NFR-04 | Critical authorization policy tests reach 100% of the explicit permission/resource/tenant matrix | 🟡 IN PROGRESS |
| NFR-05 | Backup/restore meets provisional RPO ≤15 minutes and RTO ≤4 hours in a production-like rehearsal | ⛔ BLOCKED |
| NFR-06 | Release rollback or verified forward-fix completes within the provisional 15-minute target | ⛔ BLOCKED |
| NFR-07 | Live sandbox startup P95 is measured below 60 seconds without weakening isolation or cleanup | ⛔ BLOCKED |
| NFR-08 | WCAG 2.2 AA remains a non-negotiable release gate across critical role workflows | 🟡 IN PROGRESS |
