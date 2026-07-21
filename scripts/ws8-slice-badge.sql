-- ═══════════════════════════════════════════════════════════════════════════
-- WS-8 vertical slice — the badge, deliberately crude.
--
-- 06_ARENA_WORKSTREAMS.md §3: "The badge/XP part of this slice may be a
-- deliberately crude hardcoded insert. WS-11 replaces it properly. The point is
-- proving the round-trip, not shipping it."
--
-- So this is NOT the award engine. It is one INSERT that proves the last link
-- in the chain: a learner who gets a hunt accepted ends up holding a badge they
-- can actually read back under their own RLS policy.
--
-- What it DOES prove, and what WS-11 should not have to rediscover:
--   * badge_awards.source_event_id + its unique constraint really do give you
--     replay safety for free — running this twice awards one badge, not two.
--   * the learner's self-read policy on badge_awards works.
--
-- The award is keyed to the accepted hunt SUBMISSION id, which is the natural
-- source event: one acceptance, one award, forever.
--
-- Apply with:
--   tr -d '\r' < scripts/ws8-slice-badge.sql | ssh Nvidia-1 \
--     'docker exec -i supabase_db_ditele-v2 psql -U postgres -d postgres -v ON_ERROR_STOP=1'
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- The badge itself. organization_id stays null to match the global course.
insert into public.badges (
  id, organization_id, code, labels, descriptions, rule, rule_version, state
)
values (
  '019f9100-0000-7000-8000-0000000000b1',
  null,
  'first-bug-found',
  jsonb_build_object(
    'de', 'Erster Fund',
    'en', 'First find',
    'ru', 'Первая находка'
  ),
  jsonb_build_object(
    'de', 'Deine erste Fehlermeldung aus einer Jagd wurde angenommen.',
    'en', 'Your first hunt defect report was accepted.',
    'ru', 'Ваш первый отчёт об ошибке принят.'
  ),
  -- WS-11 replaces this with a real evaluated rule. Recorded honestly as a
  -- placeholder rather than dressed up as one that works.
  jsonb_build_object(
    'kind', 'placeholder',
    'note', 'WS-8 slice only — the award engine in WS-11 owns real rules'
  ),
  1,
  'active'
)
on conflict (id) do nothing;

-- Award it for the accepted hunt submission, whichever one that is.
insert into public.badge_awards (id, badge_id, learner_id, source_event_id)
select
  '019f9100-0000-7000-8000-0000000000a1',
  '019f9100-0000-7000-8000-0000000000b1',
  attempt_row.learner_id,
  submission_row.id
from public.submissions submission_row
join public.attempts attempt_row on attempt_row.id = submission_row.attempt_id
where submission_row.task_id = '019f9100-0000-7000-8000-000000000001'
  and submission_row.state = 'accepted'
order by submission_row.created_at
limit 1
on conflict do nothing;

commit;

-- ─── Verify ─────────────────────────────────────────────────────────────────
select
  b.code,
  b.labels ->> 'de' as label_de,
  count(a.id) as awards
from public.badges b
left join public.badge_awards a on a.badge_id = b.id
where b.code = 'first-bug-found'
group by b.code, b.labels ->> 'de';
