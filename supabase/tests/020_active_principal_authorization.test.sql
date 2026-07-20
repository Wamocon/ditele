begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- Contract metadata: exact signatures, defaults, execution context, ownership,
-- and API grants for the active-principal boundary.
select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'app_private'
      and (
        procedure_record.proname,
        pg_catalog.oidvectortypes(procedure_record.proargtypes)
      ) in (
        ('has_role', 'text, uuid, uuid'),
        ('has_permission', 'text, uuid, uuid'),
        ('is_active_organization_member', 'uuid'),
        ('can_access_cohort', 'uuid'),
        ('can_train_cohort', 'uuid')
      )
  ),
  5::bigint,
  'the five active-principal helpers retain their exact signatures'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_catalog.pg_roles owner_record
      on owner_record.oid = procedure_record.proowner
    where namespace_record.nspname = 'app_private'
      and procedure_record.proname in (
        'has_role',
        'has_permission',
        'is_active_organization_member',
        'can_access_cohort',
        'can_train_cohort'
      )
      and pg_catalog.pg_get_function_result(procedure_record.oid) = 'boolean'
      and procedure_record.provolatile = 's'
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
      and owner_record.rolname = 'postgres'
  ),
  5::bigint,
  'the five helpers are postgres-owned stable boolean security-definers with an empty search path'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'app_private'
      and procedure_record.proname in ('has_role', 'has_permission')
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'text, uuid, uuid'
      and procedure_record.pronargdefaults = 2
  ),
  2::bigint,
  'role and permission helpers retain both nullable scope defaults'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_catalog.pg_roles owner_record
      on owner_record.oid = procedure_record.proowner
    where namespace_record.nspname = 'app_private'
      and procedure_record.proname = 'current_actor_valid_role_assignments'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = ''
      and pg_catalog.pg_get_function_result(procedure_record.oid) =
        'TABLE(role_id uuid, role_code text, organization_id uuid, cohort_id uuid)'
      and procedure_record.provolatile = 's'
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
      and owner_record.rolname = 'postgres'
  ),
  1::bigint,
  'one hardened private actor-assignment resolver owns the canonical result shape'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_private.current_actor_valid_role_assignments()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.current_actor_valid_role_assignments()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.current_actor_valid_role_assignments()',
    'EXECUTE'
  ),
  'the arbitrary assignment resolver is not API-executable'
);

