begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'submissions', 'submissions table exists');
select has_table('public', 'evidence', 'evidence ledger exists');
select has_table('public', 'outbox_events', 'transactional outbox exists');
select has_table('public', 'consent_records', 'consent records exist');

select is(
  (select count(*)::bigint from auth.users where email like '%@ditele.local'),
  4::bigint,
  'four deterministic role users are seeded'
);

select is(
  (select count(*)::bigint from public.organizations where is_default),
  1::bigint,
  'exactly one standalone default organization exists'
);

select is(
  (
    select array_agg(r.code order by r.code)::text
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = '01980a00-0000-7000-8000-000000000002'
      and ur.revoked_at is null
  ),
  '{trainer}'::text,
  'trainer seed does not inherit learner privileges'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ),
  0::bigint,
  'every public table has RLS enabled and forced'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and constraint_row.contype = 'f'
      and not exists (
        select 1
        from pg_catalog.pg_index index_row
        where index_row.indrelid = constraint_row.conrelid
          and constraint_row.conkey <@ index_row.indkey::smallint[]
      )
  ),
  0::bigint,
  'every foreign key is covered by an index'
);

select is(
  substring(app_private.uuid7()::text, 15, 1),
  '7',
  'generated exposed IDs are UUIDv7'
);

select throws_ok(
  $$
    update public.cohorts
    set state = 'waiting'
    where id = '01980a30-0000-7000-8000-000000000001'
  $$,
  '23514',
  'invalid cohorts transition: active -> waiting',
  'invalid cohort transition is rejected'
);

select throws_ok(
  $$
    update public.content_versions
    set change_summary = 'mutated'
    where id = '01980a22-0000-7000-8000-000000000001'
  $$,
  '55000',
  'published content versions are immutable',
  'published content cannot be changed'
);

select is(
  (
    select count(*)::bigint
    from public.entitlements
    where user_id = '01980a00-0000-7000-8000-000000000001'
  ),
  2::bigint,
  'learner seed has deterministic entitlements'
);

select is(
  (
    select count(*)::bigint
    from public.cohort_memberships
    where cohort_id = '01980a30-0000-7000-8000-000000000001' and state = 'active'
  ),
  2::bigint,
  'seed cohort has one learner and one trainer'
);

select * from finish();
rollback;

