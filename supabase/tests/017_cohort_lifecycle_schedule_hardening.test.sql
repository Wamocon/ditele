begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select has_column(
  'public', 'cohorts', 'content_version_id',
  'cohorts pin an explicit immutable content version'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conname = 'cohorts_content_version_id_fkey'
      and constraint_record.conrelid = 'public.cohorts'::pg_catalog.regclass
      and constraint_record.confrelid =
        'public.content_versions'::pg_catalog.regclass
      and constraint_record.confdeltype = 'r'
      and constraint_record.convalidated
  ),
  'the cohort content pin is a validated restrictive foreign key'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes index_record
    where index_record.schemaname = 'public'
      and index_record.indexname = 'cohorts_content_version_id_idx'
  ),
  'the cohort content-version foreign key is indexed'
);

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
  'transition_cohort has one canonical signature without an overload'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'update_task_schedule'
  ),
  1::bigint,
  'update_task_schedule has one canonical signature without an overload'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname in (
        'transition_cohort', 'update_task_schedule'
      )
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
  ),
  2::bigint,
  'both commands are security-definer functions with an empty search path'
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
  'the lifecycle command preserves old argument order and adds one trailing key'
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
  'the lifecycle idempotency key is the only defaulted argument'
);

select is(
  (
    select array_to_string(procedure_record.proargnames, ',')
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.update_task_schedule(uuid,uuid,bigint,timestamptz,timestamptz,text,uuid,text)'
        ::pg_catalog.regprocedure
  ),
  'p_cohort_id,p_task_id,p_expected_version,p_available_from,p_due_at,p_reason,p_correlation_id,p_idempotency_key',
  'the schedule command preserves old argument order and adds one trailing key'
);

select is(
  (
    select procedure_record.pronargdefaults
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.update_task_schedule(uuid,uuid,bigint,timestamptz,timestamptz,text,uuid,text)'
        ::pg_catalog.regprocedure
  ),
  1::smallint,
  'the schedule idempotency key is the only defaulted argument'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.transition_cohort(uuid,bigint,public.cohort_state,text,uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.update_task_schedule(uuid,uuid,bigint,timestamptz,timestamptz,text,uuid,text)',
    'EXECUTE'
  ),
  'authenticated sessions can execute both audited commands'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.transition_cohort(uuid,bigint,public.cohort_state,text,uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.update_task_schedule(uuid,uuid,bigint,timestamptz,timestamptz,text,uuid,text)',
    'EXECUTE'
  ),
  'anonymous sessions cannot execute either command'
);

select ok(
  not has_table_privilege('authenticated', 'public.cohorts', 'INSERT')
  and not has_table_privilege('authenticated', 'public.cohorts', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.cohorts', 'DELETE')
  and has_column_privilege(
    'authenticated', 'public.cohorts', 'capacity', 'UPDATE'
  )
  and not has_column_privilege(
    'authenticated', 'public.cohorts', 'state', 'UPDATE'
  )
  and not has_column_privilege(
    'authenticated', 'public.cohorts', 'content_version_id', 'UPDATE'
  )
  and not has_column_privilege(
    'authenticated', 'public.cohorts', 'completed_at', 'UPDATE'
  )
  and not has_column_privilege(
    'authenticated', 'public.cohorts', 'starts_at', 'UPDATE'
  )
  and not has_column_privilege(
    'authenticated', 'public.cohorts', 'ends_at', 'UPDATE'
  )
  and not has_column_privilege(
    'authenticated', 'public.cohorts', 'source_system', 'UPDATE'
  )
  and not has_column_privilege(
    'authenticated', 'public.cohorts', 'external_id', 'UPDATE'
  ),
  'cohort metadata remains field-limited while lifecycle and pin columns are command-only'
);

select ok(
  not has_table_privilege(
    'authenticated', 'public.task_schedules', 'INSERT'
  )
  and not has_table_privilege(
    'authenticated', 'public.task_schedules', 'UPDATE'
  )
  and not has_table_privilege(
    'authenticated', 'public.task_schedules', 'DELETE'
  ),
  'authenticated callers cannot bypass the schedule command with direct DML'
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
  ),
  'command receipts are private from browser sessions'
);

