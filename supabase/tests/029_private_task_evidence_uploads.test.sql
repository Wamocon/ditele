begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(79);

select has_table(
  'public', 'evidence_uploads',
  'private task uploads have a dedicated lifecycle table'
);

select has_table(
  'public', 'evidence_upload_command_receipts',
  'upload commands have an immutable idempotency receipt ledger'
);

select results_eq(
  $$
    select enum_value::text
    from unnest(enum_range(null::public.evidence_upload_state))
      with ordinality state(enum_value, position)
    order by position
  $$,
  $$ values ('pending'), ('ready'), ('rejected'), ('removed'), ('expired') $$,
  'upload lifecycle states are named and exhaustive'
);

select ok(
  exists (
    select 1
    from storage.buckets bucket
    where bucket.id = 'task-evidence-private'
      and bucket.name = 'task-evidence-private'
      and not bucket.public
      and bucket.file_size_limit = 26214400
      and bucket.allowed_mime_types = array[
        'application/json', 'application/pdf', 'image/jpeg', 'image/png',
        'text/csv', 'text/plain'
      ]::text[]
  ),
  'the evidence bucket is private, allowlisted, and globally capped at 25 MiB'
);

select ok(
  (
    select table_record.relrowsecurity and table_record.relforcerowsecurity
    from pg_catalog.pg_class table_record
    where table_record.oid = 'public.evidence_uploads'::pg_catalog.regclass
  )
  and (
    select table_record.relrowsecurity and table_record.relforcerowsecurity
    from pg_catalog.pg_class table_record
    where table_record.oid =
      'public.evidence_upload_command_receipts'::pg_catalog.regclass
  )
  and not has_table_privilege(
    'authenticated', 'public.evidence_uploads', 'SELECT'
  )
  and not has_table_privilege(
    'authenticated', 'public.evidence_uploads', 'INSERT'
  )
  and not has_table_privilege(
    'service_role', 'public.evidence_uploads', 'SELECT'
  )
  and not has_table_privilege(
    'service_role', 'public.evidence_upload_command_receipts', 'SELECT'
  ),
  'upload aggregates and receipts are force-RLS private without raw role grants'
);

select ok(
  (
    select count(*) = 13
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid =
        'public.evidence_uploads'::pg_catalog.regclass
      and constraint_record.convalidated
      and constraint_record.conname in (
        'evidence_uploads_attempt_context_fk',
        'evidence_uploads_actor_key_unique',
        'evidence_uploads_object_key_unique',
        'evidence_uploads_evidence_unique',
        'evidence_uploads_media_asset_unique',
        'evidence_uploads_exact_identity_unique',
        'evidence_uploads_bucket',
        'evidence_uploads_object_key',
        'evidence_uploads_declared_mime',
        'evidence_uploads_declared_size',
        'evidence_uploads_verified_tuple',
        'evidence_uploads_cleanup',
        'evidence_uploads_state_consistency'
      )
  )
  and (
    select count(*) = 3
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid =
        'public.evidence_upload_command_receipts'::pg_catalog.regclass
      and constraint_record.convalidated
      and constraint_record.conname in (
        'evidence_upload_receipts_actor_operation_key_unique',
        'evidence_upload_receipts_upload_context_fk',
        'evidence_upload_receipts_result_consistency'
      )
  ),
  'exact delivery, identity, state, cleanup, and receipt invariants are constrained'
);

select ok(
  to_regclass('public.evidence_uploads_ready_digest_uidx') is not null
  and to_regclass('public.evidence_uploads_cleanup_idx') is not null
  and to_regclass('public.evidence_upload_receipts_upload_context_idx')
    is not null
  and exists (
    select 1
    from pg_catalog.pg_index index_record
    where index_record.indexrelid =
      'public.evidence_uploads_ready_digest_uidx'::pg_catalog.regclass
      and index_record.indisunique
      and pg_catalog.pg_get_expr(
        index_record.indpred, index_record.indrelid
      ) = '(state = ''ready''::evidence_upload_state)'
  ),
  'ready digest uniqueness and cleanup/receipt lookups are indexed'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'storage'
      and policy_record.tablename = 'objects'
      and policy_record.policyname = 'task_evidence_objects_insert'
      and policy_record.cmd = 'INSERT'
      and policy_record.roles = array['authenticated']::name[]
  )
  and exists (
    select 1 from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'storage'
      and policy_record.tablename = 'objects'
      and policy_record.policyname = 'task_evidence_objects_read'
      and policy_record.cmd = 'SELECT'
      and policy_record.roles = array['authenticated']::name[]
  )
  and not exists (
    select 1 from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'storage'
      and policy_record.tablename = 'objects'
      and policy_record.policyname like 'task_evidence_objects_%'
      and policy_record.cmd in ('UPDATE', 'DELETE', 'ALL')
  ),
  'storage permits only intent-bound insert and authorized read, never overwrite/delete'
);

