# UI Verification

Last updated: 2026-07-20.

## Live Chromium acceptance — 2026-07-20

The Browser/IAB connector was not exposed, so the documented Playwright Chromium fallback was used against `http://127.0.0.1:3100` and the real local Supabase stack. Generated concept imagery remained waived; rendered workflow verification was not waived.

| Matrix | Result | Evidence |
|---|---|---|
| health and four UI logins | 1/1 health and learner/trainer/admin/organization-admin 4/4 pass | server-derived destinations and visible identities; `artifacts/screenshots/auth/learner-session-desktop.png` |
| public routes | 16/16 pass | home/catalog/course/about/FAQ/privacy/legal/auth surfaces; no page, console or failed-request errors |
| guest redirects and wrong-role denials | 8/8 pass | direct protected URLs redirect; learner/trainer/admin/organization-admin cross-role denials render the forbidden surface |
| protected role routes | 31/31 pass after BUG-096 | learner, trainer, admin and organization surfaces, including exact trainer cohort detail |
| DE/RU and responsive routes | 14/14 pass | desktop plus 390×844 role landings; EN/DE/RU content preview screenshots under `artifacts/screenshots/admin/` |
| representative automated accessibility | 11/11 pass | Axe returned zero violations on the exercised representative screens |
| public mobile Legal navigation | pass | 390×844 semantic menu, visible Legal link, exact `/en/legal`, no overflow/runtime/network failures, Axe 0 |
| learner History navigation | desktop and mobile pass | exact `/en/learn/history`; mobile disclosure closes after navigation and the heading is uncovered; Axe 0 |
| admin content studio | Playwright 2/2 pass | seven admin content/preview screenshots, EN desktop plus DE desktop and RU mobile |
| authentication and role E2E | Playwright 16/16 pass | four role logins, invalid credentials, non-enumerating reset response, explicit sign-out, guest redirects and role isolation |

Current checked-in visual artifacts include:

- `artifacts/screenshots/admin/content-course-list-desktop.png`
- `artifacts/screenshots/admin/content-version-detail-desktop.png`
- `artifacts/screenshots/admin/content-preview-ru-mobile.png`
- `artifacts/screenshots/learner/dashboard-desktop.png`
- `artifacts/screenshots/learner/dashboard-mobile.png`
- `artifacts/screenshots/trainer/queue-desktop.png`
- `artifacts/screenshots/organization/administration-desktop.png`

The final freshly built production sweep passed 32/32 in 1.4 minutes and recorded zero unexplained page errors, console warnings/errors, failed requests, HTTP error responses or horizontal overflow. The request observer ignores only rigorously identified same-origin Next transport cancellations after a completed action/RSC response; its negative boundary has 7/7 unit coverage. Repeated QA traffic intentionally reaches the authentication throttle, so the final handoff reset clears local test buckets before the one-shot credential proof.

## Design specification status

| Surface | Code-native reference direction | Implementation screenshot | Desktop/tablet/mobile | Keyboard/a11y | Console/network | Status |
|---|---|---|---|---|---|---|
| Learner task workspace | shared semantic tokens/components plus current production render; generated image waived under ADR-019 | `artifacts/screenshots/learner/task-revision-desktop.png` directly inspected on 2026-07-20 | fresh production desktop/mobile draft and revision artifacts; no development indicator, clipping or horizontal overflow | Axe and automated keyboard/form coverage pass on exercised states; full manual screen-reader pass remains | strict observer clean in the complete WF-02 production run | 🟣 IN REVIEW |
| Trainer review workbench | shared semantic tokens/components plus current production render; generated image waived under ADR-019 | `artifacts/screenshots/trainer/review-desktop.png` and RU mobile directly inspected on 2026-07-20 | fresh production desktop and 390×844 RU artifacts; controls remain reachable without a horizontal table | Axe and semantic action coverage pass; full manual screen-reader pass remains | strict observer clean through review, stale conflict and learner revision | 🟣 IN REVIEW |
| Trainer question workflow | shared semantic tokens/components plus authoritative server refresh | `artifacts/screenshots/trainer/question-claimed-desktop.png` directly inspected on 2026-07-20 | fresh trainer desktop plus answered mobile; learner answered desktop/mobile also current | accessible polite claim status, Axe clean and stale-concurrency action coverage | strict observer clean through create, claim, stale claim, answer, notify and archive | 🟣 IN REVIEW |
| Admin course editor | shared semantic tokens/components plus current production render; generated image waived under ADR-019 | `artifacts/screenshots/admin/content-version-detail-desktop.png` directly inspected on 2026-07-20 | fresh desktop list/detail/version and EN/DE/RU preview artifacts; full CRUD/mobile editor remains absent | lifecycle controls and previews pass Axe on exercised screens | strict observer clean; the UI explicitly and honestly labels authoring CRUD read-only | 🟡 IN PROGRESS |
| Admin member detail | shared administration shell, privacy-minimized responsive record cards and semantic lifecycle text | pending | EN/DE/RU desktop/tablet/mobile pending | semantic component tests pass; real keyboard/axe pending | production console/network and cross-tenant 404 pending | 🟡 IN PROGRESS |
| Public FAQ | shared public shell and semantic tokens; seven native disclosure topics | pending | desktop/tablet/mobile and header-overflow rerun pending | semantic component tests pass; real keyboard/axe pending | production console/network pending | 🟡 IN PROGRESS |

The Browser/IAB connector is not exposed in this workspace, so rendered verification will use Playwright Chromium as the documented fallback. The user waived generated concept images; final handoff still requires `view_image` inspection of each latest implementation screenshot against the shared design system, current approved reference renders and any separately supplied visual reference.

Existing screenshot filenames are not completion evidence by themselves. The learner task, trainer review, trainer claim and admin version-detail artifacts listed above were regenerated from the 2026-07-20 production build and directly inspected; no development indicator or error overlay remains. `artifacts/screenshots/admin/operations-desktop.png` is a real render but is not a complete admin course-editor artifact, and the editor itself honestly remains read-only for CRUD pending BUG-049.

## Fidelity ledger template

| Check | Design-system/reference evidence | Render evidence | Mismatch | Fix or intentional deviation |
|---|---|---|---|---|
| visible copy/order |  |  |  |  |
| first-viewport layout/container |  |  |  |  |
| typography/control chrome |  |  |  |  |
| palette/status contrast/theme |  |  |  |  |
| spacing/radius/border/shadow |  |  |  |  |
| icon meaning/stroke/alignment |  |  |  |  |
| responsive collapse |  |  |  |  |
| interaction/state feedback |  |  |  |  |

No UI feature is `✅ VERIFIED DONE` until this register points to its screenshots and test evidence.