select ok(
  (
    select class_record.relrowsecurity and class_record.relforcerowsecurity
    from pg_catalog.pg_class class_record
    where class_record.oid =
      'public.cohort_schedule_command_receipts'::pg_catalog.regclass
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
  'receipt storage is forced-RLS and append-only'
);

select ok(
  (select content_version_id from public.cohorts
   where id = '01980a30-0000-7000-8000-000000000001') =
    '01980a22-0000-7000-8000-000000000001'::uuid
  and (select state from public.cohorts
       where id = '01980a30-0000-7000-8000-000000000001') = 'active'
  and (select row_version from public.cohorts
       where id = '01980a30-0000-7000-8000-000000000001') = 2,
  'the deterministic seed is pinned and activated through the audited command'
);

insert into public.organizations (id, slug, name, state)
values (
  '01980d10-0000-7000-8000-000000000001',
  'cohort-command-other-tenant', 'Cohort Command Other Tenant', 'active'
);

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, created_by
)
values
  (
    '01980d30-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Lifecycle idempotency cohort', 'waiting', 'scheduled',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980d30-0000-7000-8000-000000000002',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Manager cancellation cohort', 'waiting', 'scheduled',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980d30-0000-7000-8000-000000000003',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Archived pin active cohort', 'waiting', 'scheduled',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980d30-0000-7000-8000-000000000004',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Waiting schedule cohort', 'waiting', 'scheduled',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980d30-0000-7000-8000-000000000005',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Unassigned trainer cohort', 'waiting', 'scheduled',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980d30-0000-7000-8000-000000000006',
    '01980d10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Cross tenant command cohort', 'waiting', 'scheduled',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980d30-0000-7000-8000-000000000007',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Trainer activity scope cohort', 'waiting', 'scheduled',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980d30-0000-7000-8000-000000000008',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Legacy lifecycle caller cohort', 'waiting', 'scheduled',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980d30-0000-7000-8000-000000000009',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Field limited metadata cohort', 'waiting', 'scheduled',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980d30-0000-7000-8000-00000000000a',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Legacy schedule caller cohort', 'waiting', 'scheduled',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.cohort_memberships (
  cohort_id, user_id, role, state, assigned_by
)
values
  ('01980d30-0000-7000-8000-000000000001', '01980a00-0000-7000-8000-000000000002', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980d30-0000-7000-8000-000000000001', '01980a00-0000-7000-8000-000000000001', 'learner', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980d30-0000-7000-8000-000000000001', '01980a00-0000-7000-8000-000000000004', 'learner', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980d30-0000-7000-8000-000000000002', '01980a00-0000-7000-8000-000000000002', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980d30-0000-7000-8000-000000000003', '01980a00-0000-7000-8000-000000000002', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980d30-0000-7000-8000-000000000003', '01980a00-0000-7000-8000-000000000001', 'learner', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980d30-0000-7000-8000-000000000004', '01980a00-0000-7000-8000-000000000002', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980d30-0000-7000-8000-000000000004', '01980a00-0000-7000-8000-000000000001', 'learner', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980d30-0000-7000-8000-000000000006', '01980a00-0000-7000-8000-000000000002', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980d30-0000-7000-8000-000000000007', '01980a00-0000-7000-8000-000000000002', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980d30-0000-7000-8000-000000000008', '01980a00-0000-7000-8000-000000000002', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980d30-0000-7000-8000-00000000000a', '01980a00-0000-7000-8000-000000000002', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000001', 1, 'active',
       'Missing session cannot start a cohort',
       '01980d40-0000-7000-8000-000000000001',
       'missing-session-transition-0001'
     ) $$,
  '42501', 'authentication required',
  'a missing authenticated subject cannot invoke lifecycle commands'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000001', 1, 'active',
       'Learner attempts to start a cohort',
       '01980d40-0000-7000-8000-000000000002',
       'learner-transition-denied-0001'
     ) $$,
  '42501', 'cohort lifecycle scope denied',
  'a learner cannot start a cohort despite being assigned to it'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000005', 1, 'active',
       'Trainer attempts an unassigned same-tenant cohort',
       '01980d40-0000-7000-8000-000000000003',
       'wrong-cohort-transition-0001'
     ) $$,
  '42501', 'cohort lifecycle scope denied',
  'a trainer cannot operate an unassigned same-tenant cohort'
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000006', 1, 'active',
       'Trainer attempts a cohort in another tenant',
       '01980d40-0000-7000-8000-000000000004',
       'cross-tenant-transition-0001'
     ) $$,
  '42501', 'cohort lifecycle scope denied',
  'a cohort assignment cannot bypass active tenant membership isolation'
);

reset role;
update public.cohort_memberships
set state = 'suspended'
where cohort_id = '01980d30-0000-7000-8000-000000000007'
  and user_id = '01980a00-0000-7000-8000-000000000002'
  and role = 'trainer';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000007', 1, 'active',
       'Suspended trainer assignment cannot start',
       '01980d40-0000-7000-8000-000000000005',
       'suspended-trainer-transition-0001'
     ) $$,
  '42501', 'cohort lifecycle scope denied',
  'a suspended exact-cohort trainer assignment is rejected'
);