select ok(
  not has_table_privilege(
    'authenticated', 'public.evidence_artifacts', 'INSERT'
  )
  and not exists (
    select 1 from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'evidence_artifacts'
      and policy_record.policyname = 'evidence_artifacts_owner_insert'
  )
  and exists (
    select 1 from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'media_assets'
      and policy_record.policyname = 'media_assets_non_evidence_insert'
      and policy_record.with_check like '%media_kind <> ''evidence''::text%'
  ),
  'artifact links and evidence media rows are command-owned rather than forgeable'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and (
        procedure_record.proname,
        pg_catalog.oidvectortypes(procedure_record.proargtypes)
      ) in (
        ('create_task_evidence_upload_intent',
          'uuid, text, text, text, bigint, text, text, uuid'),
        ('finalize_task_evidence_upload_service',
          'uuid, uuid, text, bigint, text, text, uuid'),
        ('reject_task_evidence_upload_service',
          'uuid, uuid, text, text, uuid'),
        ('remove_task_uploaded_evidence',
          'uuid, uuid, bigint, text, uuid'),
        ('get_task_evidence_download_target', 'uuid'),
        ('list_my_ready_task_evidence_uploads', 'uuid'),
        ('claim_task_evidence_upload_cleanup', 'integer, text, uuid'),
        ('complete_task_evidence_upload_cleanup',
          'uuid, text, uuid, boolean, text, timestamp with time zone')
      )
  ),
  8::bigint,
  'the upload lifecycle exposes exactly the intended eight RPC signatures'
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
      and procedure_record.proname in (
        'create_task_evidence_upload_intent',
        'finalize_task_evidence_upload_service',
        'reject_task_evidence_upload_service',
        'remove_task_uploaded_evidence',
        'get_task_evidence_download_target',
        'list_my_ready_task_evidence_uploads',
        'claim_task_evidence_upload_cleanup',
        'complete_task_evidence_upload_cleanup'
      )
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
      and owner_record.rolname = 'postgres'
  ),
  8::bigint,
  'all public upload RPCs are postgres-owned security definers with empty paths'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_task_evidence_upload_intent(uuid,text,text,text,bigint,text,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.remove_task_uploaded_evidence(uuid,uuid,bigint,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.get_task_evidence_download_target(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.list_my_ready_task_evidence_uploads(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.create_task_evidence_upload_intent(uuid,text,text,text,bigint,text,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role', 'public.list_my_ready_task_evidence_uploads(uuid)',
    'EXECUTE'
  ),
  'learner commands/projections are authenticated-only with no anonymous recovery'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.finalize_task_evidence_upload_service(uuid,uuid,text,bigint,text,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.reject_task_evidence_upload_service(uuid,uuid,text,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.claim_task_evidence_upload_cleanup(integer,text,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.complete_task_evidence_upload_cleanup(uuid,text,uuid,boolean,text,timestamp with time zone)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.finalize_task_evidence_upload_service(uuid,uuid,text,bigint,text,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.claim_task_evidence_upload_cleanup(integer,text,uuid)',
    'EXECUTE'
  ),
  'validation and cleanup callbacks are service-only'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.exact_learner_attempt_context(uuid,uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'app_private.can_insert_task_evidence_object(text,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'app_private.can_read_task_evidence_object(text,text)', 'EXECUTE'
  ),
  'only the boolean storage policy helpers cross the private-schema boundary'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_trigger trigger_record
    where trigger_record.tgrelid =
        'public.evidence_uploads'::pg_catalog.regclass
      and trigger_record.tgname = 'evidence_uploads_guard_mutation'
      and not trigger_record.tgisinternal
  )
  and exists (
    select 1 from pg_catalog.pg_trigger trigger_record
    where trigger_record.tgrelid =
        'public.evidence_upload_command_receipts'::pg_catalog.regclass
      and trigger_record.tgname = 'evidence_upload_receipts_immutable'
      and not trigger_record.tgisinternal
  )
  and exists (
    select 1 from pg_catalog.pg_trigger trigger_record
    where trigger_record.tgrelid =
        'public.submission_version_evidence'::pg_catalog.regclass
      and trigger_record.tgname =
        'submission_version_evidence_requires_ready_upload'
      and not trigger_record.tgisinternal
  ),
  'identity/state, receipt immutability, and exact-attempt linkage are trigger guarded'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.create_task_evidence_upload_intent(uuid,text,text,text,bigint,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%evidence-upload-quota:%'
  and pg_catalog.pg_get_functiondef(
    'public.create_task_evidence_upload_intent(uuid,text,text,text,bigint,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%pg_advisory_xact_lock%'
  and pg_catalog.pg_get_functiondef(
    'public.create_task_evidence_upload_intent(uuid,text,text,text,bigint,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%when ''application/json'' then 1048576%'
  and pg_catalog.pg_get_functiondef(
    'public.create_task_evidence_upload_intent(uuid,text,text,text,bigint,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%when ''application/pdf'' then 10485760%'
  and pg_catalog.pg_get_functiondef(
    'public.create_task_evidence_upload_intent(uuid,text,text,text,bigint,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%when ''image/png'' then 26214400%'
  and pg_catalog.pg_get_constraintdef(
    (
      select constraint_record.oid
      from pg_catalog.pg_constraint constraint_record
      where constraint_record.conrelid =
          'public.evidence_uploads'::pg_catalog.regclass
        and constraint_record.conname = 'evidence_uploads_declared_size'
    )
  ) like '%1048576%5242880%10485760%26214400%',
  'intent and table constraints enforce the validator MIME-specific byte caps'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.finalize_task_evidence_upload_service(uuid,uuid,text,bigint,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%from storage.objects object_record%object_record.bucket_id = upload_record.bucket_id%object_record.name = upload_record.object_key%object_record.owner_id = p_actor_id::text%for key share%'
  and pg_catalog.pg_get_functiondef(
    'public.finalize_task_evidence_upload_service(uuid,uuid,text,bigint,text,text,uuid)'::pg_catalog.regprocedure
  ) not like '%object_record.metadata%'
  and pg_catalog.pg_get_functiondef(
    'public.finalize_task_evidence_upload_service(uuid,uuid,text,bigint,text,text,uuid)'::pg_catalog.regprocedure
  ) like '%p_verified_byte_size is null%when ''application/json'' then 1048576%',
  'finalization locks the exact actor-owned Storage row and ignores unstable metadata'
);

select ok(
  pg_catalog.pg_get_function_result(
    'public.list_my_ready_task_evidence_uploads(uuid)'::pg_catalog.regprocedure
  ) like 'TABLE(upload_id uuid, evidence_id uuid, title text, original_file_name text, mime_type text, byte_size bigint, captured_at timestamp with time zone, finalized_at timestamp with time zone, immutable_linked boolean)'
  and pg_catalog.pg_get_function_result(
    'public.list_my_ready_task_evidence_uploads(uuid)'::pg_catalog.regprocedure
  ) not like '%bucket%'
  and pg_catalog.pg_get_function_result(
    'public.list_my_ready_task_evidence_uploads(uuid)'::pg_catalog.regprocedure
  ) not like '%object_key%'
  and pg_catalog.pg_get_function_result(
    'public.list_my_ready_task_evidence_uploads(uuid)'::pg_catalog.regprocedure
  ) not like '%sha256%'
  and pg_catalog.pg_get_function_result(
    'public.list_my_ready_task_evidence_uploads(uuid)'::pg_catalog.regprocedure
  ) not like '%cleanup%',
  'recovery returns only safe evidence identity/display fields and immutable-link state'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.list_my_ready_task_evidence_uploads(uuid)'::pg_catalog.regprocedure
  ) like '%current_actor_exact_attempt_context%attempt_state not in%in_progress%revision_required%'
  and pg_catalog.pg_get_functiondef(
    'public.list_my_ready_task_evidence_uploads(uuid)'::pg_catalog.regprocedure
  ) like '%upload.attempt_id = p_attempt_id%upload.owner_id = v_actor_id%upload.state = ''ready''%'
  and pg_catalog.pg_get_functiondef(
    'app_private.guard_ready_uploaded_evidence_link()'::pg_catalog.regprocedure
  ) like '%upload_record.attempt_id <> attempt_record.id%',
  'recovery and immutable submission links remain exact-attempt actor scoped'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'public.claim_task_evidence_upload_cleanup(integer,text,uuid)'::pg_catalog.regprocedure
  ) like '%expired_candidates%for update skip locked%limit p_limit%'
  and pg_catalog.pg_get_functiondef(
    'public.complete_task_evidence_upload_cleanup(uuid,text,uuid,boolean,text,timestamp with time zone)'::pg_catalog.regprocedure
  ) like '%update public.media_assets media%state = ''inactive''%deleted_at = coalesce%',
  'cleanup bounds expiry work and retires metadata after physical deletion'
);

create function pg_temp.create_upload_intent(
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_hash text,
  p_key text,
  p_correlation uuid
)
returns uuid
language sql
as $$
  select upload_id
  from public.create_task_evidence_upload_intent(
    '01980a34-0000-7000-8000-000000000001',
    'Upload boundary fixture',
    p_file_name,
    p_mime_type,
    p_byte_size,
    p_hash,
    p_key,
    p_correlation
  );
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$
    select * from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Unauthenticated upload', 'evidence.json', 'application/json', 100,
      repeat('0', 64), 'upload-auth-required-0001',
      '01980b00-0000-7000-8000-000000000001'
    )
  $$,
  '42501', 'authentication required',
  'an unauthenticated caller cannot create an upload intent'
);

select throws_ok(
  $$
    select * from public.list_my_ready_task_evidence_uploads(
      '01980a34-0000-7000-8000-000000000001'
    )
  $$,
  '42501', 'authentication required',
  'recovery fails closed without an authenticated principal'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select throws_ok(
  $$
    select * from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Mismatched extension', 'evidence.pdf', 'image/png', 100,
      repeat('1', 64), 'upload-extension-mismatch-01',
      '01980b00-0000-7000-8000-000000000002'
    )
  $$,
  '22023', 'invalid evidence upload intent',
  'declared MIME must agree with the normalized safe filename extension'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);
select throws_ok(
  $$
    select * from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Cross actor', 'evidence.json', 'application/json', 100,
      repeat('2', 64), 'upload-cross-actor-000001',
      '01980b00-0000-7000-8000-000000000003'
    )
  $$,
  '42501', 'attempt unavailable',
  'another user cannot create an intent against the learner attempt'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select lives_ok(
  $$ select pg_temp.create_upload_intent(
    'boundary.json', 'application/json', 1048576, repeat('a', 64),
    'cap-json-max-000001', '01980b01-0000-7000-8000-000000000001'
  ) $$,
  'JSON is accepted at exactly 1 MiB'
);
select throws_ok(
  $$ select pg_temp.create_upload_intent(
    'boundary.json', 'application/json', 1048577, repeat('a', 64),
    'cap-json-over-00001', '01980b01-0000-7000-8000-000000000002'
  ) $$,
  '22023', 'invalid evidence upload intent',
  'JSON is rejected one byte above 1 MiB'
);

select lives_ok(
  $$ select pg_temp.create_upload_intent(
    'boundary.csv', 'text/csv', 5242880, repeat('b', 64),
    'cap-csv-max-0000001', '01980b01-0000-7000-8000-000000000003'
  ) $$,
  'CSV is accepted at exactly 5 MiB'
);
select throws_ok(
  $$ select pg_temp.create_upload_intent(
    'boundary.csv', 'text/csv', 5242881, repeat('b', 64),
    'cap-csv-over-000001', '01980b01-0000-7000-8000-000000000004'
  ) $$,
  '22023', 'invalid evidence upload intent',
  'CSV is rejected one byte above 5 MiB'
);

select lives_ok(
  $$ select pg_temp.create_upload_intent(
    'boundary.txt', 'text/plain', 5242880, repeat('c', 64),
    'cap-text-max-000001', '01980b01-0000-7000-8000-000000000005'
  ) $$,
  'plain text is accepted at exactly 5 MiB'
);
select throws_ok(
  $$ select pg_temp.create_upload_intent(
    'boundary.txt', 'text/plain', 5242881, repeat('c', 64),
    'cap-text-over-00001', '01980b01-0000-7000-8000-000000000006'
  ) $$,
  '22023', 'invalid evidence upload intent',
  'plain text is rejected one byte above 5 MiB'
);

select lives_ok(
  $$ select pg_temp.create_upload_intent(
    'boundary.pdf', 'application/pdf', 10485760, repeat('d', 64),
    'cap-pdf-max-0000001', '01980b01-0000-7000-8000-000000000007'
  ) $$,
  'PDF is accepted at exactly 10 MiB'
);
select throws_ok(
  $$ select pg_temp.create_upload_intent(
    'boundary.pdf', 'application/pdf', 10485761, repeat('d', 64),
    'cap-pdf-over-000001', '01980b01-0000-7000-8000-000000000008'
  ) $$,
  '22023', 'invalid evidence upload intent',
  'PDF is rejected one byte above 10 MiB'
);

select lives_ok(
  $$ select pg_temp.create_upload_intent(
    'boundary.jpeg', 'image/jpeg', 26214400, repeat('e', 64),
    'cap-jpeg-max-000001', '01980b01-0000-7000-8000-000000000009'
  ) $$,
  'JPEG is accepted at exactly 25 MiB, including the .jpeg extension'
);
select throws_ok(
  $$ select pg_temp.create_upload_intent(
    'boundary.jpg', 'image/jpeg', 26214401, repeat('e', 64),
    'cap-jpeg-over-00001', '01980b01-0000-7000-8000-000000000010'
  ) $$,
  '22023', 'invalid evidence upload intent',
  'JPEG is rejected one byte above 25 MiB'
);

select lives_ok(
  $$ select pg_temp.create_upload_intent(
    'boundary.png', 'image/png', 26214400, repeat('f', 64),
    'cap-png-max-0000001', '01980b01-0000-7000-8000-000000000011'
  ) $$,
  'PNG is accepted at exactly 25 MiB'
);
select throws_ok(
  $$ select pg_temp.create_upload_intent(
    'boundary.png', 'image/png', 26214401, repeat('f', 64),
    'cap-png-over-000001', '01980b01-0000-7000-8000-000000000012'
  ) $$,
  '22023', 'invalid evidence upload intent',
  'PNG is rejected one byte above 25 MiB'
);

select lives_ok(
  $$ select pg_temp.create_upload_intent(
    repeat('é', 125) || '.json', 'application/json', 64, repeat('7', 64),
    'cap-name-max-0000001', '01980b01-0000-7000-8000-000000000013'
  ) $$,
  'a UTF-8 filename is accepted at exactly 255 bytes'
);
select throws_ok(
  $$ select pg_temp.create_upload_intent(
    repeat('é', 125) || 'a.json', 'application/json', 64, repeat('7', 64),
    'cap-name-over-000001', '01980b01-0000-7000-8000-000000000014'
  ) $$,
  '22023', 'invalid evidence upload intent',
  'a UTF-8 filename is rejected at 256 bytes even below 255 characters'
);

reset role;

-- Keep the MIME boundary rows from consuming the active pending quota or the
-- cleanup claim fixture below. These are rollback-only test records.
update public.evidence_uploads upload
set state = 'rejected',
    rejected_at = statement_timestamp(),
    rejection_code = 'unsupported_content',
    cleanup_available_at = null,
    storage_deleted_at = statement_timestamp()
where upload.idempotency_key like 'cap-%';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);
select set_config(
  'ditele_test.primary_upload_id',
  (
    select upload_id::text
    from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Primary JSON report', 'primary-report.json', 'application/json', 100,
      repeat('1', 64), 'upload-primary-intent-0001',
      '01980b02-0000-7000-8000-000000000001'
    )
  ),
  true
);
select set_config(
  'ditele_test.primary_object_key',
  (
    select object_key
    from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Primary JSON report', 'primary-report.json', 'application/json', 100,
      repeat('1', 64), 'upload-primary-intent-0001',
      '01980b02-0000-7000-8000-000000000001'
    )
  ),
  true
);
reset role;

select ok(
  exists (
    select 1 from public.evidence_uploads upload
    where upload.id =
        current_setting('ditele_test.primary_upload_id')::uuid
      and upload.state = 'pending'
      and upload.owner_id = '01980a00-0000-7000-8000-000000000001'
      and upload.attempt_id = '01980a34-0000-7000-8000-000000000001'
      and upload.bucket_id = 'task-evidence-private'
      and upload.object_key =
        upload.organization_id::text || '/' || upload.owner_id::text || '/'
        || upload.attempt_id::text || '/' || upload.id::text
      and upload.expires_at > statement_timestamp()
      and upload.expires_at <= upload.created_at + interval '15 minutes 1 second'
  ),
  'intent creation binds a pending object target to exact learner delivery context'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);
select ok(
  (
    select replayed
      and upload_id = current_setting('ditele_test.primary_upload_id')::uuid
      and upload_state = 'pending'
      and correlation_id = '01980b02-0000-7000-8000-000000000001'
    from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Primary JSON report', 'primary-report.json', 'application/json', 100,
      repeat('1', 64), 'upload-primary-intent-0001',
      '01980b02-0000-7000-8000-000000000001'
    )
  ),
  'an exact intent retry replays the same actor-bound upload identity'
);

select throws_ok(
  $$
    select * from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Changed title', 'primary-report.json', 'application/json', 100,
      repeat('1', 64), 'upload-primary-intent-0001',
      '01980b02-0000-7000-8000-000000000001'
    )
  $$,
  '23505', 'evidence upload intent idempotency conflict',
  'an intent key cannot be rebound to a changed payload'
);

select throws_ok(
  $$ select count(*) from public.evidence_uploads $$,
  '42501', 'permission denied for table evidence_uploads',
  'authenticated callers cannot inspect private upload lifecycle rows directly'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'task-evidence-private',
      '01980a10-0000-7000-8000-000000000001/'
        || '01980a00-0000-7000-8000-000000000001/arbitrary',
      '01980a00-0000-7000-8000-000000000001'
    )
  $$,
  '42501', 'new row violates row-level security policy for table "objects"',
  'storage rejects an object path without an exact live intent'
);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'task-evidence-private',
      current_setting('ditele_test.primary_object_key'),
      '01980a00-0000-7000-8000-000000000002'
    )
  $$,
  '42501', 'new row violates row-level security policy for table "objects"',
  'an exact intent path cannot be inserted under another Storage owner'
);


