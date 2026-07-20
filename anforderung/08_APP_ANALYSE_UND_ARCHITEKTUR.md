# 08 — DiTeLe Application Analysis & Complete Architecture

> **Repository analyzed:** `Wamocon_academy_Ditele`  
> **Analysis date:** July 17, 2026  
> **Scope:** Next.js frontend, its observable contracts, roles, workflows, dependencies, deployment, risks, and a replacement target architecture  
> **Evidence boundary:** The referenced Laravel repository (`wamocon_academy_api`) and MariaDB schema were not present in the requested repository. Backend entities and authorization rules are therefore reconstructed from frontend types and API calls and are explicitly marked as inferred.

---

## 1. Executive Assessment

DiTeLe is a multilingual, trainer-supervised practice platform for software-testing education. It is not merely a course catalog and not a complete LMS. Its distinctive workflow combines scheduled practical tasks, a real or simulated test target, written and multiple-choice submissions, optional hints, trainer review, learner questions, trainer-to-trainer transfer, groups, certificates, and course administration.

The current frontend is functional but architecturally fragile. It is a Next.js 14 client-heavy application coupled directly to a separate Laravel REST API. Authentication and role navigation depend heavily on browser cookies and `localStorage`; route protection is performed in client layouts; task activation is date-driven; the browser calls the Groq API directly with a public environment variable; there are no automated tests under `src`; and API contracts are duplicated across global declaration files and components.

### Overall Rating

| Dimension | Current Rating | Reason |
|-----------|----------------|--------|
| Product differentiation | 🟢 Strong | Practical testing, human review, questions, and a test environment form a valuable combination |
| Functional coverage | 🟡 Moderate | Core student/trainer/admin flows exist, but adaptive learning, skills, analytics, and integrations are limited |
| Architecture | 🟠 High risk | Client-heavy structure, hard-coded API origin, implicit contracts, duplicated types |
| Security | 🔴 Critical improvement required | Browser-readable authentication state, client-only role guards, exposed AI credential pattern |
| Maintainability | 🔴 Weak | 183 TS/TSX files, 97 client modules, no source tests, numerous suppressions/log statements |
| Scalability | 🟠 Limited | Synchronous REST coupling and manual trainer review will become bottlenecks |
| Interoperability | 🔴 Weak | No observable SSO, LTI, SCORM/cmi5/xAPI, webhook, or Eloomi adapter in this repository |
| Internationalization | 🟡 Present but fragmented | EN/DE/RU content exists, but two localization mechanisms are used in parallel |
| Deployment maturity | 🟡 Basic | Docker, Nginx, Certbot, PM2 configuration, and CI references exist; environment handling is inconsistent |

### Recommendation

Do not perform a blind rewrite. Preserve the proven domain workflow and migrate it into a modular platform using a strangler pattern: secure identity first, establish stable domain APIs and event contracts, migrate learning/task workflows, then introduce skills, automation, analytics, sandbox orchestration, and optional LMS integration.

---

## 2. What the Application Actually Does

### 2.1 Core Product Meaning

DiTeLe turns software-testing theory into supervised practical evidence:

1. An administrator creates multilingual courses, stages, tasks, groups, users, and certificates.
2. A learner requests or receives course enrollment and joins a group.
3. A trainer starts the group/course and can adjust task activation dates.
4. The learner receives tasks according to the current date and group schedule.
5. A task can include instructions, pre/post videos, an answer field, multiple-choice checks, hints, bug categories, and a link to a practical test target.
6. The learner submits an answer, test selections, hint usage, and measured solving duration.
7. A trainer reviews the submission, comments, accepts or rejects it, or transfers it to another trainer.
8. The learner can ask task-specific questions; a trainer answers or transfers the question.
9. Progress, course ratings, task ratings, certificates, and history are recorded.

The business value is the **evidence loop**:

```text
Learn → Test a realistic system → Submit evidence → Receive expert review
     → Correct mistakes → Demonstrate competency → Earn a certificate
```

### 2.2 Bounded Product Domains