reset role;
update public.cohort_memberships
set state = 'active'
where cohort_id = '01980d30-0000-7000-8000-000000000007'
  and user_id = '01980a00-0000-7000-8000-000000000002'
  and role = 'trainer';
update public.organization_memberships
set state = 'suspended'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000007', 1, 'active',
       'Suspended tenant membership cannot start',
       '01980d40-0000-7000-8000-000000000006',
       'suspended-tenant-transition-0001'
     ) $$,
  '42501', 'cohort lifecycle scope denied',
  'a suspended organization membership is rejected'
);

reset role;
update public.organization_memberships
set state = 'active'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000002';
update public.profiles
set state = 'inactive', deactivated_at = statement_timestamp()
where user_id = '01980a00-0000-7000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000007', 1, 'active',
       'Inactive trainer profile cannot start',
       '01980d40-0000-7000-8000-000000000007',
       'inactive-profile-transition-0001'
     ) $$,
  '42501', 'cohort lifecycle scope denied',
  'an inactive trainer profile is rejected'
);

reset role;
update public.profiles
set state = 'active', deactivated_at = null
where user_id = '01980a00-0000-7000-8000-000000000002';
update public.user_roles role_assignment
set revoked_at = statement_timestamp()
from public.roles role_record
where role_assignment.role_id = role_record.id
  and role_assignment.user_id = '01980a00-0000-7000-8000-000000000002'
  and role_record.code = 'trainer';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000007', 1, 'active',
       'Revoked trainer role cannot start',
       '01980d40-0000-7000-8000-000000000008',
       'revoked-role-transition-0001'
     ) $$,
  '42501', 'cohort lifecycle scope denied',
  'a revoked trainer role is rejected'
);

reset role;
update public.user_roles role_assignment
set revoked_at = null
from public.roles role_record
where role_assignment.role_id = role_record.id
  and role_assignment.user_id = '01980a00-0000-7000-8000-000000000002'
  and role_record.code = 'trainer';
update public.organizations
set state = 'suspended'
where id = '01980a10-0000-7000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000007', 1, 'active',
       'Suspended organization cannot start',
       '01980d40-0000-7000-8000-000000000009',
       'suspended-org-transition-0001'
     ) $$,
  '42501', 'cohort lifecycle scope denied',
  'a suspended organization is rejected'
);

reset role;
update public.organizations
set state = 'active'
where id = '01980a10-0000-7000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select throws_ok(
  $$ update public.cohorts
     set state = 'active'
     where id = '01980d30-0000-7000-8000-000000000009' $$,
  '42501', 'permission denied for table cohorts',
  'even an admin cannot directly mutate cohort lifecycle state'
);

select throws_ok(
  $$ update public.cohorts
     set content_version_id = '01980a22-0000-7000-8000-000000000001'
     where id = '01980d30-0000-7000-8000-000000000009' $$,
  '42501', 'permission denied for table cohorts',
  'even an admin cannot directly mutate a cohort content pin'
);

select throws_ok(
  $$ update public.cohorts
     set starts_at = statement_timestamp()
     where id = '01980d30-0000-7000-8000-000000000009' $$,
  '42501', 'permission denied for table cohorts',
  'even an admin cannot bypass lifecycle facts through a direct start date edit'
);

select throws_ok(
  $$ insert into public.task_schedules (
       cohort_id, task_id, change_reason
     ) values (
       '01980d30-0000-7000-8000-000000000009',
       '01980a26-0000-7000-8000-000000000001',
       'Direct schedule bypass'
     ) $$,
  '42501', 'permission denied for table task_schedules',
  'even an admin cannot insert a task schedule directly'
);

select lives_ok(
  $$ update public.cohorts
     set capacity = 42
     where id = '01980d30-0000-7000-8000-000000000009' $$,
  'an authorized admin retains a field-limited metadata update'
);

reset role;
select throws_ok(
  $$ insert into public.cohorts (
       id, organization_id, course_id, name, state, progression_mode
     ) values (
       '01980d30-0000-7000-8000-00000000000b',
       '01980a10-0000-7000-8000-000000000001',
       '01980a20-0000-7000-8000-000000000001',
       'Unpinned direct active cohort', 'active', 'scheduled'
     ) $$,
  '23514', 'an active cohort requires an exact published content pin',
  'a privileged direct insert cannot create an active cohort without a published pin'
);

