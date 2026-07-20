begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(86);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'list_active_cohort_trainers'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = 'uuid'
  ),
  1::bigint,
  'one active cohort trainer lookup RPC exists'
);

select is(
  (
    select pg_catalog.pg_get_function_result(procedure_record.oid)
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'list_active_cohort_trainers'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = 'uuid'
  ),
  'TABLE(user_id uuid, display_name text)',
  'trainer lookup exposes only the minimal identifier and display name projection'
);

select ok(
  (
    select procedure_record.prosecdef
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'list_active_cohort_trainers'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = 'uuid'
  ),
  'trainer lookup uses its reviewed security-definer boundary'
);

select is(
  (
    select procedure_record.proconfig
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'list_active_cohort_trainers'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = 'uuid'
  ),
  array['search_path=""']::text[],
  'trainer lookup has an empty fixed search path'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.list_active_cohort_trainers(uuid)', 'EXECUTE'
  ),
  'authenticated callers can execute the trainer lookup'
);

select ok(
  not has_function_privilege(
    'anon', 'public.list_active_cohort_trainers(uuid)', 'EXECUTE'
  ),
  'anonymous callers cannot execute the trainer lookup'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'transfer_submission'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'uuid, bigint, uuid, text, text, uuid'
  ),
  1::bigint,
  'one versioned and idempotent submission transfer RPC exists'
);

select ok(
  (
    select procedure_record.prosecdef
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'transfer_submission'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'uuid, bigint, uuid, text, text, uuid'
  ),
  'submission transfer uses its reviewed security-definer boundary'
);

select is(
  (
    select procedure_record.proconfig
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'transfer_submission'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'uuid, bigint, uuid, text, text, uuid'
  ),
  array['search_path=""']::text[],
  'submission transfer has an empty fixed search path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.transfer_submission(uuid,bigint,uuid,text,text,uuid)',
    'EXECUTE'
  ),
  'authenticated callers can execute submission transfer'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.transfer_submission(uuid,bigint,uuid,text,text,uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute submission transfer'
);

select ok(
  not has_table_privilege('authenticated', 'public.review_transfers', 'INSERT'),
  'authenticated callers cannot bypass atomic transfer through direct inserts'
);

select ok(
  not has_table_privilege('authenticated', 'public.submissions', 'UPDATE'),
  'authenticated callers cannot bypass submission state and CAS through direct updates'
);

select ok(
  not has_table_privilege('authenticated', 'public.reviews', 'INSERT'),
  'a stale trainer cannot bypass ownership by directly reserving a review version'
);

select ok(
  (
    select column_record.is_nullable = 'NO'
      and column_record.data_type = 'bigint'
    from information_schema.columns column_record
    where column_record.table_schema = 'public'
      and column_record.table_name = 'review_transfers'
      and column_record.column_name = 'expected_submission_row_version'
  ),
  'immutable transfer history records the expected CAS version'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'decide_submission'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'uuid, uuid, bigint, review_decision, text, jsonb, text, uuid'
  ),
  1::bigint,
  'the existing rubric-aware decision contract remains public and unique'
);

select ok(
  (
    select procedure_record.prosecdef
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'decide_submission'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'uuid, uuid, bigint, review_decision, text, jsonb, text, uuid'
  ),
  'the ownership-aware decision wrapper is security definer'
);

