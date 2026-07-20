begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions;
select no_plan();

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'transition_cohort'
  ),
  1::bigint,
  'transition_cohort retains one canonical signature'
);

select is(
  (
    select array_to_string(procedure_record.proargnames, ',')
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.transition_cohort(uuid,bigint,public.cohort_state,text,uuid,text)'
        ::pg_catalog.regprocedure
  ),
  'p_cohort_id,p_expected_version,p_target_state,p_reason,p_correlation_id,p_idempotency_key',
  'the terminal-effects replacement preserves canonical argument names and order'
);

select is(
  (
    select procedure_record.pronargdefaults
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.transition_cohort(uuid,bigint,public.cohort_state,text,uuid,text)'
        ::pg_catalog.regprocedure
  ),
  1::smallint,
  'the trailing idempotency key remains the only defaulted argument'
);

select ok(
  (
    select procedure_record.prorettype = 'public.cohorts'::pg_catalog.regtype
      and procedure_record.prosecdef
      and procedure_record.provolatile = 'v'
      and procedure_record.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.transition_cohort(uuid,bigint,public.cohort_state,text,uuid,text)'
        ::pg_catalog.regprocedure
  ),
  'the command still returns cohorts and is volatile security-definer with an empty search path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.transition_cohort(uuid,bigint,public.cohort_state,text,uuid,text)',
    'EXECUTE'
  )
  and (
    select count(*) = 1
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'assign_enrollment'
  )
  and (
    select procedure_record.prorettype =
        'public.enrollments'::pg_catalog.regtype
      and procedure_record.prosecdef
      and procedure_record.provolatile = 'v'
      and procedure_record.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.assign_enrollment(uuid,uuid,bigint,text,uuid)'
        ::pg_catalog.regprocedure
  )
  and has_function_privilege(
    'service_role',
    'public.transition_cohort(uuid,bigint,public.cohort_state,text,uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.assign_enrollment(uuid,uuid,bigint,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.transition_cohort(uuid,bigint,public.cohort_state,text,uuid,text)',
    'EXECUTE'
  ),
  'the replacement preserves exact trusted execution grants'
);

select ok(
  not has_table_privilege(
    'authenticated', 'public.cohort_schedule_command_receipts', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.cohort_schedule_command_receipts', 'INSERT'
  )
  and not has_table_privilege(
    'authenticated', 'public.cohort_schedule_command_receipts', 'UPDATE'
  )
  and not has_table_privilege(
    'authenticated', 'public.cohort_schedule_command_receipts', 'DELETE'
  )
  and exists (
    select 1
    from pg_catalog.pg_trigger trigger_record
    where trigger_record.tgrelid =
      'public.cohort_schedule_command_receipts'::pg_catalog.regclass
      and trigger_record.tgname =
        'cohort_schedule_command_receipts_immutable'
      and not trigger_record.tgisinternal
  ),
  'the actor-scoped receipt ledger remains private and append-only'
);

select ok(
  (
    select function_record.definition ~ (
      '(?s)order by enrollment_record\.id[[:space:]]+for update;'
      || '.*from app_private\.cohort_assignment_revisions'
      || '.*for update;'
      || '.*where cohort_record\.id = p_cohort_id[[:space:]]+for update;'
      || '.*order by enrollment_record\.id[[:space:]]+for update;'
    )
    from (
      select pg_catalog.pg_get_functiondef(
        'public.transition_cohort(uuid,bigint,public.cohort_state,text,uuid,text)'
          ::pg_catalog.regprocedure
      ) definition
    ) function_record
  ),
  'terminalization locks enrollment, assignment revision, then cohort and rechecks afterward'
);

select ok(
  to_regclass('app_private.cohort_assignment_revisions') is not null
  and not has_table_privilege(
    'authenticated',
    'app_private.cohort_assignment_revisions',
    'SELECT'
  )
  and not has_table_privilege(
    'service_role',
    'app_private.cohort_assignment_revisions',
    'UPDATE'
  )
  and exists (
    select 1
    from pg_catalog.pg_trigger trigger_record
    where trigger_record.tgrelid = 'public.cohorts'::pg_catalog.regclass
      and trigger_record.tgname = 'cohorts_initialize_assignment_revision'
      and not trigger_record.tgisinternal
  ),
  'private assignment revisions are trigger-initialized and inaccessible to API roles'
);

select ok(
  (
    select function_record.definition ~ (
      '(?s)where enrollment_record\.id = p_enrollment_id'
      || '[[:space:]]+for update;'
      || '.*from app_private\.cohort_assignment_revisions'
      || '.*for update;'
      || '.*where cohort_record\.id = p_cohort_id'
      || '[[:space:]]+for update;'
      || '.*update app_private\.cohort_assignment_revisions'
    )
    from (
      select pg_catalog.pg_get_functiondef(
        'public.assign_enrollment(uuid,uuid,bigint,text,uuid)'
          ::pg_catalog.regprocedure
      ) definition
    ) function_record
  )
  and has_function_privilege(
    'authenticated',
    'public.assign_enrollment(uuid,uuid,bigint,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.assign_enrollment(uuid,uuid,bigint,text,uuid)',
    'EXECUTE'
  ),
  'assignment preserves its API while sharing enrollment-revision-cohort lock order'
);

