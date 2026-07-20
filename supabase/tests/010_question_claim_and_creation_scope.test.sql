begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(74);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'create_question'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, uuid, text, text, text, uuid'
  ),
  1::bigint,
  'one hardened question creation RPC exists'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'claim_question'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, bigint, text, uuid'
  ),
  1::bigint,
  'one actor-self question claim RPC exists'
);

select ok(
  (
    select procedure_row.prosecdef
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'create_question'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, uuid, text, text, text, uuid'
  ),
  'question creation uses its reviewed security-definer boundary'
);

select is(
  (
    select procedure_row.proconfig
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'create_question'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, uuid, text, text, text, uuid'
  ),
  array['search_path=""']::text[],
  'question creation has an empty fixed search path'
);

select ok(
  (
    select procedure_row.prosecdef
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'claim_question'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, bigint, text, uuid'
  ),
  'question claim uses its reviewed security-definer boundary'
);

select is(
  (
    select procedure_row.proconfig
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'claim_question'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, bigint, text, uuid'
  ),
  array['search_path=""']::text[],
  'question claim has an empty fixed search path'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.create_question(uuid,uuid,text,text,text,uuid)', 'EXECUTE'
  ),
  'authenticated callers can execute question creation'
);

select ok(
  not has_function_privilege(
    'anon', 'public.create_question(uuid,uuid,text,text,text,uuid)', 'EXECUTE'
  ),
  'anonymous callers cannot execute question creation'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.claim_question(uuid,bigint,text,uuid)', 'EXECUTE'
  ),
  'authenticated callers can execute question claim'
);

select ok(
  not has_function_privilege(
    'anon', 'public.claim_question(uuid,bigint,text,uuid)', 'EXECUTE'
  ),
  'anonymous callers cannot execute question claim'
);

select ok(
  not has_table_privilege('authenticated', 'public.questions', 'INSERT'),
  'authenticated callers cannot bypass verified creation through direct inserts'
);

select ok(
  not has_table_privilege('authenticated', 'public.questions', 'UPDATE'),
  'authenticated callers cannot bypass claim CAS through direct updates'
);

select ok(
  not has_table_privilege('authenticated', 'public.question_messages', 'INSERT'),
  'authenticated callers cannot forge question history directly'
);

