-- Narrow, actor-derived read projections for skills, organization people and
-- question-trainer assignment. Raw child tables remain protected by RLS.

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
  ) then
    raise exception 'visible skill prerequisite scope denied' using errcode = '42501';
  end if;

  return query
  with actor_organizations as (
    select organization_membership.organization_id
    from public.organization_memberships organization_membership
    join public.organizations organization_record
      on organization_record.id = organization_membership.organization_id
     and organization_record.state = 'active'
     and organization_record.archived_at is null
    where organization_membership.user_id = actor_id
      and organization_membership.state = 'active'
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
  join visible_skills parent_skill on parent_skill.id = skill_edge.parent_skill_id
  join visible_skills child_skill on child_skill.id = skill_edge.child_skill_id
  where skill_edge.relation = 'prerequisite'
  order by skill_edge.parent_skill_id, skill_edge.child_skill_id;
end;
$$;

revoke all on function public.list_visible_skill_prerequisites()
  from public, anon, authenticated, service_role;
grant execute on function public.list_visible_skill_prerequisites()
  to authenticated, service_role;

create or replace function public.list_organization_member_profiles(
  p_organization_id uuid
)
returns table (
  user_id uuid,
  display_name text,
  locale text,
  timezone text,
  profile_state public.record_state,
  membership_state public.membership_state
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_is_global_admin boolean;
  actor_is_active_member boolean;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations organization_record
    where organization_record.id = p_organization_id
      and organization_record.state = 'active'
      and organization_record.archived_at is null
  ) or not exists (
    select 1
    from public.profiles profile_record
    where profile_record.user_id = actor_id
      and profile_record.state = 'active'
  ) then
    raise exception 'organization member profile scope denied' using errcode = '42501';
  end if;

  actor_is_global_admin := app_private.has_role('admin', null, null);
  actor_is_active_member := exists (
    select 1
    from public.organization_memberships organization_membership
    where organization_membership.organization_id = p_organization_id
      and organization_membership.user_id = actor_id
      and organization_membership.state = 'active'
      and (
        organization_membership.valid_until is null
        or organization_membership.valid_until > statement_timestamp()
      )
  );

  if not actor_is_global_admin and (
    not actor_is_active_member
    or not app_private.has_permission(
      'organization.manage', p_organization_id, null
    )
  ) then
    raise exception 'organization member profile scope denied' using errcode = '42501';
  end if;

  return query
  select
    profile_record.user_id,
    profile_record.display_name,
    profile_record.locale,
    profile_record.timezone,
    profile_record.state,
    organization_membership.state
  from public.organization_memberships organization_membership
  join public.profiles profile_record
    on profile_record.user_id = organization_membership.user_id
  where organization_membership.organization_id = p_organization_id
    and organization_membership.state in ('invited', 'active', 'suspended')
  order by lower(profile_record.display_name), profile_record.user_id;
end;
$$;

revoke all on function public.list_organization_member_profiles(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_organization_member_profiles(uuid)
  to authenticated, service_role;

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
      join public.organization_memberships organization_membership
        on organization_membership.organization_id = cohort_record.organization_id
       and organization_membership.user_id = p_user_id
       and organization_membership.state = 'active'
       and (
         organization_membership.valid_until is null
         or organization_membership.valid_until > statement_timestamp()
       )
      join public.profiles profile_record
        on profile_record.user_id = p_user_id
       and profile_record.state = 'active'
      where cohort_record.id = p_cohort_id
        and cohort_record.organization_id = p_organization_id
        and cohort_record.state = 'active'
        and exists (
          select 1
          from public.user_roles role_assignment
          join public.role_permissions role_permission
            on role_permission.role_id = role_assignment.role_id
          join public.permissions permission_record
            on permission_record.id = role_permission.permission_id
          where role_assignment.user_id = p_user_id
            and permission_record.code = 'question.manage'
            and role_assignment.revoked_at is null
            and role_assignment.valid_from <= statement_timestamp()
            and (
              role_assignment.valid_until is null
              or role_assignment.valid_until > statement_timestamp()
            )
            and (
              role_assignment.organization_id is null
              or role_assignment.organization_id = p_organization_id
            )
            and (
              role_assignment.cohort_id is null
              or role_assignment.cohort_id = p_cohort_id
            )
        )
    );
$$;

revoke all on function app_private.is_active_cohort_question_trainer(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.list_active_question_trainers(p_cohort_id uuid)
returns table (
  user_id uuid,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  cohort_organization_id uuid;
  actor_has_active_profile boolean;
  actor_is_trainer boolean;
  actor_can_manage boolean;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select cohort_record.organization_id into cohort_organization_id
  from public.cohorts cohort_record
  join public.organizations organization_record
    on organization_record.id = cohort_record.organization_id
   and organization_record.state = 'active'
   and organization_record.archived_at is null
  where cohort_record.id = p_cohort_id
    and cohort_record.state = 'active';

  if cohort_organization_id is null then
    raise exception 'active question trainer scope denied' using errcode = '42501';
  end if;

  actor_has_active_profile := exists (
    select 1
    from public.profiles profile_record
    where profile_record.user_id = actor_id
      and profile_record.state = 'active'
  );
  actor_is_trainer := app_private.is_active_cohort_question_trainer(
    actor_id, p_cohort_id, cohort_organization_id
  );
  actor_can_manage := actor_has_active_profile
    and app_private.has_permission(
      'cohort.manage', cohort_organization_id, p_cohort_id
    )
    and (
      app_private.has_role('admin', null, null)
      or exists (
        select 1
        from public.organization_memberships organization_membership
        where organization_membership.organization_id = cohort_organization_id
          and organization_membership.user_id = actor_id
          and organization_membership.state = 'active'
          and (
            organization_membership.valid_until is null
            or organization_membership.valid_until > statement_timestamp()
          )
      )
    );

  if not actor_is_trainer and not actor_can_manage then
    raise exception 'active question trainer scope denied' using errcode = '42501';
  end if;

  return query
  select profile_record.user_id, profile_record.display_name
  from public.profiles profile_record
  where app_private.is_active_cohort_question_trainer(
    profile_record.user_id, p_cohort_id, cohort_organization_id
  )
  order by lower(profile_record.display_name), profile_record.user_id;
end;
$$;

revoke all on function public.list_active_question_trainers(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_active_question_trainers(uuid)
  to authenticated, service_role;
