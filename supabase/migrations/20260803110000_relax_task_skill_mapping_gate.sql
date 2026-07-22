-- Skill mappings are no longer authored on tasks (the studio's skill-mapping
-- editor was removed), so a task without one must not block a course from
-- publishing. Previously readiness refused to publish any version whose tasks
-- lacked a complete 10000-point skill mapping set — the red "Every task has a
-- skill mapping of exactly 100%" gate an admin hit the moment they tried to
-- activate a course.
--
-- That requirement lives in `assert_competency_graph_ready_without_definition_scope`
-- (the mapping/prerequisite half of readiness; the top-level
-- `assert_competency_graph_ready` layers the definition-scope, category and
-- rubric checks on top and is deliberately left untouched here).
--
-- This drops ONLY the "every task requires a mapping" requirement. The remaining
-- two checks are kept verbatim from the prior definition: they only fire when a
-- task DOES carry skill mappings or prerequisites, so a task with none passes
-- them trivially, while any legacy content that still has mappings stays held to
-- the same scope/activeness rules as before.

create or replace function
  app_private.assert_competency_graph_ready_without_definition_scope(
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

alter function
  app_private.assert_competency_graph_ready_without_definition_scope(uuid)
  owner to postgres;
revoke all on function
  app_private.assert_competency_graph_ready_without_definition_scope(uuid)
  from public, anon, authenticated, service_role;