insert into public.organizations (id, slug, name, state)
values (
  '01980f10-0000-7000-8000-000000000002',
  'terminal-effects-other-tenant',
  'Terminal Effects Other Tenant',
  'active'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', fixture.user_id,
  'authenticated', 'authenticated', fixture.email,
  extensions.crypt('Ditele-Local-2026!', extensions.gen_salt('bf')),
  statement_timestamp(),
  '{"provider":"email","providers":["email"],"seed_fixture":"true","test_fixture":"terminal-effects"}'::jsonb,
  jsonb_build_object('display_name', fixture.display_name, 'locale', 'en'),
  statement_timestamp(), statement_timestamp(), '', '', '', ''
from (values
  ('01980f00-0000-7000-8000-000000000001'::uuid, 'terminal-learner-01@test.invalid', 'Terminal Learner 01'),
  ('01980f00-0000-7000-8000-000000000002'::uuid, 'terminal-learner-02@test.invalid', 'Terminal Learner 02'),
  ('01980f00-0000-7000-8000-000000000003'::uuid, 'terminal-learner-03@test.invalid', 'Terminal Learner 03'),
  ('01980f00-0000-7000-8000-000000000004'::uuid, 'terminal-learner-04@test.invalid', 'Terminal Learner 04'),
  ('01980f00-0000-7000-8000-000000000005'::uuid, 'terminal-learner-05@test.invalid', 'Terminal Learner 05'),
  ('01980f00-0000-7000-8000-000000000006'::uuid, 'terminal-learner-06@test.invalid', 'Terminal Learner 06'),
  ('01980f00-0000-7000-8000-000000000007'::uuid, 'terminal-learner-07@test.invalid', 'Terminal Learner 07'),
  ('01980f00-0000-7000-8000-000000000008'::uuid, 'terminal-learner-08@test.invalid', 'Terminal Learner 08'),
  ('01980f00-0000-7000-8000-000000000009'::uuid, 'terminal-learner-09@test.invalid', 'Terminal Learner 09'),
  ('01980f00-0000-7000-8000-00000000000a'::uuid, 'terminal-learner-10@test.invalid', 'Terminal Learner 10'),
  ('01980f00-0000-7000-8000-00000000000b'::uuid, 'terminal-learner-11@test.invalid', 'Terminal Learner 11'),
  ('01980f00-0000-7000-8000-00000000000c'::uuid, 'terminal-learner-12@test.invalid', 'Terminal Learner 12')
) fixture(user_id, email, display_name);

insert into public.organization_memberships (
  organization_id, user_id, state, joined_at
)
select
  '01980a10-0000-7000-8000-000000000001',
  fixture.user_id,
  'active',
  statement_timestamp()
from (values
  ('01980f00-0000-7000-8000-000000000001'::uuid),
  ('01980f00-0000-7000-8000-000000000002'::uuid),
  ('01980f00-0000-7000-8000-000000000003'::uuid),
  ('01980f00-0000-7000-8000-000000000004'::uuid),
  ('01980f00-0000-7000-8000-000000000005'::uuid),
  ('01980f00-0000-7000-8000-000000000006'::uuid),
  ('01980f00-0000-7000-8000-000000000007'::uuid),
  ('01980f00-0000-7000-8000-000000000008'::uuid),
  ('01980f00-0000-7000-8000-000000000009'::uuid),
  ('01980f00-0000-7000-8000-00000000000a'::uuid),
  ('01980f00-0000-7000-8000-00000000000b'::uuid),
  ('01980f00-0000-7000-8000-00000000000c'::uuid)
) fixture(user_id);

insert into public.user_roles (
  user_id, role_id, organization_id, reason
)
select
  fixture.user_id,
  role_record.id,
  '01980a10-0000-7000-8000-000000000001',
  'terminal-effects projection fixture'
from (values
  ('01980f00-0000-7000-8000-000000000001'::uuid),
  ('01980f00-0000-7000-8000-000000000002'::uuid),
  ('01980f00-0000-7000-8000-000000000003'::uuid),
  ('01980f00-0000-7000-8000-000000000008'::uuid),
  ('01980f00-0000-7000-8000-00000000000b'::uuid)
) fixture(user_id)
cross join public.roles role_record
where role_record.code = 'learner';

insert into public.courses (
  id, organization_id, slug, state, default_locale, estimated_minutes,
  created_by
)
values (
  '01980f20-0000-7000-8000-000000000006',
  '01980a10-0000-7000-8000-000000000001',
  'terminal-corrupt-course', 'active', 'en', 30,
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, starts_at, created_by
)
values
  (
    '01980f30-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Terminal Complete Cohort', 'active', 'scheduled',
    statement_timestamp() - interval '10 days',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000002',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Terminal Active Cancellation Cohort', 'active', 'scheduled',
    statement_timestamp() - interval '5 days',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000003',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Terminal Waiting Cancellation Cohort', 'waiting', 'scheduled', null,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000004',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Terminal Zero Assignment Cohort', 'active', 'scheduled',
    statement_timestamp() - interval '3 days',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000005',
    '01980f10-0000-7000-8000-000000000002',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Terminal Cross Tenant Cohort', 'active', 'scheduled',
    statement_timestamp() - interval '2 days',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000006',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Terminal Corrupt Assignment Cohort', 'active', 'scheduled',
    statement_timestamp() - interval '1 day',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000007',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Assignment Revision Cohort', 'active', 'scheduled',
    statement_timestamp() - interval '1 day',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.cohort_memberships (
  cohort_id, user_id, role, state, assigned_by
)
values
  (
    '01980f30-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000002',
    'trainer', 'active', '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000001',
    'learner', 'active', '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000002',
    'learner', 'active', '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000003',
    'learner', 'active', '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000002',
    '01980a00-0000-7000-8000-000000000002',
    'trainer', 'active', '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000002',
    '01980f00-0000-7000-8000-000000000008',
    'learner', 'active', '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000003',
    '01980f00-0000-7000-8000-00000000000b',
    'learner', 'active', '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000004',
    '01980a00-0000-7000-8000-000000000002',
    'trainer', 'active', '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000006',
    '01980f00-0000-7000-8000-00000000000c',
    'learner', 'active', '01980a00-0000-7000-8000-000000000003'
  );

insert into public.enrollments (
  id, organization_id, learner_id, course_id, cohort_id, state,
  request_note, decision_reason, idempotency_key, decided_by, decided_at,
  completed_at
)
values
  (
    '01980f33-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980f30-0000-7000-8000-000000000001', 'assigned',
    'Preserve request one', 'Original assignment decision one',
    'terminal-complete-assigned-0001',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '9 days', null
  ),
  (
    '01980f33-0000-7000-8000-000000000002',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000002',
    '01980a20-0000-7000-8000-000000000001',
    '01980f30-0000-7000-8000-000000000001', 'assigned',
    'Preserve request two', 'Original assignment decision two',
    'terminal-complete-assigned-0002',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '9 days', null
  ),
  (
    '01980f33-0000-7000-8000-000000000003',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000003',
    '01980a20-0000-7000-8000-000000000001',
    '01980f30-0000-7000-8000-000000000001', 'completed',
    null, 'Already completed decision',
    'terminal-already-completed-0003',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '12 days',
    statement_timestamp() - interval '2 days'
  ),
  (
    '01980f33-0000-7000-8000-000000000004',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000004',
    '01980a20-0000-7000-8000-000000000001',
    '01980f30-0000-7000-8000-000000000001', 'cancelled',
    null, 'Already cancelled decision',
    'terminal-already-cancelled-0004',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '8 days', null
  ),
  (
    '01980f33-0000-7000-8000-000000000005',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000005',
    '01980a20-0000-7000-8000-000000000001',
    '01980f30-0000-7000-8000-000000000001', 'rejected',
    null, 'Already rejected decision',
    'terminal-already-rejected-0005',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '8 days', null
  ),
  (
    '01980f33-0000-7000-8000-000000000006',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000006',
    '01980a20-0000-7000-8000-000000000001',
    '01980f30-0000-7000-8000-000000000001', 'requested',
    'Requested row remains requested', null,
    'terminal-requested-unchanged-0006', null, null, null
  ),
  (
    '01980f33-0000-7000-8000-000000000007',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000007',
    '01980a20-0000-7000-8000-000000000001',
    '01980f30-0000-7000-8000-000000000001', 'approved',
    null, 'Approved row remains approved',
    'terminal-approved-unchanged-0007',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '7 days', null
  ),
  (
    '01980f33-0000-7000-8000-000000000008',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000008',
    '01980a20-0000-7000-8000-000000000001',
    '01980f30-0000-7000-8000-000000000002', 'assigned',
    null, 'Original cancellation assignment decision',
    'terminal-cancel-assigned-0008',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '4 days', null
  ),
  (
    '01980f33-0000-7000-8000-000000000009',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000009',
    '01980a20-0000-7000-8000-000000000001',
    '01980f30-0000-7000-8000-000000000002', 'approved',
    null, 'Active cancellation approved stays approved',
    'terminal-cancel-approved-0009',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '4 days', null
  ),
  (
    '01980f33-0000-7000-8000-00000000000a',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-00000000000a',
    '01980a20-0000-7000-8000-000000000001',
    '01980f30-0000-7000-8000-000000000002', 'completed',
    null, 'Active cancellation completed stays completed',
    'terminal-cancel-completed-0010',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '4 days',
    statement_timestamp() - interval '1 day'
  ),
  (
    '01980f33-0000-7000-8000-00000000000b',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-00000000000b',
    '01980a20-0000-7000-8000-000000000001',
    '01980f30-0000-7000-8000-000000000003', 'assigned',
    null, 'Waiting assignment decision',
    'terminal-waiting-assigned-0011',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '1 day', null
  ),
  (
    '01980f33-0000-7000-8000-00000000000c',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-00000000000c',
    '01980f20-0000-7000-8000-000000000006',
    '01980f30-0000-7000-8000-000000000006', 'assigned',
    null, 'Corrupt course assignment decision',
    'terminal-corrupt-assigned-0012',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '1 day', null
  ),
  (
    '01980f33-0000-7000-8000-00000000000e',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000004',
    '01980a20-0000-7000-8000-000000000001',
    null, 'approved',
    'Assignment revision request', 'Approved before guarded assignment',
    'terminal-assignment-revision-0014',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '1 day', null
  );

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, starts_at, capacity, created_by
)
values
  (
    '01980f30-0000-7000-8000-000000000008',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Removed Organization Membership Assignment Cohort',
    'active', 'scheduled', statement_timestamp() - interval '1 day', 2,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-000000000009',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Inactive Profile Assignment Cohort',
    'active', 'scheduled', statement_timestamp() - interval '1 day', 2,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980f30-0000-7000-8000-00000000000a',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Removed Capacity Membership Assignment Cohort',
    'active', 'scheduled', statement_timestamp() - interval '1 day', 1,
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.enrollments (
  id, organization_id, learner_id, course_id, state, request_note,
  decision_reason, idempotency_key, decided_by, decided_at
)
values
  (
    '01980f33-0000-7000-8000-00000000000f',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000005',
    '01980a20-0000-7000-8000-000000000001',
    'approved', 'Removed organization membership request',
    'Approved before organization membership removal',
    'terminal-removed-org-membership-0015',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '1 day'
  ),
  (
    '01980f33-0000-7000-8000-000000000010',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-00000000000a',
    '01980a20-0000-7000-8000-000000000001',
    'approved', 'Inactive profile assignment request',
    'Approved before learner profile deactivation',
    'terminal-inactive-profile-0016',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '1 day'
  ),
  (
    '01980f33-0000-7000-8000-000000000011',
    '01980a10-0000-7000-8000-000000000001',
    '01980f00-0000-7000-8000-000000000003',
    '01980a20-0000-7000-8000-000000000001',
    'approved', 'Removed capacity membership request',
    'Approved for capacity exclusion verification',
    'terminal-removed-capacity-member-0017',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp() - interval '1 day'
  );

insert into public.cohort_memberships (
  cohort_id, user_id, role, state, assigned_by, removed_at
)
values (
  '01980f30-0000-7000-8000-00000000000a',
  '01980f00-0000-7000-8000-000000000006',
  'learner', 'active', '01980a00-0000-7000-8000-000000000003',
  statement_timestamp() - interval '1 hour'
);

create temporary table terminal_assignment_decision_before
on commit drop
as
select
  enrollment_record.id,
  enrollment_record.request_note,
  enrollment_record.decision_reason,
  enrollment_record.decided_by,
  enrollment_record.decided_at
from public.enrollments enrollment_record
where enrollment_record.id in (
  '01980f33-0000-7000-8000-000000000001',
  '01980f33-0000-7000-8000-000000000002',
  '01980f33-0000-7000-8000-000000000008',
  '01980f33-0000-7000-8000-00000000000b'
);

create temporary table terminal_mixed_state_before
on commit drop
as
select
  enrollment_record.id,
  enrollment_record.state,
  enrollment_record.row_version,
  enrollment_record.completed_at,
  enrollment_record.decision_reason,
  enrollment_record.decided_by,
  enrollment_record.decided_at
from public.enrollments enrollment_record
where enrollment_record.id in (
  '01980f33-0000-7000-8000-000000000003',
  '01980f33-0000-7000-8000-000000000004',
  '01980f33-0000-7000-8000-000000000005',
  '01980f33-0000-7000-8000-000000000006',
  '01980f33-0000-7000-8000-000000000007',
  '01980f33-0000-7000-8000-000000000009',
  '01980f33-0000-7000-8000-00000000000a'
);

update public.organization_memberships membership_record
set removed_at = statement_timestamp()
where membership_record.organization_id =
    '01980a10-0000-7000-8000-000000000001'
  and membership_record.user_id =
    '01980f00-0000-7000-8000-000000000005';

update public.profiles profile_record
set state = 'inactive',
    deactivated_at = statement_timestamp()
where profile_record.user_id =
  '01980f00-0000-7000-8000-00000000000a';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select throws_ok(
  $$ select * from public.assign_enrollment(
       '01980f33-0000-7000-8000-00000000000f',
       '01980f30-0000-7000-8000-000000000008',
       1,
       'Removed organization member cannot be assigned',
       '01980f40-0000-7000-8000-000000000008'
     ) $$,
  '23514',
  'learner is not an active organization member',
  'active-state organization membership with removed_at is rejected'
);

select throws_ok(
  $$ select * from public.assign_enrollment(
       '01980f33-0000-7000-8000-000000000010',
       '01980f30-0000-7000-8000-000000000009',
       1,
       'Deactivated learner profile cannot be assigned',
       '01980f40-0000-7000-8000-000000000009'
     ) $$,
  '23514',
  'learner profile is not active',
  'inactive and deactivated learner profile is rejected'
);

select is(
  (
    select (public.assign_enrollment(
      '01980f33-0000-7000-8000-000000000011',
      '01980f30-0000-7000-8000-00000000000a',
      1,
      'Removed cohort member must not consume active capacity',
      '01980f40-0000-7000-8000-00000000000a'
    )).state
  ),
  'assigned'::public.enrollment_state,
  'removed_at cohort member is excluded from active capacity'
);

reset role;

select ok(
  (
    select count(*) = 2
    from public.enrollments enrollment_record
    where enrollment_record.id in (
      '01980f33-0000-7000-8000-00000000000f',
      '01980f33-0000-7000-8000-000000000010'
    )
      and enrollment_record.state = 'approved'
      and enrollment_record.cohort_id is null
      and enrollment_record.row_version = 1
  )
  and (
    select count(*) = 2
    from app_private.cohort_assignment_revisions revision_record
    where revision_record.cohort_id in (
      '01980f30-0000-7000-8000-000000000008',
      '01980f30-0000-7000-8000-000000000009'
    )
      and revision_record.revision = 0
  )
  and not exists (
    select 1 from public.audit_events audit_record
    where audit_record.correlation_id in (
      '01980f40-0000-7000-8000-000000000008',
      '01980f40-0000-7000-8000-000000000009'
    )
  ),
  'failed lifecycle checks preserve enrollment, guard, and event state atomically'
);

select ok(
  (select state = 'assigned' and row_version = 2
   from public.enrollments enrollment_record
   where enrollment_record.id =
     '01980f33-0000-7000-8000-000000000011')
  and (select revision = 1
       from app_private.cohort_assignment_revisions revision_record
       where revision_record.cohort_id =
         '01980f30-0000-7000-8000-00000000000a')
  and (
    select count(*) = 1
    from public.cohort_memberships membership_record
    where membership_record.cohort_id =
        '01980f30-0000-7000-8000-00000000000a'
      and membership_record.role = 'learner'
      and membership_record.state = 'active'
      and membership_record.removed_at is null
  )
  and (
    select count(*) = 2
    from public.cohort_memberships membership_record
    where membership_record.cohort_id =
        '01980f30-0000-7000-8000-00000000000a'
      and membership_record.role = 'learner'
      and membership_record.state = 'active'
  ),
  'capacity and assignment revision count only active unremoved cohort members'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select is(
  (
    select (public.assign_enrollment(
      '01980f33-0000-7000-8000-00000000000e',
      '01980f30-0000-7000-8000-000000000007',
      1,
      'Verify assignment revision advances with successful assignment',
      '01980f40-0000-7000-8000-000000000007'
    )).state
  ),
  'assigned'::public.enrollment_state,
  'canonical assignment remains functional through the revision guard'
);

reset role;

select results_eq(
  $$
    select
      revision_record.revision,
      enrollment_record.state,
      enrollment_record.row_version
    from app_private.cohort_assignment_revisions revision_record
    join public.enrollments enrollment_record
      on enrollment_record.cohort_id = revision_record.cohort_id
     and enrollment_record.id =
       '01980f33-0000-7000-8000-00000000000e'
    where revision_record.cohort_id =
      '01980f30-0000-7000-8000-000000000007'
  $$,
  $$ values (
    1::bigint,
    'assigned'::public.enrollment_state,
    2::bigint
  ) $$,
  'successful assignment advances exactly one private revision and enrollment CAS'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980f30-0000-7000-8000-000000000001', 1, 'completed',
       'Missing actor cannot complete terminal cohort',
       '01980f40-0000-7000-8000-000000000001',
       'terminal-missing-actor-0001'
     ) $$,
  '42501', 'authentication required',
  'missing actor cannot execute terminal enrollment effects'
);

select set_config(
  'request.jwt.claim.sub', '01980f00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980f30-0000-7000-8000-000000000001', 1, 'completed',
       'Learner cannot complete own cohort',
       '01980f40-0000-7000-8000-000000000002',
       'terminal-learner-denied-0002'
     ) $$,
  '42501', 'cohort lifecycle scope denied',
  'linked learner cannot terminalize their own cohort'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980f30-0000-7000-8000-000000000002', 1, 'cancelled',
       'Trainer cannot cancel an active cohort',
       '01980f40-0000-7000-8000-000000000003',
       'terminal-trainer-cancel-denied-0003'
     ) $$,
  '42501', 'cohort cancellation scope denied',
  'trainer completion authority does not grant cancellation authority'
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980f30-0000-7000-8000-000000000001', 99, 'completed',
       'Stale trainer completion must fail',
       '01980f40-0000-7000-8000-000000000004',
       'terminal-stale-complete-0004'
     ) $$,
  '40001', 'cohort is stale',
  'terminal completion retains cohort CAS protection'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980f30-0000-7000-8000-000000000005', 1, 'cancelled',
       'Organization manager cannot cross tenant boundary',
       '01980f40-0000-7000-8000-000000000005',
       'terminal-cross-tenant-denied-0005'
     ) $$,
  '42501', 'cohort cancellation scope denied',
  'organization manager cannot terminalize a cross-tenant cohort'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980f30-0000-7000-8000-000000000006', 1, 'completed',
       'Corrupt linked assignment must fail atomically',
       '01980f40-0000-7000-8000-000000000006',
       'terminal-corrupt-scope-0006'
     ) $$,
  '23514',
  'linked assigned enrollment does not match cohort organization and course',
  'corrupt cross-course live assignment fails closed'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true
);