select throws_ok(
  $$ insert into public.cohorts (
       id, organization_id, course_id, content_version_id, name, state,
       progression_mode
     ) values (
       '01980d30-0000-7000-8000-00000000000c',
       '01980a10-0000-7000-8000-000000000001',
       '01980a20-0000-7000-8000-000000000001',
       '01980d22-0000-7000-8000-000000000099',
       'Published direct active cohort', 'active', 'scheduled'
     ) $$,
  '23514', 'cohort content version must belong to its course',
  'an unknown content pin cannot satisfy a privileged active insert'
);

update public.profiles
set state = 'inactive', deactivated_at = statement_timestamp()
where user_id = '01980a00-0000-7000-8000-000000000004';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select (public.transition_cohort(
      '01980d30-0000-7000-8000-000000000001', 1, 'active',
      'Trainer starts the verified pinned cohort',
      '01980d40-0000-7000-8000-000000000010',
      'cohort-start-idempotency-0001'
    )).row_version
  ),
  2::bigint,
  'an assigned active trainer starts a waiting cohort with CAS'
);

select ok(
  (select state from public.cohorts
   where id = '01980d30-0000-7000-8000-000000000001') = 'active'
  and (select starts_at is not null from public.cohorts
       where id = '01980d30-0000-7000-8000-000000000001')
  and (select content_version_id from public.cohorts
       where id = '01980d30-0000-7000-8000-000000000001') =
      '01980a22-0000-7000-8000-000000000001'::uuid,
  'start records lifecycle facts without changing the immutable pin'
);

reset role;
select is(
  (select count(*)::bigint from public.audit_events
   where event_type = 'cohort.started'
     and aggregate_id = '01980d30-0000-7000-8000-000000000001'),
  1::bigint,
  'cohort start appends one audit event'
);

select is(
  (select count(*)::bigint from public.outbox_events
   where event_type = 'cohort.started.v1'
     and aggregate_id = '01980d30-0000-7000-8000-000000000001'),
  1::bigint,
  'cohort start appends one transactional outbox event'
);

select is(
  (select count(*)::bigint from public.notifications
   where recipient_id = '01980a00-0000-7000-8000-000000000001'
     and payload ->> 'cohort_id' = '01980d30-0000-7000-8000-000000000001'
     and event_type = 'cohort.started'),
  1::bigint,
  'cohort start notifies an active assigned learner exactly once'
);

select is(
  (select count(*)::bigint from public.notifications
   where recipient_id = '01980a00-0000-7000-8000-000000000004'
     and payload ->> 'cohort_id' = '01980d30-0000-7000-8000-000000000001'),
  0::bigint,
  'cohort notifications exclude a learner with an inactive profile'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select (public.transition_cohort(
      '01980d30-0000-7000-8000-000000000001', 1, 'active',
      'Trainer starts the verified pinned cohort',
      '01980d40-0000-7000-8000-000000000011',
      'cohort-start-idempotency-0001'
    )).row_version
  ),
  2::bigint,
  'an exact retry returns the stored result despite a new correlation ID'
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000001', 1, 'active',
       'Changed payload must not reuse this key',
       '01980d40-0000-7000-8000-000000000012',
       'cohort-start-idempotency-0001'
     ) $$,
  '22023', 'idempotency key was reused with a different cohort payload',
  'a lifecycle key cannot be reused with another payload'
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000001', 1, 'completed',
       'Competing writer still holds the old version',
       '01980d40-0000-7000-8000-000000000013',
       'cohort-competing-writer-0001'
     ) $$,
  '40001', 'cohort is stale',
  'a different-key competing writer with stale CAS is rejected'
);

select is(
  (
    select (public.transition_cohort(
      '01980d30-0000-7000-8000-000000000001', 2, 'completed',
      'Trainer completes the verified cohort',
      '01980d40-0000-7000-8000-000000000014',
      'cohort-complete-idempotency-0001'
    )).row_version
  ),
  3::bigint,
  'an assigned trainer completes an active cohort with CAS'
);

select ok(
  (select state from public.cohorts
   where id = '01980d30-0000-7000-8000-000000000001') = 'completed'
  and (select completed_at is not null from public.cohorts
       where id = '01980d30-0000-7000-8000-000000000001'),
  'completion records a terminal timestamp'
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000001', 3, 'active',
       'A terminal cohort must never reopen',
       '01980d40-0000-7000-8000-000000000015',
       'cohort-illegal-reopen-0001'
     ) $$,
  '23514', 'illegal cohort lifecycle transition',
  'a completed cohort cannot reopen'
);

