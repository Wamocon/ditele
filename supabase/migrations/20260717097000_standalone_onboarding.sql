-- Standalone mode has one explicit default organization. Self-registration only
-- grants the learner role in that tenant; elevated roles remain admin-granted.

alter table public.organizations
  add column is_default boolean not null default false;

create unique index organizations_single_default_uidx
  on public.organizations (is_default)
  where is_default;

insert into public.organizations (
  id, slug, name, state, data_residency_region, is_default
)
values (
  '01980a10-0000-7000-8000-000000000001',
  'ditele-academy',
  'DiTeLe Academy',
  'active',
  'eu-central',
  true
)
on conflict (id) do update set is_default = true;

create or replace function app_private.provision_registered_learner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_organization_id uuid;
  learner_role_id uuid;
begin
  -- Trusted local seed fixtures receive explicit roles in seed.sql.
  if coalesce(new.raw_app_meta_data ->> 'seed_fixture', 'false') = 'true' then
    return new;
  end if;

  select o.id into strict default_organization_id
  from public.organizations o
  where o.is_default and o.state = 'active' and o.archived_at is null;

  select r.id into strict learner_role_id
  from public.roles r
  where r.code = 'learner';

  insert into public.organization_memberships (
    organization_id, user_id, state, joined_at
  ) values (
    default_organization_id, new.id, 'active', statement_timestamp()
  );

  insert into public.user_roles (
    user_id, role_id, organization_id, reason
  ) values (
    new.id, learner_role_id, default_organization_id, 'standalone self-registration'
  );

  return new;
end;
$$;

revoke all on function app_private.provision_registered_learner() from public, anon, authenticated;

create trigger auth_user_provision_registered_learner
after insert on auth.users
for each row execute function app_private.provision_registered_learner();

create or replace function public.request_enrollment(
  p_course_id uuid,
  p_request_note text,
  p_idempotency_key text
)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  course_organization_id uuid;
  derived_organization_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select c.organization_id into course_organization_id
  from public.courses c
  where c.id = p_course_id and c.state = 'active' and c.archived_at is null;
  if not found then
    raise exception 'course is unavailable' using errcode = '42501';
  end if;

  if course_organization_id is not null then
    select om.organization_id into derived_organization_id
    from public.organization_memberships om
    where om.user_id = actor_id
      and om.organization_id = course_organization_id
      and om.state = 'active'
      and (om.valid_until is null or om.valid_until > statement_timestamp());
  else
    select min(om.organization_id) into derived_organization_id
    from public.organization_memberships om
    where om.user_id = actor_id
      and om.state = 'active'
      and (om.valid_until is null or om.valid_until > statement_timestamp())
    having count(*) = 1;
  end if;

  if derived_organization_id is null then
    raise exception 'a single active organization membership is required' using errcode = '42501';
  end if;

  return public.request_enrollment(
    derived_organization_id,
    p_course_id,
    p_idempotency_key,
    p_request_note
  );
end;
$$;

revoke all on function public.request_enrollment(uuid, text, text) from public, anon;
grant execute on function public.request_enrollment(uuid, text, text) to authenticated, service_role;

