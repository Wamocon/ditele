# Architecture Decision Register

Last updated: 2026-07-20. Source priority: execution prompt, Plan 10, this register, supporting plans, verified Version 1 behavior, documented assumptions.

## ADR-001 — Canonical V2 core with isolated legacy compatibility

- Status: Accepted
- Decision: DiTeLe V2 uses canonical domain contracts backed by local Supabase/PostgreSQL. A `LegacyApiAdapter` may map verified Version 1 Laravel contracts into those interfaces, but legacy payloads and numeric states never reach UI components.
- Reason: The execution prompt mandates Supabase and outranks Plan 10's initial Laravel-first assumption. The boundary preserves reversible parity migration.
- Consequence: Features with no reachable Laravel contract can be fully implemented in the V2 core, while legacy compatibility remains explicitly unverified.

## ADR-002 — Next.js App Router and strict TypeScript

- Status: Accepted
- Decision: Use a supported stable Next.js App Router release with React, strict TypeScript, server components for initial reads, and client components only for interaction.
- Reason: Required by Plan 10 and appropriate for same-origin BFF, localized routing, and server-validated sessions.
- Consequence: Heavy editors, media, charts, and exports are dynamically loaded. Independent server reads start in parallel.

## ADR-003 — Domain-oriented modular monolith

- Status: Accepted
- Decision: Organize code under `src/app`, `src/features`, `src/entities`, and `src/shared`. UI consumes repositories/services, never database clients or providers.
- Reason: Keeps the initial system deployable while retaining boundaries that can later become services.
- Consequence: Cross-domain mutations use explicit application services and transactions; no feature-owned table is mutated directly by another feature.

## ADR-004 — Defense-in-depth authorization

- Status: Accepted
- Decision: Supabase Auth establishes identity. Server policies authorize role, resource, cohort, and tenant scope; PostgreSQL RLS is the final enforcement layer. Browser-stored role data is display-only.
- Reason: Client-only Version 1 authorization is explicitly prohibited.
- Consequence: Protected routes and every mutation fail closed. Service-role credentials remain server-only and are never used to bypass application authorization for user requests.

## ADR-005 — Cookie/session and mutation security

- Status: Accepted
- Decision: Use server-managed Supabase sessions in secure, HttpOnly, SameSite cookies. Validate mutation origin and use idempotency keys for high-value writes.
- Reason: Required secure sessions, CSRF protection, and replay resistance.
- Consequence: Expired and revoked sessions produce a typed error and a safe sign-in redirect; mutations are not authorized from untrusted role headers.

## ADR-006 — Named, explicit state machines

- Status: Accepted
- Decision: Enrollment, cohort, submission, question, content version, lab session, certificate, export, and integration delivery states are string enums with transition maps and tests.
- Reason: Numeric magic states and UI-invented transitions are forbidden.
- Consequence: Unknown legacy status values fail visibly at the compatibility boundary. Transition availability is derived from server authorization. Runtime persistence schemas import canonical state constants and compile-time contract tests prove their exhaustive equality with generated database enums; repository adapters must explicitly map projection-field differences without inventing alternate lifecycle names.

## ADR-007 — Runtime-validated canonical contracts

- Status: Accepted
- Decision: Validate BFF inputs and outputs with Zod. Return one error envelope containing `code`, `message_key`, `field_errors`, `correlation_id`, and `retryable`.
- Reason: Static types alone do not protect external or database boundaries.
- Consequence: Adapters cannot silently coerce malformed status or data. Correlation IDs connect UI failures, audit events, and logs.

## ADR-008 — Localized routes and typed messages

- Status: Accepted
- Decision: EN, DE, and RU use a single message schema and locale-prefixed routes. EN is the controlled fallback; dates and numbers use user locale and timezone.
- Reason: Version 1 parity and Plan 10 require all three locales with fallback testing.
- Consequence: Missing keys fail CI; unsupported locales resolve predictably without losing the requested destination.

## ADR-009 — Professional QA-workspace design system