select is(
  (
    select procedure_record.proconfig
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'decide_submission'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'uuid, uuid, bigint, review_decision, text, jsonb, text, uuid'
  ),
  array['search_path=""']::text[],
  'the decision wrapper has an empty fixed search path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.decide_submission(uuid,uuid,bigint,public.review_decision,text,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'authenticated callers retain access to the hardened decision RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.decide_submission(uuid,uuid,bigint,public.review_decision,text,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute the decision RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.decide_submission_effects_unowned(uuid,uuid,bigint,public.review_decision,text,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'authenticated callers cannot bypass ownership through the internal effect function'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select * from public.list_active_cohort_trainers(
    '01980a30-0000-7000-8000-000000000001'
  ) $$,
  '42501',
  'authentication required',
  'trainer lookup rejects a missing session'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000001', 'No-session transfer',
    'submission-no-session-0001', '01980a62-0000-7000-8000-000000000001'
  ) $$,
  '42501',
  'authentication required',
  'submission transfer rejects a missing session'
);

select throws_ok(
  $$ select * from public.decide_submission(
    '01980a60-0000-7000-8000-000000000001',
    '01980a61-0000-7000-8000-000000000001', 1, 'accepted',
    'No-session decision',
    '[{"criterion_id":"01980a2c-0000-7000-8000-000000000001","points":8}]'::jsonb,
    'submission-no-session-review1', '01980a62-0000-7000-8000-000000000002'
  ) $$,
  '42501',
  'authentication required',
  'submission decision rejects a missing session'
);

reset role;

-- Same-tenant wrong-cohort and inactive candidate fixtures.
insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, created_by
) values (
  '01980a30-0000-7000-8000-000000000078',
  '01980a10-0000-7000-8000-000000000001',
  '01980a20-0000-7000-8000-000000000001',
  '01980a22-0000-7000-8000-000000000001',
  'Submission Transfer Other Cohort', 'active', 'scheduled',
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.cohort_memberships (
  id, cohort_id, user_id, role, state, assigned_by
) values
  (
    '01980a31-0000-7000-8000-000000000078',
    '01980a30-0000-7000-8000-000000000078',
    '01980a00-0000-7000-8000-000000000003',
    'trainer', 'active', '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01980a31-0000-7000-8000-000000000079',
    '01980a30-0000-7000-8000-000000000001',
    '01980a00-0000-7000-8000-000000000003',
    'trainer', 'suspended', '01980a00-0000-7000-8000-000000000003'
  );

-- Main submission reuses the deterministic learner attempt but has isolated
-- submission/version identifiers and rolls back with this test transaction.
update public.attempts
set state = 'submitted', submitted_at = statement_timestamp()
where id = '01980a34-0000-7000-8000-000000000001';

insert into public.submissions (
  id, organization_id, attempt_id, learner_id, cohort_id, task_id,
  state, latest_version_number
) values (
  '01980a60-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980a34-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  '01980a30-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001', 'submitted', 1
);

insert into public.submission_versions (
  id, submission_id, version_number, idempotency_key, answer_text,
  selected_option_ids, evidence_refs, elapsed_seconds, hint_used,
  task_snapshot, submitted_by
) values (
  '01980a61-0000-7000-8000-000000000001',
  '01980a60-0000-7000-8000-000000000001', 1,
  'submission-transfer-fixture-v1', 'Transfer ownership fixture answer.',
  array['01980a28-0000-7000-8000-000000000001'::uuid], '{}', 420, false,
  '{"content_version_id":"01980a22-0000-7000-8000-000000000001"}',
  '01980a00-0000-7000-8000-000000000001'
);

-- A structurally valid cross-tenant submission proves source-scope denial.
insert into public.organizations (id, slug, name, state)
values (
  '01980a10-0000-7000-8000-000000000078',
  'submission-transfer-other-tenant', 'Submission Transfer Other Tenant', 'active'
);

insert into public.organization_memberships (
  id, organization_id, user_id, state, joined_at
) values (
  '01980a11-0000-7000-8000-000000000078',
  '01980a10-0000-7000-8000-000000000078',
  '01980a00-0000-7000-8000-000000000004', 'active', statement_timestamp()
);

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, created_by
) values (
  '01980a30-0000-7000-8000-000000000079',
  '01980a10-0000-7000-8000-000000000078',
  '01980a20-0000-7000-8000-000000000001',
  '01980a22-0000-7000-8000-000000000001',
  'Submission Transfer Cross Tenant', 'active', 'scheduled',
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.enrollments (
  id, organization_id, learner_id, course_id, cohort_id, state,
  idempotency_key, decided_by, decided_at
) values (
  '01980a33-0000-7000-8000-000000000078',
  '01980a10-0000-7000-8000-000000000078',
  '01980a00-0000-7000-8000-000000000004',
  '01980a20-0000-7000-8000-000000000001',
  '01980a30-0000-7000-8000-000000000079', 'assigned',
  'cross-tenant-enrollment-0001',
  '01980a00-0000-7000-8000-000000000003', statement_timestamp()
);

insert into public.attempts (
  id, organization_id, enrollment_id, learner_id, cohort_id, task_id, state,
  submitted_at
) values (
  '01980a34-0000-7000-8000-000000000078',
  '01980a10-0000-7000-8000-000000000078',
  '01980a33-0000-7000-8000-000000000078',
  '01980a00-0000-7000-8000-000000000004',
  '01980a30-0000-7000-8000-000000000079',
  '01980a26-0000-7000-8000-000000000001', 'submitted',
  statement_timestamp()
);

insert into public.submissions (
  id, organization_id, attempt_id, learner_id, cohort_id, task_id,
  state, latest_version_number
) values (
  '01980a60-0000-7000-8000-000000000078',
  '01980a10-0000-7000-8000-000000000078',
  '01980a34-0000-7000-8000-000000000078',
  '01980a00-0000-7000-8000-000000000004',
  '01980a30-0000-7000-8000-000000000079',
  '01980a26-0000-7000-8000-000000000001', 'submitted', 1
);

insert into public.submission_versions (
  id, submission_id, version_number, idempotency_key, answer_text,
  selected_option_ids, evidence_refs, elapsed_seconds, hint_used,
  task_snapshot, submitted_by
) values (
  '01980a61-0000-7000-8000-000000000078',
  '01980a60-0000-7000-8000-000000000078', 1,
  'cross-tenant-submission-v0001', 'Cross-tenant fixture.', '{}', '{}', 60,
  false, '{"content_version_id":"01980a22-0000-7000-8000-000000000001"}',
  '01980a00-0000-7000-8000-000000000004'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);

select throws_ok(
  $$ select * from public.list_active_cohort_trainers(
    '01980a30-0000-7000-8000-000000000001'
  ) $$,
  '42501',
  'active cohort trainer scope denied',
  'a learner cannot enumerate cohort trainer profiles'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000002', 'Learner transfer attempt',
    'submission-learner-denied-01', '01980a62-0000-7000-8000-000000000003'
  ) $$,
  '42501',
  'submission transfer scope denied',
  'a non-trainer cannot transfer a submission'
);

