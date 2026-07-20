-- ADR-016, WF-02, WF-03, WF-04 and WF-07: make definition ownership
-- unambiguous, keep mastery tenant-qualified, and evaluate the exact immutable
-- cohort publication for learner, question and reviewer decisions.

-- Global rubrics and assignments are represented by a null organization, just
-- like courses, skills, and bug categories. Repair only rows whose ownership is
-- derivable from the one versioned task they already reference.
alter table public.rubrics
  alter column organization_id drop not null;

alter table public.task_rubric_assignments
  alter column organization_id drop not null;

alter table public.rubrics
  drop constraint if exists rubrics_org_code_version_unique;

alter table public.task_rubric_assignments
  drop constraint if exists task_rubric_assignments_scope_unique;

-- Existing published rows are immutable to API actors. The migration owner may
-- temporarily suspend only these two row triggers to normalize an already
-- reviewed, unambiguous legacy assignment.
alter table public.task_rubric_assignments
  disable trigger task_rubric_assignments_validate;
alter table public.task_rubric_assignments
  disable trigger task_rubric_assignments_guard_published_graph;

do $migration$
begin
  if exists (
    select 1
    from public.task_rubric_assignments assignment_record
    join public.tasks task_record on task_record.id = assignment_record.task_id
    where task_record.content_version_id is distinct from
      assignment_record.content_version_id
  ) then
    raise exception 'legacy rubric assignment has a mismatched task version'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.task_rubric_assignments assignment_record
    group by assignment_record.task_id, assignment_record.content_version_id
    having count(distinct assignment_record.rubric_id) > 1
  ) then
    raise exception 'ambiguous legacy task rubric overlays require a business decision'
      using errcode = '23514';
  end if;

  -- A rubric used by a global publication can be repaired to global only when
  -- every criterion dependency is already global. A tenant-owned rubric shared
  -- by unrelated tenant courses is intentionally not reinterpreted.
  if exists (
    select 1
    from public.rubrics rubric_record
    where rubric_record.organization_id is not null
      and exists (
        select 1
        from public.task_rubric_assignments assignment_record
        join public.tasks task_record on task_record.id = assignment_record.task_id
        join public.courses course_record on course_record.id = task_record.course_id
        where assignment_record.rubric_id = rubric_record.id
          and course_record.organization_id is null
      )
      and exists (
        select 1
        from public.rubric_criteria criterion_record
        join public.skills skill_record on skill_record.id = criterion_record.skill_id
        where criterion_record.rubric_id = rubric_record.id
          and skill_record.organization_id is not null
      )
  ) then
    raise exception 'a global publication references a rubric with tenant skill dependencies'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.rubrics rubric_record
    where rubric_record.organization_id is not null
      and not exists (
        select 1
        from public.task_rubric_assignments assignment_record
        join public.tasks task_record on task_record.id = assignment_record.task_id
        join public.courses course_record on course_record.id = task_record.course_id
        where assignment_record.rubric_id = rubric_record.id
          and course_record.organization_id is null
      )
      and (
        select count(distinct course_record.organization_id)
        from public.task_rubric_assignments assignment_record
        join public.tasks task_record on task_record.id = assignment_record.task_id
        join public.courses course_record on course_record.id = task_record.course_id
        where assignment_record.rubric_id = rubric_record.id
          and course_record.organization_id is not null
      ) > 1
  ) then
    raise exception 'a tenant rubric is shared by multiple tenant owners'
      using errcode = '23514';
  end if;

  update public.rubrics rubric_record
  set organization_id = null
  where rubric_record.organization_id is not null
    and exists (
      select 1
      from public.task_rubric_assignments assignment_record
      join public.tasks task_record on task_record.id = assignment_record.task_id
      join public.courses course_record on course_record.id = task_record.course_id
      where assignment_record.rubric_id = rubric_record.id
        and course_record.organization_id is null
    );

  if exists (
    select 1
    from public.task_rubric_assignments assignment_record
    join public.tasks task_record on task_record.id = assignment_record.task_id
    join public.courses course_record on course_record.id = task_record.course_id
    join public.rubrics rubric_record on rubric_record.id = assignment_record.rubric_id
    where course_record.organization_id is not null
      and rubric_record.organization_id is not null
      and rubric_record.organization_id <> course_record.organization_id
  ) then
    raise exception 'a tenant publication references another tenant rubric'
      using errcode = '23514';
  end if;

  -- Multiple exact copies with the same rubric have only one meaningful
  -- canonical row. Prefer the identifier embedded in an immutable snapshot,
  -- then the oldest deterministic identifier.
  with ranked_assignments as (
    select
      assignment_record.id,
      row_number() over (
        partition by assignment_record.task_id,
          assignment_record.content_version_id
        order by
          exists (
            select 1
            from public.content_versions version_record
            cross join lateral jsonb_array_elements(
              version_record.snapshot -> 'stages'
            ) stage_payload
            cross join lateral jsonb_array_elements(
              stage_payload.value -> 'tasks'
            ) task_payload
            where version_record.id = assignment_record.content_version_id
              and task_payload.value ->> 'id' = assignment_record.task_id::text
              and task_payload.value #>> '{rubric,assignment_id}' =
                assignment_record.id::text
          ) desc,
          assignment_record.created_at,
          assignment_record.id
      ) as ordinal
    from public.task_rubric_assignments assignment_record
  )
  delete from public.task_rubric_assignments assignment_record
  using ranked_assignments ranked_record
  where assignment_record.id = ranked_record.id
    and ranked_record.ordinal > 1;

  update public.task_rubric_assignments assignment_record
  set organization_id = course_record.organization_id
  from public.tasks task_record
  join public.courses course_record on course_record.id = task_record.course_id
  where task_record.id = assignment_record.task_id
    and assignment_record.organization_id is distinct from
      course_record.organization_id;

  -- A tenant category used exclusively by global tasks has one deterministic
  -- owner correction. Mixed global/tenant or wrong-tenant reuse is ambiguous.
  if exists (
    select 1
    from public.bug_categories category_record
    where category_record.organization_id is not null
      and exists (
        select 1
        from public.tasks task_record
        join public.courses course_record on course_record.id = task_record.course_id
        where task_record.bug_category_id = category_record.id
          and course_record.organization_id is null
      )
      and exists (
        select 1
        from public.tasks task_record
        join public.courses course_record on course_record.id = task_record.course_id
        where task_record.bug_category_id = category_record.id
          and course_record.organization_id is not null
      )
  ) then
    raise exception 'a tenant category is shared by global and tenant tasks'
      using errcode = '23514';
  end if;

  update public.bug_categories category_record
  set organization_id = null
  where category_record.organization_id is not null
    and exists (
      select 1
      from public.tasks task_record
      join public.courses course_record on course_record.id = task_record.course_id
      where task_record.bug_category_id = category_record.id
        and course_record.organization_id is null
    );

  if exists (
    select 1
    from public.tasks task_record
    join public.courses course_record on course_record.id = task_record.course_id
    join public.bug_categories category_record
      on category_record.id = task_record.bug_category_id
    where category_record.organization_id is not null
      and category_record.organization_id is distinct from
        course_record.organization_id
  ) then
    raise exception 'a task references another tenant category'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.rubric_criteria criterion_record
    join public.rubrics rubric_record on rubric_record.id = criterion_record.rubric_id
    join public.skills skill_record on skill_record.id = criterion_record.skill_id
    where skill_record.organization_id is not null
      and skill_record.organization_id is distinct from
        rubric_record.organization_id
  ) then
    raise exception 'a rubric criterion references an incompatible tenant skill'
      using errcode = '23514';
  end if;
end
$migration$;

create unique index rubrics_global_code_version_uidx
  on public.rubrics (code, version)
  where organization_id is null;

create unique index rubrics_tenant_code_version_uidx
  on public.rubrics (organization_id, code, version)
  where organization_id is not null;

alter table public.task_rubric_assignments
  add constraint task_rubric_assignments_task_version_unique
    unique (task_id, content_version_id);

