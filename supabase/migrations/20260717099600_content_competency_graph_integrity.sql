-- Close the competency and prerequisite graph under the same immutable,
-- reviewed publication boundary as stages, tasks, assessments, and rubrics.

-- Global platform courses require global task prerequisites. Tenant learning
-- paths remain tenant-owned, so null is valid only for task-owned rules whose
-- course is global.
alter table public.prerequisites
  alter column organization_id drop not null;

create or replace function app_private.validate_task_skill_mapping_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_version_id uuid;
  course_organization_id uuid;
  skill_organization_id uuid;
begin
  select
    task_record.content_version_id,
    course_record.organization_id,
    skill_record.organization_id
  into task_version_id, course_organization_id, skill_organization_id
  from public.tasks task_record
  join public.courses course_record on course_record.id = task_record.course_id
  join public.skills skill_record on skill_record.id = new.skill_id
  where task_record.id = new.task_id;

  if not found
     or task_version_id is null
     or not (
       skill_organization_id is null
       or skill_organization_id is not distinct from course_organization_id
     ) then
    raise exception 'task skill mapping scope must match its versioned course'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_task_skill_mapping_scope()
  from public, anon, authenticated;

create trigger task_skill_mappings_validate_scope
before insert or update of task_id, skill_id on public.task_skill_mappings
for each row execute function app_private.validate_task_skill_mapping_scope();

create or replace function app_private.validate_skill_edge_graph()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_organization_id uuid;
  child_organization_id uuid;
  parent_taxonomy_version integer;
  child_taxonomy_version integer;
begin
  select
    parent_skill.organization_id,
    child_skill.organization_id,
    parent_skill.taxonomy_version,
    child_skill.taxonomy_version
  into
    parent_organization_id,
    child_organization_id,
    parent_taxonomy_version,
    child_taxonomy_version
  from public.skills parent_skill
  cross join public.skills child_skill
  where parent_skill.id = new.parent_skill_id
    and child_skill.id = new.child_skill_id;

  if not found
     or parent_taxonomy_version <> child_taxonomy_version
     or not (
       parent_organization_id is null
       or parent_organization_id is not distinct from child_organization_id
     ) then
    raise exception 'skill edge scope and taxonomy version must be compatible'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'skill-prerequisite-graph:'
      || coalesce(child_organization_id::text, 'global')
      || ':' || child_taxonomy_version::text,
    0
  ));

  if new.relation = 'prerequisite' and exists (
    with recursive reachable(skill_id) as (
      select edge_record.child_skill_id
      from public.skill_edges edge_record
      where edge_record.parent_skill_id = new.child_skill_id
        and edge_record.relation = 'prerequisite'
        and edge_record.id is distinct from new.id
      union
      select edge_record.child_skill_id
      from public.skill_edges edge_record
      join reachable path_record
        on path_record.skill_id = edge_record.parent_skill_id
      where edge_record.relation = 'prerequisite'
        and edge_record.id is distinct from new.id
    )
    select 1 from reachable
    where skill_id = new.parent_skill_id
  ) then
    raise exception 'skill prerequisite graph must remain acyclic'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_skill_edge_graph()
  from public, anon, authenticated;

create trigger skill_edges_validate_graph
before insert or update of parent_skill_id, child_skill_id, relation
on public.skill_edges
for each row execute function app_private.validate_skill_edge_graph();

create or replace function app_private.validate_prerequisite_graph()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  target_version_id uuid;
  required_organization_id uuid;
  required_version_id uuid;