reset role;
update public.user_roles role_assignment
set revoked_at = statement_timestamp()
from public.roles role_record
where role_assignment.role_id = role_record.id
  and role_assignment.user_id = '01980a00-0000-7000-8000-000000000002'
  and role_record.code = 'trainer';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000001', 1, 'active',
       'Trainer starts the verified pinned cohort',
       '01980d40-0000-7000-8000-000000000016',
       'cohort-start-idempotency-0001'
     ) $$,
  '42501', 'cohort lifecycle scope denied',
  'a receipt cannot bypass a trainer role revoked after the original success'
);

reset role;
update public.user_roles role_assignment
set revoked_at = null
from public.roles role_record
where role_assignment.role_id = role_record.id
  and role_assignment.user_id = '01980a00-0000-7000-8000-000000000002'
  and role_record.code = 'trainer';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select (public.transition_cohort(
      '01980d30-0000-7000-8000-000000000001', 1, 'active',
      'Trainer starts the verified pinned cohort',
      '01980d40-0000-7000-8000-000000000031',
      'cohort-start-idempotency-0001'
    )).state
  ),
  'active'::public.cohort_state,
  'a lost start response retries from its receipt even after later completion'
);

reset role;
select is(
  (select count(*)::bigint from public.audit_events
   where aggregate_id = '01980d30-0000-7000-8000-000000000001'
     and event_type = 'cohort.started'),
  1::bigint,
  'lifecycle retries never duplicate start effects'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000002', 1, 'cancelled',
       'Trainer attempts manager-only cancellation',
       '01980d40-0000-7000-8000-000000000017',
       'trainer-cancel-denied-0001'
     ) $$,
  '42501', 'cohort cancellation scope denied',
  'an assigned trainer cannot cancel a cohort'
);

reset role;
update public.profiles
set state = 'active', deactivated_at = null
where user_id = '01980a00-0000-7000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true
);

select is(
  (
    select (public.transition_cohort(
      '01980d30-0000-7000-8000-000000000002', 1, 'cancelled',
      'Organization manager cancels the exact scoped cohort',
      '01980d40-0000-7000-8000-000000000018',
      'manager-cancel-cohort-0001'
    )).state
  ),
  'cancelled'::public.cohort_state,
  'an active organization manager can cancel an exact scoped cohort'
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000006', 1, 'cancelled',
       'Organization manager attempts another tenant',
       '01980d40-0000-7000-8000-000000000019',
       'manager-cross-tenant-cancel-0001'
     ) $$,
  '42501', 'cohort cancellation scope denied',
  'organization-manager permission does not cross tenant boundaries'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select (public.transition_cohort(
      '01980d30-0000-7000-8000-000000000008', 1, 'active',
      'Legacy caller starts its pinned cohort',
      '01980d40-0000-7000-8000-000000000020'
    )).row_version
  ),
  2::bigint,
  'a positional legacy lifecycle call omits the defaulted key successfully'
);

select is(
  (
    select (public.transition_cohort(
      '01980d30-0000-7000-8000-000000000008', 1, 'active',
      'Legacy caller starts its pinned cohort',
      '01980d40-0000-7000-8000-000000000020'
    )).row_version
  ),
  2::bigint,
  'a legacy correlation-derived key replays exactly'
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000008', 1, 'active',
       'Legacy correlation cannot bind another payload',
       '01980d40-0000-7000-8000-000000000020'
     ) $$,
  '22023', 'idempotency key was reused with a different cohort payload',
  'legacy correlation reuse with another payload is rejected'
);

select is(
  (
    select (public.update_task_schedule(
      '01980d30-0000-7000-8000-000000000004',
      '01980a26-0000-7000-8000-000000000001',
      0,
      '2026-08-01 08:00:00+00'::timestamptz,
      '2026-08-08 18:00:00+00'::timestamptz,
      'Create the initial audited schedule',
      '01980d40-0000-7000-8000-000000000021',
      'schedule-create-idempotency-0001'
    )).row_version
  ),
  1::bigint,
  'expected version zero creates a missing schedule'
);

reset role;
select is(
  (select count(*)::bigint from public.audit_events
   where event_type = 'task_schedule.created'
     and metadata ->> 'cohort_id' =
       '01980d30-0000-7000-8000-000000000004'),
  1::bigint,
  'schedule creation appends one audit event'
);

select is(
  (select count(*)::bigint from public.outbox_events
   where event_type = 'task_schedule.created.v1'
     and payload ->> 'cohort_id' =
       '01980d30-0000-7000-8000-000000000004'),
  1::bigint,
  'schedule creation appends one transactional outbox event'
);

