# Bug Register

Last updated: 2026-07-20.

## BUG-001 — assessment correctness exposed to learners

- Bug ID: BUG-001
- Severity: P1
- Feature and workflow: learner assessments; WF-02
- Environment and revision: local Supabase, foundation migrations through `20260717095200`
- Reproduction steps: authenticate as the seeded learner and select rows from `public.task_options`.
- Expected: learners can read option labels but cannot read correctness or model answers.
- Actual: the authenticated table grants and member-read RLS policies expose both `task_options.is_correct` and `task_localizations.model_answer`.
- Screenshot/log/correlation evidence: schema and policy inspection during task-route integration on 2026-07-17.
- Owner: `/root/foundation_data`
- Status: ✅ VERIFIED DONE
- Root cause: learner-visible option/localization presentation and privileged answer data share RLS-protected tables; PostgreSQL RLS filters rows, not columns.
- Fix: migration `20260717098000_protect_assessment_solutions.sql` moved correctness to `task_option_answers` and localized model answers to `task_model_answers`, removed the sensitive columns from learner-readable tables, migrated seed data, and applied privileged grants/RLS.
- Regression test (or reason automation is impossible): `003_assessment_solution_isolation.test.sql` passes 7 assertions: safe option labels remain learner-readable, solution rows return zero for the learner JWT, and the assigned trainer can read both privileged answer sets.

## BUG-002 — public catalog rejected PostgreSQL timestamps

- Bug ID: BUG-002
- Severity: P1
- Feature and workflow: public catalog; WF-01
- Environment and revision: Chromium against real local Supabase on 2026-07-17
- Reproduction steps: open `/en/catalog`, `/de/catalog`, or `/ru/catalog`.
- Expected: the seeded localized course is rendered.
- Actual: `CatalogPageSchema` rejected the PostgreSQL offset timestamp as an invalid ISO datetime and the route rendered an error.
- Screenshot/log/correlation evidence: QA Playwright/server log reported `publishedAt: Invalid ISO datetime` from `catalog-service.ts:22`.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: the canonical DTO requires normalized ISO-8601 UTC while the route mapper passed the raw PostgreSQL timestamp representation.
- Fix: normalize the database timestamp with `Date#toISOString()` at the catalog adapter boundary.
- Regression test (or reason automation is impossible): EN/DE/RU real-database catalog list and detail scenarios passed in Chromium on 2026-07-17.

## BUG-003 — protected child queries ran before guest redirect

- Bug ID: BUG-003
- Severity: P2
- Feature and workflow: secure role routes; WF-01/WF-02/WF-04
- Environment and revision: Chromium against real local Supabase on 2026-07-17
- Reproduction steps: as a guest, directly open `/en/learn`, `/en/trainer`, and `/en/admin`.
- Expected: redirect to localized login before any protected data query.
- Actual: the final login page rendered, but concurrently evaluated child pages attempted anonymous enrollment/submission reads and logged authorization errors.
- Screenshot/log/correlation evidence: QA server logs contained `AuthenticationRequiredError` plus anonymous `permission denied` for protected tables.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: Next.js can evaluate a page segment while its parent layout resolves; authorization existed only in the role layout.
- Fix: add a cached page-level authorization gate before every protected child data read while retaining layout and RLS defense in depth.
- Regression test (or reason automation is impossible): all three guest protected-route redirects passed without protected child-query errors in Chromium on 2026-07-17; wrong-role coverage remains a separate clean-run gate.

## BUG-004 — smooth-scroll route transitions emitted a framework warning

- Bug ID: BUG-004
- Severity: P3
- Feature and workflow: application shell and navigation; all browser workflows
- Environment and revision: Chromium against the local Next.js application on 2026-07-17
- Reproduction steps: navigate between client routes while `html { scroll-behavior: smooth; }` is active.
- Expected: route transitions complete without application or framework console warnings.
- Actual: Next.js logged `Detected scroll-behavior: smooth on the <html> element` on every client route transition.
- Screenshot/log/correlation evidence: QA zero-console-warning gate failed 7 otherwise successful Chromium scenarios.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: global smooth scrolling was enabled without the root layout opt-in attribute required by Next.js route scrolling.
- Fix: add `data-scroll-behavior="smooth"` to the root `<html>` element and retain the reduced-motion override.
- Regression test (or reason automation is impossible): the post-fix Chromium route suite completed with zero smooth-scroll console warnings on 2026-07-17.

## BUG-005 — public header overflowed the mobile viewport

- Bug ID: BUG-005
- Severity: P2
- Feature and workflow: responsive public shell and catalog; WF-01
- Environment and revision: Chromium at 390 × 844 against local Supabase on 2026-07-17
- Reproduction steps: open `/en/catalog` at a 390-pixel viewport and inspect the document width.
- Expected: public navigation remains within the viewport with no horizontal scrolling.
- Actual: `documentElement.scrollWidth` was 477 pixels; `nav.public-nav` ended at 477.38 pixels because the 167 × 17 logo was scaled to 34 pixels high and therefore approximately 334 pixels wide.
- Screenshot/log/correlation evidence: Playwright responsive assertion and DOM bounding rectangles for `nav.public-nav`, the theme toggle and sign-in action.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: the header set only a fixed doubled image height and retained the SVG aspect ratio, leaving insufficient width for the mobile navigation controls.
- Fix: render the supplied brand SVG at its intended 167-pixel width, capped at 45 viewport-width units, with automatic height.
- Regression test (or reason automation is impossible): the refreshed 390-pixel Chromium catalog/header scenario passed the explicit `scrollWidth <= clientWidth` assertion and the full Chromium suite passed 19/19 on 2026-07-18.

## BUG-006 — trainer review decision form was hidden

- Bug ID: BUG-006
- Severity: P1
- Feature and workflow: trainer rubric decision; WF-04 and WF-02 revision loop
- Environment and revision: Chromium at 1440 × 1000 against the real local Supabase stack on 2026-07-18
- Reproduction steps: submit the seeded learner task, open it from the trainer submission queue, and inspect the rubric controls.
- Expected: the assigned rubric, score input, feedback field, and accept/revision actions are visible and keyboard operable.
- Actual: the score input existed in the DOM but was hidden; the complete decision form was absent from the accessibility tree, blocking review.
- Screenshot/log/correlation evidence: `test-results/learner-task-atomic-learne-f35b0-and-resubmission-are-atomic-chromium/error-context.md` and `test-failed-1.png`.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: a CSS selector hid `aside > form:last-child` to suppress the unavailable transfer form. After transfer rendering became conditional, the valid rubric form became the last form and matched the selector.
- Fix: remove the positional hiding rule; transfer controls are now omitted structurally when no valid targets exist.
- Regression test (or reason automation is impossible): component visibility tests pass and the deterministic Chromium learner→trainer revision/resubmission workflow completed with the rubric and both decision controls visible; full suite 19/19 on 2026-07-18.

## BUG-007 — unit coverage release threshold not met

- Bug ID: BUG-007
- Severity: P2
- Feature and workflow: automated quality gate; all workflows
- Environment and revision: local Vitest coverage run on 2026-07-18
- Reproduction steps: run `npm run test:coverage`.
- Expected: configured global thresholds pass without exclusions or threshold reduction.
- Actual: the original deficit was corrected, but the current 98-file/470-test tree introduced enough untested server read/action branches to regress branch coverage to 66.17% against the unchanged 70% gate. Statements are 80.93%, functions 85.53%, and lines 82.99%.
- Screenshot/log/correlation evidence: Vitest coverage summary in the coordinator test log.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: the first hardening wave covered reusable presenters and domain services, but later server-side administration/cohort read boundaries and their denial, error, fallback and empty-state branches entered the measured source set without corresponding behavior tests.
- Fix: preserved the coverage scope and thresholds and added 26 behavior-focused tests for trainer/cohort server boundaries, including authorization/resource denial, empty assignments, manager/trainer paths, localized projections, missing pins and parent/child query failures. No coverage exclusion was added. The work also exposed and corrected BUG-039.
- Regression test (or reason automation is impossible): `npm run test:coverage` passes all 100 files/496 tests at 84.99% statements, 71.22% branches, 87.76% functions and 87.00% lines against unchanged 75/70/75/75 thresholds; focused ESLint is clean.

## BUG-008 — stale review conflict notice was lost during revalidation

- Bug ID: BUG-008
- Severity: P2
- Feature and workflow: concurrent trainer review; WF-04
- Environment and revision: two Chromium tabs against real local Supabase on 2026-07-18
- Reproduction steps: open one submission in two trainer tabs, request revision in the first, then attempt acceptance from the stale second tab.
- Expected: the second decision is rejected and the trainer sees both an explicit localized conflict notice and the authoritative updated review state.
- Actual: the database rejected the stale decision and the server action returned a conflict payload, but Next route revalidation replaced the client panel with the read-only revision view before the action alert remained visible.
- Screenshot/log/correlation evidence: retained Playwright trace response resource `f927069e…htc`; authoritative page showed `Revision required` with no active decision controls.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: transient `useActionState` feedback was owned by a client component that unmounted when another tab's successful decision invalidated and refreshed the route.
- Fix: redirect stale/idempotency conflicts to the refreshed detail with `?notice=stale`; the server page renders a localized `role="alert"` state panel above the authoritative current submission view.
- Regression test (or reason automation is impossible): targeted trainer tests pass; the refreshed two-tab Chromium case rejected the stale decision, displayed the localized server-owned alert and authoritative revision state, and exposed no stale controls; full suite 19/19 on 2026-07-18.

## BUG-009 — catalog cards lacked list reset and internal spacing

- Bug ID: BUG-009
- Severity: P3
- Feature and workflow: public catalog visual hierarchy; WF-01
- Environment and revision: inspected 390 × 844 Chromium screenshot on 2026-07-18
- Reproduction steps: open the English catalog on a 390-pixel viewport and inspect the course list/card boundary.
- Expected: the course card has consistent internal padding, no browser-default list marker, and compact readable facts.
- Actual: the list bullet rendered outside the card and card text touched the panel border; definition values retained browser-default indentation.
- Screenshot/log/correlation evidence: `artifacts/screenshots/public/catalog-en-mobile.png` visual inspection.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: `CourseCatalog` combined the generic `panel` and `stack` primitives without a catalog list reset, panel body, or component-specific fact layout.
- Fix: add a scoped catalog CSS module that resets list styles, applies responsive card padding, and renders duration/task facts as an accessible responsive grid.
- Regression test (or reason automation is impossible): TypeScript and owned ESLint pass; refreshed `catalog-en-mobile.png` has no marker or boundary collision and its 390-pixel overflow assertion passed in the 19/19 Chromium run.

## BUG-010 — generic stacked panels rendered without body spacing

- Bug ID: BUG-010
- Severity: P2
- Feature and workflow: learner dashboard and task workspace; WF-02
- Environment and revision: desktop and 390 × 844 Chromium screenshots inspected on 2026-07-18
- Reproduction steps: open the learner dashboard or seeded task and inspect any `panel stack` surface.
- Expected: headings, instructions, choices and actions have consistent responsive spacing from the panel boundary.
- Actual: the generic `panel` primitive added a border but no padding unless callers used a separate `panel__body`; stacked panels placed content directly against their borders and retained browser margins in addition to stack gaps.
- Screenshot/log/correlation evidence: `artifacts/screenshots/learner/dashboard-desktop.png`, `task-draft-desktop.png`, and `task-draft-mobile.png`.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: many semantic single-body panels intentionally used `className="panel stack"`, but the shared CSS only padded explicit `panel__header`, `panel__body`, and `panel__footer` descendants.
- Fix: give the established `panel stack` composition responsive internal padding, normalize direct typographic child margins, and add task-specific assessment/choice/evidence styling plus a reset for dashboard course lists.
- Regression test (or reason automation is impossible): owned task/review tests and targeted ESLint pass; refreshed dashboard and task desktop/mobile screenshots show consistent panel spacing, and Chromium workflow/overflow/axe gates passed 19/19.

## BUG-011 — mobile application shell hid the current role

- Bug ID: BUG-011
- Severity: P2
- Feature and workflow: secure application shell; all authenticated workflows
- Environment and revision: Firefox/WebKit/Chromium viewport audit at widths up to 720 pixels on 2026-07-18
- Reproduction steps: sign in as any seeded role at a mobile viewport and inspect the persistent header.
- Expected: the current localized role remains visibly identifiable, including on mobile, without causing horizontal overflow.
- Actual: the sidebar was hidden and `.app-shell__profile span` hid both the name and avatar, leaving no visible role or user context.
- Screenshot/log/correlation evidence: cross-browser QA viewport diagnosis and `artifacts/screenshots/learner/task-draft-mobile.png`.
- Owner: `/root`
- Status: 🔁 REWORK
- Root cause: the compact-header media rule removed every profile span without providing an equivalent mobile identity surface.
- Fix: show the localized role persistently inside the mobile menu control with an accessible user-and-role group label; keep the username and theme control available inside the opened menu and compact the smallest viewport header.
- Regression test (or reason automation is impossible): TypeScript and targeted ESLint pass; cross-browser visible-role, keyboard and overflow assertions are running.

## BUG-012 — trainer review displayed selected-answer UUIDs

- Bug ID: BUG-012
- Severity: P2
- Feature and workflow: submission inspection and trainer decision; WF-04
- Environment and revision: English and Russian trainer-review screenshots against local Supabase on 2026-07-18
- Reproduction steps: submit an assessment option and open the resulting trainer review.
- Expected: the trainer sees the localized answer label captured by the submission, while stable IDs remain internal contract data.
- Actual: the review rendered the raw `task_option_id` UUID, which was not meaningful enough for an informed decision.
- Screenshot/log/correlation evidence: `artifacts/screenshots/trainer/review-desktop.png` and `review-ru-mobile.png`.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: the review projection carried only immutable selected IDs and did not join the safe learner-visible option labels for presentation.
- Fix: resolve selected IDs through `task_options`, localize labels with the established fallback policy, preserve IDs in the immutable snapshot, and render a semantic answer list in active and read-only review views.
- Regression test (or reason automation is impossible): review component/service tests (8 assertions across 2 files) and targeted ESLint pass; the real-database Chromium review and stale-conflict screenshots render the localized `Boundary analysis` label and the full suite passed 19/19.

## BUG-013 — E2E web server and runtime targeted different default ports

- Bug ID: BUG-013
- Severity: P1
- Feature and workflow: CI/browser release gate; all browser workflows
- Environment and revision: Playwright configuration and GitHub Actions audit on 2026-07-18
- Reproduction steps: run `npm run test:e2e` without `DITELE_E2E_BASE_URL`, especially in the CI browser job.
- Expected: Playwright starts or reuses exactly the origin that every absolute test navigation targets.
- Actual: `playwright.config.ts` started and waited for `127.0.0.1:3000`, while the shared runtime navigated to `localhost:3001`; CI could test no server or an unrelated local process.
- Screenshot/log/correlation evidence: static comparison of the Playwright `webServer.url` and `APP_BASE_URL` defaults during release-gate audit.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: the manual QA port override became a hard-coded helper default but was not propagated to the Playwright server configuration.
- Fix: use one environment-aware `DITELE_E2E_BASE_URL` with the same `127.0.0.1:3000` default in config and runtime; CI now builds and starts the production Next server, while explicit local QA origins remain supported.
- Regression test (or reason automation is impossible): strict TypeScript and targeted ESLint pass; the complete production-mode cross-browser run and CI-equivalent server startup are pending after the active migration wave.

## BUG-014 — primary role navigation contained dead destinations

- Bug ID: BUG-014
- Severity: P1
- Feature and workflow: authenticated application shell; learner, trainer, content-administrator and platform-administrator workflows
- Environment and revision: route-to-navigation audit on 2026-07-18
- Reproduction steps: authenticate as a seeded role and follow Skills, Portfolio, Certificates, Groups, Learner progress, Review history, Tasks, Users, or Settings from the primary sidebar.
- Expected: every primary navigation action opens an authorized, localized application surface with real data or an explicit safe capability state.
- Actual: nine advertised destinations initially had no route implementation and returned the framework 404 page. After those routes were added, the shared administration shell still advertised Groups, Users, Applications and Settings to content-only administrators even though the corresponding pages correctly denied them.
- Screenshot/log/correlation evidence: static comparison of `src/shared/ui/app-shell.tsx`, `src/shared/i18n/routes.ts`, `src/app/[locale]` route files and the server-resolved route permissions; the automated inventory now covers all 33 protected pages.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: the role shell navigation was created ahead of its connected vertical slices without a release gate checking that every advertised route resolves and is authorized for every admitted shell role.
- Fix: every advertised destination now has an explicit page boundary; a server-derived content-administrator shell exposes only Courses and Tasks, while a principal that also has the platform `admin` role retains the full administration shell. Unimplemented mutations remain explicit safe capability states.
- Regression test (or reason automation is impossible): an AST-backed contract audits all 33 protected pages, proves authorization precedes the first detected sensitive read, and checks that every shell navigation target is permission-reachable; dedicated component tests prove content-only and combined-role navigation. Current full Vitest/coverage passes 100 files/496 tests, with ESLint, 160-key EN/DE/RU parity and the 402-file secret scan clean. Production browser, responsive and keyboard verification remain pending.

## BUG-015 — learner-writable evidence metadata could display as verified

- Bug ID: BUG-015
- Severity: P1
- Feature and workflow: learner portfolio and evidence ledger; WF-08
- Environment and revision: coordinator security review of the learner portfolio projection on 2026-07-18
- Reproduction steps: create learner-owned evidence with `evidence_kind = 'review'` and metadata containing an accepted-looking decision, then include it in the learner portfolio.
- Expected: only a protected deterministic validator or authoritative review linkage can confer a verified badge.
- Actual: the initial projection treated learner-writable `{ decision: "accepted" }` metadata as verification even when no protected validation result existed.
- Screenshot/log/correlation evidence: source/data-policy comparison of `learner-portfolio-record.ts`, `evidence_owner_insert`, and `validation_results_scoped_read` during integration review.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: presentation logic treated descriptive evidence metadata as an authority-bearing review decision.
- Fix: stop selecting metadata for this projection and derive `verified` exclusively from a protected `validation_results.outcome = 'passed'` row; unvalidated review evidence remains honestly `recorded`.
- Regression test (or reason automation is impossible): learner portfolio model/component suite passes 4/4, including the distinction between recorded and deterministically verified evidence; targeted ESLint is clean.

## BUG-016 — multiple state panels reused one heading identifier

- Bug ID: BUG-016
- Severity: P2
- Feature and workflow: shared empty/error/capability states; all workflows
- Environment and revision: accessibility review while composing the admin task inventory on 2026-07-18
- Reproduction steps: render two `StatePanel` components on the same page, such as an empty result plus a read-only capability notice, and inspect their `aria-labelledby` references.
- Expected: every named region references its own unique heading identifier.
- Actual: every instance emitted `id="state-panel-title"`, creating duplicate IDs and ambiguous accessible names.
- Screenshot/log/correlation evidence: shared component source inspection and co-located component regression test.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: the reusable component used a global literal identifier rather than an instance-scoped identifier.
- Fix: derive a stable per-instance heading ID with React `useId` and reference it from the containing region.
- Regression test (or reason automation is impossible): `state-panel.test.tsx` passes and verifies two regions have distinct references and the correct accessible names; targeted ESLint is clean.

## BUG-017 — public catalog rendered mutable metadata instead of the published snapshot

