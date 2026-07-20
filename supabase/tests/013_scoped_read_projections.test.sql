begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- Contract metadata: exact projections, hardened execution context and grants.
select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'list_visible_skill_prerequisites'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = ''
  ),
  1::bigint,
  'one parameterless visible skill prerequisite RPC exists'
);

select is(
  (
    select pg_catalog.pg_get_function_result(procedure_record.oid)
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'list_visible_skill_prerequisites'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = ''
  ),
  'TABLE(parent_skill_id uuid, child_skill_id uuid)',
  'skill prerequisite lookup exposes only edge identifiers'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'list_organization_member_profiles'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = 'uuid'
  ),
  1::bigint,
  'one organization member profile RPC exists'
);

select is(
  (
    select pg_catalog.pg_get_function_result(procedure_record.oid)
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'list_organization_member_profiles'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = 'uuid'
  ),
  'TABLE(user_id uuid, display_name text, locale text, timezone text, profile_state record_state, membership_state membership_state)',
  'organization member lookup exposes no email, auth metadata or secrets'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'list_active_question_trainers'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = 'uuid'
  ),
  1::bigint,
  'one question-specific trainer projection exists'
);

select is(
  (
    select pg_catalog.pg_get_function_result(procedure_record.oid)
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'list_active_question_trainers'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = 'uuid'
  ),
  'TABLE(user_id uuid, display_name text)',
  'question trainer lookup exposes only identifier and display name'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname in (
        'list_visible_skill_prerequisites',
        'list_organization_member_profiles',
        'list_active_question_trainers'
      )
      and procedure_record.prosecdef
      and procedure_record.provolatile = 's'
      and procedure_record.proconfig = array['search_path=""']::text[]
  ),
  3::bigint,
  'all public projections are stable security-definer functions with an empty search path'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.list_visible_skill_prerequisites()', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.list_organization_member_profiles(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.list_active_question_trainers(uuid)', 'EXECUTE'
  ),
  'authenticated callers can execute all scoped projections'
);