select is(
  (
    select (public.transition_cohort(
      '01980f30-0000-7000-8000-000000000002', 1, 'cancelled',
      'Organization manager cancels active cohort assignments atomically',
      '01980f40-0000-7000-8000-000000000020',
      'terminal-active-cancel-idempotency-0020'
    )).state
  ),
  'cancelled'::public.cohort_state,
  'authorized organization manager cancels an active cohort atomically'
);

reset role;

select ok(
  (select state from public.enrollments
   where id = '01980f33-0000-7000-8000-000000000008') = 'cancelled'
  and (select completed_at is null from public.enrollments
       where id = '01980f33-0000-7000-8000-000000000008')
  and (select row_version from public.enrollments
       where id = '01980f33-0000-7000-8000-000000000008') = 2
  and (select completed_at is null from public.cohorts
       where id = '01980f30-0000-7000-8000-000000000002'),
  'active cancellation terminalizes assigned enrollment without any completion timestamp'
);

select is(
  (
    select count(*)
    from public.enrollments enrollment_record
    join terminal_assignment_decision_before before_record
      on before_record.id = enrollment_record.id
    where enrollment_record.id =
      '01980f33-0000-7000-8000-000000000008'
      and (
        enrollment_record.request_note is distinct from before_record.request_note
        or enrollment_record.decision_reason
          is distinct from before_record.decision_reason
        or enrollment_record.decided_by is distinct from before_record.decided_by
        or enrollment_record.decided_at is distinct from before_record.decided_at
      )
  ),
  0::bigint,
  'active cancellation preserves original assignment decision fields'
);

