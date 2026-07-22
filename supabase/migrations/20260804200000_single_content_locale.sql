-- ═══════════════════════════════════════════════════════════════════════════
-- Course content is authored in ONE language. The database now agrees.
--
-- `CONTENT_LOCALES` in the studio has been `["de"]` for some time: one editor
-- per field, one string stored. The database was never told. It still required
-- en, de AND ru on every hint, answer option, quiz question and gate question —
-- so the studio wrote `{"de": "…"}` and the database refused it:
--
--   new row for relation "task_hints" violates check constraint
--   "task_hints_content_translations_check"
--
-- Measured, not inferred: adding a hint to a task in the running studio failed
-- to save, and a direct `insert … '{"de":"Nur Deutsch"}'` reproduces it. Every
-- row that exists today carries all three locales because every one of them was
-- seeded through SQL — nothing authored through the UI had ever survived.
--
-- The same rule sat in the publish validators, so even if a row had gone in, the
-- version could not have been published.
--
-- ── What changes ───────────────────────────────────────────────────────────
-- "all of en, de, ru" becomes "the content locale, de". Extra locales are still
-- ALLOWED everywhere — the `locale in ('en','de','ru')` allow-lists and the
-- en/de/ru ordering preferences are untouched, so re-adding a language later is
-- still a matter of writing the rows. Only the requirement is gone.
--
-- Nothing existing is invalidated: a row with all three locales still has 'de'
-- and still passes.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. The write-time constraints ─────────────────────────────────────────
-- These are what refused the insert. Each now asks for the content locale and
-- ignores the rest, and each additionally requires it to be non-blank — which
-- the two `? 'en'` constraints never did, so a hint could be stored empty.

alter table public.task_hints
  drop constraint if exists task_hints_content_translations_check;
alter table public.task_hints
  add constraint task_hints_content_translations_check check (
    jsonb_typeof(content_translations) = 'object'
    and nullif(btrim(content_translations ->> 'de'), '') is not null
  );

alter table public.task_assessments
  drop constraint if exists task_assessments_question_translations_check;
alter table public.task_assessments
  add constraint task_assessments_question_translations_check check (
    jsonb_typeof(question_translations) = 'object'
    and nullif(btrim(question_translations ->> 'de'), '') is not null
  );

alter table public.task_gate_questions
  drop constraint if exists task_gate_questions_translations_shape;
alter table public.task_gate_questions
  add constraint task_gate_questions_translations_shape check (
    jsonb_typeof(question_translations) = 'object'
    and nullif(btrim(question_translations ->> 'de'), '') is not null
  );

-- `task_options.labels` has only ever been checked for `jsonb_typeof = 'object'`
-- at write time; its locale rule lives in the validators below. Left as it is,
-- so this migration does not quietly tighten a fourth table.

-- ─── 2. The publish and snapshot validators ────────────────────────────────
-- Replaced whole, because that is what Postgres offers. The bodies are the ones
-- already deployed with ONLY the locale predicates changed — every other line,
-- comment and blank is byte-identical, so a diff of this migration against
-- `pg_get_functiondef` shows exactly the rule and nothing else.
--
-- `create or replace` keeps the owner (postgres, which is load-bearing: these
-- read tables with FORCE ROW LEVEL SECURITY) and the existing grants.

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
    select count(*) <> 3
      or bool_or(
        nullif(btrim(localization_row.title), '') is null
        or nullif(btrim(localization_row.summary), '') is null
        or nullif(btrim(localization_row.description_html), '') is null
      )
    from public.course_localizations localization_row
    where localization_row.course_id = target_course_id
      and localization_row.locale in ('en', 'de', 'ru')
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
          select count(*) <> 3
            or bool_or(
              nullif(btrim(localization_row.title), '') is null
              or nullif(btrim(localization_row.description_html), '') is null
            )
          from public.stage_localizations localization_row
          where localization_row.stage_id = stage_row.id
            and localization_row.locale in ('en', 'de', 'ru')
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
          select count(*) <> 3
            or bool_or(
              nullif(btrim(localization_row.title), '') is null
              or nullif(btrim(localization_row.instructions_html), '') is null
            )
          from public.task_localizations localization_row
          where localization_row.task_id = task_row.id
            and localization_row.locale in ('en', 'de', 'ru')
        )
        or exists (
          select 1
          from public.task_hints hint_row
          where hint_row.task_id = task_row.id
            and (
              not (hint_row.content_translations ?& array['de'])
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
           then
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
           or not (option_payload -> 'labels' ?& array['de'])
           or nullif(btrim(option_payload #>> '{labels,de}'), '') is null
           then
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
           then
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

commit;

-- ─── Verification, by behaviour ────────────────────────────────────────────
-- A German-only hint is the case that was broken; it must now be accepted, and
-- a blank one must still be refused.
do $verify$
declare
  sample_task uuid;
  refused boolean := false;
begin
  -- A task in a DRAFT version. A published content graph is immutable by
  -- another guard entirely, so picking any task at all would have tested that
  -- guard instead of this constraint.
  select task_record.id into sample_task
  from public.tasks task_record
  join public.content_versions version_record
    on version_record.id = task_record.content_version_id
  where version_record.state = 'draft'
  limit 1;
  if sample_task is null then
    raise notice 'no tasks to verify against; skipping';
    return;
  end if;

  begin
    insert into public.task_hints (task_id, position, content_translations)
    values (sample_task, 9999, '{"de": "Nur Deutsch"}'::jsonb);
  exception when check_violation then
    raise exception 'a German-only hint is still refused';
  end;
  delete from public.task_hints where task_id = sample_task and position = 9999;

  begin
    insert into public.task_hints (task_id, position, content_translations)
    values (sample_task, 9999, '{"de": "   "}'::jsonb);
    delete from public.task_hints where task_id = sample_task and position = 9999;
  exception when check_violation then
    refused := true;
  end;
  if not refused then
    raise exception 'a blank hint was accepted; the non-blank rule is not doing its job';
  end if;
end;
$verify$;
