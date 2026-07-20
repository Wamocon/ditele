begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- BUG-078, BUG-080..BUG-090 and BUG-092 structural contracts.
select ok(
  (
    select attribute_record.attnotnull
    from pg_catalog.pg_attribute attribute_record
    where attribute_record.attrelid = 'public.attempts'::pg_catalog.regclass
      and attribute_record.attname = 'course_id'
      and not attribute_record.attisdropped
  )
  and (
    select attribute_record.attnotnull
    from pg_catalog.pg_attribute attribute_record
    where attribute_record.attrelid = 'public.attempts'::pg_catalog.regclass
      and attribute_record.attname = 'content_version_id'
      and not attribute_record.attisdropped
  ),
  'attempts persist a non-null exact course and publication identity'
);

select ok(
  (
    select pg_catalog.bool_and(attribute_record.attnotnull)
    from pg_catalog.pg_attribute attribute_record
    where attribute_record.attrelid =
        'public.submissions'::pg_catalog.regclass
      and attribute_record.attname in (
        'enrollment_id', 'course_id', 'content_version_id'
      )
      and not attribute_record.attisdropped
  ),
  'submissions persist the same non-null delivery identity as their attempt'
);

select ok(
  (
    select count(*) = 4
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conname in (
      'attempts_enrollment_context_fk',
      'attempts_cohort_publication_fk',
      'attempts_task_publication_fk',
      'submissions_attempt_context_fk'
    )
      and constraint_record.contype = 'f'
      and constraint_record.convalidated
  ),
  'all four exact delivery foreign keys are installed and validated'
);

select has_table(
  'public',
  'submission_version_evidence',
  'submission evidence is normalized into immutable version facts'
);
select has_table(
  'public',
  'submission_version_hint_usage',
  'hint use is normalized into immutable version facts'
);
select has_table(
  'public',
  'attempt_command_receipts',
  'attempt workflow retries have a durable private receipt ledger'
);

select ok(
  (
    select table_record.relrowsecurity and table_record.relforcerowsecurity
    from pg_catalog.pg_class table_record
    where table_record.oid =
      'public.attempt_command_receipts'::pg_catalog.regclass
  )
  and not has_table_privilege(
    'authenticated', 'public.attempt_command_receipts', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.attempt_command_receipts', 'INSERT'
  )
  and not has_table_privilege(
    'service_role', 'public.attempt_command_receipts', 'SELECT'
  ),
  'receipt rows are force-RLS protected and unavailable to every API role'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_external_task_evidence(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.create_external_task_evidence(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_table_privilege(
    'authenticated', 'public.evidence', 'INSERT'
  )
  and not has_table_privilege(
    'authenticated', 'public.evidence', 'UPDATE'
  )
  and not has_table_privilege(
    'authenticated', 'public.evidence', 'DELETE'
  ),
  'external evidence is created only through the actor-derived RPC'
);

select ok(
  (
    select procedure_record.prosecdef
      and procedure_record.provolatile = 'v'
      and procedure_record.proconfig = array['search_path=""']::text[]
      and owner_record.rolname = 'postgres'
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_catalog.pg_roles owner_record
      on owner_record.oid = procedure_record.proowner
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'create_external_task_evidence'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'uuid, text, text, text, text'
  ),
  'evidence creation is a postgres-owned volatile security-definer with an empty search path'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.save_attempt_draft(uuid,bigint,text,uuid[],jsonb,integer,uuid[])'::pg_catalog.regprocedure
  ) ~ '(?s)select attempt\.\*.*from public\.attempts attempt.*for update;.*current_actor_exact_attempt_context'
  and pg_catalog.pg_get_functiondef(
    'public.submit_attempt(uuid,bigint,text,text,uuid[],uuid[],uuid)'::pg_catalog.regprocedure
  ) ~ '(?s)select attempt\.\*.*from public\.attempts attempt.*for update;.*select submission\.\*.*from public\.submissions submission.*for update;'
  and pg_catalog.pg_get_functiondef(
    'public.decide_submission(uuid,uuid,bigint,public.review_decision,text,jsonb,text,uuid)'::pg_catalog.regprocedure
  ) ~ '(?s)select attempt\.\*.*from public\.attempts attempt.*for update;.*select submission\.\*.*from public\.submissions submission.*for update of submission;'
  and pg_catalog.pg_get_functiondef(
    'public.create_external_task_evidence(uuid,text,text,text,text)'::pg_catalog.regprocedure
  ) like '%pg_advisory_xact_lock%attempt-receipt:%',
  'draft, evidence, submit and review commands share attempt-first serialization and receipt locks'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'app_private.get_my_learning_task_without_requirements(uuid)'::pg_catalog.regprocedure
  ) like '%''abandoned''%'
  and pg_catalog.pg_get_functiondef(
    'public.get_my_learning_task(uuid)'::pg_catalog.regprocedure
  ) like '%''abandoned''%',
  'abandoned attempts retain a safe read-only task projection'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.list_my_learning_history(text,timestamptz,timestamptz,text,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.list_my_learning_history(text,timestamptz,timestamptz,text,integer)',
    'EXECUTE'
  ),
  'history is an authenticated actor-derived projection'
);

