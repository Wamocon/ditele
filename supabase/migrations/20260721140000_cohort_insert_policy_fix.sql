-- ═══════════════════════════════════════════════════════════════════════════
-- Fix the cohorts INSERT policy — the second half of I-011.
--
-- Granting DML (migration 20260721130000) got the insert past the table grant,
-- and it then failed on RLS instead. The cause is a real defect in the original
-- policy, not a permission decision:
--
--   cohorts_scoped_write  FOR ALL
--     with check ( app_private.has_permission('cohort.manage',
--                                             cohorts.organization_id,
--                                             cohorts.id) )
--
-- has_permission validates its cohort argument by looking the cohort up:
--
--   p_cohort_id is null OR exists (select 1 from cohorts where id = p_cohort_id …)
--
-- During an INSERT, `cohorts.id` is the NEW row's freshly generated id, which by
-- definition is not yet a visible row. The lookup fails, has_permission returns
-- false, and the insert is refused. The policy can therefore never admit an
-- INSERT from anyone — it is unsatisfiable by construction.
--
-- Fix: scope the INSERT check at the ORGANIZATION level, which is the right
-- question anyway ("may this person create cohorts in this org?"), and keep the
-- row-level check for UPDATE and DELETE, where the row genuinely exists.
--
-- This narrows nothing: 'cohort.manage' on the organization is already required
-- by the old check, which additionally demanded an impossible row lookup.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

drop policy if exists cohorts_scoped_write on public.cohorts;

-- INSERT: org-scoped. The row does not exist yet, so it cannot be interrogated.
create policy cohorts_insert
  on public.cohorts for insert to authenticated
  with check (
    (select app_private.has_permission('cohort.manage', organization_id, null))
  );

-- UPDATE: row exists, so keep the precise per-cohort check on both sides.
create policy cohorts_update
  on public.cohorts for update to authenticated
  using ((select app_private.has_permission('cohort.manage', organization_id, id)))
  with check ((select app_private.has_permission('cohort.manage', organization_id, id)));

-- DELETE: row exists.
create policy cohorts_delete
  on public.cohorts for delete to authenticated
  using ((select app_private.has_permission('cohort.manage', organization_id, id)));

comment on policy cohorts_insert on public.cohorts is
  'Organization-scoped: a new cohort has no id to check yet. The replaced '
  'cohorts_scoped_write policy passed the unborn row id to has_permission, which '
  'made every insert impossible.';

commit;