insert into public.courses (
  id, slug, state, default_locale, estimated_minutes, created_by
)
values (
  '01980a20-0000-7000-8000-000000000099',
  'question-course-mismatch', 'active', 'en', 60,
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.stages (
  id, course_id, position, state
)
values
  (
    '01980a23-0000-7000-8000-000000000097',
    '01980a20-0000-7000-8000-000000000001', 2, 'active'
  ),
  (
    '01980a23-0000-7000-8000-000000000098',
    '01980a20-0000-7000-8000-000000000001', 1, 'draft'
  ),
  (
    '01980a23-0000-7000-8000-000000000099',
    '01980a20-0000-7000-8000-000000000099', 0, 'active'
  );

insert into public.tasks (
  id, course_id, stage_id, position, task_kind, state
)
values
  (
    '01980a26-0000-7000-8000-000000000010',
    '01980a20-0000-7000-8000-000000000001',
    '01980a23-0000-7000-8000-000000000097', 0, 'practical', 'active'
  ),
  (
    '01980a26-0000-7000-8000-000000000011',
    '01980a20-0000-7000-8000-000000000001',
    '01980a23-0000-7000-8000-000000000097', 1, 'practical', 'draft'
  ),
  (
    '01980a26-0000-7000-8000-000000000012',
    '01980a20-0000-7000-8000-000000000001',
    '01980a23-0000-7000-8000-000000000098', 0, 'practical', 'active'
  ),
  (
    '01980a26-0000-7000-8000-000000000099',
    '01980a20-0000-7000-8000-000000000099',
    '01980a23-0000-7000-8000-000000000099', 0, 'practical', 'active'
  );

insert into public.task_schedules (
  id, cohort_id, task_id, available_from, due_at, changed_by
)
values
  (
    '01980a32-0000-7000-8000-000000000011',
    '01980a30-0000-7000-8000-000000000001',
    '01980a26-0000-7000-8000-000000000011',
    statement_timestamp() - interval '1 day', statement_timestamp() + interval '7 days',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a32-0000-7000-8000-000000000012',
    '01980a30-0000-7000-8000-000000000001',
    '01980a26-0000-7000-8000-000000000012',
    statement_timestamp() - interval '1 day', statement_timestamp() + interval '7 days',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a32-0000-7000-8000-000000000099',
    '01980a30-0000-7000-8000-000000000001',
    '01980a26-0000-7000-8000-000000000099',
    statement_timestamp() - interval '1 day', statement_timestamp() + interval '7 days',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, created_by
)
values
  (
    '01980a30-0000-7000-8000-000000000110',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Question Flexible Entitled', 'active', 'flexible',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a30-0000-7000-8000-000000000111',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Question Flexible Unentitled', 'active', 'flexible',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.user_roles (
  id, user_id, role_id, organization_id, granted_by, reason
)
select fixture.id, fixture.user_id, role_record.id,
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000003', fixture.reason
from (values
  (
    '01980a12-0000-7000-8000-000000000110'::uuid,
    '01980a00-0000-7000-8000-000000000004'::uuid,
    'Flexible entitled learner fixture'::text
  ),
  (
    '01980a12-0000-7000-8000-000000000111'::uuid,
    '01980a00-0000-7000-8000-000000000003'::uuid,
    'Flexible unentitled learner fixture'::text
  )
) fixture(id, user_id, reason)
join public.roles role_record on role_record.code = 'learner';

insert into public.cohort_memberships (
  id, cohort_id, user_id, role, state, assigned_by
)
values
  (
    '01980a31-0000-7000-8000-000000000110',
    '01980a30-0000-7000-8000-000000000110',
    '01980a00-0000-7000-8000-000000000004', 'learner', 'active',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a31-0000-7000-8000-000000000111',
    '01980a30-0000-7000-8000-000000000111',
    '01980a00-0000-7000-8000-000000000003', 'learner', 'active',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a31-0000-7000-8000-000000000112',
    '01980a30-0000-7000-8000-000000000110',
    '01980a00-0000-7000-8000-000000000002', 'trainer', 'active',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a31-0000-7000-8000-000000000113',
    '01980a30-0000-7000-8000-000000000110',
    '01980a00-0000-7000-8000-000000000003', 'trainer', 'active',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a31-0000-7000-8000-000000000114',
    '01980a30-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000004', 'learner', 'active',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a31-0000-7000-8000-000000000115',
    '01980a30-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000004', 'trainer', 'active',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a31-0000-7000-8000-000000000116',
    '01980a30-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000002', 'learner', 'active',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.enrollments (
  id, organization_id, learner_id, course_id, cohort_id, state,
  idempotency_key, decided_by, decided_at, completed_at
)
values
  (
    '01980a33-0000-7000-8000-000000000110',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000004',
    '01980a20-0000-7000-8000-000000000001',
    '01980a30-0000-7000-8000-000000000110', 'completed',
    'question-flex-enrollment-01', '01980a00-0000-7000-8000-000000000003',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '01980a33-0000-7000-8000-000000000111',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000003',
    '01980a20-0000-7000-8000-000000000001',
    '01980a30-0000-7000-8000-000000000111', 'completed',
    'question-no-entitlement-001', '01980a00-0000-7000-8000-000000000003',
    statement_timestamp(), statement_timestamp()
  ),
  (
    '01980a33-0000-7000-8000-000000000112',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000002',
    '01980a20-0000-7000-8000-000000000001',
    '01980a30-0000-7000-8000-000000000001', 'completed',
    'question-missing-role-00001', '01980a00-0000-7000-8000-000000000003',
    statement_timestamp(), statement_timestamp()
  );

insert into public.entitlements (
  id, organization_id, user_id, product_package_id, capability, source
)
values (
  '01980a41-0000-7000-8000-000000000110',
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000004',
  '01980a40-0000-7000-8000-000000000001', 'learning', 'manual'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001', ' ', 'Question body',
      'question-invalid-payload-01', '01980a53-0000-7000-8000-000000000001'
    )
  $$,
  '22023',
  'valid question subject, body, idempotency key and correlation ID are required',
  'blank question subjects are rejected'
);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001', 'Question subject', ' ',
      'question-invalid-body-0001', '01980a53-0000-7000-8000-000000000027'
    )
  $$,
  '22023',
  'valid question subject, body, idempotency key and correlation ID are required',
  'blank question bodies are rejected'
);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001', 'Question subject', 'Question body',
      'short', '01980a53-0000-7000-8000-000000000028'
    )
  $$,
  '22023',
  'valid question subject, body, idempotency key and correlation ID are required',
  'short question idempotency keys are rejected'
);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001', 'Question subject', 'Question body',
      'question-null-correlation-01', null
    )
  $$,
  '22023',
  'valid question subject, body, idempotency key and correlation ID are required',
  'null question correlation IDs are rejected'
);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000099', 'Other course',
      'This task belongs to another course.', 'question-course-mismatch-01',
      '01980a53-0000-7000-8000-000000000002'
    )
  $$,
  '42501',
  'question creation scope denied',
  'a task from another course cannot be used in the cohort'
);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000010', 'Missing schedule',
      'This active task is not scheduled.', 'question-missing-schedule-01',
      '01980a53-0000-7000-8000-000000000003'
    )
  $$,
  '42501',
  'question creation scope denied',
  'scheduled progression denies a task without a schedule'
);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000011', 'Inactive task',
      'This task is not active.', 'question-inactive-task-0001',
      '01980a53-0000-7000-8000-000000000004'
    )
  $$,
  '42501',
  'question creation scope denied',
  'inactive tasks cannot receive questions'
);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000012', 'Inactive stage',
      'The parent stage is not active.', 'question-inactive-stage-001',
      '01980a53-0000-7000-8000-000000000005'
    )
  $$,
  '42501',
  'question creation scope denied',
  'tasks in inactive stages cannot receive questions'
);

