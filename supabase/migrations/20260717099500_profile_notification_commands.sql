-- Learner account commands: field-limited profile updates and monotonic,
-- actor-derived notification mutations. Direct table writes are removed so a
-- browser cannot change ownership, delivery facts, profile state, or audit data.

alter table public.notifications
  add column row_version bigint not null default 1,
  add column updated_at timestamptz not null default statement_timestamp(),
  add constraint notifications_row_version_positive check (row_version > 0);

create trigger notifications_bump_row_version
before update on public.notifications
for each row execute function app_private.bump_row_version();

alter table public.notification_preferences
  add column row_version bigint not null default 1,
  add constraint notification_preferences_row_version_positive
    check (row_version > 0);

drop trigger if exists notification_preferences_set_updated_at
  on public.notification_preferences;
create trigger notification_preferences_bump_row_version
before update on public.notification_preferences
for each row execute function app_private.bump_row_version();

-- One private receipt ledger binds an actor-scoped idempotency key to one
-- canonical command payload. Results contain only mutation metadata, not raw
-- profile or notification payload data.
create table public.learner_account_command_receipts (
  id uuid primary key default app_private.uuid7(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (operation in (
    'profile.update',
    'notification.mark_read',
    'notification.mark_all_read',
    'notification_preferences.update_family'
  )),
  aggregate_id uuid,
  idempotency_key text not null check (
    length(idempotency_key) between 16 and 200
  ),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint learner_account_receipts_actor_operation_key_unique
    unique (actor_id, operation, idempotency_key)
);

create index learner_account_receipts_actor_time_idx
  on public.learner_account_command_receipts (actor_id, created_at desc);

alter table public.learner_account_command_receipts enable row level security;
alter table public.learner_account_command_receipts force row level security;
revoke all on public.learner_account_command_receipts
  from public, anon, authenticated;
grant select on public.learner_account_command_receipts to service_role;

create trigger learner_account_command_receipts_immutable
before update or delete on public.learner_account_command_receipts
for each row execute function app_private.reject_mutation();

create or replace function app_private.current_actor_has_active_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile_record
    where profile_record.user_id = (select auth.uid())
      and profile_record.state = 'active'
      and profile_record.deactivated_at is null
  );
$$;

revoke all on function app_private.current_actor_has_active_profile()
  from public, anon, authenticated, service_role;

create or replace function app_private.current_actor_has_self_permission(
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles role_assignment
    join public.role_permissions role_permission
      on role_permission.role_id = role_assignment.role_id
    join public.permissions permission_record
      on permission_record.id = role_permission.permission_id
    where role_assignment.user_id = (select auth.uid())
      and permission_record.code = p_permission_code
      and role_assignment.revoked_at is null
      and role_assignment.valid_from <= statement_timestamp()
      and (
        role_assignment.valid_until is null
        or role_assignment.valid_until > statement_timestamp()
      )
  );
$$;

revoke all on function app_private.current_actor_has_self_permission(text)
  from public, anon, authenticated, service_role;

