-- A trigger shared by tables with different enum types must compare text values;
-- otherwise PL/pgSQL caches the enum type from the first table that fires it.

create or replace function app_private.validate_named_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean := false;
  old_state text := old.state::text;
  new_state text := new.state::text;
begin
  if new_state = old_state then
    return new;
  end if;

  allowed := case tg_table_name
    when 'cohorts' then
      (old_state = 'waiting' and new_state in ('active', 'cancelled'))
      or (old_state = 'active' and new_state in ('completed', 'cancelled'))
    when 'enrollments' then
      (old_state = 'requested' and new_state in ('approved', 'rejected', 'cancelled'))
      or (old_state = 'approved' and new_state in ('assigned', 'cancelled'))
      or (old_state = 'assigned' and new_state in ('completed', 'cancelled'))
    when 'submissions' then
      (old_state = 'submitted' and new_state in ('accepted', 'revision_required', 'withdrawn'))
      or (old_state = 'revision_required' and new_state = 'resubmitted')
      or (old_state = 'resubmitted' and new_state in ('accepted', 'revision_required', 'withdrawn'))
    when 'questions' then
      (old_state = 'open' and new_state in ('assigned', 'archived'))
      or (old_state = 'assigned' and new_state in ('answered', 'transferred', 'archived'))
      or (old_state = 'transferred' and new_state in ('assigned', 'answered', 'archived'))
      or (old_state = 'answered' and new_state = 'archived')
    when 'lab_sessions' then
      (old_state = 'requested' and new_state in ('provisioning', 'failed'))
      or (old_state = 'provisioning' and new_state in ('ready', 'failed'))
      or (old_state = 'ready' and new_state in ('active', 'reset_pending', 'destroy_pending', 'expired'))
      or (old_state = 'active' and new_state in ('validating', 'reset_pending', 'destroy_pending', 'expired', 'failed'))
      or (old_state = 'validating' and new_state in ('active', 'destroy_pending', 'failed'))
      or (old_state = 'reset_pending' and new_state in ('ready', 'failed'))
      or (old_state = 'destroy_pending' and new_state in ('destroyed', 'failed'))
      or (old_state = 'failed' and new_state in ('provisioning', 'destroy_pending'))
      or (old_state = 'expired' and new_state = 'destroy_pending')
    when 'certificates' then
      (old_state = 'eligible' and new_state = 'issued')
      or (old_state = 'issued' and new_state in ('available', 'revoked'))
      or (old_state = 'available' and new_state in ('revoked', 'expired'))
    when 'integration_deliveries' then
      (old_state = 'pending' and new_state in ('processing', 'cancelled'))
      or (old_state = 'processing' and new_state in ('delivered', 'retry_scheduled', 'dead_letter'))
      or (old_state = 'retry_scheduled' and new_state in ('processing', 'dead_letter', 'cancelled'))
      or (old_state = 'dead_letter' and new_state = 'retry_scheduled')
    when 'content_versions' then
      (old_state = 'draft' and new_state in ('in_review', 'archived'))
      or (old_state = 'in_review' and new_state in ('draft', 'published', 'archived'))
    else false
  end;

  if not allowed then
    raise exception 'invalid % transition: % -> %', tg_table_name, old_state, new_state
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_named_transition() from public, anon, authenticated;