| Domain | Current Responsibility |
|--------|------------------------|
| Identity | Registration, login, logout, password recovery, browser token storage |
| Catalog | Guest and authenticated course listing, public course landing pages |
| Enrollment | Course requests/registration, group assignment, active/completed courses |
| Course authoring | Multilingual course, stage, video, task, test-answer, and media management |
| Cohort management | Groups, students, trainers, course assignment, activation state |
| Learning delivery | Scheduled tasks, videos, hints, test answers, practical-answer submission |
| Review | Trainer queues, status changes, comments, answer transfer, archives/history |
| Mentoring/Q&A | Learner questions, trainer answers, transfer, question archive |
| Certification | Certificate listing, generation/upload, editing, and download |
| Feedback | Course rating, task rating, bug/error reports |
| Notifications | In-app notification list and read status |
| AI assistant | Course recommendation using course/task context and Groq |
| Localization | English, German, and Russian UI/content selection |

---

## 3. Repository and Technology Inventory

### 3.1 Stack

| Layer | Observed Technology | Notes |
|-------|---------------------|-------|
| Web framework | Next.js 14.2, React 18, TypeScript 5 | App Router; most feature pages are client-rendered |
| Styling | Tailwind CSS, CSS modules, Radix UI, shadcn-style components | Strong reusable UI base, but feature components are large |
| Forms | React Hook Form | Used for login, course/task editing, submissions |
| Server state | TanStack React Query | Provider exists; much code still calls Axios manually in effects |
| HTTP | Axios + one server-side `fetch` action | Separate authenticated and unauthenticated Axios instances |
| Authentication storage | `js-cookie` + `localStorage` | Two overlapping token/auth representations |
| Localization | i18next + a custom `LangStorage` | Duplicate translation loading and browser persistence |
| AI | `groq-sdk`, Llama 3.1 8B Instant | Called directly from the browser |
| Media | Next Image, React Player, uploaded media links | API storage domain allowed in Next config |
| Export | XLSX and JSON export packages | Student/report administration |
| Deployment | Docker, Nginx, Certbot, optional PM2 | Frontend container expects an external Docker network |
| Backend dependency | Laravel REST API (external repository) | Inferred from README and API conventions |
| Database dependency | MariaDB (external) | Mentioned in README; schema not available here |

### 3.2 Static Repository Facts

| Metric | Value |
|--------|------:|
| TypeScript/TSX files under `src` | 183 |
| TSX components/pages | 162 |
| Modules marked `use client` | 97 |
| App Router pages | 47 |
| Automated test files under `src` | 0 |
| `@ts-ignore` occurrences | 9 |
| Console calls | 58 |
| Supported languages | 3 (EN, DE, RU) |
| Persisted roles | 3 (student, trainer, admin) |
| Additional anonymous state | guest |

### 3.3 Repository-Level Dependencies

```text
Browser
  ├── Next.js frontend (this repository)
  │   ├── REST/JSON + multipart uploads → Laravel API
  │   ├── media/images ← API storage host
  │   ├── AI requests → Groq API
  │   ├── navigation/auth state → cookies + localStorage
  │   └── translations → bundled JSON files
  ├── Telegram group link
  └── public test/course target links

Deployment
  ├── Docker image (Node 18)
  ├── external Docker network (`app-network`)
  ├── Nginx TLS/reverse proxy
  └── Certbot certificate renewal

External system referenced but not inspected
  ├── Laravel API
  └── MariaDB
```

---

## 4. Current Logical Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│ USERS: Guest | Student | Trainer | Admin                            │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼───────────────────────────────────────┐
│ NEXT.JS 14 FRONTEND                                                   │
│                                                                       │
│ App Router pages                                                      │
│  ├── public/catalog/profile                                          │
│  ├── student course/task/question/history                            │
│  ├── trainer group/question/answer/review                            │
│  └── admin course/task/group/user/report/certificate                 │
│                                                                       │
│ Shared client services                                                │
│  ├── AuthStorage / LangStorage / ThemeStorage                        │
│  ├── Axios no-auth / auth instances                                  │
│  ├── React Query provider                                             │
│  ├── i18next                                                          │
│  └── Groq client                                                      │
└───────────────┬───────────────────────────────┬───────────────────────┘
                │ REST + bearer cookie          │ Browser-side AI call
                ▼                               ▼
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ LARAVEL API (not inspected)  │     │ GROQ API                     │
│ Auth, business rules, files  │     │ Course recommendation       │
└───────────────┬──────────────┘     └──────────────────────────────┘
                │ ORM/SQL
                ▼
