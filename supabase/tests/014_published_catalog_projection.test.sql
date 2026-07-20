begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'get_public_catalog'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = 'text'
  ),
  1::bigint,
  'one locale-aware public catalog list projection exists'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'get_public_catalog_course'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = 'text, uuid'
  ),
  1::bigint,
  'one slug-or-identifier public catalog detail projection exists'
);

select is(
  (
    select pg_catalog.pg_get_function_result(procedure_record.oid)
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname = 'get_public_catalog_course'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) = 'text, uuid'
  ),
  'TABLE(course_id uuid, slug text, default_locale text, estimated_minutes integer, version_number integer, published_at timestamp with time zone, task_count bigint, localizations jsonb)',
  'detail projection exposes only safe catalog metadata and localized learner content'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'public'
      and procedure_record.proname in (
        'get_public_catalog', 'get_public_catalog_course'
      )
      and procedure_record.prosecdef
      and procedure_record.provolatile = 's'
      and procedure_record.proconfig = array['search_path=""']::text[]
  ),
  2::bigint,
  'both catalog projections are stable security-definer functions with an empty search path'
);

select ok(
  (
    select procedure_record.prosecdef
      and procedure_record.provolatile = 's'
      and procedure_record.proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc procedure_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname = 'app_private'
      and procedure_record.proname = 'is_valid_public_catalog_snapshot'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'jsonb, uuid, text, uuid, integer'
  ),
  'private snapshot validation is stable, security-definer and search-path hardened'
);

select ok(
  has_function_privilege(
    'anon', 'public.get_public_catalog(text)', 'EXECUTE'
  )
  and has_function_privilege(
    'anon', 'public.get_public_catalog_course(text,uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.get_public_catalog(text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.get_public_catalog_course(text,uuid)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.get_public_catalog(text)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.get_public_catalog_course(text,uuid)', 'EXECUTE'
  ),
  'anonymous, authenticated and server callers can execute only the public projections'
);

select ok(
  not has_function_privilege(
    'anon',
    'app_private.is_valid_public_catalog_snapshot(jsonb,uuid,text,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'app_private.is_valid_public_catalog_snapshot(jsonb,uuid,text,uuid,integer)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'app_private.is_valid_public_catalog_snapshot(jsonb,uuid,text,uuid,integer)',
    'EXECUTE'
  ),
  'snapshot validation cannot be invoked through an API role'
);

create function pg_temp.catalog_snapshot_fixture(
  p_course_id uuid,
  p_slug text,
  p_content_version_id uuid,
  p_version_number integer,
  p_english_title text,
  p_extra jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              seed_version.snapshot,
              '{course,id}', to_jsonb(p_course_id::text)
            ),
            '{course,slug}', to_jsonb(p_slug)
          ),
          '{content_version,id}', to_jsonb(p_content_version_id::text)
        ),
        '{content_version,version_number}', to_jsonb(p_version_number)
      ),
      '{course,localizations,0,title}', to_jsonb(p_english_title)
    ) || p_extra
  from public.content_versions seed_version
  where seed_version.id = '01980a22-0000-7000-8000-000000000001';
$$;

select ok(
  (
    select app_private.is_valid_public_catalog_snapshot(
      version_record.snapshot,
      version_record.course_id,
      course_record.slug,
      version_record.id,
      version_record.version_number
    )
    from public.content_versions version_record
    join public.courses course_record on course_record.id = version_record.course_id
    where version_record.id = '01980a22-0000-7000-8000-000000000001'
  ),
  'the deterministic seed is a canonical schema-version-one snapshot'
);

select ok(
  not app_private.is_valid_public_catalog_snapshot(
    '{"seed":true,"version":1}'::jsonb,
    '01980c20-0000-7000-8000-000000000003',
    'malformed-latest',
    '01980c22-0000-7000-8000-000000000006',
    2
  ),
  'the legacy placeholder snapshot is rejected without a live-row fallback'
);

insert into public.organizations (id, slug, name, state)
values (
  '01980c10-0000-7000-8000-000000000001',
  'catalog-private-tenant', 'Catalog Private Tenant', 'active'
);

