-- ─────────────────────────────────────────────────────────────────────────
-- Content is German-only: relax the all-three-locale (EN/DE/RU) rules to DE.
--
-- The admin studio was simplified to author German only — the application's
-- single source of truth is `CONTENT_LOCALES = ["de"]` (src/features/content/
-- model.ts). The database, however, still demanded complete EN + DE + RU
-- everywhere, so every German-only save or activation was rejected by a CHECK
-- (errcode 23514) and surfaced to the admin as the generic, unmapped
-- "Die Aktion konnte nicht ausgeführt werden."
--
-- Two symptoms, one cause:
--   • Saving a task with a "Question before the task" wrote {de: "…"} and hit
--     task_gate_questions_translations_shape (required en+de+ru).
--   • Activating a course ran submit_content_for_review →
--     assert_content_version_render_ready, which required all three course
--     localizations complete.
--   • And even had those passed, the read-time snapshot guards
--     (is_valid_learner_content_snapshot / is_valid_public_catalog_snapshot)
--     would have hidden the German-only course from learners and the catalogue.
--
-- This migration brings the database in line with the German-only application:
-- everywhere a locale was required, only `de` is now required. The snapshot
-- BUILDERS are unchanged — they already emit only the locales that exist, i.e.
-- German — so a German-only snapshot now both builds and validates. The
-- profile/UI-language rules (update_own_profile, create_profile_for_auth_user)
-- are deliberately left untouched: they are about the learner's chosen
-- interface language, not course content.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. The gate-question data-shape constraint ────────────────────────────
-- Was: object with en+de+ru all present and non-blank. Now: German present
-- and non-blank. set_task_gate_question still deletes on null, so "no question"
-- is unaffected.
alter table public.task_gate_questions
  drop constraint if exists task_gate_questions_translations_shape;
alter table public.task_gate_questions
  add constraint task_gate_questions_translations_shape check (
    jsonb_typeof(question_translations) = 'object'
    and question_translations ? 'de'
    and nullif(btrim(question_translations ->> 'de'), '') is not null
  );

-- ── 2. The activation gate ────────────────────────────────────────────────
-- assert_content_version_render_ready: course/stage/task localizations and the
-- hint / assessment / option translation maps now require German only.