- Status: Accepted
- Decision: Derive semantic light/dark tokens and component families from code-native learner-task, trainer-review, and admin-editor reference screens. Use neutral ink/slate, restrained blue, semantic amber/green/red, 4/8 spacing, clear focus, open data layouts, and limited cards/pills/gradients.
- Reason: The product must feel like a professional testing workspace rather than a generic LMS.
- Consequence: The rendered reference screens and shared token/component contracts are the visual specification. Browser screenshots are inspected directly against them before sign-off; generated concept imagery is not required under ADR-019.

## ADR-010 — External dependencies behind feature-flagged adapters

- Status: Accepted
- Decision: Labs, AI providers, Eloomi, LTI, xAPI/cmi5, OIDC, email/push, payments, and production certificate signing use provider-neutral ports, outbox events, idempotent adapters, and explicit unavailable states.
- Reason: Provider contracts and credentials are not available.
- Consequence: Internal contracts, retry/DLQ behavior, tests, and honest UI states can ship; live integration remains blocked until verified.

## ADR-011 — Evidence-based gamification

- Status: Accepted
- Decision: XP is an immutable, idempotent ledger generated only by demonstrated learning events. No login/click rewards and no punitive decay. Leaderboards are opt-in.
- Reason: Explicit product rule.
- Consequence: Reward replays are safe and auditable; deletes preserve accounting records through anonymization where legally permitted.

## ADR-012 — AI remains advisory

- Status: Accepted
- Decision: AI is server-only, context-minimized, safety-classified, quota-limited, and source-aware. The authoritative Plan-10 coaching order is concept reminder → guiding question → partial hint → safe example on a different scenario → trainer escalation. Evidence-specific critique may be inserted only after the partial hint in learning mode and must not reveal assessment answers. AI may draft trainer feedback but never decide review, mastery, or certification.
- Reason: Explicit safety requirement.
- Consequence: Leakage, refusal, provider timeout, and trainer-approval paths are mandatory tests.

## ADR-013 — Migration discipline

- Status: Accepted
- Decision: Commit Supabase config, immutable timestamped migrations, deterministic seed data, schema documentation, and generated database types. Correct applied migrations only with a new migration.
- Reason: Reproducible local development and safe recovery are mandatory.
- Consequence: Clean reset/reseed is a release gate; production rollback is forward-fix or restore-and-reconcile, not destructive schema reversal.

## ADR-014 — Honest delivery labels

- Status: Accepted
- Decision: A visible surface is `Live` only when its model, authorization, domain logic, errors, tests, E2E flow, and visual QA pass. Fixtures or disconnected provider ports are labeled `Preview` or `Unavailable`.
- Reason: Both authoritative inputs forbid presenting fixture-backed UI as production-ready.
- Consequence: Release status can remain OPEN/BLOCKED even when a polished screen exists.

## ADR-015 — Immutable publication and cohort delivery boundary

- Status: Accepted
- Decision: Public and learner rendering is derived from a validated immutable publication snapshot. Every cohort pins one exact content version before activation; later publications never change active or historical cohort content implicitly.
- Reason: Live normalized rows allowed post-review drift and course-level grouping could silently move learners to a newer graph.
- Consequence: Catalog, learner, trainer and cohort projections must be actor-derived from the appropriate latest publication or exact cohort/submission pin. Published/archived pins remain readable for authorized history, while draft/in-review and hidden answer fields fail closed.

## ADR-016 — Global definitions and tenant customization

- Status: Accepted
- Decision: A platform-global course/version/task may reference only global skills, rubrics, criteria dependencies, bug categories and task-rubric assignments. A tenant course may reference global or same-tenant definitions. Tenant customization of platform content requires a tenant-owned course/version clone; per-tenant overlays on one global task are not allowed.
- Reason: The original global seed referenced tenant-A review definitions, making snapshots ambiguous and preventing consistent reuse and mastery across tenants.
- Consequence: Definition ownership is immutable, canonical task/rubric assignment is unique per task/version, migration `100000` repairs only unambiguous published-global records and aborts on ambiguous overlays, and delivery/mastery records remain organization-qualified even when their definitions are global. Learner, question and reviewer consumers resolve only their exact immutable publication rather than normalized authoring rows.