-- A trainer cannot inspect an unsent learner draft or attempt telemetry.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select count(*)::bigint
    from public.attempt_drafts draft_record
    where draft_record.attempt_id =
      '01980a34-0000-7000-8000-000000000001'
  ),
  0::bigint,
  'trainer RLS hides an unsent learner draft'
);

select is(
  (
    select count(*)::bigint
    from public.attempts attempt_record
    where attempt_record.id =
      '01980a34-0000-7000-8000-000000000001'
  ),
  0::bigint,
  'trainer RLS hides an attempt before an immutable submission exists'
);

-- Exact-context start retries converge on the deterministic seeded attempt.
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select is(
  (
    select start_result.replayed
    from public.start_attempt(
      '01980a33-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      'attempt-hardening-start-0001',
      '01981053-0000-7000-8000-000000000001'
    ) start_result
  ),
  false,
  'first exact start command records a non-replayed result'
);

select is(
  (
    select start_result.attempt_id
    from public.start_attempt(
      '01980a33-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      'attempt-hardening-start-0001',
      '01981053-0000-7000-8000-000000000001'
    ) start_result
    where start_result.replayed
  ),
  '01980a34-0000-7000-8000-000000000001'::uuid,
  'exact start replay returns the same attempt and marks the response replayed'
);

-- External evidence is validated, exact-context bound, payload-idempotent and
-- denied before receipt disclosure when the principal is revoked.
select set_config(
  'ditele_test.evidence_id',
  (
    select (public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Login risk analysis',
      'https://evidence.example.test/login-risk-analysis',
      repeat('a', 64),
      'attempt-evidence-create-0001'
    )).id::text
  ),
  true
);

select ok(
  exists (
    select 1
    from public.evidence evidence_record
    where evidence_record.id =
        current_setting('ditele_test.evidence_id')::uuid
      and evidence_record.organization_id =
        '01980a10-0000-7000-8000-000000000001'
      and evidence_record.owner_id =
        '01980a00-0000-7000-8000-000000000001'
      and evidence_record.task_id =
        '01980a26-0000-7000-8000-000000000001'
      and evidence_record.evidence_kind = 'external'
      and evidence_record.sha256_hex = repeat('a', 64)
      and evidence_record.metadata ->> 'attempt_id' =
        '01980a34-0000-7000-8000-000000000001'
  ),
  'evidence RPC derives tenant, owner, task and attempt provenance from the actor context'
);

select is(
  (public.create_external_task_evidence(
    '01980a34-0000-7000-8000-000000000001',
    'Login risk analysis',
    'https://evidence.example.test/login-risk-analysis',
    repeat('a', 64),
    'attempt-evidence-create-0001'
  )).id,
  current_setting('ditele_test.evidence_id')::uuid,
  'exact evidence retry replays the same immutable evidence row'
);