begin
  if new.target_task_id is not null then
    select course_record.organization_id, task_record.content_version_id
    into target_organization_id, target_version_id
    from public.tasks task_record
    join public.courses course_record on course_record.id = task_record.course_id
    where task_record.id = new.target_task_id;

    if not found
       or target_version_id is null
       or new.organization_id is distinct from target_organization_id then
      raise exception 'task prerequisite scope must match its versioned course'
        using errcode = '23514';
    end if;
  else
    select path_record.organization_id into target_organization_id
    from public.learning_paths path_record
    where path_record.id = new.learning_path_id;
    if not found
       or new.organization_id is distinct from target_organization_id then
      raise exception 'learning path prerequisite scope must match its path'
        using errcode = '23514';
    end if;
  end if;

  if new.required_task_id is not null then
    select course_record.organization_id, task_record.content_version_id
    into required_organization_id, required_version_id
    from public.tasks task_record
    join public.courses course_record on course_record.id = task_record.course_id
    where task_record.id = new.required_task_id;

    if not found
       or (
         new.target_task_id is not null
         and required_version_id is distinct from target_version_id
       )
       or (
         new.learning_path_id is not null
         and required_organization_id is not null
         and required_organization_id is distinct from target_organization_id
       ) then
      raise exception 'required task must be compatible with prerequisite scope'
        using errcode = '23514';
    end if;
  else
    select skill_record.organization_id into required_organization_id
    from public.skills skill_record
    where skill_record.id = new.required_skill_id;
    if not found
       or (
         required_organization_id is not null
         and required_organization_id is distinct from target_organization_id
       )
       or new.minimum_mastery_basis_points is null then
      raise exception 'required skill must be compatible and define mastery'
        using errcode = '23514';
    end if;
  end if;

  if new.target_task_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'task-prerequisite-graph:' || target_version_id::text,
      0
    ));

    if new.required_task_id is not null and exists (
      with recursive required_tasks(task_id) as (
        select prerequisite_record.required_task_id
        from public.prerequisites prerequisite_record
        where prerequisite_record.target_task_id = new.required_task_id
          and prerequisite_record.required_task_id is not null
          and prerequisite_record.id is distinct from new.id
        union
        select prerequisite_record.required_task_id
        from public.prerequisites prerequisite_record
        join required_tasks path_record
          on path_record.task_id = prerequisite_record.target_task_id
        where prerequisite_record.required_task_id is not null
          and prerequisite_record.id is distinct from new.id
      )
      select 1 from required_tasks
      where task_id = new.target_task_id
    ) then
      raise exception 'task prerequisite graph must remain acyclic'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_prerequisite_graph()
  from public, anon, authenticated;

create trigger prerequisites_validate_graph
before insert or update of
  organization_id, learning_path_id, target_task_id, required_task_id,
  required_skill_id, minimum_mastery_basis_points
on public.prerequisites
for each row execute function app_private.validate_prerequisite_graph();

-- These authoring tables were deliberately fail-closed by the foundation RLS
-- wave. Add only course/path-derived policies; no caller chooses a broader
-- organization scope.
create policy task_skill_mappings_content_write
on public.task_skill_mappings for all to authenticated
using (exists (
  select 1
  from public.tasks task_record
  join public.courses course_record on course_record.id = task_record.course_id
  where task_record.id = task_id
    and app_private.has_permission(
      'content.manage', course_record.organization_id
    )
))
with check (exists (
  select 1
  from public.tasks task_record
  join public.courses course_record on course_record.id = task_record.course_id
  where task_record.id = task_id
    and app_private.has_permission(
      'content.manage', course_record.organization_id
    )
));

create policy skill_edges_content_write
on public.skill_edges for all to authenticated
using (exists (
  select 1 from public.skills child_skill
  where child_skill.id = child_skill_id
    and app_private.has_permission(
      'content.manage', child_skill.organization_id
    )
))
with check (exists (
  select 1 from public.skills child_skill
  where child_skill.id = child_skill_id
    and app_private.has_permission(
      'content.manage', child_skill.organization_id
    )
));

create policy prerequisites_content_write
on public.prerequisites for all to authenticated
using (
  (
    target_task_id is not null
    and exists (
      select 1
      from public.tasks task_record
      join public.courses course_record on course_record.id = task_record.course_id
      where task_record.id = target_task_id
        and app_private.has_permission(
          'content.manage', course_record.organization_id
        )
    )
  )
  or (
    learning_path_id is not null
    and exists (
      select 1 from public.learning_paths path_record
      where path_record.id = learning_path_id
        and app_private.has_permission(
          'content.manage', path_record.organization_id
        )
    )
  )
)
with check (
  (
    target_task_id is not null
    and exists (
      select 1
      from public.tasks task_record
      join public.courses course_record on course_record.id = task_record.course_id
      where task_record.id = target_task_id
        and app_private.has_permission(
          'content.manage', course_record.organization_id
        )
    )
  )
  or (
    learning_path_id is not null
    and exists (
      select 1 from public.learning_paths path_record
      where path_record.id = learning_path_id
        and app_private.has_permission(
          'content.manage', path_record.organization_id
        )
    )
  )
);