┌──────────────────────────────┐
│ MARIADB (not inspected)      │
│ Users, courses, groups,      │
│ tasks, submissions, Q&A,     │
│ certificates, ratings        │
└──────────────────────────────┘
```

### Connection Management

| Connection | Current Mechanism | Current Failure Behavior | Required Future Mechanism |
|------------|-------------------|--------------------------|---------------------------|
| Browser → API | Axios base URL hard-coded to production; JSON/multipart | Toast; 401/403 clears browser auth and redirects | Same-origin BFF/API gateway, typed client, retries only for safe calls, correlation IDs |
| SSR → API | Server action reads cookies and calls profile endpoint | Limited error handling | Server-only session validation and cached user context |
| Browser → Groq | Public environment key and `dangerouslyAllowBrowser` | Generic chat error | Server-side AI gateway, secret vault, quotas, redaction, audit, guardrails |
| Frontend → media | Remote API storage domain | Browser/image failure | Signed URLs or CDN with lifecycle policies |
| Nginx → Next.js | Docker network and reverse proxy | Container/restart behavior | Health checks, readiness, observability, rolling deployment |
| Eloomi → DiTeLe | Not observed in code | Not implemented here | Dedicated adapter, OAuth/OIDC or LTI 1.3, webhooks, idempotent sync |

---

## 5. Roles, Permissions, and Responsibilities

### 5.1 Role Count

The application contains **three authenticated roles** and **one anonymous state**:

1. `student`
2. `trainer`
3. `admin`
4. `guest` (derived when no role exists)

The admin UI can switch its *view* to admin, trainer, or student through `localStorage`. This is a presentation mode, not a separate authorization role.

### 5.2 Role Responsibility Matrix

| Capability | Guest | Student | Trainer | Admin |
|------------|:-----:|:-------:|:-------:|:-----:|
| View public courses | ✅ | ✅ | Limited by navigation | ✅ via student view |
| Register/login/password reset | ✅ | — | — | — |
| Request/register for a course | ❌/register first | ✅ | ❌ | Can manage requests |
| View active/completed courses | ❌ | ✅ | Group-centric view | ✅ via student view |
| Open scheduled tasks | ❌ | ✅ | Preview/review | ✅ preview |
| Use hint and submit solution | ❌ | ✅ | ❌ | Student view only |
| Ask a task question | ❌ | ✅ | ❌ | Student view only |
| Rate tasks/courses | ❌ | ✅ | ❌ | Student view only |
| Review learner submissions | ❌ | ❌ | ✅ | ✅ via trainer view |
| Accept/reject with comment | ❌ | ❌ | ✅ | ✅ via trainer view |
| Transfer a submission | ❌ | ❌ | ✅ | ✅ via trainer view |
| Answer/transfer questions | ❌ | ❌ | ✅ | ✅ via trainer view |
| Start/stop assigned groups | ❌ | ❌ | ✅ | ✅ |
| Adjust task activation dates | ❌ | ❌ | ✅ for assigned group | ✅ |
| View group/student progress | ❌ | Own only | Assigned groups | All |
| Create/edit/delete courses | ❌ | ❌ | ❌ | ✅ |
| Create/edit/delete tasks/tests | ❌ | ❌ | ❌ | ✅ |
| Manage stage videos/media | ❌ | ❌ | ❌ | ✅ |
| Create/edit/delete groups | ❌ | ❌ | ❌ | ✅ |
| Assign/remove trainers/students | ❌ | ❌ | ❌ | ✅ |
| Create/edit trainer accounts | ❌ | ❌ | ❌ | ✅ |
| Manage course applications | ❌ | Own request | ❌ | ✅ |
| Manage certificates | Download own | Download own | View in group | ✅ create/edit/download |
| Process issue reports | Submit authenticated report | Submit | Submit | ✅ review/close |

### 5.3 Authorization Weakness

Frontend layouts redirect users based on the role stored in browser-accessible state. This is navigation control, not security. Every backend endpoint must independently authorize the authenticated principal and resource scope. The target system must use server-validated sessions and policy checks such as:

```text
canReviewSubmission(user, submission)
  = user.role in {trainer, admin}
  AND (admin OR trainer is assigned to submission.group)

canViewLearner(user, learner)
  = user.id = learner.id
  OR admin
  OR trainer shares an active group with learner
```


---

## 6. Current Workflows and State Machines

### 6.1 Enrollment and Cohort Workflow

```text
Guest views catalog
  → creates account
  → requests/registers for course
  → admin accepts request and assigns group
  → trainer/group becomes active
  → learner sees course under active courses
  → tasks become available according to activation date