select ok(
  has_function_privilege(
    'authenticated', 'app_private.has_role(text,uuid,uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'app_private.has_permission(text,uuid,uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'app_private.is_active_organization_member(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'app_private.can_access_cohort(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'app_private.can_train_cohort(uuid)', 'EXECUTE'
  ),
  'authenticated callers retain only the reviewed principal predicates'
);

select ok(
  has_function_privilege(
    'service_role', 'app_private.has_role(text,uuid,uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'app_private.has_permission(text,uuid,uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'app_private.is_active_organization_member(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'app_private.can_access_cohort(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'app_private.can_train_cohort(uuid)', 'EXECUTE'
  ),
  'the trusted server role retains all five reviewed predicates'
);

select ok(
  not has_function_privilege(
    'anon', 'app_private.has_role(text,uuid,uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'app_private.has_permission(text,uuid,uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'app_private.is_active_organization_member(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'app_private.can_access_cohort(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'app_private.can_train_cohort(uuid)', 'EXECUTE'
  ),
  'anonymous callers receive no active-principal execute grant'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_catalog.pg_roles owner_record
      on owner_record.oid = procedure_record.proowner
    where namespace_record.nspname = 'app_private'
      and procedure_record.proname in (
        'can_access_submission',
        'can_access_question',
        'can_access_evidence'
      )
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = 'uuid'
      and pg_catalog.pg_get_function_result(procedure_record.oid) = 'boolean'
      and procedure_record.provolatile = 's'
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
      and owner_record.rolname = 'postgres'
  ),
  3::bigint,
  'all three resource predicates retain hardened metadata and ownership'
);

select ok(
  has_function_privilege(
    'authenticated', 'app_private.can_access_submission(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'app_private.can_access_question(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'app_private.can_access_evidence(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'app_private.can_access_submission(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'app_private.can_access_question(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'app_private.can_access_evidence(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'app_private.can_access_submission(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'app_private.can_access_question(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'app_private.can_access_evidence(uuid)', 'EXECUTE'
  ),
  'resource predicates preserve explicit authenticated and server-only grants'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.is_active_cohort_review_trainer(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.is_active_cohort_review_trainer(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.is_active_cohort_question_trainer(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.is_active_cohort_question_trainer(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'arbitrary-user trainer eligibility remains private from both API roles'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'app_private'
      and procedure_record.proname in (
        'is_active_cohort_review_trainer',
        'is_active_cohort_question_trainer'
      )
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'uuid, uuid, uuid'
      and pg_catalog.pg_get_function_result(procedure_record.oid) = 'boolean'
      and procedure_record.provolatile = 's'
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
  ),
  2::bigint,
  'both target-trainer predicates retain exact hardened contracts'
);

select ok(
  (
    select position('can_train_cohort' in policy_record.qual) > 0
      and position('cohort_memberships' in policy_record.qual) = 0
    from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'task_option_answers'
      and policy_record.policyname = 'task_option_answers_reviewer_read'
  )
  and (
    select position('can_train_cohort' in policy_record.qual) > 0
      and position('cohort_memberships' in policy_record.qual) = 0
    from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'task_model_answers'
      and policy_record.policyname = 'task_model_answers_reviewer_read'
  ),
  'assessment reviewer policies use validated trainer authorization, never raw membership'
);

-- Isolated principals, tenants, roles, cohorts, and protected resources.
insert into public.organizations (id, slug, name, state)
values
  (
    '01980c10-0000-7000-8000-000000000001',
    'active-principal-a', 'Active Principal Tenant A', 'active'
  ),
  (
    '01980c10-0000-7000-8000-000000000002',
    'active-principal-b', 'Active Principal Tenant B', 'active'
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
  '{"provider":"email","providers":["email"],"seed_fixture":"true"}'::jsonb,
  jsonb_build_object('display_name', fixture.display_name, 'locale', 'en'),
  statement_timestamp(), statement_timestamp(), '', '', '', ''
from (values
  ('01980c00-0000-7000-8000-000000000001'::uuid, 'principal-learner@test.local', 'Principal Learner'),
  ('01980c00-0000-7000-8000-000000000002'::uuid, 'principal-trainer@test.local', 'Principal Trainer'),
  ('01980c00-0000-7000-8000-000000000003'::uuid, 'principal-manager@test.local', 'Principal Manager'),
  ('01980c00-0000-7000-8000-000000000004'::uuid, 'principal-custom@test.local', 'Custom Trainer'),
  ('01980c00-0000-7000-8000-000000000005'::uuid, 'principal-dual@test.local', 'Dual Tenant Learner'),
  ('01980c00-0000-7000-8000-000000000006'::uuid, 'principal-global-trainer@test.local', 'Invalid Global Trainer'),
  ('01980c00-0000-7000-8000-000000000007'::uuid, 'principal-global-custom@test.local', 'Invalid Global Custom'),
  ('01980c00-0000-7000-8000-000000000008'::uuid, 'principal-platform@test.local', 'Platform Principal'),
  ('01980c00-0000-7000-8000-000000000009'::uuid, 'principal-no-role@test.local', 'No Assignment Member'),
  ('01980c00-0000-7000-8000-00000000000a'::uuid, 'principal-learner-mismatch@test.local', 'Learner Role Trainer Member'),
  ('01980c00-0000-7000-8000-00000000000b'::uuid, 'principal-trainer-mismatch@test.local', 'Trainer Role Learner Member'),
  ('01980c00-0000-7000-8000-00000000000c'::uuid, 'principal-membership-only@test.local', 'Membership Only Trainer')
) as fixture(user_id, email, display_name);

insert into public.organization_memberships (
  organization_id, user_id, state, joined_at, created_at
)
select
  fixture.organization_id,
  fixture.user_id,
  'active',
  statement_timestamp() - interval '2 days',
  statement_timestamp() - interval '3 days'
from (values
  ('01980c10-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000001'::uuid),
  ('01980c10-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000002'::uuid),
  ('01980c10-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000003'::uuid),
  ('01980c10-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000004'::uuid),
  ('01980c10-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000005'::uuid),
  ('01980c10-0000-7000-8000-000000000002'::uuid, '01980c00-0000-7000-8000-000000000005'::uuid),
  ('01980c10-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000006'::uuid),
  ('01980c10-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000009'::uuid),
  ('01980c10-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-00000000000a'::uuid),
  ('01980c10-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-00000000000b'::uuid),
  ('01980c10-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-00000000000c'::uuid)
) as fixture(organization_id, user_id);

insert into public.roles (id, code, description, is_system)
values (
  '01980c12-0000-7000-8000-000000000001',
  'scoped_review_question',
  'Scoped custom review and question trainer contract',
  false
);

insert into public.role_permissions (role_id, permission_id)
select '01980c12-0000-7000-8000-000000000001', permission_record.id
from public.permissions permission_record
where permission_record.code in ('review.manage', 'question.manage');

insert into public.user_roles (
  id, user_id, role_id, organization_id, reason,
  valid_from
)
select
  fixture.assignment_id,
  fixture.user_id,
  role_record.id,
  fixture.organization_id,
  'active principal authorization fixture',
  statement_timestamp() - interval '2 days'
from (values
  ('01980c13-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000001'::uuid, 'learner'::text, '01980c10-0000-7000-8000-000000000001'::uuid),
  ('01980c13-0000-7000-8000-000000000002'::uuid, '01980c00-0000-7000-8000-000000000002'::uuid, 'trainer'::text, '01980c10-0000-7000-8000-000000000001'::uuid),
  ('01980c13-0000-7000-8000-000000000003'::uuid, '01980c00-0000-7000-8000-000000000003'::uuid, 'organization_admin'::text, '01980c10-0000-7000-8000-000000000001'::uuid),
  ('01980c13-0000-7000-8000-000000000005'::uuid, '01980c00-0000-7000-8000-000000000005'::uuid, 'learner'::text, '01980c10-0000-7000-8000-000000000001'::uuid),
  ('01980c13-0000-7000-8000-000000000006'::uuid, '01980c00-0000-7000-8000-000000000005'::uuid, 'learner'::text, '01980c10-0000-7000-8000-000000000002'::uuid),
  ('01980c13-0000-7000-8000-00000000000a'::uuid, '01980c00-0000-7000-8000-00000000000a'::uuid, 'learner'::text, '01980c10-0000-7000-8000-000000000001'::uuid),
  ('01980c13-0000-7000-8000-00000000000b'::uuid, '01980c00-0000-7000-8000-00000000000b'::uuid, 'trainer'::text, '01980c10-0000-7000-8000-000000000001'::uuid)
) as fixture(assignment_id, user_id, role_code, organization_id)
join public.roles role_record on role_record.code = fixture.role_code;

insert into public.user_roles (
  id, user_id, role_id, organization_id, reason, valid_from
)
values (
  '01980c13-0000-7000-8000-000000000004',
  '01980c00-0000-7000-8000-000000000004',
  '01980c12-0000-7000-8000-000000000001',
  '01980c10-0000-7000-8000-000000000001',
  'active principal scoped custom fixture',
  statement_timestamp() - interval '2 days'
);

insert into public.user_roles (
  id, user_id, role_id, organization_id, reason, valid_from
)
select
  fixture.assignment_id,
  fixture.user_id,
  case
    when fixture.role_code = 'scoped_review_question'
      then '01980c12-0000-7000-8000-000000000001'::uuid
    else role_record.id
  end,
  null,
  'active principal invalid global fixture',
  statement_timestamp() - interval '2 days'
from (values
  ('01980c13-0000-7000-8000-000000000106'::uuid, '01980c00-0000-7000-8000-000000000006'::uuid, 'trainer'::text),
  ('01980c13-0000-7000-8000-000000000107'::uuid, '01980c00-0000-7000-8000-000000000007'::uuid, 'scoped_review_question'::text)
) as fixture(assignment_id, user_id, role_code)
left join public.roles role_record on role_record.code = fixture.role_code;

insert into public.user_roles (
  user_id, role_id, organization_id, reason, valid_from
)
select
  '01980c00-0000-7000-8000-000000000008',
  role_record.id,
  null,
  'active principal platform allowlist fixture',
  statement_timestamp() - interval '2 days'
from public.roles role_record
where role_record.code in (
  'admin',
  'content_admin',
  'support',
  'integration_admin',
  'dpo',
  'organization_admin'
);

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, completed_at, created_by
)
values
  (
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Principal Active', 'active', 'scheduled', null,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980c30-0000-7000-8000-000000000002',
    '01980c10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Principal Waiting', 'waiting', 'scheduled', null,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980c30-0000-7000-8000-000000000003',
    '01980c10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Principal Completed', 'completed', 'scheduled', statement_timestamp(),
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980c30-0000-7000-8000-000000000004',
    '01980c10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Principal Cancelled', 'cancelled', 'scheduled', null,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980c30-0000-7000-8000-000000000005',
    '01980c10-0000-7000-8000-000000000002',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Principal Tenant B', 'active', 'scheduled', null,
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.cohort_memberships (
  cohort_id, user_id, role, state, assigned_by
)
select
  fixture.cohort_id,
  fixture.user_id,
  fixture.member_role::public.cohort_member_role,
  'active',
  '01980a00-0000-7000-8000-000000000003'
from (values
  ('01980c30-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000001'::uuid, 'learner'::text),
  ('01980c30-0000-7000-8000-000000000002'::uuid, '01980c00-0000-7000-8000-000000000001'::uuid, 'learner'::text),
  ('01980c30-0000-7000-8000-000000000003'::uuid, '01980c00-0000-7000-8000-000000000001'::uuid, 'learner'::text),
  ('01980c30-0000-7000-8000-000000000004'::uuid, '01980c00-0000-7000-8000-000000000001'::uuid, 'learner'::text),
  ('01980c30-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000002'::uuid, 'trainer'::text),
  ('01980c30-0000-7000-8000-000000000002'::uuid, '01980c00-0000-7000-8000-000000000002'::uuid, 'trainer'::text),
  ('01980c30-0000-7000-8000-000000000003'::uuid, '01980c00-0000-7000-8000-000000000002'::uuid, 'trainer'::text),
  ('01980c30-0000-7000-8000-000000000004'::uuid, '01980c00-0000-7000-8000-000000000002'::uuid, 'trainer'::text),
  ('01980c30-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000004'::uuid, 'trainer'::text),
  ('01980c30-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000005'::uuid, 'learner'::text),
  ('01980c30-0000-7000-8000-000000000005'::uuid, '01980c00-0000-7000-8000-000000000005'::uuid, 'learner'::text),
  ('01980c30-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-000000000006'::uuid, 'trainer'::text),
  ('01980c30-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-00000000000a'::uuid, 'trainer'::text),
  ('01980c30-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-00000000000b'::uuid, 'learner'::text),
  ('01980c30-0000-7000-8000-000000000001'::uuid, '01980c00-0000-7000-8000-00000000000c'::uuid, 'trainer'::text)
) as fixture(cohort_id, user_id, member_role);

insert into public.task_schedules (
  cohort_id, task_id, available_from, due_at, changed_by, change_reason
)
values (
  '01980c30-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001',
  statement_timestamp() - interval '1 day',
  statement_timestamp() + interval '30 days',
  '01980a00-0000-7000-8000-000000000003',
  'active principal assessment fixture'
);

insert into public.enrollments (
  id, organization_id, learner_id, course_id, cohort_id, state,
  idempotency_key, decided_by, decided_at
)
values (
  '01980c33-0000-7000-8000-000000000001',
  '01980c10-0000-7000-8000-000000000001',
  '01980c00-0000-7000-8000-000000000001',
  '01980a20-0000-7000-8000-000000000001',
  '01980c30-0000-7000-8000-000000000001',
  'assigned',
  'active-principal-enrollment-0001',
  '01980a00-0000-7000-8000-000000000003',
  statement_timestamp()
);

insert into public.attempts (
  id, organization_id, enrollment_id, learner_id, cohort_id, task_id,
  state, submitted_at
)
values (
  '01980c34-0000-7000-8000-000000000001',
  '01980c10-0000-7000-8000-000000000001',
  '01980c33-0000-7000-8000-000000000001',
  '01980c00-0000-7000-8000-000000000001',
  '01980c30-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001',
  'submitted',
  statement_timestamp()
);

insert into public.submissions (
  id, organization_id, attempt_id, learner_id, cohort_id, task_id,
  state, latest_version_number
)
values (
  '01980c60-0000-7000-8000-000000000001',
  '01980c10-0000-7000-8000-000000000001',
  '01980c34-0000-7000-8000-000000000001',
  '01980c00-0000-7000-8000-000000000001',
  '01980c30-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001',
  'submitted',
  1
);

insert into public.submission_versions (
  id, submission_id, version_number, idempotency_key, answer_text,
  selected_option_ids, evidence_refs, elapsed_seconds, hint_used,
  task_snapshot, submitted_by
)
values (
  '01980c61-0000-7000-8000-000000000001',
  '01980c60-0000-7000-8000-000000000001',
  1,
  'active-principal-submission-v1',
  'Active principal protected answer.',
  '{}',
  '{}',
  120,
  false,
  '{"content_version_id":"01980a22-0000-7000-8000-000000000001"}',
  '01980c00-0000-7000-8000-000000000001'
);

insert into public.questions (
  id, organization_id, learner_id, cohort_id, task_id,
  assigned_trainer_id, state, subject, idempotency_key
)
values (
  '01980c70-0000-7000-8000-000000000001',
  '01980c10-0000-7000-8000-000000000001',
  '01980c00-0000-7000-8000-000000000001',
  '01980c30-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001',
  '01980c00-0000-7000-8000-000000000002',
  'assigned',
  'Does assignment identity bypass active authorization?',
  'active-principal-question-0001'
);

insert into public.evidence (
  id, organization_id, owner_id, task_id, submission_version_id,
  evidence_kind, title, sha256_hex
)
values (
  '01980c80-0000-7000-8000-000000000001',
  '01980c10-0000-7000-8000-000000000001',
  '01980c00-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001',
  '01980c61-0000-7000-8000-000000000001',
  'submission',
  'Active principal protected evidence',
  repeat('c', 64)
);

insert into public.skills (id, organization_id, code, labels, state)
values
  (
    '01980c50-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001',
    'active-principal-parent', '{"en":"Principal parent"}', 'active'
  ),
  (
    '01980c50-0000-7000-8000-000000000002',
    '01980c10-0000-7000-8000-000000000001',
    'active-principal-child', '{"en":"Principal child"}', 'active'
  );

insert into public.skill_edges (parent_skill_id, child_skill_id, relation)
values (
  '01980c50-0000-7000-8000-000000000001',
  '01980c50-0000-7000-8000-000000000002',
  'prerequisite'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);

select ok(
  not app_private.has_role('learner')
  and not app_private.has_permission('cohort.read')
  and not app_private.is_active_organization_member(
    '01980c10-0000-7000-8000-000000000001'
  )
  and not app_private.can_access_cohort(
    '01980c30-0000-7000-8000-000000000001'
  ),
  'an empty session has no role, permission, tenant, or cohort authority'
);

select set_config(
  'request.jwt.claim.sub', '01980cff-0000-7000-8000-000000000001', true
);
select ok(
  not app_private.has_role('learner')
  and not app_private.has_permission('cohort.read'),
  'a missing profile and assignment fail closed'
);

select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000009', true
);
select ok(
  not app_private.has_role(
    'learner', '01980c10-0000-7000-8000-000000000001', null
  )
  and not app_private.has_permission(
    'cohort.read',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  ),
  'an active member without an assignment has no role-derived authority'
);

select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select ok(
  app_private.has_role(
    'learner',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  )
  and app_private.has_permission(
    'cohort.read',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  )
  and app_private.is_active_organization_member(
    '01980c10-0000-7000-8000-000000000001'
  ),
  'a current learner assignment is valid only with its active principal chain'
);

-- Profile state and deactivation are independent fail-closed conditions.
reset role;
update public.profiles
set state = 'inactive'
where user_id = '01980c00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select ok(
  not app_private.has_role(
    'learner', '01980c10-0000-7000-8000-000000000001', null
  )
  and not app_private.is_active_organization_member(
    '01980c10-0000-7000-8000-000000000001'
  ),
  'an inactive profile invalidates assignments and organization membership'
);

reset role;
update public.profiles
set state = 'active', deactivated_at = statement_timestamp()
where user_id = '01980c00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select ok(
  not app_private.has_role(
    'learner', '01980c10-0000-7000-8000-000000000001', null
  )
  and not app_private.can_access_cohort(
    '01980c30-0000-7000-8000-000000000001'
  ),
  'a deactivated profile cannot retain role or cohort access'
);

reset role;
update public.profiles
set deactivated_at = null
where user_id = '01980c00-0000-7000-8000-000000000001';

-- Assignment validity windows and revocation are evaluated at statement time.
update public.user_roles
set valid_from = statement_timestamp() + interval '1 day', valid_until = null
where id = '01980c13-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  app_private.has_role(
    'learner', '01980c10-0000-7000-8000-000000000001', null
  ),
  false,
  'a future role assignment is not current'
);

reset role;
update public.user_roles
set
  valid_from = statement_timestamp() - interval '2 days',
  valid_until = statement_timestamp() - interval '1 day'
where id = '01980c13-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  app_private.has_role(
    'learner', '01980c10-0000-7000-8000-000000000001', null
  ),
  false,
  'an expired role assignment is not current'
);

reset role;
update public.user_roles
set valid_until = null, revoked_at = statement_timestamp()
where id = '01980c13-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  app_private.has_permission(
    'cohort.read',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  ),
  false,
  'a revoked role assignment grants no permission'
);

reset role;
update public.user_roles
set revoked_at = null
where id = '01980c13-0000-7000-8000-000000000001';

-- Tenant and membership lifecycle states, logical removal, and expiry.
update public.organization_memberships
set state = 'invited'
where organization_id = '01980c10-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  app_private.is_active_organization_member(
    '01980c10-0000-7000-8000-000000000001'
  ),
  false,
  'an invited organization membership is not active authority'
);

reset role;
update public.organization_memberships
set state = 'suspended'
where organization_id = '01980c10-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  app_private.has_role(
    'learner', '01980c10-0000-7000-8000-000000000001', null
  ),
  false,
  'a suspended organization membership invalidates scoped assignments'
);