-- Extend the published graph owner resolver. The prerequisite branch returns
-- null for learning-path rules because those belong to a separately versioned
-- path graph, not a course publication.
create or replace function app_private.content_owner_version(
  p_table_name text,
  p_row jsonb
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    when 'task_localizations', 'task_assessments', 'task_hints',
         'task_skill_mappings' then
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
$$;

revoke all on function app_private.content_owner_version(text, jsonb)
  from public, anon, authenticated;

-- A graph mutation takes a shared lock on every affected content version.
-- Lifecycle commands take FOR UPDATE on that same row, so a concurrent edit
-- either commits before readiness/fingerprinting or waits and observes the
-- newly published immutable state.
create or replace function app_private.guard_immutable_content_graph()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_version_id uuid;
  new_version_id uuid;
  owning_state public.content_version_state;
  lifecycle_owner name;
begin
  if tg_op <> 'INSERT' then
    old_version_id := app_private.content_owner_version(
      tg_table_name, to_jsonb(old)
    );
  end if;
  if tg_op <> 'DELETE' then
    new_version_id := app_private.content_owner_version(
      tg_table_name, to_jsonb(new)
    );
  end if;

  perform 1
  from public.content_versions version_record
  where version_record.id in (old_version_id, new_version_id)
  order by version_record.id
  for share;

  select version_record.state into owning_state
  from public.content_versions version_record
  where version_record.id in (old_version_id, new_version_id)
    and version_record.state in ('published', 'archived')
  order by case version_record.state when 'archived' then 0 else 1 end
  limit 1;

  if owning_state is not null then
    select pg_catalog.pg_get_userbyid(procedure_record.proowner)
    into lifecycle_owner
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.submit_content_for_review(uuid,bigint,text,uuid)'::pg_catalog.regprocedure;
    if tg_op = 'INSERT'
       and owning_state = 'published'
       and (select auth.uid()) is null
       and current_user = lifecycle_owner then
      return new;
    end if;

    raise exception 'published content graph is immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_immutable_content_graph()
  from public, anon, authenticated;

create trigger task_skill_mappings_guard_published_graph
before insert or update or delete on public.task_skill_mappings
for each row execute function app_private.guard_immutable_content_graph();

create trigger prerequisites_guard_published_graph
before insert or update or delete on public.prerequisites
for each row execute function app_private.guard_immutable_content_graph();

-- Preserve the reviewed render builder as a private base, then enrich each
-- task with allow-listed competency and prerequisite facts. No solution table
-- participates in this projection.
alter function app_private.build_content_snapshot(uuid)
  rename to build_content_snapshot_without_competencies;

revoke all on function app_private.build_content_snapshot_without_competencies(uuid)
  from public, anon, authenticated;

create function app_private.build_content_snapshot(p_content_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with base_snapshot as (
    select app_private.build_content_snapshot_without_competencies(
      p_content_version_id
    ) as payload
  ), enriched_stages as (
    select
      stage_element.ordinality,
      stage_element.value || jsonb_build_object(
        'tasks',
        coalesce((
          select jsonb_agg(
            task_element.value || jsonb_build_object(
              'skill_mappings',
              coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', mapping_record.id,
                    'mapping_version', mapping_record.mapping_version,
                    'weight_basis_points', mapping_record.weight_basis_points,
                    'evidence_required', mapping_record.evidence_required,
                    'skill', jsonb_build_object(
                      'id', skill_record.id,
                      'code', skill_record.code,
                      'labels', skill_record.labels,
                      'descriptions', skill_record.descriptions,
                      'taxonomy_version', skill_record.taxonomy_version
                    )
                  )
                  order by
                    mapping_record.mapping_version,
                    skill_record.code,
                    skill_record.id,
                    mapping_record.id
                )
                from public.task_skill_mappings mapping_record
                join public.skills skill_record
                  on skill_record.id = mapping_record.skill_id
                where mapping_record.task_id =
                  (task_element.value ->> 'id')::uuid
              ), '[]'::jsonb),
              'prerequisites',
              coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', prerequisite_record.id,
                    'rule_version', prerequisite_record.rule_version,
                    'required_task_id', prerequisite_record.required_task_id,
                    'required_skill', case
                      when skill_record.id is null then null
                      else jsonb_build_object(
                        'id', skill_record.id,
                        'code', skill_record.code,
                        'labels', skill_record.labels,
                        'taxonomy_version', skill_record.taxonomy_version
                      )
                    end,
                    'minimum_mastery_basis_points',
                      prerequisite_record.minimum_mastery_basis_points
                  )
                  order by
                    prerequisite_record.rule_version,
                    coalesce(
                      prerequisite_record.required_task_id::text,
                      skill_record.code
                    ),
                    prerequisite_record.id
                )
                from public.prerequisites prerequisite_record
                left join public.skills skill_record
                  on skill_record.id = prerequisite_record.required_skill_id
                where prerequisite_record.target_task_id =
                  (task_element.value ->> 'id')::uuid
              ), '[]'::jsonb)
            )
            order by task_element.ordinality
          )
          from jsonb_array_elements(stage_element.value -> 'tasks')
            with ordinality as task_element(value, ordinality)
        ), '[]'::jsonb)
      ) as value
    from base_snapshot
    cross join lateral jsonb_array_elements(base_snapshot.payload -> 'stages')
      with ordinality as stage_element(value, ordinality)
  )
  select jsonb_set(
    base_snapshot.payload,
    '{stages}',
    coalesce((
      select jsonb_agg(enriched_stage.value order by enriched_stage.ordinality)
      from enriched_stages enriched_stage
    ), '[]'::jsonb)
  )
  from base_snapshot;
$$;

