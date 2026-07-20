-- Reorder the canonical overload so request note is optional in generated types.
create or replace function public.request_enrollment(
  p_course_id uuid,
  p_idempotency_key text,
  p_request_note text default null
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