create or replace function app_private.validate_task_rubric_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  derived_version_id uuid;
  course_organization_id uuid;
  rubric_organization_id uuid;
begin
  select
    task_record.content_version_id,
    course_record.organization_id,
    rubric_record.organization_id
  into
    derived_version_id,
    course_organization_id,
    rubric_organization_id
  from public.tasks task_record
  join public.courses course_record on course_record.id = task_record.course_id
  cross join public.rubrics rubric_record
  where task_record.id = new.task_id
    and rubric_record.id = new.rubric_id;

  if not found or derived_version_id is distinct from new.content_version_id then
    raise exception 'rubric assignment task and content version do not match'
      using errcode = '23514';
  end if;

  if new.organization_id is distinct from course_organization_id then
    if (select auth.uid()) is null then
      new.organization_id := course_organization_id;
    else
      raise exception 'rubric assignment owner must match its course owner'
        using errcode = '23514';
    end if;
  end if;

  if (course_organization_id is null and rubric_organization_id is not null)
     or (
       course_organization_id is not null
       and rubric_organization_id is not null
       and rubric_organization_id <> course_organization_id
     ) then
    raise exception 'rubric ownership is incompatible with its course'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function app_private.validate_rubric_criterion_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rubric_organization_id uuid;
  skill_organization_id uuid;
begin
  if new.skill_id is null then return new; end if;

  select rubric_record.organization_id, skill_record.organization_id
  into rubric_organization_id, skill_organization_id
  from public.rubrics rubric_record
  cross join public.skills skill_record
  where rubric_record.id = new.rubric_id
    and skill_record.id = new.skill_id;

  if not found
     or (rubric_organization_id is null and skill_organization_id is not null)
     or (
       rubric_organization_id is not null
       and skill_organization_id is not null
       and rubric_organization_id <> skill_organization_id
     ) then
    raise exception 'rubric criterion skill ownership is incompatible'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger rubric_criteria_validate_definition_scope
before insert or update of rubric_id, skill_id on public.rubric_criteria
for each row execute function app_private.validate_rubric_criterion_scope();

create or replace function app_private.validate_task_category_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  course_organization_id uuid;
  category_organization_id uuid;
begin
  if new.bug_category_id is null then return new; end if;

  select course_record.organization_id, category_record.organization_id
  into course_organization_id, category_organization_id
  from public.courses course_record
  cross join public.bug_categories category_record
  where course_record.id = new.course_id
    and category_record.id = new.bug_category_id;

  if not found
     or (course_organization_id is null and category_organization_id is not null)
     or (
       course_organization_id is not null
       and category_organization_id is not null
       and course_organization_id <> category_organization_id
     ) then
    raise exception 'bug category ownership is incompatible with its course'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tasks_validate_category_scope
before insert or update of course_id, bug_category_id on public.tasks
for each row execute function app_private.validate_task_category_scope();

create or replace function app_private.reject_definition_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.organization_id is distinct from new.organization_id then
    raise exception 'definition ownership is immutable; create a scoped clone'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger courses_owner_immutable
before update of organization_id on public.courses
for each row execute function app_private.reject_definition_owner_change();
create trigger skills_owner_immutable
before update of organization_id on public.skills
for each row execute function app_private.reject_definition_owner_change();
create trigger rubrics_owner_immutable
before update of organization_id on public.rubrics
for each row execute function app_private.reject_definition_owner_change();
create trigger bug_categories_owner_immutable
before update of organization_id on public.bug_categories
for each row execute function app_private.reject_definition_owner_change();

revoke all on function app_private.validate_task_rubric_assignment()
  from public, anon, authenticated, service_role;
revoke all on function app_private.validate_rubric_criterion_scope()
  from public, anon, authenticated, service_role;
revoke all on function app_private.validate_task_category_scope()
  from public, anon, authenticated, service_role;
revoke all on function app_private.reject_definition_owner_change()
  from public, anon, authenticated, service_role;

alter table public.task_rubric_assignments
  enable trigger task_rubric_assignments_validate;
alter table public.task_rubric_assignments
  enable trigger task_rubric_assignments_guard_published_graph;

-- Retain the complete mapping/prerequisite readiness checks and add the
-- definition families covered by ADR-016.
alter function app_private.assert_competency_graph_ready(uuid)
  rename to assert_competency_graph_ready_without_definition_scope;

revoke all on function
  app_private.assert_competency_graph_ready_without_definition_scope(uuid)
  from public, anon, authenticated, service_role;

create function app_private.assert_competency_graph_ready(
  p_content_version_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_competency_graph_ready_without_definition_scope(
    p_content_version_id
  );

  if exists (
    select 1
    from public.tasks task_record
    join public.courses course_record on course_record.id = task_record.course_id
    join public.bug_categories category_record
      on category_record.id = task_record.bug_category_id
    where task_record.content_version_id = p_content_version_id
      and (
        category_record.state <> 'active'
        or (course_record.organization_id is null
          and category_record.organization_id is not null)
        or (
          course_record.organization_id is not null
          and category_record.organization_id is not null
          and course_record.organization_id <> category_record.organization_id
        )
      )
  ) then
    raise exception 'published task categories must be active and course-compatible'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.task_rubric_assignments assignment_record
    join public.tasks task_record on task_record.id = assignment_record.task_id
    join public.courses course_record on course_record.id = task_record.course_id
    join public.rubrics rubric_record on rubric_record.id = assignment_record.rubric_id
    where assignment_record.content_version_id = p_content_version_id
      and (
        task_record.content_version_id is distinct from p_content_version_id
        or assignment_record.organization_id is distinct from
          course_record.organization_id
        or rubric_record.state <> 'active'
        or (course_record.organization_id is null
          and rubric_record.organization_id is not null)
        or (
          course_record.organization_id is not null
          and rubric_record.organization_id is not null
          and course_record.organization_id <> rubric_record.organization_id
        )
        or exists (
          select 1
          from public.rubric_criteria criterion_record
          join public.skills skill_record on skill_record.id = criterion_record.skill_id
          where criterion_record.rubric_id = rubric_record.id
            and (
              skill_record.state <> 'active'
              or (rubric_record.organization_id is null
                and skill_record.organization_id is not null)
              or (
                rubric_record.organization_id is not null
                and skill_record.organization_id is not null
                and rubric_record.organization_id <>
                  skill_record.organization_id
              )
            )
        )
      )
  ) then
    raise exception 'published task rubrics must be active and course-compatible'
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function app_private.assert_competency_graph_ready(uuid)
  from public, anon, authenticated, service_role;

-- A global skill definition may be demonstrated independently in several
-- delivery tenants. The tenant is therefore part of every mastery identity.
alter table public.mastery_snapshots
  drop constraint mastery_snapshots_pkey;

alter table public.mastery_events
  drop constraint mastery_events_source_unique;

alter table public.mastery_snapshots
  drop constraint mastery_snapshots_source_event_id_fkey;

alter table public.mastery_events
  add constraint mastery_events_tenant_source_unique
    unique (organization_id, learner_id, skill_id, source_event_id),
  add constraint mastery_events_source_scope_unique
    unique (id, organization_id, learner_id, skill_id);

alter table public.mastery_snapshots
  add constraint mastery_snapshots_pkey
    primary key (organization_id, learner_id, skill_id),
  add constraint mastery_snapshots_source_scope_fk
    foreign key (source_event_id, organization_id, learner_id, skill_id)
    references public.mastery_events (
      id, organization_id, learner_id, skill_id
    )
    on delete restrict;

create index mastery_snapshots_source_scope_idx
  on public.mastery_snapshots (
    source_event_id, organization_id, learner_id, skill_id
  );

create or replace function app_private.validate_mastery_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  skill_organization_id uuid;
  event_evidence_id uuid;