select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'task-evidence-private',
      current_setting('ditele_test.primary_object_key'),
      (select auth.uid())::text
    )
  $$,
  'the learner can insert only the exact generated object target'
);

select is(
  (
    select count(*)
    from storage.objects object_record
    where object_record.bucket_id = 'task-evidence-private'
      and object_record.name =
        current_setting('ditele_test.primary_object_key')
  ),
  1::bigint,
  'the owner can read the live pending object row through exact Storage RLS'
);

select is(
  (
    select count(*)
    from storage.objects object_record
    where object_record.bucket_id = 'task-evidence-private'
      and object_record.name = 'not/an/authorized/object'
  ),
  0::bigint,
  'unbound object targets are not visible through Storage RLS'
);

-- Create a separate intent whose Storage row is absent, then owned by another
-- principal, to prove the service finalizer never trusts caller metadata alone.
select set_config(
  'ditele_test.missing_upload_id',
  (
    select upload_id::text
    from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Missing object', 'missing.txt', 'text/plain', 25,
      repeat('2', 64), 'upload-missing-intent-0001',
      '01980b02-0000-7000-8000-000000000002'
    )
  ),
  true
);
reset role;

set local role service_role;
select throws_ok(
  format(
    $sql$
      select * from public.finalize_task_evidence_upload_service(
        %L::uuid, '01980a00-0000-7000-8000-000000000001',
        'text/plain', 25, %L, 'upload-missing-final-0001',
        '01980b02-0000-7000-8000-000000000003'
      )
    $sql$,
    current_setting('ditele_test.missing_upload_id'), repeat('2', 64)
  ),
  '22023', 'verified evidence upload object is unavailable',
  'service finalization rejects an absent Storage object'
);
reset role;

