begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(47);

-- Structural contracts: global definitions are nullable, exact identities are
-- declarative, and all new read boundaries are actor-derived.
select ok(
  not (
    select column_record.is_nullable = 'NO'
    from information_schema.columns column_record
    where column_record.table_schema = 'public'
      and column_record.table_name = 'rubrics'
      and column_record.column_name = 'organization_id'
  ),
  'global rubrics have an explicit null owner representation'
);

select ok(
  not (
    select column_record.is_nullable = 'NO'
    from information_schema.columns column_record
    where column_record.table_schema = 'public'
      and column_record.table_name = 'task_rubric_assignments'
      and column_record.column_name = 'organization_id'
  ),
  'global task rubric assignments have an explicit null owner representation'
);

select is(
  (
    select pg_catalog.pg_get_constraintdef(constraint_record.oid)
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = 'public.task_rubric_assignments'::regclass
      and constraint_record.conname =
        'task_rubric_assignments_task_version_unique'
  ),
  'UNIQUE (task_id, content_version_id)',
  'one canonical rubric assignment exists for each exact task publication'
);

select is(
  (
    select pg_catalog.pg_get_constraintdef(constraint_record.oid)
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = 'public.mastery_snapshots'::regclass
      and constraint_record.contype = 'p'
  ),
  'PRIMARY KEY (organization_id, learner_id, skill_id)',
  'mastery snapshot identity is tenant-qualified'
);

select ok(
  (
    select column_record.is_nullable = 'NO'
    from information_schema.columns column_record
    where column_record.table_schema = 'public'
      and column_record.table_name = 'questions'
      and column_record.column_name = 'content_version_id'
  ),
  'every question has a mandatory immutable publication pin'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname in (
        'get_submission_review_context',
        'list_my_available_question_contexts',
        'list_my_question_task_contexts'
      )
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
  ),
  3::bigint,
  'all three immutable context functions use fixed-path security-definer boundaries'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_submission_review_context(uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.list_my_available_question_contexts(text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.list_my_question_task_contexts(text)',
    'EXECUTE'
  ),
  'authenticated actors can execute the immutable context boundaries'
);

select ok(
  not has_function_privilege(
    'anon', 'public.get_submission_review_context(uuid,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.list_my_available_question_contexts(text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.list_my_question_task_contexts(text)', 'EXECUTE'
  ),
  'anonymous callers cannot execute immutable member context boundaries'
);

select is(
  (
    select organization_id
    from public.rubrics
    where id = '01980a2b-0000-7000-8000-000000000001'
  ),
  null::uuid,
  'the seeded platform rubric is repaired to global scope'
);

select is(
  (
    select organization_id
    from public.task_rubric_assignments
    where id = '01980a2d-0000-7000-8000-000000000001'
  ),
  null::uuid,
  'the seeded platform assignment follows its global course owner'
);

-- Definition-scope fixtures use draft graphs so ownership validation, rather
-- than the published-graph immutability guard, is the tested boundary.
insert into public.organizations (id, slug, name, state)
values (
  '01980b10-0000-7000-8000-000000000002',
  'other-tenant', 'Other tenant', 'active'
);

