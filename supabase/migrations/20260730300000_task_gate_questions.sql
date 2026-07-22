-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1c, part 3 — the pre-task question, and the rest of the gate chain.
--
-- FEATURE_BUILD_PLAN §1.6, the half that is easiest to get subtly wrong:
--
--     student is asked the task's question before attempting
--       → they may ANSWER NOW or SKIP AND DO IT LATER
--       → the course task counts as FINISHED only once the question is answered
--       → until then the NEXT course task stays locked,
--          even if its own Arena task is already approved
--
-- Read that once more, because the obvious implementation is wrong in a way
-- that passes a casual test: a skipped question does NOT block the task it
-- belongs to. The learner may skip it and go straight on doing that task. What
-- it blocks is progression PAST it. So the lock lives on the FOLLOWING task and
-- is answered by looking BACKWARDS, not on this task looking at itself.
--
-- And "even if its own Arena task is already approved" is the reason this is a
-- second, independent lock reason rather than a condition folded into
-- required_hunt. Both can be outstanding at once and a learner is owed both
-- explanations, not whichever one the code happened to check first.
--
--
-- WHY A NEW TABLE, NOT A FLAG ON task_assessments — decision §2.3
--
-- task_assessments is the IN-task test and is already embedded in every
-- published content_versions.snapshot, under the `assessment` key, with its own
-- validator rules (three locales, selection_mode, at least two options). Adding
-- a `phase` column would change the meaning of a structure that historical
-- snapshots already contain and that is re-validated on every read. A snapshot
-- written last month would suddenly be a document whose `assessment` might mean
-- either of two things depending on a column that was not in it.
--
-- New shape, new key, no reinterpretation of old data.
--
--
-- ⚠️ THE GATE QUESTION IS CONTENT, SO IT IS MADE IMMUTABLE LIKE CONTENT
--
-- app_private.content_owner_version raises 'unsupported content graph table' for
-- anything it does not know, which means attaching guard_immutable_content_graph
-- to a new table is not just a CREATE TRIGGER — that function has to learn the
-- table first. Skipping it would have left task_gate_questions as the ONE
-- content table a published course could still be edited through, beside twelve
-- that refuse. It is added to the task_id branch, next to task_assessments,
-- which is exactly what it is a sibling of.
--
--
-- SKIPPING IS RECORDED, NOT INFERRED FROM ABSENCE
--
-- task_gate_responses stores 'skipped' explicitly rather than treating "no row"
-- as skipped. The two are genuinely different: a learner who has not yet been
-- ASKED and a learner who was asked and deferred need different words on screen,
-- and only one of them should see "Sie haben diese Frage übersprungen". The lock
-- treats them identically — neither is 'answered' — but the UI does not have to.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. The authored question ──────────────────────────────────────────────

create table if not exists public.task_gate_questions (
  id uuid primary key default app_private.uuid7(),
  -- One question per task. §1.6 says "the task's question", singular, and a
  -- second one would make "until then" ambiguous.
  task_id uuid not null unique references public.tasks (id) on delete cascade,
  question_translations jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  -- The same three-locale rule the snapshot validator enforces, stated here too
  -- so a bad write is refused with a clear error instead of silently producing
  -- a snapshot that fails validation and empties the course (I-041).
  constraint task_gate_questions_translations_shape check (
    jsonb_typeof(question_translations) = 'object'
    and question_translations ?& array['en', 'de', 'ru']
    and nullif(btrim(question_translations ->> 'en'), '') is not null
    and nullif(btrim(question_translations ->> 'de'), '') is not null
    and nullif(btrim(question_translations ->> 'ru'), '') is not null
  )
);

comment on table public.task_gate_questions is
  'The question a learner is asked BEFORE attempting a task. Deliberately not a '
  'phase flag on task_assessments, which is the in-task test and is already '
  'embedded in every published snapshot. FEATURE_BUILD_PLAN section 2.3.';

alter table public.task_gate_questions enable row level security;
grant select on public.task_gate_questions to authenticated;
revoke insert, update, delete on public.task_gate_questions from authenticated;

