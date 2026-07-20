# DiTeLe V2 Terminology Register

Last updated: 2026-07-18. This register prevents legacy labels and supporting-plan personas from silently changing domain or authorization semantics. User-facing translations may vary, but code, contracts, state machines and audit events use the canonical terms below.

| Canonical term | Legacy/supporting term | Meaning and constraint |
|---|---|---|
| learner | student | A person learning or being assessed. `learner` is the canonical V2 domain/role name; localized UI may use the natural language equivalent. |
| trainer | reviewer, mentor | A scoped human who supports learners and reviews assigned work. Trainer access always requires the applicable resource/cohort assignment. |
| platform admin | admin | A deliberately global platform operator role. It is distinct from organization admin and is never inferred from tenant membership. |
| organization admin | academy owner, QA/L&D lead, team/program lead | A tenant-scoped capability set, not a global admin. Supporting-plan personas remain personas until permissions are approved. |
| content admin | author, partner author | A narrowly scoped content-authoring role. It does not imply user, tenant, certificate or integration administration. |
| cohort | group | The V2 delivery/scheduling container that pins a content version and memberships. V1-facing adapters may map `group` to `cohort`; UI copy may retain “group” only where parity requires it. |
| enrollment | course application, course request, registration | The learner-to-course participation lifecycle. Authentication account registration is separate from course enrollment. |
| entitlement | package/license access | A server-enforced grant that permits requesting or receiving a product/course; it does not itself assign a cohort or prove mastery. |
| attempt | solving | The learner-owned mutable work session for one task. It may contain a recoverable draft and can produce immutable submission versions. |
| attempt draft | unsaved/current solving | Mutable learner input protected by optimistic concurrency. It is not trainer-review evidence until submitted. |
| submission version | solved task, answer | An immutable snapshot of answer, selected options, evidence references, hint usage and elapsed time sent for review. |
| revision required | incorrect, rejected solving | A non-terminal review decision asking the learner to revise. It is not the same as an enrollment being rejected or a cohort being cancelled. |
| accepted submission | correct/approved solving | A human review outcome for one immutable submission version. It does not automatically issue a certificate unless approved eligibility rules say so. |
| task schedule | activation date | The legacy-compatible temporal availability rule. It remains supported during migration but is distinct from prerequisite/mastery availability. |
| learning path | course sequence | A versioned, explainable set/graph of activities and prerequisites derived from goals and evidence. |
| prerequisite | dependency | A named condition that gates or recommends an activity; reasons must be visible and cycles fail validation. |
| skill | competency node | A versioned unit of observable capability in the taxonomy. “Competency” may describe the broader product concept; code uses skill records and mappings. |
| mastery | skill level/current validity | An explainable, time/version-aware conclusion derived from evidence. It may require revalidation but never subtracts immutable XP history. |
| evidence | proof, artifact | An attributable record supporting learning/review/mastery. Evidence records source, ownership and provenance; confidential data requires redaction/access control. |
| rubric | review criteria | A versioned scoring/decision framework. Rubric calibration and reliability are separate from merely rendering criteria. |
| lab definition/scenario | test website, practical target, sandbox template | The versioned target specification, fixtures, seeded defects and validators. A plain external link is not a verified lab. |
| lab session | sandbox, test environment | A time-bounded learner-isolated execution of a lab definition with credentials, telemetry, reset/destroy and validation state. |
| mastery revalidation | skill expiry/decay | A requirement for newer evidence when currency matters. It is explicitly separate from prohibited punitive XP decay. |
| certificate | course/exam certificate | A lifecycle-managed credential with approved eligibility, issuer and revocation rules. V1 type `0` maps to course-completion evidence and type `1` to exam/ISTQB evidence pending verified rules. |
| ISTQB readiness | exam preparation/readiness | A learning signal only. It must never be presented as an official ISTQB certification or exam result without approved issuer/rules. |
| role view / impersonation | view as | A server-authorized, reasoned, time-bounded perspective change with a persistent warning and audit event; it never changes the actor identity. |
| actor | current user/principal | The authenticated internal identity performing an action. Authorization derives active roles, tenant and assignments server-side. |
| organization | tenant, academy, company | The data-isolation boundary for tenant-scoped membership, roles and resources. Product hierarchy/white-label decisions remain blocked. |
| product mode | Practice, ISTQB, Teams, Assess, Partner, Integration | A packaging/workflow hypothesis, not an authorization role or completed implementation. Scope remains explicit under BLK-007. |
| persona | buyer, employer reviewer, candidate, partner, QA/L&D lead | A research/product audience. Personas do not receive permissions until a requirement and policy define a canonical role or scoped capability. |

## State vocabulary guardrails

- Numeric V1 statuses are accepted only inside the legacy compatibility mapper; unknown values fail closed.
- `rejected` applies to an enrollment decision. `revision_required` applies to a submitted task. `cancelled` applies to a cohort/enrollment participation closure. These states are not interchangeable.
- `published` content is immutable and learner-visible only through an authorized publication/cohort pin. `archived` preserves authorized history and is not a mutable draft.
- `completed` participation records lifecycle closure; it does not imply skill mastery, certificate eligibility or certificate issuance.