insert into public.rubrics (
  id, organization_id, code, labels, version, state, created_by
)
values (
  '01980b2b-0000-7000-8000-000000000002',
  '01980a10-0000-7000-8000-000000000001',
  'tenant-only-rubric', '{"en":"Tenant rubric"}', 1, 'active',
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.courses (
  id, organization_id, slug, state, default_locale, created_by
)
values
  (
    '01980b20-0000-7000-8000-000000000090', null,
    'global-draft-scope', 'draft', 'en',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980b20-0000-7000-8000-000000000091',
    '01980a10-0000-7000-8000-000000000001',
    'tenant-draft-scope', 'draft', 'en',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.content_versions (
  id, course_id, version_number, state, created_by
)
values
  (
    '01980b22-0000-7000-8000-000000000090',
    '01980b20-0000-7000-8000-000000000090', 1, 'draft',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980b22-0000-7000-8000-000000000091',
    '01980b20-0000-7000-8000-000000000091', 1, 'draft',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.stages (
  id, course_id, content_version_id, position, state
)
values
  (
    '01980b23-0000-7000-8000-000000000090',
    '01980b20-0000-7000-8000-000000000090',
    '01980b22-0000-7000-8000-000000000090', 0, 'draft'
  ),
  (
    '01980b23-0000-7000-8000-000000000091',
    '01980b20-0000-7000-8000-000000000091',
    '01980b22-0000-7000-8000-000000000091', 0, 'draft'
  );

insert into public.tasks (
  id, course_id, stage_id, content_version_id, position, state
)
values
  (
    '01980b26-0000-7000-8000-000000000090',
    '01980b20-0000-7000-8000-000000000090',
    '01980b23-0000-7000-8000-000000000090',
    '01980b22-0000-7000-8000-000000000090', 0, 'draft'
  ),
  (
    '01980b26-0000-7000-8000-000000000091',
    '01980b20-0000-7000-8000-000000000091',
    '01980b23-0000-7000-8000-000000000091',
    '01980b22-0000-7000-8000-000000000091', 0, 'draft'
  );

select throws_ok(
  $$
    insert into public.task_rubric_assignments (
      id, organization_id, task_id, content_version_id, rubric_id, created_by
    ) values (
      '01980b2d-0000-7000-8000-000000000090', null,
      '01980b26-0000-7000-8000-000000000090',
      '01980b22-0000-7000-8000-000000000090',
      '01980b2b-0000-7000-8000-000000000002',
      '01980a00-0000-7000-8000-000000000003'
    )
  $$,
  '23514',
  'rubric ownership is incompatible with its course',
  'a global publication cannot depend on a tenant rubric'
);

select lives_ok(
  $$
    insert into public.task_rubric_assignments (
      id, organization_id, task_id, content_version_id, rubric_id, created_by
    ) values (
      '01980b2d-0000-7000-8000-000000000091', null,
      '01980b26-0000-7000-8000-000000000091',
      '01980b22-0000-7000-8000-000000000091',
      '01980a2b-0000-7000-8000-000000000001',
      '01980a00-0000-7000-8000-000000000003'
    )
  $$,
  'a tenant publication may reuse a global rubric definition'
);

select is(
  (
    select organization_id
    from public.task_rubric_assignments
    where id = '01980b2d-0000-7000-8000-000000000091'
  ),
  '01980a10-0000-7000-8000-000000000001'::uuid,
  'trusted legacy bootstrap normalizes an unambiguous assignment owner'
);

select throws_ok(
  $$
    update public.courses
    set organization_id = '01980a10-0000-7000-8000-000000000001'
    where id = '01980b20-0000-7000-8000-000000000090'
  $$,
  '55000',
  'definition ownership is immutable; create a scoped clone',
  'a global course cannot be converted into a tenant definition'
);

select throws_ok(
  $$
    update public.rubrics
    set organization_id = null
    where id = '01980b2b-0000-7000-8000-000000000002'
  $$,
  '55000',
  'definition ownership is immutable; create a scoped clone',
  'a tenant rubric cannot be converted into a global definition'
);

insert into public.task_rubric_assignments (
  id, organization_id, task_id, content_version_id, rubric_id, created_by
)
select
  '01980b2d-0000-7000-8000-000000000099',
  null,
  '01980b26-0000-7000-8000-000000000091',
  '01980b22-0000-7000-8000-000000000091',
  '01980a2b-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000003'
on conflict (task_id, content_version_id) do nothing;

select is(
  (
    select count(*)::bigint
    from public.task_rubric_assignments
    where task_id = '01980b26-0000-7000-8000-000000000091'
      and content_version_id = '01980b22-0000-7000-8000-000000000091'
  ),
  1::bigint,
  'the canonical task-publication key prevents duplicate rubric overlays'
);

-- Reviewer reads remain on the immutable publication snapshot. Production
-- triggers now reject every late normalized rubric mutation, including trusted
-- auth-null sessions; focused denial coverage lives in pgTAP 022.

insert into public.submissions (
  id, organization_id, attempt_id, learner_id, cohort_id, task_id,
  state, latest_version_number
)
values (
  '01980b35-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980a34-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  '01980a30-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001',
  'submitted', 1
);

insert into public.submission_versions (
  id, submission_id, version_number, idempotency_key, answer_text,
  selected_option_ids, evidence_refs, elapsed_seconds, hint_used,
  task_snapshot, submitted_by
)
values (
  '01980b36-0000-7000-8000-000000000001',
  '01980b35-0000-7000-8000-000000000001', 1,
  'exact-review-context-0001', 'Secret learner answer',
  array['01980a28-0000-7000-8000-000000000001'::uuid], '{}',
  300, false,
  '{"task_id":"01980a26-0000-7000-8000-000000000001","content_version_id":"01980a22-0000-7000-8000-000000000001"}',
  '01980a00-0000-7000-8000-000000000001'
);

insert into public.media_assets (
  id, organization_id, owner_id, object_key, media_kind, mime_type,
  byte_size, sha256_hex, state
)
values (
  '01980b50-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  'private/learner-owned-review-evidence', 'document', 'text/plain', 10,
  repeat('a', 64), 'active'
);

-- Build a second valid immutable publication by deriving only safe render data
-- from the seed snapshot and replacing every identity and prerequisite edge.
insert into public.courses (
  id, organization_id, slug, state, default_locale, estimated_minutes, created_by
)
values (
  '01980b20-0000-7000-8000-000000000001', null,
  'prerequisite-course', 'active', 'en', 90,
  '01980a00-0000-7000-8000-000000000003'
);

with source as (
  select snapshot
  from public.content_versions
  where id = '01980a22-0000-7000-8000-000000000001'
), shaped as (
  select jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            source.snapshot,
            '{course,id}',
            to_jsonb('01980b20-0000-7000-8000-000000000001'::text)
          ),
          '{course,slug}', to_jsonb('prerequisite-course'::text)
        ),
        '{content_version,id}',
        to_jsonb('01980b22-0000-7000-8000-000000000001'::text)
      ),
      '{content_version,version_number}', '1'::jsonb
    ),
    '{stages}',
    jsonb_build_array(
      (source.snapshot #> '{stages,0}') || jsonb_build_object(
        'id', '01980b23-0000-7000-8000-000000000001',
        'position', 0,
        'tasks', jsonb_build_array(
          (source.snapshot #> '{stages,0,tasks,0}') || jsonb_build_object(
            'id', '01980b26-0000-7000-8000-000000000001',
            'position', 0,
            'rubric', null,
            'prerequisites', '[]'::jsonb
          ),
          (source.snapshot #> '{stages,0,tasks,0}') || jsonb_build_object(
            'id', '01980b26-0000-7000-8000-000000000002',
            'position', 1,
            'rubric', null,
            'prerequisites', jsonb_build_array(
              jsonb_build_object(
                'id', '01980b2f-0000-7000-8000-000000000001',
                'rule_version', 1,
                'required_task_id',
                  '01980b26-0000-7000-8000-000000000001',
                'required_skill', null,
                'minimum_mastery_basis_points', null
              ),
              jsonb_build_object(
                'id', '01980b2f-0000-7000-8000-000000000002',
                'rule_version', 1,
                'required_task_id', null,
                'required_skill', jsonb_build_object(
                  'id', '01980a2a-0000-7000-8000-000000000001',
                  'code', 'risk-based-test-design',
                  'labels', '{"de":"Risikobasierter Testentwurf","en":"Risk-based test design","ru":"Тест-дизайн на основе рисков"}'::jsonb,
                  'taxonomy_version', 1
                ),
                'minimum_mastery_basis_points', 6000
              )
            )
          )
        )
      )
    )
  ) as snapshot
  from source
)
insert into public.content_versions (
  id, course_id, version_number, state, snapshot, created_by,
  published_by, published_at
)
select
  '01980b22-0000-7000-8000-000000000001',
  '01980b20-0000-7000-8000-000000000001', 1, 'draft',
  shaped.snapshot,
  '01980a00-0000-7000-8000-000000000003',
  '01980a00-0000-7000-8000-000000000003', statement_timestamp()