select lives_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      'How should I identify the highest login risk?',
      'I need guidance choosing between security and availability risks.',
      'question-scheduled-success-01', '01980a53-0000-7000-8000-000000000006'
    )
  $$,
  'an assigned learner creates an open scheduled question atomically'
);

reset role;

select set_config(
  'ditele_test.scheduled_question_id',
  (
    select id::text from public.questions
    where idempotency_key = 'question-scheduled-success-01'
  ),
  true
);

select is(
  (
    select state::text from public.questions
    where idempotency_key = 'question-scheduled-success-01'
  ),
  'open',
  'a new learner question starts in the named open state'
);

select ok(
  (
    select assigned_trainer_id is null from public.questions
    where idempotency_key = 'question-scheduled-success-01'
  ),
  'question creation does not invent an automatic trainer assignment'
);

select is(
  (
    select organization_id::text || ':' || learner_id::text
    from public.questions where idempotency_key = 'question-scheduled-success-01'
  ),
  '01980a10-0000-7000-8000-000000000001:01980a00-0000-7000-8000-000000000001',
  'question tenant and learner are derived from verified scope and actor'
);

select is(
  (
    select count(*)::bigint from public.question_messages message_record
    join public.questions question_record on question_record.id = message_record.question_id
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and message_record.message_kind = 'message'
      and message_record.author_id = question_record.learner_id
  ),
  1::bigint,
  'question creation appends one learner-authored initial message'
);

select is(
  (
    select count(*)::bigint from public.audit_events audit_record
    join public.questions question_record on question_record.id = audit_record.aggregate_id
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and audit_record.event_type = 'question.created'
  ),
  1::bigint,
  'question creation is audited once'
);