## ADR-017 — Authoritative mutation commands

- Status: Accepted
- Decision: RLS establishes row visibility but is not a business mutation API. Stateful browser writes execute only through actor-derived, field-limited database commands that validate named transitions and CAS, support idempotent retry, and append required audit/outbox/notification effects atomically.
- Reason: Row-level `FOR ALL` policies cannot constrain changed columns, legal state transitions, immutable snapshots or transactional side effects.
- Consequence: Broad authenticated table DML is removed in staged corrective migrations after every active consumer has an authoritative command. Direct-forgery denial is a database release gate; service-role access remains server-only and does not authorize user requests.

## ADR-018 — One active tenant scope per request

- Status: Accepted
- Decision: An organization-scoped role or permission is valid only while the actor has an active, unremoved and unexpired membership in that same active organization. Cohort-scoped assignments additionally require the matching active cohort membership. Until an explicit, server-validated tenant selector exists, a request with retained scoped assignments in more than one organization fails closed instead of flattening permissions.
- Reason: Independent role and membership lifecycles allowed suspended tenant users to retain access, while a single principal could combine permissions from unrelated organizations.
- Consequence: Platform-global roles remain explicitly global; tenant roles never leak across contexts; application and PostgreSQL helpers share the same rule; `/admin` and `/organization` are separate route perspectives with separate navigation and data contracts.

## ADR-019 — Code-native visual direction without generated concept imagery

- Status: Accepted
- Decision: Do not generate concept images. Establish the visual system in semantic tokens and code-native components, then verify the actual learner task, trainer review and admin editor renders in production-mode browsers at required viewports.
- Reason: The user explicitly waived image creation after the execution prompt was supplied; that instruction has source-of-truth priority.
- Consequence: Concept-image comparison is not a completion gate, but responsive screenshots, direct visual inspection, keyboard/accessibility checks, and console/network evidence remain mandatory. Existing development-mode or stale screenshots cannot be credited.

## ADR-020 — Cohort terminal state and enrollment participation history

- Status: Accepted
- Decision: Completing a cohort closes each still-assigned enrollment as `completed`; cancelling a waiting or active cohort closes each still-assigned enrollment as `cancelled`. Terminal transitions retain active/unremoved learner and trainer cohort-membership rows for immutable attribution, but cancelled cohorts do not remain an actor-accessible learning workspace.
- Reason: A terminal cohort with an `assigned` enrollment falls out of both active and completed learner projections and corrupts reporting provenance. Deleting memberships would also erase who participated or trained the immutable publication.
- Consequence: Enrollment completion records participation closure only; it does not award mastery, issue a certificate, or imply individual competency. Those decisions remain server-owned and blocked on approved certificate/mastery rules. Completion/cancellation emits per-enrollment audit/outbox events while the cohort transition remains the single learner notification source.

## ADR-021 — Lab isolation and evidence trust boundary

- Status: Accepted architecture; live provider blocked by BLK-004
- Decision: Every live lab attempt has learner-isolated credentials, mutable target state, data, telemetry and evidence. A provider may reuse cohort-level infrastructure only when those boundaries remain technically partitioned and cross-learner access is impossible. Deterministic validators, reset/destroy, egress, retention and abuse controls sit inside the trusted server/provider boundary.
- Reason: Plan 09 permits an environment per attempt or cohort, while higher-priority Plan 10 requires no access between learners. Isolation is a data and credential property, not merely a deployment-count choice.
- Consequence: Client-supplied validation outcomes are never authoritative. Provider selection requires an isolation threat model, replayable scenario contract, short-lived secrets and cross-learner negative tests.

## ADR-022 — Federated identity, MFA and provisioning boundary