insert into storage.objects (bucket_id, name, owner_id)
select upload.bucket_id, upload.object_key,
  '01980a00-0000-7000-8000-000000000002'
from public.evidence_uploads upload
where upload.id = current_setting('ditele_test.missing_upload_id')::uuid;

set local role service_role;
select throws_ok(
  format(
    $sql$
      select * from public.finalize_task_evidence_upload_service(
        %L::uuid, '01980a00-0000-7000-8000-000000000001',
        'text/plain', 25, %L, 'upload-missing-final-0001',
        '01980b02-0000-7000-8000-000000000003'
      )
    $sql$,
    current_setting('ditele_test.missing_upload_id'), repeat('2', 64)
  ),
  '22023', 'verified evidence upload object is unavailable',
  'service finalization rejects the exact path when Storage ownership differs'
);
reset role;

select set_config('storage.allow_delete_query', 'true', true);

delete from storage.objects object_record
using public.evidence_uploads upload
where upload.id = current_setting('ditele_test.missing_upload_id')::uuid
  and object_record.bucket_id = upload.bucket_id
  and object_record.name = upload.object_key;
update public.evidence_uploads upload
set state = 'rejected', rejected_at = statement_timestamp(),
    rejection_code = 'object_unavailable', cleanup_available_at = null,
    storage_deleted_at = statement_timestamp()