reset role;

-- Promote the second destination fixture to a fully active scoped trainer.
insert into public.user_roles (
  id, user_id, role_id, organization_id, granted_by, reason
)
select
  '01980a12-0000-7000-8000-000000000078',
  '01980a00-0000-7000-8000-000000000001', role_record.id,
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000003',
  'Submission ownership test trainer'
from public.roles role_record
where role_record.code = 'trainer';

insert into public.cohort_memberships (
  id, cohort_id, user_id, role, state, assigned_by
) values (
  '01980a31-0000-7000-8000-000000000080',
  '01980a30-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  'trainer', 'active', '01980a00-0000-7000-8000-000000000003'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select is(
  (
    select array_agg(candidate.user_id order by candidate.user_id)
    from public.list_active_cohort_trainers(
      '01980a30-0000-7000-8000-000000000001'
    ) candidate
  ),
  array[
    '01980a00-0000-7000-8000-000000000001'::uuid,
    '01980a00-0000-7000-8000-000000000002'::uuid
  ],
  'lookup returns every active eligible trainer, including the caller, but no inactive member'
);

select is(
  (
    select array_agg(candidate.display_name order by candidate.user_id)
    from public.list_active_cohort_trainers(
      '01980a30-0000-7000-8000-000000000001'
    ) candidate
  ),
  array['Lena Learner', 'Theo Trainer']::text[],
  'lookup returns only the expected display names for eligible trainers'
);

