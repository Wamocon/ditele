-- ═══════════════════════════════════════════════════════════════════════════
-- "Add an existing task" — chosen: COPY it into the course.
--
-- AUTHORING_AND_FLOW §1a:
--
--     Because a task cannot belong to two courses [tasks.course_id is NOT NULL,
--     no join table], an "add existing task" button cannot share one. It can
--     only COPY it into this course: a new tasks row, new localizations, new
--     options, new gate question. Editing the original afterwards will not change
--     the copy.
--
-- This is the per-task half of `duplicate_course`, which already copies every
-- task of a course this same way and is the proven reference. The differences
-- are deliberate:
--
--   • source_system / external_id are dropped. `tasks_external_uidx` is UNIQUE
--     on (source_system, external_id), so the database forbids a second task
--     carrying an Arena scenario's code. A copied hunt task therefore keeps its
--     sandbox (target_url) and its own task id — which is all the Arena chain
--     (§6.1, task-id based) and course-task gating need — but not the scenario's
--     cross-course `required_hunt` identity. Same as duplicate_course.
--   • required_hunt_scenario_id is dropped (a hunt task may not carry one; a
--     course task's gate is re-pointed by the admin in the editor).
--   • The pre-task gate question IS copied. duplicate_course predates
--     task_gate_questions and never learned to; a task's question belongs to it.
--   • Skill mappings are NOT copied. Skill authoring is being removed from tasks,
--     and 20260803110000 already dropped the readiness gate that required them.
--   • Prerequisites are NOT copied. A copied task starts fresh in its course; the
--     Arena chain is re-derived from order at publish (§6.1).
--
-- No UI ships with this: the admin authoring surface is being simplified in a
-- separate session, so the "add existing" button is left for once that settles.
-- This is the write path it will call.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.copy_task_into_course(
  p_source_task_id uuid,
  p_target_stage_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_target_version uuid;
  v_target_course uuid;
  v_target_org uuid;
  v_version_state text;
  v_source_org uuid;
  v_new_task uuid;
  v_next_position integer;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Resolve the target from the stage: version, course, organisation, state.
  select stage_row.content_version_id, stage_row.course_id,
         course_row.organization_id, version_row.state
  into v_target_version, v_target_course, v_target_org, v_version_state
  from public.stages stage_row
  join public.content_versions version_row
    on version_row.id = stage_row.content_version_id
  join public.courses course_row on course_row.id = stage_row.course_id
  where stage_row.id = p_target_stage_id;
  if not found then
    raise exception 'target stage % not found', p_target_stage_id
      using errcode = 'P0002';
  end if;
  if v_version_state <> 'draft' then
    raise exception
      'a task can only be added to a draft version (this one is %)', v_version_state
      using errcode = '55000';
  end if;

  -- Authorise against the TARGET organisation — that is where the write lands.
  if not app_private.has_role('admin', v_target_org, null) then
    raise exception 'administrator role required for this organisation'
      using errcode = '42501';
  end if;

  -- Same-tenant only: a task's content may not be lifted into another org.
  select course_row.organization_id into v_source_org
  from public.tasks task_row
  join public.courses course_row on course_row.id = task_row.course_id
  where task_row.id = p_source_task_id;
  if not found then
    raise exception 'source task % not found', p_source_task_id
      using errcode = 'P0002';
  end if;
  if v_source_org is distinct from v_target_org then
    raise exception 'a task can only be copied within the same organisation'
      using errcode = '42501';
  end if;

  select coalesce(max(task_row.position) + 1, 0) into v_next_position
  from public.tasks task_row where task_row.stage_id = p_target_stage_id;

  insert into public.tasks (
    course_id, stage_id, content_version_id, bug_category_id, position, task_kind,
    state, target_url, expected_minutes, hint_penalty_basis_points,
    source_system, external_id, video_url, intro_video_url, document_url
  )
  select v_target_course, p_target_stage_id, v_target_version,
         source_task.bug_category_id, v_next_position, source_task.task_kind,
         'draft', source_task.target_url, source_task.expected_minutes,
         source_task.hint_penalty_basis_points, null, null,
         source_task.video_url, source_task.intro_video_url, source_task.document_url
  from public.tasks source_task
  where source_task.id = p_source_task_id
  returning id into v_new_task;

  -- ── localizations, and the trainer-only model answer that hangs off them ──
  create temporary table if not exists tmp_copy_task_loc_map (
    old_id uuid primary key, new_id uuid not null
  ) on commit drop;
  truncate tmp_copy_task_loc_map;

  with inserted as (
    insert into public.task_localizations (
      task_id, locale, title, instructions_html, hint_text
    )
    select v_new_task, source_loc.locale, source_loc.title,
           source_loc.instructions_html, source_loc.hint_text
    from public.task_localizations source_loc
    where source_loc.task_id = p_source_task_id
    returning id, locale
  )
  insert into tmp_copy_task_loc_map (old_id, new_id)
  select source_loc.id, inserted.id
  from public.task_localizations source_loc
  join inserted on inserted.locale = source_loc.locale
  where source_loc.task_id = p_source_task_id;

  insert into public.task_model_answers (task_localization_id, model_answer, updated_by)
  select loc_map.new_id, source_answer.model_answer, v_actor
  from public.task_model_answers source_answer
  join tmp_copy_task_loc_map loc_map on loc_map.old_id = source_answer.task_localization_id;

  -- ── the in-task test: assessment, options, correct answers ────────────────
  insert into public.task_assessments (
    task_id, question_translations, selection_mode, minimum_selections, maximum_selections
  )
  select v_new_task, source_assessment.question_translations,
         source_assessment.selection_mode, source_assessment.minimum_selections,
         source_assessment.maximum_selections
  from public.task_assessments source_assessment
  where source_assessment.task_id = p_source_task_id;

  create temporary table if not exists tmp_copy_task_opt_map (
    old_id uuid primary key, new_id uuid not null
  ) on commit drop;
  truncate tmp_copy_task_opt_map;

  with inserted as (
    insert into public.task_options (task_id, option_key, labels, position)
    select v_new_task, source_option.option_key, source_option.labels,
           source_option.position
    from public.task_options source_option
    where source_option.task_id = p_source_task_id
    returning id, option_key
  )
  insert into tmp_copy_task_opt_map (old_id, new_id)
  select source_option.id, inserted.id
  from public.task_options source_option
  join inserted on inserted.option_key = source_option.option_key
  where source_option.task_id = p_source_task_id;

  insert into public.task_option_answers (task_option_id, is_correct, updated_by)
  select opt_map.new_id, source_answer.is_correct, v_actor
  from public.task_option_answers source_answer
  join tmp_copy_task_opt_map opt_map on opt_map.old_id = source_answer.task_option_id;

  -- ── hints, and the pre-task gate question ─────────────────────────────────
  insert into public.task_hints (task_id, position, content_translations)
  select v_new_task, source_hint.position, source_hint.content_translations
  from public.task_hints source_hint
  where source_hint.task_id = p_source_task_id;

  insert into public.task_gate_questions (task_id, question_translations)
  select v_new_task, source_gate.question_translations
  from public.task_gate_questions source_gate
  where source_gate.task_id = p_source_task_id;

  return v_new_task;
end;
$function$;

alter function public.copy_task_into_course(uuid, uuid) owner to postgres;
revoke all on function public.copy_task_into_course(uuid, uuid) from public;
grant execute on function public.copy_task_into_course(uuid, uuid)
  to authenticated, service_role;

commit;

-- ─── Verification ─────────────────────────────────────────────────────────
--
-- Structural, then behavioural: as a real admin, copy a real task into a real
-- draft stage over the actual RPC and assert the new task and its localizations
-- exist — inside a savepoint that is always rolled back, so no fixture is left
-- behind. Skips cleanly if the seed lacks an admin or a non-empty draft version.
--
-- ⚠️ Runs the RPC, not the SQL by hand: §5.3c — the auth check, the same-tenant
-- guard and the has_role grant are only exercised with a signed-in actor.
do $verify$
declare
  v_admin uuid;
  v_source_task uuid;
  v_target_stage uuid;
  v_new_task uuid;
  v_src_locales integer;
  v_new_locales integer;
  v_ok boolean := false;
begin
  if not exists (
    select 1 from pg_catalog.pg_proc proc_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = proc_record.pronamespace
    where namespace_record.nspname = 'public'
      and proc_record.proname = 'copy_task_into_course'
  ) then
    raise exception 'copy_task_into_course was not created' using errcode = '55000';
  end if;

  -- A global admin (organisation-less admin role).
  select role_assignment.user_id into v_admin
  from public.user_roles role_assignment
  join public.roles role_record on role_record.id = role_assignment.role_id
  where role_record.code = 'admin' and role_assignment.organization_id is null
  limit 1;

  -- A draft version (non-null org, so has_role can authorise) with a task to
  -- copy and a stage to copy it into.
  select source_task.id, source_task.stage_id
  into v_source_task, v_target_stage
  from public.tasks source_task
  join public.content_versions version_record
    on version_record.id = source_task.content_version_id
  join public.courses course_record on course_record.id = version_record.course_id
  where version_record.state = 'draft' and course_record.organization_id is not null
  limit 1;

  if v_admin is null or v_source_task is null then
    raise notice 'no admin or draft fixture; behavioural copy check skipped';
    return;
  end if;

  select count(*) into v_src_locales
  from public.task_localizations where task_id = v_source_task;

  begin
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    v_new_task := public.copy_task_into_course(v_source_task, v_target_stage);

    select count(*) into v_new_locales
    from public.task_localizations where task_id = v_new_task;

    v_ok := v_new_task is not null
        and v_new_task <> v_source_task
        and v_new_locales = v_src_locales;

    raise exception 'copy_task_verify_rollback';
  exception
    when others then
      if sqlerrm <> 'copy_task_verify_rollback' then raise; end if;
  end;

  if not v_ok then
    raise exception
      'copy_task_into_course did not produce an independent task with its % '
      'localizations (new task=%, copied locales=%)',
      v_src_locales, v_new_task, v_new_locales using errcode = '55000';
  end if;
  raise notice 'verified: copy_task_into_course cloned a task and its % localizations',
    v_src_locales;
end
$verify$;