insert into public.courses (
  id, organization_id, slug, state, default_locale, estimated_minutes, created_by,
  archived_at
)
values
  ('01980c20-0000-7000-8000-000000000001', null, 'snapshot-latest', 'active', 'en', 999, '01980a00-0000-7000-8000-000000000003', null),
  ('01980c20-0000-7000-8000-000000000002', null, 'snapshot-archive', 'active', 'en', 999, '01980a00-0000-7000-8000-000000000003', null),
  ('01980c20-0000-7000-8000-000000000003', null, 'malformed-latest', 'active', 'en', 999, '01980a00-0000-7000-8000-000000000003', null),
  ('01980c20-0000-7000-8000-000000000004', null, 'archived-course', 'active', 'en', 999, '01980a00-0000-7000-8000-000000000003', statement_timestamp()),
  ('01980c20-0000-7000-8000-000000000005', '01980c10-0000-7000-8000-000000000001', 'tenant-private-course', 'active', 'en', 999, '01980a00-0000-7000-8000-000000000003', null),
  ('01980c20-0000-7000-8000-000000000006', null, 'safe-minimal-projection', 'active', 'en', 999, '01980a00-0000-7000-8000-000000000003', null),
  ('01980c20-0000-7000-8000-000000000007', null, 'inactive-course', 'inactive', 'en', 999, '01980a00-0000-7000-8000-000000000003', null);