reset role;
update public.organization_memberships
set state = 'removed'
where organization_id = '01980c10-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  app_private.has_permission(
    'cohort.read',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  ),
  false,
  'a removed organization membership grants no scoped permission'
);

reset role;
update public.organization_memberships
set state = 'active', removed_at = statement_timestamp()
where organization_id = '01980c10-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  app_private.is_active_organization_member(
    '01980c10-0000-7000-8000-000000000001'
  ),
  false,
  'a logically removed active membership cannot authorize'
);

reset role;
update public.organization_memberships
set removed_at = null, valid_until = statement_timestamp() - interval '1 day'
where organization_id = '01980c10-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  app_private.has_role(
    'learner', '01980c10-0000-7000-8000-000000000001', null
  ),
  false,
  'an expired organization membership invalidates scoped assignments'
);

reset role;
update public.organization_memberships
set valid_until = null
where organization_id = '01980c10-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000001';
update public.organizations
set state = 'suspended'
where id = '01980c10-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  app_private.can_access_cohort(
    '01980c30-0000-7000-8000-000000000001'
  ),
  false,
  'a suspended tenant invalidates ordinary cohort access'
);

reset role;
update public.organizations
set state = 'active', archived_at = statement_timestamp()
where id = '01980c10-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  app_private.has_permission(
    'cohort.read',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  ),
  false,
  'an archived tenant invalidates scoped permissions'
);

