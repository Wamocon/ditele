begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select (public.start_attempt(
    '01980a26-0000-7000-8000-000000000001',
    'start-idempotency-000001'
  )).id),
  '01980a34-0000-7000-8000-000000000001'::uuid,
  'start_attempt is idempotent against an existing current attempt'
);

select lives_ok(
  $$
    select * from public.save_attempt_draft(
      '01980a34-0000-7000-8000-000000000001', 1,
      'first telemetry save',
      array['01980a28-0000-7000-8000-000000000001'::uuid],
      '[]'::jsonb,
      120,
      array['01980a29-0000-7000-8000-000000000001'::uuid]
    )
  $$,
  'valid elapsed time and owned hint usage save atomically'
);

select is(
  (select elapsed_seconds from public.attempts where id = '01980a34-0000-7000-8000-000000000001'),
  120,
  'elapsed seconds are recorded'
);
select ok(
  (select hint_used and hint_first_used_at is not null from public.attempts where id = '01980a34-0000-7000-8000-000000000001'),
  'hint-used and first-used telemetry become sticky'
);

select lives_ok(
  $$
    select * from public.save_attempt_draft(
      '01980a34-0000-7000-8000-000000000001', 2,
      'second telemetry save',
      array['01980a28-0000-7000-8000-000000000001'::uuid],
      '[]'::jsonb,
      60,
      '{}'::uuid[]
    )
  $$,
  'later save cannot reduce prior telemetry'
);
select is(
  (select elapsed_seconds from public.attempts where id = '01980a34-0000-7000-8000-000000000001'),
  120,
  'elapsed time is monotonic'
);

select throws_ok(
  $$
    select * from public.save_attempt_draft(
      '01980a34-0000-7000-8000-000000000001', 1,
      'stale save', '{}'::uuid[], '[]'::jsonb, 121, '{}'::uuid[]
    )
  $$,
  '40001', 'draft is stale',
  'stale concurrent draft save is rejected'
);

select throws_ok(
  $$
    select * from public.save_attempt_draft(
      '01980a34-0000-7000-8000-000000000001', 3,
      'tampered hint', '{}'::uuid[], '[]'::jsonb, 121,
      array['01980aff-ffff-7fff-8fff-ffffffffffff'::uuid]
    )
  $$,
  '22023', 'used hint does not belong to the attempt task',
  'foreign or invented hint IDs are rejected'
);

select is(
  (select count(*)::bigint from public.task_assessments),
  0::bigint,
  'learner cannot read normalized task assessment authoring rows directly'
);

select * from finish();
rollback;
