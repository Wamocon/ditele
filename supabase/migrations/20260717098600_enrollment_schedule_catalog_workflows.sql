-- WF-01/WF-06 completion and a deliberately narrow anonymous catalog boundary.

create or replace function public.assign_enrollment(
  p_enrollment_id uuid,
  p_cohort_id uuid,
  p_expected_version bigint,
  p_reason text,
  p_correlation_id uuid
)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  enrollment_row public.enrollments;
  cohort_row public.cohorts;
  active_learner_count integer;
  membership_exists boolean;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'assignment reason is required' using errcode = '22023';
  end if;

  select enrollment_record.* into enrollment_row
  from public.enrollments enrollment_record
  where enrollment_record.id = p_enrollment_id
  for update;

  if enrollment_row.id is null then
    raise exception 'enrollment is missing' using errcode = '40001';
  end if;
  if not (select app_private.has_permission(
    'enrollment.decide', enrollment_row.organization_id, p_cohort_id
  )) then
    raise exception 'enrollment assignment scope denied' using errcode = '42501';
  end if;
  if enrollment_row.row_version <> p_expected_version or enrollment_row.state <> 'approved' then
    raise exception 'enrollment is stale or not approved' using errcode = '40001';
  end if;

  select cohort_record.* into cohort_row
  from public.cohorts cohort_record
  where cohort_record.id = p_cohort_id
  for update;

  if cohort_row.id is null
     or cohort_row.organization_id <> enrollment_row.organization_id
     or cohort_row.course_id <> enrollment_row.course_id then
    raise exception 'cohort does not match enrollment organization and course' using errcode = '23514';
  end if;
  if cohort_row.state not in ('waiting', 'active') then
    raise exception 'cohort is not assignable' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = enrollment_row.organization_id
      and membership.user_id = enrollment_row.learner_id
      and membership.state = 'active'
      and (membership.valid_until is null or membership.valid_until > statement_timestamp())
  ) then
    raise exception 'learner is not an active organization member' using errcode = '23514';
  end if;

  select exists (
    select 1 from public.cohort_memberships membership
    where membership.cohort_id = cohort_row.id
      and membership.user_id = enrollment_row.learner_id
      and membership.role = 'learner'
      and membership.state = 'active'
  ) into membership_exists;

  select count(*) into active_learner_count
  from public.cohort_memberships membership
  where membership.cohort_id = cohort_row.id
    and membership.role = 'learner'
    and membership.state = 'active';

  if not membership_exists
     and cohort_row.capacity is not null
     and active_learner_count >= cohort_row.capacity then
    raise exception 'cohort capacity is exhausted' using errcode = '23514';
  end if;

  if not membership_exists then
    insert into public.cohort_memberships (
      cohort_id, user_id, role, state, assigned_by, assigned_at
    ) values (
      cohort_row.id, enrollment_row.learner_id, 'learner', 'active', actor_id,
      statement_timestamp()
    );
  end if;

  update public.enrollments enrollment_record
  set state = 'assigned',
      cohort_id = cohort_row.id,
      decision_reason = p_reason,
      decided_by = actor_id,
      decided_at = statement_timestamp()
  where enrollment_record.id = enrollment_row.id
    and enrollment_record.row_version = p_expected_version
  returning enrollment_record.* into enrollment_row;
  if enrollment_row.id is null then
    raise exception 'enrollment became stale' using errcode = '40001';
  end if;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    enrollment_row.organization_id, actor_id, 'admin', 'enrollment.assigned', 'enrollment',
    enrollment_row.id, enrollment_row.row_version, p_correlation_id,
    jsonb_build_object('cohort_id', cohort_row.id, 'reason', p_reason)
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    enrollment_row.organization_id, 'enrollment', enrollment_row.id,
    enrollment_row.row_version, 'enrollment.assigned.v1', 1, p_correlation_id,
    jsonb_build_object(
      'enrollment_id', enrollment_row.id,
      'learner_id', enrollment_row.learner_id,
      'course_id', enrollment_row.course_id,
      'cohort_id', cohort_row.id
    )
  );

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload, deduplication_key
  ) values (
    enrollment_row.organization_id,
    enrollment_row.learner_id,
    'enrollment.assigned',
    'notifications.enrollment_assigned',
    jsonb_build_object(
      'enrollment_id', enrollment_row.id,
      'course_id', enrollment_row.course_id,
      'cohort_id', cohort_row.id
    ),
    'enrollment-assigned:' || enrollment_row.id::text || ':version:' || enrollment_row.row_version::text
  ) on conflict (recipient_id, deduplication_key) do nothing;

  return enrollment_row;
end;
$$;

revoke all on function public.assign_enrollment(uuid, uuid, bigint, text, uuid) from public, anon;
grant execute on function public.assign_enrollment(uuid, uuid, bigint, text, uuid)
  to authenticated, service_role;