where upload.id = current_setting('ditele_test.missing_upload_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);
select set_config(
  'ditele_test.rejected_upload_id',
  (
    select upload_id::text
    from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Rejected validator fixture', 'rejected.txt', 'text/plain', 50,
      repeat('5', 64), 'upload-rejected-intent-0001',
      '01980b02-0000-7000-8000-000000000013'
    )
  ),
  true
);
select set_config(
  'ditele_test.rejected_object_key',
  (
    select object_key
    from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Rejected validator fixture', 'rejected.txt', 'text/plain', 50,
      repeat('5', 64), 'upload-rejected-intent-0001',
      '01980b02-0000-7000-8000-000000000013'
    )
  ),
  true
);
insert into storage.objects (bucket_id, name, owner_id)
values (
  'task-evidence-private',
  current_setting('ditele_test.rejected_object_key'),
  (select auth.uid())::text
);
reset role;

set local role service_role;
select throws_ok(
  format(
    $sql$
      select * from public.finalize_task_evidence_upload_service(
        %L::uuid, '01980a00-0000-7000-8000-000000000001',
        'text/plain', 49, %L, 'upload-rejected-final-0001',
        '01980b02-0000-7000-8000-000000000014'
      )
    $sql$,
    current_setting('ditele_test.rejected_upload_id'), repeat('5', 64)
  ),
  '22023', 'verified evidence upload does not match its intent',
  'finalization rejects a server-verified byte tuple that differs from its intent'
);

select ok(
  (
    select not replayed and upload_state = 'rejected'
      and correlation_id = '01980b02-0000-7000-8000-000000000015'
    from public.reject_task_evidence_upload_service(
      current_setting('ditele_test.rejected_upload_id')::uuid,
      '01980a00-0000-7000-8000-000000000001',
      'size_mismatch', 'upload-rejected-command-0001',
      '01980b02-0000-7000-8000-000000000015'
    )
  ),
  'the service can quarantine a failed validator result with a named reason'
);

select ok(
  (
    select replayed and upload_state = 'rejected'
    from public.reject_task_evidence_upload_service(
      current_setting('ditele_test.rejected_upload_id')::uuid,
      '01980a00-0000-7000-8000-000000000001',
      'size_mismatch', 'upload-rejected-command-0001',
      '01980b02-0000-7000-8000-000000000015'
    )
  ),
  'an exact service rejection retry replays its terminal result'
);

