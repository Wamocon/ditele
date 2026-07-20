begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(20);

select has_table(
  'public',
  'enrollment_request_receipts',
  'enrollment requests have a durable replay receipt ledger'
);

select ok(
  (
    select count(*) = 2
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid =
        'public.enrollment_request_receipts'::pg_catalog.regclass
      and constraint_record.conname in (
        'enrollment_request_receipts_actor_key_unique',
        'enrollment_request_receipts_result_context_fk'
      )
      and constraint_record.convalidated
  )
  and (
    select table_record.relrowsecurity and table_record.relforcerowsecurity
    from pg_catalog.pg_class table_record
    where table_record.oid =
      'public.enrollment_request_receipts'::pg_catalog.regclass
  )
  and not has_table_privilege(
    'authenticated', 'public.enrollment_request_receipts', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.enrollment_request_receipts', 'INSERT'
  )
  and not has_table_privilege(
    'service_role', 'public.enrollment_request_receipts', 'SELECT'
  )
  and exists (
    select 1
    from pg_catalog.pg_trigger trigger_record
    where trigger_record.tgrelid =
        'public.enrollment_request_receipts'::pg_catalog.regclass
      and trigger_record.tgname = 'enrollment_request_receipts_immutable'
      and not trigger_record.tgisinternal
      and trigger_record.tgenabled = 'O'
  ),
  'receipts are exact-context constrained, immutable, force-RLS private records'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'request_enrollment'
      and (
        pg_catalog.oidvectortypes(procedure_record.proargtypes),
        procedure_record.pronargdefaults
      ) in (
        ('uuid, uuid, text, text', 1),
        ('uuid, text, text', 1)
      )
      and pg_catalog.pg_get_function_result(procedure_record.oid) =
        'enrollments'
  ),
  2::bigint,
  'the authoritative and actor-derived enrollment signatures remain unchanged'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_catalog.pg_roles owner_record
      on owner_record.oid = procedure_record.proowner
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'request_enrollment'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) in (
        'uuid, uuid, text, text', 'uuid, text, text'
      )
      and procedure_record.provolatile = 'v'
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
      and owner_record.rolname = 'postgres'
  ),
  2::bigint,
  'both overloads are postgres-owned volatile security-definers with empty search paths'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.request_enrollment(uuid,uuid,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.request_enrollment(uuid,uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.request_enrollment(uuid,uuid,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.request_enrollment(uuid,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.request_enrollment(uuid,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.request_enrollment(uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated and service roles retain both RPCs while anonymous stays denied'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.request_enrollment(uuid,uuid,text,text)'::pg_catalog.regprocedure
  ) like '%normalized_request_note%'
  and pg_catalog.pg_get_functiondef(
    'public.request_enrollment(uuid,uuid,text,text)'::pg_catalog.regprocedure
  ) like '%pg_advisory_xact_lock%enrollment-request:%'
  and pg_catalog.pg_get_functiondef(
    'public.request_enrollment(uuid,uuid,text,text)'::pg_catalog.regprocedure
  ) like '%public.enrollment_request_receipts%'
  and pg_catalog.pg_get_functiondef(
    'public.request_enrollment(uuid,uuid,text,text)'::pg_catalog.regprocedure
  ) like '%enrollment idempotency conflict%'
  and pg_catalog.pg_get_functiondef(
    'public.request_enrollment(uuid,uuid,text,text)'::pg_catalog.regprocedure
  ) like '%when unique_violation then%'
  and pg_catalog.pg_get_functiondef(
    'public.request_enrollment(uuid,text,text)'::pg_catalog.regprocedure
  ) like '%return public.request_enrollment(%derived_organization_id%p_course_id%p_idempotency_key%p_request_note%'
  ,
  'the wrapper delegates to canonical receipt binding with serialized race recovery'
);

-- Existing enrollment rows predate the receipt table. Their original key is
-- validated and lazily bound on the first post-migration retry.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '01980a00-0000-7000-8000-000000000001',
  true
);
select set_config(
  'ditele_test.legacy_enrollment_id',
  (
    select (public.request_enrollment(
      '01980a10-0000-7000-8000-000000000001',
      '01980a20-0000-7000-8000-000000000001',
      'seed-enrollment-00000001',
      null
    )).id::text
  ),
  true
);
reset role;
select ok(
  current_setting('ditele_test.legacy_enrollment_id')::uuid =
    '01980a33-0000-7000-8000-000000000001'::uuid
  and exists (
    select 1
    from public.enrollment_request_receipts receipt_record
    where receipt_record.actor_id =
        '01980a00-0000-7000-8000-000000000001'
      and receipt_record.organization_id =
        '01980a10-0000-7000-8000-000000000001'
      and receipt_record.course_id =
        '01980a20-0000-7000-8000-000000000001'
      and receipt_record.enrollment_id =
        '01980a33-0000-7000-8000-000000000001'
      and receipt_record.idempotency_key = 'seed-enrollment-00000001'
      and receipt_record.request_note is null
  ),
  'a legitimate legacy retry returns and binds the original enrollment context'
);

insert into public.organizations (id, slug, name, state)
values
  (
    '01981210-0000-7000-8000-000000000001',
    'enrollment-binding-one', 'Enrollment Binding One', 'active'
  ),
  (
    '01981210-0000-7000-8000-000000000002',
    'enrollment-binding-two', 'Enrollment Binding Two', 'active'
  );

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values (
  '00000000-0000-0000-0000-000000000000',
  '01981200-0000-7000-8000-000000000001',
  'authenticated', 'authenticated',
  'enrollment-binding@test.invalid',
  extensions.crypt('Enrollment-Binding-Test!', extensions.gen_salt('bf')),
  statement_timestamp(),
  '{"provider":"email","providers":["email"],"seed_fixture":"true"}',
  '{"display_name":"Enrollment Binding Learner","locale":"en"}',
  statement_timestamp(), statement_timestamp(), '', '', '', ''
);

insert into public.organization_memberships (
  id, organization_id, user_id, state, joined_at
)
values
  (
    '01981211-0000-7000-8000-000000000001',
    '01981210-0000-7000-8000-000000000001',
    '01981200-0000-7000-8000-000000000001',
    'active', statement_timestamp()
  ),
  (
    '01981211-0000-7000-8000-000000000002',
    '01981210-0000-7000-8000-000000000002',
    '01981200-0000-7000-8000-000000000001',
    'active', statement_timestamp()
  );

insert into public.courses (
  id, slug, state, default_locale, estimated_minutes, created_by
)
values
  (
    '01981220-0000-7000-8000-000000000001',
    'enrollment-binding-course-one', 'active', 'en', 30,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981220-0000-7000-8000-000000000002',
    'enrollment-binding-course-two', 'active', 'en', 30,
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.entitlements (
  id, organization_id, user_id, product_package_id, capability, source
)
values
  (
    '01981241-0000-7000-8000-000000000001',
    '01981210-0000-7000-8000-000000000001',
    '01981200-0000-7000-8000-000000000001',
    '01980a40-0000-7000-8000-000000000001',
    'learning', 'manual'
  ),
  (
    '01981241-0000-7000-8000-000000000002',
    '01981210-0000-7000-8000-000000000002',
    '01981200-0000-7000-8000-000000000001',
    '01980a40-0000-7000-8000-000000000001',
    'learning', 'manual'
  );

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '01981200-0000-7000-8000-000000000001',
  true
);

select set_config(
  'ditele_test.bound_enrollment_id',
  (
    select (public.request_enrollment(
      '01981210-0000-7000-8000-000000000001',
      '01981220-0000-7000-8000-000000000001',
      'enrollment-binding-key-0001',
      '  Need cohort support.  '
    )).id::text
  ),
  true
);

reset role;
select ok(
  exists (
    select 1
    from public.enrollments enrollment_record
    where enrollment_record.id =
        current_setting('ditele_test.bound_enrollment_id')::uuid
      and enrollment_record.organization_id =
        '01981210-0000-7000-8000-000000000001'
      and enrollment_record.learner_id =
        '01981200-0000-7000-8000-000000000001'
      and enrollment_record.course_id =
        '01981220-0000-7000-8000-000000000001'
      and enrollment_record.request_note = 'Need cohort support.'
      and enrollment_record.idempotency_key =
        'enrollment-binding-key-0001'
  )
  and exists (
    select 1
    from public.enrollment_request_receipts receipt_record
    where receipt_record.actor_id =
        '01981200-0000-7000-8000-000000000001'
      and receipt_record.organization_id =
        '01981210-0000-7000-8000-000000000001'
      and receipt_record.course_id =
        '01981220-0000-7000-8000-000000000001'
      and receipt_record.enrollment_id =
        current_setting('ditele_test.bound_enrollment_id')::uuid
      and receipt_record.idempotency_key =
        'enrollment-binding-key-0001'
      and receipt_record.request_note = 'Need cohort support.'
  )
  and (
    select count(*) = 1
    from public.audit_events audit_record
    where audit_record.actor_id =
        '01981200-0000-7000-8000-000000000001'
      and audit_record.event_type = 'enrollment.requested'
      and audit_record.aggregate_id =
        current_setting('ditele_test.bound_enrollment_id')::uuid
  ),
  'the first request stores one canonical enrollment, receipt, and audit event'
);

set local role authenticated;
select is(
  (public.request_enrollment(
    '01981210-0000-7000-8000-000000000001',
    '01981220-0000-7000-8000-000000000001',
    'enrollment-binding-key-0001',
    'Need cohort support.'
  )).id,
  current_setting('ditele_test.bound_enrollment_id')::uuid,
  'an exact canonical retry returns the original enrollment identity'
);

reset role;
select ok(
  (
    select count(*) = 1
    from public.enrollments enrollment_record
    where enrollment_record.learner_id =
      '01981200-0000-7000-8000-000000000001'
  )
  and (
    select count(*) = 1
    from public.enrollment_request_receipts receipt_record
    where receipt_record.actor_id =
      '01981200-0000-7000-8000-000000000001'
  )
  and (
    select count(*) = 1
    from public.audit_events audit_record
    where audit_record.actor_id =
        '01981200-0000-7000-8000-000000000001'
      and audit_record.event_type = 'enrollment.requested'
  ),
  'the exact retry has no duplicate enrollment, receipt, or audit side effect'
);

set local role authenticated;
select throws_ok(
  $$
    select public.request_enrollment(
      '01981210-0000-7000-8000-000000000001',
      '01981220-0000-7000-8000-000000000001',
      'enrollment-binding-key-0001',
      'Need a different schedule.'
    )
  $$,
  '23505',
  'enrollment idempotency conflict',
  'the same key cannot be rebound to a changed normalized request note'
);

select throws_ok(
  $$
    select public.request_enrollment(
      '01981210-0000-7000-8000-000000000001',
      '01981220-0000-7000-8000-000000000002',
      'enrollment-binding-key-0001',
      'Need cohort support.'
    )
  $$,
  '23505',
  'enrollment idempotency conflict',
  'the same key cannot be rebound to another course'
);

select throws_ok(
  $$
    select public.request_enrollment(
      '01981210-0000-7000-8000-000000000002',
      '01981220-0000-7000-8000-000000000001',
      'enrollment-binding-key-0001',
      'Need cohort support.'
    )
  $$,
  '23505',
  'enrollment idempotency conflict',
  'the same key cannot be rebound to another organization context'
);

reset role;
select ok(
  (
    select count(*) = 1
    from public.enrollments enrollment_record
    where enrollment_record.learner_id =
      '01981200-0000-7000-8000-000000000001'
  )
  and (
    select count(*) = 1
    from public.enrollment_request_receipts receipt_record
    where receipt_record.actor_id =
      '01981200-0000-7000-8000-000000000001'
  )
  and (
    select count(*) = 1
    from public.audit_events audit_record
    where audit_record.actor_id =
        '01981200-0000-7000-8000-000000000001'
      and audit_record.event_type = 'enrollment.requested'
  ),
  'all conflicting replays leave enrollment, receipt, and audit counts unchanged'
);

update public.organization_memberships membership_record
set state = 'suspended'
where membership_record.id =
  '01981211-0000-7000-8000-000000000002';

set local role authenticated;
select is(
  (public.request_enrollment(
    '01981220-0000-7000-8000-000000000001',
    'enrollment-binding-key-0001',
    '  Need cohort support. '
  )).id,
  current_setting('ditele_test.bound_enrollment_id')::uuid,
  'the actor-derived wrapper inherits canonical exact-retry behavior'
);

select is(
  (public.request_enrollment(
    '01981220-0000-7000-8000-000000000001',
    'enrollment-binding-key-0002',
    'Alternative UI retry.'
  )).id,
  current_setting('ditele_test.bound_enrollment_id')::uuid,
  'a new key preserves the product rule of returning the live enrollment'
);

reset role;
select ok(
  exists (
    select 1
    from public.enrollment_request_receipts receipt_record
    where receipt_record.actor_id =
        '01981200-0000-7000-8000-000000000001'
      and receipt_record.organization_id =
        '01981210-0000-7000-8000-000000000001'
      and receipt_record.course_id =
        '01981220-0000-7000-8000-000000000001'
      and receipt_record.enrollment_id =
        current_setting('ditele_test.bound_enrollment_id')::uuid
      and receipt_record.idempotency_key =
        'enrollment-binding-key-0002'
      and receipt_record.request_note = 'Alternative UI retry.'
  ),
  'a key that returns an existing live enrollment is still payload-bound'
);

set local role authenticated;
select throws_ok(
  $$
    select public.request_enrollment(
      '01981220-0000-7000-8000-000000000001',
      'enrollment-binding-key-0002',
      'Rebind the UI retry.'
    )
  $$,
  '23505',
  'enrollment idempotency conflict',
  'an existing-enrollment replay key cannot later be rebound to another note'
);

reset role;
select ok(
  (
    select count(*) = 1
    from public.enrollments enrollment_record
    where enrollment_record.learner_id =
      '01981200-0000-7000-8000-000000000001'
  )
  and (
    select count(*) = 2
    from public.enrollment_request_receipts receipt_record
    where receipt_record.actor_id =
      '01981200-0000-7000-8000-000000000001'
  )
  and (
    select count(*) = 1
    from public.audit_events audit_record
    where audit_record.actor_id =
        '01981200-0000-7000-8000-000000000001'
      and audit_record.event_type = 'enrollment.requested'
  ),
  'multiple successful keys remain bound without duplicating enrollment or audit effects'
);

set local role anon;
select throws_ok(
  $$
    select public.request_enrollment(
      '01981210-0000-7000-8000-000000000001',
      '01981220-0000-7000-8000-000000000001',
      'enrollment-binding-anon-0001',
      null
    )
  $$,
  '42501',
  'permission denied for function request_enrollment',
  'anonymous callers cannot execute the authoritative enrollment RPC'
);

select * from finish();
rollback;