select is(
  (
    select count(*)
    from public.enrollments enrollment_record
    join terminal_mixed_state_before before_record
      on before_record.id = enrollment_record.id
    where enrollment_record.id in (
      '01980f33-0000-7000-8000-000000000009',
      '01980f33-0000-7000-8000-00000000000a'
    )
      and (
        enrollment_record.state is distinct from before_record.state
        or enrollment_record.row_version is distinct from before_record.row_version
        or enrollment_record.completed_at
          is distinct from before_record.completed_at
        or enrollment_record.decision_reason
          is distinct from before_record.decision_reason
        or enrollment_record.decided_by is distinct from before_record.decided_by
        or enrollment_record.decided_at is distinct from before_record.decided_at
      )
  ),
  0::bigint,
  'active cancellation leaves linked approved and completed rows unchanged'
);

select is(
  (
    select count(*)
    from public.cohort_memberships membership_record
    where membership_record.cohort_id =
      '01980f30-0000-7000-8000-000000000002'
      and membership_record.state = 'active'
      and membership_record.removed_at is null
      and membership_record.row_version = 1
  ),
  2::bigint,
  'active cancellation preserves trainer and learner cohort memberships'
);

select results_eq(
  $$
    select
      audit_record.event_type,
      audit_record.aggregate_version,
      audit_record.metadata ->> 'state',
      audit_record.metadata ->> 'reason'
    from public.audit_events audit_record
    where audit_record.aggregate_type = 'enrollment'
      and audit_record.aggregate_id =
        '01980f33-0000-7000-8000-000000000008'
      and audit_record.event_type = 'enrollment.cancelled'
  $$,
  $$ values (
    'enrollment.cancelled'::text,
    2::bigint,
    'cancelled'::text,
    'Organization manager cancels active cohort assignments atomically'::text
  ) $$,
  'active cancellation appends the canonical per-enrollment audit event'
);

select results_eq(
  $$
    select
      outbox_record.event_type,
      outbox_record.aggregate_version,
      outbox_record.payload ->> 'actor_id',
      outbox_record.payload ->> 'reason'
    from public.outbox_events outbox_record
    where outbox_record.aggregate_type = 'enrollment'
      and outbox_record.aggregate_id =
        '01980f33-0000-7000-8000-000000000008'
      and outbox_record.event_type = 'enrollment.cancelled.v1'
  $$,
  $$ values (
    'enrollment.cancelled.v1'::text,
    2::bigint,
    '01980a00-0000-7000-8000-000000000004'::text,
    'Organization manager cancels active cohort assignments atomically'::text
  ) $$,
  'active cancellation appends the canonical per-enrollment v1 outbox event'
);

select results_eq(
  $$
    select
      metadata ->> 'affected_enrollment_count',
      metadata ->> 'membership_policy'
    from public.audit_events
    where aggregate_type = 'cohort'
      and aggregate_id = '01980f30-0000-7000-8000-000000000002'
      and event_type = 'cohort.cancelled'
  $$,
  $$ values (
    '1'::text,
    'preserve_active_unremoved_memberships'::text
  ) $$,
  'active cancellation cohort audit records one affected enrollment and retention policy'
);

select ok(
  (
    select count(*) = 1
    from public.notifications notification_record
    where notification_record.event_type = 'cohort.cancelled'
      and notification_record.payload ->> 'cohort_id' =
        '01980f30-0000-7000-8000-000000000002'
  )
  and not exists (
    select 1
    from public.notifications notification_record
    where notification_record.event_type = 'enrollment.cancelled'
      and notification_record.recipient_id =
        '01980f00-0000-7000-8000-000000000008'
  ),
  'active cancellation emits one cohort notification and no enrollment duplicate'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980f00-0000-7000-8000-000000000008', true
);

select is(
  (select count(*) from public.list_my_learning_courses('en')),
  0::bigint,
  '998 dashboard omits cancelled enrollment and terminal cohort'
);

select is(
  public.get_my_learning_course(
    '01980a20-0000-7000-8000-000000000001', 'en'
  ),
  null::jsonb,
  '998 course boundary exposes no cancelled history'
);

select is(
  public.get_my_learning_task(
    '01980a26-0000-7000-8000-000000000001'
  ),
  null::jsonb,
  '998 task boundary denies cancelled learner access'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select is(
  (
    select (public.transition_cohort(
      '01980f30-0000-7000-8000-000000000003', 1, 'cancelled',
      'Administrator cancels waiting cohort assignment atomically',
      '01980f40-0000-7000-8000-000000000030',
      'terminal-waiting-cancel-idempotency-0030'
    )).state
  ),
  'cancelled'::public.cohort_state,
  'manager cancellation includes waiting cohorts with assigned enrollments'
);

reset role;

select ok(
  (select state from public.enrollments
   where id = '01980f33-0000-7000-8000-00000000000b') = 'cancelled'
  and (select completed_at is null from public.enrollments
       where id = '01980f33-0000-7000-8000-00000000000b')
  and (select row_version from public.enrollments
       where id = '01980f33-0000-7000-8000-00000000000b') = 2
  and (select starts_at is null and completed_at is null from public.cohorts
       where id = '01980f30-0000-7000-8000-000000000003'),
  'waiting cancellation records no artificial start or completion timestamp'
);

select is(
  (
    select count(*)
    from public.enrollments enrollment_record
    join terminal_assignment_decision_before before_record
      on before_record.id = enrollment_record.id
    where enrollment_record.id =
      '01980f33-0000-7000-8000-00000000000b'
      and (
        enrollment_record.request_note is distinct from before_record.request_note
        or enrollment_record.decision_reason
          is distinct from before_record.decision_reason
        or enrollment_record.decided_by is distinct from before_record.decided_by
        or enrollment_record.decided_at is distinct from before_record.decided_at
      )
  ),
  0::bigint,
  'waiting cancellation preserves original assignment decision fields'
);

select ok(
  (select state = 'active' and removed_at is null
   from public.cohort_memberships
   where cohort_id = '01980f30-0000-7000-8000-000000000003'
     and user_id = '01980f00-0000-7000-8000-00000000000b')
  and (select count(*) = 1 from public.audit_events
       where aggregate_id = '01980f33-0000-7000-8000-00000000000b'
         and event_type = 'enrollment.cancelled')
  and (select count(*) = 1 from public.outbox_events
       where aggregate_id = '01980f33-0000-7000-8000-00000000000b'
         and event_type = 'enrollment.cancelled.v1')
  and (select count(*) = 1 from public.notifications
       where event_type = 'cohort.cancelled'
         and payload ->> 'cohort_id' =
           '01980f30-0000-7000-8000-000000000003'),
  'waiting cancellation preserves membership and emits one enrollment event pair plus cohort notification'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select (public.transition_cohort(
      '01980f30-0000-7000-8000-000000000004', 1, 'completed',
      'Trainer completes cohort with no assigned enrollments',
      '01980f40-0000-7000-8000-000000000040',
      'terminal-zero-complete-idempotency-0040'
    )).state
  ),
  'completed'::public.cohort_state,
  'zero-assignment cohort can complete without synthetic enrollment effects'
);