```

Group state inferred from UI:

```text
waiting (is_active = null) → active (1) → inactive/completed (0)
```

### 6.2 Task Workflow

```text
Admin authors task
  → multilingual content + stage + category + test answers + media
  → task assigned to course/group schedule
  → trainer may adjust activation date
  → student opens available task
  → optional pre-task video
  → student tests target, uses optional hint, enters evidence/test answers
  → submission records duration and hint usage
  → trainer review queue
  → correct OR incorrect with trainer comment
  → optional after-task video/evaluation
  → progress/certificate eligibility updated
```

Submission state inferred from UI:

| Value | Meaning |
|------:|---------|
| `0` | Submitted / under review |
| `1` | Accepted / correct |
| `2` | Rejected / incorrect; revision required |

The target model should replace numeric magic values with named states and an audited transition table:

```text
DRAFT → SUBMITTED → IN_REVIEW → ACCEPTED
                         └────→ CHANGES_REQUESTED → RESUBMITTED
                         └────→ TRANSFERRED → IN_REVIEW
```

### 6.3 Question Workflow

```text
Student asks question on a task
  → assigned trainer queue
  → trainer answers OR transfers to another trainer
  → learner sees answer
  → question moves to archive
```

### 6.4 Certificate Workflow

```text
Course/group requirements satisfied
  → certificate record created or uploaded
  → certificate type/code/link associated with learner and group
  → learner downloads certificate
```

Exact certificate eligibility and generation rules must be confirmed in the backend.

---

## 7. Observable API Surface

The frontend reveals the following API capability groups. These are contracts observed in calls, not a complete backend specification.

| Capability | Representative Endpoints |
|------------|--------------------------|
| Identity | `/register/global`, `/register/user`, `/login`, `/logout`, `/password`, `/user/global/profile`, `/user/global/edit` |
| Catalog/Courses | `/guest/courses/list`, `/guest/courses/show`, `/courses/list`, `/courses/show`, `/courses/register`, `/courses/requests`, `/courses/add`, `/courses/edit` |
| Groups | `/groups`, `/groups/show`, `/groups/create`, `/groups/edit`, `/groups/delete`, `/groups/changestatus`, `/groups/student/add`, `/groups/student/remove`, `/groups/trainer/add`, `/groups/trainer/remove`, `/group/duplicate` |
| Tasks | `/tasks`, `/task/show`, `/task/create`, `/task/edit`, `/task/delete`, `/task/change_active_date`, `/bugs/categories` |
| Submissions | `/task/solved/send`, `/task/show/trainer`, `/solving/change/status`, `/solving/transfer` |
| Questions | `/question`, `/question/add`, `/question/answer`, `/question/transfer`, `/question/archive/trainer` |
| Certificates | `/certificate/list`, `/certificate/add`, `/certificate/download` |
| Feedback/Reports | `/task/rate`, `/course/rate`, `/errorReport`, `/issues/reports/list`, `/issues/reports/change/status` |
| Notifications | `/notifications`, `/notifications/{id}/read` |
| Export | `/export/students` |

### Contract Problems

- Endpoint naming mixes singular/plural resources and action verbs.
- Several writes use `POST` for edits or state changes instead of consistent `PATCH` semantics.
- Status envelopes (`status`, `message`) are weakly typed and overloaded.
- Query parameters carry resource IDs inconsistently.
- Types are duplicated and occasionally contradictory (`string` vs `number`, typographical errors, global declarations).
- No generated OpenAPI client is used.
- No observable idempotency keys, version headers, ETags, or correlation IDs exist.

---

## 8. Reconstructed Data Model

### 8.1 Confirmed or Strongly Inferred Entities

```text
User
  id, name, email, phone, telegramTag, role, status, language

Course
  id, version, status, localized name/description, duration, image,
  landing link, stage videos, completion videos, rating

Stage
  id, course_id, sequence number, localized start/end videos

Task
  id, course_id, stage_id, localized name/description/answer/hint,
  category, bug definition, practical target, localized videos,
  activation date, active flag

TaskTestQuestion → TaskTestAnswer
  localized question/answers, correct-answer flag

Group/Cohort
  id, localized name, course/version, state, start-day counter

GroupStudent
  group_id, student_id, status, exam flag, progress counters

GroupTrainer
  group_id, trainer_id, status

Submission/Solving
  task_id, group_id, student_id, written answer, selected test answers,
  hint used, duration, status, trainer comment, timestamps

Question
  task_id, group_id, student_id, trainer_id, text, answer, transfer history

Certificate
  learner/group/course, type, code, link, attempt count