- Bug ID: BUG-017
- Severity: P1
- Feature and workflow: immutable content publishing and public catalog; WF-01/WF-05
- Environment and revision: coordinator data-flow audit on 2026-07-18
- Reproduction steps: publish a version, then change a shared `course_localizations` row while the published version remains active and open the public catalog.
- Expected: public rendering remains byte-for-byte derived from the reviewed, immutable published snapshot.
- Actual: catalog list/detail queried live course/localization rows; the deterministic seed compounded this by storing only `{"seed":true,"version":1}` as its published snapshot.
- Screenshot/log/correlation evidence: source comparison of `catalog-repository.ts`, `build_content_snapshot`, and the seeded `content_versions.snapshot` value.
- Owner: `/root/published_snapshot_catalog`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: the original catalog projection predated the immutable lifecycle and no release gate required it to consume the new canonical snapshot; the seed published before assembling its render graph.
- Fix: migration `99400` now exposes only allow-listed fields from the latest valid immutable `schema_version=1` publication snapshot, fails closed on malformed snapshots, excludes tenant/private content, and the catalog repository consumes only those strict RPC projections. The seed now publishes after assembling its complete graph.
- Regression test (or reason automation is impossible): pgTAP `014` passes 33/33; focused projection/repository tests pass 9/9; lint passes; clean-reset inspection proves one stage/task and no answer, correctness, or object-key fields. EN/DE/RU production-browser verification remains pending.

## BUG-018 — organization administrators could not resolve member profiles

- Bug ID: BUG-018
- Severity: P2
- Feature and workflow: organization people administration; WF-06
- Environment and revision: RLS and route integration review on 2026-07-18
- Reproduction steps: sign in as the seeded organization administrator and open `/en/admin/users`.
- Expected: an authorized organization manager sees minimal member display context without authentication-account data.
- Actual: organization memberships and roles were visible, but the self-only profile policy hid other members, so the initial UI displayed an explicit unavailable state.
- Screenshot/log/correlation evidence: policy comparison of `organization_memberships_scoped_read`, `profiles_self_read`, and the admin-user data projection.
- Owner: `/root/scoped_read_contracts`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: raw profile RLS correctly protected profiles but no narrow actor-derived organization-management projection existed.
- Fix: migration `99300` added `list_organization_member_profiles` with active-tenant/permission checks and no auth/email/secret fields; the admin-user route now consumes and validates that RPC.
- Regression test (or reason automation is impossible): pgTAP `013` passes 48/48 and the focused admin model/view suite passes 11/11; generated-type, clean build and seeded browser checks remain pending.

## BUG-019 — notification recipients could rewrite protected notification content

- Bug ID: BUG-019
- Severity: P1
- Feature and workflow: notifications and preferences; WF-01 through WF-06
- Environment and revision: coordinator RLS audit on 2026-07-18
- Reproduction steps: authenticate as a notification recipient and issue a direct update against that notification's `event_type`, `template_key`, `payload`, delivery state, or deduplication key.
- Expected: recipients may mark their own notifications read only; event/delivery content remains system-owned.
- Actual: `notifications_self_update` authorized an update to every column as long as `recipient_id` remained the current user.
- Screenshot/log/correlation evidence: `20260717095000_authorization_rls_and_workflows.sql` policy inspection.
- Owner: `/root/learner_account_notifications`
- Status: 🟣 IN REVIEW
- Root cause: row-scoped RLS was mistaken for column-level mutation control.
- Fix: migration `99500` revokes direct profile/notification/preference DML and exposes only actor-derived field-limited commands with CAS, idempotency receipts, and audit events.
- Regression test (or reason automation is impossible): pgTAP `015` passes 44/44, the full database suite passes, focused UI/action/model tests pass 18/18, and strict lint is clean; generated types and learner browser verification remain pending.

## BUG-020 — empty prerequisite graphs were reported as unavailable

- Bug ID: BUG-020
- Severity: P2
- Feature and workflow: learner skills and learning-path explanation; WF-07
- Environment and revision: coordinator contract review on 2026-07-18
- Reproduction steps: read an authorized skill taxonomy containing no prerequisite edges.
- Expected: the UI states that no visible prerequisites are recorded.
- Actual: visibility was inferred from `edgeRows.length > 0`, so an authoritative empty result was presented as a database/RLS capability failure.
- Screenshot/log/correlation evidence: `buildLearnerSkillCollection` source and empty-edge unit fixture.
- Owner: `/root/scoped_read_contracts`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: result cardinality was used as a proxy for contract availability.
- Fix: use `list_visible_skill_prerequisites` as the authoritative scoped projection and pass availability independently from the returned edge count.
- Regression test (or reason automation is impossible): pgTAP `013` passes and learner skill/question focused suites pass 11/11; generated-type and browser checks remain pending.

## BUG-021 — question transfer UI used submission-review trainer eligibility

- Bug ID: BUG-021
- Severity: P2
- Feature and workflow: trainer question transfer; WF-03
- Environment and revision: coordinator permission-contract review on 2026-07-18
- Reproduction steps: assign a trainer `review.manage` without `question.manage`, then open the question transfer candidate list.
- Expected: only active same-cohort trainers with effective `question.manage` are offered.
- Actual: the UI reused `list_active_cohort_trainers`, whose eligibility is intentionally based on submission review ownership; the database transfer command would later reject an invalid selection.
- Screenshot/log/correlation evidence: candidate data helper and transfer-RPC permission comparison.
- Owner: `/root/scoped_read_contracts`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: two workflows shared a display DTO but not the same authorization predicate.
- Fix: add and consume a dedicated `list_active_question_trainers` projection that validates active organization/cohort/profile memberships and the scoped question permission.
- Regression test (or reason automation is impossible): pgTAP `013` passes and the question workflow suite passes 6/6; generated-type and real browser transfer checks remain pending.

## BUG-022 — database lint findings did not fail the CI command

- Bug ID: BUG-022
- Severity: P1
- Feature and workflow: database/security release gate; all workflows
- Environment and revision: clean-reset integration gate on 2026-07-18
- Reproduction steps: run `supabase db lint --local` against migration `99500` while its four receipt predicates contain ambiguous `actor_id` references.
- Expected: an error-level schema finding exits non-zero and blocks CI.
- Actual: the CLI reported four error-level findings but exited successfully because no `--fail-on` threshold was configured.
- Screenshot/log/correlation evidence: clean-reset lint output named `update_own_profile`, `mark_notification_read`, `mark_all_notifications_read`, and `set_notification_family_preferences`; CI used the default command.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: emitting a lint severity and selecting a process failure threshold are separate Supabase CLI controls.
- Fix: add `npm run db:lint` with `--level error --fail-on error` and make the database CI job call that gate.
- Regression test (or reason automation is impossible): prove the command fails while the known ambiguity exists and passes after corrected migration `99500`; pending the account-command DB window.

## BUG-023 — learner pages read mutable normalized course content

- Bug ID: BUG-023
- Severity: P1
- Feature and workflow: learner dashboard/course/task workspace; WF-02
- Environment and revision: coordinator publication-boundary audit on 2026-07-18
- Reproduction steps: assign a learner to a cohort, publish or edit another content version, then query the learner course/task routes.
- Expected: assigned learning uses exactly the cohort-pinned immutable snapshot and never reveals draft, other-version, or hidden assessment fields.
- Actual: learner routes queried active normalized course tasks and localizations without an immutable version boundary.
- Screenshot/log/correlation evidence: source review of `learn/data.ts`, `learn/courses/[courseId]/data.ts`, and `learn/tasks/[taskId]/data.ts`.
- Owner: `/root/learner_published_content_boundary`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: learner repositories predated the canonical publication snapshot and cohort version pin.
- Fix: migration `99800` exposes exactly three actor-derived allow-listed projections for requested/approved previews, assigned active learning, completed history and available task detail over a validated immutable publication and exact cohort pin. Completed history is accepted-or-locked and task detail remains active-only. Flexible prerequisite enforcement remains separately tracked as BUG-033.
- Regression test (or reason automation is impossible): `018` passes 68/68; the current clean reset applies 33 migrations plus three seeds without warnings; strict lint is clean; full DB passes 19 files/782 assertions and the current full Vitest/coverage suite passes 100 files/496 tests. Generated types and production browser WF-02 remain pending.

## BUG-024 — cohorts did not pin an immutable content version

- Bug ID: BUG-024
- Severity: P1
- Feature and workflow: content assignment and cohort lifecycle; WF-05/WF-06
- Environment and revision: coordinator cohort/content integration audit on 2026-07-18
- Reproduction steps: start a cohort for a course, then publish a newer course version and resolve the cohort task graph.
- Expected: the cohort continues using the explicitly assigned, reviewed publication for its whole lifecycle and history.
- Actual: `cohorts` stored only `course_id`; reads could select the latest version, silently changing an active learning experience.
- Screenshot/log/correlation evidence: cohort schema, schedule contract, and Plan 10's publish-version-to-group workflow comparison.
- Owner: `/root/cohort_lifecycle_schedule`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: Version 1 course-level grouping was preserved without a Version 2 content-version assignment boundary.
- Fix: migration `99700` adds the exact pin/FK/index and insert/transition guards, makes the pin immutable after waiting, replaces lifecycle and schedule mutations with actor-derived CAS/idempotent commands, preserves active archived pins, includes pinned cohorts in archive impact, and closes direct lifecycle/date/schedule DML. The deterministic seed now activates only after publication through the audited command.
- Regression test (or reason automation is impossible): warning-free clean reset passes 31 migrations and three seeds; pgTAP `017` passes 88/88 and the full database suite passes 17 files/626 assertions with strict lint clean. Focused cohort tests pass 25/25 and full Vitest passes 92 files/379 tests. Generated checked-in types, scoped snapshot refactor, and production browser WF-06 remain pending.

## BUG-027 — global course definitions were tenant-owned and raw drafts remained readable

- Bug ID: BUG-027
- Severity: P1
- Feature and workflow: content publication, catalog, cohort delivery, trainer review and mastery; WF-01/WF-04/WF-05/WF-07
- Environment and revision: coordinator/global-scope audit through migration `99700` on 2026-07-18
- Reproduction steps: inspect the seeded global course task-rubric assignment and rubric ownership, then authenticate as a non-content-manager and query global normalized content/version/child tables directly.
- Expected: a global publication references only globally owned definitions; tenant customization uses a tenant clone; consumers read only actor-authorized immutable projections and cannot enumerate draft/in-review graphs or media object metadata.
- Actual: corrected by migration `100000` on 2026-07-18: global publications now use global rubrics/assignments/categories/skill dependencies, tenant publications accept only global or same-tenant definitions, ownership becomes immutable, and ambiguous legacy overlays abort migration. Learners consume only validated immutable projections; trainers receive exact cohort/submission-pinned safe context, while draft/in-review normalized graphs, raw media metadata and hidden answer tables remain denied.
- Screenshot/log/correlation evidence: migration `20260717100000_global_content_scope_and_prerequisites.sql`, corrected assessment seed, pgTAP `021`, exact learner/question/review/skills consumers and coordinator clean-reset/lint/full-suite/type-generation rerun.
- Owner: `/root/global_content_scope_fix`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: initial nullable course ownership was not propagated consistently to definition schemas and assignment invariants, while normalized-table RLS was retained after immutable projection RPCs were introduced.
- Fix: migration `100000` repairs only provably unambiguous seed ownership, adds global/tenant uniqueness and definition-scope/immutability triggers, tenant-qualifies mastery identities/evidence/RLS, removes broad normalized-content reads, and exposes actor-derived exact-pin learner, question and review projections. Review effects resolve the immutable snapshot rubric and tenant-qualified mastery key.
- Regression test (or reason automation is impossible): coordinator independently verified the frozen hashes, a clean 35-migration/three-seed reset, strict lint, focused pgTAP `021` 47/47, complete DB 21 files/898 assertions, regenerated checked-in types and clean typecheck; six connected consumer files pass 24/24. Independent static review and production browser/WF-01/04/05/07 verification remain before closure; direct DML remains BUG-028.

## BUG-028 — broad authenticated DML could bypass authoritative workflow commands

- Bug ID: BUG-028
- Severity: P1
- Feature and workflow: attempts, submissions, reviews, questions, enrollment and other stateful workflows; WF-01 through WF-07
- Environment and revision: authorization audit through migration `99700` on 2026-07-18
- Reproduction steps: authenticate as a row-scoped learner or trainer and issue direct table mutations permitted by the broad authenticated CRUD grant and permissive `FOR ALL` policies, instead of calling the audited RPC.
- Expected: browser sessions can read only authorized projections and can mutate business state exclusively through validated, CAS/idempotent, audited server/database commands.
- Actual: later targeted revokes close some tables, but direct DML remains on multiple workflow tables; for example learner-owned attempt/draft/version rows and trainer review/question paths can bypass portions of named state-machine, immutable-snapshot and side-effect enforcement.
- Screenshot/log/correlation evidence: final-head static audit reconciles all 98 public tables: 49 effective direct-DML surfaces, 35 dormant DML grants, eight inert write-policy surfaces and six fully closed tables. The production TypeScript tree contains no direct Supabase insert/update/upsert/delete consumer, so command-only closure is viable without converting current UI mutations.
- Owner: `/root/mutation_boundary_audit`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: row-level resource authorization was treated as a mutation contract; RLS cannot by itself limit changed columns, legal transitions, CAS, idempotency, audit or transactional side effects.
- Fix: reserve corrective migration `100100` to revoke unsafe direct DML and expose only field-limited authoritative commands, staged after required replacement RPCs exist. The same command hardening must bind `start_attempt` receipt replay to the exact task payload: its current learner/key-only lookup silently returns an older attempt when the key is reused for another task.
- Regression test (or reason automation is impossible): exhaustive pgTAP `023` ACL/state-forgery/unsafe-execute/side-effect matrix and connected application regression are pending after corrective pgTAP `022` is integrated.

## BUG-025 — published competency mappings were mutable and absent from snapshots

- Bug ID: BUG-025
- Severity: P1
- Feature and workflow: content publication, competency evidence and mastery; WF-05/WF-07
- Environment and revision: coordinator content-graph audit on 2026-07-18
- Reproduction steps: publish a task version, then update/delete its `task_skill_mappings` or task prerequisite rows.
- Expected: reviewed competency/rule mappings are immutable, fingerprinted, and present in the publication snapshot used to explain mastery and prerequisites.
- Actual: the published-graph guard and snapshot builder omitted both mapping families, so review fingerprints did not cover them.
- Screenshot/log/correlation evidence: comparison of `content_owner_version`, guarded table list, `build_content_snapshot`, and the competency schema.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: the initial publication graph focused on render content and rubrics but did not close the competency dependency graph.
- Fix: migration `99600` adds scope/cycle guards, serializes graph mutations against publication, guards published mappings/rules, enriches the safe snapshot, and makes readiness/fingerprints cover complete 10,000-point mapping sets.
- Regression test (or reason automation is impossible): pgTAP `016` passes 21/21, content lifecycle/projection regressions pass 131/131, strict lint and the full 16-file/538-assertion suite pass; generated types and browser authoring checks remain pending.

## BUG-026 — marking in-app notifications read removed pending deliveries

- Bug ID: BUG-026
- Severity: P1
- Feature and workflow: notification read/delivery lifecycle; WF-01 through WF-06
- Environment and revision: coordinator migration `99500` integration review on 2026-07-18
- Reproduction steps: create a `pending` notification, then mark it read before the email/push delivery worker claims it.
- Expected: `read_at` changes monotonically while the independent delivery state remains eligible for its configured channels.
- Actual: the read command set the shared `state` to `read`; the delivery queue index selects only `pending|failed`, so unread interaction could suppress delivery.
- Screenshot/log/correlation evidence: comparison of `mark_notification_read`, `mark_all_notifications_read`, and `notifications_delivery_queue_idx`.
- Owner: `/root/learner_account_notifications`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: read state and channel-delivery state were conflated in the original enum/table design despite separate `read_at` and `delivery_attempts` records.
- Fix: read commands now mutate only `read_at`, preserve pending/delivered/failed state, exclude both cancellation signals, and the inbox derives unread only from `read_at` with a stable pagination boundary.
- Regression test (or reason automation is impossible): updated pgTAP `015` passes 44/44 and the full 16-file/538-assertion suite passes; learner production-browser notification checks remain pending.

## BUG-029 — terminal cohort transitions left enrollments in assigned state

- Bug ID: BUG-029
- Severity: P1
- Feature and workflow: cohort completion/cancellation, learner history, certification eligibility and reporting; WF-06
- Environment and revision: coordinator integration review of migration `99700` on 2026-07-18
- Reproduction steps: assign an approved enrollment to an active cohort, call `transition_cohort(..., 'completed', ...)`, then inspect the enrollment lifecycle.
- Expected: cohort completion atomically completes assigned enrollments and records the per-enrollment effects required by learner history/reporting; cancellation atomically cancels affected assignments without presenting successful completion.
- Actual: the cohort becomes terminal and emits cohort-level effects, but related enrollments remain `assigned`, which violates the learner projection invariant and can hide the course from both active and completed lists.
- Screenshot/log/correlation evidence: SQL integration comparison of `assign_enrollment`, `transition_cohort`, and the immutable learner projection contract before migration `99800`.
- Owner: `/root/cohort_lifecycle_schedule`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: the lifecycle hardening slice replaced cohort state/schedule commands but retained the earlier cohort-only terminal transition semantics.
- Fix: migration `99900` forward-replaces the canonical cohort command with atomic, idempotent terminal enrollment effects, per-enrollment audit/outbox provenance and an explicit attribution-membership policy. A private revision guard closes stale-snapshot terminal and capacity races while preserving the public command signatures and one cohort notification. Certificate issuance remains separate until BLK-003 rules are approved.
- Regression test (or reason automation is impossible): pgTAP `019` passes 88/88 across positive, stale, replay, mixed states, completion/cancellation, cross-tenant denial, lifecycle hardening, attribution, learner projection integration and real multi-session race/retry cases. The independently repeated clean reset applies 33 migrations plus three seeds, strict lint reports no errors, and the full database suite passes 19 files/782 assertions. Generated types and production browser WF-06/history verification remain pending.

## BUG-031 — deprecated local SMTP configuration emitted reset warnings

- Bug ID: BUG-031
- Severity: P3
- Feature and workflow: local Supabase environment and clean migration rehearsal
- Environment and revision: local Supabase CLI `2.109.1` on 2026-07-18
- Reproduction steps: run the project-local `supabase db reset` with the committed `[inbucket]` section in `supabase/config.toml`.
- Expected: the clean reset starts with supported configuration and emits no unexplained warnings.
- Actual: the CLI warned that `[inbucket]` is deprecated and must be replaced by `[local_smtp]`.
- Screenshot/log/correlation evidence: reset output from the first `99800` rehearsal and a fresh configuration generated by the project-local CLI.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: the configuration was initialized with an older Supabase CLI section name while the project dependency advanced to `2.109.1`.
- Fix: renamed only the local email-capture section to `[local_smtp]`, preserving its ports and enabled state.
- Regression test (or reason automation is impossible): the clean reset through `99800` applied 32 migrations and all three seed files without the deprecation warning.

## BUG-032 — public About navigation did not preserve the Version 1 page

- Bug ID: BUG-032
- Severity: P2
- Feature and workflow: public navigation and guest parity; CUR-01
- Environment and revision: V1/V2 route comparison on 2026-07-18
- Reproduction steps: activate the V2 public-header About link and compare it with the Version 1 `/{lang}/about-company` page.
- Expected: About opens a localized, keyboard-accessible page that explains the learning method and preserves the established training-provider link.
- Actual: V2 sent the user to the homepage workflow anchor and had no About route.
- Screenshot/log/correlation evidence: source comparison of the V1 about-company page, V2 `PublicHeader`, and current route tree.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: the initial public shell reused the workflow section as a placeholder for an unimplemented parity route.
- Fix: added `/{locale}/about` with typed EN/DE/RU copy, method/evidence/provider sections, catalog action, and the retained Test IT Academy link; changed the header to the typed localized route.
- Regression test (or reason automation is impossible): shared UI/routing plus i18n tests pass 17/17 and targeted ESLint is clean; production browser, responsive, keyboard and visual verification remain pending.

