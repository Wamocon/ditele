begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(64);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'answer_question'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, bigint, text, text, uuid'
  ),
  1::bigint,
  'one versioned and idempotent answer RPC exists'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'transfer_question'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, bigint, uuid, text, text, uuid'
  ),
  1::bigint,
  'one versioned and idempotent transfer RPC exists'
);

select ok(
  (
    select procedure_row.prosecdef
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'answer_question'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, bigint, text, text, uuid'
  ),
  'answer RPC uses its reviewed security-definer boundary'
);

select is(
  (
    select procedure_row.proconfig
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'answer_question'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, bigint, text, text, uuid'
  ),
  array['search_path=""']::text[],
  'answer RPC has an empty fixed search path'
);

select ok(
  (
    select procedure_row.prosecdef
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'transfer_question'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, bigint, uuid, text, text, uuid'
  ),
  'transfer RPC uses its reviewed security-definer boundary'
);

select is(
  (
    select procedure_row.proconfig
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'transfer_question'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, bigint, uuid, text, text, uuid'
  ),
  array['search_path=""']::text[],
  'transfer RPC has an empty fixed search path'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.answer_question(uuid,bigint,text,text,uuid)', 'EXECUTE'
  ),
  'authenticated callers can execute the answer RPC'
);

select ok(
  not has_function_privilege(
    'anon', 'public.answer_question(uuid,bigint,text,text,uuid)', 'EXECUTE'
  ),
  'anonymous callers cannot execute the answer RPC'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.transfer_question(uuid,bigint,uuid,text,text,uuid)', 'EXECUTE'
  ),
  'authenticated callers can execute the transfer RPC'
);

select ok(
  not has_function_privilege(
    'anon', 'public.transfer_question(uuid,bigint,uuid,text,text,uuid)', 'EXECUTE'
  ),
  'anonymous callers cannot execute the transfer RPC'
);

select ok(
  not has_table_privilege('authenticated', 'public.questions', 'UPDATE'),
  'authenticated callers cannot bypass question CAS through direct updates'
);

select ok(
  not has_table_privilege('authenticated', 'public.question_messages', 'INSERT'),
  'authenticated callers cannot bypass answer idempotency through direct inserts'
);

select ok(
  not has_table_privilege('authenticated', 'public.question_transfers', 'INSERT'),
  'authenticated callers cannot bypass transfer ownership through direct inserts'
);

