-- DiTeLe V2 canonical database foundation.
-- IDs exposed outside PostgreSQL use UUIDv7 for temporal locality and opacity.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;

create or replace function app_private.uuid7(p_timestamp timestamptz default clock_timestamp())
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  unix_ts_ms bigint;
  random_bytes bytea;
  uuid_hex text;
begin
  unix_ts_ms := floor(extract(epoch from p_timestamp) * 1000)::bigint;
  if unix_ts_ms < 0 or unix_ts_ms > 281474976710655 then
    raise exception 'timestamp is outside UUIDv7 range';
  end if;

  random_bytes := extensions.gen_random_bytes(10);
  uuid_hex := lpad(to_hex(unix_ts_ms), 12, '0')
    || '7'
    || substr(encode(random_bytes, 'hex'), 2, 3)
    || lpad(to_hex((get_byte(random_bytes, 2) & 63) | 128), 2, '0')
    || substr(encode(random_bytes, 'hex'), 7, 14);

  return uuid_hex::uuid;
end;
$$;

revoke all on function app_private.uuid7(timestamptz) from public;
grant usage on schema app_private to authenticated, service_role;
grant execute on function app_private.uuid7(timestamptz) to authenticated, service_role;

create type public.organization_state as enum ('active', 'suspended', 'archived');
create type public.membership_state as enum ('invited', 'active', 'suspended', 'removed');
create type public.record_state as enum ('draft', 'active', 'inactive', 'archived');
create type public.content_version_state as enum ('draft', 'in_review', 'published', 'archived');
create type public.cohort_state as enum ('waiting', 'active', 'completed', 'cancelled');
create type public.cohort_member_role as enum ('learner', 'trainer');
create type public.enrollment_state as enum ('requested', 'approved', 'rejected', 'assigned', 'cancelled', 'completed');
create type public.attempt_state as enum ('in_progress', 'submitted', 'revision_required', 'resubmitted', 'accepted', 'abandoned');
create type public.submission_state as enum ('submitted', 'revision_required', 'resubmitted', 'accepted', 'withdrawn');
create type public.review_decision as enum ('accepted', 'revision_required', 'transferred');
create type public.question_state as enum ('open', 'assigned', 'answered', 'transferred', 'archived');
create type public.lab_session_state as enum ('requested', 'provisioning', 'ready', 'active', 'validating', 'reset_pending', 'destroy_pending', 'destroyed', 'failed', 'expired');
create type public.certificate_state as enum ('eligible', 'issued', 'available', 'revoked', 'expired');
create type public.notification_state as enum ('pending', 'delivered', 'read', 'failed', 'cancelled');
create type public.delivery_state as enum ('pending', 'processing', 'delivered', 'retry_scheduled', 'dead_letter', 'cancelled');
create type public.request_state as enum ('requested', 'processing', 'completed', 'rejected', 'cancelled');
create type public.ai_mode as enum ('recommendation', 'learning', 'assessment', 'trainer_draft');
create type public.ai_safety_outcome as enum ('allowed', 'redacted', 'refused', 'escalated');

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create or replace function app_private.bump_row_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

create or replace function app_private.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end;
$$;

revoke all on function app_private.set_updated_at() from public;
revoke all on function app_private.bump_row_version() from public;
revoke all on function app_private.reject_mutation() from public;