from shaped;

insert into public.stages (
  id, course_id, content_version_id, position, state
)
values (
  '01980b23-0000-7000-8000-000000000001',
  '01980b20-0000-7000-8000-000000000001',
  '01980b22-0000-7000-8000-000000000001', 0, 'active'
);

insert into public.tasks (
  id, course_id, stage_id, content_version_id, position, state,
  expected_minutes
)
values
  (
    '01980b26-0000-7000-8000-000000000001',
    '01980b20-0000-7000-8000-000000000001',
    '01980b23-0000-7000-8000-000000000001',
    '01980b22-0000-7000-8000-000000000001', 0, 'active', 30
  ),
  (
    '01980b26-0000-7000-8000-000000000002',
    '01980b20-0000-7000-8000-000000000001',
    '01980b23-0000-7000-8000-000000000001',
    '01980b22-0000-7000-8000-000000000001', 1, 'active', 30
  );

insert into public.prerequisites (
  id, organization_id, target_task_id, required_task_id,
  required_skill_id, minimum_mastery_basis_points, rule_version
)
values
  (
    '01980b2f-0000-7000-8000-000000000001', null,
    '01980b26-0000-7000-8000-000000000002',
    '01980b26-0000-7000-8000-000000000001', null, null, 1
  ),
  (
    '01980b2f-0000-7000-8000-000000000002', null,
    '01980b26-0000-7000-8000-000000000002', null,
    '01980a2a-0000-7000-8000-000000000001', 6000, 1
  );