select is(
  (select count(*)::bigint from public.notifications
   where recipient_id = '01980a00-0000-7000-8000-000000000001'
     and payload ->> 'cohort_id' =
       '01980d30-0000-7000-8000-000000000004'
     and event_type = 'task_schedule.created'),
  1::bigint,
  'a schedule change notifies the active learner deterministically'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select (public.update_task_schedule(
      '01980d30-0000-7000-8000-000000000004',
      '01980a26-0000-7000-8000-000000000001',
      0,
      '2026-08-01 08:00:00+00'::timestamptz,
      '2026-08-08 18:00:00+00'::timestamptz,
      'Create the initial audited schedule',
      '01980d40-0000-7000-8000-000000000022',
      'schedule-create-idempotency-0001'
    )).row_version
  ),
  1::bigint,
  'an exact schedule retry returns the original created row'
);

select throws_ok(
  $$ select * from public.update_task_schedule(
       '01980d30-0000-7000-8000-000000000004',
       '01980a26-0000-7000-8000-000000000001', 0,
       '2026-08-01 08:00:00+00', '2026-08-09 18:00:00+00',
       'Changed dates cannot reuse the schedule key',
       '01980d40-0000-7000-8000-000000000023',
       'schedule-create-idempotency-0001'
     ) $$,
  '22023', 'idempotency key was reused with a different schedule payload',
  'a schedule key cannot be reused with changed dates or reason'
);

select throws_ok(
  $$ select * from public.update_task_schedule(
       '01980d30-0000-7000-8000-000000000004',
       '01980a26-0000-7000-8000-000000000001', 0,
       '2026-08-01 08:00:00+00', '2026-08-08 18:00:00+00',
       'Competing create observes the schedule',
       '01980d40-0000-7000-8000-000000000024',
       'schedule-competing-create-0001'
     ) $$,
  '40001', 'task schedule is stale or missing',
  'a different-key competing schedule create is rejected by CAS'
);

select is(
  (
    select (public.update_task_schedule(
      '01980d30-0000-7000-8000-000000000004',
      '01980a26-0000-7000-8000-000000000001',
      1,
      null,
      '2026-08-10 18:00:00+00'::timestamptz,
      'Clear availability and extend the due date',
      '01980d40-0000-7000-8000-000000000025',
      'schedule-update-idempotency-0001'
    )).row_version
  ),
  2::bigint,
  'schedule update supports nullable boundaries and advances CAS'
);

reset role;
select is(
  (select count(*)::bigint from public.audit_events
   where event_type = 'task_schedule.updated'
     and metadata ->> 'cohort_id' =
       '01980d30-0000-7000-8000-000000000004'),
  1::bigint,
  'schedule update appends one audit event'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.update_task_schedule(
       '01980d30-0000-7000-8000-000000000004',
       '01980a26-0000-7000-8000-000000000001', 1,
       null, '2026-08-10 18:00:00+00',
       'Stale competing schedule update',
       '01980d40-0000-7000-8000-000000000026',
       'schedule-competing-update-0001'
     ) $$,
  '40001', 'task schedule is stale or missing',
  'a stale different-key schedule update is rejected'
);

select throws_ok(
  $$ select * from public.update_task_schedule(
       '01980d30-0000-7000-8000-000000000004',
       '01980d26-0000-7000-8000-000000000099', 0,
       null, null, 'Unknown task cannot be scheduled',
       '01980d40-0000-7000-8000-000000000027',
       'schedule-wrong-task-0001'
     ) $$,
  '23514', 'task is not active in the cohort course',
  'a schedule cannot reference a task outside the pinned graph'
);

select throws_ok(
  $$ select * from public.update_task_schedule(
       '01980d30-0000-7000-8000-000000000004',
       '01980a26-0000-7000-8000-000000000001', 2,
       '2026-08-10 18:00:00+00', '2026-08-10 08:00:00+00',
       'Invalid date order is rejected',
       '01980d40-0000-7000-8000-000000000028',
       'schedule-invalid-dates-0001'
     ) $$,
  '22023', 'schedule due date must be after its availability date',
  'a due date before availability is rejected'
);

select is(
  (
    select (public.update_task_schedule(
      '01980d30-0000-7000-8000-00000000000a',
      '01980a26-0000-7000-8000-000000000001',
      0, null, null,
      'Legacy caller creates a task schedule',
      '01980d40-0000-7000-8000-000000000029'
    )).row_version
  ),
  1::bigint,
  'a positional legacy schedule call omits the trailing key successfully'
);

