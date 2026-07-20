-- Active-principal authorization and lifecycle-aware resource boundaries.
--
-- Browser identity is never sufficient on its own. Every effective role is
-- derived from a current assignment plus the actor's current profile, tenant,
-- and (where applicable) cohort membership. Scoped assignments fail closed
-- when more than one tenant remains valid; independently valid platform roles
-- remain usable for their explicit global responsibilities.

create or replace function app_private.current_actor_valid_role_assignments()
returns table (
  role_id uuid,
  role_code text,
  organization_id uuid,
  cohort_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct
    role_assignment.role_id,
    role_record.code,
    role_assignment.organization_id,
    role_assignment.cohort_id
  from public.user_roles role_assignment
  join public.roles role_record
    on role_record.id = role_assignment.role_id
  join public.profiles profile_record
    on profile_record.user_id = role_assignment.user_id
   and profile_record.state = 'active'
   and profile_record.deactivated_at is null
  where role_assignment.user_id = (select auth.uid())
    and role_assignment.revoked_at is null
    and role_assignment.valid_from <= statement_timestamp()
    and (
      role_assignment.valid_until is null
      or role_assignment.valid_until > statement_timestamp()
    )
    and (
      (
        role_assignment.organization_id is null
        and role_assignment.cohort_id is null
        and role_record.is_system
        and role_record.code in (
          'admin',
          'content_admin',
          'support',
          'integration_admin',
          'dpo'
        )
      )
      or (
        role_assignment.organization_id is not null
        and exists (
          select 1
          from public.organizations organization_record
          join public.organization_memberships organization_membership
            on organization_membership.organization_id = organization_record.id
           and organization_membership.user_id = role_assignment.user_id
           and organization_membership.state = 'active'
           and organization_membership.removed_at is null
           and (
             organization_membership.valid_until is null
             or organization_membership.valid_until > statement_timestamp()
           )
          where organization_record.id = role_assignment.organization_id
            and organization_record.state = 'active'
            and organization_record.archived_at is null
        )
        and (
          (
            role_assignment.cohort_id is not null
            and exists (
              select 1
              from public.cohorts cohort_record
              join public.cohort_memberships cohort_membership
                on cohort_membership.cohort_id = cohort_record.id
               and cohort_membership.user_id = role_assignment.user_id
               and cohort_membership.state = 'active'
               and cohort_membership.removed_at is null
              where cohort_record.id = role_assignment.cohort_id
                and cohort_record.organization_id = role_assignment.organization_id
                and cohort_record.state in ('waiting', 'active', 'completed')
                and (
                  role_record.code not in ('learner', 'trainer')
                  or cohort_membership.role::text = role_record.code
                )
            )
          )
          or (
            role_assignment.cohort_id is null
          )
        )
      )
    );
$$;

alter function app_private.current_actor_valid_role_assignments() owner to postgres;
revoke all on function app_private.current_actor_valid_role_assignments()
  from public, anon, authenticated, service_role;

create or replace function app_private.has_role(
  p_role_code text,
  p_organization_id uuid default null,
  p_cohort_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with valid_assignments as materialized (
    select assignment_record.*
    from app_private.current_actor_valid_role_assignments() assignment_record
  ),
  scoped_organizations as (
    select count(distinct assignment_record.organization_id) as organization_count
    from valid_assignments assignment_record
    where assignment_record.organization_id is not null
  )
  select
    (
      (p_organization_id is null and p_cohort_id is null)
      or (
        p_organization_id is not null
        and exists (
          select 1
          from public.organizations organization_record
          where organization_record.id = p_organization_id
        )
        and (
          p_cohort_id is null
          or exists (
            select 1
            from public.cohorts cohort_record
            where cohort_record.id = p_cohort_id
              and cohort_record.organization_id = p_organization_id
          )
        )
      )
    )
    and (
      exists (
        select 1
        from valid_assignments assignment_record
        where assignment_record.role_code = p_role_code
          and assignment_record.organization_id is null
          and assignment_record.cohort_id is null
      )
      or (
        p_organization_id is not null
        and (
          select scope_record.organization_count
          from scoped_organizations scope_record
        ) = 1
        and exists (
          select 1
          from valid_assignments assignment_record
          where assignment_record.role_code = p_role_code
            and assignment_record.organization_id = p_organization_id
            and (
              assignment_record.cohort_id is null
              or assignment_record.cohort_id = p_cohort_id
            )
            and (
              assignment_record.role_code not in ('learner', 'trainer')
              or p_cohort_id is null
              or exists (
                select 1
                from public.cohorts cohort_record
                join public.cohort_memberships cohort_membership
                  on cohort_membership.cohort_id = cohort_record.id
                 and cohort_membership.user_id = (select auth.uid())
                 and cohort_membership.role::text = assignment_record.role_code
                 and cohort_membership.state = 'active'
                 and cohort_membership.removed_at is null
                where cohort_record.id = p_cohort_id
                  and cohort_record.organization_id = p_organization_id
              )
            )
        )
      )
    );
$$;

create or replace function app_private.has_permission(
  p_permission_code text,
  p_organization_id uuid default null,
  p_cohort_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with valid_assignments as materialized (
    select assignment_record.*
    from app_private.current_actor_valid_role_assignments() assignment_record
  ),
  scoped_organizations as (
    select count(distinct assignment_record.organization_id) as organization_count
    from valid_assignments assignment_record
    where assignment_record.organization_id is not null
  )
  select
    (
      (p_organization_id is null and p_cohort_id is null)
      or (
        p_organization_id is not null
        and exists (
          select 1
          from public.organizations organization_record
          where organization_record.id = p_organization_id
        )
        and (
          p_cohort_id is null
          or exists (
            select 1
            from public.cohorts cohort_record
            where cohort_record.id = p_cohort_id
              and cohort_record.organization_id = p_organization_id
          )
        )
      )
    )
    and (
      exists (
        select 1
        from valid_assignments assignment_record
        join public.role_permissions role_permission
          on role_permission.role_id = assignment_record.role_id
        join public.permissions permission_record
          on permission_record.id = role_permission.permission_id
        where permission_record.code = p_permission_code
          and assignment_record.organization_id is null
          and assignment_record.cohort_id is null
      )
      or (
        p_organization_id is not null
        and (
          select scope_record.organization_count
          from scoped_organizations scope_record
        ) = 1
        and exists (
          select 1
          from valid_assignments assignment_record
          join public.role_permissions role_permission
            on role_permission.role_id = assignment_record.role_id
          join public.permissions permission_record
            on permission_record.id = role_permission.permission_id
          where permission_record.code = p_permission_code
            and assignment_record.organization_id = p_organization_id
            and (
              assignment_record.cohort_id is null
              or assignment_record.cohort_id = p_cohort_id
            )
            and (
              assignment_record.role_code not in ('learner', 'trainer')
              or p_cohort_id is null
              or exists (
                select 1
                from public.cohorts cohort_record
                join public.cohort_memberships cohort_membership
                  on cohort_membership.cohort_id = cohort_record.id
                 and cohort_membership.user_id = (select auth.uid())
                 and cohort_membership.role::text = assignment_record.role_code
                 and cohort_membership.state = 'active'
                 and cohort_membership.removed_at is null
                where cohort_record.id = p_cohort_id
                  and cohort_record.organization_id = p_organization_id
              )
            )
        )
      )
    );
$$;

create or replace function app_private.is_active_organization_member(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile_record
    where profile_record.user_id = (select auth.uid())
      and profile_record.state = 'active'
      and profile_record.deactivated_at is null
  )
  and exists (
    select 1
    from public.organizations organization_record
    where organization_record.id = p_organization_id
  )
  and (
    (select app_private.has_role('admin', null, null))
    or exists (
      select 1
      from public.organizations organization_record
      join public.organization_memberships organization_membership
        on organization_membership.organization_id = organization_record.id
       and organization_membership.user_id = (select auth.uid())
       and organization_membership.state = 'active'
       and organization_membership.removed_at is null
       and (
         organization_membership.valid_until is null
         or organization_membership.valid_until > statement_timestamp()
       )
      where organization_record.id = p_organization_id
        and organization_record.state = 'active'
        and organization_record.archived_at is null
    )
  );
$$;

create or replace function app_private.can_access_cohort(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cohorts cohort_record
    where cohort_record.id = p_cohort_id
      and (
        (select app_private.has_permission(
          'cohort.manage', cohort_record.organization_id, cohort_record.id
        ))
        or (
          cohort_record.state in ('waiting', 'active', 'completed')
          and exists (
            select 1
            from public.cohort_memberships cohort_membership
            where cohort_membership.cohort_id = cohort_record.id
              and cohort_membership.user_id = (select auth.uid())
              and cohort_membership.state = 'active'
              and cohort_membership.removed_at is null
              and (select app_private.has_role(
                cohort_membership.role::text,
                cohort_record.organization_id,
                cohort_record.id
              ))
              and (select app_private.has_permission(
                'cohort.read',
                cohort_record.organization_id,
                cohort_record.id
              ))
          )
        )
      )
  );
$$;

create or replace function app_private.can_train_cohort(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cohorts cohort_record
    where cohort_record.id = p_cohort_id
      and (
        (select app_private.has_permission(
          'cohort.manage', cohort_record.organization_id, cohort_record.id
        ))
        or (
          cohort_record.state in ('waiting', 'active', 'completed')
          and exists (
            select 1
            from public.cohort_memberships cohort_membership
            where cohort_membership.cohort_id = cohort_record.id
              and cohort_membership.user_id = (select auth.uid())
              and cohort_membership.role = 'trainer'
              and cohort_membership.state = 'active'
              and cohort_membership.removed_at is null
              and (select app_private.has_role(
                'trainer', cohort_record.organization_id, cohort_record.id
              ))
              and (select app_private.has_permission(
                'cohort.read',
                cohort_record.organization_id,
                cohort_record.id
              ))
          )
        )
      )
  );
$$;

alter function app_private.has_role(text, uuid, uuid) owner to postgres;
alter function app_private.has_permission(text, uuid, uuid) owner to postgres;
alter function app_private.is_active_organization_member(uuid) owner to postgres;
alter function app_private.can_access_cohort(uuid) owner to postgres;
alter function app_private.can_train_cohort(uuid) owner to postgres;

revoke all on function app_private.has_role(text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.has_permission(text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.is_active_organization_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.can_access_cohort(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.can_train_cohort(uuid)
  from public, anon, authenticated, service_role;

grant execute on function app_private.has_role(text, uuid, uuid)
  to authenticated, service_role;
grant execute on function app_private.has_permission(text, uuid, uuid)
  to authenticated, service_role;
grant execute on function app_private.is_active_organization_member(uuid)
  to authenticated, service_role;
grant execute on function app_private.can_access_cohort(uuid)
  to authenticated, service_role;
grant execute on function app_private.can_train_cohort(uuid)
  to authenticated, service_role;

-- Arbitrary-user destination checks remain private. They require a live
-- trainer membership and a genuinely tenant-scoped trainer or custom role,
-- never an unscoped browser role or a global platform assignment.
create or replace function app_private.is_active_cohort_review_trainer(
  p_user_id uuid,
  p_cohort_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_cohort_id is not null
    and p_organization_id is not null
    and exists (
      select 1
      from public.cohorts cohort_record
      join public.organizations organization_record
        on organization_record.id = cohort_record.organization_id
       and organization_record.state = 'active'
       and organization_record.archived_at is null
      join public.cohort_memberships cohort_membership
        on cohort_membership.cohort_id = cohort_record.id
       and cohort_membership.user_id = p_user_id
       and cohort_membership.role = 'trainer'
       and cohort_membership.state = 'active'
       and cohort_membership.removed_at is null
      join public.organization_memberships organization_membership
        on organization_membership.organization_id = cohort_record.organization_id
       and organization_membership.user_id = p_user_id
       and organization_membership.state = 'active'
       and organization_membership.removed_at is null
       and (
         organization_membership.valid_until is null
         or organization_membership.valid_until > statement_timestamp()
       )
      join public.profiles profile_record
        on profile_record.user_id = p_user_id
       and profile_record.state = 'active'
       and profile_record.deactivated_at is null
      where cohort_record.id = p_cohort_id
        and cohort_record.organization_id = p_organization_id
        and cohort_record.state in ('waiting', 'active', 'completed')
        and exists (
          select 1
          from public.user_roles role_assignment
          join public.roles role_record
            on role_record.id = role_assignment.role_id
          join public.role_permissions role_permission
            on role_permission.role_id = role_assignment.role_id
          join public.permissions permission_record
            on permission_record.id = role_permission.permission_id
          where role_assignment.user_id = p_user_id
            and permission_record.code = 'review.manage'
            and (
              role_record.code = 'trainer'
              or not role_record.is_system
            )
            and role_assignment.organization_id = p_organization_id
            and (
              role_assignment.cohort_id is null
              or role_assignment.cohort_id = p_cohort_id
            )
            and role_assignment.revoked_at is null
            and role_assignment.valid_from <= statement_timestamp()
            and (
              role_assignment.valid_until is null
              or role_assignment.valid_until > statement_timestamp()
            )
        )
    );
$$;

create or replace function app_private.is_active_cohort_question_trainer(
  p_user_id uuid,
  p_cohort_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and p_cohort_id is not null
    and p_organization_id is not null
    and exists (
      select 1
      from public.cohorts cohort_record
      join public.organizations organization_record
        on organization_record.id = cohort_record.organization_id
       and organization_record.state = 'active'
       and organization_record.archived_at is null
      join public.cohort_memberships cohort_membership
        on cohort_membership.cohort_id = cohort_record.id
       and cohort_membership.user_id = p_user_id
       and cohort_membership.role = 'trainer'
       and cohort_membership.state = 'active'
       and cohort_membership.removed_at is null
      join public.organization_memberships organization_membership
        on organization_membership.organization_id = cohort_record.organization_id
       and organization_membership.user_id = p_user_id
       and organization_membership.state = 'active'
       and organization_membership.removed_at is null
       and (
         organization_membership.valid_until is null
         or organization_membership.valid_until > statement_timestamp()
       )
      join public.profiles profile_record
        on profile_record.user_id = p_user_id
       and profile_record.state = 'active'
       and profile_record.deactivated_at is null
      where cohort_record.id = p_cohort_id
        and cohort_record.organization_id = p_organization_id
        and cohort_record.state in ('waiting', 'active', 'completed')
        and exists (
          select 1
          from public.user_roles role_assignment
          join public.roles role_record
            on role_record.id = role_assignment.role_id
          join public.role_permissions role_permission
            on role_permission.role_id = role_assignment.role_id
          join public.permissions permission_record
            on permission_record.id = role_permission.permission_id
          where role_assignment.user_id = p_user_id
            and permission_record.code = 'question.manage'
            and (
              role_record.code = 'trainer'
              or not role_record.is_system
            )
            and role_assignment.organization_id = p_organization_id
            and (
              role_assignment.cohort_id is null
              or role_assignment.cohort_id = p_cohort_id
            )
            and role_assignment.revoked_at is null
            and role_assignment.valid_from <= statement_timestamp()
            and (
              role_assignment.valid_until is null
              or role_assignment.valid_until > statement_timestamp()
            )
        )
    );
$$;

alter function app_private.is_active_cohort_review_trainer(uuid, uuid, uuid)
  owner to postgres;
alter function app_private.is_active_cohort_question_trainer(uuid, uuid, uuid)
  owner to postgres;

revoke all on function app_private.is_active_cohort_review_trainer(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.is_active_cohort_question_trainer(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function app_private.can_access_submission(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.submissions submission_record
    join public.cohorts cohort_record
      on cohort_record.id = submission_record.cohort_id
     and cohort_record.organization_id = submission_record.organization_id
    where submission_record.id = p_submission_id
      and (
        (
          submission_record.learner_id = (select auth.uid())
          and (select app_private.has_role(
            'learner',
            submission_record.organization_id,
            submission_record.cohort_id
          ))
          and (select app_private.can_access_cohort(submission_record.cohort_id))
        )
        or (
          (select app_private.is_active_cohort_review_trainer(
            (select auth.uid()),
            submission_record.cohort_id,
            submission_record.organization_id
          ))
          and (select app_private.has_permission(
            'review.manage',
            submission_record.organization_id,
            submission_record.cohort_id
          ))
        )
        or (select app_private.has_permission(
          'cohort.manage',
          submission_record.organization_id,
          submission_record.cohort_id
        ))
      )
  );
$$;

create or replace function app_private.can_access_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.questions question_record
    join public.cohorts cohort_record
      on cohort_record.id = question_record.cohort_id
     and cohort_record.organization_id = question_record.organization_id
    where question_record.id = p_question_id
      and (
        (
          question_record.learner_id = (select auth.uid())
          and (select app_private.has_role(
            'learner',
            question_record.organization_id,
            question_record.cohort_id
          ))
          and (select app_private.can_access_cohort(question_record.cohort_id))
        )
        or (
          (select app_private.is_active_cohort_question_trainer(
            (select auth.uid()),
            question_record.cohort_id,
            question_record.organization_id
          ))
          and (select app_private.has_permission(
            'question.manage',
            question_record.organization_id,
            question_record.cohort_id
          ))
        )
        or (select app_private.has_permission(
          'cohort.manage',
          question_record.organization_id,
          question_record.cohort_id
        ))
      )
  );
$$;

create or replace function app_private.can_access_evidence(p_evidence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.evidence evidence_record
    left join public.submission_versions submission_version
      on submission_version.id = evidence_record.submission_version_id
    left join public.submissions submission_record
      on submission_record.id = submission_version.submission_id
     and submission_record.organization_id = evidence_record.organization_id
    where evidence_record.id = p_evidence_id
      and (
        (
          evidence_record.owner_id = (select auth.uid())
          and (
            (
              submission_record.id is not null
              and (select app_private.can_access_submission(submission_record.id))
            )
            or (
              submission_record.id is null
              and (select app_private.is_active_organization_member(
                evidence_record.organization_id
              ))
            )
          )
        )
        or (
          submission_record.id is not null
          and (select app_private.can_access_submission(submission_record.id))
        )
        or (select app_private.has_permission(
          'organization.manage', evidence_record.organization_id, null
        ))
      )
  );
$$;

alter function app_private.can_access_submission(uuid) owner to postgres;
alter function app_private.can_access_question(uuid) owner to postgres;
alter function app_private.can_access_evidence(uuid) owner to postgres;

revoke all on function app_private.can_access_submission(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.can_access_question(uuid)
  from public, anon, authenticated, service_role;
revoke all on function app_private.can_access_evidence(uuid)
  from public, anon, authenticated, service_role;

grant execute on function app_private.can_access_submission(uuid)
  to authenticated, service_role;
grant execute on function app_private.can_access_question(uuid)
  to authenticated, service_role;
grant execute on function app_private.can_access_evidence(uuid)
  to authenticated, service_role;

-- Preserve the deliberately narrow projection while closing deactivated and
-- logically removed membership paths.
create or replace function public.list_visible_skill_prerequisites()
returns table (
  parent_skill_id uuid,
  child_skill_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles profile_record
    where profile_record.user_id = actor_id
      and profile_record.state = 'active'
      and profile_record.deactivated_at is null
  ) then
    raise exception 'visible skill prerequisite scope denied'
      using errcode = '42501';
  end if;

  return query
  with actor_organizations as (
    select distinct organization_membership.organization_id
    from public.organization_memberships organization_membership
    join public.organizations organization_record
      on organization_record.id = organization_membership.organization_id
     and organization_record.state = 'active'
     and organization_record.archived_at is null
    where organization_membership.user_id = actor_id
      and organization_membership.state = 'active'
      and organization_membership.removed_at is null
      and (
        organization_membership.valid_until is null
        or organization_membership.valid_until > statement_timestamp()
      )
  ),
  visible_skills as (
    select skill_record.id
    from public.skills skill_record
    where (
      skill_record.organization_id is null
      and (
        skill_record.state = 'active'
        or (
          skill_record.state = 'draft'
          and app_private.has_permission('content.manage', null, null)
        )
      )
    ) or (
      skill_record.organization_id in (
        select actor_organization.organization_id
        from actor_organizations actor_organization
      )
      and (
        skill_record.state = 'active'
        or (
          skill_record.state = 'draft'
          and app_private.has_permission(
            'content.manage', skill_record.organization_id, null
          )
        )
      )
    )
  )
  select skill_edge.parent_skill_id, skill_edge.child_skill_id
  from public.skill_edges skill_edge
  join visible_skills parent_skill
    on parent_skill.id = skill_edge.parent_skill_id
  join visible_skills child_skill
    on child_skill.id = skill_edge.child_skill_id
  where skill_edge.relation = 'prerequisite'
  order by skill_edge.parent_skill_id, skill_edge.child_skill_id;
end;
$$;

alter function public.list_visible_skill_prerequisites() owner to postgres;
revoke all on function public.list_visible_skill_prerequisites()
  from public, anon, authenticated, service_role;
grant execute on function public.list_visible_skill_prerequisites()
  to authenticated, service_role;

-- Assessment solutions are visible only through the same validated trainer or
-- content-authoring boundaries; raw cohort membership is never sufficient.
drop policy if exists task_option_answers_reviewer_read
  on public.task_option_answers;
create policy task_option_answers_reviewer_read
on public.task_option_answers
for select
to authenticated
using (
  exists (
    select 1
    from public.task_options option_record
    join public.tasks task_record
      on task_record.id = option_record.task_id
    join public.courses course_record
      on course_record.id = task_record.course_id
    where option_record.id = task_option_id
      and (
        (select app_private.has_permission(
          'content.manage', course_record.organization_id, null
        ))
        or exists (
          select 1
          from public.task_schedules schedule_record
          where schedule_record.task_id = task_record.id
            and (select app_private.can_train_cohort(
              schedule_record.cohort_id
            ))
        )
      )
  )
);

drop policy if exists task_model_answers_reviewer_read
  on public.task_model_answers;
create policy task_model_answers_reviewer_read
on public.task_model_answers
for select
to authenticated
using (
  exists (
    select 1
    from public.task_localizations localization_record
    join public.tasks task_record
      on task_record.id = localization_record.task_id
    join public.courses course_record
      on course_record.id = task_record.course_id
    where localization_record.id = task_localization_id
      and (
        (select app_private.has_permission(
          'content.manage', course_record.organization_id, null
        ))
        or exists (
          select 1
          from public.task_schedules schedule_record
          where schedule_record.task_id = task_record.id
            and (select app_private.can_train_cohort(
              schedule_record.cohort_id
            ))
        )
      )
  )
);
