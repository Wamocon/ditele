begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(20);

select is(
  (
    select count(*)::bigint from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'save_attempt_draft'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) = 'uuid, bigint, text, uuid[], jsonb'
  ),
  0::bigint,
  'obsolete draft RPC overload is absent'
);

select is(
  (
    select count(*)::bigint from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'save_attempt_draft'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, bigint, text, uuid[], jsonb, integer, uuid[]'
  ),
  1::bigint,
  'one telemetry-aware draft RPC exists'
);

select is(
  (
    select count(*)::bigint from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'decide_submission'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, uuid, bigint, review_decision, text, text, uuid'
  ),
  0::bigint,
  'unscored trainer decision RPC is absent'
);

select is(
  (
    select count(*)::bigint from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname = 'decide_submission'
      and pg_catalog.oidvectortypes(procedure_row.proargtypes) =
        'uuid, uuid, bigint, review_decision, text, jsonb, text, uuid'
  ),
  1::bigint,
  'one scored trainer decision RPC exists'
);

insert into public.submissions (
  id, organization_id, attempt_id, learner_id, cohort_id, task_id,
  state, latest_version_number
)
values (
  '01980a35-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980a34-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  '01980a30-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001',
  'submitted',
  1
);

insert into public.submission_versions (
  id, submission_id, version_number, idempotency_key, answer_text,
  selected_option_ids, evidence_refs, elapsed_seconds, hint_used,
  task_snapshot, submitted_by
)
values (
  '01980a36-0000-7000-8000-000000000001',
  '01980a35-0000-7000-8000-000000000001',
  1,
  'review-test-submission-0001',
  'A risk-based login test design.',
  array['01980a28-0000-7000-8000-000000000001'::uuid],
  '{}'::uuid[],
  300,
  true,
  '{"task_id":"01980a26-0000-7000-8000-000000000001","content_version_id":"01980a22-0000-7000-8000-000000000001"}',
  '01980a00-0000-7000-8000-000000000001'
);

update public.attempts
set state = 'submitted', submitted_at = statement_timestamp()
where id = '01980a34-0000-7000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$
    select * from public.decide_submission(
      '01980a35-0000-7000-8000-000000000001',
      '01980a36-0000-7000-8000-000000000001',
      1,
      'accepted',
      'An empty rubric decision is invalid.',
      '[]',
      'review-idempotency-missing-0001',
      '01980a37-0000-7000-8000-000000000001'
    )
  $$,
  '22023',
  'criterion scores must be a non-empty array of criterion UUIDs and numeric points',
  'an empty rubric decision is rejected'
);

select throws_ok(
  $$
    select * from public.decide_submission(
      '01980a35-0000-7000-8000-000000000001',
      '01980a36-0000-7000-8000-000000000001',
      1,
      'accepted',
      'Out-of-range score.',
      '[{"criterion_id":"01980a2c-0000-7000-8000-000000000001","points":11}]',
      'review-idempotency-range-00001',
      '01980a37-0000-7000-8000-000000000002'
    )
  $$,
  '22023',
  'criterion is outside the assigned rubric or points are out of range',
  'criterion score above its configured maximum is rejected'
);

select lives_ok(
  $$
    select * from public.decide_submission(
      '01980a35-0000-7000-8000-000000000001',
      '01980a36-0000-7000-8000-000000000001',
      1,
      'accepted',
      'Clear evidence and sound risk coverage.',
      '[{"criterion_id":"01980a2c-0000-7000-8000-000000000001","points":8,"comment":"Good coverage"}]',
      'review-idempotency-success-0001',
      '01980a37-0000-7000-8000-000000000003'
    )
  $$,
  'a complete rubric decision commits atomically'
);

reset role;

select is(
  (select state::text from public.submissions where id = '01980a35-0000-7000-8000-000000000001'),
  'accepted',
  'submission moves to accepted'
);

select is(
  (select count(*)::bigint from public.review_rubric_scores),
  1::bigint,
  'the exact criterion score is persisted'
);

select is(
  (select count(*)::bigint from public.evidence where evidence_kind = 'review'),
  1::bigint,
  'review evidence is appended'
);

select is(
  (select count(*)::bigint from public.mastery_events),
  1::bigint,
  'accepted skilled criterion appends one mastery event'
);

select is(
  (
    select mastery_basis_points
    from public.mastery_snapshots
    where learner_id = '01980a00-0000-7000-8000-000000000001'
      and skill_id = '01980a2a-0000-7000-8000-000000000001'
  ),
  8000,
  'mastery snapshot reflects the scored criterion'
);

select is(
  (select count(*)::bigint from public.outbox_events where event_type = 'review.decided.v2'),
  1::bigint,
  'review integration event is appended'
);

select lives_ok(
  $$
    select * from public.decide_submission(
      '01980a35-0000-7000-8000-000000000001',
      '01980a36-0000-7000-8000-000000000001',
      1,
      'accepted',
      'Clear evidence and sound risk coverage.',
      '[{"criterion_id":"01980a2c-0000-7000-8000-000000000001","points":8,"comment":"Good coverage"}]',
      'review-idempotency-success-0001',
      '01980a37-0000-7000-8000-000000000003'
    )
  $$,
  'an exact idempotent replay returns the existing decision'
);

select is(
  (select count(*)::bigint from public.reviews),
  1::bigint,
  'idempotent replay does not duplicate the review'
);

select throws_ok(
  $$
    select * from public.decide_submission(
      '01980a35-0000-7000-8000-000000000001',
      '01980a36-0000-7000-8000-000000000001',
      1,
      'accepted',
      'A stale competing trainer decision.',
      '[{"criterion_id":"01980a2c-0000-7000-8000-000000000001","points":7}]',
      'review-idempotency-stale-00001',
      '01980a37-0000-7000-8000-000000000004'
    )
  $$,
  '40001',
  'submission is stale or not reviewable',
  'a competing decision using the stale version is rejected'
);

select is(
  (select state::text from public.attempts where id = '01980a34-0000-7000-8000-000000000001'),
  'accepted',
  'attempt state follows the accepted submission'
);

select is(
  (select count(*)::bigint from public.notifications where event_type = 'review.decided'),
  1::bigint,
  'learner receives one deduplicated review notification'
);

select is(
  (select count(*)::bigint from public.audit_events where event_type = 'review.decided'),
  1::bigint,
  'review decision is audited once'
);

select is(
  (select count(*)::bigint from public.reviews),
  1::bigint,
  'failed and stale decisions leave no partial review rows'
);

select * from finish();
rollback;
