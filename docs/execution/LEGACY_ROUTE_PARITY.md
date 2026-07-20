# Version 1 to Version 2 Route Parity

Last updated: 2026-07-18. This appendix is the individual HARD-01 route map required by Plan 10. V1 was inspected read-only at `/home/wamocon/Desktop/Wamocon_academy_Ditele`; source paths below are relative to its `src/` directory.

## Count reconciliation

- V1 contains exactly 47 `page.tsx` files: 46 localized pages and one unprefixed root page that renders an empty fragment.
- V2 currently contains 46 `page.tsx` files: 45 localized pages and one root locale redirect; the public FAQ and protected admin-member detail are the two newest parity surfaces.
- Page-file counts are not business-capability counts. V2 splits authentication into four pages and consolidates several V1 archive/detail/editor routes.
- `tests/unit/protected-route-execution-contract.test.ts` audits authorization-before-read across 34 V2 protected pages and passes after the admin-member addition. It does not prove parity, workflow completion or visual acceptance.
- No existing screenshot is accepted for this map. `UI_VERIFICATION.md` records the required production-mode rerun.

Test evidence abbreviations: `PUB` public/catalog E2E and component/contract tests; `AUTH` auth/protected-role E2E and session tests; `CONT` admin-content E2E and lifecycle/view tests; `ADM` administration read/model/component tests; `COH` cohort server/action/model/view tests; `TASK` learner-task E2E and task/attempt tests; `QA` question E2E and mentoring tests; `REV` review queue/workbench/history tests; `PROF` profile tests; `CERT` certificate tests; `RC` protected-route execution contract; `V0` fresh visual evidence pending.