-- Assemble normalized identities before publication now that no fixture bypass
-- remains in the production graph guard.
update public.content_versions
set state = 'in_review'
where id = '01980b22-0000-7000-8000-000000000001';

update public.content_versions
set state = 'published'
where id = '01980b22-0000-7000-8000-000000000001';

select ok(
  app_private.is_valid_learner_content_snapshot(
    (select snapshot from public.content_versions
      where id = '01980b22-0000-7000-8000-000000000001'),
    '01980b20-0000-7000-8000-000000000001',
    'prerequisite-course',
    '01980b22-0000-7000-8000-000000000001', 1
  ),
  'the prerequisite fixture is a valid exact learner publication snapshot'
);

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, created_by
)
values (
  '01980b30-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980b20-0000-7000-8000-000000000001',
  '01980b22-0000-7000-8000-000000000001',
  'Prerequisite cohort', 'active', 'flexible',
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.cohort_memberships (
  id, cohort_id, user_id, role, state, assigned_by
)
values
  (
    '01980b31-0000-7000-8000-000000000001',
    '01980b30-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000001', 'learner', 'active',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980b31-0000-7000-8000-000000000002',
    '01980b30-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000002', 'trainer', 'active',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.enrollments (
  id, organization_id, learner_id, course_id, cohort_id, state,
  idempotency_key, decided_by, decided_at
)
values (
  '01980b33-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  '01980b20-0000-7000-8000-000000000001',
  '01980b30-0000-7000-8000-000000000001', 'assigned',
  'prerequisite-enrollment-0001',
  '01980a00-0000-7000-8000-000000000003', statement_timestamp()
);

-- Learner raw authoring reads fail closed, including media they nominally own.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select concat_ws(':',
      (select count(*) from public.content_versions),
      (select count(*) from public.stages),
      (select count(*) from public.tasks),
      (select count(*) from public.stage_localizations),
      (select count(*) from public.task_localizations),
      (select count(*) from public.task_options),
      (select count(*) from public.task_assessments),
      (select count(*) from public.task_hints)
    )
  ),
  '0:0:0:0:0:0:0:0',
  'a learner cannot browse normalized draft or published authoring rows'
);