## BUG-033 — flexible learner projections did not enforce published prerequisites

- Bug ID: BUG-033
- Severity: P1
- Feature and workflow: flexible progression and competency path; WF-02/WF-07
- Environment and revision: coordinator review of migration `99800` on 2026-07-18
- Reproduction steps: publish a task with an immutable required-task or required-skill rule, assign the learner to a flexible cohort with a learning entitlement but without satisfying that rule, then call the learner task/course projections.
- Expected: the task is locked with a safe, explainable prerequisite state until the exact published prerequisite is satisfied.
- Actual: corrected by migration `100000`: dashboard, course and direct-task projections evaluate the exact pinned snapshot's required-task acceptance and organization-qualified required-skill threshold after the schedule/entitlement gate. Safe structured lock reasons expose only the unmet type and mastery basis-point boundary; active open work remains readable and never-started locked tasks fail closed.
- Screenshot/log/correlation evidence: `app_private.learner_snapshot_task_lock_reasons`, the three forward-replaced learner RPCs, typed lock-reason presenters/copy/tests and pgTAP `021`.
- Owner: `/root/global_content_scope_fix`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: the learner read-boundary slice replaced mutable content reads first, while prerequisite/mastery evaluation still depends on the tenant/global definition correction and tenant-qualified mastery repair planned for `100000`.
- Fix: added a private snapshot rule evaluator shared by dashboard/course/task/question availability, repaired mastery primary/source identities to include organization scope, and updated the learner presentation contract with localized safe lock reasons.
- Regression test (or reason automation is impossible): pgTAP `021` 47/47 covers empty/met/unmet task and skill rules, threshold boundaries, cross-tenant mastery, archived pins, open-work compatibility, NULL never-started denial and direct task access; full DB 898/898 and six consumer files/24 tests pass independently. Browser and complete WF-07 recommendation/path/mastery flows remain pending.

## BUG-034 — organization-scoped roles and permissions survived inactive tenant membership

- Bug ID: BUG-034
- Severity: P0
- Feature and workflow: identity, organization administration and tenant isolation; all protected organization workflows
- Environment and revision: application/database authorization audit through migration `99800` on 2026-07-18
- Reproduction steps: grant an organization-scoped role, then suspend, remove or expire its organization membership without separately revoking the role; resolve the application principal or call a policy protected by `app_private.has_permission`.
- Expected: every tenant-scoped role and permission fails closed as soon as the corresponding active, unremoved and unexpired membership is absent; permissions from different tenants are never flattened into one request context.
- Actual: corrected on 2026-07-18: both application principal resolution and database helpers derive effective scope from an active profile, active/unarchived tenant, active/unremoved/unexpired membership, matching cohort membership/role and a single unambiguous tenant; only the explicit platform-role allowlist remains global.
- Screenshot/log/correlation evidence: migration `20260717099950_active_principal_authorization.sql`, pgTAP `020`, application principal tests, and coordinator clean-reset/lint/full-suite rerun.
- Owner: `/root/mutation_boundary_audit`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: scoped role validity and active tenant membership were modeled as independent checks, while the request principal lacked an explicit active-tenant scope.
- Fix: the application containment slice and migration `99950` now share the lifecycle-aware scope rule. The migration preserves helper signatures, makes the actor/destination resolvers private, hardens resource helpers and sensitive-answer policies, and intentionally returns `42501` before disclosing cross-tenant structural mismatch. Direct-DML closure remains BUG-028/`100100`; global content/mastery remains BUG-027/033/`100000`.
- Regression test (or reason automation is impossible): application principal regression passes 24/24; coordinator verification applied all 34 migrations plus three seeds without warnings, strict DB lint returned no errors, focused pgTAP `020` passed 69/69 and the full DB suite passed 20 files/851 assertions. Production browser organization/admin/forbidden-state verification remains pending before closure.

## BUG-035 — accepted activities exposed a task link that was not reliably readable

- Bug ID: BUG-035
- Severity: P2
- Feature and workflow: learner course workspace and accepted-work history; WF-02
- Environment and revision: coordinator integration review after migration `99800` on 2026-07-18
- Reproduction steps: render an active learner course containing an accepted activity whose availability window has ended, then activate its “Open task” link.
- Expected: only available, in-progress, submitted or revision-required work exposes an actionable task link until a dedicated read-only accepted/history projection exists.
- Actual: every non-locked activity exposed the link, while the actor-derived task detail intentionally did not preserve accepted work after schedule expiry, producing a not-found route.
- Screenshot/log/correlation evidence: comparison of `CourseWorkspace.canOpenActivity` with `get_my_learning_task` and pgTAP `018` accepted-past-due coverage.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: the presenter treated “not locked” as equivalent to “actionable”, although accepted is a terminal display state.
- Fix: replaced the negative state check with an explicit allowlist of available, in-progress, submitted and revision-required states; added an available and accepted activity to the component regression fixture and proved only the available activity receives the link.
- Regression test (or reason automation is impossible): focused principal/organization/course integration passes 29/29, current full Vitest/coverage passes 100 files/496 tests and full ESLint is clean; browser and keyboard verification remain pending.

## BUG-036 — successful authentication defaulted every role to the learner workspace

- Bug ID: BUG-036
- Severity: P2
- Feature and workflow: login, registration callback and role shell entry; guest-to-authenticated routing
- Environment and revision: coordinator organization-admin containment review on 2026-07-18
- Reproduction steps: sign in as a trainer, platform administrator or organization administrator without a `next` parameter.
- Expected: the server resolves the authenticated principal and selects a route that the role can actually render (`/admin` for platform admins and `/admin/courses` for content administrators); an explicit safe local `next` remains subject to the destination route's authorization guard.
- Actual: sign-in, immediate registration and auth callback all default to `/{locale}/learn`, so non-learners land on a forbidden learner shell.
- Screenshot/log/correlation evidence: source review of `auth/actions.ts` and `auth/callback/route.ts` after organization-admin route containment.
- Owner: `/root/cohort_lifecycle_schedule`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: the initial authentication slice used the learner vertical slice as a universal fallback before trainer/admin/organization route perspectives existed.
- Fix: implement one server-authoritative role-to-workspace destination helper and apply it only when no explicit safe `next` is supplied. Route precedence is platform admin, content studio, organization admin, trainer, learner, then localized public home for support/integration/DPO roles without an implemented workspace.
- Regression test (or reason automation is impossible): the role/destination, sign-in/registration and callback suites pass 50/50, including double-encoded separator/traversal denial and spoofed-metadata rejection; full Vitest/coverage passes 100 files/496 tests, with ESLint, 160-key i18n parity and secret scans clean. Browser verification remains pending.

## BUG-037 — organization service checked a permission that does not exist

- Bug ID: BUG-037
- Severity: P2
- Feature and workflow: organization membership administration; MOD-33/MOD-34
- Environment and revision: organization-admin containment audit on 2026-07-18
- Reproduction steps: pass a correctly scoped organization administrator created from the canonical database roles into `inviteOrganizationMember` or `changeOrganizationMembershipState`.
- Expected: the service checks the seeded `organization.manage` permission after proving the principal's active organization scope.
- Actual: the service checked `organization.members.manage`, which is absent from the canonical permission catalog, so a real principal could never authorize the operation while the unit fixture falsely passed.
- Screenshot/log/correlation evidence: comparison of the organization service/test fixture with the permission seed and RLS policies in migration `91000`/`95000`.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: an early provider-neutral organization domain draft invented a narrower permission name before the canonical RBAC catalog was finalized.
- Fix: changed the service and authorized fixture to `organization.manage`; added a denial regression proving the fictional permission cannot authorize or touch the repository.
- Regression test (or reason automation is impossible): organization service passes 4/4, current full Vitest/coverage passes 100 files/496 tests and ESLint is clean. The organization UI/data/RPC remains intentionally unavailable until BUG-034/pgTAP `020` closes database tenant scope; browser verification is therefore pending.

## BUG-038 — administration overview identifies enrollment applications only by UUID

- Bug ID: BUG-038
- Severity: P2
- Feature and workflow: administration enrollment queue and operational overview; WF-01/ADMIN-04
- Environment and revision: direct visual inspection of the existing desktop artifact on 2026-07-18
- Reproduction steps: sign in as the seeded platform administrator, open `/{locale}/admin`, and inspect an enrollment-application row.
- Expected: the queue identifies the learner and localized course (with the opaque ID only as secondary technical context) so an administrator can make an informed decision.
- Actual: the row renders the raw enrollment UUID as its only identifier beside the state badge.
- Screenshot/log/correlation evidence: `artifacts/screenshots/admin/operations-desktop.png` and the ID-only mapping in `admin/_data/operations.ts` / `OperationsOverview`.
- Owner: `/root`
- Status: 🔁 REWORK
- Root cause: the first operations vertical slice mapped direct enrollment rows into a minimal domain placeholder without a scoped learner/course display projection.
- Fix: add an actor-derived allow-listed administration application projection with active tenant/global-admin authorization, localized course title and permitted learner display name; update the presenter to use meaningful context and retain UUID only for audit/support. This belongs with the safe admin projections planned after BUG-034 and BUG-027.
- Regression test (or reason automation is impossible): projection isolation, missing-profile/translation fallback, component semantics, and fresh production desktop/mobile browser evidence are pending; the current screenshot is explicitly rejected as completion evidence.

## BUG-039 — unauthorized trainer reads created a database client before denial

- Bug ID: BUG-039
- Severity: P2
- Feature and workflow: trainer group/progress server reads; WF-04/WF-06
- Environment and revision: behavior-focused coverage hardening on 2026-07-18
- Reproduction steps: call `readTrainerGroups` with a principal that has a trainer role but lacks `cohort.read`, and observe whether `createServerClient` runs before authorization fails.
- Expected: the server rejects a principal without the required role/permission before constructing a data client or issuing any query.
- Actual: `readAuthorizedTrainerCohortContexts` created the client and only then delegated to the function containing the authorization check.
- Screenshot/log/correlation evidence: failing first run of `trainer-read-data.test.ts` showed one unexpected `createServerClient` call on the denied path.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: authorization lived in the private row-reader below the public context function, while client construction occurred one call level earlier.
- Fix: enforce `cohort.read` at the public server boundary before client creation, retaining the inner defense-in-depth check.
- Regression test (or reason automation is impossible): the 12-test trainer read-boundary suite proves pre-client denial, resource-scope denial, empty assignments, trainer/manager success, localization and stable error mapping; the complete 100-file/496-test coverage run passes and focused ESLint is clean.

## BUG-040 — advanced domain state contracts diverge from the database

- Bug ID: BUG-040
- Severity: P1
- Feature and workflow: labs, AI, privacy, integrations, organizations and entitlements; WF-08 through WF-10
- Environment and revision: advanced-module contract audit on 2026-07-18
- Reproduction steps: compare the Zod state unions in `src/features/{labs,ai,privacy,integrations,organizations,entitlements}` with the enums/tables in migrations `90000`, `93000` and `94000`, then attempt to design a typed database repository.
- Expected: domain and persistence state machines have one named canonical mapping with exhaustive runtime/contract tests.
- Actual: corrected at the runtime domain boundary on 2026-07-18: AI modes, record/organization/membership states, the complete lab-session lifecycle, integration connection/delivery states and privacy request states now use the exact generated database enums. Lab validation distinguishes the persisted session lifecycle from validation results, requires one same-session result per required rule, and rejects duplicate, foreign or missing output. Package/grant contracts now represent an active package capability plus tenant-bound validity dates instead of inventing grant states. Repository adapters and live providers are still absent, so database round-trip and field-projection evidence remain outstanding.
- Screenshot/log/correlation evidence: `src/entities/common/persistence-states.ts`, `src/entities/privacy/state-machine.ts`, the six advanced feature models/services, and `tests/unit/advanced-persistence-state-contracts.test.ts`; focused Vitest and ESLint evidence recorded below.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: provider-neutral domain prototypes and the greenfield schema evolved independently without a contract-convergence gate.
- Fix: centralized persistence state constants, made privacy transitions explicit, aligned all affected runtime schemas with the generated enum unions, removed tenant-null wildcards, enforced lab scenario/version/tenant and validation-result integrity, implemented retry-safe reset/destroy transitions, and added compile-time plus runtime exhaustiveness checks. Semantic field differences must be handled by explicit repository adapters rather than alternate state names.
- Regression test (or reason automation is impossible): the independently repeated focused gate passes 10 files / 62 tests, including compile-time assignments against `Database["public"]["Enums"]`, exhaustive runtime arrays, legal privacy/lab transitions, cross-tenant denials, invalid validator output and idempotent destroy/replay; focused ESLint is clean. Real repositories, regenerated post-migration types, database round-trip tests, provider/E2E flows and UI verification are still required before closure.

## BUG-041 — AI safety accepted provider output without leakage inspection

- Bug ID: BUG-041
- Severity: P1
- Feature and workflow: guarded AI coach and trainer feedback; WF-09
- Environment and revision: advanced-module security audit on 2026-07-18
- Reproduction steps: make the mocked provider return a final answer, hidden defect, token or learner PII after an innocuous prompt passes `classifyAiSafety`.
- Expected: authorized resource-scoped context and both input and provider output pass leakage/PII policy before any answer or trainer draft is returned or stored.
- Actual: corrected at the domain boundary on 2026-07-18: the coach now requires an explicit task/resource policy before quota or retrieval, uses only bounded authorized context, runtime-validates provider responses, refuses final-answer/hidden-defect/PII output, and audits the allow/refuse/unavailable decision. Trainer drafts require exact review access, unsafe output is rejected, and approval is re-authorized as a human review decision.
- Screenshot/log/correlation evidence: `src/features/ai/model.ts`, `src/features/ai/service.ts`, and `src/features/ai/service.test.ts`; focused AI tests pass 14/14 and the integrated coverage gate passes 107 files / 571 tests.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: the first safety prototype treated prompt instructions as an output guarantee and modeled permission without resource retrieval authorization.
- Fix: added an explicit resource-access port, actor/learner/tenant/task-qualified authorized retrieval, a five-citation/20-context ceiling, canonical persistence-aligned AI modes, prompt-injection/input PII checks, runtime provider response validation, provider-output leakage/PII refusal, audited quota/failure states, and review-scoped approval-required trainer drafts.
- Regression test (or reason automation is impossible): 14 focused tests cover prompt injection, input/output final-answer, hidden-defect and PII leakage, resource denial before downstream calls, assessment context filtering/bounds, quota, provider configuration/error/malformed output, review denial, unsafe trainer draft and mandatory human approval. A real gateway, provider, durable conversation/audit repositories, rate/cost controls and browser E2E remain blocked by BLK-011, so the module is not production-complete.

## BUG-042 — portfolio publication trusted a caller-supplied public snapshot

- Bug ID: BUG-042
- Severity: P1
- Feature and workflow: learner portfolio and public verification; MOD-24/MOD-43
- Environment and revision: database/domain boundary audit on 2026-07-18
- Reproduction steps: call `publish_portfolio` for an owned portfolio while supplying a snapshot containing fabricated evidence, another learner's data or unapproved private fields.
- Expected: the server derives an allow-listed immutable publication exclusively from the actor's authorized portfolio items and verified evidence.
- Actual: the RPC checks only that `p_snapshot` is a JSON object and persists it verbatim; no application action currently binds the command, and the only preview explicitly uses fixtures.
- Screenshot/log/correlation evidence: `20260717096000_atomic_domain_workflows.sql:480-520` and `src/features/portfolio/preview/portfolio-preview.ts:3-29`.
- Owner: `/root`
- Status: 🔁 REWORK
- Root cause: an early generic publication command accepted a pre-rendered client payload before evidence ownership/public-field rules were defined.
- Fix: replace it with a server-built snapshot command that locks the portfolio, validates same-owner/same-tenant items and authoritative verification, strips private fields, hashes the result and issues a non-enumerable verifier token.
- Regression test (or reason automation is impossible): forged/cross-owner/private-field/replay/concurrency/revocation tests and a public verifier E2E are pending; issuance policy intersects BLK-003.

## BUG-043 — analytics sensitive-data policy inspected keys but not values

- Bug ID: BUG-043
- Severity: P1
- Feature and workflow: consent-first product and learning analytics; MOD-29
- Environment and revision: advanced-module privacy audit on 2026-07-18
- Reproduction steps: submit a consented event with a harmless key such as `label` whose value contains an email, token or full learner answer.
- Expected: schema allowlists, data minimization and value-aware redaction reject sensitive content regardless of property name.
- Actual: corrected at the domain/sink boundary on 2026-07-18: every supported event has a strict version-1 property schema, unknown/free-text/nested/oversized/wrong-version payloads fail closed, sensitive neutral-key values are rejected before persistence, withdrawn/future consent is denied, and the sink receives a validated pseudonymous subject reference rather than the raw learner identifier.
- Screenshot/log/correlation evidence: `src/features/analytics/model.ts`, `src/features/analytics/service.ts`, and `src/features/analytics/service.test.ts`; focused analytics tests pass 6/6 and the integrated coverage gate passes 107 files / 571 tests.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: the prototype used a generic property bag and a key heuristic instead of event-specific schemas and bounded value policy.
- Fix: replaced the generic property bag with strict discriminated per-event schemas and bounded scalar fields, added key/value secret/PII scanning, exact-tenant dashboard scope, consent time/withdrawal checks, a required pseudonymization port and pseudonymous deletion propagation.
- Regression test (or reason automation is impossible): 6 focused tests cover minimized capture, raw-ID replacement, consent absence/withdrawal, sensitive key and neutral-key value, free-text/nested/oversized/wrong-version rejection, cross/global tenant denial, rate validation and deletion propagation. A real consent/analytics repository, secret-backed pseudonymizer, retention/deletion worker and dashboards remain unbound; DB/integration/E2E evidence is still required.

## BUG-044 — health endpoint reported healthy without checking dependencies

- Bug ID: BUG-044
- Severity: P2
- Feature and workflow: operational monitoring and support; MOD-42
- Environment and revision: operations readiness audit on 2026-07-18
- Reproduction steps: make the local database or another required dependency unavailable and call `/api/health`.
- Expected: liveness and readiness are distinct; readiness returns a degraded/unavailable status and bounded dependency evidence without exposing secrets.
- Actual: corrected on 2026-07-18: default and explicit liveness remain dependency-free, while `?check=readiness` performs a timeout-bounded anonymous PostgREST/Postgres catalog probe and maps ready/unavailable/timeout/invalid configuration to allowlisted `200|503` envelopes. Optional disabled/configured providers are reported without being treated as checked or failing core readiness.
- Screenshot/log/correlation evidence: `src/app/api/health/route.ts`, its route test, and `src/features/operations/server/readiness.ts` plus test; agent and coordinator independently pass 21/21 focused tests and ESLint, and the integrated coverage gate passes 107 files / 571 tests.
- Owner: `/root/dependency_readiness_health`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: an initial liveness placeholder was labeled as general health before operational contracts existed.
- Fix: separated liveness/readiness, validated public configuration, used only publishable/anonymous credentials with cookies/cache/redirects disabled, bounded the probe with abort, clamped latency, redacted all dependency details, preserved sanitized correlation IDs and added no-store/same-origin/nosniff response headers.
- Regression test (or reason automation is impossible): 21 tests cover liveness no-call, anonymous probe shape, success/non-2xx/throw/pending timeout+abort/invalid config, latency bounds, optional-provider honesty, 200/503/400 mapping, correlation sanitation, no-cache/same-origin and secret/error redaction. A live database-down rehearsal plus deployment synthetic checks and production alert routing remain BLK-010, so browser/operational review is pending.

## BUG-045 — approved enrollments could not be assigned to a cohort in the admin UI