select ok(
  has_function_privilege(
    'service_role', 'public.list_visible_skill_prerequisites()', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.list_organization_member_profiles(uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.list_active_question_trainers(uuid)', 'EXECUTE'
  ),
  'the server role can execute the actor-derived projections'
);

select ok(
  not has_function_privilege(
    'anon', 'public.list_visible_skill_prerequisites()', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.list_organization_member_profiles(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.list_active_question_trainers(uuid)', 'EXECUTE'
  ),
  'anonymous callers have no projection execute grants'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.is_active_cohort_question_trainer(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.is_active_cohort_question_trainer(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'the arbitrary-user eligibility helper is not API-executable'
);

select ok(
  (
    select procedure_record.prosecdef
      and procedure_record.provolatile = 's'
      and procedure_record.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'app_private'
      and procedure_record.proname = 'is_active_cohort_question_trainer'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'uuid, uuid, uuid'
  ),
  'the private arbitrary-user eligibility helper has the same hardened execution context'
);

-- Tenant, profile and role fixtures. The seed-fixture marker prevents the
-- standalone onboarding trigger from assigning unintended memberships/roles.
insert into public.organizations (id, slug, name, state)
values
  (
    '01980b10-0000-7000-8000-000000000002',
    'scoped-read-other-tenant', 'Scoped Read Other Tenant', 'active'
  ),
  (
    '01980b10-0000-7000-8000-000000000003',
    'scoped-read-suspended-tenant', 'Scoped Read Suspended Tenant', 'suspended'
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
  jsonb_build_object('display_name', fixture.display_name, 'locale', fixture.locale),
  statement_timestamp(), statement_timestamp(), '', '', '', ''
from (values
  ('01980b00-0000-7000-8000-000000000001'::uuid, 'cora-content@scope.test', 'Cora Content', 'de'),
  ('01980b00-0000-7000-8000-000000000002'::uuid, 'aaron-question@scope.test', 'Aaron Question', 'en'),
  ('01980b00-0000-7000-8000-000000000003'::uuid, 'berta-no-question@scope.test', 'Berta No Question', 'en'),
  ('01980b00-0000-7000-8000-000000000004'::uuid, 'iris-inactive@scope.test', 'Iris Inactive Profile', 'en'),
  ('01980b00-0000-7000-8000-000000000005'::uuid, 'mona-suspended@scope.test', 'Mona Suspended Membership', 'de'),
  ('01980b00-0000-7000-8000-000000000006'::uuid, 'nina-cohort@scope.test', 'Nina Suspended Cohort', 'ru'),
  ('01980b00-0000-7000-8000-000000000007'::uuid, 'rex-revoked@scope.test', 'Rex Revoked Role', 'en'),
  ('01980b00-0000-7000-8000-000000000008'::uuid, 'alpha-other@scope.test', 'Alpha Other Trainer', 'de'),
  ('01980b00-0000-7000-8000-000000000009'::uuid, 'zulu-other@scope.test', 'Zulu Other Member', 'ru'),
  ('01980b00-0000-7000-8000-00000000000a'::uuid, 'ivan-invited@scope.test', 'Ivan Invited', 'en'),
  ('01980b00-0000-7000-8000-00000000000b'::uuid, 'remy-removed@scope.test', 'Remy Removed', 'en')
) as fixture(user_id, email, display_name, locale);

update public.profiles
set state = 'inactive'
where user_id = '01980b00-0000-7000-8000-000000000004';

insert into public.organization_memberships (
  organization_id, user_id, state, joined_at
)
values
  ('01980a10-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000001', 'active', statement_timestamp()),
  ('01980a10-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000002', 'active', statement_timestamp()),
  ('01980a10-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000003', 'active', statement_timestamp()),
  ('01980a10-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000004', 'active', statement_timestamp()),
  ('01980a10-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000005', 'suspended', null),
  ('01980a10-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000006', 'active', statement_timestamp()),
  ('01980a10-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000007', 'active', statement_timestamp()),
  ('01980b10-0000-7000-8000-000000000002', '01980b00-0000-7000-8000-000000000008', 'active', statement_timestamp()),
  ('01980b10-0000-7000-8000-000000000002', '01980b00-0000-7000-8000-000000000009', 'active', statement_timestamp()),
  ('01980a10-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-00000000000a', 'invited', null),
  ('01980a10-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-00000000000b', 'removed', null);

insert into public.roles (id, code, description, is_system)
values (
  '01980b12-0000-7000-8000-000000000001',
  'question_only_contract', 'Question-only scoped projection test role', false
);

insert into public.role_permissions (role_id, permission_id)
select '01980b12-0000-7000-8000-000000000001', permission_record.id
from public.permissions permission_record
where permission_record.code = 'question.manage';

insert into public.user_roles (
  user_id, role_id, organization_id, reason, revoked_at
)
select
  fixture.user_id,
  case
    when fixture.role_code = 'question_only_contract'
      then '01980b12-0000-7000-8000-000000000001'::uuid
    else role_record.id
  end,
  fixture.organization_id,
  'scoped read projection contract fixture',
  fixture.revoked_at
from (values
  ('01980b00-0000-7000-8000-000000000001'::uuid, 'content_admin', '01980a10-0000-7000-8000-000000000001'::uuid, null::timestamptz),
  ('01980b00-0000-7000-8000-000000000002'::uuid, 'question_only_contract', '01980a10-0000-7000-8000-000000000001'::uuid, null::timestamptz),
  ('01980b00-0000-7000-8000-000000000003'::uuid, 'learner', '01980a10-0000-7000-8000-000000000001'::uuid, null::timestamptz),
  ('01980b00-0000-7000-8000-000000000004'::uuid, 'question_only_contract', '01980a10-0000-7000-8000-000000000001'::uuid, null::timestamptz),
  ('01980b00-0000-7000-8000-000000000005'::uuid, 'question_only_contract', '01980a10-0000-7000-8000-000000000001'::uuid, null::timestamptz),
  ('01980b00-0000-7000-8000-000000000006'::uuid, 'question_only_contract', '01980a10-0000-7000-8000-000000000001'::uuid, null::timestamptz),
  ('01980b00-0000-7000-8000-000000000007'::uuid, 'question_only_contract', '01980a10-0000-7000-8000-000000000001'::uuid, statement_timestamp()),
  ('01980b00-0000-7000-8000-000000000008'::uuid, 'question_only_contract', '01980b10-0000-7000-8000-000000000002'::uuid, null::timestamptz)
) as fixture(user_id, role_code, organization_id, revoked_at)
left join public.roles role_record on role_record.code = fixture.role_code
where fixture.role_code = 'question_only_contract' or role_record.id is not null;

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, created_by
)
values (
  '01980b30-0000-7000-8000-000000000002',
  '01980b10-0000-7000-8000-000000000002',
  '01980a20-0000-7000-8000-000000000001',
  '01980a22-0000-7000-8000-000000000001',
  'Scoped Read Other Cohort', 'active', 'scheduled',
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.cohort_memberships (
  cohort_id, user_id, role, state, assigned_by
)
values
  ('01980a30-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000002', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980a30-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000003', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980a30-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000004', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980a30-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000005', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980a30-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000006', 'trainer', 'suspended', '01980a00-0000-7000-8000-000000000003'),
  ('01980a30-0000-7000-8000-000000000001', '01980b00-0000-7000-8000-000000000007', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003'),
  ('01980b30-0000-7000-8000-000000000002', '01980b00-0000-7000-8000-000000000008', 'trainer', 'active', '01980a00-0000-7000-8000-000000000003');

-- Skill fixtures cover active/draft/inactive, global/two tenants and a
-- cross-tenant edge whose identifiers must never leak to a single-tenant actor.
insert into public.skills (
  id, organization_id, code, labels, state
)
values
  ('01980b50-0000-7000-8000-000000000001', null, 'scope-global-parent', '{"en":"Global parent"}', 'active'),
  ('01980b50-0000-7000-8000-000000000002', null, 'scope-global-child', '{"en":"Global child"}', 'active'),
  ('01980b50-0000-7000-8000-000000000003', null, 'scope-global-draft', '{"en":"Global draft"}', 'draft'),
  ('01980b50-0000-7000-8000-000000000004', null, 'scope-global-inactive', '{"en":"Global inactive"}', 'inactive'),
  ('01980b50-0000-7000-8000-000000000011', '01980a10-0000-7000-8000-000000000001', 'scope-a-parent', '{"en":"Tenant A parent"}', 'active'),
  ('01980b50-0000-7000-8000-000000000012', '01980a10-0000-7000-8000-000000000001', 'scope-a-child', '{"en":"Tenant A child"}', 'active'),
  ('01980b50-0000-7000-8000-000000000013', '01980a10-0000-7000-8000-000000000001', 'scope-a-draft', '{"en":"Tenant A draft"}', 'draft'),
  ('01980b50-0000-7000-8000-000000000014', '01980a10-0000-7000-8000-000000000001', 'scope-a-inactive', '{"en":"Tenant A inactive"}', 'inactive'),
  ('01980b50-0000-7000-8000-000000000021', '01980b10-0000-7000-8000-000000000002', 'scope-b-parent', '{"en":"Tenant B parent"}', 'active'),
  ('01980b50-0000-7000-8000-000000000022', '01980b10-0000-7000-8000-000000000002', 'scope-b-child', '{"en":"Tenant B child"}', 'active'),
  ('01980b50-0000-7000-8000-000000000023', '01980b10-0000-7000-8000-000000000002', 'scope-b-draft', '{"en":"Tenant B draft"}', 'draft');

insert into public.skill_edges (parent_skill_id, child_skill_id, relation)
values
  ('01980b50-0000-7000-8000-000000000001', '01980b50-0000-7000-8000-000000000002', 'prerequisite'),
  ('01980b50-0000-7000-8000-000000000011', '01980b50-0000-7000-8000-000000000012', 'prerequisite'),
  ('01980b50-0000-7000-8000-000000000011', '01980b50-0000-7000-8000-000000000013', 'prerequisite'),
  ('01980b50-0000-7000-8000-000000000021', '01980b50-0000-7000-8000-000000000022', 'prerequisite'),
  ('01980b50-0000-7000-8000-000000000021', '01980b50-0000-7000-8000-000000000023', 'prerequisite'),
  ('01980b50-0000-7000-8000-000000000003', '01980b50-0000-7000-8000-000000000002', 'prerequisite'),
  ('01980b50-0000-7000-8000-000000000004', '01980b50-0000-7000-8000-000000000002', 'prerequisite'),
  ('01980b50-0000-7000-8000-000000000002', '01980b50-0000-7000-8000-000000000001', 'related');

select throws_ok(
  $$ insert into public.skill_edges (
       parent_skill_id, child_skill_id, relation
     ) values (
       '01980b50-0000-7000-8000-000000000011',
       '01980b50-0000-7000-8000-000000000021',
       'prerequisite'
     ) $$,
  '23514',
  'skill edge scope and taxonomy version must be compatible',
  'the competency graph rejects a cross-tenant edge before projection'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ select * from public.list_visible_skill_prerequisites() $$,
  '42501', 'authentication required',
  'skill prerequisite lookup rejects a missing session'
);

select throws_ok(
  $$ select * from public.list_organization_member_profiles(
    '01980a10-0000-7000-8000-000000000001'
  ) $$,
  '42501', 'authentication required',
  'organization member lookup rejects a missing session'
);

select throws_ok(
  $$ select * from public.list_active_question_trainers(
    '01980a30-0000-7000-8000-000000000001'
  ) $$,
  '42501', 'authentication required',
  'question trainer lookup rejects a missing session'
);

-- Learner skill visibility: only active global and active tenant-A edges.
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select results_eq(
  $$ select parent_skill_id, child_skill_id
     from public.list_visible_skill_prerequisites() $$,
  $$ values
     ('01980b50-0000-7000-8000-000000000001'::uuid, '01980b50-0000-7000-8000-000000000002'::uuid),
     ('01980b50-0000-7000-8000-000000000011'::uuid, '01980b50-0000-7000-8000-000000000012'::uuid) $$,
  'a learner sees only active global and own-active-tenant prerequisite edges'
);

select is(
  (select count(*)::bigint from public.skill_edges),
  0::bigint,
  'a learner cannot bypass the projection by selecting raw skill edges'
);

select set_config(
  'request.jwt.claim.sub', '01980b00-0000-7000-8000-000000000001', true
);

select results_eq(
  $$ select parent_skill_id, child_skill_id
     from public.list_visible_skill_prerequisites() $$,
  $$ values
     ('01980b50-0000-7000-8000-000000000001'::uuid, '01980b50-0000-7000-8000-000000000002'::uuid),
     ('01980b50-0000-7000-8000-000000000011'::uuid, '01980b50-0000-7000-8000-000000000012'::uuid),
     ('01980b50-0000-7000-8000-000000000011'::uuid, '01980b50-0000-7000-8000-000000000013'::uuid) $$,
  'an active tenant content manager sees that tenant draft edges but no global or cross-tenant drafts'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select results_eq(
  $$ select parent_skill_id, child_skill_id
     from public.list_visible_skill_prerequisites() $$,
  $$ values
     ('01980b50-0000-7000-8000-000000000001'::uuid, '01980b50-0000-7000-8000-000000000002'::uuid),
     ('01980b50-0000-7000-8000-000000000003'::uuid, '01980b50-0000-7000-8000-000000000002'::uuid),
     ('01980b50-0000-7000-8000-000000000011'::uuid, '01980b50-0000-7000-8000-000000000012'::uuid),
     ('01980b50-0000-7000-8000-000000000011'::uuid, '01980b50-0000-7000-8000-000000000013'::uuid) $$,
  'a global content manager sees global drafts and drafts in an active member tenant only'
);

select set_config(
  'request.jwt.claim.sub', '01980b00-0000-7000-8000-000000000008', true
);

select results_eq(
  $$ select parent_skill_id, child_skill_id
     from public.list_visible_skill_prerequisites() $$,
  $$ values
     ('01980b50-0000-7000-8000-000000000001'::uuid, '01980b50-0000-7000-8000-000000000002'::uuid),
     ('01980b50-0000-7000-8000-000000000021'::uuid, '01980b50-0000-7000-8000-000000000022'::uuid) $$,
  'a tenant-B member sees no tenant-A edge or draft edge'
);

select set_config(
  'request.jwt.claim.sub', '01980b00-0000-7000-8000-000000000004', true
);

select throws_ok(
  $$ select * from public.list_visible_skill_prerequisites() $$,
  '42501', 'visible skill prerequisite scope denied',
  'an inactive profile cannot read even global prerequisite identifiers'
);

-- Losing active membership removes tenant edges without suppressing safe global taxonomy.
reset role;
update public.organization_memberships
set state = 'suspended'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select results_eq(
  $$ select parent_skill_id, child_skill_id
     from public.list_visible_skill_prerequisites() $$,
  $$ values
     ('01980b50-0000-7000-8000-000000000001'::uuid, '01980b50-0000-7000-8000-000000000002'::uuid) $$,
  'a suspended membership immediately loses all tenant skill edges'
);

reset role;
update public.organization_memberships
set state = 'active'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000001';

-- Organization member projection: tenant manager, global administrator and denial paths.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true
);

select ok(
  exists (
    select 1
    from public.list_organization_member_profiles(
      '01980a10-0000-7000-8000-000000000001'
    ) member_record
    where member_record.user_id = '01980b00-0000-7000-8000-00000000000a'
      and member_record.display_name = 'Ivan Invited'
      and member_record.locale = 'en'
      and member_record.timezone = 'UTC'
      and member_record.profile_state = 'active'
      and member_record.membership_state = 'invited'
  ),
  'an organization manager receives the documented minimal invited-member shape'
);

select ok(
  exists (
    select 1
    from public.list_organization_member_profiles(
      '01980a10-0000-7000-8000-000000000001'
    ) member_record
    where member_record.user_id = '01980b00-0000-7000-8000-000000000005'
      and member_record.membership_state = 'suspended'
  ),
  'organization management can see a suspended live membership for remediation'
);

select ok(
  not exists (
    select 1
    from public.list_organization_member_profiles(
      '01980a10-0000-7000-8000-000000000001'
    ) member_record
    where member_record.user_id = '01980b00-0000-7000-8000-00000000000b'
  ),
  'removed membership history is not exposed as a current organization member'
);

select throws_ok(
  $$ select * from public.list_organization_member_profiles(
    '01980b10-0000-7000-8000-000000000002'
  ) $$,
  '42501', 'organization member profile scope denied',
  'a tenant-A organization manager cannot enumerate tenant-B profiles'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$ select * from public.list_organization_member_profiles(
    '01980a10-0000-7000-8000-000000000001'
  ) $$,
  '42501', 'organization member profile scope denied',
  'an ordinary active member cannot enumerate organization profiles'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);

select results_eq(
  $$ select display_name, membership_state::text
     from public.list_organization_member_profiles(
       '01980b10-0000-7000-8000-000000000002'
     ) $$,
  $$ values
     ('Alpha Other Trainer'::text, 'active'::text),
     ('Zulu Other Member'::text, 'active'::text) $$,
  'a valid global administrator needs no tenant-B membership and receives deterministic name order'
);

select throws_ok(
  $$ select * from public.list_organization_member_profiles(
    '01980b10-0000-7000-8000-000000000003'
  ) $$,
  '42501', 'organization member profile scope denied',
  'even a global administrator cannot enumerate a suspended organization'
);

reset role;
update public.organization_memberships
set state = 'suspended'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000004';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true
);

select throws_ok(
  $$ select * from public.list_organization_member_profiles(
    '01980a10-0000-7000-8000-000000000001'
  ) $$,
  '42501', 'organization member profile scope denied',
  'an organization manager with a suspended membership loses profile-list access'
);

reset role;
update public.organization_memberships
set state = 'active'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000004';
update public.profiles
set state = 'inactive'
where user_id = '01980a00-0000-7000-8000-000000000004';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true
);

select throws_ok(
  $$ select * from public.list_organization_member_profiles(
    '01980a10-0000-7000-8000-000000000001'
  ) $$,
  '42501', 'organization member profile scope denied',
  'an organization manager with an inactive profile loses profile-list access'
);

reset role;
update public.profiles
set state = 'active'
where user_id = '01980a00-0000-7000-8000-000000000004';

-- Question-specific trainer projection and isolation from review.manage.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select results_eq(
  $$ select user_id, display_name
     from public.list_active_question_trainers(
       '01980a30-0000-7000-8000-000000000001'
     ) $$,
  $$ values
     ('01980b00-0000-7000-8000-000000000002'::uuid, 'Aaron Question'::text),
     ('01980a00-0000-7000-8000-000000000002'::uuid, 'Theo Trainer'::text) $$,
  'an active question trainer sees only eligible active question trainers in deterministic order'
);

select ok(
  exists (
    select 1
    from public.list_active_question_trainers(
      '01980a30-0000-7000-8000-000000000001'
    ) trainer_record
    where trainer_record.user_id = '01980b00-0000-7000-8000-000000000002'
  )
  and not exists (
    select 1
    from public.list_active_cohort_trainers(
      '01980a30-0000-7000-8000-000000000001'
    ) trainer_record
    where trainer_record.user_id = '01980b00-0000-7000-8000-000000000002'
  ),
  'question-only eligibility is independent from the review.manage trainer projection'
);

select is(
  (
    select count(*)::bigint
    from public.profiles profile_record
    where profile_record.user_id = '01980b00-0000-7000-8000-000000000002'
  ),
  0::bigint,
  'a trainer cannot read a co-trainer profile directly through broad table access'
);

select set_config(
  'request.jwt.claim.sub', '01980b00-0000-7000-8000-000000000002', true
);

select lives_ok(
  $$ select * from public.list_active_question_trainers(
    '01980a30-0000-7000-8000-000000000001'
  ) $$,
  'a question-only active trainer may call the question trainer projection'
);

select throws_ok(
  $$ select * from public.list_active_cohort_trainers(
    '01980a30-0000-7000-8000-000000000001'
  ) $$,
  '42501', 'active cohort trainer scope denied',
  'a question-only trainer cannot call the review-specific trainer projection'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$ select * from public.list_active_question_trainers(
    '01980a30-0000-7000-8000-000000000001'
  ) $$,
  '42501', 'active question trainer scope denied',
  'a learner cannot enumerate question trainers'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true
);

select is(
  (
    select count(*)::bigint
    from public.list_active_question_trainers(
      '01980a30-0000-7000-8000-000000000001'
    )
  ),
  2::bigint,
  'an active cohort manager may enumerate the same minimal eligible trainer set'
);

reset role;
update public.organization_memberships
set state = 'suspended'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000004';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true
);

select throws_ok(
  $$ select * from public.list_active_question_trainers(
    '01980a30-0000-7000-8000-000000000001'
  ) $$,
  '42501', 'active question trainer scope denied',
  'a cohort manager with a suspended organization membership cannot enumerate trainers'
);

reset role;
update public.organization_memberships
set state = 'active'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000004';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.list_active_question_trainers(
    '01980b30-0000-7000-8000-000000000002'
  ) $$,
  '42501', 'active question trainer scope denied',
  'a tenant-A trainer cannot enumerate a tenant-B cohort'
);

select set_config(
  'request.jwt.claim.sub', '01980b00-0000-7000-8000-000000000008', true
);

select results_eq(
  $$ select user_id, display_name
     from public.list_active_question_trainers(
       '01980b30-0000-7000-8000-000000000002'
     ) $$,
  $$ values
     ('01980b00-0000-7000-8000-000000000008'::uuid, 'Alpha Other Trainer'::text) $$,
  'the tenant-B question trainer receives only the tenant-B eligible trainer'
);

reset role;
update public.organizations
set state = 'suspended'
where id = '01980b10-0000-7000-8000-000000000002';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980b00-0000-7000-8000-000000000008', true
);

