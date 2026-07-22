-- ---------------------------------------------------------------------------
-- duplicate_course, corrected again: source_system and external_id travel together.
--
-- The clone nulled `external_id` so two rows could not claim the same identity
-- in an upstream system, but kept `source_system`. `courses`, `stages` and
-- `tasks` each carry
--
--     check ((source_system is null) = (external_id is null))
--
-- so "imported from arena, but with no external id" is a state the schema
-- refuses — correctly, because it is not a fact about anything. A duplicate is
-- a new local row that no upstream system has ever seen, so BOTH columns are
-- null and the pair stays honest.
--
-- Caught by cloning the seeded course, whose hunt task carries
-- source_system = 'arena'. A course with no imported content would have let
-- this through and it would have failed the first time a customer duplicated
-- an imported course.
-- ---------------------------------------------------------------------------

begin;

create or replace function public.duplicate_course(
  p_source_course_id uuid,
  p_new_slug text,
  p_title_suffix text default ' (Kopie)'
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  source_course public.courses;
  new_course_id uuid;
  source_version_id uuid;
  new_version_id uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_source_course_id is null
     or nullif(btrim(p_new_slug), '') is null
     or p_new_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  then
    raise exception 'duplicate_course: a source course and a slug of the form my-course-name are required'
      using errcode = '22023';
  end if;

  select * into source_course from public.courses where id = p_source_course_id;
  if not found then
    raise exception 'duplicate_course: course % not found', p_source_course_id using errcode = 'P0002';
  end if;

  -- Authorisation is checked against the *source* course's organisation, so an
  -- admin of one tenant cannot clone another tenant's course into their own.
  if not app_private.has_role('admin', source_course.organization_id, null) then
    raise exception 'duplicate_course: administrator role required for this organisation'
      using errcode = '42501';
  end if;

  -- ── course ───────────────────────────────────────────────────────────────
  insert into public.courses (
    organization_id, slug, state, default_locale, estimated_minutes,
    hero_image_url, source_system, external_id, created_by
  )
  values (
    source_course.organization_id, p_new_slug, 'draft', source_course.default_locale,
    source_course.estimated_minutes, source_course.hero_image_url,
    null, null, v_actor_id
  )
  returning id into new_course_id;

  insert into public.course_localizations (
    course_id, locale, title, summary, description_html, learning_outcomes,
    seo_title, seo_description, exam_video_url, completion_video_url
  )
  select new_course_id, locale, title || coalesce(p_title_suffix, ''), summary,
         description_html, learning_outcomes, seo_title, seo_description,
         exam_video_url, completion_video_url
  from public.course_localizations
  where course_id = p_source_course_id;

  -- ── latest content version, as a fresh draft v1 ───────────────────────────
  select id into source_version_id
  from public.content_versions
  where course_id = p_source_course_id
  order by version_number desc
  limit 1;

  if source_version_id is null then
    -- A course with no content version is legal; the copy is simply empty.
    return new_course_id;
  end if;

  -- `{}` rather than null: the column is NOT NULL and constrained to a json
  -- object. The real snapshot is built at the end, once the rows exist.
  insert into public.content_versions (course_id, version_number, state, change_summary, snapshot, created_by)
  values (new_course_id, 1, 'draft',
          'Kopie von ' || source_course.slug, '{}'::jsonb, v_actor_id)
  returning id into new_version_id;

  -- ── stages ────────────────────────────────────────────────────────────────
  create temporary table if not exists tmp_stage_map (old_id uuid primary key, new_id uuid not null)
    on commit drop;
  delete from tmp_stage_map;

  with inserted as (
    insert into public.stages (course_id, content_version_id, position, state, source_system, external_id)
    select new_course_id, new_version_id, s.position, s.state, null, null
    from public.stages s
    where s.content_version_id = source_version_id
    order by s.position
    returning id, position
  )
  insert into tmp_stage_map (old_id, new_id)
  select s.id, i.id
  from public.stages s
  join inserted i on i.position = s.position
  where s.content_version_id = source_version_id;

  insert into public.stage_localizations (stage_id, locale, title, description_html)
  select m.new_id, sl.locale, sl.title, sl.description_html
  from public.stage_localizations sl
  join tmp_stage_map m on m.old_id = sl.stage_id;

  -- ── tasks ─────────────────────────────────────────────────────────────────
  create temporary table if not exists tmp_task_map (old_id uuid primary key, new_id uuid not null)
    on commit drop;
  delete from tmp_task_map;

  with inserted as (
    insert into public.tasks (
      course_id, stage_id, content_version_id, bug_category_id, position, task_kind,
      state, target_url, expected_minutes, hint_penalty_basis_points,
      source_system, external_id, video_url, intro_video_url, document_url
    )
    select new_course_id, m.new_id, new_version_id, t.bug_category_id, t.position, t.task_kind,
           t.state, t.target_url, t.expected_minutes, t.hint_penalty_basis_points,
           null, null, t.video_url, t.intro_video_url, t.document_url
    from public.tasks t
    join tmp_stage_map m on m.old_id = t.stage_id
    where t.content_version_id = source_version_id
    returning id, stage_id, position
  )
  insert into tmp_task_map (old_id, new_id)
  select t.id, i.id
  from public.tasks t
  join tmp_stage_map m on m.old_id = t.stage_id
  join inserted i on i.stage_id = m.new_id and i.position = t.position
  where t.content_version_id = source_version_id;

  -- ── task children ─────────────────────────────────────────────────────────
  create temporary table if not exists tmp_localization_map (old_id uuid primary key, new_id uuid not null)
    on commit drop;
  delete from tmp_localization_map;

  with inserted as (
    insert into public.task_localizations (task_id, locale, title, instructions_html, hint_text)
    select m.new_id, tl.locale, tl.title, tl.instructions_html, tl.hint_text
    from public.task_localizations tl
    join tmp_task_map m on m.old_id = tl.task_id
    returning id, task_id, locale
  )
  insert into tmp_localization_map (old_id, new_id)
  select tl.id, i.id
  from public.task_localizations tl
  join tmp_task_map m on m.old_id = tl.task_id
  join inserted i on i.task_id = m.new_id and i.locale = tl.locale;

  -- The model answer is the trainer-only "Task answer" field.
  insert into public.task_model_answers (task_localization_id, model_answer, updated_by)
  select m.new_id, ma.model_answer, v_actor_id
  from public.task_model_answers ma
  join tmp_localization_map m on m.old_id = ma.task_localization_id;

  insert into public.task_assessments (task_id, question_translations, selection_mode, minimum_selections, maximum_selections)
  select m.new_id, a.question_translations, a.selection_mode, a.minimum_selections, a.maximum_selections
  from public.task_assessments a
  join tmp_task_map m on m.old_id = a.task_id;

  create temporary table if not exists tmp_option_map (old_id uuid primary key, new_id uuid not null)
    on commit drop;
  delete from tmp_option_map;

  with inserted as (
    insert into public.task_options (task_id, option_key, labels, position)
    select m.new_id, o.option_key, o.labels, o.position
    from public.task_options o
    join tmp_task_map m on m.old_id = o.task_id
    returning id, task_id, option_key
  )
  insert into tmp_option_map (old_id, new_id)
  select o.id, i.id
  from public.task_options o
  join tmp_task_map m on m.old_id = o.task_id
  join inserted i on i.task_id = m.new_id and i.option_key = o.option_key;

  insert into public.task_option_answers (task_option_id, is_correct, updated_by)
  select m.new_id, oa.is_correct, v_actor_id
  from public.task_option_answers oa
  join tmp_option_map m on m.old_id = oa.task_option_id;

  insert into public.task_hints (task_id, position, content_translations)
  select m.new_id, h.position, h.content_translations
  from public.task_hints h
  join tmp_task_map m on m.old_id = h.task_id;

  insert into public.task_skill_mappings (task_id, skill_id, mapping_version, weight_basis_points, evidence_required)
  select m.new_id, sm.skill_id, sm.mapping_version, sm.weight_basis_points, sm.evidence_required
  from public.task_skill_mappings sm
  join tmp_task_map m on m.old_id = sm.task_id;

  -- A prerequisite is either "this task requires that task" or "this task
  -- requires that skill". Task-based rules need both ends remapped; skill-based
  -- rules carry over untouched. A rule whose required task is outside the copied
  -- version is dropped rather than left pointing back at the original course —
  -- that would make the copy's unlock order depend on a course the admin may
  -- later archive.
  insert into public.prerequisites (
    organization_id, learning_path_id, target_task_id, required_task_id,
    required_skill_id, minimum_mastery_basis_points, rule_version
  )
  select p.organization_id, p.learning_path_id, t.new_id, r.new_id,
         p.required_skill_id, p.minimum_mastery_basis_points, p.rule_version
  from public.prerequisites p
  join tmp_task_map t on t.old_id = p.target_task_id
  left join tmp_task_map r on r.old_id = p.required_task_id
  where p.required_task_id is null or r.new_id is not null;

  -- Last, because it reads the stages and tasks created above.
  update public.content_versions
  set snapshot = app_private.build_content_snapshot(new_version_id)
  where id = new_version_id;

  return new_course_id;
end;
$function$;

alter function public.duplicate_course(uuid, text, text) owner to postgres;
revoke all on function public.duplicate_course(uuid, text, text) from public;
grant execute on function public.duplicate_course(uuid, text, text) to authenticated;

comment on function public.duplicate_course(uuid, text, text) is
  'Deep-copies a course''s authored content (latest version only, as draft v1). Never copies enrolments, cohorts, attempts, submissions, certificates or trainer assignments.';

commit;