create or replace function public.update_own_profile(
  p_display_name text,
  p_locale text,
  p_timezone text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  normalized_display_name text := btrim(p_display_name);
  normalized_timezone text := btrim(p_timezone);
  profile_row public.profiles;
  receipt_row public.learner_account_command_receipts;
  payload_hash text;
  result_payload jsonb;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not (select app_private.current_actor_has_active_profile())
     or not (select app_private.current_actor_has_self_permission(
       'profile.update_self'
     )) then
    raise exception 'profile update scope denied' using errcode = '42501';
  end if;
  if normalized_display_name is null
     or length(normalized_display_name) not between 1 and 160
     or p_locale not in ('en', 'de', 'ru')
     or normalized_timezone is null
     or length(normalized_timezone) not between 1 and 100
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names timezone_record
       where timezone_record.name = normalized_timezone
     )
     or p_expected_version is null or p_expected_version < 1
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid profile values, CAS, idempotency key and correlation ID are required'
      using errcode = '22023';
  end if;

  payload_hash := encode(extensions.digest(
    jsonb_build_object(
      'display_name', normalized_display_name,
      'locale', p_locale,
      'timezone', normalized_timezone,
      'expected_version', p_expected_version
    )::text,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_id::text || ':profile.update:' || p_idempotency_key, 0
  ));

  select receipt_record.* into receipt_row
  from public.learner_account_command_receipts receipt_record
  where receipt_record.actor_id = v_actor_id
    and receipt_record.operation = 'profile.update'
    and receipt_record.idempotency_key = p_idempotency_key;
  if receipt_row.id is not null then
    if receipt_row.payload_hash <> payload_hash then
      raise exception 'idempotency key was reused with a different profile payload'
        using errcode = '22023';
    end if;
    return receipt_row.result;
  end if;

  select profile_record.* into profile_row
  from public.profiles profile_record
  where profile_record.user_id = v_actor_id
    and profile_record.state = 'active'
  for update;
  if profile_row.user_id is null
     or profile_row.row_version <> p_expected_version then
    raise exception 'profile is stale or unavailable' using errcode = '40001';
  end if;

  update public.profiles profile_record
  set display_name = normalized_display_name,
      locale = p_locale,
      timezone = normalized_timezone
  where profile_record.user_id = v_actor_id
    and profile_record.row_version = p_expected_version
    and profile_record.state = 'active'
  returning profile_record.* into profile_row;
  if profile_row.user_id is null then
    raise exception 'profile became stale' using errcode = '40001';
  end if;

  result_payload := jsonb_build_object('row_version', profile_row.row_version);

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    null, v_actor_id, 'self', 'profile.updated', 'profile',
    v_actor_id, profile_row.row_version, p_correlation_id,
    jsonb_build_object('locale', p_locale, 'timezone', normalized_timezone)
  );

  insert into public.learner_account_command_receipts (
    actor_id, operation, aggregate_id, idempotency_key, payload_hash,
    result, correlation_id
  ) values (
    v_actor_id, 'profile.update', v_actor_id, p_idempotency_key, payload_hash,
    result_payload, p_correlation_id
  );

  return result_payload;
end;
$$;

revoke all on function public.update_own_profile(
  text, text, text, bigint, text, uuid
) from public, anon;
grant execute on function public.update_own_profile(
  text, text, text, bigint, text, uuid
) to authenticated, service_role;

create or replace function public.mark_notification_read(
  p_notification_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  notification_row public.notifications;
  receipt_row public.learner_account_command_receipts;
  payload_hash text;
  result_payload jsonb;
begin
  if v_actor_id is null
     or not (select app_private.current_actor_has_active_profile()) then
    raise exception 'notification read scope denied' using errcode = '42501';
  end if;
  if p_notification_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid notification, CAS, idempotency key and correlation ID are required'
      using errcode = '22023';
  end if;

  payload_hash := encode(extensions.digest(
    jsonb_build_object(
      'notification_id', p_notification_id,
      'expected_version', p_expected_version
    )::text,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_id::text || ':notification.mark_read:' || p_idempotency_key, 0
  ));

  select receipt_record.* into receipt_row
  from public.learner_account_command_receipts receipt_record
  where receipt_record.actor_id = v_actor_id
    and receipt_record.operation = 'notification.mark_read'
    and receipt_record.idempotency_key = p_idempotency_key;
  if receipt_row.id is not null then
    if receipt_row.aggregate_id <> p_notification_id
       or receipt_row.payload_hash <> payload_hash then
      raise exception 'idempotency key was reused with a different notification payload'
        using errcode = '22023';
    end if;
    return receipt_row.result;
  end if;

  select notification_record.* into notification_row
  from public.notifications notification_record
  where notification_record.id = p_notification_id
    and notification_record.recipient_id = v_actor_id
    and notification_record.cancelled_at is null
    and notification_record.state <> 'cancelled'
  for update;
  if notification_row.id is null then
    raise exception 'notification read scope denied' using errcode = '42501';
  end if;
  if notification_row.row_version <> p_expected_version
     or notification_row.read_at is not null then
    raise exception 'notification is stale or already read' using errcode = '40001';
  end if;

  update public.notifications notification_record
  set read_at = statement_timestamp()
  where notification_record.id = p_notification_id
    and notification_record.recipient_id = v_actor_id
    and notification_record.row_version = p_expected_version
    and notification_record.read_at is null
    and notification_record.cancelled_at is null
    and notification_record.state <> 'cancelled'
  returning notification_record.* into notification_row;
  if notification_row.id is null then
    raise exception 'notification became stale' using errcode = '40001';
  end if;

  result_payload := jsonb_build_object(
    'notification_id', notification_row.id,
    'row_version', notification_row.row_version,
    'read_at', notification_row.read_at
  );

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    notification_row.organization_id, v_actor_id, 'self',
    'notification.read', 'notification', notification_row.id,
    notification_row.row_version, p_correlation_id, '{}'::jsonb
  );

  insert into public.learner_account_command_receipts (
    actor_id, operation, aggregate_id, idempotency_key, payload_hash,
    result, correlation_id
  ) values (
    v_actor_id, 'notification.mark_read', notification_row.id,
    p_idempotency_key, payload_hash, result_payload, p_correlation_id
  );

  return result_payload;