select throws_ok(
  $$ select * from public.list_active_question_trainers(
    '01980b30-0000-7000-8000-000000000002'
  ) $$,
  '42501', 'active question trainer scope denied',
  'a suspended tenant cannot expose its cohort trainer projection'
);

reset role;
update public.organizations
set state = 'active'
where id = '01980b10-0000-7000-8000-000000000002';
update public.cohorts
set state = 'completed', completed_at = statement_timestamp()
where id = '01980b30-0000-7000-8000-000000000002';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980b00-0000-7000-8000-000000000008', true
);

select throws_ok(
  $$ select * from public.list_active_question_trainers(
    '01980b30-0000-7000-8000-000000000002'
  ) $$,
  '42501', 'active question trainer scope denied',
  'a completed cohort cannot expose a trainer projection'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.list_active_question_trainers(
    '01980b30-0000-7000-8000-000000000099'
  ) $$,
  '42501', 'active question trainer scope denied',
  'a missing cohort is indistinguishable from forbidden scope'
);

-- Each eligibility dimension is independently fail-closed for candidates.
select ok(
  not exists (
    select 1
    from public.list_active_question_trainers(
      '01980a30-0000-7000-8000-000000000001'
    ) trainer_record
    where trainer_record.user_id in (
      '01980b00-0000-7000-8000-000000000003',
      '01980b00-0000-7000-8000-000000000004',
      '01980b00-0000-7000-8000-000000000005',
      '01980b00-0000-7000-8000-000000000006',
      '01980b00-0000-7000-8000-000000000007'
    )
  ),
  'wrong permission, inactive profile, suspended organization membership, suspended cohort membership and revoked role are all excluded'
);

