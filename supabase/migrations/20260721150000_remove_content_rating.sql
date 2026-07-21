-- ═══════════════════════════════════════════════════════════════════════════
-- Remove content rating / feedback entirely (Workflow F).
--
-- Product decision: rating a task or a course is not part of this application.
-- Removing it rather than leaving it dormant, so nobody rebuilds a UI on top of
-- a feature that was cut, and so the RPC surface stays honest.
--
-- Checked before writing:
--   * no foreign key anywhere references ratings or rating_command_receipts
--   * no other function or view reads them (only rate_course / rate_task, both
--     dropped here)
--   * 8 rows in each, all seeded test data
--
-- NOT touched, despite matching a "%rat%" search:
--   * app_private.consume_authentication_rate_limit  (login throttling)
--   * app_private.can_run_content_operation          (content lifecycle)
--   * review_rubric_scores and everything rubric-related — that is trainer
--     grading, which the database makes mandatory for decide_submission, and is
--     a completely different concept from learner content feedback.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

drop function if exists public.rate_course(uuid, integer, text, bigint, uuid, text);
drop function if exists public.rate_task(uuid, integer, text, bigint, uuid, text);

-- Catch any overload left behind by an earlier signature.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('rate_course', 'rate_task')
  loop
    execute format('drop function if exists %s', fn.sig);
  end loop;
end
$$;

drop table if exists public.rating_command_receipts;
drop table if exists public.ratings;

commit;