reset role;

select ok(
  not exists (
    select 1 from public.audit_events audit_record
    where audit_record.correlation_id =
      '01980f40-0000-7000-8000-000000000040'
      and audit_record.aggregate_type = 'enrollment'
  )
  and not exists (
    select 1 from public.outbox_events outbox_record
    where outbox_record.correlation_id =
      '01980f40-0000-7000-8000-000000000040'
      and outbox_record.aggregate_type = 'enrollment'
  )
  and (
    select metadata ->> 'affected_enrollment_count' = '0'
      and metadata ->> 'membership_policy' =
        'preserve_active_unremoved_memberships'
    from public.audit_events audit_record
    where audit_record.aggregate_id =
      '01980f30-0000-7000-8000-000000000004'
      and audit_record.event_type = 'cohort.completed'
  )
  and not exists (
    select 1 from public.notifications notification_record
    where notification_record.payload ->> 'cohort_id' =
      '01980f30-0000-7000-8000-000000000004'
  ),
  'zero-assignment completion records zero metadata and no enrollment events or learner notifications'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select (public.transition_cohort(
      '01980f30-0000-7000-8000-000000000001', 1, 'completed',
      'Trainer completes cohort and linked assignments atomically',
      '01980f40-0000-7000-8000-000000000010',
      'terminal-complete-idempotency-0010'
    )).row_version
  ),
  2::bigint,
  'trainer completes cohort and linked assigned enrollments with one CAS command'
);

reset role;

select ok(
  (select state from public.cohorts
   where id = '01980f30-0000-7000-8000-000000000001') = 'completed'
  and (select completed_at is not null from public.cohorts
       where id = '01980f30-0000-7000-8000-000000000001')
  and (
    select count(*) = 2
    from public.enrollments enrollment_record
    where enrollment_record.id in (
      '01980f33-0000-7000-8000-000000000001',
      '01980f33-0000-7000-8000-000000000002'
    )
      and enrollment_record.state = 'completed'
      and enrollment_record.completed_at is not null
      and enrollment_record.row_version = 2
  )
  and (
    select count(*) = 2
    from public.enrollments enrollment_record
    join public.cohorts cohort_record
      on cohort_record.id = enrollment_record.cohort_id
    where enrollment_record.id in (
      '01980f33-0000-7000-8000-000000000001',
      '01980f33-0000-7000-8000-000000000002'
    )
      and enrollment_record.completed_at = cohort_record.completed_at
  ),
  'completion advances only assigned enrollment versions and shares one terminal timestamp'
);

select is(
  (
    select count(*)
    from public.enrollments enrollment_record
    join terminal_assignment_decision_before before_record
      on before_record.id = enrollment_record.id
    where enrollment_record.id in (
      '01980f33-0000-7000-8000-000000000001',
      '01980f33-0000-7000-8000-000000000002'
    )
      and (
        enrollment_record.request_note is distinct from before_record.request_note
        or enrollment_record.decision_reason
          is distinct from before_record.decision_reason
        or enrollment_record.decided_by is distinct from before_record.decided_by
        or enrollment_record.decided_at is distinct from before_record.decided_at
      )
  ),
  0::bigint,
  'terminal completion preserves original assignment decision fields exactly'
);

select is(
  (
    select count(*)
    from public.enrollments enrollment_record
    join terminal_mixed_state_before before_record
      on before_record.id = enrollment_record.id
    where enrollment_record.id between
      '01980f33-0000-7000-8000-000000000003'
      and '01980f33-0000-7000-8000-000000000007'
      and (
        enrollment_record.state is distinct from before_record.state
        or enrollment_record.row_version is distinct from before_record.row_version
        or enrollment_record.completed_at
          is distinct from before_record.completed_at
        or enrollment_record.decision_reason
          is distinct from before_record.decision_reason
        or enrollment_record.decided_by is distinct from before_record.decided_by
        or enrollment_record.decided_at is distinct from before_record.decided_at
      )
  ),
  0::bigint,
  'completed, cancelled, rejected, requested, and approved rows remain byte-for-byte unchanged'
);

select is(
  (
    select count(*)
    from public.cohort_memberships membership_record
    where membership_record.cohort_id =
      '01980f30-0000-7000-8000-000000000001'
      and membership_record.state = 'active'
      and membership_record.removed_at is null
      and membership_record.row_version = 1
  ),
  4::bigint,
  'completion preserves active unremoved trainer and learner memberships unchanged'
);

select is(
  (
    select count(*)
    from public.audit_events audit_record
    where audit_record.aggregate_type = 'enrollment'
      and audit_record.event_type = 'enrollment.completed'
      and audit_record.aggregate_id in (
        '01980f33-0000-7000-8000-000000000001',
        '01980f33-0000-7000-8000-000000000002'
      )
      and audit_record.aggregate_version = 2
      and audit_record.actor_id =
        '01980a00-0000-7000-8000-000000000002'
      and audit_record.actor_role = 'trainer'
      and audit_record.correlation_id =
        '01980f40-0000-7000-8000-000000000010'
      and audit_record.metadata ->> 'reason' =
        'Trainer completes cohort and linked assignments atomically'
      and audit_record.metadata ->> 'previous_state' = 'assigned'
      and audit_record.metadata ->> 'state' = 'completed'
  ),
  2::bigint,
  'completion appends one actor/correlation/reason-bound audit event per transitioned enrollment'
);

select is(
  (
    select count(*)
    from public.outbox_events outbox_record
    where outbox_record.aggregate_type = 'enrollment'
      and outbox_record.event_type = 'enrollment.completed.v1'
      and outbox_record.aggregate_id in (
        '01980f33-0000-7000-8000-000000000001',
        '01980f33-0000-7000-8000-000000000002'
      )
      and outbox_record.aggregate_version = 2
      and outbox_record.schema_version = 1
      and outbox_record.correlation_id =
        '01980f40-0000-7000-8000-000000000010'
      and outbox_record.payload ->> 'actor_id' =
        '01980a00-0000-7000-8000-000000000002'
      and outbox_record.payload ->> 'reason' =
        'Trainer completes cohort and linked assignments atomically'
      and outbox_record.payload ->> 'state' = 'completed'
  ),
  2::bigint,
  'completion appends one canonical v1 outbox event per transitioned enrollment'
);

select results_eq(
  $$
    select
      metadata ->> 'affected_enrollment_count',
      metadata ->> 'membership_policy',
      metadata ->> 'reason'
    from public.audit_events
    where aggregate_type = 'cohort'
      and aggregate_id = '01980f30-0000-7000-8000-000000000001'
      and event_type = 'cohort.completed'
  $$,
  $$ values (
    '2'::text,
    'preserve_active_unremoved_memberships'::text,
    'Trainer completes cohort and linked assignments atomically'::text
  ) $$,
  'cohort completion audit records affected count and immutable membership policy'
);

select results_eq(
  $$
    select
      payload ->> 'affected_enrollment_count',
      payload ->> 'membership_policy',
      payload ->> 'actor_id'
    from public.outbox_events
    where aggregate_type = 'cohort'
      and aggregate_id = '01980f30-0000-7000-8000-000000000001'
      and event_type = 'cohort.completed.v1'
  $$,
  $$ values (
    '2'::text,
    'preserve_active_unremoved_memberships'::text,
    '01980a00-0000-7000-8000-000000000002'::text
  ) $$,
  'cohort completion outbox records actor, affected count, and membership policy'
);