select is(
  (
    select (public.update_task_schedule(
      '01980d30-0000-7000-8000-00000000000a',
      '01980a26-0000-7000-8000-000000000001',
      0, null, null,
      'Legacy caller creates a task schedule',
      '01980d40-0000-7000-8000-000000000029'
    )).row_version
  ),
  1::bigint,
  'a legacy schedule correlation-derived key replays exactly'
);

select throws_ok(
  $$ select * from public.update_task_schedule(
       '01980d30-0000-7000-8000-00000000000a',
       '01980a26-0000-7000-8000-000000000001', 0, null, null,
       'Legacy correlation cannot bind a new schedule payload',
       '01980d40-0000-7000-8000-000000000029'
     ) $$,
  '22023', 'idempotency key was reused with a different schedule payload',
  'legacy schedule correlation reuse with another payload is rejected'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);
select lives_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-00000000000a', 1, 'cancelled',
       'Manager closes the legacy schedule cohort',
       '01980d40-0000-7000-8000-000000000032',
       'close-legacy-schedule-cohort-0001'
     ) $$,
  'a manager can close the cohort after a schedule command succeeds'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);
select is(
  (
    select (public.update_task_schedule(
      '01980d30-0000-7000-8000-00000000000a',
      '01980a26-0000-7000-8000-000000000001',
      0, null, null,
      'Legacy caller creates a task schedule',
      '01980d40-0000-7000-8000-000000000029'
    )).row_version
  ),
  1::bigint,
  'an exact schedule receipt replays after the cohort later closes'
);

select throws_ok(
  $$ select * from public.update_task_schedule(
       '01980d30-0000-7000-8000-00000000000a',
       '01980a26-0000-7000-8000-000000000001', 1, null, null,
       'A new command cannot mutate a closed cohort schedule',
       '01980d40-0000-7000-8000-000000000033',
       'closed-cohort-new-schedule-0001'
     ) $$,
  '23514', 'cohort schedule is closed',
  'only an existing receipt, not a new key, can pass a later closed state'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);
select throws_ok(
  $$ select * from public.update_task_schedule(
       '01980d30-0000-7000-8000-000000000004',
       '01980a26-0000-7000-8000-000000000001', 2, null, null,
       'Learner attempts schedule mutation',
       '01980d40-0000-7000-8000-00000000002a',
       'learner-schedule-denied-0001'
     ) $$,
  '42501', 'schedule management scope denied',
  'a learner cannot manage an assigned cohort schedule'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);
select lives_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000007', 1, 'active',
       'Restored trainer starts the scope fixture',
       '01980d40-0000-7000-8000-00000000002b',
       'restored-trainer-start-0001'
     ) $$,
  'a fully restored active trainer can operate its exact cohort'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);
select set_config(
  'ditele.impact_before_new_version',
  public.get_content_archive_impact(
    '01980a22-0000-7000-8000-000000000001'
  ) ->> 'fingerprint',
  true
);

reset role;
insert into public.content_versions (
  id, course_id, version_number, state, change_summary, snapshot,
  created_by, published_by, published_at
)
values (
  '01980d22-0000-7000-8000-000000000099',
  '01980a20-0000-7000-8000-000000000001', 999, 'published',
  'Newer published pin-stability fixture', '{}'::jsonb,
  '01980a00-0000-7000-8000-000000000003',
  '01980a00-0000-7000-8000-000000000003', statement_timestamp()
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select is(
  public.get_content_archive_impact(
    '01980a22-0000-7000-8000-000000000001'
  ) ->> 'fingerprint',
  current_setting('ditele.impact_before_new_version'),
  'publishing a newer version does not change the old pin impact fingerprint'
);

select ok(
  (select content_version_id from public.cohorts
   where id = '01980d30-0000-7000-8000-000000000003') =
    '01980a22-0000-7000-8000-000000000001'::uuid
  and (
    select count(*)
    from public.cohorts cohort_record
    join public.tasks task_record
      on task_record.content_version_id = cohort_record.content_version_id
     and task_record.course_id = cohort_record.course_id
    where cohort_record.id = '01980d30-0000-7000-8000-000000000003'
      and task_record.id = '01980a26-0000-7000-8000-000000000001'
  ) = 1,
  'a newer publication never changes the cohort pin or its exact task graph'
);

select set_config(
  'ditele.impact_before_state_change',
  public.get_content_archive_impact(
    '01980a22-0000-7000-8000-000000000001'
  ) ->> 'fingerprint',
  true
);

select lives_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000003', 1, 'active',
       'Start the cohort before archiving its exact pin',
       '01980d40-0000-7000-8000-00000000002c',
       'archive-pin-active-start-0001'
     ) $$,
  'a published exact pin can start before archival'
);

