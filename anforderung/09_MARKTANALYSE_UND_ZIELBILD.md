# 09 — Market Analysis, Product Target, and Competitive Replacement Plan

> **Status:** July 17, 2026  
> **Product:** DiTeLe — practical software-testing skills and evidence platform  
> **Purpose:** Define how DiTeLe can replace the current system and compete in the modern learning and software-testing market  
> **Evidence:** Current repository analysis, existing DiTeLe planning documents, and official platform/standards sources researched in July 2026

---

## 1. Executive Market Conclusion

DiTeLe should not position itself as another general LMS, video library, or ISTQB question bank. Those categories contain large, mature competitors. Its defensible market position is:

> **The practical proving ground for software-testing competency: realistic test environments, structured evidence, expert review, adaptive skill paths, and employer-readable proof.**

The modern market has moved beyond course completion. Leading platforms emphasize hands-on labs, safe sandboxes, real-time validation, skill assessment, AI guidance, workflow integrations, configurable automation, analytics, and measurable outcomes. Pluralsight markets more than 3,500 labs with real-time feedback; Codecademy embeds an AI assistant into contextual learning; TalentLMS combines automation, custom roles, reporting, API integration, and gamification; Docebo centers its offer on skills intelligence, personalization, automation, and business impact. [Pluralsight Labs](https://www.pluralsight.com/product/labs), [Codecademy for Business](https://www.codecademy.com/business), [TalentLMS Features](https://www.talentlms.com/features), [Docebo](https://www.docebo.com/)

DiTeLe already owns the seed of a stronger specialist product: supervised practical testing. The strategy is to convert that seed from a calendar-based course workflow into a scalable skills-evidence system.

---

## 2. Market Category and Competitive Arena

DiTeLe sits at the intersection of five categories:

```text
General LMS/LXP
      │
      ├───────────────┐
      │               │
Certification prep   Technical skills platforms
      │               │
      └──────┬────────┘
             │
      Software-testing education
             │
             ▼
   DiTeLe: practical skills evidence
   + labs + expert review + portfolio
```

### Category Implications

| Category | Customer Expectation | DiTeLe Response |
|----------|----------------------|-----------------|
| LMS | Users, roles, content, reporting, automation, SSO, API | Provide core administration; integrate rather than duplicate all LMS breadth |
| Technical skills | Labs, sandboxes, instant feedback, skill paths | Make testing labs and evidence the core |
| Certification preparation | Syllabus mapping, practice exams, readiness | Map to ISTQB but distinguish exam readiness from practical mastery |
| Testing community | Current practitioner knowledge, peer learning, events | Add expert network, portfolio review, challenges, community |
| Talent/assessment | Verified skills, benchmarking, employer signals | Provide competency evidence and verifiable profiles |

---

## 3. Target Customer Segments

### 3.1 Primary Segments

| Segment | Problem | Buyer | User | Best Product Mode |
|---------|---------|-------|------|-------------------|
| Career changers / junior testers | Theory without job-ready practice or portfolio | Learner / training provider | Learner | B2C standalone |
| ISTQB candidates | Exam knowledge does not prove practical ability | Learner / employer | Learner | Certification bundle |
| QA teams | Inconsistent skills and slow onboarding | QA lead / L&D | Employee | B2B academy |
| Training providers | Need differentiated practical delivery | Academy owner | Learner/trainer | White-label partner |
| Universities / vocational programs | Limited realistic lab infrastructure and review capacity | Program lead | Student/instructor | Institutional cohorts |
| Employers recruiting testers | CV/certificate does not show actual performance | Hiring manager | Candidate/reviewer | Verified assessment |

### 3.2 Jobs to Be Done

#### Learner

- “Help me learn the right testing skill in the right order.”
- “Give me a safe, realistic system on which I can practice.”
- “Tell me why my test case or bug report is weak.”
- “Show employers evidence that I can actually test software.”
- “Prepare me for ISTQB without reducing testing to memorization.”

#### Trainer

- “Prioritize the submissions where human judgment adds value.”
- “Review consistently with rubrics and reusable feedback.”
- “See who is blocked, falling behind, or ready to advance.”
- “Update content once and publish it safely in all languages.”

#### Organization

- “Measure capability, not hours watched.”
- “Assign paths based on role and skill gaps.”
- “Integrate learning with our identity, LMS, and reporting systems.”
- “Prove onboarding speed, skill improvement, and business impact.”

---

## 4. Current Market Signals

### 4.1 Hands-On Practice Is Baseline, Not a Premium Extra

Pluralsight offers secure temporary environments, guided labs, challenge modes, real-time validation, skill scores, and recommendations; it states that labs can also serve as practical exams. [Pluralsight hands-on labs](https://www.pluralsight.com/product/labs), [Pluralsight Labs overview](https://help.pluralsight.com/hc/en-us/articles/24356159003924-Labs-overview)

**Implication:** A static linked test website is no longer enough. DiTeLe needs isolated, resettable, observable scenarios with deterministic validation and escalating challenge modes.

### 4.2 Skills and Evidence Are Replacing Completion-Only Reporting

Pluralsight uses assessments before, during, and after learning; Docebo organizes content and profiles around skill catalogs and AI recommendations; Coursera sells skills-gap, mastery, effort, and benchmarking dashboards. [Pluralsight Assessments](https://help.pluralsight.com/hc/en-us/articles/42596595693972-Assessments-overview-and-comparison), [Docebo Skills](https://help.docebo.com/hc/en-us/articles/25135044544146-Best-practices-for-configuring-and-leveraging-skills-in-your-platform), [Coursera Skills Dashboard](https://www.coursera.org/business/products/skillsdashboard/)

**Implication:** DiTeLe must maintain a versioned competency graph and evidence ledger, not only task counts or days since course start.

### 4.3 AI Is Becoming Contextual Infrastructure

Codecademy’s assistant understands the current course, instructions, and solution code; Pluralsight pairs hands-on learning with an AI assistant; Docebo uses AI for content creation, coaching, skills, and personalization. [Codecademy Career Path](https://www.codecademy.com/learn/paths/back-end-engineer-career-path), [Pluralsight Hands-On Learning](https://www.pluralsight.com/product/hands-on-learning), [Docebo](https://www.docebo.com/)

**Implication:** A generic recommendation chatbot is insufficient. DiTeLe’s AI must be context-aware, evidence-aware, safe against answer leakage, and measured for learning effectiveness.

### 4.4 Automation and Integration Are Expected

TalentLMS supports event-driven automations, custom roles/permissions, REST API, groups/branches, scheduled/custom reports, and enterprise integrations. LTI 1.3 provides secure launch, role provisioning, deep linking, and assignment/grade services based on OAuth 2.0 and JWT. [TalentLMS Features](https://www.talentlms.com/features), [TalentLMS Automations](https://help.talentlms.com/hc/en-us/articles/9651467215900-How-to-work-with-automations-in-TalentLMS), [1EdTech LTI](https://www.1edtech.org/standards/lti)

**Implication:** Eloomi integration should be an adapter in a standards-aware Integration Hub, not custom coupling embedded throughout the product.

### 4.5 Testing Skills Are Expanding Toward AI, Automation, and Agile Quality

ISTQB CTFL 4.0 is the current foundation and applies across Waterfall, Agile, DevOps, and Continuous Delivery. In 2026, ISTQB released AI Testing v2.0, covering machine-learning and generative-AI systems, and an updated Advanced Agile Tester syllabus. [ISTQB CTFL 4.0](https://istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/), [ISTQB AI Testing v2.0](https://istqb.org/certifications/certified-tester-ai-testing-ct-ai/), [ISTQB Advanced Agile Tester announcement](https://test.istqb.org/istqb-launches-advanced-level-agile-tester-certification-reflecting-industry-maturity/)

**Implication:** DiTeLe needs a living curriculum: foundation, web/API, automation, CI/CD, security, performance, mobile, accessibility, Agile quality engineering, and AI-system testing.

---

## 5. Competitor Landscape

### 5.1 Competitor Groups

| Group | Examples | Strength | Weakness DiTeLe Can Exploit |
|-------|----------|----------|-----------------------------|
| Broad technical platforms | Pluralsight, Codecademy, Coursera | Scale, content, assessments, AI, analytics | Testing is one topic among many; limited testing-specific evidence workflow |
| Enterprise LMS/LXP | TalentLMS, Docebo, Eloomi | Administration, automation, integrations, reporting | Generic learning model; practical testing labs are not core |
| Testing education/community | Test Automation University, Ministry of Testing | Domain authority, current practitioners, community | Practical supervised assessment and employer-readable evidence vary |
| Course marketplaces | Udemy and similar | Breadth and low price | Fragmented quality, weak longitudinal skills model |
| Certification preparation | Question banks/training providers | Clear exam outcome | Often knowledge-heavy and weak on realistic practice |
| In-house training | Employer academies | Domain-specific context | Expensive to build and maintain; inconsistent assessment |

### 5.2 Feature Benchmark

| Capability | Pluralsight | Codecademy | TalentLMS | Docebo | TAU/MoT | Current DiTeLe | Target DiTeLe |
|------------|:-----------:|:-----------:|:---------:|:------:|:-------:|:--------------:|:-------------:|
| Hands-on environments | ✅ | ✅ | ◐ | ◐ | ◐ | ◐ linked target | ✅ isolated testing labs |
| Real-time validation | ✅ | ✅ | ◐ | ◐ | ◐ | ❌ mostly trainer | ✅ automatic + trainer |
| Testing-specialist depth | ◐ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅✅ |
| Human expert review | ◐ | ◐ | Configurable | Coaching | Community | ✅ | ✅ rubric/SLA |
| Skill graph/mastery | ✅ | ✅ | ✅ | ✅ | ◐ | ❌ | ✅ evidence-based |
| Placement assessment | ✅ | ◐ | ✅ | ✅ | ◐ | ❌ | ✅ |
| Adaptive path | ✅ | ✅ | Learning paths | ✅ AI | ◐ | ❌ | ✅ |
| AI contextual coach | ✅ | ✅ | ✅ | ✅ | Emerging | Generic bot | ✅ guarded testing coach |
| Portfolio evidence | ◐ | ✅ projects | ◐ | ◐ | ◐ | Limited | ✅ verified portfolio |
| Gamification | ◐ | ✅ | ✅ | ✅ | ◐ | ❌ | ✅ skill-based |
| B2B roles/tenant/admin | ✅ | ✅ | ✅ | ✅ | Limited | Basic roles | ✅ scoped/multi-tenant |
| LMS interoperability | Enterprise | Enterprise | API/LTI/SSO | Enterprise | Limited | Not observed | ✅ Eloomi + LTI/xAPI |
| Outcome analytics | ✅ | ✅ | ✅ | ✅ | Limited | Basic counts | ✅ skill/review/business |

Legend: ✅ strong/native; ◐ partial or product-dependent; ❌ absent/not evident.

### 5.3 Competitive Moat

DiTeLe’s moat must be built from assets competitors cannot copy quickly:

1. A growing library of realistic, versioned testing scenarios and seeded defects.
2. A testing-specific competency and rubric graph mapped to work artifacts and ISTQB.
3. A longitudinal evidence dataset showing how learners detect, explain, and prioritize defects.
4. A trusted network of trainers and calibrated review quality.
5. Verified learner portfolios and employer-facing skill signals.
6. Integrations that allow DiTeLe practice to complement, not replace, an organization’s LMS.

---

## 6. SWOT Analysis

| Strengths | Weaknesses |
|-----------|------------|
| Existing practical workflow and trainer review | Calendar/day-based progression |
| Real test-target concept | No isolated/resettable lab orchestration observed |
| Multilingual EN/DE/RU content | Fragmented localization and authoring overhead |
| Student/trainer/admin operating model | Client-side security and limited role granularity |
| Questions, transfers, comments, certificates | No competency graph or evidence ledger |
| Direct domain focus on testing | Manual review does not scale without automation |

| Opportunities | Threats |
|---------------|---------|
| AI-system and GenAI testing curricula | Free testing content and low-cost marketplaces |
| Skills-based hiring and verified portfolios | Broad platforms adding more labs and AI |
| B2B onboarding and capability measurement | Certification-only expectations compress pricing |
| White-label academy/test-provider partnerships | AI-generated content reduces perceived content value |
| Eloomi/LMS integration | Poor AI/security handling could damage trust |
| Practical assessment-as-a-service | Reviewer inconsistency or slow feedback harms outcomes |

---

## 7. Strategic Product Positioning

### 7.1 Positioning Statement

For aspiring testers and organizations that need demonstrable QA capability, DiTeLe is a practical testing-skills platform that provides realistic environments, evidence-based assessment, and expert coaching. Unlike video libraries and exam-only preparation, DiTeLe proves what a learner can do and produces a verified portfolio that connects learning to work readiness.

### 7.2 Product Promise

> **Practice real testing. Prove real skills. Become job-ready.**

### 7.3 What DiTeLe Should Not Build

- A general video marketplace
- A complete HRIS
- A generic authoring suite that competes with all LMS vendors
- Uncontrolled AI-generated courses
- Gamification based on logins and clicks
- A custom integration for every LMS without a canonical contract
- A fully automated assessment that removes expert judgment from ambiguous work

---

## 8. Target Product Portfolio

### 8.1 Product Modes

| Product | Audience | Included Outcome |
|---------|----------|------------------|
| DiTeLe Practice | Individual learners | Labs, feedback, skills profile, portfolio |
| DiTeLe + ISTQB | Certification candidates | CTFL-aligned theory, practice, readiness assessment |
| DiTeLe Teams | QA teams | Role paths, cohort analytics, trainer workflow, SSO |
| DiTeLe Assess | Employers/recruiters | Proctored scenario assessment and verified report |
| DiTeLe Partner | Academies/universities | White-label cohorts, authoring, trainer calibration |
| DiTeLe Integration | LMS customers | LTI/SSO/API launch, progress and evidence synchronization |

### 8.2 Curriculum Architecture

```text
Foundation
  ├── testing principles, lifecycle, techniques, defects, reporting
Web & Mobile
  ├── exploratory, usability, accessibility, compatibility
API & Integration
  ├── HTTP, contracts, negative tests, data, observability
Automation
  ├── UI/API automation, maintainability, CI execution
Quality Engineering
  ├── Agile/DevOps, risk, shift-left/right, quality assistance
Specialist
  ├── security, performance, mobile, accessibility
AI Quality
  ├── testing ML/LLM systems, data, non-determinism, evaluation
Testing with AI
  └── responsible use of GenAI for analysis, design, automation, reporting
```

Each skill node contains:

- learning outcomes and prerequisite skills
- concise theory or external LMS link
- guided practice
- challenge mode without guidance
- deterministic checks where possible
- rubric and evidence requirements
- remediation content
- mastery threshold and expiry/revalidation policy

---

## 9. Advanced and Dynamic Feature Plan

### 9.1 Dynamic Learning Engine

| Feature | Behavior |
|---------|----------|
| Placement diagnostic | Combines knowledge, practical task, confidence, and prior evidence |
| Skill graph | Versioned prerequisites and mastery per competency |
| Next-best action | Recommends remediation, practice, or assessment based on evidence |
| Flexible pacing | No mandatory day sequence; optional target dates and cohort cadence |
| Mastery rules | Multiple evidence types; decay/revalidation only where justified |
| Branching scenarios | Test target changes based on learner decisions and risk choices |
| Spaced retrieval | Revisits weak concepts and skills at appropriate intervals |
| Challenge mode | Removes hints and guidance for authentic assessment |

### 9.2 Testing Lab Platform

- One isolated environment per attempt or cohort.
- Scenario templates with seeded defects, feature flags, data fixtures, and reset.
- Web, mobile, API, database, log, accessibility, performance, and AI-system targets.
- Automatic instrumentation captures requests, actions, evidence, and target state.
- Deterministic validators confirm selected outcomes without revealing every hidden defect.
- Difficulty variants prevent answer sharing and enable retakes.
- Lab budget, timeout, cleanup, and abuse limits.

### 9.3 AI Testing Coach

The AI coach must follow a pedagogical escalation ladder:

```text
Socratic question
  → concept reminder
  → strategy hint
  → evidence-specific critique
  → worked example on a different scenario
  → trainer escalation
```

It must not reveal hidden bugs or final answers in assessment mode. All responses use approved content retrieval, citations, prompt/version logging, redaction, cost limits, and quality evaluations.

### 9.4 Trainer Workbench

- Risk-prioritized review queue
- SLA and workload balancing
- Rubric-based review with reusable snippets
- Side-by-side learner evidence and lab telemetry
- AI-assisted feedback draft with explicit trainer approval
- Inter-rater consistency dashboard and calibration samples
- Bulk actions only where pedagogically safe
- Escalation and specialist transfer

### 9.5 Verified Portfolio

- Test charters, test cases, bug reports, automation repositories, and reflections
- Evidence trace to scenario/version/rubric/reviewer
- Redaction of confidential lab data
- Shareable, revocable public profile
- Verifiable certificate and competency badges
- Employer report showing strengths, evidence quality, and assessment conditions

### 9.6 Gamification

Gamification must reward demonstrable learning:

- XP ledger for accepted evidence and mastery, not logins
- badges for skills and meaningful milestones
- personal progress map and missions
- optional cohort challenges and bug hunts
- private or opt-in leaderboards
- anti-gaming rules, rate limits, anomaly detection
- no punitive XP decay; use skill revalidation where currency matters

---

## 10. Integration and Ecosystem Strategy

### 10.1 Build vs Integrate

| Capability | Decision |
|------------|----------|
| Practical labs, evidence, skills, review | Build — core IP |
| Broad theory library | Integrate or license |
| Identity/MFA/enterprise SSO | Buy/managed or proven open-source IdP |
| Payments/tax/invoicing | Buy |
| Email/SMS/push | Buy |
| Video hosting/transcoding | Buy |
| Product analytics/warehouse | Hybrid |
| AI models | Multi-provider gateway; do not own base model |
| LMS interoperability | Build standards-based adapter layer |

### 10.2 Standards

- **OIDC/OAuth 2.1** for identity and enterprise SSO.
- **LTI 1.3 Advantage** for secure launch, role provisioning, deep links, and grade/progress exchange where LMS support exists. 1EdTech identifies OAuth 2.0/JWT-based security and services for assignments/grades, names/roles, and deep linking. [1EdTech LTI](https://www.1edtech.org/standards/lti)
- **xAPI/cmi5** for portable learning-experience events and an LRS when customers require cross-system analytics.
- **OpenAPI** for REST contracts and generated clients.
- **CloudEvents-compatible event envelope** for internal/external events.
- **SCIM 2.0** for enterprise user provisioning when required.

---

## 11. Commercial Model

### 11.1 Packaging Hypothesis

| Package | Commercial Unit | Main Value Metric |
|---------|-----------------|-------------------|
| Individual | Monthly/annual subscription or program fee | Active learner / program completion |
| Certification bundle | Fixed cohort/program price | Readiness + exam/practical outcome |
| Teams | Annual per active learner with minimum contract | Skill improvement and onboarding |
| Assessment | Per candidate/attempt | Verified hiring/upskilling decision |
| Partner/White-label | Platform fee + active learners | Partner scale |
| Premium review | Credits or program tier | Expert review capacity |

Do not finalize price before interviewing buyers and measuring trainer cost per successful outcome.

### 11.2 Unit-Economics Variables

- learner acquisition cost
- activation and paid conversion
- lab infrastructure cost per active hour
- AI cost per learner and completed module
- trainer minutes per submission and per graduate
- support cost per organization
- completion, retention, renewal, and expansion
- gross margin by product mode

---

## 12. Go-to-Market Plan

### Beachhead

Begin with German-speaking career changers and small/medium QA teams that value ISTQB plus practical readiness. This uses WAMOCON Academy’s domain credibility and avoids competing globally on content volume.

### Motions

1. **Outcome-led B2C:** “Build a verified testing portfolio,” not “watch a course.”
2. **Employer pilot:** Benchmark a QA team, assign targeted paths, report improvement after 8–12 weeks.
3. **Academy partnership:** Provide labs and review tooling to training providers lacking practical infrastructure.
4. **Hiring assessment:** Offer a realistic scenario with a standardized employer report.
5. **Content authority:** Publish testing scenarios, rubric examples, and practical skill benchmarks.

### Proof Required

- before/after skill evidence
- median trainer-feedback time
- portfolio/employment outcomes
- ISTQB readiness/pass results, clearly separated from official certification claims
- onboarding time reduction for organizations
- customer testimonials tied to measurable outcomes

---

## 13. Product Metrics

### North-Star Metric

> **Verified competency milestones achieved per active learner per month.**

### Metric Tree

| Area | Metrics |
|------|---------|
| Acquisition | Qualified visits, assessment starts, trial activation, conversion |
| Activation | First lab started, first evidence submitted, first feedback received |
| Learning | Mastery delta, remediation success, time to competency, retention |
| Practice | Lab starts/completions, validator pass, evidence quality |
| Review | Queue age, P50/P95 turnaround, trainer minutes, agreement rate |
| Engagement | Weekly active learners, meaningful streak, path continuation |
| Outcomes | Certificate readiness, portfolio completion, hiring/onboarding outcomes |
| B2B | Seat activation, admin engagement, renewal, expansion, skill-gap closure |
| Reliability | Availability, API latency, sandbox startup/failure, sync errors |
| AI | Helpfulness, escalation, answer leakage, hallucination, cost per outcome |

Avoid vanity metrics such as raw logins, total video minutes, or XP without demonstrated skill.

---

## 14. Prioritized Product Roadmap

### Now — Foundation and Product Truth (0–3 Months)

- Secure identity and AI proxy.
- Map the current curriculum and tasks to CTFL 4.0 plus practical competencies.
- Instrument the current product and baseline outcomes.
- Build golden-workflow tests and OpenAPI contracts.
- Replace numeric states with named workflow definitions.
- Interview 15 learners, 8 trainers, 10 QA leaders, and 5 training partners.

### Next — Sellable Standalone MVP (4–7 Months)

- Flexible learning paths and progress map.
- Competency/evidence ledger and placement assessment.
- First isolated web/API testing lab family.
- Trainer workbench with rubrics and SLA.
- Verified learner portfolio.
- Basic skill-based badges and notifications.

### Then — B2B and Integration (8–11 Months)

- Organization tenancy, scoped roles, SSO.
- Eloomi/LMS adapter, LTI where applicable, reconciliation UI.
- Team skill dashboards and assignments.
- Webhooks/API, audit and compliance workflows.
- Partner authoring/review workflow.

### Differentiate — Modern Testing Academy (12–18 Months)

- AI coach with evidence-aware guidance.
- Automation, performance, security, accessibility, mobile, and AI-testing labs.
- Employer assessment product and benchmark.
- Adaptive learning experiments and skill revalidation.
- Marketplace/network for calibrated specialist reviewers.

---

## 15. Complete Analysis and Delivery Workflow

This workflow turns the plan into a validated replacement rather than a speculative redesign.

### Workstream A — System Truth

1. Inventory frontend, backend, database, infrastructure, jobs, integrations, and data volumes.
2. Generate route/API/schema maps and confirm every inferred state.
3. Record six golden journeys and edge cases.
4. Produce data classification, threat model, and authorization matrix.

**Deliverables:** verified C4 architecture, OpenAPI, ERD, state machines, risk register.

### Workstream B — User and Service Research

1. Interview each role and observe real task/review sessions.
2. Measure wait time, rework, confusion, hint use, and drop-off.
3. Map service blueprint from enrollment through certificate.
4. Test the proposed positioning and willingness to pay.

**Deliverables:** personas/JTBD, journey maps, service blueprint, opportunity map.

### Workstream C — Curriculum and Competency

1. Map content to CTFL 4.0 and job competencies.
2. Define observable evidence and rubrics for every skill.
3. Identify content gaps, duplication, and obsolete material.
4. Build placement, mastery, remediation, and revalidation rules.

**Deliverables:** skill graph, curriculum matrix, rubric library, assessment blueprint.

### Workstream D — Market and Commercial Validation

1. Run competitor teardowns using consistent scenarios.
2. Interview buyers across B2C, teams, academies, and hiring.
3. Test packages, value metrics, and pricing hypotheses.
4. Model infrastructure, AI, review, support, and acquisition costs.

**Deliverables:** segment scorecard, positioning, packaging, unit-economics model.

### Workstream E — Architecture and Migration

1. Decide domain boundaries, identity, tenancy, APIs/events, and sandbox isolation.
2. Prototype the highest-risk elements: lab orchestration, evidence validation, LMS sync.
3. Define source-to-target mapping and rollback for every entity.
4. Release behind feature flags and migrate cohort by cohort.

**Deliverables:** ADRs, target architecture, migration runbook, reconciliation dashboards.

### Workstream F — Continuous Product Validation

1. Establish metric baselines and experiment guardrails.
2. Test usability/accessibility with each role and language.
3. Run security, resilience, performance, and restore tests.
4. Compare learning outcomes and operating cost before and after migration.

**Deliverables:** KPI dashboard, experiment reports, go/no-go gates, post-launch review.

---

## 16. Go/No-Go Gates

| Gate | Go Criteria |
|------|-------------|
| Discovery complete | Backend/schema verified; critical workflows and ownership documented |
| Architecture approved | Threat model, tenant model, domain/API/event decisions accepted |
| MVP pilot | ≥80% golden-flow success; no critical security issues; feedback SLA met |
| Learning validity | Rubric reliability and meaningful mastery improvement demonstrated |
| Commercial validity | At least three paying design partners or equivalent committed demand |
| Migration wave | Reconciliation passes; rollback tested; support and observability ready |
| General availability | Reliability/accessibility/security targets met; runbooks and ownership active |

---

## 17. Top Strategic Decisions

1. **Own practice and evidence; integrate broad theory.**
2. **Replace time-based unlocking with competency-based progression and optional cohort dates.**
3. **Turn the test website into an isolated, resettable lab platform.**
4. **Scale human review through automation and AI assistance without removing expert accountability.**
5. **Build verified portfolios and employer signals as the primary differentiation.**
6. **Use standards and adapters so Eloomi is optional, not structural.**
7. **Treat AI safety, learner data, and answer leakage as product-quality concerns, not only technical concerns.**
8. **Measure verified skill improvement and time to competency, not content consumption.**

---

## 18. Source Register

- [Pluralsight Hands-On Labs](https://www.pluralsight.com/product/labs)
- [Pluralsight Hands-On Learning and AI Assistant](https://www.pluralsight.com/product/hands-on-learning)
- [Pluralsight Assessment Overview](https://help.pluralsight.com/hc/en-us/articles/42596595693972-Assessments-overview-and-comparison)
- [Codecademy for Business](https://www.codecademy.com/business)
- [Codecademy Contextual AI Learning Assistant Example](https://www.codecademy.com/learn/paths/back-end-engineer-career-path)
- [TalentLMS Platform Features](https://www.talentlms.com/features)
- [TalentLMS Gamification](https://www.talentlms.com/features/gamification-lms)
- [TalentLMS Automations](https://help.talentlms.com/hc/en-us/articles/9651467215900-How-to-work-with-automations-in-TalentLMS)
- [Docebo Platform](https://www.docebo.com/)
- [Docebo Skills Guidance](https://help.docebo.com/hc/en-us/articles/25135044544146-Best-practices-for-configuring-and-leveraging-skills-in-your-platform)
- [Coursera Skills Dashboard](https://www.coursera.org/business/products/skillsdashboard/)
- [Ministry of Testing Courses](https://www.ministryoftesting.com/courses)
- [1EdTech LTI 1.3](https://www.1edtech.org/standards/lti)
- [ISTQB CTFL 4.0](https://istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/)
- [ISTQB Certified Tester AI Testing v2.0](https://istqb.org/certifications/certified-tester-ai-testing-ct-ai/)