select throws_ok(
  format(
    $sql$
      select * from public.reject_task_evidence_upload_service(
        %L::uuid, '01980a00-0000-7000-8000-000000000001',
        'mime_mismatch', 'upload-rejected-command-0001',
        '01980b02-0000-7000-8000-000000000015'
      )
    $sql$,
    current_setting('ditele_test.rejected_upload_id')
  ),
  '23505', 'evidence upload reject idempotency conflict',
  'a rejection key cannot be rebound to a different validator outcome'
);
reset role;

update public.evidence_uploads upload
set cleanup_available_at = statement_timestamp() + interval '1 day'
where upload.id = current_setting('ditele_test.rejected_upload_id')::uuid;


set local role service_role;
select set_config(
  'ditele_test.primary_evidence_id',
  (
    select evidence_id::text
    from public.finalize_task_evidence_upload_service(
      current_setting('ditele_test.primary_upload_id')::uuid,
      '01980a00-0000-7000-8000-000000000001',
      'application/json', 100, repeat('1', 64),
      'upload-primary-final-00001',
      '01980b02-0000-7000-8000-000000000004'
    )
  ),
  true
);
reset role;
select set_config(
  'ditele_test.primary_media_id',
  (
    select media_asset_id::text
    from public.evidence_uploads upload
    where upload.id = current_setting('ditele_test.primary_upload_id')::uuid
  ),
  true
);

select ok(
  exists (
    select 1
    from public.evidence_uploads upload
    join public.evidence evidence on evidence.id = upload.evidence_id
    join public.media_assets media on media.id = upload.media_asset_id
    join public.evidence_artifacts artifact
      on artifact.evidence_id = evidence.id
     and artifact.media_asset_id = media.id
     and artifact.artifact_role = 'primary'
    where upload.id = current_setting('ditele_test.primary_upload_id')::uuid
      and upload.state = 'ready'
      and upload.evidence_id =
        current_setting('ditele_test.primary_evidence_id')::uuid
      and upload.verified_mime_type = 'application/json'
      and upload.verified_byte_size = 100
      and upload.verified_sha256 = repeat('1', 64)
      and evidence.evidence_kind = 'upload'
      and evidence.source_uri is null
      and media.media_kind = 'evidence'
      and media.state = 'active'
  ),
  'service validation atomically creates immutable evidence, media, and artifact provenance'
);

set local role service_role;
select ok(
  (
    select replayed
      and evidence_id = current_setting('ditele_test.primary_evidence_id')::uuid
      and media_asset_id = current_setting('ditele_test.primary_media_id')::uuid
    from public.finalize_task_evidence_upload_service(
      current_setting('ditele_test.primary_upload_id')::uuid,
      '01980a00-0000-7000-8000-000000000001',
      'application/json', 100, repeat('1', 64),
      'upload-primary-final-00001',
      '01980b02-0000-7000-8000-000000000004'
    )
  ),
  'an exact finalize retry replays the original evidence and media identities'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);
select ok(
  (
    select count(*) = 1
      and bool_and(not recovered.immutable_linked)
      and bool_and(recovered.evidence_id =
        current_setting('ditele_test.primary_evidence_id')::uuid)
      and bool_and(recovered.original_file_name = 'primary-report.json')
    from public.list_my_ready_task_evidence_uploads(
      '01980a34-0000-7000-8000-000000000001'
    ) recovered
  ),
  'recovery rediscovers a finalized-but-not-yet-submitted upload'
);

select ok(
  (
    select bool_and(
      not (to_jsonb(recovered) ?| array[
        'bucket_id', 'object_key', 'sha256_hex', 'cleanup_available_at',
        'correlation_id', 'idempotency_key'
      ])
    )
    from public.list_my_ready_task_evidence_uploads(
      '01980a34-0000-7000-8000-000000000001'
    ) recovered
  ),
  'recovery rows do not serialize private target, hash, cleanup, or command data'
);

select set_config(
  'ditele_test.pending_upload_id',
  (
    select upload_id::text
    from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Pending upload', 'pending.csv', 'text/csv', 30,
      repeat('3', 64), 'upload-pending-intent-0001',
      '01980b02-0000-7000-8000-000000000005'
    )
  ),
  true
);
select is(
  (
    select count(*)
    from public.list_my_ready_task_evidence_uploads(
      '01980a34-0000-7000-8000-000000000001'
    )
  ),
  1::bigint,
  'pending uploads remain quarantined from crash recovery'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);
select throws_ok(
  $$
    select * from public.list_my_ready_task_evidence_uploads(
      '01980a34-0000-7000-8000-000000000001'
    )
  $$,
  '42501', 'attempt unavailable',
  'a trainer or foreign principal cannot recover another learner upload'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);
select set_config(
  'ditele_test.submission_id',
  (
    select (public.submit_attempt(
      '01980a34-0000-7000-8000-000000000001',
      (select attempt.row_version from public.attempts attempt
       where attempt.id = '01980a34-0000-7000-8000-000000000001'),
      'upload-submit-attempt-00001',
      'Risk-based tests with uploaded JSON evidence.',
      array['01980a28-0000-7000-8000-000000000001'::uuid],
      array[current_setting('ditele_test.primary_evidence_id')::uuid],
      '01980b02-0000-7000-8000-000000000006'
    )).id::text
  ),
  true
);
reset role;
select set_config(
  'ditele_test.submission_version_id',
  (
    select version_record.id::text
    from public.submission_versions version_record
    where version_record.submission_id =
      current_setting('ditele_test.submission_id')::uuid
    order by version_record.version_number desc
    limit 1
  ),
  true
);

select ok(
  exists (
    select 1 from public.submission_version_evidence link_record
    where link_record.submission_version_id =
        current_setting('ditele_test.submission_version_id')::uuid
      and link_record.evidence_id =
        current_setting('ditele_test.primary_evidence_id')::uuid
  ),
  'submission accepts a ready upload and creates an immutable exact-attempt link'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);
