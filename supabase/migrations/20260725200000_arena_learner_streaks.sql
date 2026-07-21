-- ---------------------------------------------------------------------------
-- WS-11 — learner streaks, and the Arena hub's single read.
--
-- `05_…` §G6 and §8.4 of anforderung/01_RESEARCH_LERNPLATTFORM.md:
-- day granularity in the learner's own timezone, and **2 freezes per month**.
-- The requirement's reasoning is worth restating, because it is the reason the
-- freeze logic is not cut for simplicity: a streak that breaks because someone
-- had a hospital day is a reason to quit, not a reason to try harder.
--
-- Forward-only and idempotent.
--
-- ── The design decision that shapes this file ──────────────────────────────
--
-- The streak is **derived from real activity dates on every refresh**, not
-- incremented by a daily job and not bumped by a "record activity" call.
--
-- Three consequences, all of them wanted:
--
--  * **There is no cron.** A learner who was away for a week sees the correct
--    number the moment they come back, because the number is computed from what
--    they actually did rather than from what a scheduler happened to observe.
--  * **It cannot be gamed by logging in.** §8.4 requires real activity — an
--    attempt started, a task submitted. Visiting the Arena is not activity, so
--    opening this page cannot extend a streak. A self-callable "I was here"
--    endpoint would have been much simpler and would have paid XP for nothing,
--    which is precisely the failure §6 of the design names.
--  * **Freeze consumption is stable.** Because the whole walk is recomputed
--    from the same dates each time, refreshing twice bridges the same gaps and
--    consumes the same allowance. An incremental design would have had to make
--    "did I already spend a freeze for that day" durable, and would drift the
--    first time a refresh was missed.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. `learner_streaks`
-- ---------------------------------------------------------------------------

create table if not exists public.learner_streaks (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete cascade,
  current_length integer not null default 0 check (current_length >= 0),
  longest_length integer not null default 0 check (longest_length >= 0),
  -- The most recent day with real learning activity, in `timezone`.
  last_activity_date date,
  -- How many single-day gaps the current streak bridged inside the calendar
  -- month named by `freeze_period_start`. Recomputed, never accumulated.
  freezes_used integer not null default 0 check (freezes_used >= 0),
  freeze_period_start date,
  -- Copied from `profiles.timezone` at refresh time and stored, so a support
  -- question about "why did my streak break" can be answered from this row
  -- alone rather than by guessing which timezone was in force.
  timezone text not null default 'UTC',
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (organization_id, learner_id)
);

alter table public.learner_streaks enable row level security;

-- Self-read only, matching `xp_ledger_self_read` and `badge_awards_self_read`.
-- There is no write policy at all, deliberately: the only writer is a definer
-- function owned by `postgres`, and a learner who could UPDATE this row could
-- award themselves the milestone XP that hangs off it.
drop policy if exists learner_streaks_self_read on public.learner_streaks;
create policy learner_streaks_self_read on public.learner_streaks
  for select to authenticated
  using (learner_id = (select auth.uid()));

grant select on public.learner_streaks to authenticated;

-- ---------------------------------------------------------------------------
-- 2. `app_private.refresh_learner_streak`
-- ---------------------------------------------------------------------------

create or replace function app_private.refresh_learner_streak(
  p_learner_id uuid,
  p_organization_id uuid
)
returns public.learner_streaks
language plpgsql
security definer
set search_path = ''
as $streak$
declare
  learner_timezone text;
  today date;
  cursor_date date;
  activity_dates date[];
  streak_length integer := 0;
  freezes_by_month jsonb := '{}'::jsonb;
  month_key text;
  month_used integer;
  freezes_spent integer := 0;
  gap_day date;
  streak_row public.learner_streaks;
  milestone integer;
  freeze_allowance constant integer := 2;   -- §8.4