- Bug ID: BUG-045
- Severity: P1
- Feature and workflow: guest-to-enrolled learner; CUR-04/WF-01
- Environment and revision: V1 parity audit on 2026-07-18
- Reproduction steps: approve an enrollment application in `/{locale}/admin/applications` and attempt to select an eligible cohort.
- Expected: an administrator can choose a matching tenant/course cohort, assign with CAS/idempotency, and deliver the learner's first available activity.
- Actual: the page exposes only approve/reject and calls only `decide_enrollment`; the audited `assign_enrollment` RPC exists but has no selector or action. V1 combined application processing with group selection.
- Screenshot/log/correlation evidence: `admin/applications/page.tsx:90-123`, `actions.ts:20-40`, migration `99900:50-240`, and V1 `StudentsApplicationCard.tsx:59-103,170-216`.
- Owner: `/root`
- Status: 🔁 REWORK
- Root cause: the first WF-01 slice stopped at decision while cohort assignment was completed only at the database-contract layer.
- Fix: add an actor-derived eligible-cohort projection, localized selector, CAS/idempotent assignment action, capacity/stale/retry handling, revalidation and notification confirmation.
- Regression test (or reason automation is impossible): wrong course/tenant, full capacity, removed learner, concurrent assignment, retry and complete WF-01 browser tests are pending.

## BUG-046 — question creation was not pinned to the cohort publication

- Bug ID: BUG-046
- Severity: P1
- Feature and workflow: learner questions and flexible progression; CUR-09/WF-03/WF-07
- Environment and revision: V1 parity and publication-boundary audit on 2026-07-18
- Reproduction steps: create another active task version for the same course, then enumerate learner question contexts or call `create_question` with that task for an active cohort pinned to a different publication.
- Expected: question contexts and mutations accept only an available task from the cohort's exact immutable content version, including published prerequisites.
- Actual: corrected at the persistence/read boundary by migration `100000`: each question stores a non-null immutable content-version pin enforced against its cohort/task tuple; creation contexts and `create_question` use the exact snapshot schedule/entitlement/prerequisite gate; historical titles resolve from each question's archived/published pin. The learner task page still lacks a preselected question entry/history surface.
- Screenshot/log/correlation evidence: question pin column/FK/trigger, `list_my_available_question_contexts`, `list_my_question_task_contexts`, forward-replaced `create_question`, updated TypeScript reader tests and pgTAP `021`.
- Owner: `/root/global_content_scope_fix`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: the question slice retained course-level V1 context while immutable publication pins and competency prerequisites were added later.
- Fix: forward-replaced the command/projections with exact immutable pins and shared prerequisite availability, added safe historical title context, and converted the application reader to those actor-derived RPCs; task-workspace discoverability remains a separate UI step.
- Regression test (or reason automation is impossible): pgTAP `021` and focused TypeScript cover other-version denial, available/locked context, archived historical pin, schedule/prerequisite and cross-tenant behavior; clean full DB 898/898 passes. Task-bound browser creation/history, responsive and keyboard verification remain pending before closure.

## BUG-047 — learner evidence upload had no storage or command boundary

- Bug ID: BUG-047
- Severity: P1
- Feature and workflow: learner task evidence; WF-02/WF-08
- Environment and revision: learner parity audit on 2026-07-18
- Reproduction steps: open a learner task and attempt to attach a screenshot/report before submission.
- Expected: private validated uploads produce owner-bound evidence references with retry/removal and signed trainer access.
- Actual: `TaskWorkspace` renders upload only when an optional callback is supplied, but the task page never supplies one; only a standalone validation helper exists, with no bucket policy, upload action or finalize command.
- Screenshot/log/correlation evidence: `src/features/tasks/components/task-workspace.tsx`, `src/app/[locale]/learn/tasks/[taskId]/page.tsx`, and `src/shared/auth/upload-policy.ts`.
- Owner: `/root/evidence_upload_gap_design`, `/root/private_upload_validator`, `/root`
- Status: 🟡 IN PROGRESS
- Root cause: the vertical slice modeled evidence references without implementing secure object storage and evidence ownership.
- Fix: active wave adds a private bucket, actor-bound intent/finalize/remove/download/cleanup commands, exact retry receipts, byte/type/size/hash validation, ownership/tenant binding, short-lived signed reviewer access and remove/retry UI. Database and pure validation boundaries are implemented and reviewed before any privileged adapter or browser UI is wired.
- Regression test (or reason automation is impossible): unsupported/mismatched/oversized/failed/cross-tenant/orphan cleanup and complete browser upload tests are pending.

## BUG-048 — draft persistence omitted assessment, hint, evidence and elapsed-time changes

- Bug ID: BUG-048
- Severity: P1
- Feature and workflow: learner attempt recovery; WF-02
- Environment and revision: learner task behavior audit on 2026-07-18
- Reproduction steps: change only a multiple-choice selection or reveal a hint, wait or navigate away without blurring the answer textarea, then reopen the task.
- Expected: every mutable field and elapsed checkpoint is debounced/CAS-saved, conflict-aware and restored; offline/failure state is visible.
- Actual: corrected at the mounted frontend boundary on 2026-07-18: text, single/multiple choice, first hint reveal, callback-supplied evidence and periodic/final elapsed time all enter one debounced serialized/coalesced CAS lane; failure remains dirty with retry/unload warning and submission drains the lane.
- Screenshot/log/correlation evidence: `src/features/tasks/components/task-workspace.tsx` and its focused/cross-fixture tests; coordinator focused rerun passed 3 files / 22 tests and focused ESLint.
- Owner: `/root/learner_draft_recovery`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: an initial blur-save shortcut was not expanded when assessment, hint and evidence state were added.
- Fix: implemented 800 ms full-field autosave, one in-flight save loop with revision coalescing, returned-version CAS progression, 30-second/final duration checkpoints, retained idempotency key on failure, explicit localized retry/status, native unload protection, submit/save exclusion and a task-key remount guard. Validation alerts clear when corrected.
- Regression test (or reason automation is impossible): agent full Vitest/coverage passed 102 files / 518 tests at 85.08/71.73/87.48/87.22; coordinator focused regression passes 3 files / 22 tests. Production browser, multi-tab/stale and reload/offline checks remain pending. Actual upload remains BUG-047, universal Next client-navigation interception is not available in this component boundary, durable crash recovery needs an approved cache/server contract, and ambiguous post-commit draft retry remains under BUG-028/`100100`.

## BUG-049 — content lifecycle existed without authoring CRUD

- Bug ID: BUG-049
- Severity: P1
- Feature and workflow: admin content authoring; CUR-10/WF-05
- Environment and revision: V1 parity audit on 2026-07-18
- Reproduction steps: open the course/task studio and attempt to create or edit localized metadata, stages, media, tasks, tests, categories or competency mappings.
- Expected: version-scoped draft authoring supports the full localized graph, validation, preview, review and publication.
- Actual: review/publish/archive commands are real, but the administration views explicitly mark authoring controls unavailable; V1 supported course/media/task/test/category creation.
- Screenshot/log/correlation evidence: `admin/courses/views.tsx:95-99,244-250,372-380`, `admin/tasks/copy.ts:77-78`, and the referenced V1 course/task forms.
- Owner: `/root`
- Status: 🔁 REWORK
- Root cause: immutable publication integrity was implemented before safe field-limited draft mutation commands.
- Fix: add audited version-scoped CRUD commands/UI for locales, stages, media, tasks, options/answers, categories, skills and prerequisites, with resumable media and published-graph guards.
- Regression test (or reason automation is impossible): locale/fallback, validation, media failure, stale edit, published immutability, preview and complete E2E-05 are pending.

## BUG-050 — group and membership administration remained read-only

- Bug ID: BUG-050
- Severity: P1
- Feature and workflow: cohorts, schedules and user assignment; CUR-11/CUR-12/WF-06
- Environment and revision: V1 parity audit on 2026-07-18
- Reproduction steps: open admin Groups/Users and attempt to create, duplicate, edit/archive a cohort or add/remove a learner/trainer.
- Expected: authorized administrators can manage cohort lifecycle and memberships with confirmations, capacity checks, audit and tenant isolation.
- Actual: lifecycle/schedule reads and commands exist, but create/duplicate/delete and membership changes are explicitly unavailable; V1 exposed duplication and trainer/learner membership management.
- Screenshot/log/correlation evidence: `src/features/administration/management-read-copy.ts:180-181` and V1 `GroupPage/index.tsx:89-99,240-288,318-434`.
- Owner: `/root`
- Status: 🔁 REWORK
- Root cause: the first group slice prioritized immutable pins and lifecycle safety while leaving membership/CRUD command contracts unimplemented.
- Fix: add actor-derived eligible-person reads and audited create/edit/duplicate/archive/assign/remove commands with CAS/idempotency and terminal-state rules.
- Regression test (or reason automation is impossible): capacity, duplicate, cross-tenant, removed trainer, stale membership and E2E-06 tests are pending.

## BUG-051 — impersonation banner and service were not connected to a real role-view session

- Bug ID: BUG-051
- Severity: P1
- Feature and workflow: admin role view/impersonation; CUR-14
- Environment and revision: admin parity audit on 2026-07-18
- Reproduction steps: attempt to start/end role view from the admin UI or make the persistent shell banner actionable.
- Expected: an authorized, reasoned, expiring, audited session changes only the view context and always exposes a working persistent stop action.
- Actual: `ImpersonationService` is library-only, `RoleShell` never supplies impersonation state, and the banner's end button has no action; user status/role/removal controls are also disabled.
- Screenshot/log/correlation evidence: `impersonation-service.ts:54-145`, `role-shell.tsx:74-83`, `app-shell.tsx:150-155`, and `management-read-copy.ts:288-289`.
- Owner: `/root`
- Status: 🔁 REWORK
- Root cause: UI scaffolding preceded the session-bound adapter and server actions.
- Fix: implement start/end commands, session-scoped subject/view-role resolution, expiry, persistent banner action and immutable audit while prohibiting privilege escalation.
- Regression test (or reason automation is impossible): unauthorized/cross-tenant, reason, expiry, direct URL, banner persistence and stop-action E2E are pending.

## BUG-052 — available certificates could not be downloaded

- Bug ID: BUG-052
- Severity: P1
- Feature and workflow: learner certificate parity; CUR-03/CUR-13/E2E-07
- Environment and revision: V1 parity audit on 2026-07-18
- Reproduction steps: open an available certificate in `/{locale}/learn/certificates` and try to download it.
- Expected: the owner receives an authorized signed/streamed certificate artifact; missing/revoked/expired states fail safely.
- Actual: real certificate rows are listed, but the UI explicitly says download is unavailable; issue/revoke/verify exist only as unbound ports. V1 downloaded PDF artifacts.
- Screenshot/log/correlation evidence: `learner-certificate-list.tsx:119-123`, `learn/certificates/copy.ts:44-45`, and V1 `CertificatComponent.tsx:34-51,74-104`.
- Owner: `/root`
- Status: 🔁 REWORK
- Root cause: list parity was implemented without controlled artifact delivery and approved issuance/verification policy.
- Fix: implement owner-authorized signed/streamed download now for valid stored records; keep issue/revoke/public verify disabled until BLK-003 policy is approved.
- Regression test (or reason automation is impossible): owner/wrong-user/revoked/expired/missing-file/rate-limit and browser download tests are pending.

## BUG-053 — ratings, support issue actions and exports were not connected

- Bug ID: BUG-053
- Severity: P1
- Feature and workflow: learner feedback and administration operations; CUR-13/E2E-07
- Environment and revision: V1 parity audit on 2026-07-18
- Reproduction steps: try to rate a task/course, report an issue, transition an admin issue, or create/download an export.
- Expected: separate authorized commands preserve V1 feedback/support behavior and provide audited asynchronous export status/download.
- Actual: admin exports are hard-coded empty, issues show opaque ID/state without actions, and rating/support/export domain services are not bound to production routes; V1 exposed these flows.
- Screenshot/log/correlation evidence: `admin/_data/operations.ts:23-63`, `operations-overview.tsx:51-75`, and the referenced V1 evaluation/bug-report/admin-report files.
- Owner: `/root`
- Status: 🔴 BUG FOUND
- Root cause: operations screens were built as safe read-only placeholders while authoritative commands and background jobs remained absent.
- Fix: close relevant BUG-028 DML, add field-limited rating/support commands, contextual issue projections/transitions, and an export job/worker/status/artifact boundary.
- Regression test (or reason automation is impossible): moderation, rate limit, cross-tenant, sensitive-payload, export permission/retry/expiry and E2E-07 tests are pending.

## BUG-054 — trainer review queue ignored existing filter and prioritization logic

- Bug ID: BUG-054
- Severity: P2
- Feature and workflow: trainer review productivity; CUR-08/WF-04
- Environment and revision: trainer parity audit on 2026-07-18
- Reproduction steps: open the submission queue and attempt to filter by group/state/transfer, search, sort by SLA or paginate.
- Expected: URL-backed validated filters and stable priority/SLA ordering make large queues operable and preserve navigation state.
- Actual: the route accepts no query state and renders a table only; `filterAndPrioritizeReviewQueue` is dead production code and the projection has no due date. V1 provided group/transferred tabs and sorting.
- Screenshot/log/correlation evidence: `trainer/submissions/page.tsx:11-45`, `review-queue.tsx:43-97`, `features/review/queue.ts:3-39`, and `review-queue-data.ts:107-136`.
- Owner: `/root`
- Status: 🔁 REWORK
- Root cause: the first vertical slice optimized for decision correctness, leaving queue operations disconnected.
- Fix: add schema-validated URL filters/search/sort/pagination, due/SLA projection, server prioritization, counts and localized empty/error states.
- Regression test (or reason automation is impossible): invalid URL, stable pagination, transferred ownership, SLA ordering, mobile alternative and E2E-04 filter tests are pending.

## BUG-055 — course recommendation assistant had no route or fallback

- Bug ID: BUG-055
- Severity: P2
- Feature and workflow: public course recommendation parity; CUR-15/WF-09-lite
- Environment and revision: V1 parity audit on 2026-07-18
- Reproduction steps: navigate the public application and attempt to use the course recommendation assistant.
- Expected: an accessible localized assistant provides a deterministic published-catalog fallback and, when approved, an optional guarded AI provider path.
- Actual: only a recommendation model exists; no route/UI imports it, the home page exposes only catalog/login, and provider configuration is intentionally disabled. V1 mounted a chatbot globally.
- Screenshot/log/correlation evidence: `catalog/model/recommendation.ts`, `src/app/[locale]/page.tsx:19-64`, and `server-env.ts:9-12`.
- Owner: `/root`
- Status: 🔴 BUG FOUND
- Root cause: unsafe V1 chatbot behavior was removed without first replacing its valuable course-guidance function.
- Fix: implement a rules-based immutable-catalog assistant with quota/accessibility/failure states; add the provider-neutral AI branch only after BUG-041 and BLK-011.
- Regression test (or reason automation is impossible): deterministic recommendation, no-match, locale, abuse/rate, provider-disabled and accessible browser tests are pending.

## BUG-056 — public course detail omitted valuable media and facts

- Bug ID: BUG-056
- Severity: P2
- Feature and workflow: public catalog parity; CUR-01/WF-01
- Environment and revision: V1 parity audit on 2026-07-18
- Reproduction steps: compare a published V2 course detail with V1's image, duration, lesson count and rating presentation.
- Expected: the immutable public DTO exposes only approved media and meaningful factual metadata with responsive rendering and fallbacks.
- Actual: V2 renders title/summary/description/outcomes only and hard-codes empty tags/prerequisites, while V1 displayed the retained facts/media.
- Screenshot/log/correlation evidence: `course-detail.tsx:34-55`, `published-catalog-projection.ts:76-100,144-159`, and V1 `Coursepage/Hero.tsx:82-113`.
- Owner: `/root`
- Status: 🔁 REWORK
- Root cause: the first confidentiality-safe catalog allowlist was narrower than the valuable V1 public presentation.
- Fix: extend the immutable publication snapshot/DTO with explicitly approved media, duration and structural facts; derive ratings only from a moderated aggregate.
- Regression test (or reason automation is impossible): missing media/translation, responsive asset, confidentiality and visual/browser tests are pending; coordinate with BUG-017.

## BUG-057 — trainer group context lacked an authorized learner detail

- Bug ID: BUG-057
- Severity: P2
- Feature and workflow: trainer mentoring context; CUR-05/WF-04
- Environment and revision: V1 parity audit on 2026-07-18
- Reproduction steps: open trainer group/progress and try to inspect one learner's scoped profile, attempts, submissions, questions, reviews and certificates.
- Expected: an assigned trainer can open an allow-listed learner detail only for their cohort, with cross-cohort/tenant denial.
- Actual: V2 exposes counts, schedules and non-linked progress rows only; V1 had a trainer-scoped learner profile/progress/certificate route.
- Screenshot/log/correlation evidence: `cohort-management-view.tsx:187-243,299-376`, `trainer-progress-view.tsx:106-153`, and V1 `ProfilePage/index.tsx:36-65,133-169`.
- Owner: `/root`
- Status: 🔴 BUG FOUND
- Root cause: aggregate trainer read models were implemented before a privacy-reviewed learner context projection.
- Fix: add an actor-derived cohort-scoped learner projection and detail route with minimal profile fields and connected learning/review history.
- Regression test (or reason automation is impossible): wrong cohort/tenant, removed trainer, sensitive-field omission, empty history and desktop/mobile tests are pending.

## BUG-058 — self-profile parity lacked a documented contact-data decision

- Bug ID: BUG-058
- Severity: P2
- Feature and workflow: profile management and migration; CUR-03
- Environment and revision: V1 parity audit on 2026-07-18
- Reproduction steps: compare V2 profile fields with V1 email, phone, Telegram and course-progress presentation.
- Expected: every valuable V1 field is preserved or explicitly rejected through a privacy/product decision and migration rule.
- Actual: V2 persists only display name, locale and timezone; the schema has no contact fields and the execution decisions do not say whether V1 contact data is intentionally retired.
- Screenshot/log/correlation evidence: `profile-server.ts:20-33`, `profile-model.ts:14-39`, `profile-form.tsx:79-175`, schema `91000:24-39`, and V1 `Profile.tsx:102-169`.
- Owner: `/root`
- Status: 🔴 BUG FOUND
- Root cause: data minimization narrowed the greenfield profile without completing the required parity/value decision register.
- Fix: obtain a product/privacy decision, classify/migrate only retained contact fields, and keep email/password changes in verified auth flows rather than generic profile mutation.
- Regression test (or reason automation is impossible): blocked on the retained-field decision; schema/self-edit/migration/export/deletion tests follow if fields are approved.

## BUG-059 — privacy page described workflows that were not available

- Bug ID: BUG-059
- Severity: P2
- Feature and workflow: GDPR transparency and self-service; MOD-40
- Environment and revision: compliance/parity audit on 2026-07-18
- Reproduction steps: read the public privacy page's consent-history/access/export/correction/deletion statements, then attempt to access those workflows.
- Expected: legal copy distinguishes rights/contact channels from currently available in-product automation and presents an honest blocked/unavailable state where policy is unresolved.
- Actual: corrected on 2026-07-18: EN, DE, and RU now distinguish the data-subject rights/contact channel from unavailable in-product self-service and state why automation remains disabled. Browser verification is still pending.
- Screenshot/log/correlation evidence: `src/app/[locale]/privacy/copy.ts`, `src/app/[locale]/privacy/copy.test.ts`; `npx vitest run 'src/app/[locale]/privacy/copy.test.ts'` passed 1 file / 4 tests and focused ESLint passed on 2026-07-18.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: target-state legal copy was published before authenticated workflow implementation and approved legal policy.
- Fix: moved localized copy into a typed EN/DE/RU contract and revised it to describe the current contact channel and unavailable automation honestly; verified consent/history/export/deletion commands, retention states, audit and protected artifact delivery remain follow-up work after BLK-008.
- Regression test (or reason automation is impossible): localized copy regression tests pass; route-level desktop/mobile verification remains required before closure, while complete identity-verification, authorization, retention and E2E workflows remain blocked on BLK-008.

