begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname in (
        'submit_content_for_review', 'decide_content_review',
        'publish_content_version', 'archive_content_version',
        'get_content_archive_impact'
      )
  ),
  5::bigint,
  'all four lifecycle RPCs and the archive-impact read contract exist'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname in (
        'submit_content_for_review', 'decide_content_review',
        'publish_content_version', 'archive_content_version',
        'get_content_archive_impact'
      )
      and procedure_row.prosecdef
      and procedure_row.proconfig = array['search_path=""']::text[]
  ),
  5::bigint,
  'every content lifecycle contract is security-definer with an empty fixed search path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.submit_content_for_review(uuid,bigint,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.decide_content_review(uuid,bigint,text,text,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.publish_content_version(uuid,bigint,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.archive_content_version(uuid,bigint,text,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated callers can execute the lifecycle RPCs'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.submit_content_for_review(uuid,bigint,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.decide_content_review(uuid,bigint,text,text,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.publish_content_version(uuid,bigint,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.archive_content_version(uuid,bigint,text,text,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.get_content_archive_impact(uuid)', 'EXECUTE'
  ),
  'anonymous callers cannot execute lifecycle or impact contracts'
);

select ok(
  not has_table_privilege('authenticated', 'public.content_reviews', 'INSERT')
  and not has_table_privilege('authenticated', 'public.content_reviews', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.content_reviews', 'DELETE'),
  'authenticated callers cannot bypass append-only review RPCs'
);

select ok(
  not has_table_privilege(
    'authenticated', 'public.content_workflow_receipts', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.content_workflow_receipts', 'INSERT'
  )
  and not has_table_privilege(
    'authenticated', 'public.content_workflow_receipts', 'UPDATE'
  )
  and not has_table_privilege(
    'authenticated', 'public.content_workflow_receipts', 'DELETE'
  ),
  'idempotency receipts are fail-closed behind lifecycle functions'
);

select has_column(
  'public', 'media_assets', 'content_version_id',
  'attached media has explicit content-version ownership'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes index_row
    where index_row.schemaname = 'public'
      and index_row.indexname = 'stages_version_position_uidx'
      and index_row.indexdef like '%WHERE (content_version_id IS NOT NULL)%'
  )
  and exists (
    select 1
    from pg_catalog.pg_indexes index_row
    where index_row.schemaname = 'public'
      and index_row.indexname = 'stages_legacy_course_position_uidx'
      and index_row.indexdef like '%WHERE (content_version_id IS NULL)%'
  ),
  'stage ordering has separate versioned and explicit legacy uniqueness rules'
);

insert into public.content_versions (
  id, course_id, version_number, state, change_summary, created_by
)
values
  (
    '01980a22-0000-7000-8000-000000000002',
    '01980a20-0000-7000-8000-000000000001',
    2, 'draft', 'Version two lifecycle fixture',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a22-0000-7000-8000-000000000003',
    '01980a20-0000-7000-8000-000000000001',
    3, 'draft', 'Intentionally incomplete fixture',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.stages (
  id, course_id, content_version_id, position, state
)
values
  (
    '01980a23-0000-7000-8000-000000000003',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000002', 1, 'draft'
  ),
  (
    '01980a23-0000-7000-8000-000000000002',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000002', 0, 'draft'
  );

insert into public.stage_localizations (
  id, stage_id, locale, title, description_html
)
values
  ('01980a24-0000-7000-8000-000000000021', '01980a23-0000-7000-8000-000000000002', 'en', 'Version two stage A', '<p>Stage A</p>'),
  ('01980a24-0000-7000-8000-000000000022', '01980a23-0000-7000-8000-000000000002', 'de', 'Version zwei Stufe A', '<p>Stufe A</p>'),
  ('01980a24-0000-7000-8000-000000000023', '01980a23-0000-7000-8000-000000000002', 'ru', 'Версия два этап A', '<p>Этап A</p>'),
  ('01980a24-0000-7000-8000-000000000031', '01980a23-0000-7000-8000-000000000003', 'en', 'Version two stage B', '<p>Stage B</p>'),
  ('01980a24-0000-7000-8000-000000000032', '01980a23-0000-7000-8000-000000000003', 'de', 'Version zwei Stufe B', '<p>Stufe B</p>'),
  ('01980a24-0000-7000-8000-000000000033', '01980a23-0000-7000-8000-000000000003', 'ru', 'Версия два этап B', '<p>Этап B</p>');

insert into public.tasks (
  id, course_id, stage_id, content_version_id, position, task_kind,
  state, expected_minutes
)
values
  (
    '01980a26-0000-7000-8000-000000000003',
    '01980a20-0000-7000-8000-000000000001',
    '01980a23-0000-7000-8000-000000000003',
    '01980a22-0000-7000-8000-000000000002',
    0, 'practical', 'draft', 30
  ),
  (
    '01980a26-0000-7000-8000-000000000002',
    '01980a20-0000-7000-8000-000000000001',
    '01980a23-0000-7000-8000-000000000002',
    '01980a22-0000-7000-8000-000000000002',
    0, 'knowledge', 'draft', 15
  );

insert into public.task_skill_mappings (
  id, task_id, skill_id, mapping_version, weight_basis_points,
  evidence_required
)
values
  (
    '01980a2e-0000-7000-8000-000000000002',
    '01980a26-0000-7000-8000-000000000002',
    '01980a2a-0000-7000-8000-000000000001',
    1, 10000, true
  ),
  (
    '01980a2e-0000-7000-8000-000000000003',
    '01980a26-0000-7000-8000-000000000003',
    '01980a2a-0000-7000-8000-000000000001',
    1, 10000, true
  );

insert into public.task_localizations (
  id, task_id, locale, title, instructions_html, hint_text
)
values
  ('01980a27-0000-7000-8000-000000000021', '01980a26-0000-7000-8000-000000000002', 'en', 'Version two knowledge task', '<p>Choose the effective technique.</p>', 'Consider boundaries.'),
  ('01980a27-0000-7000-8000-000000000022', '01980a26-0000-7000-8000-000000000002', 'de', 'Wissensaufgabe Version zwei', '<p>Wähle die wirksame Technik.</p>', 'Denke an Grenzen.'),
  ('01980a27-0000-7000-8000-000000000023', '01980a26-0000-7000-8000-000000000002', 'ru', 'Задание версии два', '<p>Выберите эффективный метод.</p>', 'Учитывайте границы.'),
  ('01980a27-0000-7000-8000-000000000031', '01980a26-0000-7000-8000-000000000003', 'en', 'Version two practical task', '<p>Write the evidence-based analysis.</p>', null),
  ('01980a27-0000-7000-8000-000000000032', '01980a26-0000-7000-8000-000000000003', 'de', 'Praktische Aufgabe Version zwei', '<p>Schreibe die evidenzbasierte Analyse.</p>', null),
  ('01980a27-0000-7000-8000-000000000033', '01980a26-0000-7000-8000-000000000003', 'ru', 'Практическое задание версии два', '<p>Напишите анализ на основе доказательств.</p>', null);

insert into public.task_model_answers (task_localization_id, model_answer)
values (
  '01980a27-0000-7000-8000-000000000021',
  'VERSION_TWO_PRIVILEGED_MODEL_ANSWER'
);

insert into public.task_options (id, task_id, option_key, labels, position)
values
  (
    '01980a28-0000-7000-8000-000000000003',
    '01980a26-0000-7000-8000-000000000002', 'random',
    '{"en":"Random","de":"Zufällig","ru":"Случайно"}', 1
  ),
  (
    '01980a28-0000-7000-8000-000000000004',
    '01980a26-0000-7000-8000-000000000002', 'boundary',
    '{"en":"Boundary","de":"Grenzwert","ru":"Граница"}', 0
  );

insert into public.task_option_answers (task_option_id, is_correct)
values
  ('01980a28-0000-7000-8000-000000000003', false),
  ('01980a28-0000-7000-8000-000000000004', true);

insert into public.task_assessments (
  task_id, question_translations, selection_mode,
  minimum_selections, maximum_selections
)
values (
  '01980a26-0000-7000-8000-000000000002',
  '{"en":"Which technique?","de":"Welche Technik?","ru":"Какой метод?"}',
  'single', 1, 1
);

insert into public.task_hints (id, task_id, position, content_translations)
values (
  '01980a29-0000-7000-8000-000000000002',
  '01980a26-0000-7000-8000-000000000002', 0,
  '{"en":"Think about edges.","de":"Denke an Ränder.","ru":"Подумайте о границах."}'
);

insert into public.task_rubric_assignments (
  id, organization_id, task_id, content_version_id, rubric_id, created_by
)
values
  (
    '01980a2d-0000-7000-8000-000000000002',
    '01980a10-0000-7000-8000-000000000001',
    '01980a26-0000-7000-8000-000000000002',
    '01980a22-0000-7000-8000-000000000002',
    '01980a2b-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a2d-0000-7000-8000-000000000003',
    '01980a10-0000-7000-8000-000000000001',
    '01980a26-0000-7000-8000-000000000003',
    '01980a22-0000-7000-8000-000000000002',
    '01980a2b-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.media_assets (
  id, stage_id, object_key, media_kind, mime_type, byte_size, sha256_hex, state
)
values (
  '01980a2f-0000-7000-8000-000000000002',
  '01980a23-0000-7000-8000-000000000002',
  'courses/version-two/stage-a.mp4', 'video', 'video/mp4', 1024,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'active'
);

select is(
  (
    select count(*)::bigint
    from public.stages
    where course_id = '01980a20-0000-7000-8000-000000000001'
      and position = 0
      and content_version_id is not null
  ),
  2::bigint,
  'multiple content versions safely own a position-zero stage'
);

insert into public.stages (id, course_id, position, state)
values (
  '01980a23-0000-7000-8000-000000000020',
  '01980a20-0000-7000-8000-000000000001', 20, 'draft'
);

select throws_ok(
  $$
    insert into public.stages (id, course_id, position, state)
    values (
      '01980a23-0000-7000-8000-000000000021',
      '01980a20-0000-7000-8000-000000000001', 20, 'draft'
    )
  $$,
  '23505',
  null,
  'legacy null-version stage positions remain unique per course'
);

select throws_ok(
  $$
    insert into public.stages (
      id, course_id, content_version_id, position, state
    ) values (
      '01980a23-0000-7000-8000-000000000099',
      '01980a20-0000-7000-8000-000000000099',
      '01980a22-0000-7000-8000-000000000002', 0, 'draft'
    )
  $$,
  '23514',
  'stage content version must belong to the same course',
  'a stage cannot cross its course and content-version chain'
);

select throws_ok(
  $$
    insert into public.tasks (
      id, course_id, stage_id, content_version_id, position, task_kind, state
    ) values (
      '01980a26-0000-7000-8000-000000000099',
      '01980a20-0000-7000-8000-000000000001',
      '01980a23-0000-7000-8000-000000000002',
      '01980a22-0000-7000-8000-000000000001',
      1, 'practical', 'draft'
    )
  $$,
  '23514',
  'task and stage must belong to the same content version',
  'a task cannot cross its stage content version'
);

select is(
  (
    select content_version_id
    from public.media_assets
    where id = '01980a2f-0000-7000-8000-000000000002'
  ),
  '01980a22-0000-7000-8000-000000000002'::uuid,
  'stage media derives the same explicit content version'
);

-- A second tenant proves that an organization-scoped content role is not
-- transferable merely because the actor is an active member elsewhere.
insert into public.organizations (id, slug, name, state)
values (
  '01980a10-0000-7000-8000-000000000099',
  'content-lifecycle-other', 'Content Lifecycle Other', 'active'
);

insert into public.organization_memberships (
  id, organization_id, user_id, state, joined_at
)
values (
  '01980a11-0000-7000-8000-000000000099',
  '01980a10-0000-7000-8000-000000000099',
  '01980a00-0000-7000-8000-000000000002',
  'active', statement_timestamp()
);

insert into public.user_roles (
  id, user_id, role_id, organization_id, reason
)
select
  '01980a12-0000-7000-8000-000000000099',
  '01980a00-0000-7000-8000-000000000002',
  role_row.id,
  '01980a10-0000-7000-8000-000000000001',
  'content lifecycle tenant-isolation fixture'
from public.roles role_row
where role_row.code = 'content_admin';

insert into public.courses (
  id, organization_id, slug, state, default_locale, created_by
)
values (
  '01980a20-0000-7000-8000-000000000099',
  '01980a10-0000-7000-8000-000000000099',
  'content-other-tenant', 'draft', 'en',
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.content_versions (
  id, course_id, version_number, state, change_summary, created_by
)
values (
  '01980a22-0000-7000-8000-000000000099',
  '01980a20-0000-7000-8000-000000000099',
  1, 'draft', 'Cross-tenant fixture',
  '01980a00-0000-7000-8000-000000000003'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$
    select * from public.submit_content_for_review(
      '01980a22-0000-7000-8000-000000000002', 1,
      'content-submit-no-session-001',
      '01980a50-0000-7000-8000-000000000001'
    )
  $$,
  '42501',
  'authentication required',
  'content submission rejects a missing session'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$
    select * from public.submit_content_for_review(
      '01980a22-0000-7000-8000-000000000002', 1,
      'content-submit-learner-denied-01',
      '01980a50-0000-7000-8000-000000000002'
    )
  $$,
  '42501',
  'content management scope denied',
  'a learner cannot submit content for review'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$
    select * from public.submit_content_for_review(
      '01980a22-0000-7000-8000-000000000099', 1,
      'content-submit-cross-tenant-001',
      '01980a50-0000-7000-8000-000000000003'
    )
  $$,
  '42501',
  'content management scope denied',
  'an organization-scoped content role cannot cross tenant boundaries'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select throws_ok(
  $$
    select * from public.submit_content_for_review(
      '01980a22-0000-7000-8000-000000000003', 1,
      'content-submit-incomplete-0001',
      '01980a50-0000-7000-8000-000000000004'
    )
  $$,
  '23514',
  'at least one version-owned stage is required',
  'incomplete content cannot enter review'
);

reset role;
delete from public.task_option_answers
where task_option_id = '01980a28-0000-7000-8000-000000000004';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select throws_ok(
  $$
    select * from public.submit_content_for_review(
      '01980a22-0000-7000-8000-000000000002', 1,
      'content-submit-invalid-answer-1',
      '01980a50-0000-7000-8000-000000000005'
    )
  $$,
  '23514',
  'assessment options, selections and translations are incomplete',
  'an assessment with a missing correctness record cannot enter review'
);

reset role;
insert into public.task_option_answers (task_option_id, is_correct)
values ('01980a28-0000-7000-8000-000000000004', true);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select lives_ok(
  $$
    select * from public.submit_content_for_review(
      '01980a22-0000-7000-8000-000000000002', 1,
      'content-submit-idempotent-0001',
      '01980a50-0000-7000-8000-000000000006'
    )
  $$,
  'complete content enters review atomically'
);

select is(
  (
    select state::text || ':' || row_version::text
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  'in_review:2',
  'review submission advances named state and CAS version'
);

select lives_ok(
  $$
    select * from public.submit_content_for_review(
      '01980a22-0000-7000-8000-000000000002', 1,
      'content-submit-idempotent-0001',
      '01980a50-0000-7000-8000-000000000007'
    )
  $$,
  'same-payload review submission replay is safe after the state advances'
);

select throws_ok(
  $$
    select * from public.submit_content_for_review(
      '01980a22-0000-7000-8000-000000000002', 2,
      'content-submit-idempotent-0001',
      '01980a50-0000-7000-8000-000000000008'
    )
  $$,
  '22023',
  'idempotency key was reused with a different content payload',
  'same key with a different review-submission payload is rejected'
);

select is(
  (
    select count(*)::bigint
    from public.audit_events
    where event_type = 'content.review_submitted'
      and aggregate_id = '01980a22-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'review submission writes exactly one audit event'
);

select is(
  (
    select count(*)::bigint
    from public.outbox_events
    where event_type = 'content.review_submitted.v1'
      and aggregate_id = '01980a22-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'review submission writes exactly one outbox event'
);

select throws_ok(
  $$
    select * from public.publish_content_version(
      '01980a22-0000-7000-8000-000000000002', 2,
      'content-publish-needs-review-01',
      '01980a50-0000-7000-8000-000000000009'
    )
  $$,
  '23514',
  'an approved current content review is required before publication',
  'publication requires an approved latest review'
);

select lives_ok(
  $$
    select * from public.decide_content_review(
      '01980a22-0000-7000-8000-000000000002', 2,
      'changes_requested', 'Add clearer learner instructions',
      'content-review-changes-000001',
      '01980a50-0000-7000-8000-000000000024'
    )
  $$,
  'publisher can request content changes atomically'
);

select is(
  (
    select state::text || ':' || row_version::text
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  'draft:3',
  'changes requested returns content to draft with a new CAS version'
);

select lives_ok(
  $$
    select * from public.submit_content_for_review(
      '01980a22-0000-7000-8000-000000000002', 3,
      'content-resubmit-review-000001',
      '01980a50-0000-7000-8000-000000000025'
    )
  $$,
  'corrected content can be resubmitted for review'
);

select is(
  (
    select state::text || ':' || row_version::text
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  'in_review:4',
  'content resubmission returns to review with a new CAS version'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$
    select * from public.decide_content_review(
      '01980a22-0000-7000-8000-000000000002', 4,
      'approved', 'Learner cannot approve',
      'content-review-learner-denied-01',
      '01980a50-0000-7000-8000-000000000010'
    )
  $$,
  '42501',
  'content publication scope denied',
  'a learner cannot decide a content review'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select throws_ok(
  $$
    select * from public.decide_content_review(
      '01980a22-0000-7000-8000-000000000002', 3,
      'approved', 'Stale review decision',
      'content-review-stale-version-01',
      '01980a50-0000-7000-8000-000000000011'
    )
  $$,
  '40001',
  'content version is stale or not in review',
  'stale review CAS is rejected'
);

select lives_ok(
  $$
    select * from public.decide_content_review(
      '01980a22-0000-7000-8000-000000000002', 4,
      'approved', 'Approved after complete review',
      'content-review-approve-000001',
      '01980a50-0000-7000-8000-000000000012'
    )
  $$,
  'publisher approves the current content fingerprint'
);

select is(
  (
    select state::text || ':' || row_version::text
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  'in_review:5',
  'approval remains in review while advancing aggregate version'
);

select is(
  (
    select count(*)::bigint
    from public.content_reviews
    where content_version_id = '01980a22-0000-7000-8000-000000000002'
      and decision = 'approved'
      and content_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  1::bigint,
  'approval appends one fingerprint-bound review'
);

select lives_ok(
  $$
    select * from public.decide_content_review(
      '01980a22-0000-7000-8000-000000000002', 4,
      'approved', 'Approved after complete review',
      'content-review-approve-000001',
      '01980a50-0000-7000-8000-000000000013'
    )
  $$,
  'same-payload review decision replay is safe'
);

select throws_ok(
  $$
    select * from public.decide_content_review(
      '01980a22-0000-7000-8000-000000000002', 4,
      'approved', 'Different approval comment',
      'content-review-approve-000001',
      '01980a50-0000-7000-8000-000000000014'
    )
  $$,
  '22023',
  'idempotency key was reused with a different content payload',
  'same review key with a different comment is rejected'
);

select is(
  (
    select count(*)::bigint
    from public.audit_events
    where event_type = 'content.review_decided'
      and aggregate_id = '01980a22-0000-7000-8000-000000000002'
  ),
  2::bigint,
  'changes requested and approval each write exactly one review audit event'
);

select is(
  (
    select count(*)::bigint
    from public.outbox_events
    where event_type = 'content.review_decided.v1'
      and aggregate_id = '01980a22-0000-7000-8000-000000000002'
  ),
  2::bigint,
  'changes requested and approval each write exactly one review outbox event'
);

update public.task_localizations
set title = 'Changed after approval'
where id = '01980a27-0000-7000-8000-000000000021';

select throws_ok(
  $$
    select * from public.publish_content_version(
      '01980a22-0000-7000-8000-000000000002', 5,
      'content-publish-fingerprint-stale',
      '01980a50-0000-7000-8000-000000000015'
    )
  $$,
  '23514',
  'an approved current content review is required before publication',
  'a graph edit after approval invalidates the review fingerprint'
);

update public.task_localizations
set title = 'Version two knowledge task'
where id = '01980a27-0000-7000-8000-000000000021';

select lives_ok(
  $$
    select * from public.publish_content_version(
      '01980a22-0000-7000-8000-000000000002', 5,
      'content-publish-idempotent-001',
      '01980a50-0000-7000-8000-000000000016'
    )
  $$,
  'approved current content publishes atomically'
);

select is(
  (
    select state::text || ':' || row_version::text
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  'published:6',
  'publication advances state and CAS version exactly once'
);

select lives_ok(
  $$
    select * from public.publish_content_version(
      '01980a22-0000-7000-8000-000000000002', 5,
      'content-publish-idempotent-001',
      '01980a50-0000-7000-8000-000000000017'
    )
  $$,
  'same-payload publication replay is safe'
);

select throws_ok(
  $$
    select * from public.publish_content_version(
      '01980a22-0000-7000-8000-000000000002', 6,
      'content-publish-idempotent-001',
      '01980a50-0000-7000-8000-000000000018'
    )
  $$,
  '22023',
  'idempotency key was reused with a different content payload',
  'same publication key with a different CAS payload is rejected'
);

select is(
  (
    select snapshot #>> '{schema_version}'
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  '1',
  'publication stores a versioned render snapshot'
);

select is(
  (
    select jsonb_array_length(snapshot #> '{course,localizations}')
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  3,
  'snapshot contains all EN, DE and RU course localizations'
);

select is(
  (
    select (snapshot #>> '{stages,0,position}')
      || ':' || (snapshot #>> '{stages,1,position}')
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  '0:1',
  'snapshot stages are deterministic by position'
);

select is(
  (
    select (snapshot #>> '{stages,0,tasks,0,options,0,option_key}')
      || ':' || (snapshot #>> '{stages,0,tasks,0,options,1,option_key}')
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  'boundary:random',
  'snapshot options are deterministic by position rather than insertion order'
);

select ok(
  (
    select snapshot::text !~* 'model_answer|is_correct|correctness|VERSION_TWO_PRIVILEGED_MODEL_ANSWER'
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  'render snapshot exposes neither correctness nor model answers'
);

select is(
  (
    select snapshot #>> '{stages,0,media,0,object_key}'
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  'courses/version-two/stage-a.mp4',
  'snapshot includes deterministic version-owned stage media'
);

select is(
  (
    select count(*)::bigint
    from public.audit_events
    where event_type = 'content.version_published'
      and aggregate_id = '01980a22-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'publication writes exactly one audit event'
);

select is(
  (
    select count(*)::bigint
    from public.outbox_events
    where event_type = 'content.version_published.v1'
      and aggregate_id = '01980a22-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'publication writes exactly one outbox event'
);

select throws_ok(
  $$update public.content_versions set change_summary = 'forbidden'
    where id = '01980a22-0000-7000-8000-000000000002'$$,
  '55000', 'published content versions are immutable',
  'published snapshots and metadata cannot be changed directly'
);

select throws_ok(
  $$update public.content_versions set state = 'archived'
    where id = '01980a22-0000-7000-8000-000000000002'$$,
  '55000', 'published content versions are immutable',
  'published to archived cannot bypass the audited RPC'
);

select throws_ok(
  $$insert into public.stages (
      id, course_id, content_version_id, position, state
    ) values (
      '01980a23-0000-7000-8000-000000000022',
      '01980a20-0000-7000-8000-000000000001',
      '01980a22-0000-7000-8000-000000000002', 2, 'active'
    )$$,
  '55000', 'published content graph is immutable',
  'published graph rejects new parent rows'
);

select throws_ok(
  $$update public.stages set state = 'inactive'
    where id = '01980a23-0000-7000-8000-000000000002'$$,
  '55000', 'published content graph is immutable',
  'published stage rows are immutable'
);

select throws_ok(
  $$update public.stage_localizations set title = 'forbidden'
    where id = '01980a24-0000-7000-8000-000000000021'$$,
  '55000', 'published content graph is immutable',
  'published stage localizations are immutable'
);

select throws_ok(
  $$update public.tasks set expected_minutes = 99
    where id = '01980a26-0000-7000-8000-000000000002'$$,
  '55000', 'published content graph is immutable',
  'published tasks are immutable'
);

select throws_ok(
  $$update public.task_localizations set title = 'forbidden'
    where id = '01980a27-0000-7000-8000-000000000021'$$,
  '55000', 'published content graph is immutable',
  'published task localizations are immutable'
);

select throws_ok(
  $$update public.task_options set option_key = 'forbidden'
    where id = '01980a28-0000-7000-8000-000000000004'$$,
  '55000', 'published content graph is immutable',
  'published options are immutable'
);

select throws_ok(
  $$update public.task_option_answers set is_correct = false
    where task_option_id = '01980a28-0000-7000-8000-000000000004'$$,
  '55000', 'published content graph is immutable',
  'published correctness solutions are immutable'
);

select throws_ok(
  $$update public.task_model_answers set model_answer = 'forbidden'
    where task_localization_id = '01980a27-0000-7000-8000-000000000021'$$,
  '55000', 'published content graph is immutable',
  'published model answers are immutable'
);

select throws_ok(
  $$update public.task_assessments set minimum_selections = 1
    where task_id = '01980a26-0000-7000-8000-000000000002'$$,
  '55000', 'published content graph is immutable',
  'published assessment metadata is immutable'
);

select throws_ok(
  $$delete from public.task_hints
    where id = '01980a29-0000-7000-8000-000000000002'$$,
  '55000', 'published content graph is immutable',
  'published hints are immutable'
);

select throws_ok(
  $$delete from public.task_rubric_assignments
    where id = '01980a2d-0000-7000-8000-000000000002'$$,
  '55000', 'published content graph is immutable',
  'published rubric assignments are immutable'
);

select throws_ok(
  $$update public.media_assets set object_key = 'forbidden.mp4'
    where id = '01980a2f-0000-7000-8000-000000000002'$$,
  '55000', 'published content graph is immutable',
  'published attached media is immutable'
);

reset role;

select throws_ok(
  $$update public.content_reviews set comment = 'forbidden' where content_version_id =
    '01980a22-0000-7000-8000-000000000002'$$,
  '55000', 'content_reviews is append-only',
  'content review history is append-only even for the database owner'
);

select throws_ok(
  $$update public.content_workflow_receipts set result_row_version = 99
    where content_version_id = '01980a22-0000-7000-8000-000000000002'$$,
  '55000', 'content_workflow_receipts is append-only',
  'idempotency receipts are immutable'
);

create temporary table content_lifecycle_test_state (
  snapshot jsonb not null,
  impact_fingerprint text
) on commit drop;

grant select on content_lifecycle_test_state to authenticated;

insert into content_lifecycle_test_state (snapshot)
select snapshot from public.content_versions
where id = '01980a22-0000-7000-8000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$select public.get_content_archive_impact(
    '01980a22-0000-7000-8000-000000000002'
  )$$,
  '42501', 'content publication scope denied',
  'a learner cannot inspect archive impact'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select ok(
  public.get_content_archive_impact(
    '01980a22-0000-7000-8000-000000000002'
  ) ->> 'fingerprint' ~ '^[0-9a-f]{64}$',
  'authorized publisher receives a deterministic archive-impact fingerprint'
);

reset role;
update content_lifecycle_test_state
set impact_fingerprint = public.get_content_archive_impact(
  '01980a22-0000-7000-8000-000000000002'
) ->> 'fingerprint';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select throws_ok(
  $$select * from public.archive_content_version(
      '01980a22-0000-7000-8000-000000000002', 6,
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'Archive after impact confirmation',
      'content-archive-wrong-impact-01',
      '01980a50-0000-7000-8000-000000000019'
    )$$,
  '40001', 'content archive impact confirmation is stale',
  'archive rejects a stale or forged impact fingerprint'
);

select throws_ok(
  $$select * from public.archive_content_version(
      '01980a22-0000-7000-8000-000000000002', 6,
      (select impact_fingerprint from content_lifecycle_test_state),
      ' ', 'content-archive-missing-reason-1',
      '01980a50-0000-7000-8000-000000000020'
    )$$,
  '22023',
  'valid impact confirmation, reason, CAS and idempotency key are required',
  'archive requires an explicit nonblank reason'
);

select lives_ok(
  $$select * from public.archive_content_version(
      '01980a22-0000-7000-8000-000000000002', 6,
      (select impact_fingerprint from content_lifecycle_test_state),
      'Archive after impact confirmation',
      'content-archive-idempotent-001',
      '01980a50-0000-7000-8000-000000000021'
    )$$,
  'published content archives only through confirmed audited RPC'
);

select is(
  (
    select state::text || ':' || row_version::text
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  'archived:7',
  'archive advances the named state and CAS version'
);

select lives_ok(
  $$select * from public.archive_content_version(
      '01980a22-0000-7000-8000-000000000002', 6,
      (select impact_fingerprint from content_lifecycle_test_state),
      'Archive after impact confirmation',
      'content-archive-idempotent-001',
      '01980a50-0000-7000-8000-000000000022'
    )$$,
  'same-payload archive replay is safe after the state advances'
);

select throws_ok(
  $$select * from public.archive_content_version(
      '01980a22-0000-7000-8000-000000000002', 6,
      (select impact_fingerprint from content_lifecycle_test_state),
      'Different archive reason',
      'content-archive-idempotent-001',
      '01980a50-0000-7000-8000-000000000023'
    )$$,
  '22023', 'idempotency key was reused with a different content payload',
  'same archive key with a different reason is rejected'
);

reset role;

select is(
  (
    select count(*)::bigint
    from public.audit_events
    where event_type = 'content.version_archived'
      and aggregate_id = '01980a22-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'archive writes exactly one audit event'
);

select is(
  (
    select count(*)::bigint
    from public.outbox_events
    where event_type = 'content.version_archived.v1'
      and aggregate_id = '01980a22-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'archive writes exactly one outbox event'
);

select is(
  (
    select count(*)::bigint
    from public.content_workflow_receipts
    where content_version_id = '01980a22-0000-7000-8000-000000000002'
  ),
  6::bigint,
  'each accepted submit, review, publish and archive request has one immutable receipt'
);

select is(
  (
    select snapshot
    from public.content_versions
    where id = '01980a22-0000-7000-8000-000000000002'
  ),
  (select snapshot from content_lifecycle_test_state),
  'archive preserves the immutable published snapshot'
);

select is(
  (
    select count(*)::bigint
    from public.stages
    where content_version_id = '01980a22-0000-7000-8000-000000000002'
  ),
  2::bigint,
  'archive preserves the render graph instead of deleting it'
);

select throws_ok(
  $$delete from public.tasks
    where id = '01980a26-0000-7000-8000-000000000003'$$,
  '55000', 'published content graph is immutable',
  'archived render graph remains immutable'
);

select is(
  (
    select state::text from public.courses
    where id = '01980a20-0000-7000-8000-000000000001'
  ),
  'active',
  'archiving one version keeps the course active while an older publication remains'
);

select * from finish();
rollback;