begin
  if p_learner_id is null or p_organization_id is null then
    return null;
  end if;

  select coalesce(nullif(btrim(profile.timezone), ''), 'UTC')
  into learner_timezone
  from public.profiles profile
  where profile.user_id = p_learner_id;
  learner_timezone := coalesce(learner_timezone, 'UTC');

  -- An unknown timezone name raises inside `at time zone`, which would take a
  -- page down over a bad profile value. Fall back rather than fail.
  begin
    today := (timezone(learner_timezone, statement_timestamp()))::date;
  exception when others then
    learner_timezone := 'UTC';
    today := (timezone('UTC', statement_timestamp()))::date;
  end;

  -- ⚠️ Activity is what a learner DID, per §8.4's "1 Unit starten ODER 1 Quiz
  -- absolvieren ODER 1 Praxisaufgabe" — not a page view and not a login.
  -- `attempts` carries all three signals already: `started_at` when a unit is
  -- opened, `last_activity_at` on every autosave, `submitted_at` on submit.
  select coalesce(array_agg(distinct activity_day order by activity_day desc), array[]::date[])
  into activity_dates
  from (
    select (timezone(learner_timezone, moment))::date as activity_day
    from public.attempts attempt_record
    cross join lateral (values
      (attempt_record.started_at),
      (attempt_record.last_activity_at),
      (attempt_record.submitted_at)
    ) as moments(moment)
    where attempt_record.learner_id = p_learner_id
      and moment is not null
  ) days;

  -- Walk back day by day. The anchor is today if there is activity today,
  -- otherwise yesterday — a streak is not broken at 00:01, it is broken when a
  -- whole day passes with nothing in it.
  if array_length(activity_dates, 1) is null then
    streak_length := 0;
  else
    cursor_date := case
      when today = any (activity_dates) then today
      when (today - 1) = any (activity_dates) then today - 1
      else null
    end;

    while cursor_date is not null loop
      streak_length := streak_length + 1;

      if (cursor_date - 1) = any (activity_dates) then
        cursor_date := cursor_date - 1;
        continue;
      end if;

      -- One missing day may be bridged, and only while that month still has
      -- allowance. Two missing days in a row end the streak — §8.4 grants a
      -- grace period of exactly one day.
      --
      -- ⚠️ A bridged day is NOT counted. §8.4 defines the streak as "die Anzahl
      -- aufeinanderfolgender Tage mit mindestens einer Lernaktivität" — days
      -- with activity. A freeze keeps the chain intact; it does not hand the
      -- learner credit for a day they did not study. So 0,1,2 · gap · 4,5 is a
      -- streak of **5**, not 6. The other reading inflates the number, and
      -- between a count that is honest and one that flatters, this one is
      -- honest.
      gap_day := cursor_date - 1;
      if (cursor_date - 2) = any (activity_dates) then
        month_key := to_char(gap_day, 'YYYY-MM');
        month_used := coalesce((freezes_by_month ->> month_key)::integer, 0);
        if month_used < freeze_allowance then
          freezes_by_month := jsonb_set(
            freezes_by_month, array[month_key], to_jsonb(month_used + 1), true
          );
          if to_char(gap_day, 'YYYY-MM') = to_char(today, 'YYYY-MM') then
            freezes_spent := freezes_spent + 1;
          end if;
          cursor_date := cursor_date - 2;
          continue;
        end if;
      end if;

      cursor_date := null;
    end loop;
  end if;

  insert into public.learner_streaks (
    organization_id, learner_id, current_length, longest_length,
    last_activity_date, freezes_used, freeze_period_start, timezone
  ) values (
    p_organization_id, p_learner_id, streak_length, streak_length,
    activity_dates[1], freezes_spent, date_trunc('month', today)::date, learner_timezone
  )
  on conflict (organization_id, learner_id) do update
  set current_length = excluded.current_length,
      -- The longest streak is a record, so it only ever goes up. Recomputing
      -- the current one from activity must never erase history.
      longest_length = greatest(public.learner_streaks.longest_length, excluded.current_length),
      last_activity_date = excluded.last_activity_date,
      freezes_used = excluded.freezes_used,
      freeze_period_start = excluded.freeze_period_start,
      timezone = excluded.timezone,
      row_version = public.learner_streaks.row_version + 1,
      updated_at = statement_timestamp()
  returning * into streak_row;

  -- §8.1 "Täglicher Login (Streak)". Paid for TODAY only, never backfilled:
  -- a first refresh after a long absence must not dump a month of XP at once.
  -- The source event is derived from (learner, day), so a second refresh the
  -- same day inserts nothing.
  if today = any (activity_dates) then
    perform app_private.award_for_event(
      p_learner_id, p_organization_id, 'daily_activity',
      md5('day:' || p_learner_id::text || ':' || today::text)::uuid,
      null, null, streak_length
    );
  end if;

  -- §8.4's milestone bonuses. Only the milestone the learner has just reached
  -- or passed pays, and only once — the source event is derived from
  -- (learner, milestone), so crossing 7 days again next month pays nothing.
  foreach milestone in array array[7, 14, 30, 100] loop
    if streak_length >= milestone then
      perform app_private.award_for_event(
        p_learner_id, p_organization_id, 'streak_milestone',
        md5('streak:' || p_learner_id::text || ':' || milestone::text)::uuid,
        null, null, milestone
      );
    end if;
  end loop;

  -- The 3-day badge has no XP (§8.4 gives it none), so it needs its own
  -- evaluation pass with the streak length in hand.
  if streak_length >= 3 then
    perform app_private.evaluate_badge_rules(p_learner_id, p_organization_id, streak_length);
  end if;

  return streak_row;
