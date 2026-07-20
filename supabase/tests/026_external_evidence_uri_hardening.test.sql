begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(16);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'create_external_task_evidence'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'uuid, text, text, text, text'
      and pg_catalog.pg_get_function_result(procedure_record.oid) = 'evidence'
  ),
  1::bigint,
  'the external evidence RPC retains its exact signature and row result'
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
      and procedure_record.proname = 'create_external_task_evidence'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'uuid, text, text, text, text'
      and procedure_record.provolatile = 'v'
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
      and owner_record.rolname = 'postgres'
  ),
  1::bigint,
  'the RPC remains a postgres-owned volatile security-definer with an empty search path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_external_task_evidence(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.create_external_task_evidence(uuid,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.create_external_task_evidence(uuid,text,text,text,text)',
    'EXECUTE'
  ),
  'only authenticated and service API roles can execute the evidence RPC'
);

select ok(
  (
    select
      pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%normalized_authority%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%p_source_uri ~ ''[[:space:]]''%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%normalized_authority like ''%@%''%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%''attempt-receipt:''%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%''external-evidence:''%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%app_private.attempt_command_payload_hash%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%public.attempt_command_receipts%'
      and pg_catalog.pg_get_functiondef(procedure_record.oid)
        like '%public.audit_events%'
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'create_external_task_evidence'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'uuid, text, text, text, text'
  ),
  'authority validation preserves both serialization locks, receipts, payload binding, and audit'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub',
  '01980a00-0000-7000-8000-000000000001',
  true
);

select set_config(
  'ditele_test.uri_evidence_id',
  (
    select (public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'URI hardening valid evidence',
      'https://evidence.example.test/path/@artifact?reviewer=user@example.test&mode=full#proof',
      repeat('0', 64),
      'uri-hardening-valid-0001'
    )).id::text
  ),
  true
);

select ok(
  exists (
    select 1
    from public.evidence evidence_record
    where evidence_record.id =
        current_setting('ditele_test.uri_evidence_id')::uuid
      and evidence_record.owner_id =
        '01980a00-0000-7000-8000-000000000001'
      and evidence_record.organization_id =
        '01980a10-0000-7000-8000-000000000001'
      and evidence_record.task_id =
        '01980a26-0000-7000-8000-000000000001'
      and evidence_record.source_uri =
        'https://evidence.example.test/path/@artifact?reviewer=user@example.test&mode=full#proof'
      and evidence_record.sha256_hex = repeat('0', 64)
  ),
  'a valid HTTPS host accepts path and query at-signs and preserves the URI exactly'
);

select is(
  (public.create_external_task_evidence(
    '01980a34-0000-7000-8000-000000000001',
    'URI hardening valid evidence',
    'https://evidence.example.test/path/@artifact?reviewer=user@example.test&mode=full#proof',
    repeat('0', 64),
    'uri-hardening-valid-0001'
  )).id,
  current_setting('ditele_test.uri_evidence_id')::uuid,
  'an exact retry replays the same evidence identity'
);

reset role;
select ok(
  (
    select count(*) = 1
    from public.evidence evidence_record
    where evidence_record.id =
      current_setting('ditele_test.uri_evidence_id')::uuid
  )
  and (
    select count(*) = 1
    from public.attempt_command_receipts receipt_record
    where receipt_record.actor_id =
        '01980a00-0000-7000-8000-000000000001'
      and receipt_record.operation = 'create_external_task_evidence'
      and receipt_record.idempotency_key = 'uri-hardening-valid-0001'
      and receipt_record.evidence_id =
        current_setting('ditele_test.uri_evidence_id')::uuid
  )
  and (
    select count(*) = 1
    from public.audit_events audit_record
    where audit_record.actor_id =
        '01980a00-0000-7000-8000-000000000001'
      and audit_record.event_type = 'evidence.created'
      and audit_record.aggregate_type = 'evidence'
      and audit_record.aggregate_id =
        current_setting('ditele_test.uri_evidence_id')::uuid
  ),
  'the retry creates no duplicate evidence, receipt, or audit side effect'
);