insert into public.content_versions (
  id, course_id, version_number, state, change_summary, snapshot,
  created_by, published_by, published_at,
  archived_by, archived_at, archive_reason, archive_impact_fingerprint
)
values
  (
    '01980c22-0000-7000-8000-000000000001',
    '01980c20-0000-7000-8000-000000000001', 1, 'published',
    'Old immutable public snapshot',
    pg_temp.catalog_snapshot_fixture(
      '01980c20-0000-7000-8000-000000000001', 'snapshot-latest',
      '01980c22-0000-7000-8000-000000000001', 1, 'Older snapshot title'
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003', '2026-07-10 10:00:00+00',
    null, null, null, null
  ),
  (
    '01980c22-0000-7000-8000-000000000002',
    '01980c20-0000-7000-8000-000000000001', 2, 'published',
    'Latest immutable public snapshot',
    pg_temp.catalog_snapshot_fixture(
      '01980c20-0000-7000-8000-000000000001', 'snapshot-latest',
      '01980c22-0000-7000-8000-000000000002', 2, 'Latest snapshot title'
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003', '2026-07-09 10:00:00+00',
    null, null, null, null
  ),
  (
    '01980c22-0000-7000-8000-000000000003',
    '01980c20-0000-7000-8000-000000000002', 1, 'published',
    'Still-live prior snapshot',
    pg_temp.catalog_snapshot_fixture(
      '01980c20-0000-7000-8000-000000000002', 'snapshot-archive',
      '01980c22-0000-7000-8000-000000000003', 1, 'Live archive predecessor'
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003', '2026-07-08 10:00:00+00',
    null, null, null, null
  ),
  (
    '01980c22-0000-7000-8000-000000000004',
    '01980c20-0000-7000-8000-000000000002', 2, 'archived',
    'Archived newer snapshot',
    pg_temp.catalog_snapshot_fixture(
      '01980c20-0000-7000-8000-000000000002', 'snapshot-archive',
      '01980c22-0000-7000-8000-000000000004', 2, 'Archived newer title'
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003', '2026-07-11 10:00:00+00',
    '01980a00-0000-7000-8000-000000000003', '2026-07-12 10:00:00+00',
    'Archived for projection contract', repeat('a', 64)
  ),
  (
    '01980c22-0000-7000-8000-000000000005',
    '01980c20-0000-7000-8000-000000000003', 1, 'published',
    'Valid older snapshot that must not mask malformed latest publication',
    pg_temp.catalog_snapshot_fixture(
      '01980c20-0000-7000-8000-000000000003', 'malformed-latest',
      '01980c22-0000-7000-8000-000000000005', 1, 'Valid but superseded title'
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003', '2026-07-07 10:00:00+00',
    null, null, null, null
  ),
  (
    '01980c22-0000-7000-8000-000000000006',
    '01980c20-0000-7000-8000-000000000003', 2, 'published',
    'Malformed latest snapshot', '{"seed":true,"version":2}',
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003', '2026-07-13 10:00:00+00',
    null, null, null, null
  ),
  (
    '01980c22-0000-7000-8000-000000000007',
    '01980c20-0000-7000-8000-000000000004', 1, 'published',
    'Version on an archived course',
    pg_temp.catalog_snapshot_fixture(
      '01980c20-0000-7000-8000-000000000004', 'archived-course',
      '01980c22-0000-7000-8000-000000000007', 1, 'Archived course title'
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003', '2026-07-06 10:00:00+00',
    null, null, null, null
  ),
  (
    '01980c22-0000-7000-8000-000000000008',
    '01980c20-0000-7000-8000-000000000005', 1, 'published',
    'Tenant-private version',
    pg_temp.catalog_snapshot_fixture(
      '01980c20-0000-7000-8000-000000000005', 'tenant-private-course',
      '01980c22-0000-7000-8000-000000000008', 1, 'Tenant private title'
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003', '2026-07-05 10:00:00+00',
    null, null, null, null
  ),
  (
    '01980c22-0000-7000-8000-000000000009',
    '01980c20-0000-7000-8000-000000000006', 1, 'published',
    'Snapshot carrying ignored privileged extras',
    pg_temp.catalog_snapshot_fixture(
      '01980c20-0000-7000-8000-000000000006', 'safe-minimal-projection',
      '01980c22-0000-7000-8000-000000000009', 1, 'Safe projection title',
      jsonb_build_object(
        'task_model_answers', 'MODEL_ANSWER_MARKER',
        'is_correct', true,
        'object_key', 'PRIVATE_OBJECT_KEY_MARKER'
      )
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003', '2026-07-04 10:00:00+00',
    null, null, null, null
  ),
  (
    '01980c22-0000-7000-8000-000000000010',
    '01980c20-0000-7000-8000-000000000007', 1, 'published',
    'Version on an inactive course',
    pg_temp.catalog_snapshot_fixture(
      '01980c20-0000-7000-8000-000000000007', 'inactive-course',
      '01980c22-0000-7000-8000-000000000010', 1, 'Inactive course title'
    ),
    '01980a00-0000-7000-8000-000000000003',
    '01980a00-0000-7000-8000-000000000003', '2026-07-03 10:00:00+00',
    null, null, null, null
  );

-- Mutate normalized authoring data after publication. Neither list nor detail
-- may observe these values.
update public.course_localizations
set title = 'MUTABLE_NORMALIZED_TITLE_LEAK',
    summary = 'MUTABLE_NORMALIZED_SUMMARY_LEAK'
where course_id = '01980a20-0000-7000-8000-000000000001'
  and locale = 'en';

update public.courses
set estimated_minutes = 999
where id = '01980a20-0000-7000-8000-000000000001';

set local role anon;

select is(
  (select count(*)::bigint from public.get_public_catalog('en')),
  4::bigint,
  'anonymous catalog exposes only valid active global latest publications'
);

select is(
  (
    select version_number
    from public.get_public_catalog('en')
    where slug = 'snapshot-latest'
  ),
  2,
  'the greatest version number wins deterministically even with an older publication time'
);

select is(
  (
    select title
    from public.get_public_catalog('en')
    where slug = 'snapshot-latest'
  ),
  'Latest snapshot title',
  'catalog text comes from the selected immutable snapshot'
);

select is(
  (
    select version_number
    from public.get_public_catalog('en')
    where slug = 'snapshot-archive'
  ),
  1,
  'an archived newer version is excluded and the latest still-published version remains visible'
);

select is(
  (
    select count(*)::bigint
    from public.get_public_catalog('en')
    where slug in (
      'malformed-latest', 'archived-course', 'tenant-private-course',
      'inactive-course'
    )
  ),
  0::bigint,
  'malformed latest, archived, tenant-private and inactive courses all fail closed'
);

select is(
  (
    select title
    from public.get_public_catalog('en')
    where slug = 'practical-software-testing'
  ),
  'Practical Software Testing',
  'mutable normalized localization changes cannot alter published catalog text'
);

select is(
  (
    select estimated_minutes
    from public.get_public_catalog('en')
    where slug = 'practical-software-testing'
  ),
  480,
  'duration is read from the immutable snapshot instead of the mutated course row'
);

select is(
  (
    select task_count
    from public.get_public_catalog('en')
    where slug = 'snapshot-latest'
  ),
  1::bigint,
  'task count is derived from the snapshot even when no normalized tasks exist for the fixture'
);

select is(
  (
    select published_at
    from public.get_public_catalog('en')
    where slug = 'snapshot-latest'
  ),
  '2026-07-09 10:00:00+00'::timestamptz,
  'published time belongs to the deterministic selected publication'
);

select is(
  (
    select resolved_locale
    from public.get_public_catalog('de')
    where slug = 'practical-software-testing'
  ),
  'de',
  'German catalog resolution uses the immutable German localization'
);

select is(
  (
    select resolved_locale
    from public.get_public_catalog('ru')
    where slug = 'practical-software-testing'
  ),
  'ru',
  'Russian catalog resolution uses the immutable Russian localization'
);

select is(
  (
    select resolved_locale
    from public.get_public_catalog('fr')
    where slug = 'practical-software-testing'
  ),
  'en',
  'unsupported locales fall back deterministically to English'
);

select is(
  (
    select title_localizations ->> 'de'
    from public.get_public_catalog('en')
    where slug = 'practical-software-testing'
  ),
  'Praktisches Softwaretesten',
  'the safe list projection carries immutable localization maps for server rendering'
);

select is(
  (
    select count(*)::bigint
    from public.get_public_catalog_course('snapshot-latest', null)
  ),
  1::bigint,
  'anonymous detail lookup resolves a public course by snapshot slug'
);

select is(
  (
    select count(*)::bigint
    from public.get_public_catalog_course(
      null, '01980c20-0000-7000-8000-000000000001'
    )
  ),
  1::bigint,
  'anonymous detail lookup resolves a public course by identifier'
);

select is(
  (
    select count(*)::bigint
    from public.get_public_catalog_course(
      'snapshot-latest', '01980c20-0000-7000-8000-000000000001'
    )
  ),
  0::bigint,
  'detail lookup rejects ambiguous slug-and-identifier input'
);

select is(
  (
    select count(*)::bigint
    from public.get_public_catalog_course(null, null)
  ),
  0::bigint,
  'detail lookup rejects missing identity input'
);

select is(
  (
    select jsonb_array_length(localizations)
    from public.get_public_catalog_course('snapshot-latest', null)
  ),
  3,
  'detail projection exposes the three safe published localizations'
);

select ok(
  (
    select localizations @> '[{"locale":"en","learning_outcomes":["Design effective tests"]}]'::jsonb
    from public.get_public_catalog_course('snapshot-latest', null)
  ),
  'detail projection includes published learner-facing outcomes'
);

select ok(
  (
    select pg_catalog.row_to_json(catalog_row)::text
      not like '%MODEL_ANSWER_MARKER%'
      and pg_catalog.row_to_json(catalog_row)::text
        not like '%PRIVATE_OBJECT_KEY_MARKER%'
      and pg_catalog.row_to_json(catalog_row)::text not like '%is_correct%'
    from public.get_public_catalog('en') catalog_row
    where catalog_row.slug = 'safe-minimal-projection'
  ),
  'list projection cannot expose model answers, correctness or object keys carried by a payload'
);

select ok(
  (
    select pg_catalog.row_to_json(detail_row)::text
      not like '%MODEL_ANSWER_MARKER%'
      and pg_catalog.row_to_json(detail_row)::text
        not like '%PRIVATE_OBJECT_KEY_MARKER%'
      and pg_catalog.row_to_json(detail_row)::text not like '%is_correct%'
    from public.get_public_catalog_course(
      'safe-minimal-projection', null
    ) detail_row
  ),
  'detail projection cannot expose privileged snapshot extras'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000003', true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::bigint from public.get_public_catalog('en')),
  4::bigint,
  'authenticated callers receive the same actor-independent public catalog scope'
);

select is(
  (
    select count(*)::bigint
    from public.get_public_catalog('en')
    where slug = 'tenant-private-course'
  ),
  0::bigint,
  'authentication and administrative roles do not widen the public projection into a tenant catalog'
);

select is(
  (
    select count(*)::bigint
    from public.get_public_catalog_course('tenant-private-course', null)
  ),
  0::bigint,
  'authenticated detail lookup preserves tenant isolation'
);

select * from finish();
rollback;