end;
$$;

revoke all on function public.mark_notification_read(uuid, bigint, text, uuid)
  from public, anon;
grant execute on function public.mark_notification_read(uuid, bigint, text, uuid)
  to authenticated, service_role;

create or replace function public.mark_all_notifications_read(
  p_before timestamptz,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  receipt_row public.learner_account_command_receipts;
  payload_hash text;
  result_payload jsonb;
  changed_count bigint;
begin
  if v_actor_id is null
     or not (select app_private.current_actor_has_active_profile()) then
    raise exception 'notification read scope denied' using errcode = '42501';
  end if;
  if p_before is null
     or p_before > statement_timestamp() + interval '5 minutes'
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid read boundary, idempotency key and correlation ID are required'
      using errcode = '22023';
  end if;

  payload_hash := encode(extensions.digest(
    jsonb_build_object('before', p_before)::text,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_id::text || ':notification.mark_all_read:' || p_idempotency_key, 0
  ));

  select receipt_record.* into receipt_row
  from public.learner_account_command_receipts receipt_record
  where receipt_record.actor_id = v_actor_id
    and receipt_record.operation = 'notification.mark_all_read'
    and receipt_record.idempotency_key = p_idempotency_key;
  if receipt_row.id is not null then
    if receipt_row.payload_hash <> payload_hash then
      raise exception 'idempotency key was reused with a different read boundary'
        using errcode = '22023';
    end if;
    return receipt_row.result;
  end if;

  update public.notifications notification_record
  set read_at = statement_timestamp()
  where notification_record.recipient_id = v_actor_id
    and notification_record.read_at is null
    and notification_record.cancelled_at is null
    and notification_record.state <> 'cancelled'
    and notification_record.created_at <= p_before;
  get diagnostics changed_count = row_count;

  result_payload := jsonb_build_object(
    'updated_count', changed_count,
    'before', p_before
  );

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    null, v_actor_id, 'self', 'notification.read_all', 'notification_inbox',
    null, null, p_correlation_id,
    jsonb_build_object('updated_count', changed_count, 'before', p_before)
  );

  insert into public.learner_account_command_receipts (
    actor_id, operation, aggregate_id, idempotency_key, payload_hash,
    result, correlation_id
  ) values (
    v_actor_id, 'notification.mark_all_read', null, p_idempotency_key,
    payload_hash, result_payload, p_correlation_id
  );

  return result_payload;
end;
$$;

revoke all on function public.mark_all_notifications_read(timestamptz, text, uuid)
  from public, anon;
grant execute on function public.mark_all_notifications_read(timestamptz, text, uuid)
  to authenticated, service_role;