select lives_ok(
  format(
    $sql$
      select * from public.decide_submission(
        %L::uuid, %L::uuid,
        (select submission.row_version from public.submissions submission
         where submission.id = %L::uuid),
        'revision_required', 'Please add one more focused artifact.',
        '[{"criterion_id":"01980a2c-0000-7000-8000-000000000001","points":7}]',
        'upload-review-revision-0001',
        '01980b02-0000-7000-8000-000000000007'
      )
    $sql$,
    current_setting('ditele_test.submission_id'),
    current_setting('ditele_test.submission_version_id'),
    current_setting('ditele_test.submission_id')
  ),
  'trainer revision returns the attempt to an authorized recovery state'
);

select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);
select ok(
  (
    select count(*) = 1 and bool_and(recovered.immutable_linked)
    from public.list_my_ready_task_evidence_uploads(
      '01980a34-0000-7000-8000-000000000001'
    ) recovered
    where recovered.evidence_id =
      current_setting('ditele_test.primary_evidence_id')::uuid
  ),
  'recovery identifies evidence already linked to immutable submission history'
);

select set_config(
  'ditele_test.secondary_upload_id',
  (
    select upload_id::text
    from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Secondary text evidence', 'secondary.txt', 'text/plain', 40,
      repeat('4', 64), 'upload-secondary-intent-01',
      '01980b02-0000-7000-8000-000000000008'
    )
  ),
  true
);
select set_config(
  'ditele_test.secondary_object_key',
  (
    select object_key
    from public.create_task_evidence_upload_intent(
      '01980a34-0000-7000-8000-000000000001',
      'Secondary text evidence', 'secondary.txt', 'text/plain', 40,
      repeat('4', 64), 'upload-secondary-intent-01',
      '01980b02-0000-7000-8000-000000000008'
    )
  ),
  true
);
select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'task-evidence-private',
      current_setting('ditele_test.secondary_object_key'),
      (select auth.uid())::text
    )
  $$,
  'revision work can upload to its new exact secondary target'
);
reset role;

set local role service_role;
select set_config(
  'ditele_test.secondary_evidence_id',
  (
    select evidence_id::text
    from public.finalize_task_evidence_upload_service(
      current_setting('ditele_test.secondary_upload_id')::uuid,
      '01980a00-0000-7000-8000-000000000001',
      'text/plain', 40, repeat('4', 64),
      'upload-secondary-final-001',
      '01980b02-0000-7000-8000-000000000009'
    )
  ),
  true
);
reset role;
select set_config(
  'ditele_test.secondary_media_id',
  (
    select upload.media_asset_id::text
    from public.evidence_uploads upload
    where upload.id =
      current_setting('ditele_test.secondary_upload_id')::uuid
  ),
  true
);

-- Model the learner persisting recovered revision evidence before removal.
insert into public.attempt_drafts (
  attempt_id, answer_text, selected_option_ids, evidence_draft, client_saved_at
) values (
  '01980a34-0000-7000-8000-000000000001', '', '{}'::uuid[],
  jsonb_build_array(jsonb_build_object(
    'id', current_setting('ditele_test.secondary_evidence_id'),
    'kind', 'file', 'title', 'Secondary text evidence'
  )), statement_timestamp()
) on conflict (attempt_id) do update
set evidence_draft = excluded.evidence_draft,
    client_saved_at = excluded.client_saved_at;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);
select ok(
  (
    select count(*) = 2
      and count(*) filter (where recovered.immutable_linked) = 1
      and count(*) filter (where not recovered.immutable_linked) = 1
    from public.list_my_ready_task_evidence_uploads(
      '01980a34-0000-7000-8000-000000000001'
    ) recovered
  ),
  'recovery distinguishes immutable history from removable revision evidence'
);

select throws_ok(
  format(
    $sql$
      select * from public.remove_task_uploaded_evidence(
        '01980a34-0000-7000-8000-000000000001', %L::uuid,
        (select draft.row_version from public.attempt_drafts draft
         where draft.attempt_id = '01980a34-0000-7000-8000-000000000001'),
        'upload-remove-linked-00001',
        '01980b02-0000-7000-8000-000000000010'
      )
    $sql$,
    current_setting('ditele_test.primary_evidence_id')
  ),
  '55000', 'submitted evidence cannot be removed',
  'immutable-linked evidence cannot be removed from revision history'
);
select throws_ok(
  format(
    $sql$
      select * from public.remove_task_uploaded_evidence(
        '01980a34-0000-7000-8000-000000000001', %L::uuid,
        (select draft.row_version + 1 from public.attempt_drafts draft
         where draft.attempt_id = '01980a34-0000-7000-8000-000000000001'),
        'upload-remove-stale-000001',
        '01980b02-0000-7000-8000-000000000016'
      )
    $sql$,
    current_setting('ditele_test.secondary_evidence_id')
  ),
  '40001', 'attempt draft became stale',
  'removal rejects a stale expected draft version before changing evidence state'
);


select ok(
  (
    select not replayed
      and upload_id = current_setting('ditele_test.secondary_upload_id')::uuid
      and evidence_id =
        current_setting('ditele_test.secondary_evidence_id')::uuid
    from public.remove_task_uploaded_evidence(
      '01980a34-0000-7000-8000-000000000001',
      current_setting('ditele_test.secondary_evidence_id')::uuid,
      (select draft.row_version from public.attempt_drafts draft
       where draft.attempt_id = '01980a34-0000-7000-8000-000000000001'),
      'upload-remove-secondary-0001',
      '01980b02-0000-7000-8000-000000000011'
    )
  ),
  'unlinked ready evidence can be removed under the exact current draft version'
);

