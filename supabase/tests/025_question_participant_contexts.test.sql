begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(13);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname =
        'list_my_question_participant_contexts'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = ''
      and pg_catalog.pg_get_function_result(procedure_record.oid) =
        'TABLE(question_id uuid, user_id uuid, display_name text)'
  ),
  1::bigint,
  'one exact question participant projection signature exists'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_catalog.pg_roles owner_record
      on owner_record.oid = procedure_record.proowner
    where namespace_record.nspname = 'public'
      and procedure_record.proname =
        'list_my_question_participant_contexts'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = ''
      and procedure_record.provolatile = 's'
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
      and owner_record.rolname = 'postgres'
  ),
  1::bigint,
  'the projection is a postgres-owned stable security-definer with an empty search path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_my_question_participant_contexts()',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.list_my_question_participant_contexts()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.list_my_question_participant_contexts()',
    'EXECUTE'
  ),
  'only authenticated and service API roles receive execute access'
);

select ok(
  (
    select
      pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%app_private.can_access_question(question_record.id)%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%question_record.learner_id%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%question_record.assigned_trainer_id%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%public.question_messages%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%public.question_transfers%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%profile_record.display_name%'
      and position(
        'email' in lower(pg_catalog.pg_get_functiondef(procedure_record.oid))
      ) = 0
      and position(
        'auth.users' in lower(
          pg_catalog.pg_get_functiondef(procedure_record.oid)
        )
      ) = 0
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname =
        'list_my_question_participant_contexts'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = ''
  ),
  'the projection uses the canonical scope and only participant display names'
);

-- Isolated actors ensure same-tenant, cross-tenant, and no-membership checks do
-- not accidentally inherit authority from the four deterministic role users.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', fixture.user_id,
  'authenticated', 'authenticated', fixture.email,
  extensions.crypt('Question-Context-Test!', extensions.gen_salt('bf')),
  statement_timestamp(),
  '{"provider":"email","providers":["email"],"seed_fixture":"true"}'::jsonb,
  jsonb_build_object('display_name', fixture.display_name, 'locale', 'en'),
  statement_timestamp(), statement_timestamp(), '', '', '', ''
from (values
  (
    '01981100-0000-7000-8000-000000000001'::uuid,
    'question-other-learner@test.invalid',
    'Other Learner'
  ),
  (
    '01981100-0000-7000-8000-000000000002'::uuid,
    'question-cross-tenant@test.invalid',
    'Cross Tenant Learner'
  ),
  (
    '01981100-0000-7000-8000-000000000003'::uuid,
    'question-unauthorized@test.invalid',
    'Unauthorized User'
  ),
  (
    '01981100-0000-7000-8000-000000000004'::uuid,
    'question-transfer-target@test.invalid',
    'Tara Transfer Target'
  )
) as fixture(user_id, email, display_name);

insert into public.organizations (id, slug, name, state)
values (
  '01981110-0000-7000-8000-000000000001',
  'question-context-cross-tenant',
  'Question Context Cross Tenant',
  'active'
);