select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Changed title',
      'https://evidence.example.test/login-risk-analysis',
      repeat('a', 64),
      'attempt-evidence-create-0001'
    )
  $$,
  '23505',
  'external evidence idempotency conflict',
  'evidence idempotency keys are payload-bound'
);

select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Insecure source',
      'http://evidence.example.test/not-https',
      repeat('b', 64),
      'attempt-evidence-create-0002'
    )
  $$,
  '22023',
  'invalid external evidence payload',
  'non-HTTPS evidence sources are rejected before persistence'
);

reset role;
update public.cohort_memberships membership_record
set state = 'suspended'
where membership_record.id = '01980a31-0000-7000-8000-000000000001';

set local role authenticated;
select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Login risk analysis',
      'https://evidence.example.test/login-risk-analysis',
      repeat('a', 64),
      'attempt-evidence-create-0001'
    )
  $$,
  '42501',
  'attempt unavailable',
  'revoked learner context is checked before an existing receipt is disclosed'
);

reset role;
update public.cohort_memberships membership_record
set state = 'active'
where membership_record.id = '01980a31-0000-7000-8000-000000000001';

-- Build an exact second-tenant attempt owned by another principal. The
-- original learner receives the same generic denial as for an unknown ID.
insert into public.organizations (id, slug, name, state)
values (
  '01981010-0000-7000-8000-000000000001',
  'attempt-hardening-tenant',
  'Attempt hardening tenant',
  'active'
);
insert into public.organization_memberships (
  id, organization_id, user_id, state, joined_at
) values (
  '01981011-0000-7000-8000-000000000001',
  '01981010-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000004',
  'active', statement_timestamp()
);
insert into public.user_roles (
  id, user_id, role_id, organization_id, reason
)
select
  '01981012-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000004',
  role_record.id,
  '01981010-0000-7000-8000-000000000001',
  'Cross-tenant learner isolation fixture'
from public.roles role_record
where role_record.code = 'learner';
insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, starts_at, created_by
) values (
  '01981030-0000-7000-8000-000000000001',
  '01981010-0000-7000-8000-000000000001',
  '01980a20-0000-7000-8000-000000000001',
  '01980a22-0000-7000-8000-000000000001',
  'Cross-tenant active cohort', 'active', 'flexible',
  statement_timestamp() - interval '1 day',
  '01980a00-0000-7000-8000-000000000003'
);
insert into public.cohort_memberships (
  id, cohort_id, user_id, role, state, assigned_by
) values (
  '01981031-0000-7000-8000-000000000001',
  '01981030-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000004',
  'learner', 'active',
  '01980a00-0000-7000-8000-000000000003'
);
insert into public.enrollments (
  id, organization_id, learner_id, course_id, cohort_id, state,
  idempotency_key, decided_by, decided_at
) values (
  '01981033-0000-7000-8000-000000000001',
  '01981010-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000004',
  '01980a20-0000-7000-8000-000000000001',
  '01981030-0000-7000-8000-000000000001',
  'assigned', 'attempt-cross-tenant-enrollment-0001',
  '01980a00-0000-7000-8000-000000000003', statement_timestamp()
);
insert into public.attempts (
  id, organization_id, enrollment_id, learner_id, cohort_id, task_id, state
) values (
  '01981034-0000-7000-8000-000000000001',
  '01981010-0000-7000-8000-000000000001',
  '01981033-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000004',
  '01981030-0000-7000-8000-000000000001',
  '01980a26-0000-7000-8000-000000000001',
  'in_progress'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);
select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01981034-0000-7000-8000-000000000001',
      'Cross-tenant attempt',
      'https://evidence.example.test/cross-tenant',
      repeat('c', 64),
      'attempt-evidence-create-0003'
    )
  $$,
  '42501',
  'attempt unavailable',
  'cross-tenant attempt evidence creation fails without revealing ownership'
);

