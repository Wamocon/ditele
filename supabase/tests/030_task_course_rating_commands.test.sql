begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- Both rating commands are security-definer functions with an empty search path.
select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname in ('rate_course', 'rate_task')
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
  ),
  2::bigint,
  'rating commands are security-definer functions with an empty search path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.rate_course(uuid,integer,text,bigint,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.rate_task(uuid,integer,text,bigint,text,uuid)',
    'EXECUTE'
  ),
  'authenticated sessions can execute both rating commands'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.rate_course(uuid,integer,text,bigint,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.rate_task(uuid,integer,text,bigint,text,uuid)',
    'EXECUTE'
  ),
  'anonymous callers have no rating-command execute grants'
);

select ok(
  not has_table_privilege('authenticated', 'public.ratings', 'INSERT')
  and not has_table_privilege('authenticated', 'public.ratings', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.ratings', 'DELETE'),
  'authenticated callers cannot directly mutate ratings'
);

select ok(
  not has_table_privilege(
    'authenticated', 'public.rating_command_receipts', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.rating_command_receipts', 'INSERT'
  )
  and not has_table_privilege(
    'authenticated', 'public.rating_command_receipts', 'UPDATE'
  )
  and not has_table_privilege(
    'authenticated', 'public.rating_command_receipts', 'DELETE'
  ),
  'rating command receipts remain private and append-only'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$ insert into public.ratings (
       organization_id, learner_id, course_id, score
     ) values (
       '01980a10-0000-7000-8000-000000000001',
       '01980a00-0000-7000-8000-000000000001',
       '01980a20-0000-7000-8000-000000000001', 5
     ) $$,
  '42501', 'permission denied for table ratings',
  'a learner cannot directly insert a rating row'
);

-- Create a course rating (expected_version 0 creates).
select lives_ok(
  $$ select public.rate_course(
       '01980a20-0000-7000-8000-000000000001', 5, 'Very practical', 0,
       'rating-course-pgtap-0001',
       '01980c30-0000-7000-8000-000000000001'
     ) $$,
  'a learner can create a course rating for an enrolled course'
);

select results_eq(
  $$ select score, comment, row_version
     from public.ratings
     where learner_id = '01980a00-0000-7000-8000-000000000001'
       and course_id = '01980a20-0000-7000-8000-000000000001' $$,
  $$ values (5::smallint, 'Very practical'::text, 1::bigint) $$,
  'the course rating command persists exactly the submitted score and comment'
);

select lives_ok(
  $$ select public.rate_course(
       '01980a20-0000-7000-8000-000000000001', 5, 'Very practical', 0,
       'rating-course-pgtap-0001',
       '01980c30-0000-7000-8000-000000000001'
     ) $$,
  'an identical course rating replay succeeds'
);

reset role;
select is(
  (
    select count(*)::bigint
    from public.audit_events audit_record
    where audit_record.event_type = 'rating.submitted'
      and audit_record.correlation_id =
        '01980c30-0000-7000-8000-000000000001'
  ),
  1::bigint,
  'a course rating replay does not duplicate its audit event'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$ select public.rate_course(
       '01980a20-0000-7000-8000-000000000001', 3, 'Different', 0,
       'rating-course-pgtap-0001',
       '01980c30-0000-7000-8000-000000000002'
     ) $$,
  '22023',
  'idempotency key was reused with a different rating payload',
  'a rating idempotency key cannot be rebound to a different payload'
);

-- Optimistic update with the current version.
select lives_ok(
  $$ select public.rate_course(
       '01980a20-0000-7000-8000-000000000001', 4, 'Updated', 1,
       'rating-course-pgtap-0002',
       '01980c30-0000-7000-8000-000000000003'
     ) $$,
  'a learner can update an existing course rating with the current version'
);

select results_eq(
  $$ select score, comment, row_version
     from public.ratings
     where learner_id = '01980a00-0000-7000-8000-000000000001'
       and course_id = '01980a20-0000-7000-8000-000000000001' $$,
  $$ values (4::smallint, 'Updated'::text, 2::bigint) $$,
  'the optimistic update advances the score, comment and version'
);

select throws_ok(
  $$ select public.rate_course(
       '01980a20-0000-7000-8000-000000000001', 2, 'Stale', 1,
       'rating-course-pgtap-0003',
       '01980c30-0000-7000-8000-000000000004'
     ) $$,
  '40001', 'rating is stale or unavailable',
  'a course rating update with an obsolete version is rejected'
);

select throws_ok(
  $$ select public.rate_course(
       '01980a20-0000-7000-8000-000000000001', 9, 'Out of range', 0,
       'rating-course-pgtap-0005',
       '01980c30-0000-7000-8000-000000000006'
     ) $$,
  '22023',
  'valid course, score, CAS, idempotency key and correlation ID are required',
  'an out-of-range score is rejected inside the database boundary'
);

select throws_ok(
  $$ select public.rate_course(
       '0198ffff-0000-7000-8000-0000000000ff', 5, 'No enrollment', 0,
       'rating-course-pgtap-0004',
       '01980c30-0000-7000-8000-000000000005'
     ) $$,
  '42501', 'course rating scope denied',
  'a learner cannot rate a course they are not enrolled in'
);

-- Task rating for the same enrolled course.
select lives_ok(
  $$ select public.rate_task(
       '01980a26-0000-7000-8000-000000000001', 5, 'Clear task', 0,
       'rating-task-pgtap-0001',
       '01980c31-0000-7000-8000-000000000001'
     ) $$,
  'a learner can rate a task within an enrolled course'
);

select results_eq(
  $$ select score, comment, row_version
     from public.ratings
     where learner_id = '01980a00-0000-7000-8000-000000000001'
       and task_id = '01980a26-0000-7000-8000-000000000001' $$,
  $$ values (5::smallint, 'Clear task'::text, 1::bigint) $$,
  'the task rating command persists exactly the submitted score and comment'
);

-- A trainer who shares no enrollment cannot rate and cannot read the rating.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select throws_ok(
  $$ select public.rate_course(
       '01980a20-0000-7000-8000-000000000001', 5, 'Trainer', 0,
       'rating-course-pgtap-trainer-0001',
       '01980c30-0000-7000-8000-000000000007'
     ) $$,
  '42501', 'course rating scope denied',
  'a trainer without a learner enrollment cannot rate the course'
);

select is(
  (
    select count(*)::bigint
    from public.ratings rating_record
    where rating_record.learner_id = '01980a00-0000-7000-8000-000000000001'
  ),
  0::bigint,
  'a trainer cannot read another learner ratings through row-level security'
);

-- Anonymous callers have no execute grant at all.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ select public.rate_course(
       '01980a20-0000-7000-8000-000000000001', 5, 'Anon', 0,
       'rating-course-pgtap-anon-0001',
       '01980c30-0000-7000-8000-000000000008'
     ) $$,
  '42501', 'permission denied for function rate_course',
  'anonymous callers cannot execute the course rating command'
);

reset role;

select * from finish();
rollback;
