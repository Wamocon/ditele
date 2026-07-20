# Test Plan

Last updated: 2026-07-20.

## Test layers and gates

| Layer | Scope | Gate |
|---|---|---|
| static | strict TypeScript, ESLint, format/diff checks, translation parity, forbidden client secrets | every change |
| unit | state transitions, policies, recommendations, mastery, rewards, safety rules, validators | every domain change |
| component | forms, errors, focus, tables/mobile alternatives, workspaces and decision bars | every visible feature |
| contract | canonical BFF schemas, legacy fixtures, provider adapters, event versions | adapter or API change |
| database | clean migrations, constraints, indexes, functions, RLS, tenant/resource isolation, seed determinism | every migration |
| integration | real local Supabase auth/data, transactions, idempotency, conflicts, outbox | every mutation workflow |
| E2E | WF-01 through WF-10 with seeded roles and durable state | every wave/release |
| accessibility | axe plus keyboard/focus/error-summary/reduced-motion/manual screen-reader spot checks | every critical screen |
| visual | desktop/tablet/mobile screenshots inspected against the code-native design system and approved rendered reference screens | every visible module |
| security | session expiry/revocation, CSRF/origin, CSP/HSTS/headers, direct URL, wrong role, cross-group/tenant, upload, rate-limit, secret/dependency/SAST/DAST/SBOM/container scans | every release |
| performance | bundle budgets, no request waterfalls, realistic queue/catalog volumes, layout stability | release candidate |
| operations | reset/reseed, backup/restore, deployment health, rollback/forward fix, monitoring alert | production gate |

## Mandatory scenario matrix

Every applicable workflow covers: correct role; wrong role; no/expired/revoked session; direct protected URL; cross-group and cross-tenant access; duplicate/idempotent request; stale version; concurrent decision; network/provider timeout; retry; empty/loading/error/offline/forbidden states; audit event and correlation ID.

Additional required cases:

- WF-01: duplicate enrollment, validation retention, rejection and locale persistence.
- WF-02: timer restore, autosave, hint use, unsupported/failed evidence upload, inactive task, duplicate submission and immutable revisions.
- WF-03: deleted task, transfer failure, ownership continuity and delayed answer.
- WF-04: unassigned trainer, comment-required policy, stale/concurrent review and transfer.
- WF-05: incomplete locale, malformed/resumable upload, unsaved draft recovery, immutable published version and impact confirmation.
- WF-06: invalid transition, duplicate group, removed trainer and unauthorized activation date.
- WF-07: rule conflict, prerequisite cycle, explainability, override reason/history and replay.
- WF-08: provision failure, cross-learner data/credential/telemetry isolation, deterministic reset/validation, variant/retake protection, budget/abuse limits, secret expiry and retention cleanup.
- WF-09: hidden-defect/final-answer leakage attempt, refusal, redaction, source display, quota, timeout, fallback and escalation.
- WF-10: duplicate/replayed event, signature failure, backoff, DLQ, reconciliation mismatch and authorized safe replay.
- Certificates/exports/privacy: opaque verification, missing file, export scope, large export, deletion exception/legal hold.
- Federation/provisioning: issuer/audience/nonce/state, account-link collision, required AAL, JIT/SCIM ownership, deprovisioning and session revocation (BLK-013 until a provider contract exists).
- Trainer calibration: SLA prioritization, workload balance, reusable snippet audit, unsafe bulk-action denial, specialist transfer and inter-rater sample reporting.
- Portfolio: typed artifact provenance, scenario/rubric/reviewer/assessment-condition trace, confidential-data redaction, revocation and employer-report authorization.
- PWA/offline: no sensitive service-worker cache, logout/revocation cache purge, version update and honest offline/retry state before installability is enabled.
- I18N: EN/DE/RU keys, date/number formatting, missing-key fallback and unsupported locale.

## Browser matrix

Until product supplies a production matrix, local verification targets current Playwright Chromium, Firefox and WebKit at 1440x1000 desktop, 1024x768 tablet and 390x844 mobile. This is a provisional engineering baseline, not a production support promise.

## Evidence

Commands and totals are recorded in this document during execution. Browser screenshots live under `artifacts/screenshots/<role>/`. Traces and reports are temporary unless they prove an unresolved blocker or defect. A screen cannot pass visual QA without direct render inspection against the shared tokens/components and approved learner-task, trainer-review and admin-editor reference screens, plus a five-point fidelity ledger. Generated concept imagery is not required under ADR-019.