select ok(
  has_table_privilege('authenticated', 'public.questions', 'SELECT'),
  'authenticated callers retain policy-scoped question reads'
);

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, created_by
)
values
  (
    '01980a30-0000-7000-8000-000000000098',
    '01980a10-0000-7000-8000-000000000001',
    '01980a20-0000-7000-8000-000000000001',
    '01980a22-0000-7000-8000-000000000001',
    'Question Cross-Cohort Target',
    'active',
    'scheduled',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.organizations (id, slug, name, state)
values (
  '01980a10-0000-7000-8000-000000000099',
  'question-cross-tenant',
  'Question Cross Tenant',
  'active'
);

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, created_by
)
values (
  '01980a30-0000-7000-8000-000000000099',
  '01980a10-0000-7000-8000-000000000099',
  '01980a20-0000-7000-8000-000000000001',
  '01980a22-0000-7000-8000-000000000001',
  'Question Cross-Tenant Cohort',
  'active',
  'scheduled',
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.cohort_memberships (
  id, cohort_id, user_id, role, state, assigned_by
)
values
  (
    '01980a31-0000-7000-8000-000000000010',
    '01980a30-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000003',
    'trainer', 'active', '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a31-0000-7000-8000-000000000011',
    '01980a30-0000-7000-8000-000000000098',
    '01980a00-0000-7000-8000-000000000001',
    'trainer', 'active', '01980a00-0000-7000-8000-000000000003'
  );

insert into public.user_roles (
  id, user_id, role_id, organization_id, granted_by, reason
)
select
  '01980a12-0000-7000-8000-000000000010',
  '01980a00-0000-7000-8000-000000000001',
  role_record.id,
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000003',
  'Cross-cohort transfer validation fixture'
from public.roles role_record
where role_record.code = 'trainer';

insert into public.questions (
  id, organization_id, learner_id, cohort_id, task_id,
  assigned_trainer_id, state, subject, idempotency_key
)
values
  (
    '01980a50-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000001',
    '01980a30-0000-7000-8000-000000000001',
    '01980a26-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000002',
    'assigned', 'How should I prioritize the login risks?', 'question-answer-fixture-0001'
  ),
  (
    '01980a50-0000-7000-8000-000000000002',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000001',
    '01980a30-0000-7000-8000-000000000001',
    '01980a26-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000002',
    'assigned', 'Can another trainer explain the oracle?', 'question-transfer-fixture-01'
  ),
  (
    '01980a50-0000-7000-8000-000000000003',
    '01980a10-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000001',
    '01980a30-0000-7000-8000-000000000001',
    '01980a26-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000002',
    'assigned', 'Who can review this test boundary?', 'question-validation-fixture1'
  ),
  (
    '01980a50-0000-7000-8000-000000000099',
    '01980a10-0000-7000-8000-000000000099',
    '01980a00-0000-7000-8000-000000000001',
    '01980a30-0000-7000-8000-000000000099',
    '01980a26-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000002',
    'assigned', 'Question outside the trainer tenant', 'question-cross-tenant-000001'
  );

insert into public.question_messages (id, question_id, author_id, body, message_kind)
values
  (
    '01980a51-0000-7000-8000-000000000001',
    '01980a50-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000001',
    'Should availability or security risk come first?', 'message'
  ),
  (
    '01980a51-0000-7000-8000-000000000002',
    '01980a50-0000-7000-8000-000000000002',
    '01980a00-0000-7000-8000-000000000001',
    'I need help selecting a reliable test oracle.', 'message'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$
    select * from public.answer_question(
      '01980a50-0000-7000-8000-000000000003', 1, ' ',
      'answer-invalid-body-0001', '01980a52-0000-7000-8000-000000000001'
    )
  $$,
  '22023',
  'answer body and idempotency key are required',
  'blank answers are rejected before mutation'
);

select throws_ok(
  $$
    select * from public.transfer_question(
      '01980a50-0000-7000-8000-000000000003', 1,
      '01980a00-0000-7000-8000-000000000002', 'Self transfer',
      'question-self-transfer-0001', '01980a52-0000-7000-8000-000000000002'
    )
  $$,
  '22023',
  'a different target trainer, reason and idempotency key are required',
  'a trainer cannot transfer a question to themself'
);

select throws_ok(
  $$
    select * from public.transfer_question(
      '01980a50-0000-7000-8000-000000000003', 1,
      '01980a00-0000-7000-8000-000000000001', 'Wrong cohort target',
      'question-wrong-cohort-0001', '01980a52-0000-7000-8000-000000000003'
    )
  $$,
  '23514',
  'target trainer is not active in the question cohort and tenant',
  'a trainer from another cohort is not a valid transfer target'
);

select throws_ok(
  $$
    select * from public.transfer_question(
      '01980a50-0000-7000-8000-000000000003', 2,
      '01980a00-0000-7000-8000-000000000003', 'Stale transfer',
      'question-stale-transfer-0001', '01980a52-0000-7000-8000-000000000004'
    )
  $$,
  '40001',
  'question is stale or not transferable',
  'a stale transfer CAS version is rejected'
);

select throws_ok(
  $$
    select * from public.answer_question(
      '01980a50-0000-7000-8000-000000000099', 1,
      'A trainer must not answer across tenants.', 'answer-cross-tenant-0001',
      '01980a52-0000-7000-8000-000000000005'
    )
  $$,
  '42501',
  'question answer scope denied',
  'an assigned identifier alone does not permit cross-tenant answers'
);

select throws_ok(
  $$
    select * from public.transfer_question(
      '01980a50-0000-7000-8000-000000000099', 1,
      '01980a00-0000-7000-8000-000000000003', 'Cross-tenant transfer',
      'question-cross-tenant-xfer1', '01980a52-0000-7000-8000-000000000006'
    )
  $$,
  '42501',
  'question transfer scope denied',
  'an assigned identifier alone does not permit cross-tenant transfers'
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
    select * from public.answer_question(
      '01980a50-0000-7000-8000-000000000003', 1,
      'Suspended tenant member attempts an answer.', 'answer-suspended-member-01',
      '01980a52-0000-7000-8000-000000000018'
    )
  $$,
  '42501',
  'question answer scope denied',
  'a suspended tenant member cannot answer despite cohort assignment'
);

reset role;

update public.organization_memberships
set state = 'active'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000002';

set local role authenticated;

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);

