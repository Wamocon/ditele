begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(6);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::bigint from public.profiles),
  1::bigint,
  'learner sees only own profile'
);

select is(
  (select count(*)::bigint from public.cohorts),
  1::bigint,
  'learner sees assigned cohort'
);

select is(
  (select count(*)::bigint from public.attempts),
  1::bigint,
  'learner sees own attempt'
);

select is(
  (select count(*)::bigint from public.questions),
  0::bigint,
  'learner cannot see questions that have not been created'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select is(
  (select count(*)::bigint from public.attempts),
  0::bigint,
  'assigned trainer cannot inspect an attempt before an immutable submission exists'
);

select is(
  (select count(*)::bigint from public.profiles),
  2::bigint,
  'trainer sees self and the learner in the exact assigned active cohort'
);

select * from finish();
rollback;
