-- Actor-derived learner reads over exact immutable publication snapshots.
-- Browser callers never receive normalized authoring rows or hidden answer,
-- rubric, competency, or storage fields through these projections.

create function app_private.normalized_learning_locale(p_locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_locale, '')))
    when 'de' then 'de'
    when 'ru' then 'ru'
    else 'en'
  end;
$$;

create function app_private.resolve_snapshot_localization(
  p_localizations jsonb,
  p_locale text,
  p_default_locale text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select localization_record.value
  from jsonb_array_elements(p_localizations) localization_record
  where localization_record.value ->> 'locale' in (
    app_private.normalized_learning_locale(p_locale),
    p_default_locale,
    'en', 'de', 'ru'
  )
  order by case localization_record.value ->> 'locale'
    when app_private.normalized_learning_locale(p_locale) then 0
    when p_default_locale then 1
    when 'en' then 2
    when 'de' then 3
    when 'ru' then 4
    else 5
  end
  limit 1;
$$;

create function app_private.strip_learner_markup(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(coalesce(p_value, ''), '<[^>]*>', ' ', 'g'),
    '[[:space:]]+', ' ', 'g'
  ));
$$;

create function app_private.snapshot_localized_text_map(
  p_localizations jsonb,
  p_field text,
  p_strip_markup boolean default false
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'en', case when p_strip_markup
      then app_private.strip_learner_markup(en_record.value ->> p_field)
      else en_record.value ->> p_field end,
    'de', case when p_strip_markup
      then app_private.strip_learner_markup(de_record.value ->> p_field)
      else de_record.value ->> p_field end,
    'ru', case when p_strip_markup
      then app_private.strip_learner_markup(ru_record.value ->> p_field)
      else ru_record.value ->> p_field end
  )
  from (
    select localization_record.value
    from jsonb_array_elements(p_localizations) localization_record
    where localization_record.value ->> 'locale' = 'en'
    limit 1
  ) en_record
  cross join (
    select localization_record.value
    from jsonb_array_elements(p_localizations) localization_record
    where localization_record.value ->> 'locale' = 'de'
    limit 1
  ) de_record
  cross join (
    select localization_record.value
    from jsonb_array_elements(p_localizations) localization_record
    where localization_record.value ->> 'locale' = 'ru'
    limit 1
  ) ru_record;
$$;