reset role;
update public.organizations
set archived_at = null
where id = '01980c10-0000-7000-8000-000000000001';

-- Exact target tuple validation and tenant/cohort isolation.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select ok(
  not app_private.has_role(
    'learner', null, '01980c30-0000-7000-8000-000000000001'
  )
  and not app_private.has_role(
    'learner',
    '01980c10-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000001'
  )
  and not app_private.has_role(
    'learner', '01980cff-0000-7000-8000-000000000010', null
  )
  and not app_private.has_role(
    'learner',
    '01980c10-0000-7000-8000-000000000001',
    '01980cff-0000-7000-8000-000000000030'
  ),
  'missing organizations, missing cohorts, and mismatched tuples fail closed'
);

select ok(
  not app_private.can_access_cohort(
    '01980c30-0000-7000-8000-000000000005'
  )
  and not app_private.has_role(
    'learner',
    '01980c10-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000005'
  ),
  'a single-tenant learner cannot cross into a sibling tenant'
);

-- Ordinary learner and trainer history remains valid through completion, but
-- cancelled learning access is denied while managers retain administration.
select ok(
  app_private.can_access_cohort(
    '01980c30-0000-7000-8000-000000000002'
  )
  and app_private.can_access_cohort(
    '01980c30-0000-7000-8000-000000000001'
  )
  and app_private.can_access_cohort(
    '01980c30-0000-7000-8000-000000000003'
  )
  and not app_private.can_access_cohort(
    '01980c30-0000-7000-8000-000000000004'
  ),
  'ordinary learner access covers waiting, active, and completed, never cancelled'
);