select is(
  (
    select count(*)
    from public.notifications notification_record
    where notification_record.event_type = 'cohort.completed'
      and notification_record.payload ->> 'cohort_id' =
        '01980f30-0000-7000-8000-000000000001'
  ),
  3::bigint,
  'completion retains exactly one cohort notification for each active learner member'
);

select is(
  (
    select count(*)
    from public.notifications notification_record
    where notification_record.event_type = 'enrollment.completed'
      and notification_record.recipient_id in (
        '01980f00-0000-7000-8000-000000000001',
        '01980f00-0000-7000-8000-000000000002'
      )
  ),
  0::bigint,
  'terminal enrollment effects do not duplicate cohort notifications'
);

select is(
  (
    select count(*)
    from public.cohort_schedule_command_receipts receipt_record
    where receipt_record.actor_id =
        '01980a00-0000-7000-8000-000000000002'
      and receipt_record.operation = 'cohort.transition'
      and receipt_record.aggregate_id =
        '01980f30-0000-7000-8000-000000000001'
      and receipt_record.idempotency_key =
        'terminal-complete-idempotency-0010'
  ),
  1::bigint,
  'completion stores exactly one actor-scoped terminal command receipt'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select (public.transition_cohort(
      '01980f30-0000-7000-8000-000000000001', 1, 'completed',
      'Trainer completes cohort and linked assignments atomically',
      '01980f40-0000-7000-8000-000000000011',
      'terminal-complete-idempotency-0010'
    )).row_version
  ),
  2::bigint,
  'exact replay returns the stored result despite a new correlation ID'
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980f30-0000-7000-8000-000000000001', 1, 'completed',
       'Changed completion reason cannot reuse receipt',
       '01980f40-0000-7000-8000-000000000012',
       'terminal-complete-idempotency-0010'
     ) $$,
  '22023', 'idempotency key was reused with a different cohort payload',
  'payload-bound receipt rejects key reuse with changed terminal reason'
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980f30-0000-7000-8000-000000000001', 1, 'completed',
       'Different key cannot bypass stale cohort CAS',
       '01980f40-0000-7000-8000-000000000013',
       'terminal-complete-stale-new-key-0013'
     ) $$,
  '40001', 'cohort is stale',
  'different-key terminal retry cannot bypass stale CAS'
);

reset role;

select ok(
  (
    select count(*) = 2
    from public.audit_events audit_record
    where audit_record.aggregate_type = 'enrollment'
      and audit_record.event_type = 'enrollment.completed'
      and audit_record.aggregate_id in (
        '01980f33-0000-7000-8000-000000000001',
        '01980f33-0000-7000-8000-000000000002'
      )
  )
  and (
    select count(*) = 2
    from public.outbox_events outbox_record
    where outbox_record.aggregate_type = 'enrollment'
      and outbox_record.event_type = 'enrollment.completed.v1'
      and outbox_record.aggregate_id in (
        '01980f33-0000-7000-8000-000000000001',
        '01980f33-0000-7000-8000-000000000002'
      )
  )
  and (
    select count(*) = 3
    from public.notifications notification_record
    where notification_record.event_type = 'cohort.completed'
      and notification_record.payload ->> 'cohort_id' =
        '01980f30-0000-7000-8000-000000000001'
  ),
  'receipt replay and failed competing calls never repeat terminal side effects'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980f00-0000-7000-8000-000000000001', true
);

select results_eq(
  $$
    select enrollment_state, cohort_state, content_version_id, next_task_id
    from public.list_my_learning_courses('en')
  $$,
  $$ values (
    'completed'::public.enrollment_state,
    'completed'::public.cohort_state,
    '01980a22-0000-7000-8000-000000000001'::uuid,
    null::uuid
  ) $$,
  '998 dashboard projection exposes terminal completion as exact pinned history'
);

select results_eq(
  $$
    select
      projection ->> 'enrollment_state',
      projection ->> 'cohort_state',
      projection #>> '{stages,0,activities,0,state}'
    from (select public.get_my_learning_course(
      '01980a20-0000-7000-8000-000000000001', 'en'
    ) projection) course_projection
  $$,
  $$ values ('completed'::text, 'completed'::text, 'locked'::text) $$,
  '998 course projection retains completed content as read-only history'
);

select is(
  public.get_my_learning_task(
    '01980a26-0000-7000-8000-000000000001'
  ),
  null::jsonb,
  '998 task boundary denies terminal completed learners'
);

reset role;

select ok(
  (select state from public.cohorts
   where id = '01980f30-0000-7000-8000-000000000006') = 'active'
  and (select state from public.enrollments
       where id = '01980f33-0000-7000-8000-00000000000c') = 'assigned'
  and not exists (
    select 1 from public.cohort_schedule_command_receipts receipt_record
    where receipt_record.aggregate_id =
      '01980f30-0000-7000-8000-000000000006'
  )
  and not exists (
    select 1 from public.audit_events audit_record
    where audit_record.correlation_id =
      '01980f40-0000-7000-8000-000000000006'
  ),
  'corrupt terminalization rolls back cohort, enrollment, events, and receipt'
);

select extensions.dblink_connect(
  'terminal_assignment_race',
  'host=supabase_db_ditele-v2 port=5432 dbname=postgres user=postgres password=postgres'
);

select is(
  extensions.dblink_exec(
    'terminal_assignment_race',
    $setup$
      begin;

      delete from public.notifications notification_record
      where notification_record.recipient_id in (
        '01980f00-0000-7000-8000-00000000000d',
        '01980f00-0000-7000-8000-00000000000e'
      );

      delete from public.enrollments enrollment_record
      where enrollment_record.id in (
        '01980f33-0000-7000-8000-00000000000d',
        '01980f33-0000-7000-8000-000000000012'
      );

      delete from public.cohort_memberships membership_record
      where membership_record.cohort_id =
        '01980f30-0000-7000-8000-00000000000c';

      delete from public.cohorts cohort_record
      where cohort_record.id =
        '01980f30-0000-7000-8000-00000000000c';

      delete from public.organization_memberships membership_record
      where membership_record.user_id in (
        '01980f00-0000-7000-8000-00000000000d',
        '01980f00-0000-7000-8000-00000000000e'
      );

      delete from auth.users user_record
      where user_record.id in (
        '01980f00-0000-7000-8000-00000000000d',
        '01980f00-0000-7000-8000-00000000000e'
      );

      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, confirmation_token, recovery_token,
        email_change, email_change_token_new
      ) values
        (
          '00000000-0000-0000-0000-000000000000',
          '01980f00-0000-7000-8000-00000000000d',
          'authenticated', 'authenticated',
          'terminal-concurrency-learner@test.invalid',
          extensions.crypt(
            'Ditele-Local-2026!', extensions.gen_salt('bf')
          ),
          statement_timestamp(),
          '{"provider":"email","providers":["email"],"seed_fixture":"true","test_fixture":"terminal-concurrency"}'::jsonb,
          '{"display_name":"Terminal Concurrency Learner","locale":"en"}'::jsonb,
          statement_timestamp(), statement_timestamp(), '', '', '', ''
        ),
        (
          '00000000-0000-0000-0000-000000000000',
          '01980f00-0000-7000-8000-00000000000e',
          'authenticated', 'authenticated',
          'assignment-concurrency-learner@test.invalid',
          extensions.crypt(
            'Ditele-Local-2026!', extensions.gen_salt('bf')
          ),
          statement_timestamp(),
          '{"provider":"email","providers":["email"],"seed_fixture":"true","test_fixture":"assignment-concurrency"}'::jsonb,
          '{"display_name":"Assignment Concurrency Learner","locale":"en"}'::jsonb,
          statement_timestamp(), statement_timestamp(), '', '', '', ''
        );

      insert into public.organization_memberships (
        organization_id, user_id, state, joined_at
      ) values
        (
          '01980a10-0000-7000-8000-000000000001',
          '01980f00-0000-7000-8000-00000000000d',
          'active', statement_timestamp()
        ),
        (
          '01980a10-0000-7000-8000-000000000001',
          '01980f00-0000-7000-8000-00000000000e',
          'active', statement_timestamp()
        );

      insert into public.cohorts (
        id, organization_id, course_id, content_version_id, name, state,
        progression_mode, starts_at, capacity, created_by
      ) values (
        '01980f30-0000-7000-8000-00000000000c',
        '01980a10-0000-7000-8000-000000000001',
        '01980a20-0000-7000-8000-000000000001',
        '01980a22-0000-7000-8000-000000000001',
        'Terminal Concurrency Cohort', 'active', 'scheduled',
        statement_timestamp() - interval '1 day', 1,
        '01980a00-0000-7000-8000-000000000003'
      );

      insert into public.enrollments (
        id, organization_id, learner_id, course_id, state,
        request_note, decision_reason, idempotency_key, decided_by,
        decided_at
      ) values
        (
          '01980f33-0000-7000-8000-00000000000d',
          '01980a10-0000-7000-8000-000000000001',
          '01980f00-0000-7000-8000-00000000000d',
          '01980a20-0000-7000-8000-000000000001',
          'approved', 'Concurrency assignment request',
          'Approved before overlapping assignment',
          'terminal-concurrency-approved-0013',
          '01980a00-0000-7000-8000-000000000003',
          statement_timestamp()
        ),
        (
          '01980f33-0000-7000-8000-000000000012',
          '01980a10-0000-7000-8000-000000000001',
          '01980f00-0000-7000-8000-00000000000e',
          '01980a20-0000-7000-8000-000000000001',
          'approved', 'Second concurrent assignment request',
          'Approved before concurrent capacity race',
          'assignment-concurrency-approved-0018',
          '01980a00-0000-7000-8000-000000000003',
          statement_timestamp()
        );

      commit;
    $setup$
  ),
  'COMMIT'::text,
  'concurrency fixture is committed outside the pgTAP rollback transaction'
);

