begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions;
select no_plan();

select has_table(
  'app_private',
  'authentication_rate_limit_buckets',
  'authentication rate-limit buckets live outside the public data schema'
);

select ok(
  (
    select table_record.relrowsecurity and table_record.relforcerowsecurity
    from pg_catalog.pg_class as table_record
    where table_record.oid =
      'app_private.authentication_rate_limit_buckets'::pg_catalog.regclass
  ),
  'the private bucket table enables and forces row-level security'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid =
        'app_private.authentication_rate_limit_buckets'::pg_catalog.regclass
      and constraint_record.contype = 'p'
      and pg_catalog.pg_get_constraintdef(constraint_record.oid) =
        'PRIMARY KEY (operation, subject_kind, subject_hash, window_started_at)'
  ),
  'one composite primary key serializes every operation and subject window'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes as index_record
    where index_record.schemaname = 'app_private'
      and index_record.tablename = 'authentication_rate_limit_buckets'
      and index_record.indexname =
        'authentication_rate_limit_buckets_expiry_idx'
  ),
  'bounded expired-row cleanup has an expiry index'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc as procedure_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    join pg_catalog.pg_roles as owner_record
      on owner_record.oid = procedure_record.proowner
    where namespace_record.nspname = 'public'
      and procedure_record.proname =
        'consume_authentication_rate_limit'
      and pg_catalog.oidvectortypes(procedure_record.proargtypes) =
        'text, text, text'
      and pg_catalog.pg_get_function_result(procedure_record.oid) = 'boolean'
      and procedure_record.provolatile = 'v'
      and procedure_record.prosecdef
      and procedure_record.proconfig = array['search_path=""']::text[]
      and owner_record.rolname = 'postgres'
  ),
  1::bigint,
  'the exact RPC is a postgres-owned volatile security-definer with an empty search path'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.consume_authentication_rate_limit(text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.consume_authentication_rate_limit(text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.consume_authentication_rate_limit(text,text,text)',
    'EXECUTE'
  ),
  'only the trusted service role can execute the authentication throttle RPC'
);