select is(
  (
    select concat_ws(':',
      (select count(*) from public.rubrics),
      (select count(*) from public.rubric_criteria),
      (select count(*) from public.task_rubric_assignments),
      (select count(*) from public.bug_categories)
    )
  ),
  '0:0:0:0',
  'a learner cannot browse raw review or category definitions'
);

select is(
  (select count(*)::bigint from public.media_assets),
  0::bigint,
  'ordinary media ownership does not grant a raw storage-metadata read'
);

select is(
  (
    select concat_ws(':',
      (select count(*) from public.task_option_answers),
      (select count(*) from public.task_model_answers)
    )
  ),
  '0:0',
  'assessment correctness and model answers remain hidden from learners'
);

select is(
  public.get_submission_review_context(
    '01980b35-0000-7000-8000-000000000001', 'en'
  ),
  null::jsonb,
  'a learner receives no trainer review context'
);

select is(
  (
    select course_payload #> '{stages,0,activities,1,lock_reasons}'
    from (select public.get_my_learning_course(
      '01980b20-0000-7000-8000-000000000001', 'en'
    ) as course_payload) projection
  ),
  '[{"code":"required_task"},{"code":"required_skill","current_basis_points":0,"minimum_basis_points":6000}]'::jsonb,
  'the exact snapshot reports both unmet task and skill requirements'
);

select is(
  public.get_my_learning_task(
    '01980b26-0000-7000-8000-000000000002'
  ),
  null::jsonb,
  'a locked task has no learner task projection'
);

select throws_ok(
  $$
    select * from public.start_attempt(
      '01980b26-0000-7000-8000-000000000002',
      'locked-target-attempt-0001'
    )
  $$,
  '42501',
  'no active enrollment and available pinned task',
  'a learner cannot start a task with unmet prerequisites'
);

select is(
  (
    select count(*)::bigint
    from public.list_my_available_question_contexts('en') context_record
    where context_record.task_id =
      '01980b26-0000-7000-8000-000000000002'
  ),
  0::bigint,
  'question creation does not offer a locked target task'
);

select throws_ok(
  $$
    select * from public.create_question(
      '01980b30-0000-7000-8000-000000000001',
      '01980b26-0000-7000-8000-000000000002',
      'Locked prerequisite question', 'This must be denied.',
      'locked-prerequisite-question-01',
      '01980b53-0000-7000-8000-000000000001'
    )
  $$,
  '42501',
  'question creation scope denied',
  'the create command repeats the same prerequisite check'
);

select set_config(
  'ditele_test.required_attempt_id',
  (
    select (public.start_attempt(
      '01980b26-0000-7000-8000-000000000001',
      'required-task-attempt-0001'
    )).id::text
  ),
  true
);

select ok(
  current_setting('ditele_test.required_attempt_id')::uuid is not null,
  'the prerequisite task itself can be started from the same exact snapshot'
);

reset role;

update public.attempts
set state = 'submitted', submitted_at = statement_timestamp()
where id = current_setting('ditele_test.required_attempt_id')::uuid;

update public.attempts
set state = 'accepted', accepted_at = statement_timestamp()
where id = current_setting('ditele_test.required_attempt_id')::uuid;

insert into public.submissions (
  id, organization_id, attempt_id, learner_id, cohort_id, task_id,
  state, latest_version_number, accepted_at
)
values (
  '01980b35-0000-7000-8000-000000000010',
  '01980a10-0000-7000-8000-000000000001',
  current_setting('ditele_test.required_attempt_id')::uuid,
  '01980a00-0000-7000-8000-000000000001',
  '01980b30-0000-7000-8000-000000000001',
  '01980b26-0000-7000-8000-000000000001',
  'accepted', 1, statement_timestamp()
);

insert into public.submission_versions (
  id, submission_id, version_number, idempotency_key, answer_text,
  selected_option_ids, evidence_refs, elapsed_seconds, hint_used,
  task_snapshot, submitted_by
)
values (
  '01980b36-0000-7000-8000-000000000010',
  '01980b35-0000-7000-8000-000000000010', 1,
  'required-task-submission-0001', 'Completed prerequisite', '{}', '{}',
  60, false,
  '{"task_id":"01980b26-0000-7000-8000-000000000001","content_version_id":"01980b22-0000-7000-8000-000000000001"}',
  '01980a00-0000-7000-8000-000000000001'
);