end
$streak$;

-- ---------------------------------------------------------------------------
-- 3. `public.get_my_arena_summary` — the hub's single read
-- ---------------------------------------------------------------------------
--
-- One RPC rather than five table reads, because it also refreshes the streak,
-- and that refresh has to happen somewhere the learner reliably passes through.
-- The Arena hub is that place.
--
-- It is a volatile function that writes, which is unusual for a `get_*`. The
-- alternative — a separate "refresh" call the page makes first — is two round
-- trips and a state where one succeeded and the other did not.

create or replace function public.get_my_arena_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $summary$
declare
  actor_id uuid := (select auth.uid());
  org uuid;
  streak_row public.learner_streaks;
  total_xp integer;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- The learner's own organization, from their own enrollment. Not a parameter:
  -- a caller-supplied org would let a learner ask about a tenant they are not
  -- in, and this function is `security definer`.
  select enrollment.organization_id into org
  from public.enrollments enrollment
  where enrollment.learner_id = actor_id
    and enrollment.state in ('approved', 'assigned', 'completed')
  order by enrollment.decided_at desc nulls last
  limit 1;

  if org is not null then
    streak_row := app_private.refresh_learner_streak(actor_id, org);
  end if;

  select coalesce(sum(entry.points), 0) into total_xp
  from public.xp_ledger entry where entry.learner_id = actor_id;

  return jsonb_build_object(
    'total_xp', total_xp,
    'level', app_private.xp_level(total_xp),
    'streak', case when streak_row.learner_id is null then null else jsonb_build_object(
      'current_length', streak_row.current_length,
      'longest_length', streak_row.longest_length,
      'last_activity_date', streak_row.last_activity_date,
      'freezes_remaining', greatest(0, 2 - streak_row.freezes_used),
      'active_today', streak_row.last_activity_date
        = (timezone(streak_row.timezone, statement_timestamp()))::date
    ) end,
    -- Unread `badge.awarded` / `level.up` notifications ARE the celebration
    -- queue. Reusing the notification's read state needs no new column, dedupes
    -- for free (`notifications` is unique on recipient + key), and makes
    -- dismissing a celebration the shipped `mark_notification_read` RPC rather
    -- than a new write path.
    'celebrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'notification_id', notification.id,
        'row_version', notification.row_version,
        'kind', case when notification.event_type = 'level.up' then 'level' else 'badge' end,
        'reference', coalesce(
          notification.payload ->> 'badge_code',
          notification.payload ->> 'level',
          ''
        ),
        'label', coalesce(notification.payload ->> 'badge_label', '')
      ) order by notification.created_at)
      from public.notifications notification
      where notification.recipient_id = actor_id
        and notification.event_type in ('badge.awarded', 'level.up')
        and notification.read_at is null
        and notification.state <> 'cancelled'
    ), '[]'::jsonb)
  );
end
$summary$;

-- ---------------------------------------------------------------------------
-- 4. Ownership and grants
-- ---------------------------------------------------------------------------

alter function app_private.refresh_learner_streak(uuid, uuid) owner to postgres;
alter function public.get_my_arena_summary() owner to postgres;

revoke all on function app_private.refresh_learner_streak(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_my_arena_summary() from public, anon;
grant execute on function public.get_my_arena_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Verify by effect
-- ---------------------------------------------------------------------------

do $verify$
declare
  problems text[] := array[]::text[];
begin
  if to_regclass('public.learner_streaks') is null then
    problems := problems || 'learner_streaks was not created';
  elsif not (select relrowsecurity from pg_catalog.pg_class
             where oid = 'public.learner_streaks'::regclass) then
    problems := problems || 'learner_streaks does not have RLS enabled';
  end if;

  -- No write policy is the point, not an omission. Assert it, so a later
  -- migration that "helpfully" adds one has to argue with this line.
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'learner_streaks' and cmd <> 'SELECT'
  ) then
    problems := problems || 'learner_streaks has a write policy — a learner could award themselves streak XP';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_my_arena_summary'
  ) then
    problems := problems || 'get_my_arena_summary was not created';
  end if;

  if array_length(problems, 1) > 0 then
    raise exception 'WS-11 streak verification failed: %', array_to_string(problems, '; ');
  end if;
  raise notice 'WS-11 streaks verified';
end
$verify$;

commit;
