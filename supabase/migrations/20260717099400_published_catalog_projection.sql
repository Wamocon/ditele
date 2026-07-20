-- The public catalog is an immutable publication projection. It never reads
-- mutable localization, stage or task rows as public course content.

create or replace function app_private.is_valid_public_catalog_snapshot(
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
  localization_payload jsonb;
  learning_outcome jsonb;
  stage_payload jsonb;
  task_payload jsonb;
  estimated_minutes_text text;
begin
  if jsonb_typeof(p_snapshot) is distinct from 'object'
     or p_snapshot -> 'schema_version' is distinct from '1'::jsonb
     or jsonb_typeof(p_snapshot -> 'course') is distinct from 'object'
     or jsonb_typeof(p_snapshot -> 'content_version') is distinct from 'object'
     or jsonb_typeof(p_snapshot -> 'stages') is distinct from 'array' then
    return false;
  end if;

  if p_snapshot #>> '{course,id}' is distinct from p_course_id::text
     or p_snapshot #>> '{course,slug}' is distinct from p_course_slug
     or coalesce(p_snapshot #>> '{course,slug}', '')
       !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or not (
       coalesce(p_snapshot #>> '{course,default_locale}', '') in ('en', 'de', 'ru')
     )
     or p_snapshot #>> '{content_version,id}'
       is distinct from p_content_version_id::text
     or p_snapshot #>> '{content_version,version_number}'
       is distinct from p_version_number::text then
    return false;
  end if;

  estimated_minutes_text := p_snapshot #>> '{course,estimated_minutes}';
  if not ((p_snapshot -> 'course') ? 'estimated_minutes') then
    return false;
  end if;
  if p_snapshot #> '{course,estimated_minutes}' is distinct from 'null'::jsonb and (
    jsonb_typeof(p_snapshot #> '{course,estimated_minutes}') is distinct from 'number'
    or estimated_minutes_text !~ '^[1-9][0-9]*$'
    or estimated_minutes_text::numeric > 2147483647
  ) then
    return false;
  end if;

  if jsonb_typeof(p_snapshot #> '{course,localizations}') is distinct from 'array'
     or jsonb_array_length(p_snapshot #> '{course,localizations}') <> 3 then
    return false;
  end if;

  if (
    select count(distinct localization_row.value ->> 'locale') <> 3
      or count(*) filter (
        where localization_row.value ->> 'locale' in ('en', 'de', 'ru')
      ) <> 3
    from jsonb_array_elements(
      p_snapshot #> '{course,localizations}'
    ) localization_row
  ) then
    return false;
  end if;

  for localization_payload in
    select localization_row.value
    from jsonb_array_elements(
      p_snapshot #> '{course,localizations}'
    ) localization_row
  loop
    if jsonb_typeof(localization_payload) is distinct from 'object'
       or jsonb_typeof(localization_payload -> 'title') is distinct from 'string'
       or nullif(btrim(localization_payload ->> 'title'), '') is null
       or jsonb_typeof(localization_payload -> 'summary') is distinct from 'string'
       or nullif(btrim(localization_payload ->> 'summary'), '') is null
       or jsonb_typeof(localization_payload -> 'description_html') is distinct from 'string'
       or nullif(btrim(localization_payload ->> 'description_html'), '') is null
       or jsonb_typeof(localization_payload -> 'learning_outcomes') is distinct from 'array'
       or jsonb_array_length(localization_payload -> 'learning_outcomes') = 0 then
      return false;
    end if;

    for learning_outcome in
      select outcome_row.value
      from jsonb_array_elements(
        localization_payload -> 'learning_outcomes'
      ) outcome_row
    loop
      if jsonb_typeof(learning_outcome) is distinct from 'string'
         or nullif(btrim(learning_outcome #>> '{}'), '') is null then
        return false;
      end if;
    end loop;
  end loop;

  if jsonb_array_length(p_snapshot -> 'stages') = 0 then
    return false;
  end if;

  for stage_payload in
    select stage_row.value
    from jsonb_array_elements(p_snapshot -> 'stages') stage_row
  loop
    if jsonb_typeof(stage_payload) is distinct from 'object'
       or jsonb_typeof(stage_payload -> 'tasks') is distinct from 'array'
       or jsonb_array_length(stage_payload -> 'tasks') = 0 then
      return false;
    end if;

    for task_payload in
      select task_row.value
      from jsonb_array_elements(stage_payload -> 'tasks') task_row
    loop
      if jsonb_typeof(task_payload) is distinct from 'object'
         or jsonb_typeof(task_payload -> 'id') is distinct from 'string'
         or nullif(btrim(task_payload ->> 'id'), '') is null then
        return false;
      end if;
    end loop;
  end loop;

  return true;
exception
  when others then
    -- A malformed legacy payload is not public content. Fail closed instead of
    -- allowing casting or traversal errors to break the whole catalog.
    return false;
end;
$$;

revoke all on function app_private.is_valid_public_catalog_snapshot(
  jsonb, uuid, text, uuid, integer
) from public, anon, authenticated, service_role;

drop function if exists public.get_public_catalog(text);

create function public.get_public_catalog(p_locale text default 'en')
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
  task_count bigint,
  title_localizations jsonb,
  summary_localizations jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with latest_public_versions as (
    select distinct on (course_record.id)
      course_record.id as course_id,
      course_record.slug as live_slug,
      version_record.id as content_version_id,
      version_record.version_number,
      version_record.published_at,
      version_record.snapshot
    from public.courses course_record
    join public.content_versions version_record
      on version_record.course_id = course_record.id
     and version_record.state = 'published'
     and version_record.archived_at is null
    where course_record.state = 'active'
      and course_record.archived_at is null
      and course_record.organization_id is null
    order by
      course_record.id,
      version_record.version_number desc,
      version_record.published_at desc,
      version_record.id desc
  ),
  safe_versions as (
    select
      version_record.*,
      version_record.snapshot #>> '{course,slug}' as snapshot_slug,
      version_record.snapshot #>> '{course,default_locale}' as snapshot_default_locale,
      case
        when version_record.snapshot #> '{course,estimated_minutes}' = 'null'::jsonb
          then 0
        else (version_record.snapshot #>> '{course,estimated_minutes}')::integer
      end as snapshot_estimated_minutes,
      version_record.snapshot #> '{course,localizations}' as localizations,
      (
        select count(*)
        from jsonb_array_elements(version_record.snapshot -> 'stages') stage_row
        cross join lateral jsonb_array_elements(stage_row.value -> 'tasks') task_row
      ) as snapshot_task_count
    from latest_public_versions version_record
    where app_private.is_valid_public_catalog_snapshot(
      version_record.snapshot,
      version_record.course_id,
      version_record.live_slug,
      version_record.content_version_id,
      version_record.version_number
    )
  )
  select
    version_record.course_id,
    version_record.snapshot_slug,
    resolved_localization.value ->> 'title',
    resolved_localization.value ->> 'summary',
    resolved_localization.value ->> 'locale',
    version_record.snapshot_default_locale,
    version_record.snapshot_estimated_minutes,
    version_record.version_number,
    version_record.published_at,
    version_record.snapshot_task_count,
    (
      select jsonb_object_agg(
        localization_row.value ->> 'locale',
        localization_row.value ->> 'title'
        order by localization_row.value ->> 'locale'
      )
      from jsonb_array_elements(version_record.localizations) localization_row
    ),
    (
      select jsonb_object_agg(
        localization_row.value ->> 'locale',
        localization_row.value ->> 'summary'
        order by localization_row.value ->> 'locale'
      )
      from jsonb_array_elements(version_record.localizations) localization_row
    )
  from safe_versions version_record
  join lateral (
    select localization_row.value
    from jsonb_array_elements(version_record.localizations) localization_row
    where localization_row.value ->> 'locale' in (
      case lower(btrim(coalesce(p_locale, '')))
        when 'en' then 'en'
        when 'de' then 'de'
        when 'ru' then 'ru'
        else 'en'
      end,
      version_record.snapshot_default_locale,
      'en'
    )
    order by case localization_row.value ->> 'locale'
      when case lower(btrim(coalesce(p_locale, '')))
        when 'en' then 'en'
        when 'de' then 'de'
        when 'ru' then 'ru'
        else 'en'
      end then 0
      when version_record.snapshot_default_locale then 1
      else 2
    end
    limit 1
  ) resolved_localization on true
  order by version_record.published_at desc, version_record.course_id;
$$;

revoke all on function public.get_public_catalog(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_catalog(text)
  to anon, authenticated, service_role;

create function public.get_public_catalog_course(
  p_slug text default null,
  p_course_id uuid default null
)
returns table (
  course_id uuid,
  slug text,
  default_locale text,
  estimated_minutes integer,
  version_number integer,
  published_at timestamptz,
  task_count bigint,
  localizations jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with latest_public_versions as (
    select distinct on (course_record.id)
      course_record.id as course_id,
      course_record.slug as live_slug,
      version_record.id as content_version_id,
      version_record.version_number,
      version_record.published_at,
      version_record.snapshot
    from public.courses course_record
    join public.content_versions version_record
      on version_record.course_id = course_record.id
     and version_record.state = 'published'
     and version_record.archived_at is null
    where course_record.state = 'active'
      and course_record.archived_at is null
      and course_record.organization_id is null
    order by
      course_record.id,
      version_record.version_number desc,
      version_record.published_at desc,
      version_record.id desc
  )
  select
    version_record.course_id,
    version_record.snapshot #>> '{course,slug}',
    version_record.snapshot #>> '{course,default_locale}',
    case
      when version_record.snapshot #> '{course,estimated_minutes}' = 'null'::jsonb
        then 0
      else (version_record.snapshot #>> '{course,estimated_minutes}')::integer
    end,
    version_record.version_number,
    version_record.published_at,
    (
      select count(*)
      from jsonb_array_elements(version_record.snapshot -> 'stages') stage_row
      cross join lateral jsonb_array_elements(stage_row.value -> 'tasks') task_row
    ),
    (
      select jsonb_agg(
        jsonb_build_object(
          'locale', localization_row.value ->> 'locale',
          'title', localization_row.value ->> 'title',
          'summary', localization_row.value ->> 'summary',
          'description_html', localization_row.value ->> 'description_html',
          'learning_outcomes', localization_row.value -> 'learning_outcomes'
        )
        order by case localization_row.value ->> 'locale'
          when 'en' then 0
          when 'de' then 1
          when 'ru' then 2
          else 3
        end
      )
      from jsonb_array_elements(
        version_record.snapshot #> '{course,localizations}'
      ) localization_row
    )
  from latest_public_versions version_record
  where app_private.is_valid_public_catalog_snapshot(
      version_record.snapshot,
      version_record.course_id,
      version_record.live_slug,
      version_record.content_version_id,
      version_record.version_number
    )
    and (p_slug is null or version_record.snapshot #>> '{course,slug}' = p_slug)
    and (p_course_id is null or version_record.course_id = p_course_id)
    and ((p_slug is not null)::integer + (p_course_id is not null)::integer) = 1
  order by version_record.published_at desc, version_record.course_id
  limit 1;
$$;

revoke all on function public.get_public_catalog_course(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_catalog_course(text, uuid)
  to anon, authenticated, service_role;

comment on function public.get_public_catalog(text) is
  'Safe immutable list projection over validated schema_version=1 published snapshots.';
comment on function public.get_public_catalog_course(text, uuid) is
  'Safe immutable detail projection over one validated public published snapshot.';