select extensions.dblink_connect(
  'terminal_transition_race',
  'host=supabase_db_ditele-v2 port=5432 dbname=postgres user=postgres password=postgres'
);

select is(
  extensions.dblink_exec(
    'terminal_transition_race',
    $configure$
      begin;
      set local role authenticated;
      set local "request.jwt.claim.role" = 'authenticated';
      set local "request.jwt.claim.sub" =
        '01980a00-0000-7000-8000-000000000003';

      create or replace function pg_temp.capture_terminal_transition()
      returns table (
        outcome text,
        cohort_state text,
        enrollment_state text
      )
      language plpgsql
      as $capture$
      declare
        transitioned_cohort public.cohorts;
      begin
        select transition_result.* into transitioned_cohort
        from public.transition_cohort(
          '01980f30-0000-7000-8000-00000000000c',
          1,
          'completed',
          'Concurrent terminalization includes committed assignment',
          '01980f40-0000-7000-8000-000000000050',
          'terminal-concurrent-complete-0050'
        ) transition_result;

        outcome := 'completed';
        cohort_state := transitioned_cohort.state::text;
        select enrollment_record.state::text into enrollment_state
        from public.enrollments enrollment_record
        where enrollment_record.id =
          '01980f33-0000-7000-8000-00000000000d';
        return next;
      exception
        when sqlstate '40001' then
          outcome := sqlstate || ':' || sqlerrm;
          cohort_state := null;
          enrollment_state := null;
          return next;
      end;
      $capture$;
    $configure$
  ),
  'CREATE FUNCTION'::text,
  'terminal concurrency session starts with claims and retry capture boundary'
);

select extensions.dblink_connect(
  'concurrent_assignment_race',
  'host=supabase_db_ditele-v2 port=5432 dbname=postgres user=postgres password=postgres'
);

select is(
  extensions.dblink_exec(
    'concurrent_assignment_race',
    $configure$
      begin;
      set local role authenticated;
      set local "request.jwt.claim.role" = 'authenticated';
      set local "request.jwt.claim.sub" =
        '01980a00-0000-7000-8000-000000000003';

      create or replace function pg_temp.capture_concurrent_assignment()
      returns table (
        outcome text,
        enrollment_state text
      )
      language plpgsql
      as $capture$
      declare
        assigned_enrollment public.enrollments;
      begin
        select assignment_result.* into assigned_enrollment
        from public.assign_enrollment(
          '01980f33-0000-7000-8000-000000000012',
          '01980f30-0000-7000-8000-00000000000c',
          1,
          'Concurrent capacity assignment retries safely',
          '01980f40-0000-7000-8000-000000000051'
        ) assignment_result;

        outcome := 'assigned';
        enrollment_state := assigned_enrollment.state::text;
        return next;
      exception
        when sqlstate '40001' or sqlstate '23514' then
          outcome := sqlstate || ':' || sqlerrm;
          enrollment_state := null;
          return next;
      end;
      $capture$;
    $configure$
  ),
  'CREATE FUNCTION'::text,
  'assignment concurrency session starts with claims and retry capture boundary'
);

select ok(
  extensions.dblink_send_query(
    'terminal_assignment_race',
    $assignment$
      with locked_enrollment as materialized (
        select enrollment_record.id
        from public.enrollments enrollment_record
        where enrollment_record.id =
          '01980f33-0000-7000-8000-00000000000d'
          and enrollment_record.state = 'approved'
        for update
      ),
      locked_assignment_revision as materialized (
        select revision_record.cohort_id, revision_record.revision
        from app_private.cohort_assignment_revisions revision_record
        cross join locked_enrollment
        where revision_record.cohort_id =
          '01980f30-0000-7000-8000-00000000000c'
        for update
      ),
      locked_cohort as materialized (
        select cohort_record.id
        from public.cohorts cohort_record
        cross join locked_assignment_revision
        where cohort_record.id =
          '01980f30-0000-7000-8000-00000000000c'
        for update
      ),
      linked_enrollment as (
        update public.enrollments enrollment_record
        set state = 'assigned',
            cohort_id = locked_cohort.id,
            decision_reason =
              'Concurrent assignment commits before terminal cohort lock',
            decided_by = '01980a00-0000-7000-8000-000000000003',
            decided_at = statement_timestamp()
        from locked_cohort
        where enrollment_record.id =
          '01980f33-0000-7000-8000-00000000000d'
        returning enrollment_record.state, enrollment_record.learner_id
      ),
      inserted_membership as (
        insert into public.cohort_memberships (
          cohort_id, user_id, role, state, assigned_by
        )
        select
          '01980f30-0000-7000-8000-00000000000c',
          linked_enrollment.learner_id,
          'learner',
          'active',
          '01980a00-0000-7000-8000-000000000003'
        from linked_enrollment
        returning cohort_id
      ),
      advanced_assignment_revision as (
        update app_private.cohort_assignment_revisions revision_record
        set revision = revision_record.revision + 1,
            updated_at = statement_timestamp()
        from inserted_membership
        where revision_record.cohort_id =
          '01980f30-0000-7000-8000-00000000000c'
        returning revision_record.revision
      )
      select
        linked_enrollment.state::text,
        advanced_assignment_revision.revision::text,
        pg_catalog.pg_sleep(1)
      from linked_enrollment
      cross join advanced_assignment_revision
    $assignment$
  ) = 1,
  'assignment session links the enrollment while retaining the cohort lock'
);

select pg_catalog.pg_sleep(0.2);

select ok(
  extensions.dblink_send_query(
    'terminal_transition_race',
    $terminal$
      select * from pg_temp.capture_terminal_transition()
    $terminal$
  ) = 1,
  'terminal session overlaps the in-flight assignment command'
);

select ok(
  extensions.dblink_send_query(
    'concurrent_assignment_race',
    'select * from pg_temp.capture_concurrent_assignment()'
  ) = 1,
  'second assignment session overlaps the in-flight assignment command'
);

select pg_catalog.pg_sleep(0.2);

select is(
  extensions.dblink_is_busy('terminal_transition_race'),
  1,
  'terminalization waits for the assignment session cohort lock without deadlocking'
);

select is(
  extensions.dblink_is_busy('concurrent_assignment_race'),
  1,
  'capacity assignment waits for the assignment revision lock without deadlocking'
);

create temporary table terminal_assignment_race_result (
  enrollment_state text not null,
  assignment_revision text not null,
  delay_result text
) on commit drop;

insert into terminal_assignment_race_result (
  enrollment_state, assignment_revision, delay_result
)
select
  race_result.enrollment_state,
  race_result.assignment_revision,
  race_result.delay_result
from extensions.dblink_get_result('terminal_assignment_race') as race_result(
  enrollment_state text,
  assignment_revision text,
  delay_result text
);