begin
  select skill_record.organization_id into skill_organization_id
  from public.skills skill_record
  where skill_record.id = new.skill_id;

  if not found
     or (
       skill_organization_id is not null
       and skill_organization_id <> new.organization_id
     ) then
    raise exception 'mastery skill ownership is incompatible with its delivery tenant'
      using errcode = '23514';
  end if;

  if tg_table_name = 'mastery_events' then
    event_evidence_id := nullif(to_jsonb(new) ->> 'evidence_id', '')::uuid;
  end if;

  if event_evidence_id is not null
     and not exists (
       select 1
       from public.evidence evidence_record
       where evidence_record.id = event_evidence_id
         and evidence_record.organization_id = new.organization_id
         and evidence_record.owner_id = new.learner_id
     ) then
    raise exception 'mastery evidence must belong to the same learner and tenant'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger mastery_events_validate_scope
before insert or update of organization_id, learner_id, skill_id, evidence_id
on public.mastery_events
for each row execute function app_private.validate_mastery_scope();

create trigger mastery_snapshots_validate_scope
before insert or update of organization_id, learner_id, skill_id
on public.mastery_snapshots
for each row execute function app_private.validate_mastery_scope();

revoke all on function app_private.validate_mastery_scope()
  from public, anon, authenticated, service_role;

-- Questions keep an explicit immutable publication pin. A trusted fixture that
-- omits the new column is normalized by the trigger; browser mutations remain
-- behind create_question.
alter table public.tasks
  add constraint tasks_id_content_version_unique
    unique (id, content_version_id);

alter table public.questions
  add column content_version_id uuid;

update public.questions question_record
set content_version_id = cohort_record.content_version_id
from public.cohorts cohort_record
where cohort_record.id = question_record.cohort_id
  and question_record.content_version_id is null;

create or replace function app_private.pin_question_content_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pinned_version_id uuid;
  pinned_organization_id uuid;
begin
  select cohort_record.content_version_id, cohort_record.organization_id
  into pinned_version_id, pinned_organization_id
  from public.cohorts cohort_record
  where cohort_record.id = new.cohort_id;

  if pinned_version_id is null
     or pinned_organization_id is distinct from new.organization_id
     or not exists (
       select 1
       from public.tasks task_record
       where task_record.id = new.task_id
         and task_record.content_version_id = pinned_version_id
     ) then
    raise exception 'question task must belong to the exact cohort publication'
      using errcode = '23514';
  end if;

  if new.content_version_id is null then
    new.content_version_id := pinned_version_id;
  elsif new.content_version_id <> pinned_version_id then
    raise exception 'question publication pin cannot differ from its cohort'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger questions_pin_content_version
before insert or update of organization_id, cohort_id, task_id,
  content_version_id on public.questions
for each row execute function app_private.pin_question_content_version();

alter table public.questions
  alter column content_version_id set not null,
  add constraint questions_task_version_fk
    foreign key (task_id, content_version_id)
    references public.tasks (id, content_version_id)
    on delete restrict;

create index questions_content_version_idx
  on public.questions (content_version_id, task_id, created_at desc);

revoke all on function app_private.pin_question_content_version()
  from public, anon, authenticated, service_role;

-- Raw normalized authoring reads are not a learner delivery API. Keep content
-- managers on their existing FOR ALL policies and allow trainers/managers only
-- the exact immutable graph pinned by a cohort they can train.
drop policy if exists content_versions_member_read on public.content_versions;
drop policy if exists stages_member_read on public.stages;
drop policy if exists tasks_member_read on public.tasks;
drop policy if exists stage_localizations_member_read
  on public.stage_localizations;
drop policy if exists task_localizations_member_read
  on public.task_localizations;
drop policy if exists task_options_member_read on public.task_options;
drop policy if exists task_assessments_member_read on public.task_assessments;
drop policy if exists task_hints_member_read on public.task_hints;
drop policy if exists task_rubric_assignments_scoped_read
  on public.task_rubric_assignments;
drop policy if exists rubric_criteria_scoped_read on public.rubric_criteria;
drop policy if exists rubrics_member_read on public.rubrics;
drop policy if exists bug_categories_member_read on public.bug_categories;

create policy stages_pinned_trainer_read
on public.stages for select to authenticated
using (exists (
  select 1
  from public.cohorts cohort_record
  where cohort_record.course_id = course_id
    and cohort_record.content_version_id = content_version_id
    and (select app_private.can_train_cohort(cohort_record.id))
));

create policy tasks_pinned_trainer_read
on public.tasks for select to authenticated
using (exists (
  select 1
  from public.cohorts cohort_record
  where cohort_record.course_id = course_id
    and cohort_record.content_version_id = content_version_id
    and (select app_private.can_train_cohort(cohort_record.id))
));

create policy stage_localizations_pinned_trainer_read
on public.stage_localizations for select to authenticated
using (exists (
  select 1
  from public.stages stage_record
  join public.cohorts cohort_record
    on cohort_record.course_id = stage_record.course_id
   and cohort_record.content_version_id = stage_record.content_version_id
  where stage_record.id = stage_id
    and (select app_private.can_train_cohort(cohort_record.id))
));

create policy task_localizations_pinned_trainer_read
on public.task_localizations for select to authenticated
using (exists (
  select 1
  from public.tasks task_record
  join public.cohorts cohort_record
    on cohort_record.course_id = task_record.course_id
   and cohort_record.content_version_id = task_record.content_version_id
  where task_record.id = task_id
    and (select app_private.can_train_cohort(cohort_record.id))
));

create policy task_options_pinned_trainer_read
on public.task_options for select to authenticated
using (exists (
  select 1
  from public.tasks task_record
  join public.cohorts cohort_record
    on cohort_record.course_id = task_record.course_id
   and cohort_record.content_version_id = task_record.content_version_id
  where task_record.id = task_id
    and (select app_private.can_train_cohort(cohort_record.id))
));

create policy task_assessments_pinned_trainer_read
on public.task_assessments for select to authenticated
using (exists (
  select 1
  from public.tasks task_record
  join public.cohorts cohort_record
    on cohort_record.course_id = task_record.course_id
   and cohort_record.content_version_id = task_record.content_version_id
  where task_record.id = task_id
    and (select app_private.can_train_cohort(cohort_record.id))
));

create policy task_hints_pinned_trainer_read
on public.task_hints for select to authenticated
using (exists (
  select 1
  from public.tasks task_record
  join public.cohorts cohort_record
    on cohort_record.course_id = task_record.course_id
   and cohort_record.content_version_id = task_record.content_version_id
  where task_record.id = task_id
    and (select app_private.can_train_cohort(cohort_record.id))
));

create policy skills_active_definition_read
on public.skills for select to authenticated
using (
  state = 'active'
  and (
    organization_id is null
    or (select app_private.is_active_organization_member(organization_id))
  )
);

-- A FOR ALL media policy also supplied SELECT. Split it without changing the
-- owner/content-manager mutation predicates; command-level DML closure remains
-- reserved for the following 100100 wave.
drop policy if exists media_assets_scoped_read on public.media_assets;
drop policy if exists media_assets_scoped_write on public.media_assets;

create policy media_assets_content_manager_read
on public.media_assets for select to authenticated
using ((select app_private.has_permission('content.manage', organization_id)));

create policy media_assets_scoped_insert
on public.media_assets for insert to authenticated
with check (
  owner_id = (select auth.uid())
  or (select app_private.has_permission('content.manage', organization_id))
);

create policy media_assets_scoped_update
on public.media_assets for update to authenticated
using (
  owner_id = (select auth.uid())
  or (select app_private.has_permission('content.manage', organization_id))
)
with check (
  owner_id = (select auth.uid())
  or (select app_private.has_permission('content.manage', organization_id))
);

create policy media_assets_scoped_delete
on public.media_assets for delete to authenticated
using (
  owner_id = (select auth.uid())
  or (select app_private.has_permission('content.manage', organization_id))
);

drop policy if exists mastery_events_scoped_read on public.mastery_events;
drop policy if exists mastery_snapshots_scoped_read on public.mastery_snapshots;

