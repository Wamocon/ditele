begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(20);

insert into public.enrollments (
  id, organization_id, learner_id, course_id, state, idempotency_key,
  decision_reason, decided_by, decided_at
)
values
  (
    '01980a43-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000004',
    '01980a20-0000-7000-8000-000000000001',
    'approved',
    'assignment-workflow-approved-0001',
    'Approved for assignment test',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp()
  ),
  (
    '01980a43-0000-7000-8000-000000000002',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000002',
    '01980a20-0000-7000-8000-000000000001',
    'approved',
    'assignment-workflow-capacity-0001',
    'Approved for capacity test',
    '01980a00-0000-7000-8000-000000000003',
    statement_timestamp()
  );

insert into public.organizations (id, slug, name, state)
values (
  '01980a10-0000-7000-8000-000000000099',
  'cross-tenant-test',
  'Cross Tenant Test',
  'active'
);

insert into public.organization_memberships (
  id, organization_id, user_id, state, joined_at
)
values (
  '01980a11-0000-7000-8000-000000000099',
  '01980a10-0000-7000-8000-000000000099',
  '01980a00-0000-7000-8000-000000000003',
  'active',
  statement_timestamp()
);

insert into public.enrollments (
  id, organization_id, learner_id, course_id, state, idempotency_key,
  decision_reason, decided_by, decided_at
)
values (
  '01980a43-0000-7000-8000-000000000099',
  '01980a10-0000-7000-8000-000000000099',
  '01980a00-0000-7000-8000-000000000003',
  '01980a20-0000-7000-8000-000000000001',
  'approved',
  'assignment-workflow-cross-tenant-01',
  'Approved in another tenant',
  '01980a00-0000-7000-8000-000000000003',
  statement_timestamp()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    select * from public.assign_enrollment(
      '01980a43-0000-7000-8000-000000000001',
      '01980a30-0000-7000-8000-000000000001',
      1,
      'Place learner in Release 0 cohort',
      '01980a44-0000-7000-8000-000000000001'
    )
  $$,
  'approved enrollment is assigned atomically'
);

reset role;

select is(
  (select state::text from public.enrollments where id = '01980a43-0000-7000-8000-000000000001'),
  'assigned',
  'enrollment enters assigned state'
);

select is(
  (
    select count(*)::bigint from public.cohort_memberships
    where cohort_id = '01980a30-0000-7000-8000-000000000001'
      and user_id = '01980a00-0000-7000-8000-000000000004'
      and role = 'learner' and state = 'active'
  ),
  1::bigint,
  'assignment creates one active learner cohort membership'
);

select is(
  (select count(*)::bigint from public.notifications where event_type = 'enrollment.assigned'),
  1::bigint,
  'assigned learner receives a notification'
);

select is(
  (select count(*)::bigint from public.outbox_events where event_type = 'enrollment.assigned.v1'),
  1::bigint,
  'assignment appends an integration event'
);

select throws_ok(
  $$
    select * from public.assign_enrollment(
      '01980a43-0000-7000-8000-000000000001',
      '01980a30-0000-7000-8000-000000000001',
      1,
      'Stale duplicate assignment',
      '01980a44-0000-7000-8000-000000000002'
    )
  $$,
  '40001',
  'enrollment is stale or not approved',
  'stale concurrent enrollment assignment is rejected'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);

select throws_ok(
  $$
    select * from public.assign_enrollment(
      '01980a43-0000-7000-8000-000000000002',
      '01980a30-0000-7000-8000-000000000001',
      1,
      'Learner attempts unauthorized assignment',
      '01980a44-0000-7000-8000-000000000003'
    )
  $$,
  '42501',
  'enrollment assignment scope denied',
  'learner cannot assign an approved enrollment'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true);

update public.cohorts set capacity = 2
where id = '01980a30-0000-7000-8000-000000000001';

select throws_ok(
  $$
    select * from public.assign_enrollment(
      '01980a43-0000-7000-8000-000000000002',
      '01980a30-0000-7000-8000-000000000001',
      1,
      'Capacity should prevent assignment',
      '01980a44-0000-7000-8000-000000000004'
    )
  $$,
  '23514',
  'cohort capacity is exhausted',
  'locked capacity check prevents overbooking'
);

select throws_ok(
  $$
    select * from public.assign_enrollment(
      '01980a43-0000-7000-8000-000000000099',
      '01980a30-0000-7000-8000-000000000001',
      1,
      'Cross-tenant assignment must fail',
      '01980a44-0000-7000-8000-000000000005'
    )
  $$,
  '42501',
  'enrollment assignment scope denied',
  'cross-tenant cohort assignment is denied before structural details are disclosed'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select lives_ok(
  $$
    select * from public.update_task_schedule(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      1,
      statement_timestamp() - interval '2 hours',
      statement_timestamp() + interval '14 days',
      'Extend practice availability after trainer review',
      '01980a44-0000-7000-8000-000000000006'
    )
  $$,
  'assigned trainer updates an active task schedule atomically'
);

select is(
  (
    select row_version from public.task_schedules
    where cohort_id = '01980a30-0000-7000-8000-000000000001'
      and task_id = '01980a26-0000-7000-8000-000000000001'
  ),
  2::bigint,
  'schedule CAS version advances'
);

select is(
  (select count(*)::bigint from public.audit_events where event_type = 'task_schedule.updated'),
  1::bigint,
  'schedule change is audited'
);

select is(
  (select count(*)::bigint from public.outbox_events where event_type = 'task_schedule.updated.v1'),
  1::bigint,
  'schedule change appends an integration event'
);

select throws_ok(
  $$
    select * from public.update_task_schedule(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      1,
      statement_timestamp(),
      statement_timestamp() + interval '7 days',
      'Stale schedule mutation',
      '01980a44-0000-7000-8000-000000000007'
    )
  $$,
  '40001',
  'task schedule is stale or missing',
  'stale schedule mutation is rejected'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);

select throws_ok(
  $$
    select * from public.update_task_schedule(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      2,
      statement_timestamp(),
      statement_timestamp() + interval '7 days',
      'Learner attempts schedule mutation',
      '01980a44-0000-7000-8000-000000000008'
    )
  $$,
  '42501',
  'schedule management scope denied',
  'learner cannot update the cohort schedule'
);

reset role;
set local role anon;

select is(
  (select count(*)::bigint from public.get_public_catalog('de')),
  1::bigint,
  'anonymous catalog returns the one active global published course'
);

select is(
  (select task_count from public.get_public_catalog('de') limit 1),
  1::bigint,
  'anonymous catalog exposes a safe active task count'
);

select is(
  (select version_number from public.get_public_catalog('de') limit 1),
  1,
  'anonymous catalog exposes the latest published version number'
);

select is(
  (select resolved_locale from public.get_public_catalog('de') limit 1),
  'de',
  'anonymous catalog resolves the requested supported locale'
);

select is(
  (select title from public.get_public_catalog('de') limit 1),
  'Praktisches Softwaretesten',
  'anonymous catalog exposes only localized safe metadata'
);

select * from finish();
rollback;
