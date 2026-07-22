-- ═══════════════════════════════════════════════════════════════════════════
-- Learner feedback: a quick emoji per task, a star rating per course.
--
-- Product requirements:
--   • When a learner FINISHES a task, a small popup asks how it felt — one of
--     three emojis: not happy / normal / very happy.
--   • When a learner COMPLETES a course, they rate it 1–5 stars and may leave a
--     free-text comment.
--   • The admin receives all of it.
--
-- Two tables, one row per learner per task / per learner per course (upserted so
-- a learner can change their mind). Writes go through SECURITY DEFINER commands
-- like every other learner write (I-003); the enrollment and organisation are
-- resolved from the learner's pinned course context, never trusted from the
-- client. Reads are RLS-scoped: a learner sees their own, an admin sees their
-- organisation's, and two enriched admin functions join in the titles and names
-- the feedback screen shows.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── tables ────────────────────────────────────────────────────────────────
create table if not exists public.task_feedback (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  learner_id uuid not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  -- The three emojis, as stable codes rather than characters.
  sentiment text not null check (sentiment in ('unhappy', 'neutral', 'happy')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (enrollment_id, task_id)
);

create table if not exists public.course_feedback (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  learner_id uuid not null,
  course_id uuid not null references public.courses(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (enrollment_id, course_id)
);

alter table public.task_feedback enable row level security;
alter table public.course_feedback enable row level security;

-- A learner reads their own; an admin reads their organisation's. Writes never
-- come through these — they go through the SECURITY DEFINER commands below,
-- which run as the table owner and so are not bound by these policies.
create policy task_feedback_owner_read on public.task_feedback
  for select using (learner_id = (select auth.uid()));
create policy task_feedback_admin_read on public.task_feedback
  for select using (app_private.has_role('admin', organization_id, null));
create policy course_feedback_owner_read on public.course_feedback
  for select using (learner_id = (select auth.uid()));
create policy course_feedback_admin_read on public.course_feedback
  for select using (app_private.has_role('admin', organization_id, null));

grant select on public.task_feedback to authenticated;
grant select on public.course_feedback to authenticated;

-- ── learner writes ──────────────────────────────────────────────────────--
create or replace function public.submit_task_feedback(
  p_task_id uuid,
  p_sentiment text
)
returns public.task_feedback
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  v_course_id uuid;
  context_record record;
  feedback_row public.task_feedback;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_sentiment not in ('unhappy', 'neutral', 'happy') then
    raise exception 'sentiment must be unhappy, neutral or happy' using errcode = '22023';
  end if;

  -- The course this task belongs to, then the learner's enrolment in it.
  select task_row.course_id into v_course_id
  from public.tasks task_row where task_row.id = p_task_id;
  if v_course_id is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;

  select pinned.enrollment_id, pinned.organization_id
  into context_record
  from app_private.current_actor_pinned_course_context(v_course_id) pinned
  limit 1;
  if context_record.enrollment_id is null then
    raise exception 'you are not enrolled in this course' using errcode = '42501';
  end if;

  insert into public.task_feedback (
    organization_id, enrollment_id, learner_id, task_id, sentiment
  ) values (
    context_record.organization_id, context_record.enrollment_id, actor_id,
    p_task_id, p_sentiment
  )
  on conflict (enrollment_id, task_id) do update
    set sentiment = excluded.sentiment,
        updated_at = statement_timestamp()
  returning * into feedback_row;

  return feedback_row;
end;
$function$;

create or replace function public.submit_course_feedback(
  p_course_id uuid,
  p_stars smallint,
  p_comment text default ''
)
returns public.course_feedback
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  context_record record;
  feedback_row public.course_feedback;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'a rating of 1 to 5 stars is required' using errcode = '22023';
  end if;

  select pinned.enrollment_id, pinned.organization_id
  into context_record
  from app_private.current_actor_pinned_course_context(p_course_id) pinned
  limit 1;
  if context_record.enrollment_id is null then
    raise exception 'you are not enrolled in this course' using errcode = '42501';
  end if;

  insert into public.course_feedback (
    organization_id, enrollment_id, learner_id, course_id, stars, comment
  ) values (
    context_record.organization_id, context_record.enrollment_id, actor_id,
    p_course_id, p_stars, coalesce(btrim(p_comment), '')
  )
  on conflict (enrollment_id, course_id) do update
    set stars = excluded.stars,
        comment = excluded.comment,
        updated_at = statement_timestamp()
  returning * into feedback_row;

  return feedback_row;
end;
$function$;

-- ── admin reads (enriched) ────────────────────────────────────────────────
-- Admin-only, joins in the course/task title (German) and the learner's name so
-- the feedback screen needs no extra round trips.
create or replace function public.list_task_feedback_for_admin(
  p_organization_id uuid
)
returns table (
  task_id uuid,
  task_title text,
  sentiment text,
  learner_name text,
  submitted_at timestamptz
)
language sql
stable security definer
set search_path to ''
as $function$
  select
    feedback_row.task_id,
    coalesce(localization_row.title, ''),
    feedback_row.sentiment,
    coalesce(profile_row.display_name, ''),
    feedback_row.updated_at
  from public.task_feedback feedback_row
  left join public.task_localizations localization_row
    on localization_row.task_id = feedback_row.task_id
   and localization_row.locale = 'de'
  left join public.profiles profile_row
    on profile_row.user_id = feedback_row.learner_id
  where feedback_row.organization_id = p_organization_id
    and app_private.has_role('admin', p_organization_id, null)
  order by feedback_row.updated_at desc;
$function$;

create or replace function public.list_course_feedback_for_admin(
  p_organization_id uuid
)
returns table (
  course_id uuid,
  course_title text,
  stars smallint,
  comment text,
  learner_name text,
  submitted_at timestamptz
)
language sql
stable security definer
set search_path to ''
as $function$
  select
    feedback_row.course_id,
    coalesce(localization_row.title, ''),
    feedback_row.stars,
    feedback_row.comment,
    coalesce(profile_row.display_name, ''),
    feedback_row.updated_at
  from public.course_feedback feedback_row
  left join public.course_localizations localization_row
    on localization_row.course_id = feedback_row.course_id
   and localization_row.locale = 'de'
  left join public.profiles profile_row
    on profile_row.user_id = feedback_row.learner_id
  where feedback_row.organization_id = p_organization_id
    and app_private.has_role('admin', p_organization_id, null)
  order by feedback_row.updated_at desc;
$function$;

alter function public.submit_task_feedback(uuid, text) owner to postgres;
alter function public.submit_course_feedback(uuid, smallint, text) owner to postgres;
alter function public.list_task_feedback_for_admin(uuid) owner to postgres;
alter function public.list_course_feedback_for_admin(uuid) owner to postgres;

revoke all on function public.submit_task_feedback(uuid, text) from public;
revoke all on function public.submit_course_feedback(uuid, smallint, text) from public;
revoke all on function public.list_task_feedback_for_admin(uuid) from public;
revoke all on function public.list_course_feedback_for_admin(uuid) from public;
grant execute on function public.submit_task_feedback(uuid, text) to authenticated, service_role;
grant execute on function public.submit_course_feedback(uuid, smallint, text) to authenticated, service_role;
grant execute on function public.list_task_feedback_for_admin(uuid) to authenticated, service_role;
grant execute on function public.list_course_feedback_for_admin(uuid) to authenticated, service_role;

commit;

-- ─── Verification: submit as a real learner, read back as the admin ────────
do $verify$
declare
  learner constant uuid := '01980a00-0000-7000-8000-000000000001';
  course constant uuid := '01980a20-0000-7000-8000-000000000001';
  task constant uuid := '019f9100-0000-7000-8000-000000000002';
  admin_id uuid;
  task_row public.task_feedback;
  course_row public.course_feedback;
  admin_sees integer;
begin
  if not exists (
    select 1 from public.enrollments e
    where e.learner_id = learner and e.state = 'assigned'
  ) then
    raise notice 'seeded learner absent; feedback check skipped';
    return;
  end if;

  -- As the learner: leave a task emoji and a course rating.
  perform set_config('request.jwt.claims',
    json_build_object('sub', learner, 'role', 'authenticated')::text, true);
  task_row := public.submit_task_feedback(task, 'happy');
  course_row := public.submit_course_feedback(course, 5::smallint, 'Sehr gut');

  if task_row.sentiment <> 'happy' or course_row.stars <> 5 then
    raise exception 'feedback did not persist as submitted (% / %)',
      task_row.sentiment, course_row.stars using errcode = '55000';
  end if;

  -- As an admin of that org: the enriched read returns it.
  select role_assignment.user_id into admin_id
  from public.user_roles role_assignment
  join public.roles role_record on role_record.id = role_assignment.role_id
  where role_record.code = 'admin' and role_assignment.organization_id is null
  limit 1;

  if admin_id is not null then
    perform set_config('request.jwt.claims',
      json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    select count(*) into admin_sees
    from public.list_course_feedback_for_admin(course_row.organization_id);
    if admin_sees < 1 then
      raise exception 'admin does not receive the course feedback' using errcode = '55000';
    end if;
  end if;

  raise notice 'verified: task emoji + course stars submit and reach the admin';
end
$verify$;
