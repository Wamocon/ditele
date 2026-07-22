-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1c, part 2 — the Arena gate: a course task that stays locked until its
-- hunt has been approved.
--
-- FEATURE_BUILD_PLAN §1.6, first link of the chain:
--
--     Arena task submitted → trainer approves → course task unlocks
--
-- Three things change here and they MUST change together, which is why they are
-- one file (§6.3):
--
--     public.tasks.required_hunt_scenario_id     the authored fact
--     build_content_snapshot_without_competencies  what reaches the learner
--     is_valid_learner_content_snapshot          what is allowed to reach them
--     learner_snapshot_task_lock_reasons         what the lock actually does
--
-- A column without the builder change is invisible: learners never read
-- public.tasks, they read content_versions.snapshot. A builder change without
-- the validator change is worse than invisible — see the next section.
--
--
-- ⚠️ THE VALIDATOR ACCEPTS THE KEY'S ABSENCE, ON PURPOSE
--
-- Every snapshot published before today lacks `required_hunt_scenario`. The
-- obvious validator rule — `not (task_payload ? 'required_hunt_scenario')
-- → return false`, which is exactly how target_url and expected_minutes are
-- checked a few lines above — would mark every one of those existing snapshots
-- INVALID.
--
-- That does not raise. current_actor_pinned_course_context simply stops
-- matching, list_my_learning_courses returns zero rows, and every enrolled
-- learner's course silently vanishes with no error in any log. That is I-041,
-- and §6.3 records that it has already cost one session an afternoon.
--
-- So the key is validated ONLY WHEN PRESENT. `target_url` could be required
-- because it was already in every snapshot; a genuinely new key never can be.
--
-- Section 6 asserts this against the real published snapshot, unmodified: if
-- the existing snapshot ever stops validating, the migration refuses rather
-- than emptying the course.
--
--
-- WHY THE COLUMN POINTS AT AN ID BUT THE GATE MATCHES ON A CODE
--
-- required_hunt_scenario_id is a real foreign key, so a course cannot be
-- published against a scenario that does not exist. But hunt_scenarios is
-- versioned — unique (code, scenario_version) — and bumping the version to
-- publish a change is the documented way to avoid disturbing learners
-- mid-hunt (sandbox/README §7).
--
-- If the gate matched on the id, an author publishing v2 of a scenario would
-- re-lock the task for every learner who had already cleared v1, and their only
-- route out would be to hunt the same screen again. So the snapshot carries the
-- CODE as well, and the unlock check matches on it: any accepted attempt at
-- that scenario, at any version, counts.
--
--
-- AND WHY THE UNLOCK IS NOT SCOPED TO THIS COURSE
--
-- The check deliberately does not require the accepted hunt to belong to the
-- cohort, the content version or even the course holding the gated task. The
-- Arena is a cross-course practice ground: a learner who genuinely found the
-- planted defects in `checkout-v1` has demonstrated it, and making them repeat
-- the identical screen because they met it under a different course would be
-- busywork the requirement never asked for. It IS scoped to the learner and
-- their organisation.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. The authored fact ──────────────────────────────────────────────────

alter table public.tasks
  add column if not exists required_hunt_scenario_id uuid;

do $fk$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_required_hunt_scenario_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_required_hunt_scenario_fkey
      foreign key (required_hunt_scenario_id)
      references public.hunt_scenarios (id) on delete restrict;
  end if;

  -- A hunt task gating itself would be unreachable forever.
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.tasks'::regclass
      and conname = 'tasks_hunt_does_not_gate_itself'
  ) then
    alter table public.tasks
      add constraint tasks_hunt_does_not_gate_itself check (
        required_hunt_scenario_id is null or task_kind <> 'hunt'
      );
  end if;
end
$fk$;

create index if not exists tasks_required_hunt_scenario_idx
  on public.tasks (required_hunt_scenario_id)
  where required_hunt_scenario_id is not null;

comment on column public.tasks.required_hunt_scenario_id is
  'The Arena scenario a learner must have had ACCEPTED before this course task '
  'unlocks. FEATURE_BUILD_PLAN section 1.6. Matched by scenario code, not id, '
  'so publishing a new scenario version does not re-lock finished learners.';

-- ─── 2. The snapshot builder ───────────────────────────────────────────────
-- Patched by rewriting the deployed body against an asserted anchor count,
-- the idiom 20260727110000 established. Retyping 240 lines of builder to
-- change one object key is how the two copies drift apart.