select is(
  (
    select array_agg(key_record.key order by key_record.key)
    from public.list_active_cohort_trainers(
      '01980a30-0000-7000-8000-000000000001'
    ) candidate
    cross join lateral jsonb_object_keys(to_jsonb(candidate)) key_record(key)
  ),
  array['display_name', 'display_name', 'user_id', 'user_id']::text[],
  'lookup rows contain no profile, email, locale, or tenant overexposure'
);

select throws_ok(
  $$ select * from public.list_active_cohort_trainers(
    '01980a30-0000-7000-8000-000000000078'
  ) $$,
  '42501',
  'active cohort trainer scope denied',
  'a trainer cannot enumerate a cohort they do not train or manage'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000002', 'Self transfer',
    'submission-self-transfer-0001', '01980a62-0000-7000-8000-000000000004'
  ) $$,
  '22023',
  'a current version, different target trainer, reason, idempotency key and correlation id are required',
  'a trainer cannot transfer a submission to themself'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000001', ' ',
    'submission-blank-reason-0001', '01980a62-0000-7000-8000-000000000005'
  ) $$,
  '22023',
  'a current version, different target trainer, reason, idempotency key and correlation id are required',
  'blank transfer reasons are rejected before mutation'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000001', 'Short key',
    'too-short', '01980a62-0000-7000-8000-000000000006'
  ) $$,
  '22023',
  'a current version, different target trainer, reason, idempotency key and correlation id are required',
  'short idempotency keys are rejected before mutation'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 0,
    '01980a00-0000-7000-8000-000000000001', 'Invalid version',
    'submission-invalid-version-01', '01980a62-0000-7000-8000-000000000007'
  ) $$,
  '22023',
  'a current version, different target trainer, reason, idempotency key and correlation id are required',
  'non-positive expected versions are rejected before mutation'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000004', 'Non-trainer target',
    'submission-nontrainer-target1', '01980a62-0000-7000-8000-000000000008'
  ) $$,
  '23514',
  'target trainer is not active in the submission cohort and tenant',
  'a cohort manager without trainer membership is not a transfer destination'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000003', 'Inactive target',
    'submission-inactive-target-01', '01980a62-0000-7000-8000-000000000009'
  ) $$,
  '23514',
  'target trainer is not active in the submission cohort and tenant',
  'a suspended cohort trainer is not a transfer destination'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 2,
    '01980a00-0000-7000-8000-000000000001', 'Stale transfer',
    'submission-stale-transfer-0001', '01980a62-0000-7000-8000-000000000010'
  ) $$,
  '40001',
  'submission is stale or not transferable',
  'a stale competing transfer loses the CAS race'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000078', 1,
    '01980a00-0000-7000-8000-000000000001', 'Cross-tenant transfer',
    'submission-cross-tenant-00001', '01980a62-0000-7000-8000-000000000011'
  ) $$,
  '42501',
  'submission transfer scope denied',
  'a trainer cannot transfer a submission in another tenant and cohort'
);

reset role;

update public.organization_memberships
set state = 'suspended'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select throws_ok(
  $$ select * from public.list_active_cohort_trainers(
    '01980a30-0000-7000-8000-000000000001'
  ) $$,
  '42501',
  'active cohort trainer scope denied',
  'a tenant-suspended trainer cannot enumerate candidates'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000001', 'Suspended actor',
    'submission-suspended-actor-01', '01980a62-0000-7000-8000-000000000012'
  ) $$,
  '42501',
  'submission transfer scope denied',
  'a tenant-suspended trainer cannot transfer submissions'
);

reset role;

update public.organization_memberships
set state = 'active'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000002';