- Status: Accepted architecture; provider policy blocked by BLK-013
- Decision: Local authorization keys users by the internal account while federated identities are linked by verified issuer/subject pairs. OIDC/OAuth 2.1, MFA/AAL claims, account linking, JIT or SCIM provisioning, deprovisioning and session revocation remain provider-neutral server contracts until an approved IdP policy exists.
- Reason: Supporting plans require MFA and SCIM readiness, but neither a provider nor safe linking/deprovisioning rules are available.
- Consequence: Email alone never links accounts; deprovisioning must revoke effective sessions and scoped assignments; no supporting-plan persona silently becomes an authorization role.

## ADR-023 — Event evolution, tenant scope and external delivery

- Status: Accepted
- Decision: Canonical events carry event ID, occurrence time, schema version, idempotency key and correlation/causation metadata. Platform-global internal events may omit tenant scope, but only tenant-bound events with an active connection and explicit mapping may enter external delivery. Adapter envelopes align with CloudEvents concepts without coupling the domain model to one transport.
- Reason: Plan 08 requires tenant IDs on integration messages while the current internal outbox permits global events. The boundary must distinguish internal observability from tenant-owned external synchronization.
- Consequence: Consumers reject unknown incompatible major schemas, tolerate documented additive changes, deduplicate by event/connection, and never infer a tenant during delivery or replay.

## ADR-024 — External source-of-record defaults and conflict policy

- Status: Accepted defaults; concrete adapters blocked by BLK-006
- Decision: DiTeLe owns practical tasks, evidence, reviews and practice-derived mastery. An external LMS owns referenced theory content; the identity provider owns the federated subject. Enrollment and certificate ownership are configured explicitly per product, with exactly one source of record and the other system storing a mapped reference.
- Reason: These defaults are supplied by Plan 08 and prevent dual-writer ambiguity while vendor-specific capabilities remain unavailable.
- Consequence: Adapters cannot silently overwrite locally authoritative practice evidence. Reconciliation reports conflicts, follows the configured owner and requires an audited action for exceptional replay.

## ADR-025 — Mastery validity is separate from immutable XP

- Status: Proposed; calibration blocked by BLK-005
- Decision: Skill mastery may require time/version-scoped revalidation based on approved evidence currency, but XP remains an immutable event ledger with no punitive decay. Expiry creates an explainable reassessment/remediation need rather than subtracting earned history.
- Reason: Plan 09 requires mastery currency while the execution prompt prohibits punitive XP decay.
- Consequence: No production expiry window or formula is implemented before learning-owner calibration; algorithms and UI must name the evidence/version/time reason.

## ADR-026 — PWA and offline-sensitive-data policy

- Status: Accepted safety default
- Decision: DiTeLe V2 is a responsive browser application. Installability and service-worker caching remain disabled until an explicit cache/version/logout policy is verified. Sessions, unpublished content, drafts, submissions, evidence, trainer reviews and signed URLs must never enter a shared or persistent offline cache.
- Reason: Plans 08/10 use the term Web/PWA, but the required installability behavior is undefined and unsafe caching could expose learner evidence.
- Consequence: Offline UI may report connectivity and retry safely without claiming offline editing. A future PWA change requires cache-isolation, revocation, update and browser tests.

## ADR-027 — Human review scaling and calibration

- Status: Proposed; operational thresholds blocked by BLK-005/009
- Decision: Deterministic validation and rubric assistance may prioritize work; AI may draft visible suggestions; a human trainer remains authoritative for ambiguous quality and competency decisions. Workload/SLA balancing, reusable snippets, safe bulk actions, specialist escalation and inter-rater calibration require explicit auditability.
- Reason: Plan 09 expands the trainer workbench beyond a basic FIFO review queue.
- Consequence: Bulk or automated actions cannot silently accept/reject learner work. Calibration samples and agreement thresholds must be approved before production claims.

## ADR-028 — Provisional non-functional targets