select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000002', true
);
select ok(
  app_private.can_train_cohort(
    '01980c30-0000-7000-8000-000000000002'
  )
  and app_private.can_train_cohort(
    '01980c30-0000-7000-8000-000000000001'
  )
  and app_private.can_train_cohort(
    '01980c30-0000-7000-8000-000000000003'
  )
  and not app_private.can_train_cohort(
    '01980c30-0000-7000-8000-000000000004'
  ),
  'ordinary trainer access covers waiting, active, and completed, never cancelled'
);

select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000003', true
);
select ok(
  app_private.can_access_cohort(
    '01980c30-0000-7000-8000-000000000004'
  )
  and app_private.can_train_cohort(
    '01980c30-0000-7000-8000-000000000004'
  ),
  'a scoped cohort manager retains cancelled administration and replay authority'
);

-- Cohort membership lifecycle and learner/trainer role coupling.
reset role;
update public.cohort_memberships
set state = 'suspended'
where cohort_id = '01980c30-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000001'
  and role = 'learner';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  app_private.has_role(
    'learner',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  ),
  false,
  'a suspended cohort membership cannot satisfy a target role'
);

reset role;
update public.cohort_memberships
set state = 'active', removed_at = statement_timestamp()
where cohort_id = '01980c30-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000001'
  and role = 'learner';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  app_private.can_access_cohort(
    '01980c30-0000-7000-8000-000000000001'
  ),
  false,
  'a logically removed cohort membership cannot authorize access'
);