update public.organization_memberships
set state = 'suspended'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000001', 'Suspended destination tenant',
    'submission-suspended-target-01', '01980a62-0000-7000-8000-000000000013'
  ) $$,
  '23514',
  'target trainer is not active in the submission cohort and tenant',
  'a tenant-suspended trainer is not a transfer destination'
);

reset role;

update public.organization_memberships
set state = 'active'
where organization_id = '01980a10-0000-7000-8000-000000000001'
  and user_id = '01980a00-0000-7000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select lives_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000001',
    '  Specialist review ownership handoff.  ',
    'submission-transfer-success-01', '01980a62-0000-7000-8000-000000000014'
  ) $$,
  'the active cohort trainer transfers the submission atomically'
);

reset role;

select is(
  (select row_version from public.submissions
   where id = '01980a60-0000-7000-8000-000000000001'),
  2::bigint,
  'transfer advances the submission row version exactly once'
);

select is(
  (select count(*)::bigint from public.review_transfers
   where submission_id = '01980a60-0000-7000-8000-000000000001'),
  1::bigint,
  'transfer appends exactly one immutable ownership record'
);

select is(
  (
    select from_trainer_id::text || ':' || to_trainer_id::text
    from public.review_transfers
    where submission_id = '01980a60-0000-7000-8000-000000000001'
  ),
  '01980a00-0000-7000-8000-000000000002:01980a00-0000-7000-8000-000000000001',
  'transfer history derives the source actor and records the validated target'
);

select is(
  (
    select reason || ':' || expected_submission_row_version::text
    from public.review_transfers
    where submission_id = '01980a60-0000-7000-8000-000000000001'
  ),
  'Specialist review ownership handoff.:1',
  'transfer history stores normalized reason and its expected CAS version'
);

select is(
  (select count(*)::bigint from public.audit_events
   where aggregate_id = '01980a60-0000-7000-8000-000000000001'
     and event_type = 'submission.transferred'),
  1::bigint,
  'transfer writes one audit event'
);

select is(
  (select count(*)::bigint from public.outbox_events
   where aggregate_id = '01980a60-0000-7000-8000-000000000001'
     and event_type = 'submission.transferred.v1'),
  1::bigint,
  'transfer writes one transactional outbox event'
);

select is(
  (select count(*)::bigint from public.notifications
   where recipient_id = '01980a00-0000-7000-8000-000000000001'
     and event_type = 'submission.transferred'
     and payload ->> 'submission_id' = '01980a60-0000-7000-8000-000000000001'),
  1::bigint,
  'transfer notifies the destination trainer once'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select lives_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000001',
    'Specialist review ownership handoff.',
    'submission-transfer-success-01', '01980a62-0000-7000-8000-000000000099'
  ) $$,
  'an exact transfer replay returns the current submission to the original actor'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000001',
    'Changed replay reason.',
    'submission-transfer-success-01', '01980a62-0000-7000-8000-000000000015'
  ) $$,
  '22023',
  'idempotency key was reused with a different transfer payload',
  'a transfer key cannot be replayed with a changed reason'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 2,
    '01980a00-0000-7000-8000-000000000001',
    'Specialist review ownership handoff.',
    'submission-transfer-success-01', '01980a62-0000-7000-8000-000000000016'
  ) $$,
  '22023',
  'idempotency key was reused with a different transfer payload',
  'a transfer key cannot be replayed with a changed expected version'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 2,
    '01980a00-0000-7000-8000-000000000003', 'Old owner competing transfer',
    'submission-old-owner-transfer1', '01980a62-0000-7000-8000-000000000017'
  ) $$,
  '42501',
  'submission review ownership changed',
  'the previous trainer cannot transfer after ownership changes'
);