create policy mastery_events_scoped_read
on public.mastery_events for select to authenticated
using (
  (
    learner_id = (select auth.uid())
    and (select app_private.is_active_organization_member(organization_id))
    and (select app_private.has_role('learner', organization_id, null))
  )
  or (select app_private.has_permission(
    'organization.manage', organization_id, null
  ))
);

create policy mastery_snapshots_scoped_read
on public.mastery_snapshots for select to authenticated
using (
  (
    learner_id = (select auth.uid())
    and (select app_private.is_active_organization_member(organization_id))
    and (select app_private.has_role('learner', organization_id, null))
  )
  or (select app_private.has_permission(
    'organization.manage', organization_id, null
  ))
);

create function app_private.snapshot_task_payload(
  p_snapshot jsonb,
  p_task_id uuid
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select task_payload.value
  from jsonb_array_elements(
    case
      when jsonb_typeof(p_snapshot -> 'stages') = 'array'
        then p_snapshot -> 'stages'
      else '[]'::jsonb
    end
  ) stage_payload
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(stage_payload.value -> 'tasks') = 'array'
        then stage_payload.value -> 'tasks'
      else '[]'::jsonb
    end
  ) task_payload
  where task_payload.value ->> 'id' = p_task_id::text
  limit 1;
$$;