## BUG-060 — tenantless integration connection bypassed replay tenant matching

- Bug ID: BUG-060
- Severity: P1
- Feature and workflow: integration reconciliation/replay; MOD-38, WF-10
- Environment and revision: supporting-plan/API-contract reconciliation on 2026-07-18
- Reproduction steps: pass a structurally accepted integration connection with `organizationId: null` and any principal holding `integration.replay` into `replayDeadLetter`.
- Expected: every external integration connection is tenant-bound exactly like `integration_connections.organization_id NOT NULL`; replay requires the same active tenant and never treats missing scope as a wildcard.
- Actual: corrected on 2026-07-18: the runtime connection contract is tenant-required, replay parses unknown input and requires exact tenant equality, and tenantless internal events are rejected at the external-delivery boundary.
- Screenshot/log/correlation evidence: `src/features/integrations/model.ts`, `src/features/integrations/service.ts`, `src/features/integrations/service.test.ts`; focused Vitest passed 1 file / 12 tests and focused ESLint passed; database constraint in migration `94000`.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: the provider-neutral TypeScript model drifted from the non-null database contract and encoded null as global scope.
- Fix: made connection scope non-null, removed the wildcard branch, runtime-validated replay input and added parse/replay/global-event negative tests.
- Regression test (or reason automation is impossible): focused integration model/service tests pass; full suite and external-integration E2E remain required before closure.

## BUG-061 — canonical integration provider kinds drifted from database and Plan 10

- Bug ID: BUG-061
- Severity: P2
- Feature and workflow: LTI/xAPI/cmi5/OIDC readiness; MOD-35, MOD-37, WF-10
- Environment and revision: supporting-plan/API-contract reconciliation on 2026-07-18
- Reproduction steps: parse a persisted `cmi5` or `oidc` integration connection with `IntegrationKindSchema`.
- Expected: the runtime-validated canonical union covers every supported database provider kind, while provider availability remains separately disabled/blocked.
- Actual: corrected on 2026-07-18: the runtime union now matches all six persisted provider kinds while provider availability remains separately feature-gated.
- Screenshot/log/correlation evidence: `src/features/integrations/model.ts`, `src/features/integrations/service.test.ts`; focused Vitest passed 1 file / 12 tests and focused ESLint passed; migration `94000`.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: the domain enum was not reconciled after the canonical database provider list expanded.
- Fix: aligned the schema with `eloomi|lti|xapi|cmi5|webhook|oidc` and added table-driven kind-parity tests without claiming live adapters.
- Regression test (or reason automation is impossible): all six kind-parity cases pass; full suite remains required and live provider contracts remain BLK-006/013.

## BUG-062 — main traceability matrix named target-only or nonexistent routes as current surfaces

- Bug ID: BUG-062
- Severity: P2
- Feature and workflow: HARD-01 requirement-to-route integrity; CUR-03/04/06/08/09/12/13/15, MOD-43
- Environment and revision: complete V1/V2 route audit on 2026-07-18
- Reproduction steps: compare route strings in `TRACEABILITY_MATRIX.md` with the current V2 `page.tsx` inventory (46 files after the FAQ and admin-member additions).
- Expected: each trace row distinguishes an implemented route, an embedded surface and an unimplemented target; route names are exact.
- Actual: corrected on 2026-07-18: the matrix now uses exact implemented routes, labels embedded surfaces and marks target-only routes as missing.
- Screenshot/log/correlation evidence: `docs/execution/TRACEABILITY_MATRIX.md`, `docs/execution/LEGACY_ROUTE_PARITY.md`; the independently repeated 2026-07-18 inventory confirms 47 V1 and 46 current V2 pages, with new FAQ and admin-member routes represented explicitly rather than silently changing the count.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: target architecture routes were recorded before the implemented App Router inventory was reconciled.
- Fix: corrected current route names, labelled embedded/missing targets explicitly and made the individual 47-route appendix part of the audit rule.
- Regression test (or reason automation is impossible): page-file counts were independently repeated; an automated trace-route reference audit is still desirable before closure.

## BUG-063 — public FAQ route/content parity was dropped

- Bug ID: BUG-063
- Severity: P2
- Feature and workflow: guest public/legal/help parity; GUEST-01, CUR-01
- Environment and revision: V1/V2 route audit on 2026-07-18
- Reproduction steps: open V1 `/{lang}/questions`, then locate an equivalent localized FAQ surface in V2.
- Expected: valuable localized public FAQ content remains reachable or has an explicitly approved replacement.
- Actual: corrected on 2026-07-18: `/{locale}/faq` preserves all seven V1 topics in typed EN/DE/RU copy, replaces unverified commercial/certificate promises with conditional current-provider wording, uses native semantic disclosures and is reachable from the locale-preserving public header.
- Screenshot/log/correlation evidence: `src/app/[locale]/faq/**`, `src/shared/ui/public-header.tsx`, localized route/message additions and `LEGACY_ROUTE_PARITY.md` row 32; FAQ copy/page/header tests pass 19/19, with full 107-file/571-test coverage, ESLint, 161-key i18n parity and the 413-file secret scan passing.
- Owner: `/root/public_faq_parity`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: the public route consolidation omitted FAQ content from the parity map.
- Fix: implemented a server-rendered localized FAQ with seven exact canonical topics, allowlisted internal/external actions, one H1, a named disclosure section/aside, native `<details>/<summary>` controls, responsive token-based styling and a public-header link.
- Regression test (or reason automation is impossible): 19 focused tests cover topic order/completeness/unique labels, unsafe authored content/URLs, honest claims, semantic rendering, invalid locale, metadata and locale-preserving navigation. Production desktop/tablet/mobile rendering, public-header overflow, keyboard/axe and console/network checks remain required before closure.

## BUG-064 — comprehensive learner learning-history surface is absent

- Bug ID: BUG-064
- Severity: P2
- Feature and workflow: learner profile/history parity; CUR-03, STUD-06
- Environment and revision: V1/V2 route audit on 2026-07-18
- Reproduction steps: open V1 `/{lang}/profile/history`, then navigate V2 profile/learning/question areas.
- Expected: V2 provides an authorized learner history covering relevant learning, attempt/review/question and certificate events rather than only disconnected lists.
- Actual: an isolated localized `/{locale}/learn/history` route now renders privacy-minimized enrollment, attempt, submission, review, question and certificate milestones with strict self/tenant/cohort filters. Independent review nevertheless found that its multi-query offset pagination is not stable: equal-timestamp ordering differs between SQL and projection, mutable rows disappear after the snapshot when `updated_at` changes, and current enrollment state cannot preserve prior approval events. It also omits real task titles outside questions, fetches unbounded context RPC payloads, and does not prove attempt→enrollment or enrollment→cohort-course parent identity.
- Screenshot/log/correlation evidence: V1 `src/app/[lang]/profile/history/page.tsx`; 14 new learner-history route/model/data/copy/component files; implementation handoff reported 27 focused and 660 full tests, while independent read-only review recorded six exact P2/P3 gaps before acceptance.
- Owner: `/root`
- Status: 🔁 REWORK
- Root cause: V1's weak static history was replaced piecemeal without completing the valuable canonical history requirement.
- Fix: retain the localized semantic UI and strict privacy allowlists, but replace the client-composed mutable-row history with one actor-derived immutable event/cursor projection that returns only referenced localized course/task context. Enforce exact parent identities, align one deterministic event cursor/order, and tighten state/timestamp compatibility before adding shared navigation.
- Regression test (or reason automation is impossible): equal-timestamp disjoint cursor pages, mutation-after-snapshot stability, full transition retention, attempt/enrollment and cohort/course mismatch denial, bounded context, real task titles, semantic timestamp checks, clean database/application gates and learner desktop/mobile/keyboard/axe verification are required.

## BUG-065 — admin-scoped learner and trainer detail routes lack an equivalent

- Bug ID: BUG-065
- Severity: P1
- Feature and workflow: admin learner/trainer administration and group context; CUR-12, ADMIN-04, WF-06
- Environment and revision: V1/V2 route audit on 2026-07-18
- Reproduction steps: open V1 admin student/trainer/group-student detail routes, then attempt the same context from V2 `/admin/users` or group detail.
- Expected: authorized admins can inspect the minimum necessary user, assignment, progress and certificate context before scoped administration actions.
- Actual: corrected at the read boundary on 2026-07-18: `/{locale}/admin/users/{userId}` now exposes a localized, privacy-minimized member detail with current scoped roles, learner/trainer group assignments, attempt aggregates, enrollments and certificate lifecycle metadata. The route and repository require platform-admin routing plus an active organization and `organization.manage`; the exact organization/target membership is the first target query, missing or cross-tenant identifiers become 404, and every child projection is runtime-rejected unless it matches the proved user/tenant scope. Mutation, impersonation and artifact-download actions remain honestly unavailable under BUG-050/051/052.
- Screenshot/log/correlation evidence: new admin member-detail route/model/data/copy/component files and directory discoverability link; the coordinator independently inspected the first-read ordering, selected-field allowlists and child-scope guards, then repeated the 6-file/39-test focused gate and focused ESLint successfully.
- Owner: `/root/admin_user_detail_parity`, `/root`
- Status: 🟣 IN REVIEW
- Root cause: consolidation removed the detail workflow before a tenant-safe replacement projection was implemented.
- Fix: added the canonical detail route and exact membership-first server reader; selected only display name/locale/timezone and lifecycle/assignment aggregate fields, omitted authentication/contact/answer/verification/artifact data, fail the whole read on invalid context, and linked each directory member to the localized read-only surface without adding fake administration controls.
- Regression test (or reason automation is impossible): 39 focused assertions cover route/permission ordering, absent/cross-tenant 404, first-query containment, exact filters, child-scope mismatch rejection, duplicate contracts, locale fallback, semantic states/empty cases and sensitive-field omission; focused ESLint is clean. Agent full Vitest reported 113 files/617 tests, i18n parity and secret scan passing; coordinator full/type/build and production desktop/mobile/keyboard/axe/console/network verification remain pending before closure.

## BUG-066 — trainer-scoped task preview from cohort context is absent

- Bug ID: BUG-066
- Severity: P2
- Feature and workflow: trainer cohort/task context and role preview; TRAIN-01/02, CUR-07/10, WF-04/05/06
- Environment and revision: V1/V2 route audit on 2026-07-18
- Reproduction steps: open V1 cohort task or trainer task-preview routes, then attempt to inspect the same pinned task outside a submission in V2.
- Expected: an assigned trainer can inspect the exact cohort-pinned learner-visible task/media/options/hint/target without solution leakage; admins can preview by trainer role.
- Actual: task context is available only inside a submission review or admin content-version preview; there is no trainer cohort-task route.
- Screenshot/log/correlation evidence: V1 `courses/[course_id]/task-preview/[task_id]` and `trainer/groups/[group_id]/task/[task_id]`; parity appendix rows 22 and 41.
- Owner: `/root`
- Status: 🔴 BUG FOUND
- Root cause: role-preview and cohort navigation were consolidated without a standalone trainer projection/surface.
- Fix: implement an actor-derived exact-pin trainer task projection/route or an equivalent linkable surface, with assessment-solution confidentiality tests.
- Regression test (or reason automation is impossible): assigned/unassigned/cross-cohort/pin/solution-leakage and browser tests required.

## BUG-067 — lab command prototype trusted caller/provider state and overstated retry safety

- Bug ID: BUG-067
- Severity: P1
- Feature and workflow: testing-lab lifecycle, entitlement, validation and cleanup; MOD-22/23, WF-08
- Environment and revision: coordinator domain/security review on 2026-07-18
- Reproduction steps: start a lab as a non-learner or without an entitlement decision; replay a start key with a different scenario; return a mismatched requested session or malformed provider reference; retry reset/destroy after the pending state was stored; or call validation with caller-supplied session/scenario rules.
- Expected: learner start is permission- and entitlement-gated; command receipts are operation- and payload-bound; repository/provider results are runtime checked; reset/destroy can safely resume an observed pending state; validation loads authoritative session/scenario state and records results with deterministic integrity; provider failures leave an observable recoverable lifecycle.
- Actual: the first prototype trusted caller state and had an unreachable ready→active→validate path. A first rewrite corrected those problems and passed 34 focused tests, ESLint and full typecheck, but a second independent review still rejected it: destroy/recovery depended on a mutable scenario lookup; a newly published scenario version broke exact pending-start replay; authorization loss and post-persistence expiry/lease checks could strand durable commands; repository tuples were only partially compared; malformed provisioning could either leak an unknown environment or destroy an untrusted reference; the snapshot omitted provider/template configuration; a completed access receipt could return a lease already revoked by reset/destroy; negative-lifetime grants could escape as raw schema errors; and failed sessions without a provider reference could not follow their declared destroy transition. The database separately permits browser DML around the service, lacks the command/snapshot/lease contract, exposes draft configuration, and has no live repository/provider implementation.
- Screenshot/log/correlation evidence: two independent static reviews of `src/features/labs/{model,service}.ts`, `src/entities/lab/state-machine.ts`, focused mocks and migrations `93000`/`95000`; the second review supplied line-level reproduction for all nine remaining findings after independently passing 5 files/34 tests, ESLint and full TypeScript.
- Owner: `/root`
- Status: 🔁 REWORK
- Root cause: the provider-neutral prototype modeled happy-path orchestration before defining one authoritative persisted command/lease/session contract, then tests injected terminal and active states that the real workflow could not produce.
- Fix: retain the corrected ID-based current authorization and reachable lease lifecycle, then add exact-version start input/replay, cleanup independent of mutable definitions, repository-atomic temporal preconditions, full aggregate/intent tuple equality, a tenant-manager/internal terminal reconciliation path for stranded commands, trusted provider operation-status lookup before cleanup, a bounded immutable provider configuration snapshot, stale-receipt lease denial, safe grant timing, and a representable null-provider cleanup path. A later forward database migration must implement those ports, close direct DML and repair lab definition/session/RLS/index invariants; BLK-004 still prevents a live provider claim.
- Regression test (or reason automation is impossible): the superseded first rewrite passes 5 focused files / 34 tests, ESLint and typecheck but is explicitly rejected evidence, not acceptance. The second rework must add one negative regression for every independent finding and undergo another read-only review. Real database/provider isolation, command concurrency, telemetry/cost, browser and E2E evidence remain BLK-004.

## BUG-068 — pinned trainer stage and task policies leaked unrelated authoring rows

- Bug ID: BUG-068
- Severity: P0
- Feature and workflow: trainer content context, tenant isolation and raw authoring confidentiality; WF-04/WF-05
- Environment and revision: independent read-only review of migration `20260717100000_global_content_scope_and_prerequisites.sql` on 2026-07-18
- Reproduction steps: authenticate as a valid scoped trainer for one cohort, then select `public.stages` or `public.tasks` belonging to an unrelated draft, publication, course or tenant.
- Expected: a trainer can read a normalized stage or task only when both its course and exact content-version pin match a cohort the current actor is authorized to train; unrelated draft and cross-tenant rows return zero.
- Actual: both policies referenced unqualified `course_id` and `content_version_id` inside a subquery whose `cohort_record` relation defines the same column names. PostgreSQL resolves those identifiers to the inner relation, making both comparisons tautologies; authorization to train any cohort therefore exposed every stage and task row, including draft identifiers, state and task target URLs.
- Screenshot/log/correlation evidence: static policy review at migration lines 687–705; pgTAP `021` has a learner-negative assertion but no authenticated assigned-trainer negative control.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: correlated RLS policy predicates did not qualify target-table columns, and the test matrix omitted same-tenant-unpinned and cross-tenant trainer controls.
- Fix: add an immutable forward corrective migration that recreates both policies with explicit target-table qualification, plus focused structural and runtime pgTAP coverage. Do not rewrite the already-rehearsed migration `100000`.
- Regression test (or reason automation is impossible): pending clean reset, strict lint, focused regression, complete database suite, regenerated types and application gates; BUG-028 must separately remove direct workflow DML before the combined security wave can be accepted.

## BUG-069 — publish readiness allowed practical tasks with no review rubric

- Bug ID: BUG-069
- Severity: P1
- Feature and workflow: content publication and trainer review; WF-04/WF-05
- Environment and revision: independent read-only review through migration `20260717100000_global_content_scope_and_prerequisites.sql` on 2026-07-18
- Reproduction steps: create a practical task without a `task_rubric_assignments` row, complete the remaining localized graph, and publish its content version; later submit the task for trainer review.
- Expected: every learner task that enters the mandatory trainer-review workflow has exactly one immutable, complete rubric assignment before publication, or an explicitly modeled non-reviewed task kind follows a separate supported completion state machine.
- Actual: the publication-readiness wrapper validates existing rubric assignments but never requires one. A practical task can therefore be published and attempted, while `decide_submission_effects_unowned` rejects its review because `assigned_rubric_id` is null and scored review input cannot be empty. The first `100050` correction fixed serial readiness, but its rubric-definition guard did not lock assigned content-version rows: a concurrent publish can snapshot the prior criteria while a rubric/criterion mutation observes `in_review` and commits after publication, recreating live/snapshot divergence.
- Screenshot/log/correlation evidence: comparison of the readiness wrapper in migration `100000`, the review-effects function introduced by `98500`, rubric-null practical fixtures in pgTAP `021`, and independent rejection of migration `100050` at its unlocked `guard_published_rubric_definition` predicate.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: rubric integrity was validated conditionally after assignment, but reviewability was not included in the publication completeness invariant.
- Fix: forward-strengthen publication readiness so each publishable practical task has one exact immutable rubric assignment whose criteria are valid; deterministically lock every assigned content-version row before allowing rubric/criterion mutation; preserve an explicit path for any task kind that product later approves as unreviewed rather than inventing completion semantics.
- Regression test (or reason automation is impossible): serial positive/missing/empty rubric coverage is green but not accepted. A deterministic two-session publish-vs-rubric and publish-vs-criterion race must prove snapshot/fingerprint/live reviewability cannot diverge, followed by clean reset/lint/full DB, generated types and browser WF-04/WF-05 verification.

## BUG-070 — flexible-cohort reviewers could not read answer keys or model answers

- Bug ID: BUG-070
- Severity: P1
- Feature and workflow: trainer submission review and assessment solutions; WF-04
- Environment and revision: independent read-only review through migration `20260717100000_global_content_scope_and_prerequisites.sql` on 2026-07-18
- Reproduction steps: assign a trainer to an active flexible cohort with an exact immutable publication pin but no task-schedule rows, then review a learner submission containing assessment selections.
- Expected: the authorized cohort trainer can compare the learner's selected test answers with the exact pinned task's correctness and localized model answer; other cohorts, versions and tenants remain denied.
- Actual: `task_option_answers` and `task_model_answers` policies authorize only through `task_schedules`. Flexible cohorts intentionally require no schedule, and the safe review-context RPC excludes solution data, so the trainer cannot perform the Plan 10 review workflow.
- Screenshot/log/correlation evidence: comparison of the hardened solution policies in migration `99950`, the flexible cohort model, `get_submission_review_context`, and scheduled-only pgTAP coverage.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: solution access reused the legacy scheduled-progression join instead of the canonical cohort course/content-version pin.
- Fix: forward-replace both solution policies or expose an equally narrow actor-derived review projection using exact task/version/cohort trainer authorization, independent of schedule presence and without learner exposure.
- Regression test (or reason automation is impossible): pending assigned-flexible positive, wrong-cohort, unpinned-version, cross-tenant, learner-denial and review-workbench integration tests.