create or replace function public.set_notification_family_preferences(
  p_event_family text,
  p_in_app_enabled boolean,
  p_email_enabled boolean,
  p_push_enabled boolean,
  p_expected_in_app_version bigint,
  p_expected_email_version bigint,
  p_expected_push_version bigint,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  supported_families constant text[] := array[
    'enrollment', 'review', 'question', 'submission', 'certificate'
  ];
  channels constant text[] := array['in_app', 'email', 'push'];
  enabled_values boolean[] := array[
    p_in_app_enabled, p_email_enabled, p_push_enabled
  ];
  expected_versions bigint[] := array[
    p_expected_in_app_version,
    p_expected_email_version,
    p_expected_push_version
  ];
  receipt_row public.learner_account_command_receipts;
  payload_hash text;
  result_payload jsonb;
  preference_payload jsonb := '[]'::jsonb;
  result_version bigint;
begin
  if v_actor_id is null
     or not (select app_private.current_actor_has_active_profile()) then
    raise exception 'notification preference scope denied' using errcode = '42501';
  end if;
  if p_event_family is null
     or not (p_event_family = any(supported_families))
     or p_in_app_enabled is null
     or p_email_enabled is null
     or p_push_enabled is null
     or p_expected_in_app_version is null
     or p_expected_email_version is null
     or p_expected_push_version is null
     or p_expected_in_app_version < 0
     or p_expected_email_version < 0
     or p_expected_push_version < 0
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid preference values, CAS, idempotency key and correlation ID are required'
      using errcode = '22023';
  end if;

  payload_hash := encode(extensions.digest(
    jsonb_build_object(
      'event_family', p_event_family,
      'in_app_enabled', p_in_app_enabled,
      'email_enabled', p_email_enabled,
      'push_enabled', p_push_enabled,
      'expected_in_app_version', p_expected_in_app_version,
      'expected_email_version', p_expected_email_version,
      'expected_push_version', p_expected_push_version
    )::text,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_id::text || ':notification_preferences.update_family:'
      || p_idempotency_key,
    0
  ));

  select receipt_record.* into receipt_row
  from public.learner_account_command_receipts receipt_record
  where receipt_record.actor_id = v_actor_id
    and receipt_record.operation = 'notification_preferences.update_family'
    and receipt_record.idempotency_key = p_idempotency_key;
  if receipt_row.id is not null then
    if receipt_row.payload_hash <> payload_hash then
      raise exception 'idempotency key was reused with a different preference payload'
        using errcode = '22023';
    end if;
    return receipt_row.result;
  end if;

  for item_index in 1..3 loop
    result_version := null;
    if expected_versions[item_index] = 0 then
      insert into public.notification_preferences (
        user_id, channel, event_family, enabled
      ) values (
        v_actor_id, channels[item_index], p_event_family,
        enabled_values[item_index]
      )
      on conflict (user_id, channel, event_family) do nothing
      returning row_version into result_version;
    else
      update public.notification_preferences preference_record
      set enabled = enabled_values[item_index]
      where preference_record.user_id = v_actor_id
        and preference_record.channel = channels[item_index]
        and preference_record.event_family = p_event_family
        and preference_record.row_version = expected_versions[item_index]
      returning preference_record.row_version into result_version;
    end if;

    if result_version is null then
      raise exception 'notification preference is stale'
        using errcode = '40001';
    end if;

    preference_payload := preference_payload || jsonb_build_array(
      jsonb_build_object(
        'channel', channels[item_index],
        'enabled', enabled_values[item_index],
        'row_version', result_version
      )
    );
  end loop;

  result_payload := jsonb_build_object(
    'event_family', p_event_family,
    'preferences', preference_payload
  );

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    null, v_actor_id, 'self', 'notification.preferences_updated', 'profile',
    v_actor_id,
    greatest(
      (preference_payload -> 0 ->> 'row_version')::bigint,
      (preference_payload -> 1 ->> 'row_version')::bigint,
      (preference_payload -> 2 ->> 'row_version')::bigint
    ),
    p_correlation_id,
    jsonb_build_object(
      'event_family', p_event_family,
      'in_app_enabled', p_in_app_enabled,
      'email_enabled', p_email_enabled,
      'push_enabled', p_push_enabled
    )
  );

  insert into public.learner_account_command_receipts (
    actor_id, operation, aggregate_id, idempotency_key, payload_hash,
    result, correlation_id
  ) values (
    v_actor_id, 'notification_preferences.update_family', v_actor_id,
    p_idempotency_key, payload_hash, result_payload, p_correlation_id
  );

  return result_payload;
end;
$$;

revoke all on function public.set_notification_family_preferences(
  text, boolean, boolean, boolean, bigint, bigint, bigint, text, uuid
) from public, anon;
grant execute on function public.set_notification_family_preferences(
  text, boolean, boolean, boolean, bigint, bigint, bigint, text, uuid
) to authenticated, service_role;

-- Replace permissive column-wide policies with read-only ownership policies.
-- Mutations execute only through the field-limited functions above.
drop policy if exists profiles_self_update on public.profiles;
revoke insert, update, delete on public.profiles from authenticated;

drop policy if exists notifications_self_update on public.notifications;
revoke insert, update, delete on public.notifications from authenticated;

drop policy if exists notification_preferences_self
  on public.notification_preferences;
create policy notification_preferences_self_read
  on public.notification_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete on public.notification_preferences
  from authenticated;