reset role;
update public.cohort_memberships
set removed_at = null
where cohort_id = '01980c30-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000001'
  and role = 'learner';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-00000000000a', true
);
select ok(
  app_private.has_role(
    'learner',
    '01980c10-0000-7000-8000-000000000001',
    null
  )
  and not app_private.has_role(
    'learner',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  ),
  'an organization learner role supports enrollment but cannot couple to a trainer cohort membership'
);

select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-00000000000b', true
);
select is(
  app_private.can_train_cohort(
    '01980c30-0000-7000-8000-000000000001'
  ),
  false,
  'a trainer role cannot couple to a learner cohort membership'
);

-- Scoped custom roles survive the hardening and remain genuinely scoped.
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000004', true
);
select ok(
  app_private.has_role(
    'scoped_review_question',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  )
  and app_private.has_permission(
    'review.manage',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  )
  and app_private.has_permission(
    'question.manage',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  ),
  'a current tenant-scoped custom role retains its explicit permissions'
);

select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000006', true
);
select ok(
  not app_private.has_role('trainer')
  and not app_private.has_role(
    'trainer',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  )
  and not app_private.can_train_cohort(
    '01980c30-0000-7000-8000-000000000001'
  ),
  'a globally assigned non-platform trainer role is invalid even with live memberships'
);

select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000007', true
);
select is(
  app_private.has_role('scoped_review_question'),
  false,
  'a global custom role is excluded from platform authority'
);

select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000008', true
);
select ok(
  app_private.has_role('admin')
  and app_private.has_role('content_admin')
  and app_private.has_role('support')
  and app_private.has_role('integration_admin')
  and app_private.has_role('dpo')
  and not app_private.has_role('organization_admin'),
  'only the five system platform roles are accepted as global assignments'
);

select ok(
  app_private.has_permission(
    'cohort.manage',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000004'
  )
  and app_private.is_active_organization_member(
    '01980c10-0000-7000-8000-000000000002'
  )
  and not app_private.has_permission(
    'cohort.manage',
    '01980cff-0000-7000-8000-000000000010',
    '01980cff-0000-7000-8000-000000000030'
  ),
  'global administrators need no tenant membership but still require a real matching target tuple'
);

-- Two independently valid scoped tenants are ambiguous and therefore deny all
-- scoped role resolution. A later valid global role remains independent.
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000005', true
);
select ok(
  not app_private.has_role(
    'learner',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  )
  and not app_private.has_role(
    'learner',
    '01980c10-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000005'
  )
  and not app_private.has_permission(
    'profile.read_self',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  ),
  'two valid scoped tenants fail closed instead of choosing one implicitly'
);

reset role;
insert into public.user_roles (
  user_id, role_id, organization_id, reason, valid_from
)
select
  '01980c00-0000-7000-8000-000000000005',
  role_record.id,
  null,
  'dual tenant independent global administrator',
  statement_timestamp() - interval '1 day'