CREATE OR REPLACE FUNCTION app_private.assert_content_version_render_ready(p_content_version_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_course_id uuid;
  stage_count bigint;
begin
  select version_row.course_id into target_course_id
  from public.content_versions version_row
  where version_row.id = p_content_version_id;
  if target_course_id is null then
    raise exception 'content version does not exist' using errcode = '22023';
  end if;

  if (
    select count(*) <> 1
      or bool_or(
        nullif(btrim(localization_row.title), '') is null
        or nullif(btrim(localization_row.summary), '') is null
        or nullif(btrim(localization_row.description_html), '') is null
      )
    from public.course_localizations localization_row
    where localization_row.course_id = target_course_id
      and localization_row.locale in ('de')
  ) then
    raise exception 'complete EN, DE and RU course localizations are required'
      using errcode = '23514';
  end if;

  select count(*) into stage_count
  from public.stages stage_row
  where stage_row.content_version_id = p_content_version_id;
  if stage_count = 0 then
    raise exception 'at least one version-owned stage is required' using errcode = '23514';
  end if;
  if exists (
    select 1
    from (
      select min(stage_row.position) as minimum_position,
             max(stage_row.position) as maximum_position,
             count(*) as row_count
      from public.stages stage_row
      where stage_row.content_version_id = p_content_version_id
    ) positions
    where positions.minimum_position <> 0
      or positions.maximum_position <> positions.row_count - 1
  ) then
    raise exception 'stage positions must be contiguous from zero' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.stages stage_row
    where stage_row.content_version_id = p_content_version_id
      and (
        stage_row.state not in ('draft', 'active')
        or (
          select count(*) <> 1
            or bool_or(
              nullif(btrim(localization_row.title), '') is null
              or nullif(btrim(localization_row.description_html), '') is null
            )
          from public.stage_localizations localization_row
          where localization_row.stage_id = stage_row.id
            and localization_row.locale in ('de')
        )
        or not exists (
          select 1 from public.tasks task_row
          where task_row.stage_id = stage_row.id
            and task_row.content_version_id = p_content_version_id
        )
        or exists (
          select 1
          from (
            select min(task_row.position) as minimum_position,
                   max(task_row.position) as maximum_position,
                   count(*) as row_count
            from public.tasks task_row
            where task_row.stage_id = stage_row.id
              and task_row.content_version_id = p_content_version_id
          ) positions
          where positions.minimum_position <> 0
            or positions.maximum_position <> positions.row_count - 1
        )
      )
  ) then
    raise exception 'every stage requires complete localizations and contiguous tasks'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.tasks task_row
    where task_row.content_version_id = p_content_version_id
      and (
        task_row.state not in ('draft', 'active')
        or (
          select count(*) <> 1
            or bool_or(
              nullif(btrim(localization_row.title), '') is null
              or nullif(btrim(localization_row.instructions_html), '') is null
            )
          from public.task_localizations localization_row
          where localization_row.task_id = task_row.id
            and localization_row.locale in ('de')
        )
        or exists (
          select 1
          from public.task_hints hint_row
          where hint_row.task_id = task_row.id
            and (
              not (hint_row.content_translations ?& array['de'])
              or nullif(btrim(hint_row.content_translations ->> 'de'), '') is null
              or nullif(btrim(hint_row.content_translations ->> 'de'), '') is null
              or nullif(btrim(hint_row.content_translations ->> 'de'), '') is null
            )
        )
        or exists (
          select 1
          from (
            select min(hint_row.position) as minimum_position,
                   max(hint_row.position) as maximum_position,
                   count(*) as row_count
            from public.task_hints hint_row
            where hint_row.task_id = task_row.id
          ) positions
          where positions.row_count > 0
            and (
              positions.minimum_position <> 0
              or positions.maximum_position <> positions.row_count - 1
            )
        )
      )
  ) then
    raise exception 'tasks require complete localizations and contiguous localized hints'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.tasks task_row
    left join public.task_assessments assessment_row
      on assessment_row.task_id = task_row.id
    where task_row.content_version_id = p_content_version_id
      and (
        (assessment_row.task_id is null and exists (
          select 1 from public.task_options option_row
          where option_row.task_id = task_row.id
        ))
        or (
          assessment_row.task_id is not null
          and (
            not (assessment_row.question_translations ?& array['de'])
            or nullif(btrim(assessment_row.question_translations ->> 'de'), '') is null
            or nullif(btrim(assessment_row.question_translations ->> 'de'), '') is null
            or nullif(btrim(assessment_row.question_translations ->> 'de'), '') is null
            or (assessment_row.selection_mode = 'single' and (
              assessment_row.minimum_selections <> 1
              or assessment_row.maximum_selections <> 1
            ))
            or assessment_row.maximum_selections is null
            or assessment_row.maximum_selections > (
              select count(*) from public.task_options option_row
              where option_row.task_id = task_row.id
            )
            or (
              select count(*) from public.task_options option_row
              where option_row.task_id = task_row.id
            ) < assessment_row.minimum_selections
            or exists (
              select 1
              from public.task_options option_row
              where option_row.task_id = task_row.id
                and (
                  not (option_row.labels ?& array['de'])
                  or nullif(btrim(option_row.labels ->> 'de'), '') is null
                  or nullif(btrim(option_row.labels ->> 'de'), '') is null
                  or nullif(btrim(option_row.labels ->> 'de'), '') is null
                  or not exists (
                    select 1 from public.task_option_answers answer_row
                    where answer_row.task_option_id = option_row.id
                  )
                )
            )
            or (
              select count(*)
              from public.task_options option_row
              join public.task_option_answers answer_row
                on answer_row.task_option_id = option_row.id
              where option_row.task_id = task_row.id
                and answer_row.is_correct
            ) not between assessment_row.minimum_selections
              and assessment_row.maximum_selections
          )
        )
      )
  ) then
    raise exception 'assessment options, selections and translations are incomplete'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.media_assets media_row
    where media_row.content_version_id = p_content_version_id
      and (media_row.state <> 'active' or media_row.deleted_at is not null)
  ) then
    raise exception 'version-owned media must be active and available'
      using errcode = '23514';
  end if;
end;
$function$;