select is(
  (
    select count(*)::bigint from public.outbox_events outbox_record
    join public.questions question_record on question_record.id = outbox_record.aggregate_id
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and outbox_record.event_type = 'question.created.v1'
  ),
  1::bigint,
  'question creation appends one integration event'
);

select is(
  (
    select count(*)::bigint from public.notifications notification_record
    join public.questions question_record
      on question_record.id::text = (notification_record.payload ->> 'question_id')
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and notification_record.event_type = 'question.opened'
      and notification_record.recipient_id = '01980a00-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'the active scoped trainer is notified that the question awaits claim'
);

select is(
  (
    select count(*)::bigint from public.notifications notification_record
    join public.questions question_record
      on question_record.id::text = (notification_record.payload ->> 'question_id')
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and notification_record.event_type = 'question.opened'
      and notification_record.recipient_id = '01980a00-0000-7000-8000-000000000004'
  ),
  0::bigint,
  'a cohort trainer without question.manage is not notified'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);

select lives_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      'How should I identify the highest login risk?',
      'I need guidance choosing between security and availability risks.',
      'question-scheduled-success-01', '01980a53-0000-7000-8000-000000000007'
    )
  $$,
  'an exact creation replay returns the existing question'
);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      'A changed subject under the same key',
      'I need guidance choosing between security and availability risks.',
      'question-scheduled-success-01', '01980a53-0000-7000-8000-000000000008'
    )
  $$,
  '22023',
  'idempotency key was reused with a different question payload',
  'creation idempotency rejects a changed subject'
);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      'How should I identify the highest login risk?',
      'A changed body under the same key.',
      'question-scheduled-success-01', '01980a53-0000-7000-8000-000000000009'
    )
  $$,
  '22023',
  'idempotency key was reused with a different question payload',
  'creation idempotency rejects a changed body'
);

reset role;

select is(
  (
    select count(*)::bigint from public.questions
    where idempotency_key = 'question-scheduled-success-01'
  ),
  1::bigint,
  'creation replay and payload conflicts leave one question'
);

select is(
  (
    select count(*)::bigint from public.outbox_events outbox_record
    join public.questions question_record on question_record.id = outbox_record.aggregate_id
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and outbox_record.event_type = 'question.created.v1'
  ),
  1::bigint,
  'creation replay and payload conflicts do not duplicate side effects'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true);

select lives_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000110',
      '01980a26-0000-7000-8000-000000000001',
      'Can I ask without a task schedule in flexible mode?',
      'My active learning entitlement should make this task available.',
      'question-flexible-success-001', '01980a53-0000-7000-8000-000000000010'
    )
  $$,
  'an entitled learner with a completed enrollment creates a flexible question'
);

reset role;

select set_config(
  'ditele_test.flexible_question_id',
  (
    select id::text from public.questions
    where idempotency_key = 'question-flexible-success-001'
  ),
  true
);

select is(
  (
    select count(*)::bigint from public.task_schedules
    where cohort_id = '01980a30-0000-7000-8000-000000000110'
      and task_id = '01980a26-0000-7000-8000-000000000001'
  ),
  0::bigint,
  'the flexible positive path does not depend on a task schedule'
);

select is(
  (
    select state::text from public.questions
    where idempotency_key = 'question-flexible-success-001'
  ),
  'open',
  'the entitled flexible question is created open and unclaimed'
);

