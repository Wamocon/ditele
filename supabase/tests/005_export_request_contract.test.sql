begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(4);

select has_column('public', 'data_export_requests', 'export_kind', 'export kind is persisted');
select has_column('public', 'data_export_requests', 'filters', 'export filters are persisted');

select throws_ok(
  $$
    insert into public.data_export_requests (
      organization_id, requester_id, idempotency_key, export_kind
    ) values (
      '01980a10-0000-7000-8000-000000000001',
      '01980a00-0000-7000-8000-000000000003',
      'invalid-export-kind-0001', 'passwords'
    )
  $$,
  '23514',
  null,
  'unsupported export kinds are rejected'
);

select throws_ok(
  $$
    insert into public.data_export_requests (
      organization_id, requester_id, idempotency_key, export_kind, filters
    ) values (
      '01980a10-0000-7000-8000-000000000001',
      '01980a00-0000-7000-8000-000000000003',
      'invalid-export-filter-001', 'learners', '[]'::jsonb
    )
  $$,
  '23514',
  null,
  'export filters must be a JSON object'
);

select * from finish();
rollback;