## BUG-071 — task-specific questions disappeared during valid revision work

- Bug ID: BUG-071
- Severity: P1
- Feature and workflow: learner mentoring during revision; WF-02/WF-03
- Environment and revision: independent review of `list_my_available_question_contexts` in migration `100000` on 2026-07-18
- Reproduction steps: start and submit an entitled task, let its due window close or entitlement expire, receive a revision-required decision, then open the question form.
- Expected: existing in-progress/submitted/revision-required/resubmitted work retains its exact task-specific question context while a learner is still authorized to open and revise that attempt; never-started locked work stays denied.
- Actual: the task projection preserves active work, but the question-context function authorizes only from current lock reasons. It therefore removes mentoring context exactly when a post-due revision may require trainer help.
- Screenshot/log/correlation evidence: comparison of the active-attempt override in the task projection with the question-context predicate and pgTAP `021`, which covers only never-started locked/currently-unlocked cases.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: question availability duplicated the prerequisite/schedule predicate without sharing the established-active-work exception.
- Fix: forward-replace the question-context boundary with the exact enrollment/cohort/task active-attempt override used by learner task access, retaining all actor/tenant/publication checks.
- Regression test (or reason automation is impossible): the first corrective test proves post-due scheduled continuity and never-started denial, but independent acceptance rejected the missing flexible-cohort entitlement-expiry case. Exact flexible open/revision work after expiry, never-started denial, active-principal/cross-context denial and browser question creation remain required.

## BUG-072 — authenticated users could enumerate raw draft course metadata

- Bug ID: BUG-072
- Severity: P2
- Feature and workflow: content confidentiality and publication boundary; WF-01/WF-05
- Environment and revision: independent RLS review through migration `100000` on 2026-07-18
- Reproduction steps: authenticate as an ordinary learner and query `public.courses` and `public.course_localizations` for global or same-tenant draft/archived definitions.
- Expected: learners consume only the allow-listed published catalog and immutable assigned-course projections; raw draft/in-review/archived course metadata is limited to authorized content managers.
- Actual: the corrective migration removed broad normalized child-table reads but retained permissive `courses_member_read` and `course_localizations_member_read`; permissive policy OR semantics still expose global drafts to every member and same-tenant drafts to learners.
- Screenshot/log/correlation evidence: policy comparison between migration `95000`, the drop list in migration `100000`, and the learner raw-read aggregate in pgTAP `021`, which omits both tables.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: the normalized-authoring closure inventory excluded the root course and localization tables after safe catalog/learner projections already existed.
- Fix: forward-remove ordinary member raw reads while preserving public safe catalog projections and exact content-manager policies; verify application consumers do not depend on raw learner access.
- Regression test (or reason automation is impossible): pending global/same-tenant draft and archived learner denials, published catalog availability, assigned learner projection, content-manager positive, and connected TS/browser regression.

## BUG-073 — moving a draft task could orphan its exact rubric assignment

- Bug ID: BUG-073
- Severity: P2
- Feature and workflow: authoring graph integrity and reviewability; WF-04/WF-05
- Environment and revision: independent constraint/trigger review through migration `100000` on 2026-07-18
- Reproduction steps: assign a rubric to a draft task/version, then move that task to a stage and content version in another draft graph without updating the assignment.
- Expected: the task and its canonical rubric assignment remain bound to the same immutable `(task_id, content_version_id)` identity at every write, or the move is rejected atomically.
- Actual: the assignment has a unique task/version pair but no composite foreign key to the task's declared version. Its validator runs only when the assignment changes, while task graph-scope updates can leave a stale orphaned assignment; publication of the destination graph can then omit it.
- Screenshot/log/correlation evidence: comparison of the task composite uniqueness added by migration `100000`, the assignment constraints, and the task/assignment validation trigger event lists.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: exact task-publication identity was enforced procedurally on assignment writes but not declaratively or on task scope changes.
- Fix: add a composite foreign key from assignment `(task_id, content_version_id)` to the task exact-version key where compatible, or reject/revalidate task scope moves with equivalent transactional guarantees.
- Regression test (or reason automation is impossible): pending draft-move denial, valid same-version editing, publication/review compatibility, clean migration and full DB regression.

## BUG-074 — mastery snapshots could cite a source event with different values

- Bug ID: BUG-074
- Severity: P2
- Feature and workflow: mastery provenance and migration integrity; WF-04/WF-07
- Environment and revision: independent constraint/trigger review through migration `100000` on 2026-07-18
- Reproduction steps: insert or update a mastery snapshot whose source event has the same tenant/learner/skill identity but a different `new_basis_points` or `rule_version`; separately inspect pre-existing mastery/question rows that existed before the new row triggers were installed.
- Expected: every snapshot exactly equals its cited source event's new score and rule version, and migration aborts with a precise preflight error if legacy mastery scope/evidence/value or question cohort/tenant invariants are already corrupt.
- Actual: the composite FK proves only source identity. The trigger does not compare score/rule values, and the new mastery/question triggers are not retroactive, so compatible-key but semantically false provenance and some legacy mismatches can survive.
- Screenshot/log/correlation evidence: migration `100000` composite FK, `validate_mastery_scope`, question-pin backfill/trigger order, and pgTAP `021` matching-value happy paths.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: identity integrity was made declarative, while value equivalence and legacy-row validation remained implicit assumptions.
- Fix: add an exact snapshot-source value/rule validator plus explicit aborting legacy audits for mastery skill/evidence/source values and question organization/cohort/version scope before the corrected contract is accepted.
- Regression test (or reason automation is impossible): value/rule mismatch and compatible runtime cases are green but not accepted; the aborting legacy audit must still be invoked against deliberately corrupt rollback-only rows, followed by complete review/mastery/question regression.

## BUG-075 — concurrent accepted reviews could corrupt mastery event chronology

- Bug ID: BUG-075
- Severity: P2
- Feature and workflow: trainer review effects and mastery history; WF-04/WF-07
- Environment and revision: concurrency review of the patched review-effect function through migration `100000` on 2026-07-18
- Reproduction steps: concurrently accept two different submissions for the same organization/learner/skill, or two multi-skill submissions whose loops encounter overlapping skills in different orders.
- Expected: each mastery event records the true immediately preceding score, snapshot writes serialize deterministically, and multi-skill reviews cannot deadlock from inconsistent lock order.
- Actual: each transaction reads `previous_mastery` without a row/advisory lock before upsert; both can record the same stale predecessor, and the unordered skill loop can acquire snapshot locks inconsistently.
- Screenshot/log/correlation evidence: predecessor `decide_submission_effects_unowned` mastery loop and the tenant-only textual patch in migration `100000`; pgTAP `021` is sequential.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: optimistic submission CAS serialized each submission but not the shared learner-skill aggregate updated by different submissions.
- Fix: acquire transaction-scoped locks for every affected `(organization, learner, skill)` in deterministic skill order before reading the predecessor and writing event/snapshot rows; retain exact tenant qualification.
- Regression test (or reason automation is impossible): the first real two-session/two-skill test produced a contiguous predecessor chain, but independent review rejected fixed-sleep synchronization. The replacement must deterministically prove session A holds the target aggregate locks before starting B, then prove a valid predecessor chain, no lost effects and no deadlock.

## BUG-076 — malformed published prerequisites could fail open

- Bug ID: BUG-076
- Severity: P2
- Feature and workflow: prerequisite authorization and imported publication safety; WF-02/WF-07
- Environment and revision: independent snapshot-parser review through migration `100000` on 2026-07-18
- Reproduction steps: supply a trusted/imported publication snapshot with a present non-array `prerequisites` value, malformed rule object/UUID, null skill threshold or stale referenced task/version, then evaluate learner availability.
- Expected: a genuinely absent legacy prerequisite key remains compatible, while any explicitly present malformed or stale rule yields a safe configuration lock and cannot unlock an activity.
- Actual: a missing key and wrong-type value share the same return path, and several malformed fields fall through without a lock. The first `100050` parser correction still accepted a syntactically valid nonexistent skill UUID at threshold zero because it did not prove active/canonical/scope-compatible skill existence; inactive, cross-tenant and noncanonical skills plus rule `id`/`rule_version` also remained unvalidated.
- Screenshot/log/correlation evidence: `learner_snapshot_task_lock_reasons` branches in migration `100000`, the older snapshot validator, pgTAP `021`, and the independent rollback-only `100050` runtime probe where a nonexistent skill UUID with threshold `0` returned no lock reason.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: backward compatibility for snapshots without prerequisite metadata was conflated with validation of explicitly configured prerequisites.
- Fix: distinguish absent from present-malformed data; validate rule `id`, `rule_version`, every supported shape/reference/threshold, and active canonical skill/task existence compatible with the exact course/tenant; emit `configuration` on any invalid explicit payload and retain precise 0/10000/equality semantics.
- Regression test (or reason automation is impossible): wrong-type and several malformed/threshold cases are green but rejected as incomplete. Nonexistent, inactive, cross-tenant/noncanonical skills; invalid rule identity/version; stale task/version; threshold 0/equality/10000; and absent-legacy-key cases are all required.

## BUG-077 — trusted-fixture exception was a service-role graph-mutation backdoor

- Bug ID: BUG-077
- Severity: P1
- Feature and workflow: immutable published content/rubric graph; WF-04/WF-05
- Environment and revision: trigger/security-definer review of migrations `99600` and `100000` on 2026-07-18
- Reproduction steps: invoke a published-graph INSERT through a server/service operation with no end-user JWT, including adding criteria to a published rubric.
- Expected: no runtime actor, including service-role operations, can mutate a published graph; tests and migration fixtures use explicit test-only setup outside production trigger semantics.
- Actual: the guard permits INSERT when `auth.uid()` is null and `current_user` equals the lifecycle owner. Because the trigger function is SECURITY DEFINER, `current_user` is the owner rather than proof of the invoker, creating a permanent auth-null bypass across content graph rows and the new rubric-definition guard.
- Screenshot/log/correlation evidence: exception branches in migrations `99600` and `100000`, plus live review logic that still reads normalized rubric criteria while the UI context is snapshot-frozen.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: a fixture compatibility mechanism used security-definer execution identity as if it authenticated a trusted caller.
- Fix: remove the production exception from both guards and reconcile tests with explicit test setup/trigger control rather than a callable runtime bypass; audit published graphs before enabling the corrected guards.
- Regression test (or reason automation is impossible): pending service-role/auth-null denial for every guarded graph family, content-manager denial after publication, legitimate draft editing and frozen-snapshot review compatibility.

## BUG-078 — attempt start lacked an exact enrollment context and safe replay contract

- Bug ID: BUG-078
- Severity: P1
- Feature and workflow: learner attempt start/idempotency/authorization; WF-02
- Environment and revision: independent database and application-consumer review of `public.start_attempt(uuid,text)` through migration `100000` and the learner task route on 2026-07-18
- Reproduction steps: reuse one key for another task; call with a null key; replay after profile/membership/cohort revocation; or enroll the same learner in two eligible cohorts that reuse the same global task and start the second context.
- Expected: the caller identifies one authorized enrollment/cohort/task publication; validation occurs before every replay; the non-null key is payload/context-bound; open attempts are unique per exact enrollment/task and never leak or block another course instance.
- Actual: early replay occurs by learner/key before active-principal/context validation, null bypasses the length-only check, open-attempt lookup is learner/task-global, and eligible context selection silently chooses the most recently updated enrollment. The application sends only browser task/key, checks the returned attempt against browser `groupId`, accepts any task-version suffix with the right prefix, does not runtime-parse the RPC tuple, omits enrollment/organization/content-version containment for supplied attempts, and reruns the ambiguous task-only projection after persistence. A replay can therefore return a different task/cohort attempt or disclose a prior attempt to a revoked principal; render, mutation and hydration can select different enrollments; and no action-level regression tests currently cover the boundary.
- Screenshot/log/correlation evidence: `start_attempt` replay/context ordering in migration `100000`; schema uniqueness per `(enrollment_id, task_id)`; `src/app/[locale]/learn/tasks/[taskId]/{actions,data}.ts`; the task-only links/projection; generated old RPC signature; matching-replay-only pgTAP coverage; and the completed read-only BUG-078 consumer inventory.
- Owner: `/root/mutation_boundary_audit`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: a global task identifier was treated as a delivery-context command key, and idempotency lookup preceded authoritative actor/resource validation.
- Fix: replace the database contract with `start_attempt(enrollment_id, task_id, idempotency_key, correlation_id)` returning a narrow runtime-validated context tuple. Derive enrollment only from a fresh actor-authorized exact task projection, validate active actor/tenant/cohort/publication/prerequisites before both new and replay paths, require a non-null bounded key, bind the receipt to actor/operation/organization/enrollment/cohort/content-version/task, serialize the exact enrollment/task aggregate, and remove the old signature after consumers migrate. The application must treat browser group/version/enrollment selectors only as stale-UI hints, compare every returned tuple field, filter supplied attempts by the server-derived context, hydrate through that same context/client, and expose an enrollment-scoped task route/projection so two valid course instances are not silently ordered by `updated_at`.
- Regression test (or reason automation is impossible): pending null/short/long key, payload mismatch, revoked actor, wrong/cross tenant, two-cohort same-task, exact replay, prerequisite, stale and concurrent start cases in the `100100`/pgTAP `023` mutation wave; new action tests must cover wrong role/permission/organization, stale browser group/version, malformed projection/RPC output, exact existing-attempt containment, context-switch prevention and safe error/reconciliation behavior.

## BUG-079 — unpinned legacy questions cannot cross migration `100000`

- Bug ID: BUG-079
- Severity: P2
- Feature and workflow: legacy cohort/question migration compatibility; WF-03 and cutover
- Environment and revision: migration-sequence review on 2026-07-18; production-like legacy export remains BLK-012
- Reproduction steps: retain a supported legacy cohort whose `content_version_id` could not be safely inferred and a task question in that cohort, then apply migration `100000`.
- Expected: cutover preflight identifies every unpinned question/task/cohort and requires an approved immutable publication mapping before the not-null/composite-FK migration; it never guesses or fails with an opaque constraint error.
- Actual: migration `99700` intentionally preserves unverifiable cohorts with a null pin, but migration `100000` backfills question pins from that nullable field and immediately requires a non-null exact task/version FK. Such legacy rows cannot migrate, and no production-data preflight report currently names them.
- Screenshot/log/correlation evidence: comparison of the nullable legacy reconciliation in migration `99700`, the question backfill/constraints in `100000`, and the absent production-like export under BLK-012.
- Owner: `/root`
- Status: ⛔ BLOCKED
- Root cause: the greenfield exact-pin correction assumed the earlier legacy reconciliation had a unique answer even though it deliberately preserves ambiguous rows.
- Fix: add a read-only cutover preflight/report that enumerates unpinned cohorts/questions/tasks and blocks before schema migration with exact external IDs; map them only from an approved legacy export/content-version reconciliation.
- Regression test (or reason automation is impossible): a synthetic ambiguous-row preflight test can proceed; a real migration rehearsal and final mapping remain blocked until BLK-012 supplies the anonymized export and reconciliation rules.

## BUG-080 — flexible learners and overdue valid revisions could not submit

- Bug ID: BUG-080
- Severity: P1
- Feature and workflow: first submission and revision/resubmission; WF-02, MOD-11/14
- Environment and revision: independent read-only attempt mutation audit through immutable migration `100000` on 2026-07-18
- Reproduction steps: start an available task in an active flexible cohort with no `task_schedules` row and submit it; receive `revision_required` and then let either the scheduled due date or flexible package entitlement expire before correcting the still-readable exact attempt.
- Expected: flexible progression uses the exact active enrollment/publication/prerequisite context without inventing a schedule, and an already-issued exact revision remains correctable after the initial availability/entitlement window while active principal, tenant, cohort and enrollment containment still hold, unless an explicit audited trainer/admin decision closes it.
- Actual: `submit_attempt` requires a currently active `task_schedules` row for every submission. Flexible cohorts always fail, and overdue revisions that the learner projection intentionally preserves also fail with `42501`.
- Screenshot/log/correlation evidence: frozen `submit_attempt` at migration `96000` lines 222–229 versus snapshot/prerequisite-aware flexible and existing-attempt projection logic in migration `100000`.
- Owner: `/root/mutation_boundary_audit`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: submission retained the first scheduled-only availability rule after attempt start and safe reads evolved to flexible progression and revision continuity.
- Fix: forward-replace submission authorization with the exact enrollment/content pin and named progression mode; require current availability/prerequisites for a first submission, but preserve an exact existing `revision_required` correction path with active principal/membership and immutable context.
- Regression test (or reason automation is impossible): pgTAP `023` must cover scheduled/flexible positive and negative cases, due/entitlement-before-first-submit denial, overdue and post-entitlement exact-revision success, revoked actor/cohort/enrollment denial and no cross-enrollment fallback; connected app/E2E revision tests remain required.

## BUG-081 — draft and submit commands did not revalidate the active principal or exact delivery context

- Bug ID: BUG-081
- Severity: P1
- Feature and workflow: learner draft/submission authorization and draft confidentiality; WF-02
- Environment and revision: independent read-only attempt mutation audit through immutable migration `100000` on 2026-07-18
- Reproduction steps: retain an authenticated token after profile, organization membership, cohort membership or learner permission revocation and call `save_attempt_draft`/`submit_attempt`; or train a cohort and select an unsubmitted learner draft directly.
- Expected: every mutation revalidates active profile, exact active tenant/cohort learner membership, learner role, `learning.submit`, enrollment and publication pin; trainers inspect only submitted immutable evidence through the review context, never a learner's unsent draft.
- Actual: both SECURITY DEFINER commands primarily check `auth.uid()` ownership/state. Raw attempts/drafts policies use bare learner ownership or `can_train_cohort`, and `attempt_drafts_scoped` exposes all unsent drafts to a cohort trainer.
- Screenshot/log/correlation evidence: migration `98400` lines 150–157, migration `96000` lines 204–217, and migration `95000` lines 472–479; no later frozen migration closes these command/read paths.
- Owner: `/root/mutation_boundary_audit`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: ownership was treated as current authorization, and trainer review reused broad cohort visibility instead of the immutable submitted-version boundary.
- Fix: apply the canonical active-principal/exact-context helper before mutation and replay; reduce draft reads to the owner and expose trainer telemetry only through a minimal submitted review projection; revoke direct workflow DML under BUG-028.
- Regression test (or reason automation is impossible): active/inactive profile, membership/role/permission/cohort/enrollment/pin, trainer-unsent-draft, exact submitted review and cross-tenant pgTAP cases are required.

## BUG-082 — draft save and submit could deadlock or leave a draft on terminal work

- Bug ID: BUG-082
- Severity: P1
- Feature and workflow: concurrent autosave and submission; WF-02
- Environment and revision: independent read-only attempt mutation audit on 2026-07-18
- Reproduction steps: race an expected-version-zero draft insert/save against first submission from two tabs, or interleave later draft update and submit transactions.
- Expected: one deterministic aggregate lock order serializes draft and submission; either the save commits before the immutable submission snapshot or it returns a stable stale/conflict result, and no draft exists after submitted/resubmitted/accepted state.
- Actual: save writes/locks the draft before updating the attempt, while submit reads/updates the attempt before deleting the draft. The inverse lock order can deadlock; an insert can also occur after submit deletes the old draft and then update telemetry on the now-terminal attempt, leaving a mutable draft attached to submitted work.
- Screenshot/log/correlation evidence: migration `98400` lines 150–223 versus migration `96000` lines 204–287; no `FOR UPDATE` serialization on the attempt aggregate.
- Owner: `/root/mutation_boundary_audit`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: draft CAS and attempt CAS were designed separately without one aggregate transaction/lock protocol.
- Fix: lock the exact attempt first in every command, recheck state after the lock, then lock/write/delete the draft in the same order; add a constraint/guard preventing drafts for non-editable attempts and stable concurrency errors.
- Regression test (or reason automation is impossible): real two-session save-vs-submit, save-vs-save and submit-vs-submit tests must prove no deadlock, one winner/convergent replay, no orphan draft and exact immutable content.

