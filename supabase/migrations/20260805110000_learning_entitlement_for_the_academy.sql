-- ═══════════════════════════════════════════════════════════════════════════
-- Without this row every task in every course is locked, and nothing says why.
--
-- Measured on the cloud project straight after the Praxiskurs import: the
-- course published, the snapshot validated, `list_my_learning_courses` returned
-- it — and every one of the 47 activities came back
--
--     state = 'locked',  lock_reasons = [{"code": "entitlement"}]
--
-- including the very first task, which has no prerequisite at all.
--
-- `app_private.learner_task_is_currently_available` takes the `flexible`
-- progression branch and asks `current_actor_has_learning_entitlement`, which
-- wants an `entitlements` row with `capability = 'learning'` pointing at an
-- ACTIVE `product_packages` row that lists `learning` in its capabilities. The
-- cloud database had neither table populated — zero packages, zero
-- entitlements — because those rows only ever existed in `supabase/seed.sql`,
-- which is local-only and was never applied here.
--
-- ⚠️ This is a commercial gate wearing the clothes of a bug. It is doing
-- exactly what it was built to do; what was missing is the grant. So the fix is
-- to make the grant, not to weaken the check.
--
-- `user_id is null` — deliberately ORGANISATION-WIDE. The function already
-- accepts a null `user_id` as "everyone in this tenant", and DiTeLe is one
-- academy with one organisation. Per-learner rows would mean every future
-- student silently arriving at a fully locked course until someone remembered
-- to add one, which is the failure this migration exists to end.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

insert into public.product_packages (id, code, labels, capabilities, state)
values (
  '01991010-0000-7000-8000-000000000001',
  'academy-core',
  '{"de": "Academy Basis"}'::jsonb,
  array['catalog', 'learning', 'questions', 'portfolio'],
  'active'
)
on conflict (code) do update set
  capabilities = excluded.capabilities,
  state = excluded.state,
  updated_at = statement_timestamp();

-- Only `learning` is read anywhere in the schema — `capability = 'learning'` is
-- the sole capability any function tests. The other three are on the PACKAGE so
-- the catalogue entry stays honest about what it sells; granting entitlement
-- rows for capabilities nothing checks would be noise.
insert into public.entitlements (
  id, organization_id, user_id, product_package_id, capability, source,
  source_reference
)
select
  '01991010-0000-7000-8000-000000000002',
  organization_record.id,
  null,
  package_record.id,
  'learning',
  'manual',
  'Praxiskurs Softwaretester Foundation Level — organisation-wide learning grant'
from public.organizations organization_record
cross join public.product_packages package_record
where organization_record.is_default
  and organization_record.state = 'active'
  and organization_record.archived_at is null
  and package_record.code = 'academy-core'
on conflict (id) do nothing;

commit;

-- ─── Verification, as the learner and not as postgres ──────────────────────
-- The entitlement function is `security definer` and reads `auth.uid()`, so
-- checking it as the superuser would prove nothing. This asks it the way the
-- learner's own page does.
do $verify$
declare
  learner constant uuid := '01991007-0000-7000-8000-000000000003';
  organization uuid;
  entitled boolean;
begin
  select id into organization from public.organizations
  where is_default and state = 'active' and archived_at is null;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', learner, 'role', 'authenticated')::text,
                     true);

  select app_private.current_actor_has_learning_entitlement(organization)
  into entitled;

  if not entitled then
    raise exception 'the learning entitlement did not take effect';
  end if;

  raise notice 'organisation-wide learning entitlement is in place';
end
$verify$;
