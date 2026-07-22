-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3 — the pre-task question reaches the learner.
--
-- Phase 1c put `gate_question` into content_versions.snapshot and built the
-- lock that depends on it. It did NOT put the question on the learner's task
-- screen, so `answer_task_gate_question` and `skip_task_gate_question` had
-- nothing to call them: the question existed, the lock worked, and there was
-- no way for a learner to see the question or answer it. A gate with no door.
--
-- `app_private.get_my_learning_task_without_requirements` is the projection the
-- task screen reads. It builds an explicit object key by key — it does NOT pass
-- the snapshot payload through — so a key absent from it is invisible no matter
-- what the snapshot holds. Same shape of trap as I-048, one layer further out.
--
--
-- WHERE EACH HALF COMES FROM, AND WHY THAT SPLIT
--
--   the QUESTION    from `task_record.task_payload -> 'gate_question'`, i.e.
--                   the learner's own frozen snapshot. It is course material,
--                   so it must be the version they were assigned, not whatever
--                   an author has since typed into the draft.
--
--   the ANSWER      from `public.task_gate_responses`, live. It is the
--                   learner's own state, not content, and freezing it would be
--                   meaningless.
--
-- Reading the question from `public.task_gate_questions` instead would have
-- been shorter and wrong: a learner mid-course would silently start seeing a
-- newer question than the one their course was published with.
--
--
-- 'unanswered' IS A THIRD STATE, NOT AN ABSENCE
--
-- The projection reports `unanswered` / `skipped` / `answered` rather than a
-- nullable row, because "never asked" and "asked and deferred" need different
-- words on screen — only one of them should say "Sie haben diese Frage
-- übersprungen". The lock treats the first two identically; the UI does not
-- have to, and `20260730300000` already stores 'skipped' explicitly for exactly
-- this reason.
--
-- No snapshot change, no validator change: this is a read-side projection over
-- data the snapshot already carries, so §6.3 does not apply.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $projection$
declare
  function_body text;
  anchor constant text := '    ''target_url'', case';
  replacement constant text :=
    '    ''gate_question'', case' || E'\n'
    || '      when jsonb_typeof(task_record.task_payload -> ''gate_question'') = ''object''' || E'\n'
    || '      then jsonb_build_object(' || E'\n'
    || '        ''id'', task_record.task_payload #>> ''{gate_question,id}'',' || E'\n'
    || '        ''question'',' || E'\n'
    || '          task_record.task_payload #> ''{gate_question,question_translations}'',' || E'\n'
    -- One scalar sub-select rather than two: the row is read once and the two
    -- fields come off it together, so state and answer can never disagree.
    || '        ''state'', coalesce((' || E'\n'
    || '          select response_record.state' || E'\n'
    || '          from public.task_gate_responses response_record' || E'\n'
    || '          where response_record.enrollment_id = task_record.enrollment_id' || E'\n'
    || '            and response_record.gate_question_id =' || E'\n'
    || '              (task_record.task_payload #>> ''{gate_question,id}'')::uuid' || E'\n'
    || '        ), ''unanswered''),' || E'\n'
    || '        ''answer_text'', (' || E'\n'
    || '          select response_record.answer_text' || E'\n'
    || '          from public.task_gate_responses response_record' || E'\n'
    || '          where response_record.enrollment_id = task_record.enrollment_id' || E'\n'
    || '            and response_record.gate_question_id =' || E'\n'
    || '              (task_record.task_payload #>> ''{gate_question,id}'')::uuid' || E'\n'
    || '        )' || E'\n'
    || '      )' || E'\n'
    || '      else null' || E'\n'
    || '    end,' || E'\n'
    || anchor;
  occurrences integer;
  volatility "char";
  is_definer boolean;
begin
  select proc_record.prosrc, proc_record.provolatile, proc_record.prosecdef
  into function_body, volatility, is_definer
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'app_private'
    and proc_record.proname = 'get_my_learning_task_without_requirements';

  if function_body is null then
    raise exception
      'get_my_learning_task_without_requirements not found — refusing to guess its body'
      using errcode = '55000';
  end if;
  if position('gate_question' in function_body) > 0 then
    raise notice 'the learner task projection already carries gate_question — nothing to do';
    return;
  end if;

  -- Volatility and security read from the catalogue rather than assumed, the
  -- same care 20260727110000 took: recreating a function with different
  -- volatility silently changes how the planner may cache it.
  if volatility <> 's' or not is_definer then
    raise exception
      'expected a STABLE SECURITY DEFINER function, found volatility=% definer=%',
      volatility, is_definer using errcode = '55000';
  end if;

  occurrences := (length(function_body) - length(replace(function_body, anchor, '')))
                 / length(anchor);
  if occurrences <> 1 then
    raise exception
      'expected exactly 1 target_url key in the learner task projection, found % — '
      'the deployed body has changed and this patch must be re-read',
      occurrences using errcode = '55000';
  end if;

  function_body := replace(function_body, anchor, replacement);

  execute format(
    'create or replace function '
    || 'app_private.get_my_learning_task_without_requirements(p_task_id uuid) '
    || 'returns jsonb language sql stable security definer '
    || 'set search_path to '''' as %L',
    function_body
  );
  alter function app_private.get_my_learning_task_without_requirements(uuid)
    owner to postgres;

  raise notice 'the learner task projection now carries gate_question';
end
$projection$;

commit;

-- ─── Verification, against the real seeded learner ────────────────────────
do $verify$
declare
  body text;
  payload jsonb;
  learner constant uuid := '01980a00-0000-7000-8000-000000000001';
  probe_task uuid;
begin
  select proc_record.prosrc into body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'app_private'
    and proc_record.proname = 'get_my_learning_task_without_requirements';
  if body is null or position('gate_question' in body) = 0 then
    raise exception 'the projection was not patched' using errcode = '55000';
  end if;

  -- It must still return a usable payload for a task that has NO gate
  -- question, which is every seeded task. A patch that made the common case
  -- return null would empty the task screen for everybody.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', learner, 'role', 'authenticated')::text,
    true
  );

  select task_record.id into probe_task
  from public.tasks task_record
  where task_record.content_version_id = '01980a22-0000-7000-8000-000000000001'
  order by task_record.position
  limit 1;

  if probe_task is null then
    raise notice 'no seeded task to probe; behavioural check skipped';
    return;
  end if;

  payload := app_private.get_my_learning_task_without_requirements(probe_task);
  if payload is null then
    raise exception 'the projection now returns null for a seeded task'
      using errcode = '55000';
  end if;
  if not (payload ? 'gate_question') then
    raise exception 'the gate_question key is missing from the payload'
      using errcode = '55000';
  end if;
  if payload -> 'gate_question' <> 'null'::jsonb then
    raise exception 'a task with no gate question reported one: %',
      payload -> 'gate_question' using errcode = '55000';
  end if;
  -- And nothing else was lost in the rewrite.
  if not (payload ? 'title' and payload ? 'instructions' and payload ? 'target_url') then
    raise exception 'the rewrite dropped an existing key' using errcode = '55000';
  end if;

  raise notice 'Phase 3 projection verified: gate_question present, null when '
    'there is no question, and the existing keys survive';
end
$verify$;