-- A mastery record for the same global skill in another tenant must neither
-- collide nor satisfy this tenant's prerequisite.
insert into public.mastery_events (
  id, organization_id, learner_id, skill_id, previous_basis_points,
  new_basis_points, rule_version, rationale, source_event_id
)
values (
  '01980b2e-0000-7000-8000-000000000002',
  '01980b10-0000-7000-8000-000000000002',
  '01980a00-0000-7000-8000-000000000001',
  '01980a2a-0000-7000-8000-000000000001',
  0, 9000, 1, 'Other tenant mastery',
  '01980b53-0000-7000-8000-000000000002'
);

insert into public.mastery_snapshots (
  organization_id, learner_id, skill_id, mastery_basis_points,
  source_event_id, rule_version
)
values (
  '01980b10-0000-7000-8000-000000000002',
  '01980a00-0000-7000-8000-000000000001',
  '01980a2a-0000-7000-8000-000000000001', 9000,
  '01980b2e-0000-7000-8000-000000000002', 1
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select is(
  (
    select course_payload #>>
      '{stages,0,activities,1,lock_reasons,0,code}'
    from (select public.get_my_learning_course(
      '01980b20-0000-7000-8000-000000000001', 'en'
    ) as course_payload) projection
  ),
  'required_skill',
  'mastery from another tenant does not unlock the local task'
);

select is(
  (select count(*)::bigint from public.mastery_snapshots),
  0::bigint,
  'a learner cannot read mastery from a tenant where membership is absent'
);

reset role;

insert into public.mastery_events (
  id, organization_id, learner_id, skill_id, previous_basis_points,
  new_basis_points, rule_version, rationale, source_event_id
)
values (
  '01980b2e-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  '01980a2a-0000-7000-8000-000000000001',
  0, 7000, 1, 'Current tenant mastery',
  '01980b53-0000-7000-8000-000000000003'
);

insert into public.mastery_snapshots (
  organization_id, learner_id, skill_id, mastery_basis_points,
  source_event_id, rule_version
)
values (
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  '01980a2a-0000-7000-8000-000000000001', 7000,
  '01980b2e-0000-7000-8000-000000000001', 1
);

select is(
  (
    select count(*)::bigint
    from public.mastery_snapshots
    where learner_id = '01980a00-0000-7000-8000-000000000001'
      and skill_id = '01980a2a-0000-7000-8000-000000000001'
  ),
  2::bigint,
  'the same learner and global skill can retain independent tenant mastery'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select is(
  (
    select mastery_basis_points
    from public.mastery_snapshots
    where organization_id = '01980a10-0000-7000-8000-000000000001'
      and learner_id = '01980a00-0000-7000-8000-000000000001'
      and skill_id = '01980a2a-0000-7000-8000-000000000001'
  ),
  7000,
  'the learner reads only current-tenant mastery'
);

select is(
  (
    select course_payload #> '{stages,0,activities,1,lock_reasons}'
    from (select public.get_my_learning_course(
      '01980b20-0000-7000-8000-000000000001', 'en'
    ) as course_payload) projection
  ),
  '[]'::jsonb,
  'accepted exact-version task evidence and current-tenant mastery unlock the target'
);

select ok(
  public.get_my_learning_task(
    '01980b26-0000-7000-8000-000000000002'
  ) is not null,
  'the unlocked target now has a safe learner projection'
);

select is(
  (
    select count(*)::bigint
    from public.list_my_available_question_contexts('en') context_record
    where context_record.cohort_id =
        '01980b30-0000-7000-8000-000000000001'
      and context_record.task_id =
        '01980b26-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'the unlocked exact snapshot task becomes an available question context'
);

select lives_ok(
  $$
    select * from public.start_attempt(
      '01980b26-0000-7000-8000-000000000002',
      'unlocked-target-attempt-0001'
    )
  $$,
  'the start command applies the same satisfied prerequisite rules'
);

select lives_ok(
  $$
    select * from public.create_question(
      '01980b30-0000-7000-8000-000000000001',
      '01980b26-0000-7000-8000-000000000002',
      'Unlocked prerequisite question', 'Guide me without the answer.',
      'unlocked-prerequisite-question1',
      '01980b53-0000-7000-8000-000000000004'
    )
  $$,
  'question creation succeeds after the same exact requirements are satisfied'
);

select set_config(
  'ditele_test.question_id',
  (
    select id::text from public.questions
    where idempotency_key = 'unlocked-prerequisite-question1'
  ),
  true
);

select is(
  (
    select content_version_id
    from public.questions
    where id = current_setting('ditele_test.question_id')::uuid
  ),
  '01980b22-0000-7000-8000-000000000001'::uuid,
  'new questions persist their cohort publication pin'
);

select is(
  (
    select task_title
    from public.list_my_question_task_contexts('en') context_record
    where context_record.question_id =
      current_setting('ditele_test.question_id')::uuid
  ),
  'Analyze the login flow',
  'question history resolves its title from the immutable question pin'
);

reset role;

select throws_ok(
  $$
    update public.questions
    set content_version_id = '01980a22-0000-7000-8000-000000000001'
    where id = current_setting('ditele_test.question_id')::uuid
  $$,
  '23514',
  'question publication pin cannot differ from its cohort',
  'a historical question pin cannot be rewritten'
);

select throws_ok(
  $$
    insert into public.questions (
      id, organization_id, learner_id, cohort_id, task_id,
      content_version_id, state, subject, idempotency_key
    ) values (
      '01980b36-0000-7000-8000-000000000099',
      '01980a10-0000-7000-8000-000000000001',
      '01980a00-0000-7000-8000-000000000001',
      '01980b30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      '01980a22-0000-7000-8000-000000000001',
      'open', 'Wrong publication', 'wrong-publication-question-001'
    )
  $$,
  '23514',
  'question task must belong to the exact cohort publication',
  'a question cannot combine a cohort with another publication task'
);

-- Reviewers receive one exact safe snapshot context, not mutable authoring or
-- assessment solution rows.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select set_config(
  'ditele_test.review_context',
  public.get_submission_review_context(
    '01980b35-0000-7000-8000-000000000001', 'de'
  )::text,
  true
);

select is(
  (
    select count(*)::bigint
    from jsonb_object_keys(
      current_setting('ditele_test.review_context')::jsonb
    ) key_record
  ),
  5::bigint,
  'review context exposes only the five reviewed top-level fields'
);

select is(
  current_setting('ditele_test.review_context')::jsonb ->>
    'content_version_id',
  '01980a22-0000-7000-8000-000000000001',
  'review context uses the exact submitted publication version'
);

select is(
  current_setting('ditele_test.review_context')::jsonb ->>
    'submission_version_id',
  '01980b36-0000-7000-8000-000000000001',
  'review context uses the exact latest submission version'
);

select is(
  jsonb_array_length(
    current_setting('ditele_test.review_context')::jsonb #>
      '{rubric,criteria}'
  ),
  1,
  'review rubric criteria are frozen at publication and exclude later normalized rows'
);

select ok(
  current_setting('ditele_test.review_context') not like '%Secret learner answer%'
  and current_setting('ditele_test.review_context') not like '%model_answer%'
  and current_setting('ditele_test.review_context') not like '%is_correct%'
  and current_setting('ditele_test.review_context') not like '%object_key%'
  and current_setting('ditele_test.review_context') not like '%late-normalized-only%',
  'review context contains no answer, correctness, storage, or mutable-definition leakage'
);

select is(
  (
    select pg_catalog.array_agg(version_record.id order by version_record.id)
    from public.content_versions version_record
  ),
  array[
    '01980a22-0000-7000-8000-000000000001'::uuid,
    '01980b22-0000-7000-8000-000000000001'::uuid
  ],
  'trainer raw content-version access is limited to exact active cohort pins'
);

select * from finish();
rollback;