select is(
  (
    select count(*)
    from extensions.dblink_get_result(
      'terminal_assignment_race'
    ) as drained_result(
      enrollment_state text,
      assignment_revision text,
      delay_result text
    )
  ),
  0::bigint,
  'assignment async result channel is fully drained'
);

select results_eq(
  $$
    select enrollment_state, assignment_revision
    from terminal_assignment_race_result
  $$,
  $$ values ('assigned'::text, '1'::text) $$,
  'overlapping assignment commits its linked state and advances the guard'
);

create temporary table terminal_transition_race_result (
  outcome text not null,
  cohort_state text,
  enrollment_state text
) on commit drop;

insert into terminal_transition_race_result (
  outcome, cohort_state, enrollment_state
)
select race_result.outcome, race_result.cohort_state, race_result.enrollment_state
from extensions.dblink_get_result('terminal_transition_race') as race_result(
  outcome text,
  cohort_state text,
  enrollment_state text
);

select is(
  (
    select count(*)
    from extensions.dblink_get_result(
      'terminal_transition_race'
    ) as drained_result(
      outcome text,
      cohort_state text,
      enrollment_state text
    )
  ),
  0::bigint,
  'stale terminal async result channel is fully drained before retry'
);

select results_eq(
  $$
    select outcome, cohort_state, enrollment_state
    from terminal_transition_race_result
  $$,
  $$ values (
    '40001:cohort assignments changed; retry transition'::text,
    null::text,
    null::text
  ) $$,
  'stale-snapshot terminalization returns an explicit retry without side effects'
);

create temporary table concurrent_assignment_race_result (
  outcome text not null,
  enrollment_state text
) on commit drop;

insert into concurrent_assignment_race_result (outcome, enrollment_state)
select race_result.outcome, race_result.enrollment_state
from extensions.dblink_get_result('concurrent_assignment_race') as race_result(
  outcome text,
  enrollment_state text
);

select is(
  (
    select count(*)
    from extensions.dblink_get_result(
      'concurrent_assignment_race'
    ) as drained_result(
      outcome text,
      enrollment_state text
    )
  ),
  0::bigint,
  'stale assignment async result channel is fully drained before retry'
);

select results_eq(
  $$
    select outcome, enrollment_state
    from concurrent_assignment_race_result
  $$,
  $$ values (
    '40001:cohort assignments changed; retry assignment'::text,
    null::text
  ) $$,
  'stale-snapshot assignment returns an explicit retry before capacity checks'
);

truncate table concurrent_assignment_race_result;

select ok(
  extensions.dblink_send_query(
    'concurrent_assignment_race',
    'select * from pg_temp.capture_concurrent_assignment()'
  ) = 1,
  'assignment retry starts with a fresh READ COMMITTED statement snapshot'
);

insert into concurrent_assignment_race_result (outcome, enrollment_state)
select race_result.outcome, race_result.enrollment_state
from extensions.dblink_get_result('concurrent_assignment_race') as race_result(
  outcome text,
  enrollment_state text
);

select is(
  (
    select count(*)
    from extensions.dblink_get_result(
      'concurrent_assignment_race'
    ) as drained_result(
      outcome text,
      enrollment_state text
    )
  ),
  0::bigint,
  'fresh assignment async result channel is fully drained'
);

select results_eq(
  $$
    select outcome, enrollment_state
    from concurrent_assignment_race_result
  $$,
  $$ values (
    '23514:cohort capacity is exhausted'::text,
    null::text
  ) $$,
  'fresh-snapshot assignment retry observes committed capacity and rejects overbooking'
);

truncate table terminal_transition_race_result;

select ok(
  extensions.dblink_send_query(
    'terminal_transition_race',
    'select * from pg_temp.capture_terminal_transition()'
  ) = 1,
  'terminal retry starts with a fresh READ COMMITTED statement snapshot'
);

insert into terminal_transition_race_result (
  outcome, cohort_state, enrollment_state
)
select race_result.outcome, race_result.cohort_state, race_result.enrollment_state
from extensions.dblink_get_result('terminal_transition_race') as race_result(
  outcome text,
  cohort_state text,
  enrollment_state text
);

select is(
  (
    select count(*)
    from extensions.dblink_get_result(
      'terminal_transition_race'
    ) as drained_result(
      outcome text,
      cohort_state text,
      enrollment_state text
    )
  ),
  0::bigint,
  'successful terminal async result channel is fully drained'
);

select results_eq(
  $$
    select outcome, cohort_state, enrollment_state
    from terminal_transition_race_result
  $$,
  $$ values (
    'completed'::text,
    'completed'::text,
    'completed'::text
  ) $$,
  'fresh-snapshot retry atomically terminalizes the committed assignment'
);

select is(
  extensions.dblink_exec('terminal_transition_race', 'rollback'),
  'ROLLBACK'::text,
  'concurrency terminal transaction rolls back all isolated side effects'
);

select is(
  extensions.dblink_disconnect('terminal_transition_race'),
  'OK'::text,
  'terminal concurrency session disconnects cleanly'
);

select is(
  extensions.dblink_exec('concurrent_assignment_race', 'rollback'),
  'ROLLBACK'::text,
  'concurrent assignment transaction rolls back all isolated effects'
);

select is(
  extensions.dblink_disconnect('concurrent_assignment_race'),
  'OK'::text,
  'concurrent assignment session disconnects cleanly'
);

select ok(
  (select state = 'active' and row_version = 1
   from public.cohorts
   where id = '01980f30-0000-7000-8000-00000000000c')
  and (select state = 'assigned' and row_version = 2
       from public.enrollments
       where id = '01980f33-0000-7000-8000-00000000000d')
  and (select state = 'approved' and row_version = 1
       from public.enrollments
       where id = '01980f33-0000-7000-8000-000000000012')
  and (
    select count(*) = 1
    from public.cohort_memberships membership_record
    where membership_record.cohort_id =
        '01980f30-0000-7000-8000-00000000000c'
      and membership_record.role = 'learner'
      and membership_record.state = 'active'
      and membership_record.removed_at is null
  )
  and (select revision = 1
       from app_private.cohort_assignment_revisions revision_record
       where revision_record.cohort_id =
         '01980f30-0000-7000-8000-00000000000c')
  and not exists (
    select 1 from public.cohort_schedule_command_receipts receipt_record
    where receipt_record.aggregate_id =
      '01980f30-0000-7000-8000-00000000000c'
  ),
  'rollbacks preserve one committed capacity assignment and no terminal receipt'
);

select is(
  extensions.dblink_exec(
    'terminal_assignment_race',
    $cleanup$
      begin;

      delete from public.enrollments enrollment_record
      where enrollment_record.id in (
        '01980f33-0000-7000-8000-00000000000d',
        '01980f33-0000-7000-8000-000000000012'
      );

      delete from public.cohort_memberships membership_record
      where membership_record.cohort_id =
        '01980f30-0000-7000-8000-00000000000c';

      delete from public.cohorts cohort_record
      where cohort_record.id =
        '01980f30-0000-7000-8000-00000000000c';

      delete from public.organization_memberships membership_record
      where membership_record.user_id in (
        '01980f00-0000-7000-8000-00000000000d',
        '01980f00-0000-7000-8000-00000000000e'
      );

      delete from auth.users user_record
      where user_record.id in (
        '01980f00-0000-7000-8000-00000000000d',
        '01980f00-0000-7000-8000-00000000000e'
      );

      commit;
    $cleanup$
  ),
  'COMMIT'::text,
  'external concurrency fixture cleanup commits successfully'
);

select is(
  extensions.dblink_disconnect('terminal_assignment_race'),
  'OK'::text,
  'assignment concurrency session disconnects cleanly'
);

select ok(
  not exists (
    select 1 from public.enrollments enrollment_record
    where enrollment_record.id in (
      '01980f33-0000-7000-8000-00000000000d',
      '01980f33-0000-7000-8000-000000000012'
    )
  )
  and not exists (
    select 1 from public.cohorts cohort_record
    where cohort_record.id =
      '01980f30-0000-7000-8000-00000000000c'
  )
  and not exists (
    select 1 from auth.users user_record
    where user_record.id in (
      '01980f00-0000-7000-8000-00000000000d',
      '01980f00-0000-7000-8000-00000000000e'
    )
  ),
  'concurrency regression leaves no persistent fixture rows'
);

select * from finish();
rollback;
