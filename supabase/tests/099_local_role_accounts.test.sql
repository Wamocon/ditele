begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

select is(
  (
    select count(*)::bigint
    from auth.users as account
    where (account.id, account.email) in (
      ('01980a00-0000-7000-8000-000000000001'::uuid, 'learner@ditele.local'),
      ('01980a00-0000-7000-8000-000000000002'::uuid, 'trainer@ditele.local'),
      ('01980a00-0000-7000-8000-000000000003'::uuid, 'admin@ditele.local'),
      ('01980a00-0000-7000-8000-000000000004'::uuid, 'org-admin@ditele.local')
    )
      and account.encrypted_password =
        extensions.crypt('123123123', account.encrypted_password)
  ),
  4::bigint,
  'all deterministic local role accounts accept the documented password'
);

select is(
  (
    select array_agg(role_record.code order by role_record.code)::text
    from public.user_roles as assignment
    join public.roles as role_record on role_record.id = assignment.role_id
    where assignment.user_id = '01980a00-0000-7000-8000-000000000001'
      and assignment.revoked_at is null
  ),
  '{learner}'::text,
  'learner fixture has only the learner role'
);

select is(
  (
    select array_agg(role_record.code order by role_record.code)::text
    from public.user_roles as assignment
    join public.roles as role_record on role_record.id = assignment.role_id
    where assignment.user_id = '01980a00-0000-7000-8000-000000000002'
      and assignment.revoked_at is null
  ),
  '{trainer}'::text,
  'trainer fixture has only the trainer role'
);

select is(
  (
    select array_agg(role_record.code order by role_record.code)::text
    from public.user_roles as assignment
    join public.roles as role_record on role_record.id = assignment.role_id
    where assignment.user_id = '01980a00-0000-7000-8000-000000000003'
      and assignment.revoked_at is null
  ),
  '{admin,content_admin}'::text,
  'admin fixture owns the platform and content administration roles'
);

select is(
  (
    select array_agg(role_record.code order by role_record.code)::text
    from public.user_roles as assignment
    join public.roles as role_record on role_record.id = assignment.role_id
    where assignment.user_id = '01980a00-0000-7000-8000-000000000004'
      and assignment.revoked_at is null
  ),
  '{organization_admin}'::text,
  'organization-admin fixture owns only the tenant administration role'
);

select is(
  (
    select count(*)::bigint
    from auth.identities as identity_record
    where identity_record.provider = 'email'
      and identity_record.user_id in (
        '01980a00-0000-7000-8000-000000000001',
        '01980a00-0000-7000-8000-000000000002',
        '01980a00-0000-7000-8000-000000000003',
        '01980a00-0000-7000-8000-000000000004'
      )
  ),
  4::bigint,
  'every deterministic role account has one email identity'
);

select * from finish();
rollback;