select throws_ok(
  $$ select * from public.decide_submission(
    '01980a60-0000-7000-8000-000000000001',
    '01980a61-0000-7000-8000-000000000001', 2, 'accepted',
    'Old owner decision attempt',
    '[{"criterion_id":"01980a2c-0000-7000-8000-000000000001","points":8}]'::jsonb,
    'submission-old-owner-review-01', '01980a62-0000-7000-8000-000000000018'
  ) $$,
  '42501',
  'submission review ownership changed',
  'the previous trainer cannot decide after ownership changes'
);

select is(
  (select count(*)::bigint from public.review_transfers
   where submission_id = '01980a60-0000-7000-8000-000000000001'),
  1::bigint,
  'replay and rejected old-owner calls create no duplicate transfer history'
);

reset role;

select is(
  (select count(*)::bigint from public.audit_events
   where aggregate_id = '01980a60-0000-7000-8000-000000000001'
     and event_type = 'submission.transferred'),
  1::bigint,
  'replay and rejected calls create no duplicate audit effects'
);

select is(
  (select count(*)::bigint from public.outbox_events
   where aggregate_id = '01980a60-0000-7000-8000-000000000001'
     and event_type = 'submission.transferred.v1'),
  1::bigint,
  'replay and rejected calls create no duplicate outbox effects'
);

select is(
  (select count(*)::bigint from public.notifications
   where event_type = 'submission.transferred'
     and payload ->> 'submission_id' = '01980a60-0000-7000-8000-000000000001'),
  1::bigint,
  'replay and rejected calls create no duplicate notifications'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 1,
    '01980a00-0000-7000-8000-000000000002', 'Stale new-owner transfer',
    'submission-new-owner-stale-01', '01980a62-0000-7000-8000-000000000019'
  ) $$,
  '40001',
  'submission is stale or not transferable',
  'the latest owner is still subject to CAS concurrency control'
);

select lives_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 2,
    '01980a00-0000-7000-8000-000000000002', 'Return to primary trainer',
    'submission-transfer-chain-0001', '01980a62-0000-7000-8000-000000000020'
  ) $$,
  'the latest owner can continue the immutable transfer chain'
);

reset role;

select is(
  (select row_version from public.submissions
   where id = '01980a60-0000-7000-8000-000000000001'),
  3::bigint,
  'a second transfer advances exactly one additional submission version'
);

select is(
  (
    select to_trainer_id from public.review_transfers
    where submission_id = '01980a60-0000-7000-8000-000000000001'
    order by created_at desc, id desc limit 1
  ),
  '01980a00-0000-7000-8000-000000000002'::uuid,
  'the latest immutable transfer defines effective ownership'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);

select throws_ok(
  $$ select * from public.decide_submission(
    '01980a60-0000-7000-8000-000000000001',
    '01980a61-0000-7000-8000-000000000001', 3, 'accepted',
    'Prior owner chain decision',
    '[{"criterion_id":"01980a2c-0000-7000-8000-000000000001","points":8}]'::jsonb,
    'submission-prior-owner-review1', '01980a62-0000-7000-8000-000000000021'
  ) $$,
  '42501',
  'submission review ownership changed',
  'ownership continuity denies a prior owner after a later transfer'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true);

select is(
  (
    select count(*)::bigint
    from public.list_active_cohort_trainers(
      '01980a30-0000-7000-8000-000000000001'
    )
  ),
  2::bigint,
  'a cohort manager can retrieve the same minimal active-trainer candidate set'
);

select lives_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 3,
    '01980a00-0000-7000-8000-000000000001', 'Manager workload override',
    'submission-manager-transfer-01', '01980a62-0000-7000-8000-000000000022'
  ) $$,
  'a scoped cohort manager can override current transfer ownership'
);

reset role;

select is(
  (select row_version from public.submissions
   where id = '01980a60-0000-7000-8000-000000000001'),
  4::bigint,
  'manager override also advances the submission CAS version exactly once'
);

select is(
  (select count(*)::bigint from public.review_transfers
   where submission_id = '01980a60-0000-7000-8000-000000000001'),
  3::bigint,
  'the complete trainer-trainer-manager chain remains immutable and append-only'
);