## BUG-083 — submission replay was payload-unbound and the UI could not reconcile a lost response

- Bug ID: BUG-083
- Severity: P1
- Feature and workflow: idempotent submission and client recovery; WF-02
- Environment and revision: independent database/application audit on 2026-07-18
- Reproduction steps: commit `submit_attempt` and lose the response, then retry; or reuse the key with edited answer/options/evidence.
- Expected: a receipt binds actor, exact attempt/enrollment/content version, expected version and canonical answer/options/evidence payload; exact retry returns a narrow verified receipt, mismatch conflicts, and the client reconciles a committed write without resaving a now-terminal draft.
- Actual: replay checks only submission plus key and returns before state/schedule/current-authorization validation. The UI retry path first invokes draft save, which fails after the attempt became terminal, so the committed submission is presented as a permanent generic failure; edited content can reuse the same submission key.
- Screenshot/log/correlation evidence: migration `96000` lines 211–217 and learner task actions lines 80–128 plus task-workspace retry behavior from the independent consumer audit.
- Owner: `/root/mutation_boundary_audit`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: idempotency was modeled as a unique key rather than ADR-029's context/payload-bound command receipt, and save/submit recovery was not one state-aware client protocol.
- Fix: store/compare a canonical receipt hash and authorize before replay; return replay/state/correlation data; make the action reconcile authoritative attempt/submission state after ambiguous save or submit outcomes and preserve the original payload/key.
- Regression test (or reason automation is impossible): exact replay, changed payload/context, revoked replay, same-key concurrent convergence, committed-response-lost, unknown outcome, safe correlation/error mapping and UI retry tests are required.

## BUG-084 — assessment and evidence submission integrity was not enforced

- Bug ID: BUG-084
- Severity: P1
- Feature and workflow: MCQ/evidence validation and immutable submission evidence; WF-02/WF-04
- Environment and revision: independent read-only attempt mutation audit on 2026-07-18
- Reproduction steps: submit zero or too many choices against assessment cardinality; pass a nonexistent, other-learner, other-tenant or other-task evidence UUID; or omit evidence from a task snapshot that requires it.
- Expected: exact immutable task rules determine response/cardinality/evidence requirements and authoritative answer, JSON, array and elapsed-time bounds; every referenced evidence row is owned by the learner, tenant/task/content context compatible, integrity-validated and atomically associated with the immutable submission version.
- Actual: submission accepts blank answer text and zero selections, and only rejects option IDs that do not belong to the normalized task. It does not enforce immutable min/max selection, evidence-required rules, meaningful database-side payload limits or any existence/ownership/scope check for `p_evidence_refs`; client-supplied elapsed time can approach the integer maximum. The learner projection/model omit assessment cardinality, and UUID arrays are copied directly into the version with no normalized immutable association. `can_access_evidence` grants trainer access only through `evidence.submission_version_id`, which submission never sets, so even legitimate referenced evidence is then RLS-filtered out of the trainer review query.
- Screenshot/log/correlation evidence: migration `96000` lines 230–278; task-assessment cardinality fields/projection in migrations `98400`/`99800`; learner task model; evidence schema/policies in migrations `93000`/`99950`; trainer evidence query in `src/app/[locale]/trainer/submissions/[submissionId]/data.ts`.
- Owner: `/root/mutation_boundary_audit`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: the initial submission command treated client-selected identifiers as validated payload rather than resolving the immutable publication and evidence ledger.
- Fix: publish and consume exact cardinality/response/evidence rules; enforce bounded canonical payloads at the command boundary; validate all answer and evidence tuples under lock; reject blank/empty, duplicates, foreign or unvalidated artifacts as the task kind requires; add an immutable normalized submission-version/evidence junction and update the minimal trainer RLS/projection while retaining safe snapshot IDs.
- Regression test (or reason automation is impossible): answer-policy, min/max/single/multiple, duplicate option, oversized text/JSON/arrays/elapsed time, missing/foreign/cross-tenant/cross-task evidence, required evidence, concurrent relink, learner rehydrate and trainer exact-read tests are required.

## BUG-085 — submitted evidence disappeared from learner revision/history hydration

- Bug ID: BUG-085
- Severity: P2
- Feature and workflow: learner submission history and revision prefill; WF-02
- Environment and revision: application data-boundary review on 2026-07-18
- Reproduction steps: submit evidence, allow the command to delete the draft, then reopen the task after submission or revision is requested.
- Expected: the latest immutable version rehydrates its exact evidence references/metadata, and revision starts from the prior submitted evidence without silently dropping it.
- Actual: the submission-version query omits `evidence_refs`; when no draft exists, the adapter sets `evidence = []`, and it writes that empty list into the immutable snapshot presented to the workspace. Malformed evidence rows are silently dropped rather than producing an integrity/unavailable state, and database evidence-source categories are collapsed into incompatible review presentation kinds.
- Screenshot/log/correlation evidence: `src/app/[locale]/learn/tasks/[taskId]/data.ts` lines 123–172 and 197–205.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: history hydration implemented text/options/timing but never joined the immutable evidence ledger after draft deletion.
- Fix: use a minimal authorized evidence projection keyed by the exact latest submission version, runtime-validate it fail-closed, map canonical source categories explicitly, preserve safe metadata only, and prefill revisions without exposing signed URLs beyond their lifetime.
- Regression test (or reason automation is impossible): submitted/revision/multi-version, malformed/missing artifact, source-kind mapping, foreign evidence, redaction and expired-link hydration tests plus browser revision verification are required.

## BUG-086 — evidence ledger rows were mutable behind immutable submission history

- Bug ID: BUG-086
- Severity: P2
- Feature and workflow: evidence ledger integrity, portfolio and review provenance; WF-02/WF-04/WF-08
- Environment and revision: schema/trigger review on 2026-07-18
- Reproduction steps: mutate a referenced evidence row's task, source URI, hash, metadata, capture time or retention fields through a privileged path after a submission version or mastery event cites it.
- Expected: identity, owner, tenant, source, task, integrity hash and captured provenance are append-only; only explicitly modeled lifecycle/redaction/retention metadata can change through audited commands without rewriting historical proof.
- Actual: `public.evidence` has no immutable trigger or named lifecycle command. A privileged update can change the meaning of an ID already stored in immutable submission, portfolio, validation or mastery records.
- Screenshot/log/correlation evidence: evidence table in migration `93000` lines 110–134, append-only triggers on adjacent event tables, and absence of an evidence mutation guard in later frozen migrations.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: evidence was modeled as a record with an integrity hash but not as an immutable provenance aggregate with controlled redaction/retention events.
- Fix: forward-add immutable core-field guards, explicit audited lifecycle/redaction/retention commands and exact dependent-link integrity; do not make illegal historical changes by cascading updates.
- Regression test (or reason automation is impossible): learner/trainer/admin/service-role core mutation denial, allowed audited lifecycle transition, reference stability, redaction privacy and retention tests are required.

## BUG-087 — submission versions did not freeze the hint-use history they reported

- Bug ID: BUG-087
- Severity: P2
- Feature and workflow: hint telemetry, immutable submission review and revisions; WF-02/WF-04
- Environment and revision: independent attempt mutation/data audit on 2026-07-18
- Reproduction steps: submit version 1 after using no hint, receive a revision, use a hint and submit version 2, then reopen the version-1 learner or trainer history.
- Expected: each immutable submission version records the exact hint identifiers/timestamps visible at that submission; later revision behavior cannot rewrite earlier review evidence.
- Actual: `submission_versions` stores only aggregate `hint_used`; both learner and trainer hydration read the attempt-global append-only `attempt_hint_usage`, so hints first used during a later revision retroactively appear in older version context.
- Screenshot/log/correlation evidence: submission-version schema in migration `92000`, write logic in `96000`, and attempt-global hint reads in learner/trainer task data adapters.
- Owner: `/root/mutation_boundary_audit`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: append-only attempt telemetry was mistaken for a point-in-time immutable submission snapshot.
- Fix: atomically snapshot exact hint usage into a normalized submission-version junction or immutable allow-listed snapshot during submit; review/history queries must join the selected version, while attempt-global telemetry remains useful only for current draft context.
- Regression test (or reason automation is impossible): no-hint v1/hint v2, multiple hints/timestamps, replay, cross-attempt isolation and trainer exact-version tests are required.

## BUG-088 — green policy tests exercised an unused attempt service instead of the production actions

- Bug ID: BUG-088
- Severity: P2
- Feature and workflow: WF-02 test architecture and release evidence
- Environment and revision: independent consumer/test inventory on 2026-07-18
- Reproduction steps: trace imports of `src/features/tasks/server/attempt-service.ts`, then search action tests and pgTAP calls to `submit_attempt`.
- Expected: authorization/idempotency tests execute the production server actions and real database commands used by the task route; an unused abstraction cannot satisfy release evidence.
- Actual: the only tests asserting `TaskAccessPolicy` target an attempt service with no production consumer. The live route calls `[taskId]/actions.ts` directly, has no action-level test, and no existing pgTAP suite invokes `submit_attempt`, allowing BUG-080–087 to coexist with green unit/database totals.
- Screenshot/log/correlation evidence: repository import graph, task route/action files, `attempt-service` tests, and an empty `submit_attempt(` search under `supabase/tests` before pgTAP `023`.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: a prototype service boundary and production server actions diverged without a traceability gate that tied tests to runtime consumers.
- Fix: either make one tested service the production action dependency or remove the dead abstraction; add action tests and real pgTAP command coverage, and record those exact test IDs in traceability.
- Regression test (or reason automation is impossible): import-graph/contract test plus action tests and pgTAP `023` must exercise start/save/submit through the actual signatures and error/replay paths.

## BUG-089 — attempt and submission rows lacked an exact constrained delivery tuple

- Bug ID: BUG-089
- Severity: P1
- Feature and workflow: attempt/submission integrity and immutable publication provenance; WF-02/WF-04
- Environment and revision: independent schema and mutation-command audit through immutable migration `100000` on 2026-07-18
- Reproduction steps: inspect the independently nullable organization, enrollment, learner, cohort and task foreign keys on attempts/submissions; create a legacy or privileged inconsistent tuple; then submit against a task whose normalized content version differs from the cohort publication pin.
- Expected: every attempt persists one exact organization/enrollment/learner/cohort/content-version/task tuple constrained to its parents and immutable publication; commands reject inconsistent pre-existing rows before creating review history.
- Actual: attempts do not persist `content_version_id`, and neither attempts nor submissions have composite parent/content constraints. `submit_attempt` trusts the denormalized columns and snapshots the task's normalized version without proving it equals the assigned cohort pin, so a forged or legacy-inconsistent aggregate can create cross-context, unreviewable history even after browser DML is revoked.
- Screenshot/log/correlation evidence: attempt/submission schema in migration `92000`, task snapshot construction in migration `96000`, cohort publication pin in migration `99700`, and the completed independent attempt mutation audit.
- Owner: `/root/mutation_boundary_audit`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: independently useful foreign keys were mistaken for an authoritative aggregate identity; the publication pin was resolved during reads rather than persisted and constrained at attempt creation.
- Fix: preflight all existing rows, forward-add the exact content-version and composite parent constraints, populate only provable mappings, bind every command receipt to the tuple, and block migration with an explicit reconciliation report rather than guessing ambiguous legacy context.
- Regression test (or reason automation is impossible): valid exact tuple, mismatched organization/enrollment/learner/cohort/task/version, legacy-preflight, two-cohort same-task, immutable pin and submitted-review-context tests are required in pgTAP `023`; real V1 reconciliation remains BLK-012.

## BUG-090 — abandoned attempts were presented as editable drafts

- Bug ID: BUG-090
- Severity: P2
- Feature and workflow: learner attempt hydration and state-machine fidelity; WF-02
- Environment and revision: production task data-adapter audit on 2026-07-18
- Reproduction steps: hydrate a database attempt in valid terminal state `abandoned`, open the learner task workspace, and let the workspace attempt an autosave.
- Expected: every canonical database state maps explicitly to a compatible non-editable UI state or a named unavailable/restart path; unknown values fail closed.
- Actual: `src/app/[locale]/learn/tasks/[taskId]/data.ts` maps every non-submitted/non-accepted/non-revision state, including `abandoned`, to editable `draft`. Autosave then repeatedly calls a command that correctly rejects the terminal attempt.
- Screenshot/log/correlation evidence: learner task state adapter around `data.ts` lines 46–52 compared with the canonical attempt-state enum and draft command state checks.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: a permissive fallback collapsed unhandled domain states into the most privileged editable presentation state.
- Fix: make state mapping exhaustive and fail closed; present abandoned work as non-editable with an actor-authorized exact restart/recovery action only if a product rule exists.
- Regression test (or reason automation is impossible): exhaustive compile/runtime state mapping, abandoned/unknown-state hydration, no-autosave assertion and browser empty/recovery state are required.

## BUG-091 — organization-scoped learners without a cohort were rejected by the application principal

- Bug ID: BUG-091
- Severity: P1
- Feature and workflow: standalone registration, catalog, enrollment and pre-assignment learner routes; WF-01/CUR-02/04
- Environment and revision: read-only identity/history audit on 2026-07-18
- Reproduction steps: complete standalone self-registration, retain the valid active organization membership and organization-scoped learner role with `cohort_id = null`, and resolve the application principal before any cohort assignment.
- Expected: the organization-scoped learner role remains valid for catalog, enrollment request, profile/history and other pre-assignment capabilities; only a cohort-scoped assignment requires a matching active learner cohort membership, consistently with ADR-018 and the database resolver.
- Actual: `src/shared/auth/principal.ts` treats every learner/trainer role as a cohort role via `isCohortRole`, even when the role assignment is organization-scoped. It drops the only role and rejects the newly registered learner, while `current_actor_valid_role_assignments()` correctly permits `cohort_id is null` without cohort membership.
- Screenshot/log/correlation evidence: application principal filtering around lines 22 and 112–131; database active-assignment resolver in migration `99950` lines 68–94; existing tests construct only learners with a cohort.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: role code was used as a proxy for assignment scope, contradicting the explicit nullable cohort scope carried by the assignment.
- Fix: application principal filtering now requires matching cohort lifecycle/role only when `assignment.cohort_id` is non-null, matching the database resolver while preserving active organization membership, cohort-role matching and multi-tenant fail-closed behavior. A valid pre-assignment learner/trainer keeps an empty `cohortIds` list.
- Regression test (or reason automation is impossible): coordinator focused principal/protected-route regression passes 2 files / 29 tests, including organization-scoped no-cohort learner and trainer positives; targeted ESLint and full TypeScript pass. Registration→catalog→enrollment action and browser WF-01 verification remain pending before closure.

## BUG-092 — cancelled cohort history was unreachable despite a visible event type

- Bug ID: BUG-092
- Severity: P2
- Feature and workflow: immutable learner course history; CUR-03/WF-06
- Environment and revision: read-only learner-history route/data audit on 2026-07-18
- Reproduction steps: cancel a learner's cohort/enrollment, retain the required historical attribution rows, then open `/learn/history`.
- Expected: the actor-derived immutable history includes the exact cancellation event and course context even though the cancelled cohort is no longer an active learning workspace.
- Actual: principal resolution excludes cancelled cohorts; the history reader restricts every pinned enrollment/attempt/version/review/question query to `principal.cohortIds`, while its separate unpinned-enrollment query accepts only `cohort_id is null`. A normal cancelled, cohort-pinned enrollment therefore disappears even though `course_cancelled` is modeled and localized.
- Screenshot/log/correlation evidence: `accessibleCohortStates` in `src/shared/auth/principal.ts`; cohort filters around `learner-history-data.ts` lines 245–303; modeled/localized `course_cancelled`; ADR-020 historical-attribution rule.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: an active-workspace authorization projection was reused as the historical-event scope instead of deriving immutable records by learner and tenant with exact historical pins.
- Fix: replace mutable multi-query filtering with the bounded actor-derived immutable keyset history RPC under BUG-064; authorize the learner/tenant independently of current cohort workspace state and expose only allow-listed historical facts.
- Regression test (or reason automation is impossible): cancelled/completed/removed-membership history positives, another learner/tenant denial, no workspace resurrection, stable title/pin and keyset pagination tests are required in the post-`100100` history wave.

## BUG-093 — enrollment request replay was not bound to the requested course or payload

- Bug ID: BUG-093
- Severity: P1
- Feature and workflow: guest-to-enrolled learner idempotency; WF-01
- Environment and revision: read-only enrollment-command audit through migration `100050` on 2026-07-18
- Reproduction steps: request one valid course with an idempotency key, then reuse the same key while requesting a different valid course or changed request note in the same active organization.
- Expected: authorization is revalidated and an exact actor/organization/course/note replay returns the original receipt; any context or payload mismatch returns a stable idempotency conflict and never masquerades as the new request.
- Actual: `request_enrollment` authorizes the newly supplied course/tenant, then looks up the receipt only by `(learner_id, idempotency_key)` and returns it without comparing organization, course or normalized note. The caller can receive an older different-course enrollment as if the new request succeeded.
- Screenshot/log/correlation evidence: key-only replay in migration `96000` lines 68–73 and the current wrapper chain in migrations `97000`/`97100`/`98300`; API docs mention generic request replay under BUG-028 but no dedicated payload-mismatch test exists.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: idempotency was implemented as lookup deduplication rather than ADR-029's actor/context/payload-bound receipt.
- Fix: forward-replace the enrollment request command with a narrow receipt bound to actor, organization, course and normalized note; authorize before replay; reject mismatches; retain the existing-active-enrollment convergence rule only when its exact course/context matches.
- Regression test (or reason automation is impossible): exact replay, different course/note/organization, revoked membership/entitlement replay, null/short/long keys, same-key concurrency and production action recovery tests are required.

## BUG-094 — admin content reads used ambiguous PostgREST relationships

- Bug ID: BUG-094
- Severity: P1
- Feature and workflow: admin course/version/task inspection; WF-05
- Environment and revision: local Supabase/PostgREST plus Next.js development server on 2026-07-20
- Reproduction steps: sign in as the seeded administrator and open the course list, course detail, version detail/preview or task list.
- Expected: every nested resource embed resolves one named foreign-key relationship and the read-only studio renders.
- Actual: PostgREST returned relationship-ambiguity errors for task/stage/content-version embeds, so several pages reached the application error boundary.
- Screenshot/log/correlation evidence: pre-fix runtime sweep; corrected Chromium screenshots under `artifacts/screenshots/admin/`.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: generated relational queries relied on table names even where two valid foreign keys existed.
- Fix: bind every affected embed to its named task-stage or task-version foreign key and runtime-validate the resulting projection.
- Regression test (or reason automation is impossible): focused admin data suites pass 13/13; full unit/build gates pass; Chromium admin content studio passes 2/2 across EN/DE/RU and desktop/mobile with zero console/network/Axe failures.

## BUG-095 — server-only localization formatters crossed client component boundaries

- Bug ID: BUG-095
- Severity: P1
- Feature and workflow: learner notifications and learner/trainer questions; WF-03
- Environment and revision: Next.js React Server Component runtime on 2026-07-20
- Reproduction steps: open learner notifications or questions with server copy objects containing formatter functions.
- Expected: client components receive serializable labels/data only.
- Actual: Next.js rejected function-valued props and the pages failed during rendering.
- Screenshot/log/correlation evidence: pre-fix runtime sweep and post-fix `/en/learn/notifications` plus `/en/learn/questions` browser checks.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: server copy factories and client interaction copy were represented by the same object type.
- Fix: materialize client-only copy projections and strip all formatter functions at the server boundary.
- Regression test (or reason automation is impossible): four focused files pass 15/15 including `structuredClone` serialization proofs; full 128-file suite and live Chromium routes pass.

