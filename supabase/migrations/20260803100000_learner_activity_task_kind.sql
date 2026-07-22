-- ═══════════════════════════════════════════════════════════════════════════
-- Carry task_kind out to the learner's activity rows.
--
-- AUTHORING_AND_FLOW §5.5 / §6.2:
--
--     Both kinds appear in the learner's Aufgaben / Tasks list ... They must be
--     visually distinct ... an Arena row sends the learner to Arena, a course
--     row opens the task.
--
--     What this costs. No migration. task_kind is already in the snapshot, but
--     LearningActivity (features/learning/model.ts) does not carry it, so it has
--     to be threaded through, then rendered by TaskListItem.
--
-- The snapshot already emits task_kind on every task (knowledge / practical /
-- hunt — verified). What the learner projection dropped was that field: the
-- activity objects `get_my_learning_course` returns carry id, title, position,
-- state, lock_reasons — but not the kind, so the client could not tell an Arena
-- row from a course row.
--
-- `get_my_learning_course` already reads the snapshot task payload for every
-- activity (it needs it for the lock reasons), so the kind is already in hand.
-- One field added to the object it merges onto each activity — no new lookup, no
-- snapshot change, no validator change. The base builder
-- `get_my_learning_course_without_requirements` is left untouched; the kind is a
-- property of the frozen task, and this wrapper is where the frozen task is read.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- Recreated verbatim from the deployed body, with a single field added to the
-- per-activity merge: `'task_kind', task_payload ->> 'task_kind'`. `task_payload`
-- is the snapshot task the loop already resolves for the lock reasons; when it is
-- null (a task absent from the snapshot, which a real activity never is) the
-- field is null and the client falls back to treating the row as a course task.
create or replace function public.get_my_learning_course(
  p_course_id uuid,
  p_locale text default 'en'::text
)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  base_payload jsonb;
  context_record record;
  stage_payload jsonb;
  activity_payload jsonb;
  task_payload jsonb;
  stages_payload jsonb := '[]'::jsonb;
  activities_payload jsonb;
  reasons jsonb;
  projected_state text;
begin
  base_payload := app_private.get_my_learning_course_without_requirements(
    p_course_id, p_locale
  );
  if base_payload is null then return null; end if;

  select pinned_context.* into context_record
  from app_private.current_actor_pinned_course_context(p_course_id)
    pinned_context
  where pinned_context.enrollment_id =
    (base_payload ->> 'enrollment_id')::uuid
  limit 1;
  if context_record.enrollment_id is null then return null; end if;

  for stage_payload in
    select stage_record.value
    from jsonb_array_elements(base_payload -> 'stages') stage_record
  loop
    activities_payload := '[]'::jsonb;
    for activity_payload in
      select activity_record.value
      from jsonb_array_elements(stage_payload -> 'activities') activity_record
    loop
      task_payload := app_private.snapshot_task_payload(
        context_record.snapshot,
        (activity_payload ->> 'id')::uuid
      );
      projected_state := activity_payload ->> 'state';

      if projected_state in (
        'accepted', 'in_progress', 'submitted', 'revision_required'
      ) then
        reasons := '[]'::jsonb;
      elsif context_record.enrollment_state = 'completed' then
        reasons := jsonb_build_array(jsonb_build_object('code', 'history'));
        projected_state := 'locked';
      else
        reasons := app_private.learner_snapshot_task_lock_reasons(
          context_record.enrollment_id,
          context_record.organization_id,
          context_record.cohort_id,
          context_record.progression_mode,
          context_record.content_version_id,
          context_record.snapshot,
          task_payload
        );
        projected_state := case
          when reasons = '[]'::jsonb then 'available'
          else 'locked'
        end;
      end if;

      activities_payload := activities_payload || jsonb_build_array(
        activity_payload
          || jsonb_build_object(
            'state', projected_state,
            'lock_reasons', reasons,
            -- ⭐ §6.2: the one field the learner list needs to tell an Arena row
            -- from a course row. Everything else here was already present.
            'task_kind', task_payload ->> 'task_kind'
          )
      );
    end loop;
    stages_payload := stages_payload || jsonb_build_array(
      jsonb_set(stage_payload, '{activities}', activities_payload, false)
    );
  end loop;

  return jsonb_set(base_payload, '{stages}', stages_payload, false);
end;
$function$;

commit;

-- ─── Verification: the hunt activity now carries its kind ──────────────────
--
-- Asserting the body contains a string proves nothing about the output. This
-- calls the projection as the seeded learner and reads the kind off the actual
-- Arena activity — the row §6.2 exists to make distinguishable.
do $verify$
declare
  learner constant uuid := '01980a00-0000-7000-8000-000000000001';
  course constant uuid := '01980a20-0000-7000-8000-000000000001';
  hunt_task constant uuid := '019f9100-0000-7000-8000-000000000001';
  payload jsonb;
  hunt_kind text;
  course_kind text;
begin
  if not exists (
    select 1 from public.enrollments enrollment
    where enrollment.learner_id = learner and enrollment.state = 'assigned'
  ) then
    raise notice 'seeded learner absent; behavioural check skipped';
    return;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', learner, 'role', 'authenticated')::text, true);

  payload := public.get_my_learning_course(course, 'de');
  if payload is null then
    raise notice 'no pinned course context for the seeded learner; check skipped';
    return;
  end if;

  select activity_record.value ->> 'task_kind' into hunt_kind
  from jsonb_array_elements(payload -> 'stages') stage_record
  cross join lateral jsonb_array_elements(stage_record.value -> 'activities')
    activity_record
  where (activity_record.value ->> 'id')::uuid = hunt_task;

  select activity_record.value ->> 'task_kind' into course_kind
  from jsonb_array_elements(payload -> 'stages') stage_record
  cross join lateral jsonb_array_elements(stage_record.value -> 'activities')
    activity_record
  where activity_record.value ->> 'task_kind' in ('knowledge', 'practical')
  limit 1;

  if hunt_kind is distinct from 'hunt' then
    raise exception
      'the Arena activity does not report task_kind=hunt (got %): the learner '
      'list still cannot tell it apart from a course task', coalesce(hunt_kind, '∅')
      using errcode = '55000';
  end if;
  if course_kind is null then
    raise exception 'no course activity reported a task_kind at all'
      using errcode = '55000';
  end if;

  raise notice 'verified: activities now carry task_kind (hunt row = %, a course row = %)',
    hunt_kind, course_kind;
end
$verify$;