select is(
  (
    select count(*)::bigint from public.notifications notification_record
    join public.questions question_record
      on question_record.id::text = (notification_record.payload ->> 'question_id')
    where question_record.idempotency_key = 'question-flexible-success-001'
      and notification_record.event_type = 'question.opened'
  ),
  2::bigint,
  'both active scoped flexible-cohort trainers are notified'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000111',
      '01980a26-0000-7000-8000-000000000001',
      'Flexible learner without entitlement',
      'This request must be denied.', 'question-flex-unentitled-001',
      '01980a53-0000-7000-8000-000000000011'
    )
  $$,
  '42501',
  'question creation scope denied',
  'flexible progression requires an active learning entitlement'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      'Enrollment cohort mismatch', 'The enrollment belongs to another cohort.',
      'question-enrollment-mismatch1', '01980a53-0000-7000-8000-000000000012'
    )
  $$,
  '42501',
  'question creation scope denied',
  'an enrollment assigned to another cohort does not authorize creation'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      'Trainer impersonates a learner', 'Cohort membership alone must not be enough.',
      'question-missing-learner-role1', '01980a53-0000-7000-8000-000000000013'
    )
  $$,
  '42501',
  'question creation scope denied',
  'an active learner membership and enrollment do not replace the learner role'
);

reset role;

update public.organization_memberships
set state = 'suspended'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000004';

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000110',
      '01980a26-0000-7000-8000-000000000001',
      'Suspended tenant membership', 'This request must be denied.',
      'question-suspended-tenant-01', '01980a53-0000-7000-8000-000000000014'
    )
  $$,
  '42501',
  'question creation scope denied',
  'a suspended tenant member cannot create a question'
);

reset role;

update public.organization_memberships
set state = 'active'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000004';

update public.cohort_memberships
set state = 'suspended'
where cohort_id = '01980a30-0000-7000-8000-000000000110'
  and user_id = '01980a00-0000-7000-8000-000000000004'
  and role = 'learner';

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true);

select throws_ok(
  $$
    select * from public.create_question(
      '01980a30-0000-7000-8000-000000000110',
      '01980a26-0000-7000-8000-000000000001',
      'Suspended cohort membership', 'This request must be denied.',
      'question-suspended-cohort-01', '01980a53-0000-7000-8000-000000000015'
    )
  $$,
  '42501',
  'question creation scope denied',
  'a suspended learner cohort membership cannot create a question'
);

reset role;

update public.cohort_memberships
set state = 'active'
where cohort_id = '01980a30-0000-7000-8000-000000000110'
  and user_id = '01980a00-0000-7000-8000-000000000004'
  and role = 'learner';