select throws_ok(
  $$
    insert into public.evidence (
      organization_id, owner_id, task_id, evidence_kind, title,
      source_uri, sha256_hex
    ) values (
      '01980a10-0000-7000-8000-000000000001',
      '01980a00-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      'external', 'Bypass attempt',
      'https://evidence.example.test/bypass', repeat('d', 64)
    )
  $$,
  '42501',
  'permission denied for table evidence',
  'authenticated callers cannot bypass the evidence RPC with raw INSERT'
);

-- Flexible first submission requires current entitlement. Revision remains
-- available after entitlement and schedule loss, preserving a correction path.
reset role;
update public.cohorts cohort_record
set progression_mode = 'flexible'
where cohort_record.id = '01980a30-0000-7000-8000-000000000001';
delete from public.task_schedules schedule_record
where schedule_record.cohort_id = '01980a30-0000-7000-8000-000000000001'
  and schedule_record.task_id = '01980a26-0000-7000-8000-000000000001';

set local role authenticated;
select lives_ok(
  $$
    select * from public.save_attempt_draft(
      '01980a34-0000-7000-8000-000000000001',
      1,
      'First evidence-backed submission',
      array['01980a28-0000-7000-8000-000000000001'::uuid],
      '[]'::jsonb,
      180,
      '{}'::uuid[]
    )
  $$,
  'valid exact draft save succeeds before first submission'
);

reset role;
delete from public.entitlements entitlement_record
where entitlement_record.id = '01980a41-0000-7000-8000-000000000001';
select set_config(
  'ditele_test.first_submit_expected_version',
  (
    select attempt_record.row_version::text
    from public.attempts attempt_record
    where attempt_record.id = '01980a34-0000-7000-8000-000000000001'
  ),
  true
);

set local role authenticated;
select throws_ok(
  format(
    $submit$
      select public.submit_attempt(
        '01980a34-0000-7000-8000-000000000001',
        %s,
        'attempt-first-submit-0001',
        'First evidence-backed submission',
        array['01980a28-0000-7000-8000-000000000001'::uuid],
        array['%s'::uuid],
        '01981053-0000-7000-8000-000000000002'
      )
    $submit$,
    current_setting('ditele_test.first_submit_expected_version'),
    current_setting('ditele_test.evidence_id')
  ),
  '42501',
  'task is not currently available',
  'first flexible submission is denied after learning entitlement loss'
);

reset role;
insert into public.entitlements (
  id, organization_id, user_id, product_package_id, capability, source
) values (
  '01980a41-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  '01980a40-0000-7000-8000-000000000001',
  'learning', 'manual'
);

set local role authenticated;
select set_config(
  'ditele_test.submission_id',
  (
    select (public.submit_attempt(
      '01980a34-0000-7000-8000-000000000001',
      current_setting('ditele_test.first_submit_expected_version')::bigint,
      'attempt-first-submit-0001',
      'First evidence-backed submission',
      array['01980a28-0000-7000-8000-000000000001'::uuid],
      array[current_setting('ditele_test.evidence_id')::uuid],
      '01981053-0000-7000-8000-000000000002'
    )).id::text
  ),
  true
);

select is(
  (public.submit_attempt(
    '01980a34-0000-7000-8000-000000000001',
    current_setting('ditele_test.first_submit_expected_version')::bigint,
    'attempt-first-submit-0001',
    'First evidence-backed submission',
    array['01980a28-0000-7000-8000-000000000001'::uuid],
    array[current_setting('ditele_test.evidence_id')::uuid],
    '01981053-0000-7000-8000-000000000002'
  )).id,
  current_setting('ditele_test.submission_id')::uuid,
  'lost-response retry returns the exact first submission receipt result'
);

