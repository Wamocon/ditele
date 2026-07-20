begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_index index_record
    join pg_catalog.pg_class index_class
      on index_class.oid = index_record.indexrelid
    join pg_catalog.pg_class table_class
      on table_class.oid = index_record.indrelid
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = table_class.relnamespace
    where namespace_record.nspname = 'public'
      and table_class.relname = 'enrollment_request_receipts'
      and index_class.relname =
        'enrollment_request_receipts_result_context_idx'
      and index_record.indisvalid
      and index_record.indisready
      and pg_catalog.pg_get_indexdef(index_record.indexrelid) like
        '%(enrollment_id, organization_id, actor_id, course_id)%'
  ),
  1::bigint,
  'the receipt result-context index exists with the foreign-key column set'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_constraint constraint_record
    join pg_catalog.pg_class table_record
      on table_record.oid = constraint_record.conrelid
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = table_record.relnamespace
    where namespace_record.nspname = 'public'
      and constraint_record.contype = 'f'
      and not exists (
        select 1
        from pg_catalog.pg_index index_record
        where index_record.indrelid = constraint_record.conrelid
          and constraint_record.conkey <@ index_record.indkey::smallint[]
      )
  ),
  0::bigint,
  'every public foreign key is covered by an index'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    join pg_catalog.pg_class table_record
      on table_record.oid = constraint_record.conrelid
    where table_record.oid =
        'public.enrollment_request_receipts'::pg_catalog.regclass
      and constraint_record.conname =
        'enrollment_request_receipts_result_context_fk'
      and constraint_record.conkey <@ (
        select index_record.indkey::smallint[]
        from pg_catalog.pg_index index_record
        join pg_catalog.pg_class index_class
          on index_class.oid = index_record.indexrelid
        where index_class.relname =
          'enrollment_request_receipts_result_context_idx'
      )
  ),
  'the exact receipt result-context foreign key is covered'
);

select * from finish();
rollback;