select set_config(
  'ditele_test.uri_evidence_count',
  (
    select count(*)::text
    from public.evidence evidence_record
    where evidence_record.owner_id =
      '01980a00-0000-7000-8000-000000000001'
  ),
  true
);
select set_config(
  'ditele_test.uri_receipt_count',
  (
    select count(*)::text
    from public.attempt_command_receipts receipt_record
    where receipt_record.actor_id =
        '01980a00-0000-7000-8000-000000000001'
      and receipt_record.operation = 'create_external_task_evidence'
  ),
  true
);
select set_config(
  'ditele_test.uri_audit_count',
  (
    select count(*)::text
    from public.audit_events audit_record
    where audit_record.actor_id =
        '01980a00-0000-7000-8000-000000000001'
      and audit_record.event_type = 'evidence.created'
  ),
  true
);

set local role authenticated;

select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Invalid HTTP scheme',
      'http://evidence.example.test/not-secure',
      repeat('1', 64),
      'uri-hardening-http-0001'
    )
  $$,
  '22023',
  'invalid external evidence payload',
  'a non-HTTPS scheme is rejected'
);

select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Missing host',
      'https://',
      repeat('2', 64),
      'uri-hardening-host-0001'
    )
  $$,
  '22023',
  'invalid external evidence payload',
  'an HTTPS URI without an authority or host is rejected'
);

select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Query without host',
      'https://?artifact=@proof',
      repeat('3', 64),
      'uri-hardening-query-0001'
    )
  $$,
  '22023',
  'invalid external evidence payload',
  'a query-only HTTPS URI without a host is rejected'
);

select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Triple slash without host',
      'https:///artifact',
      repeat('4', 64),
      'uri-hardening-slash-0001'
    )
  $$,
  '22023',
  'invalid external evidence payload',
  'a triple-slash HTTPS URI without a host is rejected'
);

select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Credential authority',
      'https://learner:secret@evidence.example.test/private',
      repeat('5', 64),
      'uri-hardening-userinfo-0001'
    )
  $$,
  '22023',
  'invalid external evidence payload',
  'credentials and userinfo in the authority are rejected'
);

select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Whitespace in URI',
      'https://evidence.example.test/path with-space',
      repeat('6', 64),
      'uri-hardening-space-0001'
    )
  $$,
  '22023',
  'invalid external evidence payload',
  'embedded URI whitespace is rejected'
);

select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Surrounding whitespace',
      ' https://evidence.example.test/trimmed ',
      repeat('7', 64),
      'uri-hardening-trim-0001'
    )
  $$,
  '22023',
  'invalid external evidence payload',
  'surrounding whitespace is rejected instead of silently normalized'
);

select throws_ok(
  $$
    select public.create_external_task_evidence(
      '01980a34-0000-7000-8000-000000000001',
      'Malformed host',
      'https://-invalid.example.test/path',
      repeat('8', 64),
      'uri-hardening-malformed-0001'
    )
  $$,
  '22023',
  'invalid external evidence payload',
  'a syntactically invalid host authority is rejected'
);

reset role;
select ok(
  (
    select count(*) =
      current_setting('ditele_test.uri_evidence_count')::bigint
    from public.evidence evidence_record
    where evidence_record.owner_id =
      '01980a00-0000-7000-8000-000000000001'
  )
  and (
    select count(*) =
      current_setting('ditele_test.uri_receipt_count')::bigint
    from public.attempt_command_receipts receipt_record
    where receipt_record.actor_id =
        '01980a00-0000-7000-8000-000000000001'
      and receipt_record.operation = 'create_external_task_evidence'
  )
  and (
    select count(*) =
      current_setting('ditele_test.uri_audit_count')::bigint
    from public.audit_events audit_record
    where audit_record.actor_id =
        '01980a00-0000-7000-8000-000000000001'
      and audit_record.event_type = 'evidence.created'
  ),
  'all rejected URI forms leave evidence, receipt, and audit counts unchanged'
);

select * from finish();
rollback;
