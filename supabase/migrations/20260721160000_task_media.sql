-- ═══════════════════════════════════════════════════════════════════════════
-- Task media: video and document per task.
--
-- Closes the Workflow A gaps ("Video ansehen", "PDF-Skript lesen") and the
-- Workflow B gap ("Intro-Video"). WS-2 measured that get_my_learning_task
-- returns no video_url or pdf_url anywhere in its payload (I-010), so the task
-- workspace could only render text.
--
-- HOW THE LEARNER PAYLOAD WORKS (measured, not assumed):
--   get_my_learning_task -> app_private.snapshot_task_payload(snapshot, id)
--   and snapshot_task_payload only picks the task object out of
--   content_versions.snapshot. It invents nothing. So a field is visible to a
--   learner exactly when the snapshot builder put it there, and a published
--   version keeps whatever it was published with — which is the point of
--   snapshots.
--
-- Therefore this migration:
--   1. adds the columns to public.tasks
--   2. teaches app_private.build_content_snapshot to carry them
--
-- build_content_snapshot already re-wraps every task to attach skill_mappings
-- and prerequisites, so media is added in that same pass. The underlying
-- build_content_snapshot_without_competencies is left untouched.
--
-- Existing published versions are unaffected: their snapshot is frozen and has
-- no media key, and the reader treats a missing key as "no media". Media
-- appears once a version is published again.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Columns ────────────────────────────────────────────────────────────
-- Deliberately provider-agnostic `text`, not a YouTube id or an eloomi page id.
-- The renderer detects the provider from the URL, so eloomi, YouTube, Vimeo and
-- a plain MP4 all travel through one field and no migration is needed to add
-- another provider later.

alter table public.tasks
  add column if not exists video_url text,
  add column if not exists intro_video_url text,
  add column if not exists document_url text;

comment on column public.tasks.video_url is
  'Main teaching video. Any provider URL — eloomi deep link, YouTube, Vimeo, or a direct file. The client detects the provider.';
comment on column public.tasks.intro_video_url is
  'Short intro shown before a practical scenario (Workflow B, "Intro-Video ansehen").';
comment on column public.tasks.document_url is
  'PDF script or handout (Workflow A, "PDF-Skript lesen").';

-- Reject obvious mistakes early. Only http(s), and only when set.
alter table public.tasks
  drop constraint if exists tasks_media_urls_are_http;
alter table public.tasks
  add constraint tasks_media_urls_are_http check (
    (video_url is null or video_url ~* '^https?://')
    and (intro_video_url is null or intro_video_url ~* '^https?://')
    and (document_url is null or document_url ~* '^https?://')
  );

-- ─── 2. Carry them into the published snapshot ─────────────────────────────
-- Same body as before, plus a 'media' object per task. Anything else changed
-- here would silently alter what learners see, so nothing else is touched.

create or replace function app_private.build_content_snapshot(p_content_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with base_snapshot as (
    select app_private.build_content_snapshot_without_competencies(
      p_content_version_id
    ) as payload
  ), enriched_stages as (
    select
      stage_element.ordinality,
      stage_element.value || jsonb_build_object(
        'tasks',
        coalesce((
          select jsonb_agg(
            task_element.value || jsonb_build_object(
              -- NEW: media travels with the frozen version, like every other
              -- piece of task content.
              'media',
              coalesce((
                select jsonb_strip_nulls(jsonb_build_object(
                  'video_url', task_record.video_url,
                  'intro_video_url', task_record.intro_video_url,
                  'document_url', task_record.document_url
                ))
                from public.tasks task_record
                where task_record.id = (task_element.value ->> 'id')::uuid
              ), '{}'::jsonb),
              'skill_mappings',
              coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', mapping_record.id,
                    'mapping_version', mapping_record.mapping_version,
                    'weight_basis_points', mapping_record.weight_basis_points,
                    'evidence_required', mapping_record.evidence_required,
                    'skill', jsonb_build_object(
                      'id', skill_record.id,
                      'code', skill_record.code,
                      'labels', skill_record.labels,
                      'descriptions', skill_record.descriptions,
                      'taxonomy_version', skill_record.taxonomy_version
                    )
                  )
                  order by
                    mapping_record.mapping_version,
                    skill_record.code,
                    skill_record.id,
                    mapping_record.id
                )
                from public.task_skill_mappings mapping_record
                join public.skills skill_record
                  on skill_record.id = mapping_record.skill_id
                where mapping_record.task_id =
                  (task_element.value ->> 'id')::uuid
              ), '[]'::jsonb),
              'prerequisites',
              coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', prerequisite_record.id,
                    'rule_version', prerequisite_record.rule_version,
                    'required_task_id', prerequisite_record.required_task_id,
                    'required_skill', case
                      when skill_record.id is null then null
                      else jsonb_build_object(
                        'id', skill_record.id,
                        'code', skill_record.code,
                        'labels', skill_record.labels,
                        'taxonomy_version', skill_record.taxonomy_version
                      )
                    end,
                    'minimum_mastery_basis_points',
                      prerequisite_record.minimum_mastery_basis_points
                  )
                  order by
                    prerequisite_record.rule_version,
                    coalesce(
                      prerequisite_record.required_task_id::text,
                      skill_record.code
                    ),
                    prerequisite_record.id
                )
                from public.prerequisites prerequisite_record
                left join public.skills skill_record
                  on skill_record.id = prerequisite_record.required_skill_id
                where prerequisite_record.target_task_id =
                  (task_element.value ->> 'id')::uuid
              ), '[]'::jsonb)
            )
            order by task_element.ordinality
          )
          from jsonb_array_elements(stage_element.value -> 'tasks')
            with ordinality as task_element(value, ordinality)
        ), '[]'::jsonb)
      ) as value
    from base_snapshot
    cross join lateral jsonb_array_elements(base_snapshot.payload -> 'stages')
      with ordinality as stage_element(value, ordinality)
  )
  select jsonb_set(
    base_snapshot.payload,
    '{stages}',
    coalesce((
      select jsonb_agg(enriched_stage.value order by enriched_stage.ordinality)
      from enriched_stages enriched_stage
    ), '[]'::jsonb)
  )
  from base_snapshot;
$$;

commit;