create or replace function public.update_task_schedule(
  p_cohort_id uuid,
  p_task_id uuid,
  p_expected_version bigint,
  p_available_from timestamptz,
  p_due_at timestamptz,
  p_reason text,
  p_correlation_id uuid
)
returns public.task_schedules
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  schedule_row public.task_schedules;
  cohort_row public.cohorts;
  actor_role text;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'schedule change reason is required' using errcode = '22023';
  end if;
  if p_due_at is not null and p_available_from is not null and p_due_at <= p_available_from then
    raise exception 'schedule due date must be after its availability date' using errcode = '22023';
  end if;

  select cohort_record.* into cohort_row
  from public.cohorts cohort_record
  where cohort_record.id = p_cohort_id;
  if cohort_row.id is null
     or not (select app_private.can_train_cohort(cohort_row.id)) then
    raise exception 'schedule management scope denied' using errcode = '42501';
  end if;
  if cohort_row.state not in ('waiting', 'active') then
    raise exception 'cohort schedule is closed' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.tasks task_row
    where task_row.id = p_task_id
      and task_row.course_id = cohort_row.course_id
      and task_row.state = 'active'
  ) then
    raise exception 'task is not active in the cohort course' using errcode = '23514';
  end if;

  update public.task_schedules schedule_record
  set available_from = p_available_from,
      due_at = p_due_at,
      changed_by = actor_id,
      change_reason = p_reason
  where schedule_record.cohort_id = p_cohort_id
    and schedule_record.task_id = p_task_id
    and schedule_record.row_version = p_expected_version
  returning schedule_record.* into schedule_row;
  if schedule_row.id is null then
    raise exception 'task schedule is stale or missing' using errcode = '40001';
  end if;

  actor_role := case when exists (
    select 1 from public.cohort_memberships membership
    where membership.cohort_id = cohort_row.id
      and membership.user_id = actor_id
      and membership.role = 'trainer'
      and membership.state = 'active'
  ) then 'trainer' else 'admin' end;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    cohort_row.organization_id, actor_id, actor_role, 'task_schedule.updated', 'task_schedule',
    schedule_row.id, schedule_row.row_version, p_correlation_id,
    jsonb_build_object(
      'cohort_id', cohort_row.id,
      'task_id', p_task_id,
      'available_from', p_available_from,
      'due_at', p_due_at,
      'reason', p_reason
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    cohort_row.organization_id, 'task_schedule', schedule_row.id, schedule_row.row_version,
    'task_schedule.updated.v1', 1, p_correlation_id,
    jsonb_build_object(
      'schedule_id', schedule_row.id,
      'cohort_id', cohort_row.id,
      'task_id', p_task_id,
      'available_from', p_available_from,
      'due_at', p_due_at
    )
  );

  return schedule_row;
end;
$$;

revoke all on function public.update_task_schedule(
  uuid, uuid, bigint, timestamptz, timestamptz, text, uuid
) from public, anon;
grant execute on function public.update_task_schedule(
  uuid, uuid, bigint, timestamptz, timestamptz, text, uuid
) to authenticated, service_role;

create or replace function public.get_public_catalog(p_locale text default 'en')
returns table (
  course_id uuid,
  slug text,
  title text,
  summary text,
  resolved_locale text,
  default_locale text,
  estimated_minutes integer,
  version_number integer,
  published_at timestamptz,
  task_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    course_row.id,
    course_row.slug,
    localization.title,
    localization.summary,
    localization.locale,
    course_row.default_locale,
    course_row.estimated_minutes,
    version_row.version_number,
    version_row.published_at,
    (
      select count(*)
      from public.tasks task_row
      where task_row.course_id = course_row.id
        and task_row.content_version_id = version_row.id
        and task_row.state = 'active'
    ) as task_count
  from public.courses course_row
  join lateral (
    select localization_row.locale, localization_row.title, localization_row.summary
    from public.course_localizations localization_row
    where localization_row.course_id = course_row.id
      and localization_row.locale in (
        case when p_locale in ('en', 'de', 'ru') then p_locale else 'en' end,
        course_row.default_locale,
        'en'
      )
    order by case localization_row.locale
      when case when p_locale in ('en', 'de', 'ru') then p_locale else 'en' end then 0
      when course_row.default_locale then 1
      else 2
    end
    limit 1
  ) localization on true
  join lateral (
    select version_record.id, version_record.version_number, version_record.published_at
    from public.content_versions version_record
    where version_record.course_id = course_row.id
      and version_record.state = 'published'
    order by version_record.version_number desc
    limit 1
  ) version_row on true
  where course_row.state = 'active'
    and course_row.archived_at is null
    and course_row.organization_id is null
  order by course_row.slug;
$$;

revoke all on function public.get_public_catalog(text) from public;
grant execute on function public.get_public_catalog(text) to anon, authenticated, service_role;
