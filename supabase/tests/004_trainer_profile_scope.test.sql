begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);

insert into public.organizations (id, slug, name, state)
values ('01980aff-0000-7000-8000-000000000001', 'other-tenant', 'Other Tenant', 'active');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000',
  '01980aff-0000-7000-8000-000000000002',
  'authenticated', 'authenticated', 'cross-tenant@ditele.local',
  extensions.crypt('Ditele-Local-2026!', extensions.gen_salt('bf')),
  statement_timestamp(), '{"provider":"email","providers":["email"]}',
  '{"display_name":"Cross Tenant Learner","locale":"en"}',
  statement_timestamp(), statement_timestamp(), '', '', '', ''
);

delete from public.user_roles
where user_id = '01980aff-0000-7000-8000-000000000002';
delete from public.organization_memberships
where user_id = '01980aff-0000-7000-8000-000000000002';

insert into public.organization_memberships (organization_id, user_id, state, joined_at)
values (
  '01980aff-0000-7000-8000-000000000001',
  '01980aff-0000-7000-8000-000000000002',
  'active', statement_timestamp()
);
insert into public.user_roles (user_id, role_id, organization_id, reason)
select
  '01980aff-0000-7000-8000-000000000002', id,
  '01980aff-0000-7000-8000-000000000001', 'cross-tenant RLS test'
from public.roles where code = 'learner';

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::bigint from public.profiles),
  2::bigint,
  'trainer sees self and learner in actively trained cohort only'
);
select is(
  (select count(*)::bigint from public.profiles where user_id = '01980aff-0000-7000-8000-000000000002'),
  0::bigint,
  'trainer cannot see a cross-tenant learner profile'
);
select is(
  (select count(*)::bigint from public.profiles where user_id = '01980a00-0000-7000-8000-000000000004'),
  0::bigint,
  'trainer cannot see unrelated same-tenant organization admin profile'
);

select * from finish();
rollback;