insert into public.organization_memberships (
  id, organization_id, user_id, state, joined_at
)
values
  (
    '01981111-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    '01981100-0000-7000-8000-000000000001',
    'active', statement_timestamp()
  ),
  (
    '01981111-0000-7000-8000-000000000002',
    '01981110-0000-7000-8000-000000000001',
    '01981100-0000-7000-8000-000000000002',
    'active', statement_timestamp()
  );

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, created_by
)
values (
  '01981130-0000-7000-8000-000000000001',
  '01981110-0000-7000-8000-000000000001',
  '01980a20-0000-7000-8000-000000000001',
  '01980a22-0000-7000-8000-000000000001',
  'Question Context Cross Tenant Cohort',
  'active', 'scheduled',
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.cohort_memberships (
  id, cohort_id, user_id, role, state, assigned_by
)
values
  (
    '01981131-0000-7000-8000-000000000001',
    '01980a30-0000-7000-8000-000000000001',
    '01981100-0000-7000-8000-000000000001',
    'learner', 'active',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981131-0000-7000-8000-000000000002',
    '01981130-0000-7000-8000-000000000001',
    '01981100-0000-7000-8000-000000000002',
    'learner', 'active',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.user_roles (
  id, user_id, role_id, organization_id, cohort_id, granted_by, reason
)
select
  fixture.assignment_id,
  fixture.user_id,
  role_record.id,
  fixture.organization_id,
  fixture.cohort_id,
  '01980a00-0000-7000-8000-000000000003',
  'Question participant context isolation fixture'
from (values
  (
    '01981112-0000-7000-8000-000000000001'::uuid,
    '01981100-0000-7000-8000-000000000001'::uuid,
    '01980a10-0000-7000-8000-000000000001'::uuid,
    '01980a30-0000-7000-8000-000000000001'::uuid
  ),
  (
    '01981112-0000-7000-8000-000000000002'::uuid,
    '01981100-0000-7000-8000-000000000002'::uuid,
    '01981110-0000-7000-8000-000000000001'::uuid,
    '01981130-0000-7000-8000-000000000001'::uuid
  )
) as fixture(assignment_id, user_id, organization_id, cohort_id)
join public.roles role_record on role_record.code = 'learner';

insert into public.questions (
  id, organization_id, learner_id, cohort_id, task_id,
  assigned_trainer_id, state, subject, idempotency_key, answered_at,
  content_version_id
)
values
  (
    '01981150-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000001',
    '01980a30-0000-7000-8000-000000000001',
    '01980a26-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000002',
    'answered', 'Who participated in this answered question?',
    'question-participant-main-0001', statement_timestamp(),
    '01980a22-0000-7000-8000-000000000001'
  ),
  (
    '01981150-0000-7000-8000-000000000002',
    '01981110-0000-7000-8000-000000000001',
    '01981100-0000-7000-8000-000000000002',
    '01981130-0000-7000-8000-000000000001',
    '01980a26-0000-7000-8000-000000000001',
    null,
    'open', 'Can tenant A see this tenant B question?',
    'question-participant-cross-tenant-0001', null,
    '01980a22-0000-7000-8000-000000000001'
  );

insert into public.question_messages (
  id, question_id, author_id, body, message_kind, idempotency_key
)
values
  (
    '01981151-0000-7000-8000-000000000001',
    '01981150-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000003',
    'A historical message by the administrator.', 'message', null
  ),
  (
    '01981151-0000-7000-8000-000000000002',
    '01981150-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000003',
    'A second message must not duplicate the participant.', 'message', null
  ),
  (
    '01981151-0000-7000-8000-000000000003',
    '01981150-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000002',
    'The assigned trainer answered.', 'answer',
    'question-participant-answer-0001'
  );

insert into public.question_transfers (
  id, question_id, from_trainer_id, to_trainer_id, reason,
  idempotency_key
)
values (
  '01981152-0000-7000-8000-000000000001',
  '01981150-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000004',
  '01981100-0000-7000-8000-000000000004',
  'Preserve both historical transfer endpoints.',
  'question-participant-transfer-0001'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '01980a00-0000-7000-8000-000000000001',
  true
);

select results_eq(
  $$
    select context_record.question_id, context_record.user_id,
      context_record.display_name
    from public.list_my_question_participant_contexts() context_record
    where context_record.question_id =
      '01981150-0000-7000-8000-000000000001'
    order by context_record.user_id
  $$,
  $$ values
    (
      '01981150-0000-7000-8000-000000000001'::uuid,
      '01980a00-0000-7000-8000-000000000001'::uuid,
      'Lena Learner'::text
    ),
    (
      '01981150-0000-7000-8000-000000000001'::uuid,
      '01980a00-0000-7000-8000-000000000002'::uuid,
      'Theo Trainer'::text
    ),
    (
      '01981150-0000-7000-8000-000000000001'::uuid,
      '01980a00-0000-7000-8000-000000000003'::uuid,
      'Ada Admin'::text
    ),
    (
      '01981150-0000-7000-8000-000000000001'::uuid,
      '01980a00-0000-7000-8000-000000000004'::uuid,
      'Olivia Organization Admin'::text
    ),
    (
      '01981150-0000-7000-8000-000000000001'::uuid,
      '01981100-0000-7000-8000-000000000004'::uuid,
      'Tara Transfer Target'::text
    )
  $$,
  'the owning learner sees learner, assigned trainer, message author, and both transfer endpoints'
);

select ok(
  (
    select question_record.state = 'answered'
      and question_record.answered_at is not null
    from public.questions question_record
    where question_record.id =
      '01981150-0000-7000-8000-000000000001'
  )
  and exists (
    select 1
    from public.list_my_question_participant_contexts() context_record
    where context_record.question_id =
        '01981150-0000-7000-8000-000000000001'
      and context_record.user_id =
        '01980a00-0000-7000-8000-000000000002'
      and context_record.display_name = 'Theo Trainer'
  ),
  'the learner retains the assigned trainer name after the question is answered'
);

select is(
  (
    select count(*)::bigint
    from public.list_my_question_participant_contexts() context_record
    where context_record.question_id =
      '01981150-0000-7000-8000-000000000001'
  ),
  (
    select count(distinct context_record.user_id)::bigint
    from public.list_my_question_participant_contexts() context_record
    where context_record.question_id =
      '01981150-0000-7000-8000-000000000001'
  ),
  'repeated participant sources never create duplicate question-user rows'
);

select set_config(
  'request.jwt.claim.sub',
  '01980a00-0000-7000-8000-000000000002',
  true
);
select ok(
  app_private.can_access_question(
    '01981150-0000-7000-8000-000000000001'
  )
  and (
    select count(*) = 5
    from public.list_my_question_participant_contexts() context_record
    where context_record.question_id =
      '01981150-0000-7000-8000-000000000001'
  )
  and exists (
    select 1
    from public.list_my_question_participant_contexts() context_record
    where context_record.question_id =
        '01981150-0000-7000-8000-000000000001'
      and context_record.user_id =
        '01980a00-0000-7000-8000-000000000001'
      and context_record.display_name = 'Lena Learner'
  ),
  'the assigned and authorized trainer sees the same scoped participants'
);

select set_config(
  'request.jwt.claim.sub',
  '01981100-0000-7000-8000-000000000001',
  true
);
select ok(
  app_private.can_access_cohort(
    '01980a30-0000-7000-8000-000000000001'
  )
  and not app_private.can_access_question(
    '01981150-0000-7000-8000-000000000001'
  )
  and not exists (
    select 1
    from public.list_my_question_participant_contexts() context_record
    where context_record.question_id =
      '01981150-0000-7000-8000-000000000001'
  ),
  'another active learner in the cohort cannot read the owner question context'
);

select set_config(
  'request.jwt.claim.sub',
  '01980a00-0000-7000-8000-000000000001',
  true
);
select is(
  (
    select count(*)::bigint
    from public.list_my_question_participant_contexts() context_record
    where context_record.question_id =
      '01981150-0000-7000-8000-000000000002'
  ),
  0::bigint,
  'a tenant A learner cannot read tenant B participant context'
);

select set_config(
  'request.jwt.claim.sub',
  '01981100-0000-7000-8000-000000000002',
  true
);
select ok(
  app_private.can_access_question(
    '01981150-0000-7000-8000-000000000002'
  )
  and not exists (
    select 1
    from public.list_my_question_participant_contexts() context_record
    where context_record.question_id =
      '01981150-0000-7000-8000-000000000001'
  ),
  'the tenant B owner sees only their own tenant question context'
);

select set_config(
  'request.jwt.claim.sub',
  '01981100-0000-7000-8000-000000000003',
  true
);
select ok(
  not app_private.can_access_question(
    '01981150-0000-7000-8000-000000000001'
  )
  and not app_private.can_access_question(
    '01981150-0000-7000-8000-000000000002'
  )
  and not exists (
    select 1 from public.list_my_question_participant_contexts()
  ),
  'an authenticated principal without membership or authority receives no contexts'
);

reset role;
set local role anon;
select throws_ok(
  'select * from public.list_my_question_participant_contexts()',
  '42501',
  'permission denied for function list_my_question_participant_contexts',
  'anonymous execution is denied before participant data can be read'
);

select * from finish();
rollback;