-- ── 3. The read-time catalogue guard ──────────────────────────────────────
-- is_valid_public_catalog_snapshot: a German-only published snapshot must be
-- accepted so the course stays visible in the public catalogue.
CREATE OR REPLACE FUNCTION app_private.is_valid_public_catalog_snapshot(p_snapshot jsonb, p_course_id uuid, p_course_slug text, p_content_version_id uuid, p_version_number integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
       coalesce(p_snapshot #>> '{course,default_locale}', '') in ('de')
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
     or jsonb_array_length(p_snapshot #> '{course,localizations}') <> 1 then
    return false;
  end if;

  if (
    select count(distinct localization_row.value ->> 'locale') <> 1
      or count(*) filter (
        where localization_row.value ->> 'locale' in ('de')
      ) <> 1
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
$function$;

-- ── 4. The read-time learner guard ────────────────────────────────────────
-- is_valid_learner_content_snapshot: same, for the enrolled-learner view. It
-- calls the catalogue guard above first, then validates stages/tasks/options/
-- hints/gate-question — all now German-only.
CREATE OR REPLACE FUNCTION app_private.is_valid_learner_content_snapshot(p_snapshot jsonb, p_course_id uuid, p_course_slug text, p_content_version_id uuid, p_version_number integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
       or jsonb_array_length(stage_payload -> 'localizations') <> 1
       or jsonb_typeof(stage_payload -> 'tasks') is distinct from 'array'
       or jsonb_array_length(stage_payload -> 'tasks') = 0 then
      return false;
    end if;

    parsed_id := (stage_payload ->> 'id')::uuid;
    if parsed_id = any(seen_stage_ids) then return false; end if;
    seen_stage_ids := pg_catalog.array_append(seen_stage_ids, parsed_id);

    if (
      select count(distinct localization_record.value ->> 'locale') <> 1
        or count(*) filter (
          where localization_record.value ->> 'locale' in ('de')
        ) <> 1
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
         or jsonb_array_length(task_payload -> 'localizations') <> 1
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
        or (task_payload ->> 'target_url') !~ '^https?://' and (task_payload ->> 'target_url') !~ '^/[^/]'
      ) then
        return false;
      end if;
      if task_payload ? 'gate_question'
         and task_payload -> 'gate_question' <> 'null'::jsonb then
        if jsonb_typeof(task_payload -> 'gate_question')
             is distinct from 'object'
           or jsonb_typeof(task_payload #> '{gate_question,id}')
             is distinct from 'string'
           or jsonb_typeof(task_payload #> '{gate_question,question_translations}')
             is distinct from 'object'
           or not (task_payload #> '{gate_question,question_translations}'
                   ?& array['de'])
           or nullif(btrim(
                task_payload #>> '{gate_question,question_translations,de}'), '')
             is null
           or nullif(btrim(
                task_payload #>> '{gate_question,question_translations,de}'), '')
             is null
           or nullif(btrim(
                task_payload #>> '{gate_question,question_translations,de}'), '')
             is null then
          return false;
        end if;
      end if;
      if task_payload ? 'required_hunt_scenario'
         and task_payload -> 'required_hunt_scenario' <> 'null'::jsonb then
        if jsonb_typeof(task_payload -> 'required_hunt_scenario')
             is distinct from 'object'
           or jsonb_typeof(task_payload #> '{required_hunt_scenario,id}')
             is distinct from 'string'
           or jsonb_typeof(task_payload #> '{required_hunt_scenario,code}')
             is distinct from 'string'
           or nullif(btrim(task_payload #>> '{required_hunt_scenario,code}'), '')
             is null then
          return false;
        end if;
      end if;
      if task_payload -> 'expected_minutes' <> 'null'::jsonb and (
        jsonb_typeof(task_payload -> 'expected_minutes') is distinct from 'number'
        or (task_payload ->> 'expected_minutes') !~ '^[1-9][0-9]*$'
        or (task_payload ->> 'expected_minutes')::numeric > 2147483647
      ) then
        return false;
      end if;

      if (
        select count(distinct localization_record.value ->> 'locale') <> 1
          or count(*) filter (
            where localization_record.value ->> 'locale' in ('de')
          ) <> 1
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
           or not (option_payload -> 'labels' ?& array['de'])
           or nullif(btrim(option_payload #>> '{labels,de}'), '') is null
           or nullif(btrim(option_payload #>> '{labels,de}'), '') is null
           or nullif(btrim(option_payload #>> '{labels,de}'), '') is null then
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
             ?& array['de']
           )
           or nullif(btrim(
             task_payload #>> '{assessment,question_translations,de}'
           ), '') is null
           or nullif(btrim(
             task_payload #>> '{assessment,question_translations,de}'
           ), '') is null
           or nullif(btrim(
             task_payload #>> '{assessment,question_translations,de}'
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
             hint_payload -> 'content_translations' ?& array['de']
           )
           or nullif(btrim(hint_payload #>> '{content_translations,de}'), '') is null
           or nullif(btrim(hint_payload #>> '{content_translations,de}'), '') is null
           or nullif(btrim(hint_payload #>> '{content_translations,de}'), '') is null then
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
$function$;