create function app_private.is_valid_learner_content_snapshot(
  p_snapshot jsonb,
  p_course_id uuid,
  p_course_slug text,
  p_content_version_id uuid,
  p_version_number integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stage_payload jsonb;
  stage_localization jsonb;
  task_payload jsonb;
  task_localization jsonb;
  option_payload jsonb;
  hint_payload jsonb;
  seen_stage_ids uuid[] := '{}'::uuid[];
  seen_task_ids uuid[] := '{}'::uuid[];
  seen_option_ids uuid[];
  seen_hint_ids uuid[];
  parsed_id uuid;
begin
  if not app_private.is_valid_public_catalog_snapshot(
    p_snapshot,
    p_course_id,
    p_course_slug,
    p_content_version_id,
    p_version_number
  ) then
    return false;
  end if;

  if (
    select count(*) <> count(distinct stage_record.value ->> 'position')
    from jsonb_array_elements(p_snapshot -> 'stages') stage_record
  ) then
    return false;
  end if;

  for stage_payload in
    select stage_record.value
    from jsonb_array_elements(p_snapshot -> 'stages') stage_record
  loop
    if jsonb_typeof(stage_payload) is distinct from 'object'
       or jsonb_typeof(stage_payload -> 'id') is distinct from 'string'
       or jsonb_typeof(stage_payload -> 'position') is distinct from 'number'
       or (stage_payload ->> 'position') !~ '^(0|[1-9][0-9]*)$'
       or (stage_payload ->> 'position')::numeric > 2147483647
       or jsonb_typeof(stage_payload -> 'localizations') is distinct from 'array'
       or jsonb_array_length(stage_payload -> 'localizations') <> 3
       or jsonb_typeof(stage_payload -> 'tasks') is distinct from 'array'
       or jsonb_array_length(stage_payload -> 'tasks') = 0 then
      return false;
    end if;

    parsed_id := (stage_payload ->> 'id')::uuid;
    if parsed_id = any(seen_stage_ids) then return false; end if;
    seen_stage_ids := pg_catalog.array_append(seen_stage_ids, parsed_id);

    if (
      select count(distinct localization_record.value ->> 'locale') <> 3
        or count(*) filter (
          where localization_record.value ->> 'locale' in ('en', 'de', 'ru')
        ) <> 3
      from jsonb_array_elements(
        stage_payload -> 'localizations'
      ) localization_record
    ) then
      return false;
    end if;

    for stage_localization in
      select localization_record.value
      from jsonb_array_elements(
        stage_payload -> 'localizations'
      ) localization_record
    loop
      if jsonb_typeof(stage_localization) is distinct from 'object'
         or jsonb_typeof(stage_localization -> 'title') is distinct from 'string'
         or nullif(btrim(stage_localization ->> 'title'), '') is null
         or jsonb_typeof(stage_localization -> 'description_html')
           is distinct from 'string' then
        return false;
      end if;
    end loop;

    if (
      select count(*) <> count(distinct task_record.value ->> 'position')
      from jsonb_array_elements(stage_payload -> 'tasks') task_record
    ) then
      return false;
    end if;

    for task_payload in
      select task_record.value
      from jsonb_array_elements(stage_payload -> 'tasks') task_record
    loop
      if jsonb_typeof(task_payload) is distinct from 'object'
         or jsonb_typeof(task_payload -> 'id') is distinct from 'string'
         or jsonb_typeof(task_payload -> 'position') is distinct from 'number'
         or (task_payload ->> 'position') !~ '^(0|[1-9][0-9]*)$'
         or (task_payload ->> 'position')::numeric > 2147483647
         or jsonb_typeof(task_payload -> 'localizations') is distinct from 'array'
         or jsonb_array_length(task_payload -> 'localizations') <> 3
         or jsonb_typeof(task_payload -> 'options') is distinct from 'array'
         or jsonb_typeof(task_payload -> 'hints') is distinct from 'array'
         or not (task_payload ? 'target_url')
         or not (task_payload ? 'expected_minutes') then
        return false;
      end if;

      parsed_id := (task_payload ->> 'id')::uuid;
      if parsed_id = any(seen_task_ids) then return false; end if;
      seen_task_ids := pg_catalog.array_append(seen_task_ids, parsed_id);
      seen_option_ids := '{}'::uuid[];
      seen_hint_ids := '{}'::uuid[];

      if task_payload -> 'target_url' <> 'null'::jsonb and (
        jsonb_typeof(task_payload -> 'target_url') is distinct from 'string'
        or (task_payload ->> 'target_url') !~ '^https?://'
      ) then
        return false;
      end if;
      if task_payload -> 'expected_minutes' <> 'null'::jsonb and (
        jsonb_typeof(task_payload -> 'expected_minutes') is distinct from 'number'
        or (task_payload ->> 'expected_minutes') !~ '^[1-9][0-9]*$'
        or (task_payload ->> 'expected_minutes')::numeric > 2147483647
      ) then
        return false;
      end if;

      if (
        select count(distinct localization_record.value ->> 'locale') <> 3
          or count(*) filter (
            where localization_record.value ->> 'locale' in ('en', 'de', 'ru')
          ) <> 3
        from jsonb_array_elements(
          task_payload -> 'localizations'
        ) localization_record
      ) then
        return false;
      end if;

      for task_localization in
        select localization_record.value
        from jsonb_array_elements(
          task_payload -> 'localizations'
        ) localization_record
      loop
        if jsonb_typeof(task_localization) is distinct from 'object'
           or jsonb_typeof(task_localization -> 'title') is distinct from 'string'
           or nullif(btrim(task_localization ->> 'title'), '') is null
           or jsonb_typeof(task_localization -> 'instructions_html')
             is distinct from 'string'
           or nullif(btrim(task_localization ->> 'instructions_html'), '') is null
           or nullif(app_private.strip_learner_markup(
             task_localization ->> 'instructions_html'
           ), '') is null then
          return false;
        end if;
      end loop;

      if (
        select count(*) <> count(distinct option_record.value ->> 'position')
        from jsonb_array_elements(task_payload -> 'options') option_record
      ) then
        return false;
      end if;
      for option_payload in
        select option_record.value
        from jsonb_array_elements(task_payload -> 'options') option_record
      loop
        if jsonb_typeof(option_payload) is distinct from 'object'
           or jsonb_typeof(option_payload -> 'id') is distinct from 'string'
           or jsonb_typeof(option_payload -> 'position') is distinct from 'number'
           or (option_payload ->> 'position') !~ '^(0|[1-9][0-9]*)$'
           or (option_payload ->> 'position')::numeric > 2147483647
           or jsonb_typeof(option_payload -> 'labels') is distinct from 'object'
           or not (option_payload -> 'labels' ?& array['en', 'de', 'ru'])
           or nullif(btrim(option_payload #>> '{labels,en}'), '') is null
           or nullif(btrim(option_payload #>> '{labels,de}'), '') is null
           or nullif(btrim(option_payload #>> '{labels,ru}'), '') is null then
          return false;
        end if;
        parsed_id := (option_payload ->> 'id')::uuid;
        if parsed_id = any(seen_option_ids) then return false; end if;
        seen_option_ids := pg_catalog.array_append(seen_option_ids, parsed_id);
      end loop;

      if jsonb_typeof(task_payload -> 'assessment') = 'object' then
        if jsonb_array_length(task_payload -> 'options') < 2
           or jsonb_typeof(task_payload #> '{assessment,question_translations}')
             is distinct from 'object'
           or not (
             task_payload #> '{assessment,question_translations}'
             ?& array['en', 'de', 'ru']
           )
           or nullif(btrim(
             task_payload #>> '{assessment,question_translations,en}'
           ), '') is null
           or nullif(btrim(
             task_payload #>> '{assessment,question_translations,de}'
           ), '') is null
           or nullif(btrim(
             task_payload #>> '{assessment,question_translations,ru}'
           ), '') is null
           or task_payload #>> '{assessment,selection_mode}'
             not in ('single', 'multiple') then
          return false;
        end if;
      elsif jsonb_typeof(task_payload -> 'assessment') = 'null' then
        if jsonb_array_length(task_payload -> 'options') <> 0 then
          return false;
        end if;
      else
        return false;
      end if;

      if (
        select count(*) <> count(distinct hint_record.value ->> 'position')
        from jsonb_array_elements(task_payload -> 'hints') hint_record
      ) then
        return false;
      end if;
      for hint_payload in
        select hint_record.value
        from jsonb_array_elements(task_payload -> 'hints') hint_record
      loop
        if jsonb_typeof(hint_payload) is distinct from 'object'
           or jsonb_typeof(hint_payload -> 'id') is distinct from 'string'
           or jsonb_typeof(hint_payload -> 'position') is distinct from 'number'
           or (hint_payload ->> 'position') !~ '^(0|[1-9][0-9]*)$'
           or (hint_payload ->> 'position')::numeric > 2147483647
           or jsonb_typeof(hint_payload -> 'content_translations')
             is distinct from 'object'
           or not (
             hint_payload -> 'content_translations' ?& array['en', 'de', 'ru']
           )
           or nullif(btrim(hint_payload #>> '{content_translations,en}'), '') is null
           or nullif(btrim(hint_payload #>> '{content_translations,de}'), '') is null
           or nullif(btrim(hint_payload #>> '{content_translations,ru}'), '') is null then
          return false;
        end if;
        parsed_id := (hint_payload ->> 'id')::uuid;
        if parsed_id = any(seen_hint_ids) then return false; end if;
        seen_hint_ids := pg_catalog.array_append(seen_hint_ids, parsed_id);
      end loop;
    end loop;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create function app_private.current_actor_is_active_learner(
  p_organization_id uuid,
  p_cohort_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (select app_private.current_actor_has_active_profile())
    and exists (
      select 1
      from public.organizations organization_record
      join public.organization_memberships organization_membership
        on organization_membership.organization_id = organization_record.id
       and organization_membership.user_id = (select auth.uid())
       and organization_membership.state = 'active'
       and organization_membership.removed_at is null
       and (
         organization_membership.valid_until is null
         or organization_membership.valid_until > statement_timestamp()
       )
      where organization_record.id = p_organization_id
        and organization_record.state = 'active'
        and organization_record.archived_at is null
    )
    and (select app_private.has_role(
      'learner', p_organization_id, p_cohort_id
    ))
    and (select app_private.has_permission(
      case when p_cohort_id is null then 'catalog.read' else 'cohort.read' end,
      p_organization_id,
      p_cohort_id
    ))
    and (
      p_cohort_id is null
      or exists (
        select 1
        from public.cohort_memberships cohort_membership
        where cohort_membership.cohort_id = p_cohort_id
          and cohort_membership.user_id = (select auth.uid())
          and cohort_membership.role = 'learner'
          and cohort_membership.state = 'active'
          and cohort_membership.removed_at is null
      )
    );
$$;

create function app_private.current_actor_has_learning_entitlement(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entitlements entitlement_record
    join public.product_packages package_record
      on package_record.id = entitlement_record.product_package_id
     and package_record.state = 'active'
     and 'learning' = any(package_record.capabilities)
    where entitlement_record.organization_id = p_organization_id
      and (
        entitlement_record.user_id is null
        or entitlement_record.user_id = (select auth.uid())
      )
      and entitlement_record.capability = 'learning'
      and entitlement_record.valid_from <= statement_timestamp()
      and (
        entitlement_record.valid_until is null
        or entitlement_record.valid_until > statement_timestamp()
      )
  );
$$;

create function app_private.current_actor_pinned_course_context(
  p_course_id uuid default null
)
returns table (
  enrollment_id uuid,
  enrollment_state public.enrollment_state,
  organization_id uuid,
  course_id uuid,
  course_slug text,
  enrollment_updated_at timestamptz,
  cohort_id uuid,
  cohort_state public.cohort_state,
  cohort_name text,
  progression_mode text,
  content_version_id uuid,
  content_version_state public.content_version_state,
  version_number integer,
  default_locale text,
  snapshot jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    enrollment_record.id,
    enrollment_record.state,
    enrollment_record.organization_id,
    enrollment_record.course_id,
    course_record.slug,
    enrollment_record.updated_at,
    cohort_record.id,
    cohort_record.state,
    cohort_record.name,
    cohort_record.progression_mode,
    version_record.id,
    version_record.state,
    version_record.version_number,
    version_record.snapshot #>> '{course,default_locale}',
    version_record.snapshot
  from public.enrollments enrollment_record
  join public.cohorts cohort_record
    on cohort_record.id = enrollment_record.cohort_id
   and cohort_record.organization_id = enrollment_record.organization_id
   and cohort_record.course_id = enrollment_record.course_id
  join public.courses course_record
    on course_record.id = enrollment_record.course_id
   and (
     course_record.organization_id is null
     or course_record.organization_id = enrollment_record.organization_id
   )
  join public.content_versions version_record
    on version_record.id = cohort_record.content_version_id
   and version_record.course_id = enrollment_record.course_id
   and version_record.state in ('published', 'archived')
  where enrollment_record.learner_id = (select auth.uid())
    and (p_course_id is null or enrollment_record.course_id = p_course_id)
    and (
      (
        enrollment_record.state = 'assigned'
        and cohort_record.state = 'active'
      )
      or (
        enrollment_record.state = 'completed'
        and cohort_record.state = 'completed'
      )
    )
    and app_private.current_actor_is_active_learner(
      enrollment_record.organization_id,
      cohort_record.id
    )
    and app_private.is_valid_learner_content_snapshot(
      version_record.snapshot,
      course_record.id,
      course_record.slug,
      version_record.id,
      version_record.version_number
    );
$$;

create function app_private.learner_task_is_currently_available(
  p_organization_id uuid,
  p_cohort_id uuid,
  p_progression_mode text,
  p_task_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_progression_mode = 'flexible' then
      app_private.current_actor_has_learning_entitlement(p_organization_id)
    else exists (
      select 1
      from public.task_schedules schedule_record
      where schedule_record.cohort_id = p_cohort_id
        and schedule_record.task_id = p_task_id
        and (
          schedule_record.available_from is null
          or schedule_record.available_from <= statement_timestamp()
        )
        and (
          schedule_record.due_at is null
          or schedule_record.due_at >= statement_timestamp()
        )
    )
  end;
$$;

create function app_private.learner_course_activity_state(
  p_enrollment_id uuid,
  p_enrollment_state public.enrollment_state,
  p_organization_id uuid,
  p_cohort_id uuid,
  p_progression_mode text,
  p_task_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  latest_state public.attempt_state;
begin
  select attempt_record.state into latest_state
  from public.attempts attempt_record
  where attempt_record.enrollment_id = p_enrollment_id
    and attempt_record.cohort_id = p_cohort_id
    and attempt_record.task_id = p_task_id
    and attempt_record.learner_id = (select auth.uid())
  order by attempt_record.sequence_number desc, attempt_record.id desc
  limit 1;

  if p_enrollment_state = 'completed' then
    if latest_state = 'accepted' then return 'accepted'; end if;
    return 'locked';
  end if;

  if latest_state = 'accepted' then return 'accepted'; end if;
  if latest_state = 'revision_required' then return 'revision_required'; end if;
  if latest_state in ('submitted', 'resubmitted') then return 'submitted'; end if;
  if latest_state = 'in_progress' then return 'in_progress'; end if;
  if app_private.learner_task_is_currently_available(
    p_organization_id, p_cohort_id, p_progression_mode, p_task_id
  ) then
    return 'available';
  end if;
  return 'locked';
end;
$$;

revoke all on function app_private.normalized_learning_locale(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.resolve_snapshot_localization(jsonb, text, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.strip_learner_markup(text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.snapshot_localized_text_map(jsonb, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function app_private.is_valid_learner_content_snapshot(
  jsonb, uuid, text, uuid, integer
) from public, anon, authenticated, service_role;
revoke all on function app_private.current_actor_is_active_learner(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.current_actor_has_learning_entitlement(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.current_actor_pinned_course_context(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.learner_task_is_currently_available(
  uuid, uuid, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function app_private.learner_course_activity_state(
  uuid, public.enrollment_state, uuid, uuid, text, uuid
) from public, anon, authenticated, service_role;

create function public.list_my_learning_courses(p_locale text default 'en')
returns table (
  enrollment_id uuid,
  enrollment_state public.enrollment_state,
  course_id uuid,
  cohort_id uuid,
  cohort_state public.cohort_state,
  content_version_id uuid,
  content_version_state public.content_version_state,
  version_number integer,
  title text,
  progression_mode text,
  completed_activities bigint,
  total_activities bigint,
  next_task_id uuid,
  next_task_title text,
  next_task_state text
)
language sql
stable
security definer
set search_path = ''
as $$
  with pinned_rows as (
    select
      context_record.enrollment_id,
      context_record.enrollment_state,
      context_record.course_id,
      context_record.cohort_id,
      context_record.cohort_state,
      context_record.content_version_id,
      context_record.content_version_state,
      context_record.version_number,
      app_private.resolve_snapshot_localization(
        context_record.snapshot #> '{course,localizations}',
        p_locale,
        context_record.default_locale
      ) ->> 'title' as title,
      context_record.progression_mode,
      (
        select count(distinct attempt_record.task_id)
        from public.attempts attempt_record
        where attempt_record.enrollment_id = context_record.enrollment_id
          and attempt_record.learner_id = (select auth.uid())
          and attempt_record.cohort_id = context_record.cohort_id
          and attempt_record.state = 'accepted'
          and exists (
            select 1
            from jsonb_array_elements(context_record.snapshot -> 'stages') stage_record
            cross join lateral jsonb_array_elements(
              stage_record.value -> 'tasks'
            ) task_record
            where (task_record.value ->> 'id')::uuid = attempt_record.task_id
          )
      ) as completed_activities,
      (
        select count(*)
        from jsonb_array_elements(context_record.snapshot -> 'stages') stage_record
        cross join lateral jsonb_array_elements(
          stage_record.value -> 'tasks'
        ) task_record
      ) as total_activities,
      next_record.task_id as next_task_id,
      next_record.task_title as next_task_title,
      next_record.task_state as next_task_state,
      context_record.enrollment_updated_at as sort_at
    from app_private.current_actor_pinned_course_context(null::uuid)
      context_record
    left join lateral (
      select
        (task_record.value ->> 'id')::uuid as task_id,
        app_private.resolve_snapshot_localization(
          task_record.value -> 'localizations',
          p_locale,
          context_record.default_locale
        ) ->> 'title' as task_title,
        state_record.task_state
      from jsonb_array_elements(context_record.snapshot -> 'stages')
        with ordinality stage_record(value, stage_order)
      cross join lateral jsonb_array_elements(stage_record.value -> 'tasks')
        with ordinality task_record(value, task_order)
      left join lateral (
        select attempt_record.state
        from public.attempts attempt_record
        where attempt_record.enrollment_id = context_record.enrollment_id
          and attempt_record.learner_id = (select auth.uid())
          and attempt_record.cohort_id = context_record.cohort_id
          and attempt_record.task_id = (task_record.value ->> 'id')::uuid
        order by attempt_record.sequence_number desc, attempt_record.id desc
        limit 1
      ) latest_attempt on true
      cross join lateral (
        select case
          when latest_attempt.state = 'revision_required'
            then 'revision_required'
          when latest_attempt.state = 'in_progress' then 'in_progress'
          when latest_attempt.state = 'submitted' then 'submitted'
          when latest_attempt.state = 'resubmitted' then 'resubmitted'
          when latest_attempt.state = 'accepted' then null
          when app_private.learner_task_is_currently_available(
            context_record.organization_id,
            context_record.cohort_id,
            context_record.progression_mode,
            (task_record.value ->> 'id')::uuid
          ) then 'available'
          else null
        end as task_state
      ) state_record
      where context_record.enrollment_state = 'assigned'
        and state_record.task_state is not null
      order by
        case state_record.task_state
          when 'revision_required' then 0
          when 'in_progress' then 1
          when 'available' then 2
          when 'submitted' then 3
          when 'resubmitted' then 3
          else 4
        end,
        stage_record.stage_order,
        task_record.task_order
      limit 1
    ) next_record on true
  ), pending_rows as (
    select
      enrollment_record.id as enrollment_id,
      enrollment_record.state as enrollment_state,
      enrollment_record.course_id,
      null::uuid as cohort_id,
      null::public.cohort_state as cohort_state,
      null::uuid as content_version_id,
      null::public.content_version_state as content_version_state,
      null::integer as version_number,
      app_private.resolve_snapshot_localization(
        version_record.snapshot #> '{course,localizations}',
        p_locale,
        version_record.snapshot #>> '{course,default_locale}'
      ) ->> 'title' as title,
      null::text as progression_mode,
      0::bigint as completed_activities,
      (
        select count(*)
        from jsonb_array_elements(version_record.snapshot -> 'stages') stage_record
        cross join lateral jsonb_array_elements(
          stage_record.value -> 'tasks'
        ) task_record
      ) as total_activities,
      null::uuid as next_task_id,
      null::text as next_task_title,
      null::text as next_task_state,
      enrollment_record.updated_at as sort_at
    from public.enrollments enrollment_record
    join public.courses course_record
      on course_record.id = enrollment_record.course_id
     and course_record.state = 'active'
     and course_record.archived_at is null
     and (
       course_record.organization_id is null
       or course_record.organization_id = enrollment_record.organization_id
     )
    join lateral (
      select version_candidate.*
      from public.content_versions version_candidate
      where version_candidate.course_id = course_record.id
        and version_candidate.state = 'published'
        and version_candidate.archived_at is null
      order by
        version_candidate.version_number desc,
        version_candidate.published_at desc,
        version_candidate.id desc
      limit 1
    ) version_record on true
    where enrollment_record.learner_id = (select auth.uid())
      and enrollment_record.state in ('requested', 'approved')
      and app_private.current_actor_is_active_learner(
        enrollment_record.organization_id,
        null
      )
      and app_private.is_valid_learner_content_snapshot(
        version_record.snapshot,
        course_record.id,
        course_record.slug,
        version_record.id,
        version_record.version_number
      )
  ), all_rows as (
    select * from pinned_rows
    union all
    select * from pending_rows
  )
  select
    course_record.enrollment_id,
    course_record.enrollment_state,
    course_record.course_id,
    course_record.cohort_id,
    course_record.cohort_state,
    course_record.content_version_id,
    course_record.content_version_state,
    course_record.version_number,
    course_record.title,
    course_record.progression_mode,
    course_record.completed_activities,
    course_record.total_activities,
    course_record.next_task_id,
    course_record.next_task_title,
    course_record.next_task_state
  from all_rows course_record
  order by
    case course_record.enrollment_state
      when 'assigned' then 0
      when 'completed' then 1
      when 'approved' then 2
      else 3
    end,
    course_record.sort_at desc,
    course_record.enrollment_id;
$$;

create function public.get_my_learning_course(
  p_course_id uuid,
  p_locale text default 'en'
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected_context as (
    select context_record.*
    from app_private.current_actor_pinned_course_context(p_course_id)
      context_record
    order by
      case context_record.enrollment_state when 'assigned' then 0 else 1 end,
      context_record.enrollment_updated_at desc,
      context_record.enrollment_id
    limit 1
  )
  select jsonb_build_object(
    'course_id', context_record.course_id,
    'enrollment_id', context_record.enrollment_id,
    'enrollment_state', context_record.enrollment_state,
    'cohort_id', context_record.cohort_id,
    'cohort_state', context_record.cohort_state,
    'content_version_id', context_record.content_version_id,
    'content_version_state', context_record.content_version_state,
    'version_number', context_record.version_number,
    'title', resolved_course.value ->> 'title',
    'summary', resolved_course.value ->> 'summary',
    'cohort_name', context_record.cohort_name,
    'progression_mode', context_record.progression_mode,
    'completed_activities', (
      select count(distinct attempt_record.task_id)
      from public.attempts attempt_record
      where attempt_record.enrollment_id = context_record.enrollment_id
        and attempt_record.learner_id = (select auth.uid())
        and attempt_record.cohort_id = context_record.cohort_id
        and attempt_record.state = 'accepted'
        and exists (
          select 1
          from jsonb_array_elements(context_record.snapshot -> 'stages') stage_check
          cross join lateral jsonb_array_elements(
            stage_check.value -> 'tasks'
          ) task_check
          where (task_check.value ->> 'id')::uuid = attempt_record.task_id
        )
    ),
    'total_activities', (
      select count(*)
      from jsonb_array_elements(context_record.snapshot -> 'stages') stage_check
      cross join lateral jsonb_array_elements(
        stage_check.value -> 'tasks'
      ) task_check
    ),
    'stages', (
      select jsonb_agg(
        jsonb_build_object(
          'id', (stage_record.value ->> 'id')::uuid,
          'title', resolved_stage.value ->> 'title',
          'description', app_private.strip_learner_markup(
            resolved_stage.value ->> 'description_html'
          ),
          'position', (stage_record.value ->> 'position')::integer,
          'activities', (
            select jsonb_agg(
              jsonb_build_object(
                'id', (task_record.value ->> 'id')::uuid,
                'title', resolved_task.value ->> 'title',
                'description', app_private.strip_learner_markup(
                  resolved_task.value ->> 'instructions_html'
                ),
                'position', (task_record.value ->> 'position')::integer,
                'state', app_private.learner_course_activity_state(
                  context_record.enrollment_id,
                  context_record.enrollment_state,
                  context_record.organization_id,
                  context_record.cohort_id,
                  context_record.progression_mode,
                  (task_record.value ->> 'id')::uuid
                ),
                'expected_minutes', case
                  when task_record.value -> 'expected_minutes' = 'null'::jsonb
                    then null
                  else (task_record.value ->> 'expected_minutes')::integer
                end,
                'available_from', schedule_record.available_from,
                'due_at', schedule_record.due_at
              )
              order by
                (task_record.value ->> 'position')::integer,
                task_record.value ->> 'id'
            )
            from jsonb_array_elements(stage_record.value -> 'tasks') task_record
            cross join lateral (
              select app_private.resolve_snapshot_localization(
                task_record.value -> 'localizations',
                p_locale,
                context_record.default_locale
              ) as value
            ) resolved_task
            left join public.task_schedules schedule_record
              on schedule_record.cohort_id = context_record.cohort_id
             and schedule_record.task_id = (task_record.value ->> 'id')::uuid
          )
        )
        order by
          (stage_record.value ->> 'position')::integer,
          stage_record.value ->> 'id'
      )
      from jsonb_array_elements(context_record.snapshot -> 'stages') stage_record
      cross join lateral (
        select app_private.resolve_snapshot_localization(
          stage_record.value -> 'localizations',
          p_locale,
          context_record.default_locale
        ) as value
      ) resolved_stage
    )
  )
  from selected_context context_record
  cross join lateral (
    select app_private.resolve_snapshot_localization(
      context_record.snapshot #> '{course,localizations}',
      p_locale,
      context_record.default_locale
    ) as value
  ) resolved_course;
$$;

create function public.get_my_learning_task(p_task_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected_task as (
    select
      context_record.*,
      (stage_record.value ->> 'id')::uuid as stage_id,
      task_record.value as task_payload,
      schedule_record.available_from,
      latest_attempt.state as latest_attempt_state
    from app_private.current_actor_pinned_course_context(null::uuid)
      context_record
    cross join lateral jsonb_array_elements(context_record.snapshot -> 'stages')
      stage_record
    cross join lateral jsonb_array_elements(stage_record.value -> 'tasks')
      task_record
    left join public.task_schedules schedule_record
      on schedule_record.cohort_id = context_record.cohort_id
     and schedule_record.task_id = p_task_id
    left join lateral (
      select attempt_record.state
      from public.attempts attempt_record
      where attempt_record.enrollment_id = context_record.enrollment_id
        and attempt_record.learner_id = (select auth.uid())
        and attempt_record.cohort_id = context_record.cohort_id
        and attempt_record.task_id = p_task_id
      order by attempt_record.sequence_number desc, attempt_record.id desc
      limit 1
    ) latest_attempt on true
    where context_record.enrollment_state = 'assigned'
      and (task_record.value ->> 'id')::uuid = p_task_id
      and (
        app_private.learner_task_is_currently_available(
          context_record.organization_id,
          context_record.cohort_id,
          context_record.progression_mode,
          p_task_id
        )
        or latest_attempt.state in (
          'in_progress', 'submitted', 'revision_required', 'resubmitted'
        )
      )
    order by context_record.enrollment_updated_at desc, context_record.enrollment_id
    limit 1
  )
  select jsonb_build_object(
    'id', p_task_id,
    'version_number', task_record.version_number,
    'content_version_id', task_record.content_version_id,
    'content_version_state', task_record.content_version_state,
    'course_id', task_record.course_id,
    'enrollment_id', task_record.enrollment_id,
    'cohort_id', task_record.cohort_id,
    'cohort_state', task_record.cohort_state,
    'stage_id', task_record.stage_id,
    'title', app_private.snapshot_localized_text_map(
      task_record.task_payload -> 'localizations', 'title', false
    ),
    'instructions', app_private.snapshot_localized_text_map(
      task_record.task_payload -> 'localizations', 'instructions_html', true
    ),
    'target_url', case
      when task_record.task_payload -> 'target_url' = 'null'::jsonb then null
      else task_record.task_payload ->> 'target_url'
    end,
    'hint', (
      select jsonb_build_object(
        'id', (hint_record.value ->> 'id')::uuid,
        'content', jsonb_build_object(
          'en', hint_record.value #>> '{content_translations,en}',
          'de', hint_record.value #>> '{content_translations,de}',
          'ru', hint_record.value #>> '{content_translations,ru}'
        )
      )
      from jsonb_array_elements(task_record.task_payload -> 'hints') hint_record
      order by
        (hint_record.value ->> 'position')::integer,
        hint_record.value ->> 'id'
      limit 1
    ),
    'assessment', case
      when jsonb_typeof(task_record.task_payload -> 'assessment') = 'object'
      then jsonb_build_object(
        'id', 'assessment:' || p_task_id::text,
        'question', jsonb_build_object(
          'en', task_record.task_payload
            #>> '{assessment,question_translations,en}',
          'de', task_record.task_payload
            #>> '{assessment,question_translations,de}',
          'ru', task_record.task_payload
            #>> '{assessment,question_translations,ru}'
        ),
        'selection_mode', task_record.task_payload
          #>> '{assessment,selection_mode}',
        'options', (
          select jsonb_agg(
            jsonb_build_object(
              'id', (option_record.value ->> 'id')::uuid,
              'label', jsonb_build_object(
                'en', option_record.value #>> '{labels,en}',
                'de', option_record.value #>> '{labels,de}',
                'ru', option_record.value #>> '{labels,ru}'
              )
            )
            order by
              (option_record.value ->> 'position')::integer,
              option_record.value ->> 'id'
          )
          from jsonb_array_elements(
            task_record.task_payload -> 'options'
          ) option_record
        )
      )
      else null
    end,
    'activated_at', task_record.available_from,
    'access', 'available'
  )
  from selected_task task_record;
$$;

revoke all on function public.list_my_learning_courses(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_learning_course(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_learning_task(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.list_my_learning_courses(text)
  to authenticated, service_role;
grant execute on function public.get_my_learning_course(uuid, text)
  to authenticated, service_role;
grant execute on function public.get_my_learning_task(uuid)
  to authenticated, service_role;

comment on function public.list_my_learning_courses(text) is
  'Actor-derived learner dashboard projection over pending safe previews and exact cohort-pinned immutable snapshots.';
comment on function public.get_my_learning_course(uuid, text) is
  'Actor-derived course workspace projection over one exact assigned or completed cohort pin.';
comment on function public.get_my_learning_task(uuid) is
  'Actor-derived available task projection over one exact active cohort pin, excluding hidden assessment and storage fields.';
