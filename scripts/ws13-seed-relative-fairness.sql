-- ============================================================================
-- WS-13 — the relative-fairness fixture. ISSUES.md I-058.
--
-- ⚠️ This one COMMITS. Every other WS-13 script rolls back; this is seed data,
-- and the whole point of it is that it must be real.
--
-- Why it is needed. Every learner on this deployment has an
-- `enrollments.decided_at` inside 2026-07-20/21, so every learner is on day 1
-- and every plan-relative column reads the same for all of them. WS-12 proved
-- the arithmetic by shifting an anchor inside a rolled-back transaction — but
-- the check `06_…` §8 WS-13 item 5 asks for is that **every screen shows each
-- learner their own day-N**, and a screen cannot be checked against a
-- transaction that was rolled back. Without this, the fairness pass compares
-- two identical day-1 rows and concludes fairness from a coincidence.
--
-- What it changes: exactly one row. Jonas Weber's enrollment anchor moves back
-- 21 days. Nothing else — not his submissions, not his XP, not his streak.
-- That is deliberate: an anchor difference alone is the cleanest possible test
-- of "is this number plan-relative", because if any screen were computing from
-- a cohort-wide date or from absolute XP, Jonas and Lena would still read the
-- same and the difference would be invisible.
--
-- Idempotent: it targets an absolute date, not a relative shift, so running it
-- twice does not move him 42 days.
-- ============================================================================

begin;

do $seed$
declare
  jonas_enrollment constant uuid := '019f83c1-90de-70c8-986a-d5dd64bcb5c4';
  -- 21 days before the rest of the cohort, to the day.
  new_anchor constant timestamptz := timestamptz '2026-06-30 09:00:00+00';
  current_anchor timestamptz;
  learner_name text;
begin
  select enrollment_row.decided_at, profile_row.display_name
    into current_anchor, learner_name
  from public.enrollments enrollment_row
  left join public.profiles profile_row on profile_row.user_id = enrollment_row.learner_id
  where enrollment_row.id = jonas_enrollment;

  if not found then
    raise exception 'I-058: enrollment % is not on this database', jonas_enrollment;
  end if;

  if current_anchor = new_anchor then
    raise notice 'I-058: % is already anchored at % — nothing to do', learner_name, new_anchor;
    return;
  end if;

  update public.enrollments
  set decided_at = new_anchor
  where id = jonas_enrollment;

  raise notice 'I-058: % anchored % → % (now day %)',
    learner_name,
    current_anchor::date,
    new_anchor::date,
    (current_date - new_anchor::date) + 1;
end
$seed$;

-- Show the fixture, so whoever runs this sees what it produced rather than
-- trusting the notice above.
select
  profile_row.display_name                                as learner,
  enrollment_row.decided_at::date                         as anchor,
  (current_date - enrollment_row.decided_at::date) + 1    as own_day_n,
  coalesce(ledger.total, 0)                               as absolute_xp
from public.enrollments enrollment_row
join public.profiles profile_row on profile_row.user_id = enrollment_row.learner_id
left join lateral (
  select sum(entry.points) as total
  from public.xp_ledger entry
  where entry.learner_id = enrollment_row.learner_id
) ledger on true
where enrollment_row.state in ('assigned', 'approved')
order by enrollment_row.decided_at, profile_row.display_name;

commit;