reset role;
update public.profiles
set state = 'inactive'
where user_id = '01980b00-0000-7000-8000-000000000002';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980b00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.list_active_question_trainers(
    '01980a30-0000-7000-8000-000000000001'
  ) $$,
  '42501', 'active question trainer scope denied',
  'an inactive trainer profile cannot invoke the projection'
);

reset role;
update public.profiles
set state = 'active'
where user_id = '01980b00-0000-7000-8000-000000000002';
update public.organization_memberships
set state = 'suspended'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980b00-0000-7000-8000-000000000002';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980b00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.list_active_question_trainers(
    '01980a30-0000-7000-8000-000000000001'
  ) $$,
  '42501', 'active question trainer scope denied',
  'a trainer with a suspended organization membership cannot invoke the projection'
);

reset role;
update public.organization_memberships
set state = 'active'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980b00-0000-7000-8000-000000000002';
update public.user_roles
set revoked_at = statement_timestamp()
where user_id = '01980b00-0000-7000-8000-000000000002'
  and role_id = '01980b12-0000-7000-8000-000000000001';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980b00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select * from public.list_active_question_trainers(
    '01980a30-0000-7000-8000-000000000001'
  ) $$,
  '42501', 'active question trainer scope denied',
  'a trainer with a revoked question role cannot invoke the projection'
);

reset role;
select * from finish();
rollback;