select throws_ok(
  $$
    select * from public.answer_question(
      '01980a50-0000-7000-8000-000000000003', 1,
      'Learner attempts to answer.', 'learner-answer-denied-0001',
      '01980a52-0000-7000-8000-000000000007'
    )
  $$,
  '42501',
  'question answer scope denied',
  'a learner cannot answer a trainer question'
);

select throws_ok(
  $$
    select * from public.transfer_question(
      '01980a50-0000-7000-8000-000000000003', 1,
      '01980a00-0000-7000-8000-000000000003', 'Learner transfer attempt',
      'learner-transfer-denied-0001', '01980a52-0000-7000-8000-000000000008'
    )
  $$,
  '42501',
  'question transfer scope denied',
  'a learner cannot transfer a trainer question'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select lives_ok(
  $$
    select * from public.answer_question(
      '01980a50-0000-7000-8000-000000000001', 1,
      'Start with impact and likelihood, then derive the highest-risk tests.',
      'answer-success-idempotent-01', '01980a52-0000-7000-8000-000000000009'
    )
  $$,
  'the assigned trainer answers a question atomically'
);

reset role;

select is(
  (select state::text from public.questions where id = '01980a50-0000-7000-8000-000000000001'),
  'answered',
  'answer moves the question to the named answered state'
);

select is(
  (select row_version from public.questions where id = '01980a50-0000-7000-8000-000000000001'),
  2::bigint,
  'answer advances the question CAS version once'
);

select ok(
  (select answered_at is not null from public.questions where id = '01980a50-0000-7000-8000-000000000001'),
  'answer records its completion timestamp'
);

select is(
  (
    select count(*)::bigint from public.question_messages
    where question_id = '01980a50-0000-7000-8000-000000000001'
      and message_kind = 'answer'
  ),
  1::bigint,
  'answer appends exactly one immutable thread message'
);

select is(
  (
    select author_id from public.question_messages
    where question_id = '01980a50-0000-7000-8000-000000000001'
      and message_kind = 'answer'
  ),
  '01980a00-0000-7000-8000-000000000002'::uuid,
  'answer author is derived from the authenticated trainer'
);

select is(
  (
    select count(*)::bigint from public.audit_events
    where aggregate_id = '01980a50-0000-7000-8000-000000000001'
      and event_type = 'question.answered'
  ),
  1::bigint,
  'answer writes one audit event'
);

select is(
  (
    select count(*)::bigint from public.outbox_events
    where aggregate_id = '01980a50-0000-7000-8000-000000000001'
      and event_type = 'question.answered.v1'
  ),
  1::bigint,
  'answer appends one integration event'
);

select is(
  (
    select count(*)::bigint from public.notifications
    where recipient_id = '01980a00-0000-7000-8000-000000000001'
      and event_type = 'question.answered'
      and payload ->> 'question_id' = '01980a50-0000-7000-8000-000000000001'
  ),
  1::bigint,
  'answer notifies the learner once'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select lives_ok(
  $$
    select * from public.answer_question(
      '01980a50-0000-7000-8000-000000000001', 1,
      'Start with impact and likelihood, then derive the highest-risk tests.',
      'answer-success-idempotent-01', '01980a52-0000-7000-8000-000000000009'
    )
  $$,
  'an exact answer replay returns the current question'
);

select throws_ok(
  $$
    select * from public.answer_question(
      '01980a50-0000-7000-8000-000000000001', 1,
      'A different answer under the same key.',
      'answer-success-idempotent-01', '01980a52-0000-7000-8000-000000000010'
    )
  $$,
  '22023',
  'idempotency key was reused with a different answer payload',
  'answer idempotency keys cannot be reused with changed payloads'
);

select throws_ok(
  $$
    select * from public.answer_question(
      '01980a50-0000-7000-8000-000000000001', 1,
      'A competing answer using the stale version.',
      'answer-stale-competing-0001', '01980a52-0000-7000-8000-000000000011'
    )
  $$,
  '40001',
  'question is stale or not answerable',
  'a competing answer cannot overwrite the accepted answer'
);

reset role;

select is(
  (
    select count(*)::bigint from public.question_messages
    where question_id = '01980a50-0000-7000-8000-000000000001'
      and message_kind = 'answer'
  ),
  1::bigint,
  'answer replay and failures do not duplicate the answer message'
);

select is(
  (
    select count(*)::bigint from public.audit_events
    where aggregate_id = '01980a50-0000-7000-8000-000000000001'
      and event_type = 'question.answered'
  ),
  1::bigint,
  'answer replay and failures do not duplicate audit events'
);

select is(
  (
    select count(*)::bigint from public.outbox_events
    where aggregate_id = '01980a50-0000-7000-8000-000000000001'
      and event_type = 'question.answered.v1'
  ),
  1::bigint,
  'answer replay and failures do not duplicate outbox events'
);

update public.organization_memberships
set state = 'suspended'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select throws_ok(
  $$
    select * from public.transfer_question(
      '01980a50-0000-7000-8000-000000000002', 1,
      '01980a00-0000-7000-8000-000000000003',
      'Target tenant membership is suspended.',
      'transfer-target-suspended-01', '01980a52-0000-7000-8000-000000000019'
    )
  $$,
  '23514',
  'target trainer is not active in the question cohort and tenant',
  'a suspended tenant member is not a valid transfer target'
);

reset role;

update public.organization_memberships
set state = 'active'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select lives_ok(
  $$
    select * from public.transfer_question(
      '01980a50-0000-7000-8000-000000000002', 1,
      '01980a00-0000-7000-8000-000000000003',
      'The target trainer has specialist oracle expertise.',
      'transfer-success-idempotent1', '01980a52-0000-7000-8000-000000000012'
    )
  $$,
  'the current trainer transfers the question atomically'
);

reset role;

select is(
  (select state::text from public.questions where id = '01980a50-0000-7000-8000-000000000002'),
  'transferred',
  'transfer moves the question to the named transferred state'
);

select is(
  (select assigned_trainer_id from public.questions where id = '01980a50-0000-7000-8000-000000000002'),
  '01980a00-0000-7000-8000-000000000003'::uuid,
  'transfer atomically changes the assigned trainer'
);

select is(
  (select row_version from public.questions where id = '01980a50-0000-7000-8000-000000000002'),
  2::bigint,
  'transfer advances the question CAS version once'
);

select is(
  (
    select count(*)::bigint from public.question_transfers
    where question_id = '01980a50-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'transfer appends one ownership-history record'
);

select is(
  (
    select from_trainer_id::text || ':' || to_trainer_id::text
    from public.question_transfers
    where question_id = '01980a50-0000-7000-8000-000000000002'
  ),
  '01980a00-0000-7000-8000-000000000002:01980a00-0000-7000-8000-000000000003',
  'transfer history records actor-derived source and validated target'
);

select is(
  (
    select count(*)::bigint from public.audit_events
    where aggregate_id = '01980a50-0000-7000-8000-000000000002'
      and event_type = 'question.transferred'
  ),
  1::bigint,
  'transfer writes one audit event'
);

select is(
  (
    select count(*)::bigint from public.outbox_events
    where aggregate_id = '01980a50-0000-7000-8000-000000000002'
      and event_type = 'question.transferred.v1'
  ),
  1::bigint,
  'transfer appends one integration event'
);

select is(
  (
    select count(*)::bigint from public.notifications
    where event_type = 'question.transferred'
      and recipient_id = '01980a00-0000-7000-8000-000000000001'
      and payload ->> 'question_id' = '01980a50-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'transfer notifies the learner without exposing transfer details'
);

select is(
  (
    select count(*)::bigint from public.notifications
    where event_type = 'question.assigned'
      and recipient_id = '01980a00-0000-7000-8000-000000000003'
      and payload ->> 'question_id' = '01980a50-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'transfer notifies the validated target trainer'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select lives_ok(
  $$
    select * from public.transfer_question(
      '01980a50-0000-7000-8000-000000000002', 1,
      '01980a00-0000-7000-8000-000000000003',
      'The target trainer has specialist oracle expertise.',
      'transfer-success-idempotent1', '01980a52-0000-7000-8000-000000000012'
    )
  $$,
  'an exact transfer replay returns the current question'
);

select throws_ok(
  $$
    select * from public.transfer_question(
      '01980a50-0000-7000-8000-000000000002', 1,
      '01980a00-0000-7000-8000-000000000003',
      'A changed reason under the same key.',
      'transfer-success-idempotent1', '01980a52-0000-7000-8000-000000000013'
    )
  $$,
  '22023',
  'idempotency key was reused with a different transfer payload',
  'transfer idempotency keys cannot be reused with changed payloads'
);

select throws_ok(
  $$
    select * from public.transfer_question(
      '01980a50-0000-7000-8000-000000000002', 2,
      '01980a00-0000-7000-8000-000000000003',
      'Old owner attempts another transfer.',
      'transfer-old-owner-denied-01', '01980a52-0000-7000-8000-000000000014'
    )
  $$,
  '42501',
  'question is assigned to another trainer',
  'the previous trainer cannot mutate after ownership changes'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true);

select throws_ok(
  $$
    select * from public.transfer_question(
      '01980a50-0000-7000-8000-000000000002', 1,
      '01980a00-0000-7000-8000-000000000002',
      'Current owner uses a stale version.',
      'transfer-new-owner-stale-001', '01980a52-0000-7000-8000-000000000015'
    )
  $$,
  '40001',
  'question is stale or not transferable',
  'the latest owner is still subject to CAS concurrency control'
);

select throws_ok(
  $$
    select * from public.transfer_question(
      '01980a50-0000-7000-8000-000000000002', 1,
      '01980a00-0000-7000-8000-000000000003',
      'Replay attempted by target.',
      'transfer-success-idempotent1', '01980a52-0000-7000-8000-000000000016'
    )
  $$,
  '22023',
  'a different target trainer, reason and idempotency key are required',
  'target cannot reinterpret a prior transfer as a self-transfer replay'
);

select lives_ok(
  $$
    select * from public.answer_question(
      '01980a50-0000-7000-8000-000000000002', 2,
      'Use the requirement itself as the primary oracle, then compare observable behavior.',
      'answer-after-transfer-00001', '01980a52-0000-7000-8000-000000000017'
    )
  $$,
  'only the latest transferred owner can answer the question'
);

reset role;

select is(
  (select state::text from public.questions where id = '01980a50-0000-7000-8000-000000000002'),
  'answered',
  'the transferred question reaches answered state'
);

select is(
  (select row_version from public.questions where id = '01980a50-0000-7000-8000-000000000002'),
  3::bigint,
  'transfer followed by answer advances one version per mutation'
);

select is(
  (
    select author_id from public.question_messages
    where question_id = '01980a50-0000-7000-8000-000000000002'
      and message_kind = 'answer'
  ),
  '01980a00-0000-7000-8000-000000000003'::uuid,
  'the answer is authored by the latest transferred owner'
);

select is(
  (
    select count(*)::bigint from public.question_transfers
    where question_id = '01980a50-0000-7000-8000-000000000002'
  ),
  1::bigint,
  'replay and failed competing transfers leave one history record'
);

select is(
  (
    select count(*)::bigint from public.audit_events
    where aggregate_id in (
      '01980a50-0000-7000-8000-000000000001',
      '01980a50-0000-7000-8000-000000000002'
    ) and event_type in ('question.answered', 'question.transferred')
  ),
  3::bigint,
  'successful answer-transfer-answer mutations produce three audit events'
);

select is(
  (
    select count(*)::bigint from public.outbox_events
    where aggregate_id in (
      '01980a50-0000-7000-8000-000000000001',
      '01980a50-0000-7000-8000-000000000002'
    ) and event_type in ('question.answered.v1', 'question.transferred.v1')
  ),
  3::bigint,
  'successful answer-transfer-answer mutations produce three outbox events'
);

select is(
  (
    select count(*)::bigint from public.notifications
    where payload ->> 'question_id' in (
      '01980a50-0000-7000-8000-000000000001',
      '01980a50-0000-7000-8000-000000000002'
    ) and event_type in ('question.answered', 'question.transferred', 'question.assigned')
  ),
  4::bigint,
  'successful mutations create exactly four deduplicated notifications'
);

select is(
  (
    select count(*)::bigint from public.question_transfers
    where question_id in (
      '01980a50-0000-7000-8000-000000000003',
      '01980a50-0000-7000-8000-000000000099'
    )
  ),
  0::bigint,
  'invalid, unauthorized and stale transfers leave no partial history'
);

select is(
  (
    select count(*)::bigint from public.question_messages
    where question_id in (
      '01980a50-0000-7000-8000-000000000003',
      '01980a50-0000-7000-8000-000000000099'
    ) and message_kind = 'answer'
  ),
  0::bigint,
  'invalid and unauthorized answers leave no partial messages'
);

select * from finish();
rollback;