drop policy if exists task_gate_questions_scoped_read on public.task_gate_questions;
create policy task_gate_questions_scoped_read
  on public.task_gate_questions for select to authenticated
  using (
    exists (
      select 1
      from public.tasks task_record
      join public.courses course_record on course_record.id = task_record.course_id
      where task_record.id = task_gate_questions.task_id
        and (select app_private.has_permission(
          'content.manage', course_record.organization_id, null))
    )
  );

-- Learners do not read this table; they read the `gate_question` key of the
-- snapshot, like every other piece of task content.

-- ─── 2. The learner's answer, or their deferral ────────────────────────────

create table if not exists public.task_gate_responses (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  learner_id uuid not null references auth.users (id) on delete cascade,
  gate_question_id uuid not null
    references public.task_gate_questions (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  state text not null,
  answer_text text,
  answered_at timestamptz,
  row_version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  -- Per enrolment, not per learner: the same learner meeting the same course
  -- twice is answering afresh.
  constraint task_gate_responses_unique unique (enrollment_id, gate_question_id),
  constraint task_gate_responses_state_check
    check (state in ('answered', 'skipped')),
  -- An 'answered' row with nothing in it would satisfy the lock while telling
  -- the trainer nothing, which is the failure this constraint exists to stop.
  constraint task_gate_responses_answered_has_text check (
    state <> 'answered'
    or (nullif(btrim(answer_text), '') is not null and answered_at is not null)
  ),
  constraint task_gate_responses_row_version_check check (row_version > 0)
);

comment on table public.task_gate_responses is
  'One row per learner per gate question. state=''skipped'' is recorded rather '
  'than inferred from absence: "not yet asked" and "asked and deferred" are '
  'different things on screen even though the lock treats them the same.';

create index if not exists task_gate_responses_enrollment_idx
  on public.task_gate_responses (enrollment_id, gate_question_id);
create index if not exists task_gate_responses_learner_idx
  on public.task_gate_responses (learner_id, task_id);

alter table public.task_gate_responses enable row level security;
grant select on public.task_gate_responses to authenticated;
revoke insert, update, delete on public.task_gate_responses from authenticated;

drop policy if exists task_gate_responses_scoped_read on public.task_gate_responses;
create policy task_gate_responses_scoped_read
  on public.task_gate_responses for select to authenticated
  using (
    learner_id = (select auth.uid())
    or (select app_private.has_permission('review.manage', organization_id, null))
    or (select app_private.has_permission('cohort.manage', organization_id, null))
  );

-- ─── 3. Teach the immutability guard about the new content table ───────────

create or replace function app_private.content_owner_version(
  p_table_name text,
  p_row jsonb
) returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  result uuid;
begin
  case p_table_name
    when 'stages', 'tasks', 'task_rubric_assignments', 'media_assets' then
      result := nullif(p_row ->> 'content_version_id', '')::uuid;
      if result is null and p_table_name = 'media_assets'
         and p_row ->> 'stage_id' is not null then
        select stage_record.content_version_id into result
        from public.stages stage_record
        where stage_record.id = (p_row ->> 'stage_id')::uuid;
      end if;
    when 'stage_localizations' then
      select stage_record.content_version_id into result
      from public.stages stage_record
      where stage_record.id = (p_row ->> 'stage_id')::uuid;
    -- task_gate_questions joins its siblings here. It hangs off a task by
    -- task_id exactly as task_assessments does, so it resolves the same way.
    when 'task_localizations', 'task_assessments', 'task_hints',
         'task_skill_mappings', 'task_gate_questions' then
      select task_record.content_version_id into result
      from public.tasks task_record
      where task_record.id = (p_row ->> 'task_id')::uuid;
    when 'task_options' then
      select task_record.content_version_id into result
      from public.tasks task_record
      where task_record.id = (p_row ->> 'task_id')::uuid;
    when 'task_option_answers' then
      select task_record.content_version_id into result
      from public.task_options option_record
      join public.tasks task_record on task_record.id = option_record.task_id
      where option_record.id = (p_row ->> 'task_option_id')::uuid;
    when 'task_model_answers' then
      select task_record.content_version_id into result
      from public.task_localizations localization_record
      join public.tasks task_record on task_record.id = localization_record.task_id
      where localization_record.id =
        (p_row ->> 'task_localization_id')::uuid;
    when 'prerequisites' then
      if p_row ->> 'target_task_id' is not null then
        select task_record.content_version_id into result
        from public.tasks task_record
        where task_record.id = (p_row ->> 'target_task_id')::uuid;
      end if;
    else
      raise exception 'unsupported content graph table: %', p_table_name
        using errcode = '22023';
  end case;

  return result;
end;
$function$;

drop trigger if exists task_gate_questions_guard_immutable on public.task_gate_questions;
create trigger task_gate_questions_guard_immutable
  before insert or update or delete on public.task_gate_questions
  for each row execute function app_private.guard_immutable_content_graph();

-- ─── 4. The snapshot builder ───────────────────────────────────────────────

do $builder$
declare
  function_body text;
  anchor constant text :=
    '''hint_penalty_basis_points'', task_row.hint_penalty_basis_points,';
  replacement constant text :=
    '''hint_penalty_basis_points'', task_row.hint_penalty_basis_points,'
    || E'\n                ''gate_question'', ('
    || E'\n                  select jsonb_build_object('
    || E'\n                    ''id'', gate_row.id,'
    || E'\n                    ''question_translations'', gate_row.question_translations'
    || E'\n                  )'
    || E'\n                  from public.task_gate_questions gate_row'
    || E'\n                  where gate_row.task_id = task_row.id'
    || E'\n                ),';
  occurrences integer;
begin
  select proc_record.prosrc into function_body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'app_private'
    and proc_record.proname = 'build_content_snapshot_without_competencies';

  if function_body is null then
    raise exception 'build_content_snapshot_without_competencies not found'
      using errcode = '55000';
  end if;
  if position('gate_question' in function_body) > 0 then
    raise notice 'the snapshot builder already emits gate_question — nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(replace(function_body, anchor, '')))
                 / length(anchor);
  if occurrences <> 1 then
    raise exception
      'expected exactly 1 hint_penalty anchor in the snapshot builder, found % — '
      'the deployed body has changed and this patch must be re-read',
      occurrences using errcode = '55000';
  end if;

  function_body := replace(function_body, anchor, replacement);
  execute format(
    'create or replace function '
    || 'app_private.build_content_snapshot_without_competencies(p_content_version_id uuid) '
    || 'returns jsonb language plpgsql stable security definer '
    || 'set search_path to '''' as %L',
    function_body
  );
  alter function app_private.build_content_snapshot_without_competencies(uuid)
    owner to postgres;
  raise notice 'snapshot builder now emits gate_question';
end
$builder$;

-- ─── 5. The validator ──────────────────────────────────────────────────────
-- Validated ONLY WHEN PRESENT, for the reason spelled out at length in
-- 20260730200000: every snapshot published before today lacks the key, and a
-- rule that rejects them empties every enrolled learner's course with no error
-- anywhere (I-041).

do $validator$
declare
  function_body text;
  anchor constant text := '      if task_payload ? ''required_hunt_scenario''';
  replacement constant text :=
    '      if task_payload ? ''gate_question''' || E'\n'
    || '         and task_payload -> ''gate_question'' <> ''null''::jsonb then' || E'\n'
    || '        if jsonb_typeof(task_payload -> ''gate_question'')' || E'\n'
    || '             is distinct from ''object''' || E'\n'
    || '           or jsonb_typeof(task_payload #> ''{gate_question,id}'')' || E'\n'
    || '             is distinct from ''string''' || E'\n'
    || '           or jsonb_typeof(task_payload #> ''{gate_question,question_translations}'')' || E'\n'
    || '             is distinct from ''object''' || E'\n'
    || '           or not (task_payload #> ''{gate_question,question_translations}''' || E'\n'
    || '                   ?& array[''en'', ''de'', ''ru''])' || E'\n'
    || '           or nullif(btrim(' || E'\n'
    || '                task_payload #>> ''{gate_question,question_translations,en}''), '''')' || E'\n'
    || '             is null' || E'\n'
    || '           or nullif(btrim(' || E'\n'
    || '                task_payload #>> ''{gate_question,question_translations,de}''), '''')' || E'\n'
    || '             is null' || E'\n'
    || '           or nullif(btrim(' || E'\n'
    || '                task_payload #>> ''{gate_question,question_translations,ru}''), '''')' || E'\n'
    || '             is null then' || E'\n'
    || '          return false;' || E'\n'
    || '        end if;' || E'\n'
    || '      end if;' || E'\n'
    || anchor;
  occurrences integer;
begin
  select proc_record.prosrc into function_body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'app_private'
    and proc_record.proname = 'is_valid_learner_content_snapshot';

  if function_body is null then
    raise exception 'is_valid_learner_content_snapshot not found' using errcode = '55000';
  end if;
  if position('gate_question' in function_body) > 0 then
    raise notice 'the snapshot validator already knows gate_question — nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(replace(function_body, anchor, '')))
                 / length(anchor);
  if occurrences <> 1 then
    raise exception
      'expected exactly 1 required_hunt_scenario guard in the validator, found % — '
      'apply 20260730200000 first, or re-read this patch',
      occurrences using errcode = '55000';
  end if;

  function_body := replace(function_body, anchor, replacement);
  execute format(
    'create or replace function app_private.is_valid_learner_content_snapshot('
    || 'p_snapshot jsonb, p_course_id uuid, p_course_slug text, '
    || 'p_content_version_id uuid, p_version_number integer) '
    || 'returns boolean language plpgsql stable security definer '
    || 'set search_path to '''' as %L',
    function_body
  );
  alter function app_private.is_valid_learner_content_snapshot(
    jsonb, uuid, text, uuid, integer
  ) owner to postgres;
  raise notice 'snapshot validator now checks gate_question when present';
end
$validator$;

-- ─── 6. The lock — looking BACKWARDS ───────────────────────────────────────
-- Two edits to one function body: the locals it needs, and the rule itself.

do $locks$
declare
  function_body text;
  declaration_anchor constant text := '  anchor_decided_at timestamptz;';
  declaration_addition constant text :=
    '  anchor_decided_at timestamptz;' || E'\n'
    || '  gate_probe jsonb;' || E'\n'
    || '  gate_previous_task jsonb;' || E'\n'
    || '  gate_question_id uuid;';
  rule_anchor constant text :=
    '  if jsonb_typeof(p_task_payload -> ''required_hunt_scenario'') = ''object'' then';
  rule_addition constant text :=
    -- Walk the snapshot in course order and stop at the current task; whatever
    -- was seen immediately before it is "the previous task". Flat across
    -- stages, because the first task of stage 2 follows the last of stage 1.
    '  gate_previous_task := null;' || E'\n'
    || '  for gate_probe in' || E'\n'
    || '    select task_element.value' || E'\n'
    || '    from jsonb_array_elements(' || E'\n'
    || '      case when jsonb_typeof(p_snapshot -> ''stages'') = ''array''' || E'\n'
    || '        then p_snapshot -> ''stages'' else ''[]''::jsonb end' || E'\n'
    || '    ) with ordinality stage_element(value, stage_order)' || E'\n'
    || '    cross join lateral jsonb_array_elements(' || E'\n'
    || '      case when jsonb_typeof(stage_element.value -> ''tasks'') = ''array''' || E'\n'
    || '        then stage_element.value -> ''tasks'' else ''[]''::jsonb end' || E'\n'
    || '    ) with ordinality task_element(value, task_order)' || E'\n'
    || '    order by stage_element.stage_order, task_element.task_order' || E'\n'
    || '  loop' || E'\n'
    || '    if (gate_probe ->> ''id'') = selected_task_id::text then' || E'\n'
    || '      exit;' || E'\n'
    || '    end if;' || E'\n'
    || '    gate_previous_task := gate_probe;' || E'\n'
    || '  end loop;' || E'\n'
    || E'\n'
    -- The rule itself: the PREVIOUS task's question, not this one's. A skipped
    -- question does not block its own task; it blocks progression past it.
    || '  if gate_previous_task is not null' || E'\n'
    || '     and jsonb_typeof(gate_previous_task -> ''gate_question'') = ''object''' || E'\n'
    || '     and jsonb_typeof(gate_previous_task #> ''{gate_question,id}'') = ''string'' then' || E'\n'
    || '    gate_question_id := (gate_previous_task #>> ''{gate_question,id}'')::uuid;' || E'\n'
    || '    if not exists (' || E'\n'
    || '      select 1 from public.task_gate_responses response_record' || E'\n'
    || '      where response_record.enrollment_id = p_enrollment_id' || E'\n'
    || '        and response_record.gate_question_id = gate_question_id' || E'\n'
    || '        and response_record.state = ''answered''' || E'\n'
    || '    ) then' || E'\n'
    || '      reasons := reasons || jsonb_build_array(jsonb_build_object(' || E'\n'
    || '        ''code'', ''gate_question'',' || E'\n'
    || '        ''previous_task_id'', gate_previous_task ->> ''id'',' || E'\n'
    || '        ''previous_task_title'', (' || E'\n'
    || '          select localization_record.value ->> ''title''' || E'\n'
    || '          from jsonb_array_elements(' || E'\n'
    || '            coalesce(gate_previous_task -> ''localizations'', ''[]''::jsonb)' || E'\n'
    || '          ) localization_record' || E'\n'
    || '          where localization_record.value ->> ''locale'' = ''de''' || E'\n'
    || '          limit 1' || E'\n'
    || '        )' || E'\n'
    || '      ));' || E'\n'
    || '    end if;' || E'\n'
    || '  end if;' || E'\n'
    || E'\n'
    || rule_anchor;
  occurrences integer;
begin
  select proc_record.prosrc into function_body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'app_private'
    and proc_record.proname = 'learner_snapshot_task_lock_reasons';

  if function_body is null then
    raise exception 'learner_snapshot_task_lock_reasons not found' using errcode = '55000';
  end if;
  if position('gate_previous_task' in function_body) > 0 then
    raise notice 'the lock reasons already include gate_question — nothing to do';
    return;
  end if;

  occurrences := (length(function_body)
                  - length(replace(function_body, declaration_anchor, '')))
                 / length(declaration_anchor);
  if occurrences <> 1 then
    raise exception 'expected exactly 1 anchor_decided_at declaration, found %',
      occurrences using errcode = '55000';
  end if;
  occurrences := (length(function_body)
                  - length(replace(function_body, rule_anchor, '')))
                 / length(rule_anchor);
  if occurrences <> 1 then
    raise exception
      'expected exactly 1 required_hunt_scenario rule, found % — apply 20260730200000 first',
      occurrences using errcode = '55000';
  end if;

  function_body := replace(function_body, declaration_anchor, declaration_addition);
  function_body := replace(function_body, rule_anchor, rule_addition);

  execute format(
    'create or replace function app_private.learner_snapshot_task_lock_reasons('
    || 'p_enrollment_id uuid, p_organization_id uuid, p_cohort_id uuid, '
    || 'p_progression_mode text, p_content_version_id uuid, p_snapshot jsonb, '
    || 'p_task_payload jsonb) '
    || 'returns jsonb language plpgsql stable security definer '
    || 'set search_path to '''' as %L',
    function_body
  );
  alter function app_private.learner_snapshot_task_lock_reasons(
    uuid, uuid, uuid, text, uuid, jsonb, jsonb
  ) owner to postgres;
  raise notice 'lock reasons now include gate_question';
end
$locks$;

-- ─── 7. Authoring ──────────────────────────────────────────────────────────

create or replace function public.set_task_gate_question(
  p_task_id uuid,
  p_question_translations jsonb,
  p_correlation_id uuid default null
) returns public.task_gate_questions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := coalesce(p_correlation_id, app_private.uuid7());
  task_row public.tasks;
  course_row public.courses;
  question_row public.task_gate_questions;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select task_record.* into task_row
  from public.tasks task_record where task_record.id = p_task_id;
  if task_row.id is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  select course_record.* into course_row
  from public.courses course_record where course_record.id = task_row.course_id;

  if not (select app_private.has_permission(
    'content.manage', course_row.organization_id, null
  )) then
    raise exception 'set_task_gate_question: content administration denied'
      using errcode = '42501';
  end if;

  -- Removing the question is passing null, not deleting the row from the app.
  if p_question_translations is null
     or jsonb_typeof(p_question_translations) = 'null' then
    delete from public.task_gate_questions where task_id = p_task_id;
    return null;
  end if;

  insert into public.task_gate_questions (task_id, question_translations)
  values (p_task_id, p_question_translations)
  on conflict (task_id) do update
    set question_translations = excluded.question_translations,
        updated_at = statement_timestamp()
  returning * into question_row;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    course_row.organization_id, actor_id, 'admin', 'task_gate_question.saved',
    'task', p_task_id, task_row.row_version, correlation_id,
    jsonb_build_object('gate_question_id', question_row.id)
  );

  return question_row;
end;
$function$;

-- ─── 8. Answering, and deferring ───────────────────────────────────────────

create or replace function app_private.resolve_gate_question_context(
  p_task_id uuid,
  out enrollment_id uuid,
  out organization_id uuid,
  out gate_question_id uuid
) returns record
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  context_record record;
  task_payload jsonb;
begin
  -- The learner's own pinned context, which is the only thing that says which
  -- content version they are actually on. Reading public.tasks instead would
  -- answer for the newest draft rather than for the course they are enrolled in.
  select * into context_record
  from app_private.current_actor_pinned_course_context(null) candidate
  where app_private.snapshot_task_payload(candidate.snapshot, p_task_id) is not null
  limit 1;

  if context_record.enrollment_id is null then
    raise exception 'task % is not part of a course you are enrolled on', p_task_id
      using errcode = '42501';
  end if;

  task_payload := app_private.snapshot_task_payload(context_record.snapshot, p_task_id);
  if jsonb_typeof(task_payload -> 'gate_question') is distinct from 'object' then
    raise exception 'task % has no gate question', p_task_id using errcode = 'P0002';
  end if;

  enrollment_id := context_record.enrollment_id;
  organization_id := context_record.organization_id;
  gate_question_id := (task_payload #>> '{gate_question,id}')::uuid;
end;
$function$;

create or replace function public.answer_task_gate_question(
  p_task_id uuid,
  p_answer_text text,
  p_correlation_id uuid default null
) returns public.task_gate_responses
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := coalesce(p_correlation_id, app_private.uuid7());
  context_record record;
  response_row public.task_gate_responses;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(p_answer_text), '') is null then
    raise exception 'an answer is required' using errcode = '22023';
  end if;

  context_record := app_private.resolve_gate_question_context(p_task_id);

  insert into public.task_gate_responses (
    organization_id, enrollment_id, learner_id, gate_question_id, task_id,
    state, answer_text, answered_at
  ) values (
    context_record.organization_id, context_record.enrollment_id, actor_id,
    context_record.gate_question_id, p_task_id, 'answered', btrim(p_answer_text),
    statement_timestamp()
  )
  on conflict (enrollment_id, gate_question_id) do update
    set state = 'answered',
        answer_text = excluded.answer_text,
        answered_at = statement_timestamp(),
        updated_at = statement_timestamp()
  returning * into response_row;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    context_record.organization_id, actor_id, 'learner',
    'task_gate_question.answered', 'task', p_task_id, response_row.row_version,
    correlation_id, jsonb_build_object('gate_question_id', context_record.gate_question_id)
  );

  return response_row;
end;
$function$;

create or replace function public.skip_task_gate_question(
  p_task_id uuid,
  p_correlation_id uuid default null
) returns public.task_gate_responses
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  correlation_id uuid := coalesce(p_correlation_id, app_private.uuid7());
  context_record record;
  response_row public.task_gate_responses;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  context_record := app_private.resolve_gate_question_context(p_task_id);

  insert into public.task_gate_responses (
    organization_id, enrollment_id, learner_id, gate_question_id, task_id, state
  ) values (
    context_record.organization_id, context_record.enrollment_id, actor_id,
    context_record.gate_question_id, p_task_id, 'skipped'
  )
  -- An already-answered question is NOT reverted to skipped. "Skip and do it
  -- later" is a deferral, and letting it undo an answer would re-lock a task the
  -- learner had legitimately passed.
  on conflict (enrollment_id, gate_question_id) do update
    set state = case when public.task_gate_responses.state = 'answered'
                  then 'answered' else 'skipped' end,
        updated_at = statement_timestamp()
  returning * into response_row;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    context_record.organization_id, actor_id, 'learner',
    'task_gate_question.skipped', 'task', p_task_id, response_row.row_version,
    correlation_id, jsonb_build_object('gate_question_id', context_record.gate_question_id)
  );

  return response_row;
end;
$function$;

grant execute on function public.set_task_gate_question(uuid, jsonb, uuid) to authenticated;
grant execute on function public.answer_task_gate_question(uuid, text, uuid) to authenticated;
grant execute on function public.skip_task_gate_question(uuid, uuid) to authenticated;

commit;

-- ─── Verification ──────────────────────────────────────────────────────────
do $verify$
declare
  observed integer;
  live_version constant uuid := '01980a22-0000-7000-8000-000000000001';
  course_record_id uuid;
  course_record_slug text;
  version_number integer;
  live_snapshot jsonb;
begin
  -- The guard really covers the new table, and via the function rather than by
  -- a trigger that would raise 'unsupported content graph table' on first use.
  if not exists (
    select 1 from pg_catalog.pg_trigger trigger_record
    join pg_catalog.pg_class class_record on class_record.oid = trigger_record.tgrelid
    where class_record.relname = 'task_gate_questions'
      and trigger_record.tgfoid = 'app_private.guard_immutable_content_graph'::regproc
  ) then
    raise exception 'task_gate_questions is not covered by the immutability guard'
      using errcode = '55000';
  end if;
  if app_private.content_owner_version(
    'task_gate_questions', jsonb_build_object('task_id', null)
  ) is not null then
    raise exception 'content_owner_version answered oddly for task_gate_questions'
      using errcode = '55000';
  end if;

  select count(*) into observed
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'app_private'
    and proc_record.proname in (
      'build_content_snapshot_without_competencies',
      'is_valid_learner_content_snapshot',
      'learner_snapshot_task_lock_reasons'
    )
    and proc_record.prosrc like '%gate_question%';
  if observed <> 3 then
    raise exception
      'expected all 3 snapshot functions to mention gate_question, found %', observed
      using errcode = '55000';
  end if;

  -- The assertion that matters most, again: the EXISTING published snapshot,
  -- which has no gate_question key anywhere, must still validate. If it does
  -- not, every enrolled learner's course silently empties (I-041).
  select version_record.snapshot, course_row.id, course_row.slug,
         version_record.version_number
  into live_snapshot, course_record_id, course_record_slug, version_number
  from public.content_versions version_record
  join public.courses course_row on course_row.id = version_record.course_id
  where version_record.id = live_version;

  if live_snapshot is not null
     and not app_private.is_valid_learner_content_snapshot(
       live_snapshot, course_record_id, course_record_slug, live_version, version_number
     ) then
    raise exception
      'the EXISTING published snapshot no longer validates — this migration would '
      'have silently emptied the course for every enrolled learner'
      using errcode = '55000';
  end if;

  raise notice 'Phase 1c part 3 verified';
end
$verify$;
