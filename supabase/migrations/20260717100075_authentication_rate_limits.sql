-- Distributed authentication throttling. Subjects are HMAC-SHA256 digests;
-- raw email addresses and client network identifiers must never reach this table.

create table app_private.authentication_rate_limit_buckets (
  operation text not null,
  subject_kind text not null,
  subject_hash text not null,
  window_started_at timestamptz not null,
  attempt_count integer not null,
  expires_at timestamptz not null,
  last_consumed_at timestamptz not null,
  primary key (operation, subject_kind, subject_hash, window_started_at),
  constraint authentication_rate_limit_operation_check
    check (operation in ('sign_in', 'register', 'password_reset')),
  constraint authentication_rate_limit_subject_kind_check
    check (subject_kind in ('email', 'client')),
  constraint authentication_rate_limit_subject_hash_check
    check (
      pg_catalog.char_length(subject_hash) = 64
      and subject_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint authentication_rate_limit_attempt_count_check
    check (attempt_count between 1 and 31),
  constraint authentication_rate_limit_expiry_check
    check (expires_at > window_started_at)
);

comment on table app_private.authentication_rate_limit_buckets is
  'Fixed-window authentication throttle buckets. subject_hash is a server-side, domain-separated HMAC digest; raw email and network identifiers are prohibited.';

create index authentication_rate_limit_buckets_expiry_idx
  on app_private.authentication_rate_limit_buckets (expires_at);

alter table app_private.authentication_rate_limit_buckets enable row level security;
alter table app_private.authentication_rate_limit_buckets force row level security;

revoke all on table app_private.authentication_rate_limit_buckets
  from public, anon, authenticated, service_role;

create or replace function public.consume_authentication_rate_limit(
  p_operation text,
  p_email_subject text,
  p_client_subject text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_consumed_at constant timestamptz := pg_catalog.statement_timestamp();
  window_seconds integer;
  email_limit integer;
  client_limit integer;
  window_started timestamptz;
  bucket_expires_at timestamptz;
  consumed_count integer;
begin
  if p_operation = 'sign_in' then
    window_seconds := 900;
    email_limit := 5;
    client_limit := 30;
  elsif p_operation = 'register' then
    window_seconds := 3600;
    email_limit := 3;
    client_limit := 10;
  elsif p_operation = 'password_reset' then
    window_seconds := 3600;
    email_limit := 3;
    client_limit := 10;
  else
    raise exception using
      errcode = '22023',
      message = 'unsupported authentication rate-limit operation';
  end if;

  if p_email_subject is null
     or pg_catalog.char_length(p_email_subject) <> 64
     or p_email_subject !~ '^[0-9a-f]{64}$'
     or p_client_subject is null
     or pg_catalog.char_length(p_client_subject) <> 64
     or p_client_subject !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'invalid authentication rate-limit subject';
  end if;

  window_started := pg_catalog.to_timestamp(
    pg_catalog.floor(
      extract(epoch from v_consumed_at) / window_seconds
    ) * window_seconds
  );
  bucket_expires_at :=
    window_started
    + pg_catalog.make_interval(secs => window_seconds * 2);

  -- Keep cleanup work bounded and indexed. A quiet installation may retain
  -- expired pseudonymous rows until the next authentication request.
  with expired_bucket as (
    select bucket.ctid
    from app_private.authentication_rate_limit_buckets as bucket
    where bucket.expires_at < v_consumed_at
    order by bucket.expires_at
    limit 100
  )
  delete from app_private.authentication_rate_limit_buckets as bucket
  using expired_bucket
  where bucket.ctid = expired_bucket.ctid;

  -- Consume the client bucket first. Once it is saturated, arbitrary email
  -- input cannot create an unbounded number of new email bucket rows.
  insert into app_private.authentication_rate_limit_buckets as bucket (
    operation,
    subject_kind,
    subject_hash,
    window_started_at,
    attempt_count,
    expires_at,
    last_consumed_at
  )
  values (
    p_operation,
    'client',
    p_client_subject,
    window_started,
    1,
    bucket_expires_at,
    v_consumed_at
  )
  on conflict (operation, subject_kind, subject_hash, window_started_at)
  do update set
    attempt_count = case
      when bucket.attempt_count >= client_limit then client_limit + 1
      else bucket.attempt_count + 1
    end,
    expires_at = excluded.expires_at,
    last_consumed_at = excluded.last_consumed_at
  returning attempt_count into consumed_count;

  if consumed_count > client_limit then
    return false;
  end if;

  insert into app_private.authentication_rate_limit_buckets as bucket (
    operation,
    subject_kind,
    subject_hash,
    window_started_at,
    attempt_count,
    expires_at,
    last_consumed_at
  )
  values (
    p_operation,
    'email',
    p_email_subject,
    window_started,
    1,
    bucket_expires_at,
    v_consumed_at
  )
  on conflict (operation, subject_kind, subject_hash, window_started_at)
  do update set
    attempt_count = case
      when bucket.attempt_count >= email_limit then email_limit + 1
      else bucket.attempt_count + 1
    end,
    expires_at = excluded.expires_at,
    last_consumed_at = excluded.last_consumed_at
  returning attempt_count into consumed_count;

  return consumed_count <= email_limit;
end;
$$;

comment on function public.consume_authentication_rate_limit(text, text, text) is
  'Atomically consumes server-generated email and client HMAC throttle subjects. Returns false when either fixed-window limit is exhausted.';

revoke all on function public.consume_authentication_rate_limit(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_authentication_rate_limit(text, text, text)
  to service_role;