from public.roles role_record
where role_record.code = 'admin';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000005', true
);
select ok(
  app_private.has_role('admin')
  and app_private.has_permission(
    'cohort.manage',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  )
  and not app_private.has_role(
    'learner',
    '01980c10-0000-7000-8000-000000000001',
    '01980c30-0000-7000-8000-000000000001'
  ),
  'valid global authority survives scoped ambiguity without reviving scoped roles'
);

-- Protected resource helpers validate the actor, tenant, role, and cohort;
-- owner and assigned-trainer identifiers are never standalone authority.
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select ok(
  app_private.can_access_submission(
    '01980c60-0000-7000-8000-000000000001'
  )
  and app_private.can_access_question(
    '01980c70-0000-7000-8000-000000000001'
  )
  and app_private.can_access_evidence(
    '01980c80-0000-7000-8000-000000000001'
  ),
  'an active learner can access owned submission, question, and evidence'
);

reset role;
update public.profiles
set deactivated_at = statement_timestamp()
where user_id = '01980c00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select ok(
  not app_private.can_access_submission(
    '01980c60-0000-7000-8000-000000000001'
  )
  and not app_private.can_access_question(
    '01980c70-0000-7000-8000-000000000001'
  )
  and not app_private.can_access_evidence(
    '01980c80-0000-7000-8000-000000000001'
  ),
  'resource ownership cannot bypass a deactivated principal'
);

reset role;
update public.profiles
set deactivated_at = null
where user_id = '01980c00-0000-7000-8000-000000000001';
update public.organization_memberships
set removed_at = statement_timestamp()
where organization_id = '01980c10-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select ok(
  not app_private.can_access_submission(
    '01980c60-0000-7000-8000-000000000001'
  )
  and not app_private.can_access_question(
    '01980c70-0000-7000-8000-000000000001'
  )
  and not app_private.can_access_evidence(
    '01980c80-0000-7000-8000-000000000001'
  ),
  'resource ownership cannot bypass logical tenant removal'
);

reset role;
update public.organization_memberships
set removed_at = null
where organization_id = '01980c10-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000002', true
);
select ok(
  app_private.can_access_submission(
    '01980c60-0000-7000-8000-000000000001'
  )
  and app_private.can_access_question(
    '01980c70-0000-7000-8000-000000000001'
  )
  and app_private.can_access_evidence(
    '01980c80-0000-7000-8000-000000000001'
  ),
  'a current scoped trainer can access review, mentoring, and linked evidence'
);

reset role;
update public.profiles
set deactivated_at = statement_timestamp()
where user_id = '01980c00-0000-7000-8000-000000000002';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000002', true
);
select ok(
  not app_private.can_access_submission(
    '01980c60-0000-7000-8000-000000000001'
  )
  and not app_private.can_access_question(
    '01980c70-0000-7000-8000-000000000001'
  )
  and not app_private.can_access_evidence(
    '01980c80-0000-7000-8000-000000000001'
  ),
  'an assigned trainer identifier cannot bypass deactivated principal checks'
);

reset role;
update public.profiles
set deactivated_at = null
where user_id = '01980c00-0000-7000-8000-000000000002';
update public.questions
set assigned_trainer_id = '01980c00-0000-7000-8000-00000000000c'
where id = '01980c70-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-00000000000c', true
);
select is(
  app_private.can_access_question(
    '01980c70-0000-7000-8000-000000000001'
  ),
  false,
  'an assigned raw trainer membership without a role cannot read the question'
);

select ok(
  not app_private.can_access_submission(
    '01980c60-0000-7000-8000-000000000001'
  )
  and not app_private.can_access_evidence(
    '01980c80-0000-7000-8000-000000000001'
  ),
  'raw trainer membership cannot bypass submission or linked-evidence authorization'
);

reset role;
update public.questions
set assigned_trainer_id = '01980c00-0000-7000-8000-000000000002'
where id = '01980c70-0000-7000-8000-000000000001';

-- Assessment solution RLS denies membership-only and invalid-global trainers.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-00000000000c', true
);
select is(
  (select count(*)::bigint from public.task_option_answers),
  0::bigint,
  'raw trainer membership alone cannot read option correctness'
);
select is(
  (select count(*)::bigint from public.task_model_answers),
  0::bigint,
  'raw trainer membership alone cannot read model answers'
);

select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000006', true
);
select is(
  (select count(*)::bigint from public.task_option_answers),
  0::bigint,
  'an invalid global trainer assignment cannot expose option correctness'
);

select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000002', true
);
select is(
  (select count(*)::bigint from public.task_option_answers),
  2::bigint,
  'a validated scoped trainer can read scheduled option correctness'
);
select is(
  (select count(*)::bigint from public.task_model_answers),
  3::bigint,
  'a validated scoped trainer can read scheduled model answers'
);