Rating
  learner, course/task, score

IssueReport
  user context, task, URL, message, workflow status

Notification
  user, event/content, read state, timestamps
```

### 8.2 Missing Domain Concepts Needed for the Target Product

- Tenant/Organization and organization membership
- Permission, role assignment, and resource scope
- Skill/Competency, proficiency level, evidence, rubric, and mastery history
- Learning path, prerequisite graph, and recommendation
- Lab environment, scenario, bug seed, reset state, and validation result
- Content version, localization version, review, approval, publication, retirement
- Enrollment state independent of groups
- Assessment attempt, item bank, randomization, integrity metadata
- Event/outbox, webhook delivery, and synchronization checkpoint
- Subscription, entitlement, product package, invoice/customer reference
- Audit log, consent, retention rule, deletion/export request
- AI conversation, prompt version, safety decision, cost, and feedback

---

## 9. Security, Privacy, and Compliance Findings

### Critical

1. **AI credential exposure:** A `NEXT_PUBLIC_*` API key is used by the browser with `dangerouslyAllowBrowser`. Public variables are included in the client bundle. Move all AI requests behind a server endpoint immediately and rotate the exposed credential.
2. **Client-side authorization:** Admin/trainer layouts trust a role stored in browser-accessible data. Treat these guards as UX only and verify every permission in the API.
3. **Browser-readable bearer state:** Authentication data is stored in cookies/localStorage and inserted into authorization headers by JavaScript. Prefer `Secure`, `HttpOnly`, `SameSite` session cookies with server-side validation and CSRF protection.
4. **Potential sensitive-data disclosure to AI:** Course names, descriptions, and task details are sent to Groq. Introduce data classification, minimization, consent/contract review, and a server-side redaction policy.
5. **Credentials in documentation:** The repository documentation contains literal local database credential examples. Remove real values, rotate any reused credentials, and replace them with placeholders and `.env.example` keys.

### High

- API origin is hard-coded to production instead of environment-controlled configuration.
- Authentication is represented in two cookie formats plus localStorage, increasing inconsistency and logout/session bugs.
- No Content Security Policy, explicit security headers, or observable CSRF design is configured in Next.js.
- Admin preview/task drafts use localStorage, which permits tampering and can expose unpublished content on shared devices.
- AI calls have no observable rate limit, abuse control, per-user quota, or audit trail.
- Debug logging is enabled in i18n and numerous console calls remain.

### Required Controls

- OIDC/OAuth 2.1 identity provider, MFA for privileged users, short sessions, rotation/revocation
- Server-side RBAC/ABAC and tenant isolation tests
- CSP, HSTS, secure headers, CSRF controls, input validation, output encoding
- Secret manager, dependency scanning, SAST/DAST, SBOM, container scanning
- Immutable audit log for permissions, content publishing, assessments, and certificates
- GDPR records of processing, DPA review, DPIA for AI/profiling, consent and retention automation
- User export/erasure workflow with propagation to integrations and AI logs
- Backup restore tests and documented RPO/RTO

---

## 10. Maintainability and Performance Findings

### React/Next.js Findings

- 97 client modules indicate that the application does not benefit sufficiently from React Server Components.
- Many pages fetch data inside `useEffect`, creating client waterfalls, duplicate loading logic, and layout shifts.
- TanStack Query is configured but not consistently used for caching, deduplication, invalidation, or mutations.
- Large page/components mix data access, domain logic, translations, state machines, and rendering.
- Header and footer duplicate role/navigation behavior and read `localStorage` during rendering.
- Static API URLs and browser singleton storage objects complicate SSR and tests.
- Types are fragmented across global `.d.ts` files and local component placeholders.
- No automated unit, component, contract, or end-to-end tests were found under `src`.

### Priority Refactors Before Feature Expansion

1. Create a typed API client generated from OpenAPI.
2. Centralize authenticated user/session loading on the server.
3. Replace client route guards with server middleware/layout checks plus API policies.
4. Move initial page data fetching to server components and parallelize independent requests.
5. Use React Query only for interactive client state that needs refetching/mutation.
6. Split feature code by domain (`identity`, `catalog`, `learning`, `review`, `admin`).
7. Consolidate localization into one mechanism and validate translation keys in CI.
8. Establish tests around the task/submission/question state machines before changing them.

---

## 11. Target Architecture That Can Replace the Current System

### 11.1 Architectural Style

Use a **modular monolith first**, not premature microservices. Modules have explicit ownership, APIs, events, and database schemas. Extract only workloads with independent scaling or isolation needs (sandbox execution, notifications, analytics, AI gateway).

```text
┌─────────────────────────────────────────────────────────────────────┐
│ CHANNELS                                                           │
│ Web/PWA | Admin Studio | Public Catalog | Eloomi/LMS | Partner API │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ EDGE + BFF                                                         │
│ CDN/WAF | Next.js | OIDC session | locale | rate limits | consent │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ typed REST/GraphQL
┌──────────────────────────────▼──────────────────────────────────────┐
│ DiTeLe CORE — MODULAR MONOLITH                                     │
│ Identity & Tenant | Catalog & Content | Enrollment & Cohort        │
│ Learning Paths | Tasks & Assessments | Review & Mentoring          │
│ Skills & Evidence | Certificates | Gamification | Commerce         │
│ Integration Hub | Audit & Compliance                               │
└───────────┬───────────────────────┬───────────────────────┬─────────┘
            │ domain events         │ jobs                  │ queries