select is(
  (
    select from_trainer_id::text || ':' || to_trainer_id::text
    from public.review_transfers
    where submission_id = '01980a60-0000-7000-8000-000000000001'
    order by created_at desc, id desc limit 1
  ),
  '01980a00-0000-7000-8000-000000000004:01980a00-0000-7000-8000-000000000001',
  'manager override records the authenticated manager and new effective owner'
);

select is(
  (
    select metadata ->> 'manager_override'
    from public.audit_events
    where aggregate_id = '01980a60-0000-7000-8000-000000000001'
      and event_type = 'submission.transferred'
    order by occurred_at desc, id desc limit 1
  ),
  'true',
  'manager override is explicit in the audit trail'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);

select throws_ok(
  $$ select * from public.decide_submission(
    '01980a60-0000-7000-8000-000000000001',
    '01980a61-0000-7000-8000-000000000001', 4, 'accepted',
    'Displaced owner decision',
    '[{"criterion_id":"01980a2c-0000-7000-8000-000000000001","points":8}]'::jsonb,
    'submission-displaced-review-01', '01980a62-0000-7000-8000-000000000023'
  ) $$,
  '42501',
  'submission review ownership changed',
  'manager reassignment immediately displaces the prior trainer'
);

select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);

select lives_ok(
  $$ select * from public.decide_submission(
    '01980a60-0000-7000-8000-000000000001',
    '01980a61-0000-7000-8000-000000000001', 4, 'accepted',
    'Risk coverage is demonstrated with clear evidence.',
    '[{"criterion_id":"01980a2c-0000-7000-8000-000000000001","points":8,"comment":"Good risk coverage"}]'::jsonb,
    'submission-new-owner-review-001', '01980a62-0000-7000-8000-000000000024'
  ) $$,
  'the latest transferred owner completes the preserved rubric decision workflow'
);

reset role;

select is(
  (select state::text from public.submissions
   where id = '01980a60-0000-7000-8000-000000000001'),
  'accepted',
  'the ownership-aware decision preserves the accepted state transition'
);

select is(
  (select row_version from public.submissions
   where id = '01980a60-0000-7000-8000-000000000001'),
  5::bigint,
  'decision advances the submission exactly once after three transfers'
);

select is(
  (select reviewer_id from public.reviews
   where submission_id = '01980a60-0000-7000-8000-000000000001'),
  '01980a00-0000-7000-8000-000000000001'::uuid,
  'the review actor is the latest effective owner'
);

select is(
  (select count(*)::bigint from public.review_rubric_scores score_record
   join public.reviews review_record on review_record.id = score_record.review_id
   where review_record.submission_id = '01980a60-0000-7000-8000-000000000001'),
  1::bigint,
  'the hardened wrapper preserves rubric score effects'
);

select is(
  (select count(*)::bigint from public.evidence
   where submission_version_id = '01980a61-0000-7000-8000-000000000001'
     and evidence_kind = 'review'),
  1::bigint,
  'the hardened wrapper preserves review evidence effects'
);

select is(
  (select count(*)::bigint from public.mastery_events mastery_record
   join public.evidence evidence_record on evidence_record.id = mastery_record.evidence_id
   where evidence_record.submission_version_id = '01980a61-0000-7000-8000-000000000001'),
  1::bigint,
  'the hardened wrapper preserves accepted-review mastery effects'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true);

select lives_ok(
  $$ select * from public.decide_submission(
    '01980a60-0000-7000-8000-000000000001',
    '01980a61-0000-7000-8000-000000000001', 4, 'accepted',
    'Risk coverage is demonstrated with clear evidence.',
    '[{"criterion_id":"01980a2c-0000-7000-8000-000000000001","points":8,"comment":"Good risk coverage"}]'::jsonb,
    'submission-new-owner-review-001', '01980a62-0000-7000-8000-000000000024'
  ) $$,
  'an exact decision replay remains idempotent for the effective owner'
);

