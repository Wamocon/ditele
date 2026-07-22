-- ═══════════════════════════════════════════════════════════════════════════
-- Arena tasks run in sequence — chosen: chain them through `prerequisites`.
--
-- AUTHORING_AND_FLOW §5.6 / §6.1:
--
--     Arena tasks run in sequence, expressed through prerequisites. Arena tasks
--     are tasks, prerequisites already links target_task_id → required_task_id,
--     and learner_snapshot_task_lock_reasons already reads it. One row per link,
--     no migration [to the schema], and a mixed chain — Arena, then course task,
--     then the next Arena task — expresses itself naturally.
--
-- The lock function already turns a `prerequisites` row into a `required_task`
-- lock and clears it once the required task's submission is accepted. That is
-- exactly the eight seeded course-task-on-hunt gates. A hunt→hunt row is the
-- same shape, so the learner side needs no change: Arena 2 stays locked until
-- Arena 1 is approved, with the "play the hunt" link the tasks list already
-- renders.
--
-- What was missing is the rows themselves. `materialize_arena_task_sequence`
-- writes one link per consecutive pair of hunt tasks, in course order —
-- (stage.position, task.position) — which is the order the learner sees and the
-- order the admin already sets by reordering tasks. "Give the admin a way to set
-- the order" is therefore the reorder that already exists; no new control, and
-- nothing in the simplified task editor another session is building has to know
-- about it.
--
-- WHERE it runs: inside `publish_content_version`, immediately before the
-- snapshot is built. The snapshot embeds `prerequisites` per task and freezes
-- them, so the rows must exist at that instant; publishing is also the only
-- moment the chain reaches a learner, and it is a stable chokepoint regardless
-- of how the draft → active lifecycle above it is simplified.
--
-- Idempotent, and a no-op for every seeded course: each has a single hunt task,
-- so there are no consecutive hunts and no rows are written.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- Rebuild the auto-managed hunt→hunt chain for one content version from the
-- current task order. Owns ONLY the links whose target AND required are both
-- hunt tasks in this version; course-task-on-hunt gates and skill prerequisites
-- are never touched.
create or replace function app_private.materialize_arena_task_sequence(
  p_content_version_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
begin
  -- The organisation the chain rows must carry. It has to equal the target
  -- task's course organisation — that is what validate_prerequisite_graph
  -- checks — and for a course with no organisation that value is legitimately
  -- NULL (8 of the seeded courses are), so this must NOT early-return on NULL.
  -- `if not found` distinguishes "unknown version" (nothing to do) from "known
  -- version whose course has a NULL organisation" (write NULL, which matches).
  select course_row.organization_id into v_org
  from public.content_versions version_row
  join public.courses course_row on course_row.id = version_row.course_id
  where version_row.id = p_content_version_id;
  if not found then
    return;
  end if;

  -- Drop the previous chain. WHERE on both ends is mandatory — the deployment
  -- loads `safeupdate` on the app role and rejects an unqualified DELETE — and
  -- it is what confines this function to the links it owns.
  delete from public.prerequisites rule_row
  where rule_row.target_task_id in (
          select task_row.id from public.tasks task_row
          where task_row.content_version_id = p_content_version_id
            and task_row.task_kind = 'hunt'
        )
    and rule_row.required_task_id in (
          select task_row.id from public.tasks task_row
          where task_row.content_version_id = p_content_version_id
            and task_row.task_kind = 'hunt'
        );

  -- Chain each hunt to the one before it in course order. A version with 0 or 1
  -- hunt task yields no pairs and writes nothing.
  insert into public.prerequisites (
    id, organization_id, target_task_id, required_task_id, rule_version
  )
  select app_private.uuid7(), v_org,
         ordered.task_id, ordered.previous_task_id, 1
  from (
    select hunt_row.id as task_id,
           lag(hunt_row.id) over (
             order by stage_row.position, hunt_row.position, hunt_row.id
           ) as previous_task_id
    from public.tasks hunt_row
    join public.stages stage_row on stage_row.id = hunt_row.stage_id
    where hunt_row.content_version_id = p_content_version_id
      and hunt_row.task_kind = 'hunt'
  ) ordered
  where ordered.previous_task_id is not null;
end;
$function$;

alter function app_private.materialize_arena_task_sequence(uuid) owner to postgres;

commit;

-- ─── Hook it into publishing, right before the snapshot is built ───────────
--
-- Surgical patch of the deployed body (the §6.3 idiom): read prosrc, insert one
-- `perform` before the single build_content_snapshot call, recreate. Robust to
-- whatever the current body is, and idempotent.
begin;

do $fix$
declare
  function_body text;
  anchor constant text :=
    '  render_snapshot := app_private.build_content_snapshot(p_content_version_id);';
  replacement constant text :=
    '  -- §6.1: freeze the Arena chain into public.prerequisites from task order,'
    || E'\n'
    || '  -- immediately before the snapshot embeds and freezes it, so consecutive'
    || E'\n'
    || '  -- hunt tasks gate one another exactly as a course task gates on its hunt.'
    || E'\n'
    || '  perform app_private.materialize_arena_task_sequence(p_content_version_id);'
    || E'\n'
    || '  render_snapshot := app_private.build_content_snapshot(p_content_version_id);';
  occurrences integer;
begin
  select proc_record.prosrc into function_body
  from pg_catalog.pg_proc proc_record
  join pg_catalog.pg_namespace namespace_record
    on namespace_record.oid = proc_record.pronamespace
  where namespace_record.nspname = 'public'
    and proc_record.proname = 'publish_content_version';

  if function_body is null then
    raise exception 'publish_content_version not found' using errcode = '55000';
  end if;
  if position('materialize_arena_task_sequence' in function_body) > 0 then
    raise notice 'publish already materialises the arena chain — nothing to do';
    return;
  end if;

  occurrences := (length(function_body) - length(replace(function_body, anchor, '')))
                 / length(anchor);
  if occurrences <> 1 then
    raise exception
      'expected exactly 1 build_content_snapshot call in publish_content_version, '
      'found % — the deployed body has changed and this patch must be re-read',
      occurrences using errcode = '55000';
  end if;

  function_body := replace(function_body, anchor, replacement);

  execute format(
    'create or replace function public.publish_content_version('
    || 'p_content_version_id uuid, p_expected_version bigint, '
    || 'p_idempotency_key text, p_correlation_id uuid) '
    || 'returns public.content_versions language plpgsql security definer '
    || 'set search_path to '''' as %L',
    function_body
  );
  alter function public.publish_content_version(uuid, bigint, text, uuid)
    owner to postgres;

  raise notice 'publish now materialises the arena chain before building the snapshot';
end
$fix$;

commit;

-- ─── Verification ─────────────────────────────────────────────────────────
--
-- Two halves. Structural: publishing calls the materialiser. Behavioural: on a
-- real draft stage, making two tasks into hunts and materialising produces a
-- hunt→hunt link — run inside a savepoint that is always rolled back, so no
-- fixture is mutated. Skips cleanly if the seed carries no draft stage with two
-- tasks (a fresh reset still gets the structural guarantee).
do $verify$
declare
  v_version uuid;
  v_stage uuid;
  v_tasks uuid[];
  v_chain integer := 0;
  v_ok boolean := false;
begin
  if position('materialize_arena_task_sequence' in (
    select proc_record.prosrc from pg_catalog.pg_proc proc_record
    join pg_catalog.pg_namespace namespace_record
      on namespace_record.oid = proc_record.pronamespace
    where namespace_record.nspname = 'public'
      and proc_record.proname = 'publish_content_version'
  )) = 0 then
    raise exception 'publish_content_version does not call the materialiser'
      using errcode = '55000';
  end if;

  select task_row.stage_id, task_row.content_version_id
  into v_stage, v_version
  from public.tasks task_row
  join public.content_versions version_record
    on version_record.id = task_row.content_version_id
  where version_record.state = 'draft'
  group by task_row.stage_id, task_row.content_version_id
  having count(*) >= 2
  limit 1;

  if v_stage is null then
    raise notice 'no draft stage with 2+ tasks; behavioural chain check skipped';
    return;
  end if;

  begin
    select array_agg(lowest.id order by lowest.position) into v_tasks
    from (
      select task_row.id, task_row.position
      from public.tasks task_row
      where task_row.stage_id = v_stage
      order by task_row.position
      limit 2
    ) lowest;

    update public.tasks
    set task_kind = 'hunt', required_hunt_scenario_id = null
    where id = any(v_tasks);

    perform app_private.materialize_arena_task_sequence(v_version);

    select count(*) into v_chain
    from public.prerequisites rule_row
    join public.tasks target_task on target_task.id = rule_row.target_task_id
    join public.tasks required_task on required_task.id = rule_row.required_task_id
    where target_task.task_kind = 'hunt'
      and required_task.task_kind = 'hunt'
      and target_task.content_version_id = v_version;

    v_ok := (v_chain >= 1);
    raise exception 'arena_seq_verify_rollback';
  exception
    when others then
      if sqlerrm <> 'arena_seq_verify_rollback' then raise; end if;
  end;

  if not v_ok then
    raise exception
      'materialize_arena_task_sequence did not chain two consecutive hunt tasks '
      '(chain rows = %)', v_chain using errcode = '55000';
  end if;
  raise notice 'verified: consecutive hunt tasks are chained (% link(s) on the probe)',
    v_chain;
end
$verify$;