select ok(
  not has_table_privilege(
    'service_role',
    'app_private.authentication_rate_limit_buckets',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'authenticated',
    'app_private.authentication_rate_limit_buckets',
    'SELECT,INSERT,UPDATE,DELETE'
  )
  and not has_table_privilege(
    'anon',
    'app_private.authentication_rate_limit_buckets',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'no API role can inspect or mutate pseudonymous bucket rows directly'
);

select throws_ok(
  $$
    select public.consume_authentication_rate_limit(
      'unsupported', repeat('a', 64), repeat('b', 64)
    )
  $$,
  '22023',
  'unsupported authentication rate-limit operation',
  'the RPC rejects caller-defined operations and therefore caller-defined policy'
);

select throws_ok(
  $$
    select public.consume_authentication_rate_limit(
      'sign_in', 'raw-email@example.test', '192.0.2.1'
    )
  $$,
  '22023',
  'invalid authentication rate-limit subject',
  'the database refuses raw or malformed subject values'
);

set local role service_role;

select is(
  array(
    select public.consume_authentication_rate_limit(
      'sign_in', repeat('a', 64), repeat('b', 64)
    )
    from pg_catalog.generate_series(1, 5)
  ),
  array[true, true, true, true, true],
  'the first five sign-in attempts for one email and client are allowed'
);

select is(
  public.consume_authentication_rate_limit(
    'sign_in', repeat('a', 64), repeat('b', 64)
  ),
  false,
  'the sixth sign-in attempt for one email is denied'
);

select is(
  public.consume_authentication_rate_limit(
    'sign_in', repeat('c', 64), repeat('b', 64)
  ),
  true,
  'a distinct email remains independent below the shared client ceiling'
);

select is(
  array(
    select public.consume_authentication_rate_limit(
      'password_reset', repeat('d', 64), repeat('e', 64)
    )
    from pg_catalog.generate_series(1, 3)
  ),
  array[true, true, true],
  'the first three password-reset requests are allowed'
);

select is(
  public.consume_authentication_rate_limit(
    'password_reset', repeat('d', 64), repeat('e', 64)
  ),
  false,
  'the fourth password-reset request for one email is denied generically'
);

select is(
  array(
    select public.consume_authentication_rate_limit(
      'register',
      pg_catalog.lpad(series_record::text, 64, '0'),
      repeat('f', 64)
    )
    from pg_catalog.generate_series(1, 10) as series_record
  ),
  array[true, true, true, true, true, true, true, true, true, true],
  'ten unique registration emails remain allowed for one client window'
);

select is(
  public.consume_authentication_rate_limit(
    'register', pg_catalog.lpad('11', 64, '0'), repeat('f', 64)
  ),
  false,
  'the eleventh registration request for one client is denied'
);

reset role;

select is(
  (
    select count(*)::bigint
    from app_private.authentication_rate_limit_buckets as bucket
    where bucket.operation = 'register'
      and bucket.subject_kind = 'email'
      and bucket.subject_hash = pg_catalog.lpad('11', 64, '0')
  ),
  0::bigint,
  'a saturated client cannot create unbounded new email bucket rows'
);

select is(
  (
    select pg_catalog.max(bucket.attempt_count)
    from app_private.authentication_rate_limit_buckets as bucket
    where bucket.operation = 'sign_in'
      and bucket.subject_kind = 'email'
      and bucket.subject_hash = repeat('a', 64)
  ),
  6,
  'saturated email counts are capped at one denial marker'
);

-- Two service-role transactions consume the same initially absent pair. The
-- second waits on the first row lock, then observes and increments that exact
-- bucket after the first commits. No timing sleep is used.
select extensions.dblink_connect(
  'auth_rate_limit_a',
  'host=supabase_db_ditele-v2 port=5432 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'auth_rate_limit_b',
  'host=supabase_db_ditele-v2 port=5432 dbname=postgres user=postgres password=postgres'
);

select is(
  extensions.dblink_exec(
    'auth_rate_limit_a',
    'begin; set local role service_role'
  ),
  'SET'::text,
  'first concurrency session opens a service-role transaction'
);
select is(
  extensions.dblink_exec(
    'auth_rate_limit_b',
    'begin; set local role service_role'
  ),
  'SET'::text,
  'second concurrency session opens a service-role transaction'
);

select is(
  (
    select result_record.allowed
    from extensions.dblink(
      'auth_rate_limit_a',
      $query$
        select public.consume_authentication_rate_limit(
          'sign_in', repeat('7', 64), repeat('8', 64)
        )
      $query$
    ) as result_record(allowed boolean)
  ),
  true,
  'the first concurrent transaction consumes the initially absent bucket'
);

select ok(
  extensions.dblink_send_query(
    'auth_rate_limit_b',
    $query$
      select public.consume_authentication_rate_limit(
        'sign_in', repeat('7', 64), repeat('8', 64)
      )
    $query$
  ) = 1,
  'the second concurrent consume is dispatched while the first lock is held'
);

select is(
  extensions.dblink_is_busy('auth_rate_limit_b'),
  1,
  'the second consume waits on the canonical bucket row lock'
);

select is(
  extensions.dblink_exec('auth_rate_limit_a', 'commit'),
  'COMMIT'::text,
  'the first concurrent consume commits and releases its bucket lock'
);

select is(
  (
    select result_record.allowed
    from extensions.dblink_get_result('auth_rate_limit_b')
      as result_record(allowed boolean)
  ),
  true,
  'the second concurrent consume resumes and increments the committed bucket'
);

select is(
  extensions.dblink_exec('auth_rate_limit_b', 'commit'),
  'COMMIT'::text,
  'the second concurrent consume commits cleanly'
);

select is(
  (
    select pg_catalog.max(bucket.attempt_count)
    from app_private.authentication_rate_limit_buckets as bucket
    where bucket.operation = 'sign_in'
      and bucket.subject_kind = 'email'
      and bucket.subject_hash = repeat('7', 64)
  ),
  2,
  'both concurrent consumes are retained without a lost update'
);

select is(
  extensions.dblink_exec(
    'auth_rate_limit_a',
    $cleanup$
      delete from app_private.authentication_rate_limit_buckets
      where subject_hash in (repeat('7', 64), repeat('8', 64))
    $cleanup$
  ),
  'DELETE 2'::text,
  'the external concurrency fixture is removed durably'
);

select is(
  extensions.dblink_disconnect('auth_rate_limit_a'),
  'OK'::text,
  'first concurrency session disconnects cleanly'
);
select is(
  extensions.dblink_disconnect('auth_rate_limit_b'),
  'OK'::text,
  'second concurrency session disconnects cleanly'
);

select * from finish();
rollback;