select isnt(
  public.get_content_archive_impact(
    '01980a22-0000-7000-8000-000000000001'
  ) ->> 'fingerprint',
  current_setting('ditele.impact_before_state_change'),
  'a pinned waiting-to-active change invalidates archive confirmation'
);

select ok(
  (public.get_content_archive_impact(
    '01980a22-0000-7000-8000-000000000001'
  ) ->> 'pinned_waiting_cohort_count')::bigint > 0
  and (public.get_content_archive_impact(
    '01980a22-0000-7000-8000-000000000001'
  ) ->> 'pinned_active_cohort_count')::bigint > 0
  and (public.get_content_archive_impact(
    '01980a22-0000-7000-8000-000000000001'
  ) ->> 'pinned_completed_cohort_count')::bigint > 0,
  'archive impact explicitly counts pinned waiting, active and completed cohorts'
);

select lives_ok(
  $$ select * from public.archive_content_version(
       '01980a22-0000-7000-8000-000000000001',
       (select row_version from public.content_versions
        where id = '01980a22-0000-7000-8000-000000000001'),
       (public.get_content_archive_impact(
         '01980a22-0000-7000-8000-000000000001'
       ) ->> 'fingerprint'),
       'Archive while retaining exact active cohort pins',
       'archive-pinned-cohorts-0001',
       '01980d40-0000-7000-8000-00000000002d'
     ) $$,
  'impact-confirmed archival succeeds with pinned cohort counts'
);

select ok(
  (select state from public.content_versions
   where id = '01980a22-0000-7000-8000-000000000001') = 'archived'
  and (select content_version_id from public.cohorts
       where id = '01980d30-0000-7000-8000-000000000003') =
      '01980a22-0000-7000-8000-000000000001'::uuid,
  'archival preserves the immutable active cohort pin'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select lives_ok(
  $$ select * from public.update_task_schedule(
       '01980d30-0000-7000-8000-000000000003',
       '01980a26-0000-7000-8000-000000000001', 0,
       '2026-09-01 08:00:00+00', '2026-09-08 18:00:00+00',
       'Active cohort retains its archived task graph',
       '01980d40-0000-7000-8000-00000000002e',
       'archived-active-schedule-0001'
     ) $$,
  'an active cohort can schedule tasks from its archived exact pin'
);

select throws_ok(
  $$ select * from public.update_task_schedule(
       '01980d30-0000-7000-8000-000000000004',
       '01980a26-0000-7000-8000-000000000001', 2,
       null, '2026-09-10 18:00:00+00',
       'Waiting cohort cannot use an archived pin',
       '01980d40-0000-7000-8000-00000000002f',
       'archived-waiting-schedule-0001'
     ) $$,
  '23514', 'cohort schedule content version is unavailable',
  'a waiting cohort cannot schedule against an archived pin'
);

select throws_ok(
  $$ select * from public.transition_cohort(
       '01980d30-0000-7000-8000-000000000004', 1, 'active',
       'Waiting cohort cannot start from archived content',
       '01980d40-0000-7000-8000-000000000030',
       'archived-waiting-start-0001'
     ) $$,
  '23514', 'cohort pinned content version is not published',
  'a waiting cohort cannot start once its exact pin is archived'
);

reset role;
select throws_ok(
  $$ insert into public.cohorts (
       id, organization_id, course_id, content_version_id, name, state,
       progression_mode
     ) values (
       '01980d30-0000-7000-8000-00000000000d',
       '01980a10-0000-7000-8000-000000000001',
       '01980a20-0000-7000-8000-000000000001',
       '01980a22-0000-7000-8000-000000000001',
       'Archived direct active cohort', 'active', 'scheduled'
     ) $$,
  '23514', 'an active cohort requires an exact published content pin',
  'a privileged active insert cannot use an archived content pin'
);

select lives_ok(
  $$ update public.cohorts
     set capacity = 77
     where id = '01980d30-0000-7000-8000-000000000003' $$,
  'metadata updates retain an already-active archived exact pin'
);

select throws_ok(
  $$ update public.cohorts
     set content_version_id = '01980d22-0000-7000-8000-000000000099'
     where id = '01980d30-0000-7000-8000-000000000003' $$,
  '55000', 'an active or terminal cohort content pin is immutable',
  'even a privileged direct write cannot repin an active cohort'
);

select throws_ok(
  $$ update public.cohort_schedule_command_receipts
     set payload_hash = repeat('0', 64)
     where idempotency_key = 'cohort-start-idempotency-0001' $$,
  '55000', 'cohort_schedule_command_receipts is append-only',
  'receipt rows cannot be altered after creation'
);

select * from finish();
rollback;