reset role;
update public.profiles
set deactivated_at = statement_timestamp()
where user_id = '01980c00-0000-7000-8000-000000000002';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000002', true
);
select ok(
  (select count(*) from public.task_option_answers) = 0
  and (select count(*) from public.task_model_answers) = 0,
  'a deactivated trainer cannot read either assessment-solution table'
);

reset role;
update public.profiles
set deactivated_at = null
where user_id = '01980c00-0000-7000-8000-000000000002';

-- Arbitrary-user target predicates enforce every lifecycle edge and exact
-- scoped role assignment while preserving scoped custom-role contracts.
select ok(
  app_private.is_active_cohort_review_trainer(
    '01980c00-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  )
  and app_private.is_active_cohort_question_trainer(
    '01980c00-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  ),
  'a live scoped trainer is an eligible review and question target'
);

select ok(
  app_private.is_active_cohort_review_trainer(
    '01980c00-0000-7000-8000-000000000004',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  )
  and app_private.is_active_cohort_question_trainer(
    '01980c00-0000-7000-8000-000000000004',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  ),
  'a live custom scoped trainer remains an eligible target'
);

select ok(
  not app_private.is_active_cohort_review_trainer(
    '01980c00-0000-7000-8000-000000000006',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  )
  and not app_private.is_active_cohort_question_trainer(
    '01980c00-0000-7000-8000-000000000006',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  ),
  'a global trainer assignment is never a scoped transfer destination'
);

update public.profiles
set deactivated_at = statement_timestamp()
where user_id = '01980c00-0000-7000-8000-000000000002';
select ok(
  not app_private.is_active_cohort_review_trainer(
    '01980c00-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  )
  and not app_private.is_active_cohort_question_trainer(
    '01980c00-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  ),
  'a deactivated profile is not a review or question destination'
);

update public.profiles
set deactivated_at = null
where user_id = '01980c00-0000-7000-8000-000000000002';
update public.organization_memberships
set removed_at = statement_timestamp()
where organization_id = '01980c10-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000002';
select ok(
  not app_private.is_active_cohort_review_trainer(
    '01980c00-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  )
  and not app_private.is_active_cohort_question_trainer(
    '01980c00-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  ),
  'a logically removed tenant membership is not a trainer destination'
);

update public.organization_memberships
set removed_at = null
where organization_id = '01980c10-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000002';
update public.cohort_memberships
set removed_at = statement_timestamp()
where cohort_id = '01980c30-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000002'
  and role = 'trainer';
select ok(
  not app_private.is_active_cohort_review_trainer(
    '01980c00-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  )
  and not app_private.is_active_cohort_question_trainer(
    '01980c00-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  ),
  'a logically removed cohort membership is not a trainer destination'
);

update public.cohort_memberships
set removed_at = null
where cohort_id = '01980c30-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000002'
  and role = 'trainer';
update public.organizations
set archived_at = statement_timestamp()
where id = '01980c10-0000-7000-8000-000000000001';
select ok(
  not app_private.is_active_cohort_review_trainer(
    '01980c00-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  )
  and not app_private.is_active_cohort_question_trainer(
    '01980c00-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000001',
    '01980c10-0000-7000-8000-000000000001'
  ),
  'an archived tenant exposes no trainer destination'
);

update public.organizations
set archived_at = null
where id = '01980c10-0000-7000-8000-000000000001';

select ok(
  app_private.is_active_cohort_review_trainer(
    '01980c00-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000003',
    '01980c10-0000-7000-8000-000000000001'
  )
  and not app_private.is_active_cohort_review_trainer(
    '01980c00-0000-7000-8000-000000000002',
    '01980c30-0000-7000-8000-000000000004',
    '01980c10-0000-7000-8000-000000000001'
  ),
  'target eligibility retains completed history and denies cancelled cohorts'
);

-- The prerequisite projection now observes deactivation and logical removal.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  (
    select count(*)::bigint
    from public.list_visible_skill_prerequisites() edge_record
    where edge_record.parent_skill_id =
      '01980c50-0000-7000-8000-000000000001'
      and edge_record.child_skill_id =
        '01980c50-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'an active member sees its active tenant prerequisite edge'
);

reset role;
update public.profiles
set deactivated_at = statement_timestamp()
where user_id = '01980c00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select throws_ok(
  $$ select * from public.list_visible_skill_prerequisites() $$,
  '42501',
  'visible skill prerequisite scope denied',
  'a deactivated profile cannot use the prerequisite projection'
);

reset role;
update public.profiles
set deactivated_at = null
where user_id = '01980c00-0000-7000-8000-000000000001';
update public.organization_memberships
set removed_at = statement_timestamp()
where organization_id = '01980c10-0000-7000-8000-000000000001'
  and user_id = '01980c00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980c00-0000-7000-8000-000000000001', true
);
select is(
  (
    select count(*)::bigint
    from public.list_visible_skill_prerequisites() edge_record
    where edge_record.parent_skill_id =
      '01980c50-0000-7000-8000-000000000001'
      and edge_record.child_skill_id =
        '01980c50-0000-7000-8000-000000000002'
  ),
  0::bigint,
  'a logically removed member receives no tenant prerequisite edge'
);

select * from finish();
rollback;