do $builder$
declare
  function_body text;
  anchor constant text := '''expected_minutes'', task_row.expected_minutes,';
  replacement constant text :=
    '''expected_minutes'', task_row.expected_minutes,'
    || E'\n                ''required_hunt_scenario'', ('
    || E'\n                  select jsonb_build_object('
    || E'\n                    ''id'', scenario_row.id,'
    || E'\n                    ''code'', scenario_row.code,'
    || E'\n                    ''title'', scenario_row.title'
    || E'\n                  )'
    || E'\n                  from public.hunt_scenarios scenario_row'
    || E'\n                  where scenario_row.id = task_row.required_hunt_scenario_id'
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
    raise exception
      'build_content_snapshot_without_competencies not found — refusing to guess its body';
  end if;

  if position('required_hunt_scenario' in function_body) > 0 then
    raise notice 'the snapshot builder already emits required_hunt_scenario — nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(replace(function_body, anchor, '')))
                 / length(anchor);
  if occurrences <> 1 then
    raise exception
      'expected exactly 1 expected_minutes anchor in the snapshot builder, found % — '
      'the deployed body has changed and this patch must be re-read before it is applied',
      occurrences using errcode = '55000';
  end if;

  function_body := replace(function_body, anchor, replacement);

  -- Volatility and security read out of pg_proc rather than assumed: plpgsql,
  -- STABLE, SECURITY DEFINER, empty search_path. Recreating a function with
  -- different volatility silently changes how the planner may cache it.
  execute format(
    'create or replace function '
    || 'app_private.build_content_snapshot_without_competencies(p_content_version_id uuid) '
    || 'returns jsonb language plpgsql stable security definer '
    || 'set search_path to '''' as %L',
    function_body
  );
  alter function app_private.build_content_snapshot_without_competencies(uuid)
    owner to postgres;

  raise notice 'snapshot builder now emits required_hunt_scenario';
end
$builder$;

-- ─── 3. The validator ──────────────────────────────────────────────────────

do $validator$
declare
  function_body text;
  anchor constant text :=
    '      if task_payload -> ''expected_minutes'' <> ''null''::jsonb and (';
  replacement constant text :=
    '      if task_payload ? ''required_hunt_scenario''' || E'\n'
    || '         and task_payload -> ''required_hunt_scenario'' <> ''null''::jsonb then' || E'\n'
    || '        if jsonb_typeof(task_payload -> ''required_hunt_scenario'')' || E'\n'
    || '             is distinct from ''object''' || E'\n'
    || '           or jsonb_typeof(task_payload #> ''{required_hunt_scenario,id}'')' || E'\n'
    || '             is distinct from ''string''' || E'\n'
    || '           or jsonb_typeof(task_payload #> ''{required_hunt_scenario,code}'')' || E'\n'
    || '             is distinct from ''string''' || E'\n'
    || '           or nullif(btrim(task_payload #>> ''{required_hunt_scenario,code}''), '''')' || E'\n'
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
    raise exception
      'is_valid_learner_content_snapshot not found — refusing to guess its body';
  end if;

  if position('required_hunt_scenario' in function_body) > 0 then
    raise notice 'the snapshot validator already knows required_hunt_scenario — nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(replace(function_body, anchor, '')))
                 / length(anchor);
  if occurrences <> 1 then
    raise exception
      'expected exactly 1 expected_minutes guard in the snapshot validator, found % — '
      'the deployed body has changed and this patch must be re-read before it is applied',
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

  raise notice 'snapshot validator now checks required_hunt_scenario when present';
end
$validator$;

-- ─── 4. The lock itself ────────────────────────────────────────────────────

do $locks$
declare
  function_body text;
  anchor constant text := '  if not (p_task_payload ? ''prerequisites'') then';
  replacement constant text :=
    '  if jsonb_typeof(p_task_payload -> ''required_hunt_scenario'') = ''object'' then' || E'\n'
    || '    if not exists (' || E'\n'
    || '      select 1' || E'\n'
    || '      from public.attempts attempt_record' || E'\n'
    || '      join public.tasks hunt_task' || E'\n'
    || '        on hunt_task.id = attempt_record.task_id' || E'\n'
    || '       and hunt_task.task_kind = ''hunt''' || E'\n'
    || '       and hunt_task.source_system = ''arena''' || E'\n'
    || '       and hunt_task.external_id =' || E'\n'
    || '         (p_task_payload #>> ''{required_hunt_scenario,code}'')' || E'\n'
    || '      join public.submissions submission_record' || E'\n'
    || '        on submission_record.attempt_id = attempt_record.id' || E'\n'
    || '       and submission_record.state = ''accepted''' || E'\n'
    || '      where attempt_record.learner_id = actor_id' || E'\n'
    || '        and attempt_record.organization_id = p_organization_id' || E'\n'
    || '        and attempt_record.state = ''accepted''' || E'\n'
    || '    ) then' || E'\n'
    || '      reasons := reasons || jsonb_build_array(jsonb_build_object(' || E'\n'
    || '        ''code'', ''required_hunt'',' || E'\n'
    || '        ''scenario_code'', p_task_payload #>> ''{required_hunt_scenario,code}'',' || E'\n'
    || '        ''scenario_title'', p_task_payload #>> ''{required_hunt_scenario,title}''' || E'\n'
    || '      ));' || E'\n'
    || '    end if;' || E'\n'
    || '  end if;' || E'\n'
    || E'\n'
    || anchor;
  occurrences integer;
begin
  select proc_record.prosrc into function_body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'app_private'
    and proc_record.proname = 'learner_snapshot_task_lock_reasons';

  if function_body is null then
    raise exception
      'learner_snapshot_task_lock_reasons not found — refusing to guess its body';
  end if;

  if position('required_hunt' in function_body) > 0 then
    raise notice 'the lock reasons already include required_hunt — nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(replace(function_body, anchor, '')))
                 / length(anchor);
  if occurrences <> 1 then
    raise exception
      'expected exactly 1 prerequisites guard in learner_snapshot_task_lock_reasons, found % — '
      'the deployed body has changed and this patch must be re-read before it is applied',
      occurrences using errcode = '55000';
  end if;

  function_body := replace(function_body, anchor, replacement);

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

  raise notice 'lock reasons now include required_hunt';
end
$locks$;

-- ─── 5. NO fixture is wired here, and that is the schema's decision ────────
--
-- The first draft of this migration ended by gating the seeded course's
-- knowledge task (position 2) on its hunt task (position 1) — the exact shape
-- §1.6 describes, sitting right there in the seed — and rebuilding the
-- snapshot.
--
-- It was refused, correctly, by app_private.guard_immutable_content_graph:
--
--     ERROR:  published content graph is immutable
--
-- That course's only content version is PUBLISHED, and the guard fires on any
-- write to a task under a published or archived version. There is no bypass and
-- there should not be one: learners hold accepted attempts against that exact
-- content, and retro-fitting a new gate onto it would change what they were
-- assessed on after the fact.
--
-- The product path is the one 20260727110000's header already states — author a
-- new draft version and publish it, which rebuilds the snapshot through
-- publish_content_version and runs this validation for real. That is what the
-- Phase 2 admin UI does, so the gate gets its live example there rather than
-- from a migration reaching around a guard.
--
-- What this file ships is the mechanism. Section 6 proves the mechanism works
-- without writing to anything published.
--
-- The helper below is what lets it: it injects a key into one task of a real
-- snapshot and hands back a COPY, so the validator can be asked a real question
-- about real content without anything being written. Phase 1c part 3 and the
-- Phase 5 checks need the same move, and hand-rolling it each time is how two
-- tests end up asserting subtly different things.

create or replace function app_private.snapshot_with_task_gate_probe(
  p_snapshot jsonb,
  p_task_id uuid,
  p_gate jsonb
) returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select case
    when app_private.snapshot_task_payload(p_snapshot, p_task_id) is null then null
    else jsonb_set(
      p_snapshot,
      '{stages}',
      (
        select jsonb_agg(
          jsonb_set(
            stage_payload.value,
            '{tasks}',
            (
              select coalesce(jsonb_agg(
                case
                  when task_payload.value ->> 'id' = p_task_id::text
                  then task_payload.value
                       || jsonb_build_object('required_hunt_scenario', p_gate)
                  else task_payload.value
                end
                order by task_payload.ordinality
              ), '[]'::jsonb)
              from jsonb_array_elements(
                case
                  when jsonb_typeof(stage_payload.value -> 'tasks') = 'array'
                    then stage_payload.value -> 'tasks'
                  else '[]'::jsonb
                end
              ) with ordinality task_payload(value, ordinality)
            )
          )
          order by stage_payload.ordinality
        )
        from jsonb_array_elements(
          case
            when jsonb_typeof(p_snapshot -> 'stages') = 'array'
              then p_snapshot -> 'stages'
            else '[]'::jsonb
          end
        ) with ordinality stage_payload(value, ordinality)
      )
    )
  end;
$function$;

comment on function app_private.snapshot_with_task_gate_probe is
  'Test scaffolding: returns a COPY of a snapshot with required_hunt_scenario '
  'set on one task, so the validator can be asked about real content without '
  'writing to a published content graph.';

commit;

-- ─── 6. Verification, by schema effect and by behaviour ────────────────────
--
-- Run against the REAL published snapshot of the seeded course, read-only. The
-- three cases below are the three ways this migration could have gone wrong,
-- and the first is by far the most expensive.
do $verify$
declare
  observed integer;
  live_version constant uuid := '01980a22-0000-7000-8000-000000000001';
  gated_task constant uuid := '019f9100-0000-7000-8000-000000000002';
  course_record_id uuid;
  course_record_slug text;
  version_number integer;
  live_snapshot jsonb;
  probe jsonb;
  scenario_id uuid;
begin
  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.tasks'::regclass
      and attname = 'required_hunt_scenario_id'
      and not attisdropped
  ) then
    raise exception 'tasks.required_hunt_scenario_id is missing' using errcode = '55000';
  end if;

  -- All three functions are REPLACEMENTS, so existence proves nothing (§6.1).
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
    and proc_record.prosrc like '%required_hunt%';
  if observed <> 3 then
    raise exception
      'expected all 3 snapshot functions to mention required_hunt, found %', observed
      using errcode = '55000';
  end if;

  select version_record.snapshot, course_row.id, course_row.slug,
         version_record.version_number
  into live_snapshot, course_record_id, course_record_slug, version_number
  from public.content_versions version_record
  join public.courses course_row on course_row.id = version_record.course_id
  where version_record.id = live_version;

  if live_snapshot is null then
    raise notice 'the seeded published version is absent; behavioural checks skipped';
    return;
  end if;

  -- CASE 1 — the one that matters. Every snapshot published before today lacks
  -- required_hunt_scenario. If the new validator rule rejects them, no error is
  -- raised anywhere: the course simply disappears for every enrolled learner
  -- (I-041). This asserts the live snapshot is STILL valid, untouched.
  if not app_private.is_valid_learner_content_snapshot(
    live_snapshot, course_record_id, course_record_slug, live_version, version_number
  ) then
    raise exception
      'the EXISTING published snapshot no longer validates — the new rule would '
      'have silently emptied the course for every enrolled learner'
      using errcode = '55000';
  end if;

  -- CASE 2 — a well-formed gate is accepted. Injected into a copy; nothing is
  -- written back, so the published content graph is untouched.
  select scenario_record.id into scenario_id
  from public.hunt_scenarios scenario_record
  where scenario_record.code = 'checkout-v1'
  order by scenario_record.scenario_version desc limit 1;

  if scenario_id is not null then
    probe := app_private.snapshot_with_task_gate_probe(
      live_snapshot, gated_task,
      jsonb_build_object(
        'id', scenario_id, 'code', 'checkout-v1', 'title', 'Kassen-Jagd'
      )
    );
    if probe is null then
      raise notice 'the gated task is not in the seeded snapshot; cases 2 and 3 skipped';
    else
      if not app_private.is_valid_learner_content_snapshot(
        probe, course_record_id, course_record_slug, live_version, version_number
      ) then
        raise exception
          'a WELL-FORMED required_hunt_scenario is rejected by the validator'
          using errcode = '55000';
      end if;

      -- CASE 3 — a malformed gate is refused. Without this the rule could be a
      -- no-op that accepts everything, which looks identical to case 2 passing.
      probe := app_private.snapshot_with_task_gate_probe(
        live_snapshot, gated_task,
        jsonb_build_object('id', scenario_id, 'title', 'no code key')
      );
      if app_private.is_valid_learner_content_snapshot(
        probe, course_record_id, course_record_slug, live_version, version_number
      ) then
        raise exception
          'a MALFORMED required_hunt_scenario is accepted — the new rule is a no-op'
          using errcode = '55000';
      end if;
    end if;
  end if;

  raise notice 'Phase 1c part 2 verified: existing snapshots still valid, '
    'well-formed gate accepted, malformed gate refused';
end
$verify$;