select throws_ok(
  format(
    $submit$
      select public.submit_attempt(
        '01980a34-0000-7000-8000-000000000001',
        %s,
        'attempt-first-submit-0001',
        'Changed payload',
        array['01980a28-0000-7000-8000-000000000001'::uuid],
        array['%s'::uuid],
        '01981053-0000-7000-8000-000000000002'
      )
    $submit$,
    current_setting('ditele_test.first_submit_expected_version'),
    current_setting('ditele_test.evidence_id')
  ),
  '23505',
  'submission idempotency conflict',
  'submission receipt rejects the same key with a changed payload'
);

select throws_ok(
  $$
    select public.submit_attempt(
      '01980a34-0000-7000-8000-000000000001',
      1,
      'attempt-first-submit-0002',
      'Stale terminal replay',
      array['01980a28-0000-7000-8000-000000000001'::uuid],
      array[current_setting('ditele_test.evidence_id')::uuid],
      '01981053-0000-7000-8000-000000000003'
    )
  $$,
  '40001',
  'attempt is stale or not submittable',
  'a new key cannot resubmit a terminal first-submission state'
);

select is(
  (
    select count(*)::bigint
    from public.attempt_drafts draft_record
    where draft_record.attempt_id =
      '01980a34-0000-7000-8000-000000000001'
  ),
  0::bigint,
  'successful submit atomically removes the mutable draft'
);
select is(
  (
    select count(*)::bigint
    from public.submission_version_evidence link_record
    where link_record.submission_id =
      current_setting('ditele_test.submission_id')::uuid
  ),
  1::bigint,
  'first submission has one normalized immutable evidence link'
);
select is(
  (
    select count(*)::bigint
    from public.submission_version_hint_usage usage_record
    where usage_record.submission_id =
      current_setting('ditele_test.submission_id')::uuid
  ),
  0::bigint,
  'first submission snapshot excludes hints that were not yet used'
);

-- Trainer requests revision. Direct state changes are used only inside this
-- rollback-only test to isolate the learner resubmission contract.
reset role;
update public.submissions submission_record
set state = 'revision_required'
where submission_record.id = current_setting('ditele_test.submission_id')::uuid;
update public.attempts attempt_record
set state = 'revision_required'
where attempt_record.id = '01980a34-0000-7000-8000-000000000001';
delete from public.entitlements entitlement_record
where entitlement_record.id = '01980a41-0000-7000-8000-000000000001';

set local role authenticated;
select lives_ok(
  $$
    select * from public.save_attempt_draft(
      '01980a34-0000-7000-8000-000000000001',
      0,
      'Revised after trainer feedback',
      array['01980a28-0000-7000-8000-000000000001'::uuid],
      '[]'::jsonb,
      300,
      array['01980a29-0000-7000-8000-000000000001'::uuid]
    )
  $$,
  'revision draft remains editable after entitlement and schedule loss'
);

reset role;
select set_config(
  'ditele_test.revision_expected_version',
  (
    select attempt_record.row_version::text
    from public.attempts attempt_record
    where attempt_record.id = '01980a34-0000-7000-8000-000000000001'
  ),
  true
);

set local role authenticated;
select is(
  (public.submit_attempt(
    '01980a34-0000-7000-8000-000000000001',
    current_setting('ditele_test.revision_expected_version')::bigint,
    'attempt-revision-submit-0001',
    'Revised after trainer feedback',
    array['01980a28-0000-7000-8000-000000000001'::uuid],
    array[current_setting('ditele_test.evidence_id')::uuid],
    '01981053-0000-7000-8000-000000000004'
  )).state,
  'resubmitted'::public.submission_state,
  'revision resubmission succeeds without a current first-access entitlement'
);