create function app_private.learner_snapshot_task_lock_reasons(
  p_enrollment_id uuid,
  p_organization_id uuid,
  p_cohort_id uuid,
  p_progression_mode text,
  p_content_version_id uuid,
  p_snapshot jsonb,
  p_task_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  selected_task_id uuid;
  rule_payload jsonb;
  required_task_id uuid;
  required_skill_id uuid;
  minimum_mastery integer;
  current_mastery integer;
  reasons jsonb := '[]'::jsonb;
begin
  if actor_id is null
     or jsonb_typeof(p_task_payload) is distinct from 'object'
     or jsonb_typeof(p_task_payload -> 'id') is distinct from 'string'
     or (p_task_payload ->> 'id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    return jsonb_build_array(jsonb_build_object('code', 'configuration'));
  end if;
  selected_task_id := (p_task_payload ->> 'id')::uuid;

  if p_progression_mode = 'scheduled' then
    if not exists (
      select 1
      from public.task_schedules schedule_record
      where schedule_record.cohort_id = p_cohort_id
        and schedule_record.task_id = selected_task_id
        and (
          schedule_record.available_from is null
          or schedule_record.available_from <= statement_timestamp()
        )
        and (
          schedule_record.due_at is null
          or schedule_record.due_at >= statement_timestamp()
        )
    ) then
      reasons := reasons || jsonb_build_array(
        jsonb_build_object('code', 'schedule')
      );
    end if;
  elsif p_progression_mode = 'flexible' then
    if not app_private.current_actor_has_learning_entitlement(
      p_organization_id
    ) then
      reasons := reasons || jsonb_build_array(
        jsonb_build_object('code', 'entitlement')
      );
    end if;
  else
    reasons := reasons || jsonb_build_array(
      jsonb_build_object('code', 'configuration')
    );
  end if;

  if jsonb_typeof(p_task_payload -> 'prerequisites') is distinct from 'array' then
    -- Legacy snapshots without competency fields remain valid; a malformed
    -- explicit array is handled rule-by-rule below and fails closed.
    return reasons;
  end if;

  for rule_payload in
    select rule_record.value
    from jsonb_array_elements(p_task_payload -> 'prerequisites') rule_record
  loop
    if jsonb_typeof(rule_payload) is distinct from 'object' then
      reasons := reasons || jsonb_build_array(
        jsonb_build_object('code', 'configuration')
      );
      continue;
    end if;

    if jsonb_typeof(rule_payload -> 'required_task_id') = 'string'
       and (rule_payload ->> 'required_task_id') ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      required_task_id := (rule_payload ->> 'required_task_id')::uuid;
      if app_private.snapshot_task_payload(
        p_snapshot, required_task_id
      ) is null or not exists (
        select 1
        from public.attempts attempt_record
        join public.submissions submission_record
          on submission_record.attempt_id = attempt_record.id
         and submission_record.organization_id = p_organization_id
         and submission_record.cohort_id = p_cohort_id
         and submission_record.task_id = required_task_id
         and submission_record.state = 'accepted'
        join public.submission_versions submission_version
          on submission_version.submission_id = submission_record.id
         and submission_version.version_number =
           submission_record.latest_version_number
        where attempt_record.enrollment_id = p_enrollment_id
          and attempt_record.organization_id = p_organization_id
          and attempt_record.cohort_id = p_cohort_id
          and attempt_record.learner_id = actor_id
          and attempt_record.task_id = required_task_id
          and attempt_record.state = 'accepted'
          and submission_version.task_snapshot ->> 'content_version_id' =
            p_content_version_id::text
      ) then
        reasons := reasons || jsonb_build_array(
          jsonb_build_object('code', 'required_task')
        );
      end if;
      continue;
    end if;

    if jsonb_typeof(rule_payload -> 'required_skill') = 'object'
       and jsonb_typeof(rule_payload #> '{required_skill,id}') = 'string'
       and (rule_payload #>> '{required_skill,id}') ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       and jsonb_typeof(rule_payload -> 'minimum_mastery_basis_points') =
         'number'
       and (rule_payload ->> 'minimum_mastery_basis_points') ~
         '^(0|[1-9][0-9]{0,4})$' then
      required_skill_id := (rule_payload #>> '{required_skill,id}')::uuid;
      minimum_mastery :=
        (rule_payload ->> 'minimum_mastery_basis_points')::integer;
      if minimum_mastery > 10000 then
        reasons := reasons || jsonb_build_array(
          jsonb_build_object('code', 'configuration')
        );
        continue;
      end if;

      select snapshot_record.mastery_basis_points into current_mastery
      from public.mastery_snapshots snapshot_record
      where snapshot_record.organization_id = p_organization_id
        and snapshot_record.learner_id = actor_id
        and snapshot_record.skill_id = required_skill_id;
      current_mastery := coalesce(current_mastery, 0);
      if current_mastery < minimum_mastery then
        reasons := reasons || jsonb_build_array(jsonb_build_object(
          'code', 'required_skill',
          'current_basis_points', current_mastery,
          'minimum_basis_points', minimum_mastery
        ));
      end if;
      continue;
    end if;

    -- Unknown legacy annotation objects were never executable rules. Ignore
    -- them for backward compatibility; every canonical published rule emitted
    -- by build_content_snapshot has one of the two validated shapes above.
  end loop;

  return reasons;
end;
$$;

revoke all on function app_private.snapshot_task_payload(jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.learner_snapshot_task_lock_reasons(
  uuid, uuid, uuid, text, uuid, jsonb, jsonb
) from public, anon, authenticated, service_role;

-- Preserve each existing public signature by moving its reviewed implementation
-- behind a private compatibility base and installing a requirement-aware wrapper.
alter function public.list_my_learning_courses(text) set schema app_private;
alter function app_private.list_my_learning_courses(text)
  rename to list_my_learning_courses_without_requirements;
revoke all on function
  app_private.list_my_learning_courses_without_requirements(text)
  from public, anon, authenticated, service_role;

create function public.list_my_learning_courses(p_locale text default 'en')
returns table (
  enrollment_id uuid,
  enrollment_state public.enrollment_state,
  course_id uuid,
  cohort_id uuid,
  cohort_state public.cohort_state,
  content_version_id uuid,
  content_version_state public.content_version_state,
  version_number integer,
  title text,
  progression_mode text,
  completed_activities bigint,
  total_activities bigint,
  next_task_id uuid,
  next_task_title text,
  next_task_state text
)
language sql
stable
security definer
set search_path = ''
as $$
  with base_rows as (
    select
      base_record.*,
      row_number() over () as base_order
    from app_private.list_my_learning_courses_without_requirements(p_locale)
      base_record
  )
  select
    base_record.enrollment_id,
    base_record.enrollment_state,
    base_record.course_id,
    base_record.cohort_id,
    base_record.cohort_state,
    base_record.content_version_id,
    base_record.content_version_state,
    base_record.version_number,
    base_record.title,
    base_record.progression_mode,
    base_record.completed_activities,
    base_record.total_activities,
    case when base_record.enrollment_state = 'assigned'
      then next_record.task_id else null end,
    case when base_record.enrollment_state = 'assigned'
      then next_record.task_title else null end,
    case when base_record.enrollment_state = 'assigned'
      then next_record.task_state else null end
  from base_rows base_record
  left join lateral (
    select context_record.*
    from app_private.current_actor_pinned_course_context(
      base_record.course_id
    ) context_record
    where context_record.enrollment_id = base_record.enrollment_id
    limit 1
  ) context_record on base_record.enrollment_state = 'assigned'
  left join lateral (
    select
      (task_record.value ->> 'id')::uuid as task_id,
      app_private.resolve_snapshot_localization(
        task_record.value -> 'localizations',
        p_locale,
        context_record.default_locale
      ) ->> 'title' as task_title,
      state_record.task_state
    from jsonb_array_elements(context_record.snapshot -> 'stages')
      with ordinality stage_record(value, stage_order)
    cross join lateral jsonb_array_elements(stage_record.value -> 'tasks')
      with ordinality task_record(value, task_order)
    left join lateral (
      select attempt_record.state
      from public.attempts attempt_record
      where attempt_record.enrollment_id = context_record.enrollment_id
        and attempt_record.learner_id = (select auth.uid())
        and attempt_record.cohort_id = context_record.cohort_id
        and attempt_record.task_id = (task_record.value ->> 'id')::uuid
      order by attempt_record.sequence_number desc, attempt_record.id desc
      limit 1
    ) latest_attempt on true
    cross join lateral (
      select case
        when latest_attempt.state = 'revision_required'
          then 'revision_required'
        when latest_attempt.state = 'in_progress' then 'in_progress'
        when latest_attempt.state = 'submitted' then 'submitted'
        when latest_attempt.state = 'resubmitted' then 'resubmitted'
        when latest_attempt.state = 'accepted' then null
        when app_private.learner_snapshot_task_lock_reasons(
          context_record.enrollment_id,
          context_record.organization_id,
          context_record.cohort_id,
          context_record.progression_mode,
          context_record.content_version_id,
          context_record.snapshot,
          task_record.value
        ) = '[]'::jsonb then 'available'
        else null
      end as task_state
    ) state_record
    where state_record.task_state is not null
    order by
      case state_record.task_state
        when 'revision_required' then 0
        when 'in_progress' then 1
        when 'available' then 2
        when 'submitted' then 3
        when 'resubmitted' then 3
        else 4
      end,
      stage_record.stage_order,
      task_record.task_order
    limit 1
  ) next_record on context_record.enrollment_id is not null
  order by base_record.base_order;
$$;

alter function public.get_my_learning_course(uuid, text)
  set schema app_private;
alter function app_private.get_my_learning_course(uuid, text)
  rename to get_my_learning_course_without_requirements;
revoke all on function
  app_private.get_my_learning_course_without_requirements(uuid, text)
  from public, anon, authenticated, service_role;

create function public.get_my_learning_course(
  p_course_id uuid,
  p_locale text default 'en'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_payload jsonb;
  context_record record;
  stage_payload jsonb;
  activity_payload jsonb;
  task_payload jsonb;
  stages_payload jsonb := '[]'::jsonb;
  activities_payload jsonb;
  reasons jsonb;
  projected_state text;
begin
  base_payload := app_private.get_my_learning_course_without_requirements(
    p_course_id, p_locale
  );
  if base_payload is null then return null; end if;

  select pinned_context.* into context_record
  from app_private.current_actor_pinned_course_context(p_course_id)
    pinned_context
  where pinned_context.enrollment_id =
    (base_payload ->> 'enrollment_id')::uuid
  limit 1;
  if context_record.enrollment_id is null then return null; end if;

  for stage_payload in
    select stage_record.value
    from jsonb_array_elements(base_payload -> 'stages') stage_record
  loop
    activities_payload := '[]'::jsonb;
    for activity_payload in
      select activity_record.value
      from jsonb_array_elements(stage_payload -> 'activities') activity_record
    loop
      task_payload := app_private.snapshot_task_payload(
        context_record.snapshot,
        (activity_payload ->> 'id')::uuid
      );
      projected_state := activity_payload ->> 'state';

      if projected_state in (
        'accepted', 'in_progress', 'submitted', 'revision_required'
      ) then
        reasons := '[]'::jsonb;
      elsif context_record.enrollment_state = 'completed' then
        reasons := jsonb_build_array(jsonb_build_object('code', 'history'));
        projected_state := 'locked';
      else
        reasons := app_private.learner_snapshot_task_lock_reasons(
          context_record.enrollment_id,
          context_record.organization_id,
          context_record.cohort_id,
          context_record.progression_mode,
          context_record.content_version_id,
          context_record.snapshot,
          task_payload
        );
        projected_state := case
          when reasons = '[]'::jsonb then 'available'
          else 'locked'
        end;
      end if;

      activities_payload := activities_payload || jsonb_build_array(
        activity_payload
          || jsonb_build_object(
            'state', projected_state,
            'lock_reasons', reasons
          )
      );
    end loop;
    stages_payload := stages_payload || jsonb_build_array(
      jsonb_set(stage_payload, '{activities}', activities_payload, false)
    );
  end loop;

  return jsonb_set(base_payload, '{stages}', stages_payload, false);
end;
$$;

alter function public.get_my_learning_task(uuid) set schema app_private;
alter function app_private.get_my_learning_task(uuid)
  rename to get_my_learning_task_without_requirements;
revoke all on function
  app_private.get_my_learning_task_without_requirements(uuid)
  from public, anon, authenticated, service_role;

create function public.get_my_learning_task(p_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  context_record record;
  task_payload jsonb;
  latest_state public.attempt_state;
  reasons jsonb;
begin
  select pinned_context.* into context_record
  from app_private.current_actor_pinned_course_context(null::uuid)
    pinned_context
  where pinned_context.enrollment_state = 'assigned'
    and app_private.snapshot_task_payload(
      pinned_context.snapshot, p_task_id
    ) is not null
  order by pinned_context.enrollment_updated_at desc,
    pinned_context.enrollment_id
  limit 1;
  if context_record.enrollment_id is null then return null; end if;

  task_payload := app_private.snapshot_task_payload(
    context_record.snapshot, p_task_id
  );
  reasons := app_private.learner_snapshot_task_lock_reasons(
    context_record.enrollment_id,
    context_record.organization_id,
    context_record.cohort_id,
    context_record.progression_mode,
    context_record.content_version_id,
    context_record.snapshot,
    task_payload
  );

  select attempt_record.state into latest_state
  from public.attempts attempt_record
  where attempt_record.enrollment_id = context_record.enrollment_id
    and attempt_record.learner_id = (select auth.uid())
    and attempt_record.cohort_id = context_record.cohort_id
    and attempt_record.task_id = p_task_id
  order by attempt_record.sequence_number desc, attempt_record.id desc
  limit 1;

  if reasons <> '[]'::jsonb
     and (
       latest_state is null
       or latest_state not in (
         'in_progress', 'submitted', 'revision_required', 'resubmitted'
       )
     ) then
    return null;
  end if;

  return app_private.get_my_learning_task_without_requirements(p_task_id);
end;
$$;

alter function public.list_my_learning_courses(text) owner to postgres;
alter function public.get_my_learning_course(uuid, text) owner to postgres;
alter function public.get_my_learning_task(uuid) owner to postgres;

revoke all on function public.list_my_learning_courses(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_learning_course(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_learning_task(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.list_my_learning_courses(text)
  to authenticated, service_role;
grant execute on function public.get_my_learning_course(uuid, text)
  to authenticated, service_role;
grant execute on function public.get_my_learning_task(uuid)
  to authenticated, service_role;

create or replace function public.start_attempt(
  p_task_id uuid,
  p_idempotency_key text
)
returns public.attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  context_record record;
  task_payload jsonb;
  result public.attempts;
  next_sequence integer;
begin
  if actor_id is null or length(p_idempotency_key) not between 16 and 200 then
    raise exception 'authentication and valid idempotency key required'
      using errcode = '42501';
  end if;

  select attempt_record.* into result
  from public.attempts attempt_record
  where attempt_record.learner_id = actor_id
    and attempt_record.start_idempotency_key = p_idempotency_key;
  if result.id is not null then return result; end if;

  select attempt_record.* into result
  from public.attempts attempt_record
  where attempt_record.learner_id = actor_id
    and attempt_record.task_id = p_task_id
    and attempt_record.state in (
      'in_progress', 'submitted', 'revision_required', 'resubmitted'
    )
  order by attempt_record.created_at desc
  limit 1;
  if result.id is not null then return result; end if;

  select pinned_context.* into context_record
  from app_private.current_actor_pinned_course_context(null::uuid)
    pinned_context
  where pinned_context.enrollment_state = 'assigned'
    and app_private.snapshot_task_payload(
      pinned_context.snapshot, p_task_id
    ) is not null
  order by pinned_context.enrollment_updated_at desc,
    pinned_context.enrollment_id
  limit 1;

  if context_record.enrollment_id is null then
    raise exception 'no active enrollment and available pinned task'
      using errcode = '42501';
  end if;
  task_payload := app_private.snapshot_task_payload(
    context_record.snapshot, p_task_id
  );
  if app_private.learner_snapshot_task_lock_reasons(
    context_record.enrollment_id,
    context_record.organization_id,
    context_record.cohort_id,
    context_record.progression_mode,
    context_record.content_version_id,
    context_record.snapshot,
    task_payload
  ) <> '[]'::jsonb then
    raise exception 'no active enrollment and available pinned task'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'attempt-start:' || context_record.enrollment_id::text || ':'
        || p_task_id::text,
      0
    )
  );

  select coalesce(max(attempt_record.sequence_number), 0) + 1
  into next_sequence
  from public.attempts attempt_record
  where attempt_record.enrollment_id = context_record.enrollment_id
    and attempt_record.task_id = p_task_id;

  insert into public.attempts (
    organization_id, enrollment_id, learner_id, cohort_id, task_id,
    sequence_number, state, start_idempotency_key
  ) values (
    context_record.organization_id,
    context_record.enrollment_id,
    actor_id,
    context_record.cohort_id,
    p_task_id,
    next_sequence,
    'in_progress',
    p_idempotency_key
  ) returning * into result;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    result.organization_id, actor_id, 'learner', 'attempt.started', 'attempt',
    result.id, result.row_version, app_private.uuid7(),
    jsonb_build_object(
      'task_id', p_task_id,
      'content_version_id', context_record.content_version_id
    )
  );
  return result;
exception
  when unique_violation then
    select attempt_record.* into result
    from public.attempts attempt_record
    where attempt_record.learner_id = actor_id
      and (
        attempt_record.start_idempotency_key = p_idempotency_key
        or (
          attempt_record.task_id = p_task_id
          and attempt_record.state in (
            'in_progress', 'submitted', 'revision_required', 'resubmitted'
          )
        )
      )
    order by
      (attempt_record.start_idempotency_key = p_idempotency_key) desc,
      attempt_record.created_at desc
    limit 1;
    if result.id is null then raise; end if;
    return result;
end;
$$;

alter function public.start_attempt(uuid, text) owner to postgres;
revoke all on function public.start_attempt(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.start_attempt(uuid, text)
  to authenticated, service_role;

create function public.list_my_available_question_contexts(
  p_locale text default 'en'
)
returns table (
  cohort_id uuid,
  cohort_name text,
  task_id uuid,
  task_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible_contexts as (
    select distinct on (enrollment_record.id)
      enrollment_record.id as enrollment_id,
      enrollment_record.organization_id,
      cohort_record.id as cohort_id,
      cohort_record.name as cohort_name,
      cohort_record.progression_mode,
      cohort_record.content_version_id,
      course_record.default_locale,
      version_record.snapshot
    from public.enrollments enrollment_record
    join public.cohorts cohort_record
      on cohort_record.id = enrollment_record.cohort_id
     and cohort_record.organization_id = enrollment_record.organization_id
     and cohort_record.course_id = enrollment_record.course_id
     and cohort_record.state = 'active'
    join public.courses course_record
      on course_record.id = enrollment_record.course_id
     and course_record.state = 'active'
     and course_record.archived_at is null
     and (
       course_record.organization_id is null
       or course_record.organization_id = enrollment_record.organization_id
     )
    join public.content_versions version_record
      on version_record.id = cohort_record.content_version_id
     and version_record.course_id = course_record.id
     and version_record.state in ('published', 'archived')
    where enrollment_record.learner_id = (select auth.uid())
      and enrollment_record.state in ('assigned', 'completed')
      and app_private.current_actor_is_active_learner(
        enrollment_record.organization_id, cohort_record.id
      )
      and app_private.is_valid_learner_content_snapshot(
        version_record.snapshot,
        course_record.id,
        course_record.slug,
        version_record.id,
        version_record.version_number
      )
    order by enrollment_record.id, enrollment_record.updated_at desc
  )
  select
    context_record.cohort_id,
    context_record.cohort_name,
    (task_payload.value ->> 'id')::uuid,
    app_private.resolve_snapshot_localization(
      task_payload.value -> 'localizations',
      p_locale,
      context_record.default_locale
    ) ->> 'title'
  from eligible_contexts context_record
  cross join lateral jsonb_array_elements(context_record.snapshot -> 'stages')
    stage_payload
  cross join lateral jsonb_array_elements(stage_payload.value -> 'tasks')
    task_payload
  where app_private.learner_snapshot_task_lock_reasons(
    context_record.enrollment_id,
    context_record.organization_id,
    context_record.cohort_id,
    context_record.progression_mode,
    context_record.content_version_id,
    context_record.snapshot,
    task_payload.value
  ) = '[]'::jsonb
  order by lower(
    app_private.resolve_snapshot_localization(
      task_payload.value -> 'localizations',
      p_locale,
      context_record.default_locale
    ) ->> 'title'
  ), context_record.cohort_id, (task_payload.value ->> 'id')::uuid;
$$;

create function public.list_my_question_task_contexts(
  p_locale text default 'en'
)
returns table (
  question_id uuid,
  task_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    question_record.id,
    coalesce(
      app_private.resolve_snapshot_localization(
        task_payload.value -> 'localizations',
        p_locale,
        version_record.snapshot #>> '{course,default_locale}'
      ) ->> 'title',
      question_record.task_id::text
    )
  from public.questions question_record
  join public.cohorts cohort_record
    on cohort_record.id = question_record.cohort_id
   and cohort_record.organization_id = question_record.organization_id
   and cohort_record.content_version_id = question_record.content_version_id
  join public.content_versions version_record
    on version_record.id = question_record.content_version_id
   and version_record.state in ('published', 'archived')
  left join lateral (
    select app_private.snapshot_task_payload(
      version_record.snapshot, question_record.task_id
    ) as value
  ) task_payload on true
  where (select app_private.can_access_question(question_record.id))
  order by question_record.id;
$$;

alter function public.list_my_available_question_contexts(text)
  owner to postgres;
alter function public.list_my_question_task_contexts(text)
  owner to postgres;

revoke all on function public.list_my_available_question_contexts(text)
  from public, anon, authenticated, service_role;
revoke all on function public.list_my_question_task_contexts(text)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_available_question_contexts(text)
  to authenticated, service_role;
grant execute on function public.list_my_question_task_contexts(text)
  to authenticated, service_role;

create or replace function public.create_question(
  p_cohort_id uuid,
  p_task_id uuid,
  p_subject text,
  p_body text,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns public.questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  derived_organization_id uuid;
  pinned_version_id uuid;
  question_row public.questions;
  initial_message public.question_messages;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_cohort_id is null
     or p_task_id is null
     or nullif(btrim(p_subject), '') is null
     or nullif(btrim(p_body), '') is null
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid question subject, body, idempotency key and correlation ID are required'
      using errcode = '22023';
  end if;

  select cohort_record.organization_id, cohort_record.content_version_id
  into derived_organization_id, pinned_version_id
  from public.cohorts cohort_record
  where cohort_record.id = p_cohort_id
    and exists (
      select 1
      from public.list_my_available_question_contexts('en') context_record
      where context_record.cohort_id = p_cohort_id
        and context_record.task_id = p_task_id
    );

  if derived_organization_id is null or pinned_version_id is null then
    raise exception 'question creation scope denied' using errcode = '42501';
  end if;

  insert into public.questions (
    organization_id, learner_id, cohort_id, task_id, content_version_id,
    assigned_trainer_id, state, subject, idempotency_key
  ) values (
    derived_organization_id, actor_id, p_cohort_id, p_task_id,
    pinned_version_id, null, 'open', p_subject, p_idempotency_key
  )
  on conflict (learner_id, idempotency_key) do nothing
  returning * into question_row;

  if question_row.id is null then
    select existing_question.* into question_row
    from public.questions existing_question
    where existing_question.learner_id = actor_id
      and existing_question.idempotency_key = p_idempotency_key
    for update;

    select message_record.* into initial_message
    from public.question_messages message_record
    where message_record.question_id = question_row.id
      and message_record.author_id = actor_id
      and message_record.message_kind = 'message'
    order by message_record.created_at, message_record.id
    limit 1;

    if question_row.cohort_id <> p_cohort_id
       or question_row.task_id <> p_task_id
       or question_row.content_version_id <> pinned_version_id
       or question_row.subject <> p_subject
       or initial_message.id is null
       or initial_message.body <> p_body then
      raise exception 'idempotency key was reused with a different question payload'
        using errcode = '22023';
    end if;
    return question_row;
  end if;

  insert into public.question_messages (
    question_id, author_id, body, message_kind
  ) values (
    question_row.id, actor_id, p_body, 'message'
  ) returning * into initial_message;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    derived_organization_id, actor_id, 'learner', 'question.created',
    'question', question_row.id, question_row.row_version, p_correlation_id,
    jsonb_build_object(
      'cohort_id', p_cohort_id,
      'task_id', p_task_id,
      'content_version_id', pinned_version_id,
      'initial_message_id', initial_message.id,
      'progression_mode', (
        select cohort_record.progression_mode
        from public.cohorts cohort_record
        where cohort_record.id = p_cohort_id
      )
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    derived_organization_id, 'question', question_row.id,
    question_row.row_version, 'question.created.v1', 1, p_correlation_id,
    jsonb_build_object(
      'question_id', question_row.id,
      'learner_id', actor_id,
      'cohort_id', p_cohort_id,
      'task_id', p_task_id,
      'content_version_id', pinned_version_id,
      'state', question_row.state
    )
  );

  insert into public.notifications (
    organization_id, recipient_id, event_type, template_key, payload,
    deduplication_key
  )
  select distinct
    derived_organization_id,
    trainer_membership.user_id,
    'question.opened',
    'notifications.question_open_for_claim',
    jsonb_build_object(
      'question_id', question_row.id,
      'cohort_id', p_cohort_id,
      'task_id', p_task_id
    ),
    'question-open:' || question_row.id::text
  from public.cohort_memberships trainer_membership
  join public.organization_memberships trainer_organization_membership
    on trainer_organization_membership.organization_id = derived_organization_id
   and trainer_organization_membership.user_id = trainer_membership.user_id
   and trainer_organization_membership.state = 'active'
   and trainer_organization_membership.removed_at is null
   and (
     trainer_organization_membership.valid_until is null
     or trainer_organization_membership.valid_until > statement_timestamp()
   )
  join public.profiles trainer_profile
    on trainer_profile.user_id = trainer_membership.user_id
   and trainer_profile.state = 'active'
   and trainer_profile.deactivated_at is null
  join public.user_roles role_assignment
    on role_assignment.user_id = trainer_membership.user_id
   and role_assignment.revoked_at is null
   and role_assignment.valid_from <= statement_timestamp()
   and (
     role_assignment.valid_until is null
     or role_assignment.valid_until > statement_timestamp()
   )
   and (
     role_assignment.organization_id is null
     or role_assignment.organization_id = derived_organization_id
   )
   and (
     role_assignment.cohort_id is null
     or role_assignment.cohort_id = p_cohort_id
   )
  join public.role_permissions role_permission
    on role_permission.role_id = role_assignment.role_id
  join public.permissions permission_record
    on permission_record.id = role_permission.permission_id
   and permission_record.code = 'question.manage'
  where trainer_membership.cohort_id = p_cohort_id
    and trainer_membership.role = 'trainer'
    and trainer_membership.state = 'active'
    and trainer_membership.removed_at is null
  on conflict (recipient_id, deduplication_key) do nothing;

  return question_row;
end;
$$;

alter function public.create_question(uuid, uuid, text, text, text, uuid)
  owner to postgres;
revoke all on function public.create_question(
  uuid, uuid, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.create_question(
  uuid, uuid, text, text, text, uuid
) to authenticated, service_role;

create or replace function app_private.guard_published_rubric_definition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_rubric_id uuid;
  new_rubric_id uuid;
  lifecycle_owner name;
begin
  if tg_table_name = 'rubrics' then
    if tg_op <> 'INSERT' then old_rubric_id := old.id; end if;
    if tg_op <> 'DELETE' then new_rubric_id := new.id; end if;
  else
    if tg_op <> 'INSERT' then old_rubric_id := old.rubric_id; end if;
    if tg_op <> 'DELETE' then new_rubric_id := new.rubric_id; end if;
  end if;

  if exists (
    select 1
    from public.task_rubric_assignments assignment_record
    join public.content_versions version_record
      on version_record.id = assignment_record.content_version_id
     and version_record.state in ('published', 'archived')
    where assignment_record.rubric_id in (old_rubric_id, new_rubric_id)
  ) then
    select pg_catalog.pg_get_userbyid(procedure_record.proowner)
    into lifecycle_owner
    from pg_catalog.pg_proc procedure_record
    where procedure_record.oid =
      'public.submit_content_for_review(uuid,bigint,text,uuid)'::regprocedure;

    -- Frozen deterministic database fixtures historically add one extra
    -- criterion after seed publication. Preserve only that trusted INSERT
    -- bootstrap; API actors can never invoke it and all later changes fail.
    if tg_op = 'INSERT'
       and (select auth.uid()) is null
       and current_user = lifecycle_owner then
      return new;
    end if;

    raise exception 'published rubric definitions are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger rubrics_guard_published_definition
before update or delete on public.rubrics
for each row execute function app_private.guard_published_rubric_definition();

create trigger rubric_criteria_guard_published_definition
before insert or update or delete on public.rubric_criteria
for each row execute function app_private.guard_published_rubric_definition();

revoke all on function app_private.guard_published_rubric_definition()
  from public, anon, authenticated, service_role;

create function public.get_submission_review_context(
  p_submission_id uuid,
  p_locale text default 'en'
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with exact_submission as (
    select
      submission_record.id,
      submission_record.organization_id,
      submission_record.cohort_id,
      submission_record.task_id,
      submission_version.id as submission_version_id,
      version_record.id as content_version_id,
      version_record.snapshot,
      version_record.snapshot #>> '{course,default_locale}' as default_locale
    from public.submissions submission_record
    join public.cohorts cohort_record
      on cohort_record.id = submission_record.cohort_id
     and cohort_record.organization_id = submission_record.organization_id
    join public.submission_versions submission_version
      on submission_version.submission_id = submission_record.id
     and submission_version.version_number =
       submission_record.latest_version_number
    join public.content_versions version_record
      on version_record.id = cohort_record.content_version_id
     and version_record.id::text =
       submission_version.task_snapshot ->> 'content_version_id'
     and version_record.state in ('published', 'archived')
    where submission_record.id = p_submission_id
      and (
        (
          app_private.is_active_cohort_review_trainer(
            (select auth.uid()),
            submission_record.cohort_id,
            submission_record.organization_id
          )
          and app_private.has_permission(
            'review.manage',
            submission_record.organization_id,
            submission_record.cohort_id
          )
        )
        or app_private.has_permission(
          'cohort.manage',
          submission_record.organization_id,
          submission_record.cohort_id
        )
      )
  ), exact_task as (
    select
      exact_submission.*,
      app_private.snapshot_task_payload(
        exact_submission.snapshot, exact_submission.task_id
      ) as task_payload
    from exact_submission
  )
  select jsonb_build_object(
    'content_version_id', task_record.content_version_id,
    'submission_version_id', task_record.submission_version_id,
    'task_title', app_private.resolve_snapshot_localization(
      task_record.task_payload -> 'localizations',
      p_locale,
      task_record.default_locale
    ) ->> 'title',
    'options', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', (option_payload.value ->> 'id')::uuid,
          'labels', option_payload.value -> 'labels'
        )
        order by
          (option_payload.value ->> 'position')::integer,
          option_payload.value ->> 'id'
      )
      from jsonb_array_elements(task_record.task_payload -> 'options')
        option_payload
    ), '[]'::jsonb),
    'rubric', case
      when jsonb_typeof(task_record.task_payload -> 'rubric') = 'object'
      then jsonb_build_object(
        'id', (task_record.task_payload #>> '{rubric,rubric_id}')::uuid,
        'labels', task_record.task_payload #> '{rubric,labels}',
        'version', (task_record.task_payload #>> '{rubric,version}')::integer,
        'criteria', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', (criterion_payload.value ->> 'id')::uuid,
              'code', criterion_payload.value ->> 'code',
              'labels', criterion_payload.value -> 'labels',
              'position', (criterion_payload.value ->> 'position')::integer,
              'max_points', (criterion_payload.value ->> 'max_points')::numeric,
              'required_for_acceptance',
                (criterion_payload.value ->> 'required_for_acceptance')::boolean,
              'skill_id', case
                when criterion_payload.value -> 'skill_id' = 'null'::jsonb
                  then null
                else (criterion_payload.value ->> 'skill_id')::uuid
              end
            )
            order by
              (criterion_payload.value ->> 'position')::integer,
              criterion_payload.value ->> 'id'
          )
          from jsonb_array_elements(
            task_record.task_payload #> '{rubric,criteria}'
          ) criterion_payload
        ), '[]'::jsonb)
      )
      else null
    end
  )
  from exact_task task_record
  where task_record.task_payload is not null;
$$;

alter function public.get_submission_review_context(uuid, text)
  owner to postgres;
revoke all on function public.get_submission_review_context(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_submission_review_context(uuid, text)
  to authenticated, service_role;

-- Patch only the exact rubric lookup and mastery identity inside the reviewed
-- atomic effect function. Abort the migration if the frozen predecessor body
-- is not the expected contract instead of applying a partial rewrite.
do $migration$
declare
  function_body text;
  old_rubric_lookup text := $old$
  select assignment.rubric_id into assigned_rubric_id
  from public.task_rubric_assignments assignment
  join public.rubrics rubric_row
    on rubric_row.id = assignment.rubric_id
   and rubric_row.organization_id = submission_row.organization_id
   and rubric_row.state = 'active'
  where assignment.organization_id = submission_row.organization_id
    and assignment.task_id = submission_row.task_id
    and assignment.content_version_id = (target_version.task_snapshot ->> 'content_version_id')::uuid;
$old$;
  new_rubric_lookup text := $new$
  select (task_payload.value #>> '{rubric,rubric_id}')::uuid
  into assigned_rubric_id
  from public.cohorts cohort_record
  join public.content_versions version_record
    on version_record.id = cohort_record.content_version_id
   and version_record.id::text =
     target_version.task_snapshot ->> 'content_version_id'
   and version_record.state in ('published', 'archived')
  cross join lateral jsonb_array_elements(version_record.snapshot -> 'stages')
    stage_payload
  cross join lateral jsonb_array_elements(stage_payload.value -> 'tasks')
    task_payload
  where cohort_record.id = submission_row.cohort_id
    and cohort_record.organization_id = submission_row.organization_id
    and task_payload.value ->> 'id' = submission_row.task_id::text
    and jsonb_typeof(task_payload.value -> 'rubric') = 'object'
    and exists (
      select 1
      from public.rubrics rubric_record
      where rubric_record.id =
        (task_payload.value #>> '{rubric,rubric_id}')::uuid
        and rubric_record.state = 'active'
        and (
          rubric_record.organization_id is null
          or rubric_record.organization_id = submission_row.organization_id
        )
    );
$new$;
begin
  select procedure_record.prosrc into function_body
  from pg_catalog.pg_proc procedure_record
  where procedure_record.oid =
    'app_private.decide_submission_effects_unowned(uuid,uuid,bigint,public.review_decision,text,jsonb,text,uuid)'::regprocedure;

  if function_body is null
     or position(old_rubric_lookup in function_body) = 0
     or position(
       'where snapshot.learner_id = submission_row.learner_id'
       in function_body
     ) = 0
     or position('on conflict (learner_id, skill_id)' in function_body) = 0 then
    raise exception 'review effect predecessor does not match the frozen contract'
      using errcode = '55000';
  end if;

  function_body := replace(
    function_body, old_rubric_lookup, new_rubric_lookup
  );
  function_body := replace(
    function_body,
    'where snapshot.learner_id = submission_row.learner_id' || chr(10)
      || '        and snapshot.skill_id = mastery_row.skill_id;',
    'where snapshot.organization_id = submission_row.organization_id'
      || chr(10)
      || '        and snapshot.learner_id = submission_row.learner_id'
      || chr(10)
      || '        and snapshot.skill_id = mastery_row.skill_id;'
  );
  function_body := replace(
    function_body,
    'on conflict (learner_id, skill_id) do update' || chr(10)
      || '      set organization_id = excluded.organization_id,',
    'on conflict (organization_id, learner_id, skill_id) do update'
      || chr(10)
      || '      set mastery_basis_points = excluded.mastery_basis_points,'
  );
  -- The preceding replacement includes the first assignment twice unless the
  -- original following line is removed explicitly.
  function_body := replace(
    function_body,
    '      set mastery_basis_points = excluded.mastery_basis_points,'
      || chr(10)
      || '          mastery_basis_points = excluded.mastery_basis_points,',
    '      set mastery_basis_points = excluded.mastery_basis_points,'
  );

  execute format($function$
    create or replace function app_private.decide_submission_effects_unowned(
      p_submission_id uuid,
      p_submission_version_id uuid,
      p_expected_version bigint,
      p_decision public.review_decision,
      p_comment text,
      p_criterion_scores jsonb,
      p_idempotency_key text,
      p_correlation_id uuid
    )
    returns public.submissions
    language plpgsql
    security definer
    set search_path = ''
    as %L
  $function$, function_body);
end
$migration$;

alter function app_private.decide_submission_effects_unowned(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) owner to postgres;
revoke all on function app_private.decide_submission_effects_unowned(
  uuid, uuid, bigint, public.review_decision, text, jsonb, text, uuid
) from public, anon, authenticated, service_role;

comment on function public.get_submission_review_context(uuid, text) is
  'Exact immutable submission publication context for an active reviewer; excludes answer correctness, model answers, and storage metadata.';
comment on function public.list_my_available_question_contexts(text) is
  'Actor-derived question creation contexts over exact cohort pins, schedule/entitlement, and tenant-qualified requirements.';
comment on function public.list_my_question_task_contexts(text) is
  'Authorized historical question titles resolved from each immutable question publication pin.';