- Status: Accepted as engineering baselines; production calibration blocked by BLK-009/010
- Decision: Track Plan-08 targets of 99.9% core-learning availability, mobile P75 LCP below 2.5 seconds, normal-read API P95 below 400 ms, normal-write API P95 below 800 ms, RPO at most 15 minutes, RTO at most 4 hours, 100% critical authorization policy coverage, rollback below 15 minutes and live sandbox startup P95 below 60 seconds.
- Reason: These are authoritative supporting-plan targets and are stronger than unspecified generic performance gates, while actual volume/hosting baselines remain unavailable.
- Consequence: Every measurement records environment, data volume and exclusions. Local results cannot be presented as production SLO proof.

## ADR-029 — Context-bound command receipts and recovery

- Status: Accepted
- Decision: An idempotency key is never sufficient identity by itself. Every retryable command receipt is bound to the authenticated actor, operation, tenant, exact aggregate/delivery context, immutable content or rule version, and a canonical payload fingerprint. Active principal and resource authorization are revalidated before a completed receipt is disclosed. In-flight external effects use stable child operation keys and a separately authorized reconciliation/compensation path so revocation does not leave resources permanently stranded or permit the original actor to continue privileged work.
- Reason: Independent review found task-start receipts that replayed before authorization and selected a different enrollment, plus lab commands whose exact retry could become unrecoverable after version or entitlement changes.
- Consequence: Browser identifiers are untrusted selectors only; server projections and database commands derive and compare exact context. Payload mismatch has a stable conflict result, lost responses can converge without duplicate effects, stale credentials are never replayed after revocation, and operational cleanup is auditable without weakening normal user authorization.

## ADR-030 — Published task snapshots own the submission response contract

- Status: Accepted for the Plan-10 WF-02 task kinds; future alternative task modes require an explicit versioned authoring decision
- Decision: The database validates a submission against the exact immutable publication pinned to its enrollment. A practical or knowledge task requires a bounded nonblank written answer; when an assessment exists, distinct selections must satisfy its published single/multiple and minimum/maximum rules; when any published task-skill mapping requires evidence, at least one finalized, actor-owned, exact-task evidence record is required. Placement remains its separate typed workflow. No browser default, mutable normalized row or Version-1 response shape can relax the snapshot contract.
- Reason: Plan 10 defines WF-02 as answer plus configured test selection plus evidence and requires server-validated behavior. Version 1 rendered the answer field and sent answer/selections/hint/duration but performed no trustworthy client validation, so its permissiveness is implementation debt rather than verified evidence that empty work is valid.
- Consequence: Publication must include all response/cardinality/evidence facts needed by the command; submit rejects blank, duplicate, out-of-range, oversized or foreign payloads before writing an immutable version. Evidence-only, assessment-only or otherwise alternative completion semantics require a new explicit authoring field, publication version, migration and tests instead of a silent special case.

## ADR-031 — Local Supabase recovery is exact-project and bounded

- Status: Accepted for local development only
- Decision: A local database reset may perform a bounded Auth health check and restart only the Kong container whose Docker labels exactly match the project ID parsed from this repository's Supabase config. It may not use broad container-name matching, print Docker output/secrets or alter another local Supabase project.
- Reason: Supabase reset can replace the Auth container while retained Kong state still points to the previous address, causing login-wide 502 responses even though users and passwords are correct.
- Consequence: `db:reset` runs the tested recovery helper. Production/staging gateway ownership remains a deployment concern under BLK-010 and never reuses this local Docker repair path.

## ADR-032 — External evidence uses the original HTTPS authority as a trust boundary

- Status: Accepted
- Decision: External evidence accepts only the original, whitespace-free, credential-free `https://` value with a non-empty syntactically valid authority. Client parsing/canonicalization cannot turn malformed input into an accepted URL, and every learner/trainer renderer revalidates before creating a link.
- Reason: Scheme-only or normalized URL checks can admit userinfo, hostless, triple-slash or otherwise deceptive inputs that later cross learner-to-trainer trust boundaries.
- Consequence: The application rejects early for usability, PostgreSQL remains authoritative, and stored malformed legacy values fail closed rather than rendering as links.