select ok(
  (
    select replayed
      and upload_id = current_setting('ditele_test.secondary_upload_id')::uuid
      and evidence_id =
        current_setting('ditele_test.secondary_evidence_id')::uuid
    from public.remove_task_uploaded_evidence(
      '01980a34-0000-7000-8000-000000000001',
      current_setting('ditele_test.secondary_evidence_id')::uuid,
      (select draft.row_version - 1
       from public.attempt_drafts draft
       where draft.attempt_id = '01980a34-0000-7000-8000-000000000001'),
      'upload-remove-secondary-0001',
      '01980b02-0000-7000-8000-000000000011'
    )
  ),
  'an exact remove retry replays even after the upload entered removed state'
);

select ok(
  (
    select count(*) = 1 and bool_and(recovered.immutable_linked)
    from public.list_my_ready_task_evidence_uploads(
      '01980a34-0000-7000-8000-000000000001'
    ) recovered
  ),
  'recovery hides both pending and removed uploads while retaining linked ready history'
);

select is(
  (
    select count(*)
    from public.get_task_evidence_download_target(
      current_setting('ditele_test.primary_evidence_id')::uuid
    )
  ),
  1::bigint,
  'authorized ready evidence resolves to one download target'
);
select is(
  (
    select count(*)
    from public.get_task_evidence_download_target(
      current_setting('ditele_test.secondary_evidence_id')::uuid
    )
  ),
  0::bigint,
  'removed evidence no longer resolves to a download target'
);
select is(
  (
    select count(*)
    from storage.objects object_record
    where object_record.bucket_id = 'task-evidence-private'
      and object_record.name =
        current_setting('ditele_test.secondary_object_key')
  ),
  0::bigint,
  'Storage RLS hides the removed object before asynchronous physical cleanup'
);
reset role;

set local role service_role;
select set_config(
  'ditele_test.cleanup_upload_id',
  (
    select upload_id::text
    from public.claim_task_evidence_upload_cleanup(
      10, 'pgtap.worker', '01980b02-0000-7000-8000-000000000012'
    )
    where upload_id =
      current_setting('ditele_test.secondary_upload_id')::uuid
  ),
  true
);
reset role;
select is(
  current_setting('ditele_test.cleanup_upload_id')::uuid,
  current_setting('ditele_test.secondary_upload_id')::uuid,
  'cleanup claims the removed upload with the expected worker lease'
);

delete from storage.objects object_record
using public.evidence_uploads upload
where upload.id = current_setting('ditele_test.secondary_upload_id')::uuid
  and object_record.bucket_id = upload.bucket_id
  and object_record.name = upload.object_key;

select set_config('storage.allow_delete_query', 'false', true);

set local role service_role;
select lives_ok(
  format(
    $sql$
      select * from public.complete_task_evidence_upload_cleanup(
        %L::uuid, 'pgtap.worker',
        '01980b02-0000-7000-8000-000000000012', true, null, null
      )
    $sql$,
    current_setting('ditele_test.secondary_upload_id')
  ),
  'a valid cleanup lease records successful physical deletion'
);
reset role;

select ok(
  exists (
    select 1
    from public.evidence_uploads upload
    join public.media_assets media on media.id = upload.media_asset_id
    where upload.id = current_setting('ditele_test.secondary_upload_id')::uuid
      and upload.storage_deleted_at is not null
      and upload.cleanup_claim_token is null
      and upload.cleanup_available_at is null
      and media.id = current_setting('ditele_test.secondary_media_id')::uuid
      and media.state = 'inactive'
      and media.deleted_at is not null
  ),
  'successful cleanup retires both storage lifecycle and linked media metadata'
);

set local role service_role;
select throws_ok(
  format(
    $sql$
      select * from public.complete_task_evidence_upload_cleanup(
        %L::uuid, 'pgtap.worker',
        '01980b02-0000-7000-8000-000000000012', true, null, null
      )
    $sql$,
    current_setting('ditele_test.secondary_upload_id')
  ),
  '40001', 'evidence upload cleanup claim is stale',
  'a completed cleanup lease cannot be replayed as a new deletion'
);
reset role;

select throws_ok(
  $$
    update public.evidence_upload_command_receipts
    set payload_hash = repeat('9', 64)
    where actor_id = '01980a00-0000-7000-8000-000000000001'
      and operation = 'intent'
      and idempotency_key = 'upload-primary-intent-0001'
  $$,
  '55000', 'evidence_upload_command_receipts is append-only',
  'command receipts cannot be rewritten'
);

select throws_ok(
  format(
    $sql$
      update public.evidence_uploads
      set object_key = object_key || '-tampered'
      where id = %L::uuid
    $sql$,
    current_setting('ditele_test.primary_upload_id')
  ),
  '55000', 'evidence upload identity is immutable',
  'an upload object target cannot be rewritten after intent creation'
);

select ok(
  exists (
    select 1 from public.audit_events event_record
    where event_record.event_type = 'evidence.upload_finalized'
      and event_record.aggregate_id =
        current_setting('ditele_test.primary_evidence_id')::uuid
  )
  and exists (
    select 1 from public.audit_events event_record
    where event_record.event_type = 'evidence.upload_removed'
      and event_record.aggregate_id =
        current_setting('ditele_test.secondary_evidence_id')::uuid
  )
  and exists (
    select 1 from public.audit_events event_record
    where event_record.event_type = 'evidence.upload_storage_deleted'
      and event_record.aggregate_id =
        current_setting('ditele_test.secondary_upload_id')::uuid
  )
  and exists (
    select 1 from public.outbox_events event_record
    where event_record.event_type = 'evidence.upload_finalized.v1'
      and event_record.aggregate_id =
        current_setting('ditele_test.primary_evidence_id')::uuid
  ),
  'finalize, remove, cleanup, and integration facts are durably audited'
);

select * from finish();
rollback;