┌───────────▼──────────┐ ┌──────────▼──────────┐ ┌─────────▼────────┐
│ Event/Job Layer      │ │ Specialized Services│ │ Data Platform    │
│ Outbox + queue       │ │ Sandbox orchestrator│ │ PostgreSQL       │
│ retries + DLQ        │ │ AI gateway           │ │ Redis            │
│ webhook delivery     │ │ Notification service │ │ Object storage   │
└───────────┬──────────┘ └─────────────────────┘ │ Search/LRS/BI     │
            │                                    └──────────────────┘
┌───────────▼─────────────────────────────────────────────────────────┐
│ ADAPTERS                                                           │
│ Eloomi | LTI 1.3 | xAPI/cmi5 | Email | Payments | Video | CRM/HRIS│
└─────────────────────────────────────────────────────────────────────┘
```

### 11.2 Target Module Responsibilities

| Module | Owns | Emits |
|--------|------|-------|
| Identity & Tenant | Users, organizations, memberships, roles, sessions | user.created, role.assigned |
| Catalog & Content | Courses, modules, localized content, versions, publishing | content.published |
| Enrollment & Cohort | Entitlements, enrollments, groups, schedules | learner.enrolled, cohort.started |
| Learning Path | Prerequisites, adaptive path, next-best action | path.updated |
| Task & Assessment | Tasks, attempts, item bank, automatic checks | attempt.submitted, assessment.passed |
| Review & Mentoring | Queues, rubrics, comments, transfers, SLA | review.completed, question.answered |
| Skills & Evidence | Competencies, mastery, portfolio evidence | skill.demonstrated |
| Sandbox | Ephemeral test target, seeded defects, reset, telemetry | lab.started, lab.validated |
| Certification | Eligibility, generation, verification | certificate.issued |
| Gamification | XP ledger, badges, streaks, missions | badge.awarded |
| Integration Hub | Mappings, sync, webhooks, LTI, Eloomi | sync.failed, sync.completed |
| Analytics | Event model, dashboards, experiments | alert.triggered |
| AI Gateway | Tutor/recommendation/review assistance with policy | ai.response.generated |

### 11.3 Target Data and Consistency Rules

- PostgreSQL as transactional source of truth; use schema-per-module or strict table ownership.
- Transactional outbox guarantees that business changes and events are committed together.
- Redis only for cache, rate limits, short jobs, and ephemeral state—not authoritative progress.
- Object storage for videos, evidence, and certificates; store metadata and checksums in the database.
- Search index and analytics warehouse are derived and rebuildable.
- Every integration message has `event_id`, `tenant_id`, `occurred_at`, schema version, idempotency key, and correlation ID.
- Use optimistic concurrency/version columns for content, reviews, and schedules.

### 11.4 Integration Architecture

```text
Internal domain event
  → transactional outbox
  → integration worker
  → canonical event transformation
  → Eloomi/LTI/webhook adapter
  → retry with exponential backoff
  → dead-letter queue after threshold
  → admin reconciliation screen
```

Each system has explicit ownership:

| Data | DiTeLe Owner | External Owner | Synchronization Rule |
|------|--------------|----------------|----------------------|
| Practical tasks/evidence/reviews | ✅ | — | Publish completion summary only |
| Skill mastery from practice | ✅ | Optional mirror | Versioned event |
| External theory content | — | Eloomi/LMS | Reference/launch rather than duplicate |
| User identity | IdP | IdP | OIDC subject is canonical |
| Enrollment | Configurable | Configurable | One owner per product configuration |
| Certificate | Configurable | Configurable | One issuer; other system stores reference |

---

## 12. Target Product Workflow

```text
1. DIAGNOSE
   Placement assessment + prior evidence + learning goal