select is(
  (
    select count(*)::bigint from public.questions
    where idempotency_key in (
      'question-flex-unentitled-001',
      'question-enrollment-mismatch1',
      'question-missing-learner-role1',
      'question-suspended-tenant-01',
      'question-suspended-cohort-01'
    )
  ),
  0::bigint,
  'denied creation attempts leave no partial questions'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select throws_ok(
  $$
    select * from public.claim_question(
      current_setting('ditele_test.scheduled_question_id')::uuid,
      1, 'short', '01980a53-0000-7000-8000-000000000016'
    )
  $$,
  '22023',
  'valid question, version, idempotency key and correlation ID are required',
  'claim rejects an invalid idempotency key'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);

select throws_ok(
  $$
    select * from public.claim_question(
      current_setting('ditele_test.scheduled_question_id')::uuid,
      1, 'claim-learner-denied-0001', '01980a53-0000-7000-8000-000000000017'
    )
  $$,
  '42501',
  'question claim scope denied',
  'a learner cannot claim their own question'
);

reset role;

update public.organization_memberships
set state = 'suspended'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select throws_ok(
  $$
    select * from public.claim_question(
      current_setting('ditele_test.scheduled_question_id')::uuid,
      1, 'claim-suspended-tenant-001', '01980a53-0000-7000-8000-000000000018'
    )
  $$,
  '42501',
  'question claim scope denied',
  'a suspended trainer tenant membership cannot claim'
);

reset role;

update public.organization_memberships
set state = 'active'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000002';

update public.cohort_memberships
set state = 'suspended'
where cohort_id = '01980a30-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000002'
  and role = 'trainer';

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select throws_ok(
  $$
    select * from public.claim_question(
      current_setting('ditele_test.scheduled_question_id')::uuid,
      1, 'claim-suspended-cohort-001', '01980a53-0000-7000-8000-000000000019'
    )
  $$,
  '42501',
  'question claim scope denied',
  'a suspended trainer cohort membership cannot claim'
);

reset role;

update public.cohort_memberships
set state = 'active'
where cohort_id = '01980a30-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000002'
  and role = 'trainer';

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select lives_ok(
  $$
    select * from public.claim_question(
      current_setting('ditele_test.scheduled_question_id')::uuid,
      1, 'claim-scheduled-success-001', '01980a53-0000-7000-8000-000000000020'
    )
  $$,
  'an active scoped trainer claims the open question atomically'
);

reset role;

select is(
  (
    select state::text from public.questions
    where idempotency_key = 'question-scheduled-success-01'
  ),
  'assigned',
  'claim moves open to the named assigned state'
);

select is(
  (
    select assigned_trainer_id from public.questions
    where idempotency_key = 'question-scheduled-success-01'
  ),
  '01980a00-0000-7000-8000-000000000002'::uuid,
  'claim derives the assigned trainer from auth.uid()'
);

select is(
  (
    select row_version from public.questions
    where idempotency_key = 'question-scheduled-success-01'
  ),
  2::bigint,
  'claim advances the question CAS version once'
);

select is(
  (
    select count(*)::bigint from public.question_messages message_record
    join public.questions question_record on question_record.id = message_record.question_id
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and message_record.message_kind = 'system'
      and message_record.idempotency_key = 'claim-scheduled-success-001'
  ),
  1::bigint,
  'claim appends one immutable system history record'
);

select throws_ok(
  $$
    update public.question_messages message_record
    set body = 'Tampered history'
    from public.questions question_record
    where question_record.id = message_record.question_id
      and question_record.idempotency_key = 'question-scheduled-success-01'
      and message_record.message_kind = 'system'
  $$,
  '55000',
  'question_messages is append-only',
  'claim history cannot be mutated even by a privileged transaction'
);

select is(
  (
    select count(*)::bigint from public.audit_events audit_record
    join public.questions question_record on question_record.id = audit_record.aggregate_id
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and audit_record.event_type = 'question.claimed'
  ),
  1::bigint,
  'claim writes one audit event'
);

select is(
  (
    select count(*)::bigint from public.outbox_events outbox_record
    join public.questions question_record on question_record.id = outbox_record.aggregate_id
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and outbox_record.event_type = 'question.claimed.v1'
  ),
  1::bigint,
  'claim appends one integration event'
);

select is(
  (
    select count(*)::bigint from public.notifications notification_record
    join public.questions question_record
      on question_record.id::text = (notification_record.payload ->> 'question_id')
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and notification_record.event_type = 'question.claimed'
      and notification_record.recipient_id = question_record.learner_id
  ),
  1::bigint,
  'claim notifies the learner once'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select lives_ok(
  $$
    select * from public.claim_question(
      current_setting('ditele_test.scheduled_question_id')::uuid,
      1, 'claim-scheduled-success-001', '01980a53-0000-7000-8000-000000000021'
    )
  $$,
  'an exact claim replay returns the current question'
);

select throws_ok(
  $$
    select * from public.claim_question(
      current_setting('ditele_test.scheduled_question_id')::uuid,
      2, 'claim-scheduled-success-001', '01980a53-0000-7000-8000-000000000022'
    )
  $$,
  '22023',
  'idempotency key was reused with a different claim payload',
  'claim idempotency rejects a changed expected version'
);

reset role;

select is(
  (
    select count(*)::bigint from public.question_messages message_record
    join public.questions question_record on question_record.id = message_record.question_id
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and message_record.message_kind = 'system'
  ),
  1::bigint,
  'claim replay and payload conflicts leave one system history record'
);

select is(
  (
    select count(*)::bigint from public.outbox_events outbox_record
    join public.questions question_record on question_record.id = outbox_record.aggregate_id
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and outbox_record.event_type = 'question.claimed.v1'
  ),
  1::bigint,
  'claim replay and payload conflicts do not duplicate side effects'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select lives_ok(
  $$
    select * from public.answer_question(
      current_setting('ditele_test.scheduled_question_id')::uuid,
      2, 'Prioritize confidentiality and account-takeover impact first.',
      'answer-after-claim-success1', '01980a53-0000-7000-8000-000000000023'
    )
  $$,
  'the claimed question continues through the verified answer mutation'
);

reset role;

select is(
  (
    select state::text from public.questions
    where idempotency_key = 'question-scheduled-success-01'
  ),
  'answered',
  'answer-after-claim reaches the named answered state'
);

select is(
  (
    select row_version from public.questions
    where idempotency_key = 'question-scheduled-success-01'
  ),
  3::bigint,
  'creation, claim and answer maintain monotonic CAS versions'
);

select is(
  (
    select count(*)::bigint from public.question_messages message_record
    join public.questions question_record on question_record.id = message_record.question_id
    where question_record.idempotency_key = 'question-scheduled-success-01'
      and message_record.message_kind in ('message', 'system', 'answer')
  ),
  3::bigint,
  'the complete thread preserves learner message, claim history and trainer answer'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select lives_ok(
  $$
    select * from public.claim_question(
      current_setting('ditele_test.flexible_question_id')::uuid,
      1, 'claim-flexible-success-0001', '01980a53-0000-7000-8000-000000000024'
    )
  $$,
  'one active trainer wins the flexible question claim'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true);

select throws_ok(
  $$
    select * from public.claim_question(
      current_setting('ditele_test.flexible_question_id')::uuid,
      1, 'claim-flexible-competing-01', '01980a53-0000-7000-8000-000000000025'
    )
  $$,
  '40001',
  'question is stale or already claimed',
  'a stale competing trainer cannot double-claim the question'
);

select throws_ok(
  $$
    select * from public.claim_question(
      current_setting('ditele_test.flexible_question_id')::uuid,
      1, 'claim-flexible-success-0001', '01980a53-0000-7000-8000-000000000026'
    )
  $$,
  '42501',
  'question claim scope denied',
  'a different trainer cannot replay the winning claim key'
);

reset role;

select is(
  (
    select assigned_trainer_id from public.questions
    where idempotency_key = 'question-flexible-success-001'
  ),
  '01980a00-0000-7000-8000-000000000002'::uuid,
  'the first valid claimant retains ownership'
);

select is(
  (
    select count(*)::bigint from public.question_messages message_record
    join public.questions question_record on question_record.id = message_record.question_id
    where question_record.idempotency_key = 'question-flexible-success-001'
      and message_record.message_kind = 'system'
  ),
  1::bigint,
  'competing claims leave one immutable claim history record'
);

select is(
  (
    select count(*)::bigint from public.audit_events audit_record
    join public.questions question_record on question_record.id = audit_record.aggregate_id
    where question_record.idempotency_key = 'question-flexible-success-001'
      and audit_record.event_type = 'question.claimed'
  ),
  1::bigint,
  'competing claims leave one claim audit event'
);

select is(
  (
    select count(*)::bigint from public.outbox_events outbox_record
    join public.questions question_record on question_record.id = outbox_record.aggregate_id
    where question_record.idempotency_key = 'question-flexible-success-001'
      and outbox_record.event_type = 'question.claimed.v1'
  ),
  1::bigint,
  'competing claims leave one claim outbox event'
);

select is(
  (
    select count(*)::bigint from public.questions
    where idempotency_key in (
      'question-invalid-payload-01',
      'question-invalid-body-0001',
      'question-null-correlation-01',
      'question-course-mismatch-01',
      'question-missing-schedule-01',
      'question-inactive-task-0001',
      'question-inactive-stage-001'
    )
  ),
  0::bigint,
  'invalid content and payload cases leave no partial questions'
);

select * from finish();
rollback;