select is(
  (
    select count(*)::bigint
    from public.submission_versions version_record
    where version_record.submission_id =
      current_setting('ditele_test.submission_id')::uuid
  ),
  2::bigint,
  'resubmission appends a second immutable version'
);
select is(
  (
    select count(*)::bigint
    from public.submission_version_evidence link_record
    where link_record.submission_id =
      current_setting('ditele_test.submission_id')::uuid
  ),
  2::bigint,
  'each immutable version owns its exact evidence link snapshot'
);
select is(
  (
    select count(*)::bigint
    from public.submission_version_hint_usage usage_record
    join public.submission_versions version_record
      on version_record.id = usage_record.submission_version_id
    where usage_record.submission_id =
        current_setting('ditele_test.submission_id')::uuid
      and version_record.version_number = 2
      and usage_record.hint_id =
        '01980a29-0000-7000-8000-000000000001'
  ),
  1::bigint,
  'second version snapshots the hint first used during revision'
);

reset role;
select throws_ok(
  format(
    $update$
      update public.evidence
      set title = 'Mutated provenance'
      where id = '%s'::uuid
    $update$,
    current_setting('ditele_test.evidence_id')
  ),
  '55000',
  'evidence is append-only',
  'evidence provenance cannot be rewritten after submission'
);

-- Abandoned is visible and read-only, never another editable draft.
update public.submissions submission_record
set state = 'revision_required'
where submission_record.id = current_setting('ditele_test.submission_id')::uuid;
update public.attempts attempt_record
set state = 'revision_required'
where attempt_record.id = '01980a34-0000-7000-8000-000000000001';
update public.attempts attempt_record
set state = 'abandoned'
where attempt_record.id = '01980a34-0000-7000-8000-000000000001';

set local role authenticated;
select ok(
  public.get_my_learning_task(
    '01980a26-0000-7000-8000-000000000001'
  ) is not null,
  'abandoned task content remains available for a read-only terminal view'
);

reset role;
select is(
  app_private.learner_course_activity_state(
    '01980a33-0000-7000-8000-000000000001',
    'assigned',
    '01980a10-0000-7000-8000-000000000001',
    '01980a30-0000-7000-8000-000000000001',
    'flexible',
    '01980a26-0000-7000-8000-000000000001'
  ),
  'locked'::text,
  'course activity projection never maps abandoned back to available'
);

select throws_ok(
  $$
    insert into public.attempt_drafts (
      attempt_id, answer_text, selected_option_ids
    ) values (
      '01980a34-0000-7000-8000-000000000001',
      'Terminal draft bypass', '{}'::uuid[]
    )
  $$,
  '55000',
  'draft requires an editable attempt',
  'database trigger rejects a draft for an abandoned attempt'
);

set local role authenticated;
select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Terminal evidence',
      'https://evidence.example.test/terminal',
      repeat('e', 64),
      'attempt-evidence-create-0004'
    )
  $$,
  '42501',
  'attempt unavailable',
  'abandoned attempts cannot create new evidence'
);

reset role;
insert into public.entitlements (
  id, organization_id, user_id, product_package_id, capability, source
) values (
  '01980a41-0000-7000-8000-000000000001',
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  '01980a40-0000-7000-8000-000000000001',
  'learning', 'manual'
);

set local role authenticated;
select throws_ok(
  $$
    select * from public.start_attempt(
      '01980a33-0000-7000-8000-000000000001',
      '01980a26-0000-7000-8000-000000000001',
      'attempt-hardening-restart-0001',
      '01981053-0000-7000-8000-000000000005'
    )
  $$,
  '55000',
  'attempt restart is not available',
  'abandoned attempt cannot silently become a new editable sequence'
);

-- Use the audited lifecycle boundary to cancel the cohort and its assigned
-- enrollment. Historical attribution must remain reachable without reviving
-- an active workspace.
reset role;
select set_config(
  'ditele_test.cohort_expected_version',
  (
    select cohort_record.row_version::text
    from public.cohorts cohort_record
    where cohort_record.id = '01980a30-0000-7000-8000-000000000001'
  ),
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);
select lives_ok(
  format(
    $cancel$
      select public.transition_cohort(
        '01980a30-0000-7000-8000-000000000001',
        %s,
        'cancelled',
        'Verify cancelled cohort learner history remains reachable',
        '01981053-0000-7000-8000-000000000006',
        'attempt-history-cancel-0001'
      )
    $cancel$,
    current_setting('ditele_test.cohort_expected_version')
  ),
  'audited cohort cancellation succeeds for the seeded admin'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);