revoke all on function app_private.build_content_snapshot(uuid)
  from public, anon, authenticated;

create or replace function app_private.assert_competency_graph_ready(
  p_content_version_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.tasks task_record
    where task_record.content_version_id = p_content_version_id
      and (
        not exists (
          select 1 from public.task_skill_mappings mapping_record
          where mapping_record.task_id = task_record.id
        )
        or (
          select count(distinct mapping_record.mapping_version) <> 1
            or sum(mapping_record.weight_basis_points) <> 10000
          from public.task_skill_mappings mapping_record
          where mapping_record.task_id = task_record.id
        )
      )
  ) then
    raise exception 'every task requires one complete 10000-point skill mapping set'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.tasks task_record
    join public.courses course_record on course_record.id = task_record.course_id
    join public.task_skill_mappings mapping_record
      on mapping_record.task_id = task_record.id
    join public.skills skill_record on skill_record.id = mapping_record.skill_id
    where task_record.content_version_id = p_content_version_id
      and (
        skill_record.state <> 'active'
        or not (
          skill_record.organization_id is null
          or skill_record.organization_id is not distinct from
            course_record.organization_id
        )
      )
  ) then
    raise exception 'published task skills must be active and course-compatible'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.prerequisites prerequisite_record
    join public.tasks target_task
      on target_task.id = prerequisite_record.target_task_id
    join public.courses course_record on course_record.id = target_task.course_id
    left join public.tasks required_task
      on required_task.id = prerequisite_record.required_task_id
    left join public.skills required_skill
      on required_skill.id = prerequisite_record.required_skill_id
    where target_task.content_version_id = p_content_version_id
      and (
        prerequisite_record.organization_id is distinct from
          course_record.organization_id
        or (
          required_task.id is not null
          and required_task.content_version_id is distinct from
            p_content_version_id
        )
        or (
          required_skill.id is not null
          and (
            required_skill.state <> 'active'
            or prerequisite_record.minimum_mastery_basis_points is null
            or (
              required_skill.organization_id is not null
              and required_skill.organization_id is distinct from
                course_record.organization_id
            )
          )
        )
      )
  ) then
    raise exception 'task prerequisites must be active and version-compatible'
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function app_private.assert_competency_graph_ready(uuid)
  from public, anon, authenticated;

alter function app_private.assert_content_version_ready(uuid)
  rename to assert_content_version_render_ready;

revoke all on function app_private.assert_content_version_render_ready(uuid)
  from public, anon, authenticated;

create function app_private.assert_content_version_ready(
  p_content_version_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_content_version_render_ready(
    p_content_version_id
  );
  perform app_private.assert_competency_graph_ready(
    p_content_version_id
  );
end;
$$;

revoke all on function app_private.assert_content_version_ready(uuid)
  from public, anon, authenticated;

create or replace function app_private.content_fingerprint(
  p_content_version_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      app_private.build_content_snapshot(p_content_version_id)::text,
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function app_private.content_fingerprint(uuid)
  from public, anon, authenticated;

-- Candidate projections must never render a blank choice even when a legacy
-- authentication hook created an incomplete profile.
alter function public.list_active_cohort_trainers(uuid)
  set schema app_private;
alter function app_private.list_active_cohort_trainers(uuid)
  rename to list_active_cohort_trainers_unfiltered;
revoke all on function app_private.list_active_cohort_trainers_unfiltered(uuid)
  from public, anon, authenticated, service_role;

create function public.list_active_cohort_trainers(p_cohort_id uuid)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select candidate.user_id, candidate.display_name
  from app_private.list_active_cohort_trainers_unfiltered(p_cohort_id) candidate
  where nullif(btrim(candidate.display_name), '') is not null
  order by lower(candidate.display_name), candidate.user_id;
$$;

revoke all on function public.list_active_cohort_trainers(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_active_cohort_trainers(uuid)
  to authenticated, service_role;

alter function public.list_active_question_trainers(uuid)
  set schema app_private;
alter function app_private.list_active_question_trainers(uuid)
  rename to list_active_question_trainers_unfiltered;
revoke all on function app_private.list_active_question_trainers_unfiltered(uuid)
  from public, anon, authenticated, service_role;

create function public.list_active_question_trainers(p_cohort_id uuid)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select candidate.user_id, candidate.display_name
  from app_private.list_active_question_trainers_unfiltered(p_cohort_id) candidate
  where nullif(btrim(candidate.display_name), '') is not null
  order by lower(candidate.display_name), candidate.user_id;
$$;

revoke all on function public.list_active_question_trainers(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_active_question_trainers(uuid)
  to authenticated, service_role;

comment on function app_private.build_content_snapshot(uuid) is
  'Canonical safe publication snapshot including immutable competency mappings and task prerequisites, excluding assessment solutions.';