## BUG-096 — trainer could not read the exact active cohort content version

- Bug ID: BUG-096
- Severity: P1
- Feature and workflow: trainer cohort detail and review context; WF-04/WF-06
- Environment and revision: local Supabase RLS and seeded active cohort on 2026-07-20
- Reproduction steps: sign in as the assigned trainer and open `/en/trainer/groups/01980a30-0000-7000-8000-000000000001`.
- Expected: the trainer reads only the exact content version pinned to an actively trained cohort.
- Actual: `content_versions` returned no row, the projection discarded child tasks and raised `cohort_management.child_scope_mismatch`.
- Screenshot/log/correlation evidence: development-server stack trace before the correction and final Chromium trainer-group screenshot recorded in `UI_VERIFICATION.md`.
- Owner: `/root/trainer_content_version_rls`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: no RLS select policy joined content versions to an exact active, assigned trainer cohort pin.
- Fix: add the exact course/version/active-cohort predicate gated by `app_private.can_train_cohort`, preserving content-manager access.
- Regression test (or reason automation is impossible): pgTAP `022` passes 81/81 across exact positive, learner, unassigned, cross-tenant, unrelated, suspended/removed and cancelled negatives; full DB passes 24 files/1015; Chromium/Axe route check passes.

## BUG-097 — public authentication mutations had no distributed throttle

- Bug ID: BUG-097
- Severity: P1
- Feature and workflow: sign-in, registration and password recovery; FND-14/CUR-02
- Environment and revision: Next.js server actions plus local PostgreSQL on 2026-07-20
- Reproduction steps: repeatedly submit sign-in, registration or password-reset forms from one email/client subject.
- Expected: bounded, privacy-minimized, atomic server-side throttles deny abusive traffic before validation/provider calls without enumerating accounts.
- Actual: every request reached validation and Supabase Auth with no shared-process limit.
- Screenshot/log/correlation evidence: migration `20260717100075_authentication_rate_limits.sql`, pgTAP `098`, localized denial surface tests and browser throttle observation.
- Owner: `/root/auth_rate_limit`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: authentication rate limiting was listed as a port but had no persistence or action integration.
- Fix: add service-role-only atomic fixed-window buckets using domain-separated HMAC subjects, bounded cleanup and generic EN/DE/RU denials; generate an independent local HMAC key without exposing it.
- Regression test (or reason automation is impossible): pgTAP `098` passes 30/30 including two-session lost-update coverage; 31 focused auth tests, strict DB lint, client-secret scan and real Chromium authentication pass. Production proxy-header replacement remains a deployment requirement under BLK-010, not an unimplemented application bypass.

## BUG-098 — mobile navigation hid required routes and stayed open after navigation

- Bug ID: BUG-098
- Severity: P2
- Feature and workflow: public legal access and learner history navigation
- Environment and revision: Chromium 390×844 on 2026-07-20
- Reproduction steps: inspect the public header at mobile width, or open the learner mobile menu and navigate to Learning history.
- Expected: all primary routes remain keyboard/accessibility reachable and the disclosure closes after a client-side navigation.
- Actual: CSS hid all public text links with no replacement menu; after adding the learner history link, the persistent app-shell disclosure obscured the destination.
- Screenshot/log/correlation evidence: `/tmp/ditele-runtime-qa/legal-mobile-before.png` and post-fix evidence listed in `UI_VERIFICATION.md`.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: responsive CSS treated route removal as navigation compression, and the persistent `<details>` element had no close-on-activation behavior.
- Fix: add a semantic public mobile disclosure with routes/locale/theme/sign-in and close any parent navigation disclosure from the shared app-shell link after activation.
- Regression test (or reason automation is impossible): focused shared UI tests pass; final Chromium mobile Legal and History checks pass with exact destination, closed panel, uncovered heading, no overflow, zero runtime/network failures and Axe 0.

## BUG-099 — local runtime defaults pointed at the wrong application and lacked reproducible users

- Bug ID: BUG-099
- Severity: P1
- Feature and workflow: local startup, authentication and all role workflows
- Environment and revision: developer workstation on 2026-07-20
- Reproduction steps: start the repository without a generated `.env.local` and browse port 3000.
- Expected: one documented command path targets DiTeLe, recreates deterministic local identities and never leaks privileged keys.
- Actual: port 3000 hosted an unrelated application, `.env.local` was absent and no reproducible handoff-password overlay existed.
- Screenshot/log/correlation evidence: process/port inspection, clean reset logs and four-account browser authentication run.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: generic framework defaults were never reconciled with the occupied workstation port or a local-only account contract.
- Fix: standardize on `127.0.0.1:3100`, generate a mode-0600 env file without printing secrets, disable generic linked seeding, explicitly reset four local seed files and overlay the requested password only for four exact identities.
- Regression test (or reason automation is impossible): two-run env key preservation/mode check, 7/7 local Auth gateway tests, clean 43-migration/four-seed reset, pgTAP `099` 6/6 and four real UI logins pass.

## Release 0 corrective-wave resolution evidence — 2026-07-20

The original “Actual” and “Root cause” fields above preserve the defect as discovered. Current status is governed by the updated status field and this evidence:

| Bugs | Corrective evidence |
|---|---|
| BUG-068..077 | migration `100050`; pgTAP `022` 81/81; exact trainer pin/solution scope, content graph locks, revision question continuity, prerequisite fail-closed and mastery provenance/concurrency coverage |
| BUG-078, BUG-080..090, BUG-092 | migrations `100100` and `100110`; pgTAP `023` 53 assertions and `024` 9/9; real action/component recovery tests; learner→trainer→revision→resubmit Chromium workflow |
| BUG-083 specifically | ambiguous transport loss replays the byte-equivalent command; a double-lost response retains the exact pending payload/key and bypasses unsafe terminal draft resave |
| BUG-086 | immutable evidence core/linkage is implemented; controlled retention/redaction lifecycle commands remain in review, so the broader record is not marked done |
| BUG-091 | valid organization-scoped principals no longer require a cohort; principal/protected-route tests and four-role browser authentication pass |
| BUG-093 | migration `100140`; pgTAP `027` 20/20; actor/key/organization/course/note/result receipt binding with mismatch conflict and exact replay |

## BUG-100 — local Auth gateway retained a stale upstream after database reset

- Bug ID: BUG-100
- Severity: P1
- Feature and workflow: local startup, authentication and every protected workflow
- Environment and revision: local Supabase Docker reset on 2026-07-20
- Reproduction steps: reset the local stack, then attempt a password login while Kong still targets the prior Auth container address.
- Expected: reset leaves `/auth/v1/health` reachable and seeded role logins working.
- Actual: Kong returned 502 until its exact project container was restarted.
- Screenshot/log/correlation evidence: bounded gateway helper execution and final health/login gates.
- Owner: `/root/attempt_abandoned_state`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: container address replacement was not reflected in the retained local Kong upstream.
- Fix: `scripts/ensure-local-auth-gateway.mjs` resolves config relative to itself, validates the exact `supabase_kong_<project>` label, performs bounded health/inspect/restart checks and redacts failures; `db:reset` invokes it.
- Regression test (or reason automation is impossible): `node --test scripts/ensure-local-auth-gateway.test.mjs` passes 7/7, including wrong-project and outside-CWD cases; repeated clean resets report Auth healthy.

## BUG-101 — hint-use retry targeted the surrogate primary key

- Bug ID: BUG-101
- Severity: P1
- Feature and workflow: learner draft/hint persistence; WF-02
- Environment and revision: migration `100100` integration on 2026-07-20
- Reproduction steps: save/retry a draft containing a previously recorded hint.
- Expected: `(attempt_id, hint_id)` converges without a duplicate-key or conflict-target error.
- Actual: the command targeted `attempt_hint_usage_pkey`, which is a surrogate ID rather than the idempotency constraint.
- Screenshot/log/correlation evidence: corrective migration `20260717100110_attempt_hint_usage_conflict_fix.sql`.
- Owner: `/root/hint_retry_corrective_migration`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: the upsert conflict target did not match the domain uniqueness rule.
- Fix: forward-replace the function with the exact attempt/hint conflict target; do not rewrite `100100`.
- Regression test (or reason automation is impossible): pgTAP `024` passes 9/9 and the full database suite passes 30 files / 1,129 assertions.

## BUG-102 — question threads lacked safely scoped participant attribution

- Bug ID: BUG-102
- Severity: P2
- Feature and workflow: learner/trainer question history; WF-03
- Environment and revision: actor-derived question adapter on 2026-07-20
- Reproduction steps: open a thread containing learner, assigned trainer and transfer/history messages.
- Expected: authorized participants have stable display names without broad profile access.
- Actual: direct profile reads were either denied or would have widened identity enumeration.
- Screenshot/log/correlation evidence: migration `100120` and learner/trainer question screenshots.
- Owner: `/root/question_participant_contexts`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: question authorization and profile projection were not one scoped read contract.
- Fix: add `list_my_question_participant_contexts()` with actor-derived question access and display-name-only output; runtime-validate and fail closed in the application adapter.
- Regression test (or reason automation is impossible): pgTAP `025` passes 13/13, focused question tests pass 8/8 and WF-03 Chromium E2E passes.

## BUG-103 — trainer submission evidence used an ambiguous relationship

- Bug ID: BUG-103
- Severity: P1
- Feature and workflow: trainer review detail; WF-04
- Environment and revision: PostgREST against the current local schema on 2026-07-20
- Reproduction steps: open a submission with immutable evidence linkage.
- Expected: the exact submission-version evidence rows render through one named foreign key.
- Actual: PostgREST could not choose the relationship and the review page failed.
- Screenshot/log/correlation evidence: corrected trainer data selector and `artifacts/screenshots/trainer/review-desktop.png`.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: an unqualified nested selector crossed multiple valid relationships.
- Fix: select the explicit named relationship and preserve runtime tuple validation.
- Regression test (or reason automation is impossible): focused data tests, full Vitest/build and Chromium review/revision workflow pass.

## BUG-104 — canonical withdrawn work was not represented honestly

- Bug ID: BUG-104
- Severity: P2
- Feature and workflow: trainer submission presentation and archive
- Environment and revision: canonical-state reconciliation on 2026-07-20
- Reproduction steps: hydrate a canonical `withdrawn` submission or a supported evidence source kind.
- Expected: every generated database state/source has a named presentation, and unknown values fail closed.
- Actual: the trainer mapper collapsed unsupported values and evidence kinds into misleading labels.
- Screenshot/log/correlation evidence: exhaustive state/evidence mapper tests.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: UI unions drifted from generated database enums.
- Fix: add explicit withdrawn/evidence mappings and exhaustive unknown-state rejection.
- Regression test (or reason automation is impossible): focused mapper and connected review tests pass; a dedicated seeded withdrawn browser artifact remains pending.

## BUG-105 — malformed external evidence URLs crossed trust boundaries

- Bug ID: BUG-105
- Severity: P1
- Feature and workflow: learner evidence and trainer review; WF-02/WF-04
- Environment and revision: SQL/application/render security audit on 2026-07-20
- Reproduction steps: submit credential-bearing, hostless, whitespace, query-only, triple-slash or otherwise malformed HTTPS-like input.
- Expected: only an exact credential-free HTTPS URL with a valid authority is accepted and rendered as a link.
- Actual: URL normalization and the former SQL predicate could accept or transform unsafe input.
- Screenshot/log/correlation evidence: migration `100130` and focused producer/consumer tests.
- Owner: `/root/external_evidence_uri_hardening`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: scheme-only validation did not prove the original authority or credentials boundary.
- Fix: validate the raw value at the application boundary, enforce the exact authority in SQL, and fail closed in learner/trainer render projections.
- Regression test (or reason automation is impossible): pgTAP `026` passes 16/16; focused application tests pass 21/21; Chromium WF-02 renders the accepted URL.

## BUG-106 — enrollment states drifted from the canonical database enum

- Bug ID: BUG-106
- Severity: P2
- Feature and workflow: learner/admin enrollment; WF-01
- Environment and revision: TypeScript/API/schema contract audit on 2026-07-20
- Reproduction steps: pass `pending`, `waitlisted` or `declined`, or hydrate canonical terminal states.
- Expected: UI and API accept exactly `requested`, `approved`, `rejected`, `assigned`, `cancelled`, `completed`; unknown legacy values fail closed.
- Actual: feature contracts used noncanonical synonyms and omitted canonical states.
- Screenshot/log/correlation evidence: synchronized shared/feature contract tests.
- Owner: `/root/route_runtime_audit`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: a frontend vocabulary evolved independently from the generated enum.
- Fix: derive both contract layers from the canonical union and reject legacy/unknown values.
- Regression test (or reason automation is impossible): seven focused files pass 54/54 plus strict typecheck/lint.

## BUG-107 — Auth provider outages looked like invalid credentials

- Bug ID: BUG-107
- Severity: P2
- Feature and workflow: sign-in availability and error handling
- Environment and revision: Next server action with local Supabase fault injection on 2026-07-20
- Reproduction steps: make the Auth gateway unavailable and submit valid credentials.
- Expected: a localized non-enumerating service-unavailable message, distinct from invalid credentials and throttling.
- Actual: retryable fetch/5xx failures were shown as an invalid-login error.
- Screenshot/log/correlation evidence: auth action/copy/page tests in EN/DE/RU.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: provider transport and credential failures shared one redirect code.
- Fix: classify retryable transport/5xx/zero-status as `unavailable`, 429 as throttled and credential rejection as generic invalid.
- Regression test (or reason automation is impossible): focused authentication/rate-limit/page tests pass 28/28; full verification and healthy-provider browser login pass.

## BUG-108 — pure content-admin routing could expose unsuitable or blank surfaces

- Bug ID: BUG-108
- Severity: P1
- Feature and workflow: content administration navigation and forbidden/error handling; WF-05
- Environment and revision: role-route audit on 2026-07-20
- Reproduction steps: enter admin routes as a user with only the `content_admin` role.
- Expected: route to authorized content surfaces, show explicit forbidden states elsewhere and never render an empty page.
- Actual: shared admin navigation/redirect assumptions could send the role into operations it could not load.
- Screenshot/log/correlation evidence: route/role navigation and forbidden component tests.
- Owner: `/root`
- Status: 🟣 IN REVIEW
- Root cause: platform-admin and content-admin perspectives were conflated.
- Fix: split route destinations/navigation by server-derived role and make unauthorized content explicit.
- Regression test (or reason automation is impossible): focused route tests and full verify pass; a dedicated seeded `content_admin` Chromium account is still pending.

## BUG-109 — stale trainer question claims did not rehydrate a clear conflict

- Bug ID: BUG-109
- Severity: P2
- Feature and workflow: concurrent trainer question claim; WF-03
- Environment and revision: server action/browser concurrency flow on 2026-07-20
- Reproduction steps: claim the same question with a stale expected version after another trainer/process wins.
- Expected: redirect to current authoritative data with a clear stale/conflict notice.
- Actual: the stale path could surface a generic failure or lose the useful current state.
- Screenshot/log/correlation evidence: `notice=stale` action path and `trainer/question-claimed-desktop.png`.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: expected CAS conflict was handled as an exceptional route failure.
- Fix: map the stable conflict to a localized notice and re-render current data.
- Regression test (or reason automation is impossible): action/component tests and WF-03 Chromium stale-claim scenario pass.

## BUG-110 — enrollment receipt composite foreign key lacked a complete index

- Bug ID: BUG-110
- Severity: P2
- Feature and workflow: enrollment request receipt integrity/performance; WF-01
- Environment and revision: full database suite at migration `100140` on 2026-07-20
- Reproduction steps: run the complete FK/index contract audit.
- Expected: the result-context foreign key has an index beginning with all FK columns in order.
- Actual: narrower lookup indexes did not cover the complete composite tuple.
- Screenshot/log/correlation evidence: migration `100150` and pgTAP `028`.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: command-query indexes were added, but the FK coverage rule was missed.
- Fix: add `enrollment_request_receipts_result_context_idx` over enrollment, organization, actor and course.
- Regression test (or reason automation is impossible): pgTAP `028` passes 3/3; strict lint and full database suite pass.

## BUG-111 — E2E session churn and expected Next transport cancellations caused false failures

- Bug ID: BUG-111
- Severity: P2
- Feature and workflow: Chromium regression infrastructure
- Environment and revision: full local Playwright run on 2026-07-20
- Reproduction steps: repeatedly password-login the same role across specs, observe the same-origin Next development font request cancelled during a server redirect, or run production mutations where Chromium cancels a superseded RSC/server-action stream after Next has already returned a completed response.
- Expected: the suite respects the real throttle and fails only on meaningful network errors.
- Actual: per-test password churn correctly exhausted the 5-per-window limit; harmless `net::ERR_ABORTED` cancellations for a development font, same-origin RSC prefetches and completed production server actions were treated as application failures.
- Screenshot/log/correlation evidence: a 5/32 diagnostic run, two 31/32 diagnostic runs and the final clean production 32/32 run.
- Owner: `/root`
- Status: ✅ VERIFIED DONE
- Root cause: storage state was not reused within the unique run and the strict observer did not distinguish a failed request from Chromium cancelling a superseded Next transport after an authoritative response arrived.
- Fix: trust per-run cached storage only within a unique `DITELE_E2E_RUN_ID`, retain live validation across runs, and ignore only same-origin `__nextjs_font` cancellations, exact RSC GET fetches, or Next-action POSTs whose matching response was first proven complete by the narrow 303 redirect or 200 revalidation signature. Cross-origin, malformed, pre-response, non-fetch and other network failures remain strict.
- Regression test (or reason automation is impossible): observer boundary tests pass 7/7 and the freshly built production Chromium suite passes 32/32 in 1.4 minutes with real rate limiting enabled.

## BUG-112 — successful trainer claim could commit without refreshing the visible question owner

- Bug ID: BUG-112
- Severity: P1
- Feature and workflow: trainer question claim; WF-03
- Environment and revision: optimized Next production server on 2026-07-20
- Reproduction steps: open an unclaimed question, click Claim, and let the action redirect back to the identical detail URL.
- Expected: the URL/navigation completes only after authoritative server data renders the assigned state, owner and answer controls.
- Actual: the RPC committed (`assigned`, Theo Trainer, row version 2), but the page could remain on the stale Open/Not assigned/Claim rendering because the identical-URL wait was already satisfied.
- Screenshot/log/correlation evidence: the isolated 31/32 production run and subsequent `trainer/question-claimed-desktop.png`.
- Owner: `/root/question_claim_refresh`, `/root`
- Status: ✅ VERIFIED DONE
- Root cause: successful claim redirected to the already-current URL, creating an observable production revalidation race and an ineffective E2E navigation condition.
- Fix: successful claims redirect to exact `?notice=claimed`; the page renders a localized polite success only after fresh data proves `assigned` state and current-trainer ownership. Stale claims retain `?notice=stale`, and a forged success query fails closed.
- Regression test (or reason automation is impossible): four focused files / 19 tests pass, including forged-query and client-copy serialization cases; full WF-03 production Chromium passes inside the 32/32 suite.

## Template

- Bug ID:
- Severity: P0 / P1 / P2 / P3
- Feature and workflow:
- Environment and revision:
- Reproduction steps:
- Expected:
- Actual:
- Screenshot/log/correlation evidence:
- Owner:
- Status: 🔴 BUG FOUND / 🔁 REWORK / 🟣 IN REVIEW / ✅ VERIFIED DONE
- Root cause:
- Fix:
- Regression test (or reason automation is impossible):