select ok(
  exists (
    select 1
    from public.list_my_learning_history(
      'en', statement_timestamp(), null, null, 100
    ) history_record
    where history_record.event_kind = 'course_cancelled'
      and history_record.course_id =
        '01980a20-0000-7000-8000-000000000001'
      and history_record.cohort_id =
        '01980a30-0000-7000-8000-000000000001'
      and history_record.course_title = 'Practical Software Testing'
  ),
  'cancelled cohort remains in localized learner history with exact publication attribution'
);

select is(
  public.get_my_learning_task(
    '01980a26-0000-7000-8000-000000000001'
  ),
  null::jsonb,
  'cancelled cohort history does not reappear as an active task workspace'
);

select throws_ok(
  $$
    select * from public.list_my_learning_history(
      'en', statement_timestamp(), null, null, 0
    )
  $$,
  '22023',
  'invalid learner history cursor',
  'history rejects unbounded or invalid pagination input'
);

select set_config(
  'ditele_test.history_snapshot', statement_timestamp()::text, true
);
create temporary table attempt_history_page_one on commit drop as
select history_record.*
from public.list_my_learning_history(
  'en',
  current_setting('ditele_test.history_snapshot')::timestamptz,
  null,
  null,
  1
) history_record;

create temporary table attempt_history_page_two on commit drop as
select history_record.*
from public.list_my_learning_history(
  'en',
  current_setting('ditele_test.history_snapshot')::timestamptz,
  (select first_page.occurred_at from attempt_history_page_one first_page),
  (select first_page.event_id from attempt_history_page_one first_page),
  1
) history_record;

select is(
  (select count(*)::bigint from attempt_history_page_one),
  1::bigint,
  'history first keyset page is bounded to one row'
);
select is(
  (select count(*)::bigint from attempt_history_page_two),
  1::bigint,
  'history cursor returns the next stable row for the same snapshot'
);
select ok(
  not exists (
    select 1
    from attempt_history_page_one first_page
    join attempt_history_page_two second_page
      on second_page.event_id = first_page.event_id
  )
  and (
    select (second_page.occurred_at, second_page.event_id) <
      (first_page.occurred_at, first_page.event_id)
    from attempt_history_page_one first_page
    cross join attempt_history_page_two second_page
  ),
  'history keyset cursor neither duplicates nor reorders the prior boundary row'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);
select throws_ok(
  $$
    select * from public.list_my_learning_history(
      'en', statement_timestamp(), null, null, 20
    )
  $$,
  '42501',
  'learner history requires one active tenant scope',
  'trainer without a learner assignment cannot access learner history'
);

-- Adding a second active learner tenant makes the implicit-tenant history
-- contract ambiguous and therefore fail closed.
reset role;
insert into public.organization_memberships (
  id, organization_id, user_id, state, joined_at
) values (
  '01981011-0000-7000-8000-000000000002',
  '01981010-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000001',
  'active', statement_timestamp()
);
insert into public.user_roles (
  id, user_id, role_id, organization_id, reason
)
select
  '01981012-0000-7000-8000-000000000002',
  '01980a00-0000-7000-8000-000000000001',
  role_record.id,
  '01981010-0000-7000-8000-000000000001',
  'Ambiguous learner history tenant fixture'
from public.roles role_record
where role_record.code = 'learner';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);
select throws_ok(
  $$
    select * from public.list_my_learning_history(
      'en', statement_timestamp(), null, null, 20
    )
  $$,
  '42501',
  'learner history requires one active tenant scope',
  'implicit history tenant selection fails closed across two active learner tenants'
);

select throws_ok(
  $$ select count(*) from public.attempt_command_receipts $$,
  '42501',
  'permission denied for table attempt_command_receipts',
  'authenticated callers cannot inspect idempotency receipt internals'
);

select * from finish();
rollback;
