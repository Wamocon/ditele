insert into public.task_assessments (
  task_id, question_translations, selection_mode, minimum_selections, maximum_selections
)
values (
  '01980a26-0000-7000-8000-000000000001',
  '{"en":"Which test-design technique is appropriate?","de":"Welche Testentwurfstechnik ist geeignet?","ru":"Какой метод проектирования тестов подходит?"}',
  'single', 1, 1
)
on conflict (task_id) do nothing;

insert into public.task_hints (id, task_id, position, content_translations)
values (
  '01980a29-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001',
  0,
  '{"en":"Start with equivalence partitions and boundaries.","de":"Beginne mit Äquivalenzklassen und Grenzwerten.","ru":"Начните с классов эквивалентности и границ."}'
)
on conflict (id) do nothing;

insert into public.skills (
  id, organization_id, code, labels, descriptions, taxonomy_version, state
)
values (
  '01980a2a-0000-7000-8000-000000000001',
  null,
  'risk-based-test-design',
  '{"en":"Risk-based test design","de":"Risikobasierter Testentwurf","ru":"Тест-дизайн на основе рисков"}',
  '{"en":"Design focused tests from explicit product risks."}',
  1,
  'active'
)
on conflict (id) do nothing;

insert into public.task_skill_mappings (
  id, task_id, skill_id, mapping_version, weight_basis_points, evidence_required
)
values (
  '01980a2e-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001',
  '01980a2a-0000-7000-8000-000000000001',
  1,
  10000,
  true
)
on conflict (id) do nothing;

insert into public.rubrics (
  id, organization_id, code, labels, version, state, created_by
)
values (
  '01980a2b-0000-7000-8000-000000000001',
  null,
  'login-analysis-review',
  '{"en":"Login analysis review","de":"Review der Login-Analyse","ru":"Проверка анализа входа"}',
  1,
  'active',
  '01980a00-0000-7000-8000-000000000003'
)
on conflict (id) do nothing;

insert into public.rubric_criteria (
  id, rubric_id, skill_id, code, labels, position, max_points, required_for_acceptance
)
values (
  '01980a2c-0000-7000-8000-000000000001',
  '01980a2b-0000-7000-8000-000000000001',
  '01980a2a-0000-7000-8000-000000000001',
  'risk-coverage',
  '{"en":"Risk coverage","de":"Risikoabdeckung","ru":"Покрытие рисков"}',
  0,
  10,
  true
)
on conflict (id) do nothing;

insert into public.task_rubric_assignments (
  id, organization_id, task_id, content_version_id, rubric_id, created_by
)
values (
  '01980a2d-0000-7000-8000-000000000001',
  null,
  '01980a26-0000-7000-8000-000000000001',
  '01980a22-0000-7000-8000-000000000001',
  '01980a2b-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000003'
)
on conflict (id) do nothing;

-- Publish only after every seed file has assembled the complete render graph.
-- The lifecycle snapshot intentionally excludes solution rows while retaining
-- assessments, learner hints, and the versioned review rubric.
update public.content_versions
set state = 'in_review'
where id = '01980a22-0000-7000-8000-000000000001'
  and state = 'draft';

update public.content_versions
set state = 'published',
    snapshot = app_private.build_content_snapshot(
      '01980a22-0000-7000-8000-000000000001'
    ),
    published_by = '01980a00-0000-7000-8000-000000000003',
    published_at = statement_timestamp()
where id = '01980a22-0000-7000-8000-000000000001'
  and state = 'in_review';

-- Activate only after the exact pinned version is published. Use the same
-- audited command boundary as the application so the seed proves lifecycle,
-- outbox, notification, and optimistic-version effects.
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);
select * from public.transition_cohort(
  '01980a30-0000-7000-8000-000000000001',
  1,
  'active',
  'Activate the deterministic development cohort after publishing its pinned content version',
  '01980a44-0000-7000-8000-000000000010',
  'seed-cohort-activation-0001'
);
commit;