select throws_ok(
  $$ select * from public.transfer_submission(
    '01980a60-0000-7000-8000-000000000001', 5,
    '01980a00-0000-7000-8000-000000000002', 'Transfer accepted submission',
    'submission-wrong-state-00001', '01980a62-0000-7000-8000-000000000025'
  ) $$,
  '40001',
  'submission is stale or not transferable',
  'an accepted submission cannot be transferred'
);

reset role;

select is(
  (select count(*)::bigint from public.reviews
   where submission_id = '01980a60-0000-7000-8000-000000000001'),
  1::bigint,
  'decision replay creates no duplicate review'
);

select is(
  (select count(*)::bigint from public.evidence
   where submission_version_id = '01980a61-0000-7000-8000-000000000001'
     and evidence_kind = 'review'),
  1::bigint,
  'decision replay creates no duplicate evidence'
);

-- A second attempt proves that a scoped manager can directly decide when no
-- transfer exists, while the same rubric/effect implementation is retained.
insert into public.attempts (
  id, organization_id, enrollment_id, learner_id, cohort_id, task_id,
  sequence_number, state, submitted_at
) values (
  '01980a34-0000-7000-8000-000000000079',
  '01980a10-0000-7000-8000-000000000001',
  '01980a33-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  '01980a30-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001', 2, 'submitted',
  statement_timestamp()
);

insert into public.submissions (
  id, organization_id, attempt_id, learner_id, cohort_id, task_id,
  state, latest_version_number
) values (
  '01980a60-0000-7000-8000-000000000079',
  '01980a10-0000-7000-8000-000000000001',
  '01980a34-0000-7000-8000-000000000079',
  '01980a00-0000-7000-8000-000000000001',
  '01980a30-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001', 'submitted', 1
);

insert into public.submission_versions (
  id, submission_id, version_number, idempotency_key, answer_text,
  selected_option_ids, evidence_refs, elapsed_seconds, hint_used,
  task_snapshot, submitted_by
) values (
  '01980a61-0000-7000-8000-000000000079',
  '01980a60-0000-7000-8000-000000000079', 1,
  'submission-manager-review-v001', 'Manager review fixture.', '{}', '{}', 180,
  false, '{"content_version_id":"01980a22-0000-7000-8000-000000000001"}',
  '01980a00-0000-7000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000004', true);

select lives_ok(
  $$ select * from public.decide_submission(
    '01980a60-0000-7000-8000-000000000079',
    '01980a61-0000-7000-8000-000000000079', 1, 'revision_required',
    'Please add explicit negative authentication cases.',
    '[{"criterion_id":"01980a2c-0000-7000-8000-000000000001","points":6,"comment":"More negative cases needed"}]'::jsonb,
    'submission-manager-review-0001', '01980a62-0000-7000-8000-000000000026'
  ) $$,
  'a scoped cohort manager can override diffuse pre-transfer decision ownership'
);

reset role;

select is(
  (select state::text from public.submissions
   where id = '01980a60-0000-7000-8000-000000000079'),
  'revision_required',
  'manager decision preserves the revision-required state transition'
);

select is(
  (select reviewer_id from public.reviews
   where submission_id = '01980a60-0000-7000-8000-000000000079'),
  '01980a00-0000-7000-8000-000000000004'::uuid,
  'manager override review records the authenticated manager actor'
);

select is(
  (select count(*)::bigint from public.review_transfers
   where submission_id = '01980a60-0000-7000-8000-000000000078'),
  0::bigint,
  'cross-tenant failures leave no partial transfer history'
);

select is(
  (select count(*)::bigint from public.review_transfers
   where submission_id = '01980a60-0000-7000-8000-000000000001'),
  3::bigint,
  'all stale, unauthorized, replayed and wrong-state calls preserve exactly three successful transfers'
);

select * from finish();
rollback;