2. PLAN
   Competency gap → personalized path → estimated effort → learner choice

3. LEARN
   Concise theory in DiTeLe or launched from Eloomi/LMS

4. PRACTICE
   Ephemeral real-world test environment with seeded defects and observability

5. PROVE
   Test charter, test cases, bug reports, evidence, automation artifacts

6. ASSESS
   Deterministic checks + rubric + risk-based human review

7. COACH
   Contextual AI hints and trainer feedback; no direct answer leakage

8. MASTER
   Competency evidence updates mastery; remediation is assigned if necessary

9. SHOWCASE
   Verified portfolio, shareable certificate, employer-readable skill profile

10. IMPROVE
    Analytics identify weak content, reviewer bottlenecks, and skill gaps
```

### Human Review Scaling

Human review is valuable but expensive. Use a tiered model:

| Tier | Mechanism | Examples |
|------|-----------|----------|
| 1 | Deterministic automatic validation | Required fields, target-state checks, selected answers |
| 2 | Rule/rubric assistance | Bug severity consistency, reproduction completeness, duplicate detection |
| 3 | AI-assisted suggestion | Draft feedback and rubric evidence, always visible to trainer |
| 4 | Human decision | Ambiguous quality, portfolio artifacts, final competency sign-off |

---

## 13. Replacement and Migration Plan

### Phase 0 — Discovery and Safety (Weeks 1–4)

- Obtain and analyze Laravel code, routes, policies, migrations, jobs, and MariaDB schema.
- Rotate exposed credentials and move AI behind a temporary server proxy.
- Record current API traffic and build an OpenAPI baseline.
- Establish product KPIs and capture current completion, review time, and dropout baselines.
- Create automated characterization tests for login, enrollment, task submission, review, Q&A, and certificates.

**Exit:** verified current-state model, security incidents contained, golden workflows testable.

### Phase 1 — Secure Platform Foundation (Weeks 5–10)

- OIDC identity, server sessions, RBAC/resource policies, tenant-ready data model.
- Next.js BFF, generated API client, environment configuration, observability.
- CI quality gates, unit/component/E2E/contract/security tests.
- Audit log, consent, retention, export/deletion foundation.

**Exit:** secure identity and delivery platform in production behind feature flags.

### Phase 2 — Domain Core (Weeks 11–20)

- Versioned content model, catalog, enrollment, cohorts, tasks, submissions, Q&A.
- Named state machines and audited transitions.
- Migrate current courses/groups/users/submissions without changing learner UX materially.
- Dual-read/dual-write only where necessary and time-boxed.

**Exit:** core current workflows run on the new domain model.

### Phase 3 — Competency and Sandbox Product (Weeks 21–30)

- Skill taxonomy aligned to ISTQB CTFL 4.0 and practical job skills.
- Placement assessment and flexible prerequisite graph.
- Isolated test environments, seeded defects, automatic evidence collection.
- Portfolio and rubric-based review.

**Exit:** flexible, competency-based standalone product is sellable.

### Phase 4 — Integration and Scale (Weeks 31–38)

- Eloomi adapter, OIDC/SSO, LTI 1.3 where supported, webhooks, reconciliation UI.
- Notification automation, review queues/SLA, analytics dashboards.
- Organization/tenant administration and B2B reporting.

**Exit:** standalone, combined, and B2B modes are operational.

### Phase 5 — Differentiation (Weeks 39–46)

- AI tutor with retrieval, guardrails, citations, and cost/quality monitoring.
- Gamification tied to demonstrated skills.
- Advanced labs for API, automation, security, performance, mobile, and AI testing.
- Experiments and recommendations driven by evidence.

**Exit:** measurable engagement and skill-outcome improvement over baseline.

---

## 14. Quality Strategy and Definition of Done

### Test Pyramid

| Layer | Scope |
|-------|-------|
| Unit | Domain rules, state transitions, scoring, permissions |
| Component | Forms, tables, task player, reviewer interface |
| Contract | OpenAPI compatibility between frontend, core, and adapters |
| Integration | Database, queue, object storage, sandbox, IdP |
| E2E | Guest, learner, trainer, admin, organization admin journeys |
| Security | Tenant isolation, authorization matrix, OWASP, dependency/container scanning |
| Performance | Catalog, course load, submission burst, reviewer queues, sandbox startup |
| Resilience | API/queue/provider failures, retry/idempotency, restore tests |

### Non-Functional Targets

| Metric | Target |
|--------|--------|
| Availability | 99.9% core learning; sandbox target separately defined |
| P75 LCP | < 2.5 seconds on supported mobile networks |
| API P95 | < 400 ms for normal reads; < 800 ms for writes excluding file processing |
| Accessibility | WCAG 2.2 AA |
| RPO/RTO | ≤ 15 minutes / ≤ 4 hours initially |
| Critical authorization coverage | 100% policy tests |
| Release rollback | < 15 minutes |
| Sandbox startup P95 | < 60 seconds |

---

## 15. Governance, Teams, and Ownership

### Recommended Product Team

| Responsibility | Minimum Ownership |
|----------------|-------------------|
| Product strategy | Product Manager + testing-education lead |
| Architecture/backend | Tech Lead + 2 backend engineers |
| Web experience | 2 frontend engineers |
| Sandbox/DevOps | Platform engineer |
| Quality | QA automation engineer embedded in team |
| Content/skills | Instructional designer + ISTQB/testing SME |
| UX/research | Product designer/researcher |
| Security/privacy | Part-time security and DPO/legal review |
| Data/analytics | Shared data engineer/analyst |

### Decision Records Required

- ADR-001 Identity and session model
- ADR-002 Modular-monolith boundaries
- ADR-003 API and event versioning
- ADR-004 Content/localization versioning
- ADR-005 Sandbox isolation model
- ADR-006 Eloomi/LTI ownership and synchronization
- ADR-007 AI provider, data policy, and evaluation
- ADR-008 Tenant isolation and data residency

---

## 16. Open Questions That Must Be Answered from the Backend

1. Which Laravel version, authentication package, policies, middleware, and token lifetime are used?
2. Are all frontend role assumptions enforced by server policies and group scope?
3. What is the exact MariaDB schema, cardinality, indexing, and deletion behavior?
4. How are `days_from_start` and `date_of_activate` calculated and updated?
5. What are the authoritative meanings and transitions for all numeric statuses?
6. How are certificate eligibility, attempts, generation, uniqueness, and verification implemented?
7. Which jobs, schedulers, queues, emails, backups, and monitoring systems exist?
8. Does Eloomi integration exist elsewhere, and which system owns users, enrollments, progress, and certificates?
9. Where is the practical test website, how are bugs seeded, and can environments be isolated per learner?
10. What production volumes exist: users, concurrent sessions, submissions/day, media size, and reviewer capacity?
11. What payment, contract, organization, and entitlement logic exists outside this repository?
12. What GDPR consent, retention, export, and erasure processes already exist?

---

## 17. Immediate 30-Day Action List

| Priority | Action | Outcome |
|----------|--------|---------|
| P0 | Remove browser-side Groq key, rotate it, deploy server AI proxy | Stops credential/data exposure |
| P0 | Audit backend authorization for every admin/trainer endpoint | Prevents privilege escalation |
| P0 | Remove/rotate credential examples committed in documentation | Reduces secret leakage risk |
| P1 | Obtain backend/schema and generate OpenAPI inventory | Establishes reliable contracts |
| P1 | Add E2E tests for the six golden workflows | Makes migration safe |
| P1 | Define canonical role/permission and status-state matrices | Eliminates ambiguous business rules |
| P1 | Baseline product and operational metrics | Makes improvement measurable |
| P2 | Consolidate authentication and localization mechanisms | Reduces client complexity |
| P2 | Move initial route data to server components/BFF | Improves speed and security |
| P2 | Define skill taxonomy and content mapping workshop | Starts product modernization |

---

## 18. Final Architecture Decision

The system should evolve into a **testing-skills evidence platform**, not attempt to outbuild general-purpose LMS vendors. DiTeLe should own practical exercises, sandbox environments, reviews, competencies, evidence, portfolios, and testing-specific analytics. Eloomi or another LMS may own broad theory delivery when desired. The integration boundary must be standardized, optional, observable, and reversible.

The current product’s most valuable asset is its supervised practical workflow. The replacement succeeds only if it preserves that loop while removing calendar rigidity, securing access, making competencies measurable, automating routine validation, and allowing standalone and integrated operation.