| # | V1 route / role | V1 behavior and source/API evidence | Canonical V2 route or replacement | Current evidence | Status / gap |
|---:|---|---|---|---|---|
| 1 | `/` / public | `app/page.tsx`; empty fragment | `/` redirects to `/en` | static/build; V0 | Replaced |
| 2 | `/{lang}/about-company` / public | `app/[lang]/about-company/page.tsx`; localized company link | `/{locale}/about` | shared route/header test; V0 | Implemented; BUG-032 browser closure pending |
| 3 | `/{lang}/admin/courses/{course_id}/create?phase=` / admin | page plus `components/admin/tasks/TaskCreateForm.tsx`; `/tasks`, `/courses/show`, `/bugs/categories`, `/task/create` | `/{locale}/admin/tasks` and content-version detail | RC, CONT; V0 | Partial; no create mutation, BUG-049 |
| 4 | prior route + `/preview` / admin | page plus `PreviewTask.tsx`; cached unsaved-task preview | `/{locale}/admin/courses/{courseId}/versions/{versionId}/preview?role=` | RC, CONT; V0 | Partial; persisted version only, BUG-049 |
| 5 | `/{lang}/admin/courses/{course_id}/edit-task/{task_id}` / admin | page plus `TaskEditForm.tsx`; `/task/show`, `/task/edit`, categories/issues | admin task/version surfaces | RC, CONT, ADM; V0 | Partial; edit and issue actions absent, BUG-049/053 |
| 6 | prior route + `/preview` / admin | page plus `PreviewEditTask.tsx` | version preview | RC, CONT; V0 | Partial; no edit-draft flow, BUG-049 |
| 7 | `/{lang}/admin/courses/{course_id}/edit` / admin | page plus `CourseEditForm.tsx`; `/courses/show`, multipart `/courses/edit` | admin course/version detail | RC, CONT; V0 | Partial; lifecycle/read only, BUG-049 |
| 8 | `/{lang}/admin/courses/{course_id}` / admin | course page, `ChangeVideo.tsx`, `TaskCard.tsx`; stage/video/task/course mutations | `/{locale}/admin/courses/{courseId}` and version detail | RC, CONT; V0 | Partial; authoring controls unavailable, BUG-049 |
| 9 | `/{lang}/admin/courses/create` / admin | localized metadata/media; multipart `/courses/add` | no V2 route/action | CONT asserts no mutations; V0 | Missing, BUG-049 |
| 10 | `/{lang}/admin/courses` / admin | list/import; `/courses/list`, `/groups`, `/courses/add` | `/{locale}/admin/courses` | RC, CONT; V0 | Partial; no create/import, BUG-049 |
| 11 | `/{lang}/admin/groups/{group_id}/{student_id}` / admin | `ProfilePage`; learner/group/certificate context | consolidated privacy-minimized `/{locale}/admin/users/{userId}` with assignments/progress/certificate lifecycle | RC, ADM, COH; V0 | Partial/read-only; group membership mutation absent BUG-050; browser BUG-065 review pending |
| 12 | `/{lang}/admin/groups/{group_id}` / admin | `GroupPage`; group/schedule/duplicate/lifecycle/member mutations | `/{locale}/admin/groups/{cohortId}` | RC, COH; V0 | Partial; membership/duplicate/delete absent, BUG-050 |
| 13 | `/{lang}/admin/groups` / admin | list and create/edit/delete dialogs | `/{locale}/admin/groups` | RC, ADM, COH; V0 | Partial; mutations absent, BUG-050 |
| 14 | `/{lang}/admin` / admin | redirects to localized home | `/{locale}/admin` operations dashboard | RC, AUTH, ADM; V0 | Replaced/partial, BUG-038/053 |
| 15 | `/{lang}/admin/reports` / admin | issue list/status via `issues/reports/*` | issue summary embedded in `/{locale}/admin` | RC, ADM; V0 | Partial; no detail/status action, BUG-053 |
| 16 | `/{lang}/admin/students/{student_id}` / admin | `StudentProfilePage`; global profile/edit/delete/certificates | consolidated privacy-minimized `/{locale}/admin/users/{userId}` learner context | RC, ADM; V0 | Partial/read-only; edit/delete/contact decision/download absent BUG-051/052/058; browser BUG-065 review pending |
| 17 | `/{lang}/admin/students` / admin | users/applications/groups/export/register/assignment | `/{locale}/admin/users` plus `/admin/applications` | RC, ADM; V0 | Partial; assignment/export/user CRUD absent, BUG-045/050/051/053 |
| 18 | `/{lang}/admin/trainers/{trainer_id}` / admin | trainer profile and assigned groups via `/users` | consolidated privacy-minimized `/{locale}/admin/users/{userId}` trainer assignments | RC, ADM; V0 | Partial/read-only; assignment/user mutation absent BUG-050/051; browser BUG-065 review pending |
| 19 | `/{lang}/admin/trainers` / admin | users/groups and trainer creation | consolidated `/{locale}/admin/users` | RC, ADM; V0 | Partial/read-only, BUG-050/051 |
| 20 | `/{lang}/confidentiality` / public | placeholder EN/DE/RU privacy copy | `/{locale}/privacy` plus `/legal` | privacy-copy test, PUB; V0 | Implemented replacement; BUG-059 browser pending |
| 21 | `/{lang}/courses/-wamocon` / public | fixed course 45; hero/Q&A/learning/process/content/feedback/FAQ via `/guest/courses/show` | `/{locale}/catalog/{slug}` | PUB; V0 | Partial; rich facts/media/sections/recommender absent, BUG-055/056 |
| 22 | `/{lang}/courses/{course_id}/task-preview/{task_id}` / trainer/admin | `TaskPage variant="trainer"`; `/task/show`; disabled inputs | admin version preview only | CONT; V0 | Partial; trainer context missing, BUG-066 |
| 23 | `/{lang}/courses/{course_id}/tasks/{task_id}` / learner | task show/submit/question APIs; media, hint, MCQ, timer | `/{locale}/learn/tasks/{taskId}` | RC, TASK, QA; V0 | Partial; BUG-035/046/047/048 |
| 24 | `/{lang}/courses/{course_id}/tasks?group_id=` / learner | course/stage/task/video, certificate and rating APIs | `/learn/courses/{courseId}` plus `/learn/certificates` | RC, TASK, CERT; V0 | Partial; rating/download absent, BUG-052/053 |
| 25 | `/{lang}/courses/public/testing-course/{course_id}` / public | dynamic rich landing via `/guest/courses/show` | `/{locale}/catalog/{slug}` | PUB; V0 | Partial, BUG-056 |
| 26 | `/{lang}/error/401` / all | localized 401 page | safe login redirect on session failure | AUTH, RC; V0 | Replaced |
| 27 | `/{lang}/error/403` / all | localized 403 page | server denial plus forbidden `StatePanel` | AUTH, RC, state-panel test; V0 | Replaced |
| 28 | `/{lang}/error` / all | generic localized error page | global/route `error.tsx` boundaries | boundary/state tests; V0 | Replaced |
| 29 | `/{lang}` / all | guest catalog; learner course tabs; trainer/admin redirect | public home plus `/learn`, `/trainer`, `/admin` | PUB, AUTH, RC; V0 | Replaced/core implemented, BUG-014/036 |
| 30 | `/{lang}/profile/history` / learner | static English example question history | localized `/{locale}/learn/history` semantic timeline UI plus real `/learn/questions`; data adapter is being replaced by one immutable actor-derived keyset projection | initial 27 focused tests; independent six-finding security/correctness review; browser pending | Rework: privacy/authorization UI is retained, but unstable mutable-row pagination and missing exact task context prevent parity acceptance under BUG-064 |
| 31 | `/{lang}/profile` / learner | profile/contact edit and certificate list/download | `/learn/profile` plus `/learn/certificates` | RC, PROF, CERT; V0 | Partial, BUG-052/058 |
| 32 | `/{lang}/questions` / public | seven localized FAQ accordion entries | `/{locale}/faq` with seven typed EN/DE/RU native disclosures and public-header link | FAQ copy/page/header 19/19; V0 pending | Implemented; honest commercial/certificate wording, browser pending BUG-063 |
| 33 | `/{lang}/success` / learner | static question-submitted confirmation/history link | inline result/redirect to real thread/list | QA; V0 | Replaced |
| 34 | `/{lang}/trainer/answers/{answer_id}` / trainer/admin | review detail/status/comment/transfer via trainer task APIs | `/{locale}/trainer/submissions/{submissionId}` | RC, REV, TASK; V0 | Implemented core; BUG-027/028 release closure |
| 35 | `/{lang}/trainer/answers/archive/{answer_id}` / trainer/admin | archived answer detail | canonical submission detail | RC, REV; V0 | Replaced/implemented; BUG-027/028 closure |
| 36 | `/{lang}/trainer/answers/archive` / trainer/admin | `/solvings/archive` list | `/{locale}/trainer/history` | RC, REV; V0 | Implemented, browser pending |
| 37 | `/{lang}/trainer/answers/history/{answer_id}` / trainer/admin | historical answer detail | canonical submission detail | RC, REV; V0 | Replaced/implemented; BUG-027/028 closure |
| 38 | `/{lang}/trainer/answers` / trainer/admin | personal/transferred/group tabs and sorting via `/solvings` | `/trainer/submissions` and `/trainer` | RC, REV, TASK; V0 | Partial; filters/prioritization unwired, BUG-054 |
| 39 | `/{lang}/trainer/groups/{group_id}` / trainer/admin | group/members/dates/lifecycle | `/{locale}/trainer/groups/{cohortId}` | RC, COH; V0 | Partial; member context only counts, BUG-050/057 |
| 40 | prior route + `/student/{student_id}` / trainer/admin | scoped learner profile/progress/certificates | `/trainer/progress` non-linked rows only | RC, COH; V0 | Missing detail, BUG-057 |
| 41 | prior route + `/task/{task_id}` / trainer/admin | scoped task instruction/options/hint/media/target | task context only in submission review/admin preview | REV, CONT; V0 | Missing, BUG-066 |
| 42 | `/{lang}/trainer/groups` / trainer/admin | assigned groups via `/groups` | `/{locale}/trainer/groups` | RC, COH; V0 | Implemented core; BUG-034 DB closure pending |
| 43 | `/{lang}/trainer` / trainer/admin | redirect to localized home | `/{locale}/trainer` aliases review queue | AUTH, RC, REV; V0 | Replaced/core implemented, BUG-054 |
| 44 | `/{lang}/trainer/questions/{question_id}` / trainer/admin | thread/answer/transfer/eligible-trainer APIs | `/{locale}/trainer/questions/{questionId}` | RC, QA; V0 | Partial; BUG-021/046 |
| 45 | prior route under `/archive/{question_id}` / trainer/admin | archived thread/answer | canonical question detail | RC, QA; V0 | Replaced/implemented |
| 46 | `/{lang}/trainer/questions/archive` / trainer/admin | archived question list | same V2 route | RC, QA; V0 | Implemented, browser pending |
| 47 | `/{lang}/trainer/questions` / trainer/admin | active queue, sorting and group context | same V2 route | RC, QA; V0 | Core implemented; BUG-021/046 |

## V2-only and consolidated route authority

- V2 auth pages (`/auth/login`, `/register`, `/reset-password`, `/update-password`) implement CUR-02/WF-01 rather than expanding V1 business scope.
- `/learn/enroll/{courseId}`, `/notifications`, `/portfolio`, `/skills` and question detail routes implement Plan-10 modules/workflows absent or consolidated in V1.
- `/admin/applications`, content versions/previews, `/trainer/progress`, `/organization`, `/legal` and `/privacy` are canonical replacements or Plan-10 additions.
- `/admin/settings` currently carries operations/organization configuration only indirectly and requires an explicit requirement mapping before HARD-01 can close.

HARD-01 remains in progress until every partial/missing route is implemented or explicitly approved as a replacement, target-only route names in the main traceability matrix are corrected, and fresh visual evidence exists for visible routes.