## Provisional non-functional measurements

Plans 08/09 supply engineering targets, while BLK-009/010 still prevent production calibration. Every result must name the environment, data volume, network/CPU profile, sample window and exclusions.

| Test ID | Provisional target | Required evidence |
|---|---|---|
| NFR-AVAIL-01 | 99.9% core-learning availability; sandbox reported separately | production-like synthetic-check window and incident/error-budget calculation |
| NFR-WEB-01 | supported-mobile P75 LCP < 2.5 s | production build, named viewport/network, route/sample distribution and trace |
| NFR-API-01 | normal read P95 < 400 ms; normal write P95 < 800 ms excluding file processing | realistic seeded load, query plans, sample count and server timing |
| NFR-AUTH-01 | 100% critical authorization policy coverage | permission/resource/tenant matrix with positive and negative test IDs |
| NFR-RECOVERY-01 | RPO ≤ 15 min and RTO ≤ 4 h | timed backup/restore/reconciliation rehearsal in the selected target environment |
| NFR-ROLLBACK-01 | rollback or verified forward-fix < 15 min | timed release rehearsal with health and data-integrity evidence |
| NFR-LAB-01 | live lab startup P95 < 60 s | provider test environment, scenario mix, concurrency and cleanup/isolation evidence |

### Current verified automated gates

| Command/gate | Result | Scope note |
|---|---|---|
| `npm run typecheck` | pass on 2026-07-20 | current application, generated database types, auth throttle, responsive navigation and E2E source type-check |
| `npm run lint` | pass | current integrated source, tests and runtime scripts clean on 2026-07-20 |
| `npm run i18n:check` | pass, 163 keys × EN/DE/RU | shared-message key parity including Legal and Learning history navigation |
| `npm run secrets:check` | pass, 461 source files | browser-source privileged-key patterns; local HMAC/service keys remain server-only |
| `npm audit --audit-level=high` and production-only audit | pass, zero vulnerabilities | full and production dependency advisory gates repeated on 2026-07-20; unreviewed development-tool major upgrades were not applied |
| `npm test` | pass, 138 files / 799 tests | current integrated unit/component/contract/adapter/action/presenter baseline, including exact lost-response recovery, participant scope, URL validation, enrollment state parity, question-claim refresh and narrow Next transport-observer regressions |
| `npm run test:coverage` | pass, 138 files / 799 tests | 85.22% statements, 73.80% branches, 88.38% functions and 87.60% lines; configured thresholds pass with no new exclusions |
| `npm run test:local-auth-gateway` | pass, 7/7 | exact-project container discovery, healthy/no-op, bounded recovery, wrong-project rejection, failure redaction and execution outside repository CWD |
| `npm run build` | pass, 102/102 static parameter pages generated | production compilation and route collection use the generated local environment without client-secret leakage |
| `npm run db:reset` | pass | 43 ordered migrations through `100150` and four explicit local-only seed files apply cleanly; the bounded local Auth gateway check reports healthy and generic linked seeding is disabled |
| `npm run db:lint` | pass, `results: []` | strict error-level schema lint after the final authentication-rate-limit correction |
| `npx supabase test db supabase/tests/022_content_integrity_and_trainer_scope.test.sql` | pass, 81/81 | exact trainer pins, content integrity, stale/corrupt prerequisite/mastery and deterministic lock proofs |
| `npx supabase test db supabase/tests/098_authentication_rate_limits.test.sql` | pass, 30/30 | grants/RLS, ceilings, bounded cleanup/row creation and real two-session atomic consumption |
| `npx supabase test db supabase/tests/099_local_role_accounts.test.sql` | pass, 6/6 | four exact local identities, requested password and role assignment overlay |
| `npx supabase test db` | pass, 30 files / 1,129 assertions | complete database regression at `100150`, including RLS, tenant/resource isolation, constraints, idempotency, stale/concurrent commands and deterministic local accounts |
| `npm run verify` | pass | i18n, 461-file client-secret scan, strict typecheck, full ESLint, 138-file/799-test Vitest, 7/7 local gateway tests and a 102-page production build in one gate |
| Chromium E2E | pass, 32/32 in 1.4 minutes | freshly built production server and real local Supabase; public/auth/role isolation; learner task revision/resubmission/stale review; WF-03 claim URL refresh/answer/notification/archive; admin content and EN/DE/RU responsive routes with strict console/network checks |
