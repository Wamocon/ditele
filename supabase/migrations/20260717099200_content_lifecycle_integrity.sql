-- Version-aware course authoring, immutable published render graphs and audited
-- content lifecycle transitions for WF-05.

-- Keep legacy, unversioned stages unique inside a course while allowing every
-- content version to start its own ordered graph at position zero.
alter table public.stages
  drop constraint if exists stages_course_position_unique;

create unique index stages_version_position_uidx
  on public.stages (content_version_id, position)
  where content_version_id is not null;

create unique index stages_legacy_course_position_uidx
  on public.stages (course_id, position)
  where content_version_id is null;

-- Composite keys make the course side of the graph declarative. A trigger below
-- additionally enforces null-safe task-to-stage version equality for legacy rows.
alter table public.content_versions
  add constraint content_versions_id_course_unique unique (id, course_id);

alter table public.stages
  add constraint stages_id_course_unique unique (id, course_id),
  add constraint stages_version_course_fk
    foreign key (content_version_id, course_id)
    references public.content_versions (id, course_id)
    on delete restrict;

alter table public.tasks
  add constraint tasks_stage_course_fk
    foreign key (stage_id, course_id)
    references public.stages (id, course_id)
    on delete cascade,
  add constraint tasks_version_course_fk
    foreign key (content_version_id, course_id)
    references public.content_versions (id, course_id)
    on delete restrict;

create index stages_version_course_idx
  on public.stages (content_version_id, course_id)
  where content_version_id is not null;
create index tasks_stage_course_idx on public.tasks (stage_id, course_id);
create index tasks_version_course_idx
  on public.tasks (content_version_id, course_id)
  where content_version_id is not null;

create or replace function app_private.enforce_content_graph_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_course_id uuid;
  parent_version_id uuid;
begin
  if tg_table_name = 'stages' then
    if new.content_version_id is not null then
      select version_row.course_id into parent_course_id
      from public.content_versions version_row
      where version_row.id = new.content_version_id;

      if parent_course_id is null or parent_course_id <> new.course_id then
        raise exception 'stage content version must belong to the same course'
          using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  select stage_row.course_id, stage_row.content_version_id
  into parent_course_id, parent_version_id
  from public.stages stage_row
  where stage_row.id = new.stage_id;

  if parent_course_id is null or parent_course_id <> new.course_id then
    raise exception 'task stage must belong to the same course'
      using errcode = '23514';
  end if;

  if new.content_version_id is null and parent_version_id is not null then
    new.content_version_id := parent_version_id;
  elsif new.content_version_id is distinct from parent_version_id then
    raise exception 'task and stage must belong to the same content version'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_content_graph_consistency()
  from public, anon, authenticated;

create trigger stages_enforce_content_graph
before insert or update of course_id, content_version_id on public.stages
for each row execute function app_private.enforce_content_graph_consistency();

create trigger tasks_enforce_content_graph
before insert or update of course_id, stage_id, content_version_id on public.tasks
for each row execute function app_private.enforce_content_graph_consistency();

-- Existing rows are not rewritten. Abort rather than silently reinterpret any
-- legacy row whose explicit graph references already conflict.
do $$
begin
  if exists (
    select 1
    from public.tasks task_row
    join public.stages stage_row on stage_row.id = task_row.stage_id
    where task_row.course_id <> stage_row.course_id
      or task_row.content_version_id is distinct from stage_row.content_version_id
  ) then
    raise exception 'existing task graph contains a cross-course or cross-version reference'
      using errcode = '23514';
  end if;
end $$;

-- Media attached to a versioned stage must carry the same explicit version and
-- course scope. Course-only legacy/evidence media remains nullable and unchanged.
alter table public.media_assets
  add column content_version_id uuid;

do $$
begin
  if exists (
    select 1
    from public.media_assets media_row
    join public.stages stage_row on stage_row.id = media_row.stage_id
    join public.courses course_row on course_row.id = stage_row.course_id
    where (media_row.course_id is not null and media_row.course_id <> stage_row.course_id)
      or media_row.organization_id is distinct from course_row.organization_id
  ) then
    raise exception 'existing stage media has inconsistent course or organization scope'
      using errcode = '23514';
  end if;
end $$;

update public.media_assets media_row
set course_id = stage_row.course_id,
    organization_id = course_row.organization_id,
    content_version_id = stage_row.content_version_id
from public.stages stage_row
join public.courses course_row on course_row.id = stage_row.course_id
where media_row.stage_id = stage_row.id;

alter table public.media_assets
  add constraint media_assets_version_course_fk
    foreign key (content_version_id, course_id)
    references public.content_versions (id, course_id)
    on delete restrict;

create index media_assets_version_course_idx
  on public.media_assets (content_version_id, course_id)
  where content_version_id is not null;

create or replace function app_private.enforce_content_media_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  derived_course_id uuid;
  derived_organization_id uuid;
  derived_version_id uuid;
begin
  if new.stage_id is not null then
    select stage_row.course_id, course_row.organization_id, stage_row.content_version_id
    into derived_course_id, derived_organization_id, derived_version_id
    from public.stages stage_row
    join public.courses course_row on course_row.id = stage_row.course_id
    where stage_row.id = new.stage_id;

    if derived_course_id is null then
      raise exception 'media stage does not exist' using errcode = '23514';
    end if;
  elsif new.content_version_id is not null then
    select version_row.course_id, course_row.organization_id, version_row.id
    into derived_course_id, derived_organization_id, derived_version_id
    from public.content_versions version_row
    join public.courses course_row on course_row.id = version_row.course_id
    where version_row.id = new.content_version_id;

    if derived_course_id is null then
      raise exception 'media content version does not exist' using errcode = '23514';
    end if;
  else
    return new;
  end if;

  if new.course_id is null then
    new.course_id := derived_course_id;
  elsif new.course_id <> derived_course_id then
    raise exception 'media course does not match its content graph'
      using errcode = '23514';
  end if;

  if new.organization_id is distinct from derived_organization_id then
    raise exception 'media organization does not match its course'
      using errcode = '23514';
  end if;

  if new.content_version_id is null and derived_version_id is not null then
    new.content_version_id := derived_version_id;
  elsif new.content_version_id is distinct from derived_version_id then
    raise exception 'media version does not match its stage'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_content_media_consistency()
  from public, anon, authenticated;

create trigger media_assets_enforce_content_graph
before insert or update of organization_id, course_id, stage_id, content_version_id
on public.media_assets
for each row execute function app_private.enforce_content_media_consistency();

-- A review records the exact graph fingerprint it inspected. Legacy review rows
-- remain preserved but cannot authorize a future publication without re-review.
alter table public.content_reviews
  add column content_fingerprint text,
  add column expected_content_version_row_version bigint,
  add constraint content_reviews_fingerprint_format check (
    content_fingerprint is null or content_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint content_reviews_expected_version_positive check (
    expected_content_version_row_version is null
    or expected_content_version_row_version > 0
  );

create trigger content_reviews_immutable
before update or delete on public.content_reviews
for each row execute function app_private.reject_mutation();

revoke insert, update, delete on public.content_reviews from authenticated;

-- Lifecycle receipts serialize actor-scoped retries and permanently bind each
-- idempotency key to one canonical payload.
create table public.content_workflow_receipts (
  id uuid primary key default app_private.uuid7(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (operation in (
    'submit_for_review', 'decide_review', 'publish', 'archive'
  )),
  content_version_id uuid not null references public.content_versions(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 16 and 200),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  result_state public.content_version_state not null,
  result_row_version bigint not null check (result_row_version > 0),
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint content_workflow_receipts_actor_operation_key_unique
    unique (actor_id, operation, idempotency_key)
);

create index content_workflow_receipts_version_idx
  on public.content_workflow_receipts (content_version_id, created_at desc);

alter table public.content_workflow_receipts enable row level security;
alter table public.content_workflow_receipts force row level security;
revoke all on public.content_workflow_receipts from public, anon, authenticated;
grant select on public.content_workflow_receipts to service_role;

create trigger content_workflow_receipts_immutable
before update or delete on public.content_workflow_receipts
for each row execute function app_private.reject_mutation();

alter table public.content_versions
  add column archived_by uuid references auth.users(id) on delete set null,
  add column archived_at timestamptz,
  add column archive_reason text,
  add column archive_impact_fingerprint text,
  add constraint content_versions_archive_fingerprint_format check (
    archive_impact_fingerprint is null
    or archive_impact_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add constraint content_versions_non_archived_metadata_empty check (
    state = 'archived'
    or (
      archived_by is null
      and archived_at is null
      and archive_reason is null
      and archive_impact_fingerprint is null
    )
  );

create index content_versions_archived_by_idx
  on public.content_versions (archived_by, archived_at desc)
  where archived_by is not null;

-- Replace the broad historical trigger and the generic transition trigger for
-- this aggregate with one boundary that permits only audited state changes and
-- a field-limited published -> archived transition.
drop trigger if exists content_versions_published_immutable on public.content_versions;
drop trigger if exists content_versions_validate_transition on public.content_versions;

create or replace function app_private.guard_content_version_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lifecycle_owner name;
  old_stable jsonb;
  new_stable jsonb;
begin
  if tg_op = 'DELETE' then
    if old.state in ('published', 'archived') then
      raise exception 'published content versions are immutable' using errcode = '55000';
    end if;
    return old;
  end if;

  select pg_catalog.pg_get_userbyid(procedure_row.proowner)
  into lifecycle_owner
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid =
    'public.submit_content_for_review(uuid,bigint,text,uuid)'::pg_catalog.regprocedure;

  if old.state = 'archived' then
    raise exception 'published content versions are immutable' using errcode = '55000';
  end if;

  if old.state = 'published' then
    if new.state <> 'archived'
       or current_user <> lifecycle_owner
       or new.archived_by is null
       or new.archived_at is null
       or nullif(btrim(new.archive_reason), '') is null
       or new.archive_impact_fingerprint is null then
      raise exception 'published content versions are immutable' using errcode = '55000';
    end if;

    old_stable := to_jsonb(old)
      - 'state' - 'row_version' - 'updated_at' - 'archived_by'
      - 'archived_at' - 'archive_reason' - 'archive_impact_fingerprint';
    new_stable := to_jsonb(new)
      - 'state' - 'row_version' - 'updated_at' - 'archived_by'
      - 'archived_at' - 'archive_reason' - 'archive_impact_fingerprint';
    if old_stable <> new_stable then
      raise exception 'published content versions are immutable' using errcode = '55000';
    end if;
    return new;
  end if;

  if new.state is distinct from old.state then
    if current_user <> lifecycle_owner then
      raise exception 'content lifecycle transitions require an audited RPC'
        using errcode = '55000';
    end if;

    if not (
      (old.state = 'draft' and new.state = 'in_review')
      or (old.state = 'in_review' and new.state in ('draft', 'published'))
    ) then
      raise exception 'invalid content_versions transition: % -> %', old.state, new.state
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_content_version_lifecycle()
  from public, anon, authenticated;

create trigger content_versions_lifecycle_guard
before update or delete on public.content_versions
for each row execute function app_private.guard_content_version_lifecycle();

-- Resolve the content-version owner of every render-graph row through one
-- reviewed path so the mutation trigger cannot accidentally omit solution rows.
create or replace function app_private.content_owner_version(
  p_table_name text,
  p_row jsonb
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result uuid;
begin
  case p_table_name
    when 'stages', 'tasks', 'task_rubric_assignments', 'media_assets' then
      result := nullif(p_row ->> 'content_version_id', '')::uuid;
      if result is null and p_table_name = 'media_assets'
         and p_row ->> 'stage_id' is not null then
        select stage_row.content_version_id into result
        from public.stages stage_row
        where stage_row.id = (p_row ->> 'stage_id')::uuid;
      end if;
    when 'stage_localizations' then
      select stage_row.content_version_id into result
      from public.stages stage_row
      where stage_row.id = (p_row ->> 'stage_id')::uuid;
    when 'task_localizations', 'task_assessments', 'task_hints' then
      select task_row.content_version_id into result
      from public.tasks task_row
      where task_row.id = (p_row ->> 'task_id')::uuid;
    when 'task_options' then
      select task_row.content_version_id into result
      from public.tasks task_row
      where task_row.id = (p_row ->> 'task_id')::uuid;
    when 'task_option_answers' then
      select task_row.content_version_id into result
      from public.task_options option_row
      join public.tasks task_row on task_row.id = option_row.task_id
      where option_row.id = (p_row ->> 'task_option_id')::uuid;
    when 'task_model_answers' then
      select task_row.content_version_id into result
      from public.task_localizations localization_row
      join public.tasks task_row on task_row.id = localization_row.task_id
      where localization_row.id = (p_row ->> 'task_localization_id')::uuid;
    else
      raise exception 'unsupported content graph table: %', p_table_name
        using errcode = '22023';
  end case;

  return result;
end;
$$;

revoke all on function app_private.content_owner_version(text, jsonb)
  from public, anon, authenticated;

create or replace function app_private.guard_immutable_content_graph()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_version_id uuid;
  new_version_id uuid;
  owning_state public.content_version_state;
  lifecycle_owner name;
begin
  if tg_op <> 'INSERT' then
    old_version_id := app_private.content_owner_version(tg_table_name, to_jsonb(old));
  end if;
  if tg_op <> 'DELETE' then
    new_version_id := app_private.content_owner_version(tg_table_name, to_jsonb(new));
  end if;

  select version_row.state into owning_state
  from public.content_versions version_row
  where version_row.id in (old_version_id, new_version_id)
    and version_row.state in ('published', 'archived')
  order by case version_row.state when 'archived' then 0 else 1 end
  limit 1;

  if owning_state is not null then
    -- Deterministic reset seeds are loaded only after all migrations. The
    -- lifecycle-function owner is already a fully trusted database owner (and
    -- can disable triggers), so permit only its initial INSERT bootstrap into a
    -- published graph. API roles can never use this exception, and subsequent
    -- UPDATE/DELETE operations remain blocked even for the owner.
    select pg_catalog.pg_get_userbyid(procedure_row.proowner)
    into lifecycle_owner
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid =
      'public.submit_content_for_review(uuid,bigint,text,uuid)'::pg_catalog.regprocedure;
    if tg_op = 'INSERT'
       and owning_state = 'published'
       and (select auth.uid()) is null
       and current_user = lifecycle_owner then
      return new;
    end if;

    raise exception 'published content graph is immutable' using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.guard_immutable_content_graph()
  from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'stages', 'stage_localizations', 'tasks', 'task_localizations',
    'task_options', 'task_option_answers', 'task_model_answers',
    'task_assessments', 'task_hints', 'task_rubric_assignments',
    'media_assets'
  ]
  loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I '
      'for each row execute function app_private.guard_immutable_content_graph()',
      table_name || '_guard_published_graph', table_name
    );
  end loop;
end $$;

create or replace function app_private.can_run_content_operation(
  p_organization_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (select app_private.has_permission(p_permission_code, p_organization_id))
    and (
      (p_organization_id is null and (select app_private.has_role('admin')))
      or (
        p_organization_id is not null
        and (select app_private.is_active_organization_member(p_organization_id))
      )
    );
$$;

revoke all on function app_private.can_run_content_operation(uuid, text)
  from public, anon, authenticated;

-- This snapshot is the canonical immutable learner/render payload. It contains
-- no task_option_answers, task_model_answers or correctness-derived fields.
create or replace function app_private.build_content_snapshot(p_content_version_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  version_row public.content_versions;
  course_row public.courses;
  course_localizations jsonb;
  course_media jsonb;
  stages_payload jsonb;
begin
  select version_record.* into version_row
  from public.content_versions version_record
  where version_record.id = p_content_version_id;
  if version_row.id is null then
    raise exception 'content version does not exist' using errcode = '22023';
  end if;

  select course_record.* into course_row
  from public.courses course_record
  where course_record.id = version_row.course_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'locale', localization_row.locale,
        'title', localization_row.title,
        'summary', localization_row.summary,
        'description_html', localization_row.description_html,
        'learning_outcomes', localization_row.learning_outcomes,
        'seo_title', localization_row.seo_title,
        'seo_description', localization_row.seo_description
      )
      order by case localization_row.locale
        when 'en' then 0 when 'de' then 1 when 'ru' then 2 else 3 end
    ),
    '[]'::jsonb
  ) into course_localizations
  from public.course_localizations localization_row
  where localization_row.course_id = course_row.id
    and localization_row.locale in ('en', 'de', 'ru');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', media_row.id,
        'object_key', media_row.object_key,
        'media_kind', media_row.media_kind,
        'mime_type', media_row.mime_type,
        'byte_size', media_row.byte_size,
        'sha256_hex', media_row.sha256_hex
      ) order by media_row.object_key, media_row.id
    ),
    '[]'::jsonb
  ) into course_media
  from public.media_assets media_row
  where media_row.content_version_id = version_row.id
    and media_row.stage_id is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', stage_row.id,
        'position', stage_row.position,
        'localizations', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'locale', stage_localization.locale,
                'title', stage_localization.title,
                'description_html', stage_localization.description_html
              )
              order by case stage_localization.locale
                when 'en' then 0 when 'de' then 1 when 'ru' then 2 else 3 end
            ),
            '[]'::jsonb
          )
          from public.stage_localizations stage_localization
          where stage_localization.stage_id = stage_row.id
            and stage_localization.locale in ('en', 'de', 'ru')
        ),
        'media', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', media_row.id,
                'object_key', media_row.object_key,
                'media_kind', media_row.media_kind,
                'mime_type', media_row.mime_type,
                'byte_size', media_row.byte_size,
                'sha256_hex', media_row.sha256_hex
              ) order by media_row.object_key, media_row.id
            ),
            '[]'::jsonb
          )
          from public.media_assets media_row
          where media_row.stage_id = stage_row.id
            and media_row.content_version_id = version_row.id
        ),
        'tasks', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', task_row.id,
                'position', task_row.position,
                'task_kind', task_row.task_kind,
                'target_url', task_row.target_url,
                'expected_minutes', task_row.expected_minutes,
                'hint_penalty_basis_points', task_row.hint_penalty_basis_points,
                'bug_category', (
                  select jsonb_build_object(
                    'code', category_row.code,
                    'labels', category_row.labels
                  )
                  from public.bug_categories category_row
                  where category_row.id = task_row.bug_category_id
                ),
                'localizations', (
                  select coalesce(
                    jsonb_agg(
                      jsonb_build_object(
                        'locale', task_localization.locale,
                        'title', task_localization.title,
                        'instructions_html', task_localization.instructions_html,
                        'hint_text', task_localization.hint_text
                      )
                      order by case task_localization.locale
                        when 'en' then 0 when 'de' then 1 when 'ru' then 2 else 3 end
                    ),
                    '[]'::jsonb
                  )
                  from public.task_localizations task_localization
                  where task_localization.task_id = task_row.id
                    and task_localization.locale in ('en', 'de', 'ru')
                ),
                'options', (
                  select coalesce(
                    jsonb_agg(
                      jsonb_build_object(
                        'id', option_row.id,
                        'option_key', option_row.option_key,
                        'labels', option_row.labels,
                        'position', option_row.position
                      ) order by option_row.position, option_row.id
                    ),
                    '[]'::jsonb
                  )
                  from public.task_options option_row
                  where option_row.task_id = task_row.id
                ),
                'assessment', (
                  select jsonb_build_object(
                    'question_translations', assessment_row.question_translations,
                    'selection_mode', assessment_row.selection_mode,
                    'minimum_selections', assessment_row.minimum_selections,
                    'maximum_selections', assessment_row.maximum_selections
                  )
                  from public.task_assessments assessment_row
                  where assessment_row.task_id = task_row.id
                ),
                'hints', (
                  select coalesce(
                    jsonb_agg(
                      jsonb_build_object(
                        'id', hint_row.id,
                        'position', hint_row.position,
                        'content_translations', hint_row.content_translations
                      ) order by hint_row.position, hint_row.id
                    ),
                    '[]'::jsonb
                  )
                  from public.task_hints hint_row
                  where hint_row.task_id = task_row.id
                ),
                'rubric', (
                  select jsonb_build_object(
                    'assignment_id', assignment_row.id,
                    'rubric_id', rubric_row.id,
                    'code', rubric_row.code,
                    'labels', rubric_row.labels,
                    'version', rubric_row.version,
                    'criteria', (
                      select coalesce(
                        jsonb_agg(
                          jsonb_build_object(
                            'id', criterion_row.id,
                            'code', criterion_row.code,
                            'labels', criterion_row.labels,
                            'position', criterion_row.position,
                            'max_points', criterion_row.max_points,
                            'required_for_acceptance', criterion_row.required_for_acceptance,
                            'skill_id', criterion_row.skill_id
                          ) order by criterion_row.position, criterion_row.id
                        ),
                        '[]'::jsonb
                      )
                      from public.rubric_criteria criterion_row
                      where criterion_row.rubric_id = rubric_row.id
                    )
                  )
                  from public.task_rubric_assignments assignment_row
                  join public.rubrics rubric_row on rubric_row.id = assignment_row.rubric_id
                  where assignment_row.task_id = task_row.id
                    and assignment_row.content_version_id = version_row.id
                )
              ) order by task_row.position, task_row.id
            ),
            '[]'::jsonb
          )
          from public.tasks task_row
          where task_row.stage_id = stage_row.id
            and task_row.content_version_id = version_row.id
        )
      ) order by stage_row.position, stage_row.id
    ),
    '[]'::jsonb
  ) into stages_payload
  from public.stages stage_row
  where stage_row.content_version_id = version_row.id;

  return jsonb_build_object(
    'schema_version', 1,
    'course', jsonb_build_object(
      'id', course_row.id,
      'slug', course_row.slug,
      'default_locale', course_row.default_locale,
      'estimated_minutes', course_row.estimated_minutes,
      'localizations', course_localizations,
      'media', course_media
    ),
    'content_version', jsonb_build_object(
      'id', version_row.id,
      'version_number', version_row.version_number,
      'change_summary', version_row.change_summary
    ),
    'stages', stages_payload
  );
end;
$$;

revoke all on function app_private.build_content_snapshot(uuid)
  from public, anon, authenticated;

create or replace function app_private.assert_content_version_ready(
  p_content_version_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_course_id uuid;
  stage_count bigint;
begin
  select version_row.course_id into target_course_id
  from public.content_versions version_row
  where version_row.id = p_content_version_id;
  if target_course_id is null then
    raise exception 'content version does not exist' using errcode = '22023';
  end if;

  if (
    select count(*) <> 3
      or bool_or(
        nullif(btrim(localization_row.title), '') is null
        or nullif(btrim(localization_row.summary), '') is null
        or nullif(btrim(localization_row.description_html), '') is null
      )
    from public.course_localizations localization_row
    where localization_row.course_id = target_course_id
      and localization_row.locale in ('en', 'de', 'ru')
  ) then
    raise exception 'complete EN, DE and RU course localizations are required'
      using errcode = '23514';
  end if;

  select count(*) into stage_count
  from public.stages stage_row
  where stage_row.content_version_id = p_content_version_id;
  if stage_count = 0 then
    raise exception 'at least one version-owned stage is required' using errcode = '23514';
  end if;
  if exists (
    select 1
    from (
      select min(stage_row.position) as minimum_position,
             max(stage_row.position) as maximum_position,
             count(*) as row_count
      from public.stages stage_row
      where stage_row.content_version_id = p_content_version_id
    ) positions
    where positions.minimum_position <> 0
      or positions.maximum_position <> positions.row_count - 1
  ) then
    raise exception 'stage positions must be contiguous from zero' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.stages stage_row
    where stage_row.content_version_id = p_content_version_id
      and (
        stage_row.state not in ('draft', 'active')
        or (
          select count(*) <> 3
            or bool_or(
              nullif(btrim(localization_row.title), '') is null
              or nullif(btrim(localization_row.description_html), '') is null
            )
          from public.stage_localizations localization_row
          where localization_row.stage_id = stage_row.id
            and localization_row.locale in ('en', 'de', 'ru')
        )
        or not exists (
          select 1 from public.tasks task_row
          where task_row.stage_id = stage_row.id
            and task_row.content_version_id = p_content_version_id
        )
        or exists (
          select 1
          from (
            select min(task_row.position) as minimum_position,
                   max(task_row.position) as maximum_position,
                   count(*) as row_count
            from public.tasks task_row
            where task_row.stage_id = stage_row.id
              and task_row.content_version_id = p_content_version_id
          ) positions
          where positions.minimum_position <> 0
            or positions.maximum_position <> positions.row_count - 1
        )
      )
  ) then
    raise exception 'every stage requires complete localizations and contiguous tasks'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.tasks task_row
    where task_row.content_version_id = p_content_version_id
      and (
        task_row.state not in ('draft', 'active')
        or (
          select count(*) <> 3
            or bool_or(
              nullif(btrim(localization_row.title), '') is null
              or nullif(btrim(localization_row.instructions_html), '') is null
            )
          from public.task_localizations localization_row
          where localization_row.task_id = task_row.id
            and localization_row.locale in ('en', 'de', 'ru')
        )
        or exists (
          select 1
          from public.task_hints hint_row
          where hint_row.task_id = task_row.id
            and (
              not (hint_row.content_translations ?& array['en', 'de', 'ru'])
              or nullif(btrim(hint_row.content_translations ->> 'en'), '') is null
              or nullif(btrim(hint_row.content_translations ->> 'de'), '') is null
              or nullif(btrim(hint_row.content_translations ->> 'ru'), '') is null
            )
        )
        or exists (
          select 1
          from (
            select min(hint_row.position) as minimum_position,
                   max(hint_row.position) as maximum_position,
                   count(*) as row_count
            from public.task_hints hint_row
            where hint_row.task_id = task_row.id
          ) positions
          where positions.row_count > 0
            and (
              positions.minimum_position <> 0
              or positions.maximum_position <> positions.row_count - 1
            )
        )
      )
  ) then
    raise exception 'tasks require complete localizations and contiguous localized hints'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.tasks task_row
    left join public.task_assessments assessment_row
      on assessment_row.task_id = task_row.id
    where task_row.content_version_id = p_content_version_id
      and (
        (assessment_row.task_id is null and exists (
          select 1 from public.task_options option_row
          where option_row.task_id = task_row.id
        ))
        or (
          assessment_row.task_id is not null
          and (
            not (assessment_row.question_translations ?& array['en', 'de', 'ru'])
            or nullif(btrim(assessment_row.question_translations ->> 'en'), '') is null
            or nullif(btrim(assessment_row.question_translations ->> 'de'), '') is null
            or nullif(btrim(assessment_row.question_translations ->> 'ru'), '') is null
            or (assessment_row.selection_mode = 'single' and (
              assessment_row.minimum_selections <> 1
              or assessment_row.maximum_selections <> 1
            ))
            or assessment_row.maximum_selections is null
            or assessment_row.maximum_selections > (
              select count(*) from public.task_options option_row
              where option_row.task_id = task_row.id
            )
            or (
              select count(*) from public.task_options option_row
              where option_row.task_id = task_row.id
            ) < assessment_row.minimum_selections
            or exists (
              select 1
              from public.task_options option_row
              where option_row.task_id = task_row.id
                and (
                  not (option_row.labels ?& array['en', 'de', 'ru'])
                  or nullif(btrim(option_row.labels ->> 'en'), '') is null
                  or nullif(btrim(option_row.labels ->> 'de'), '') is null
                  or nullif(btrim(option_row.labels ->> 'ru'), '') is null
                  or not exists (
                    select 1 from public.task_option_answers answer_row
                    where answer_row.task_option_id = option_row.id
                  )
                )
            )
            or (
              select count(*)
              from public.task_options option_row
              join public.task_option_answers answer_row
                on answer_row.task_option_id = option_row.id
              where option_row.task_id = task_row.id
                and answer_row.is_correct
            ) not between assessment_row.minimum_selections
              and assessment_row.maximum_selections
          )
        )
      )
  ) then
    raise exception 'assessment options, selections and translations are incomplete'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.media_assets media_row
    where media_row.content_version_id = p_content_version_id
      and (media_row.state <> 'active' or media_row.deleted_at is not null)
  ) then
    raise exception 'version-owned media must be active and available'
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function app_private.assert_content_version_ready(uuid)
  from public, anon, authenticated;

create or replace function app_private.content_fingerprint(p_content_version_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      app_private.build_content_snapshot(p_content_version_id)::text,
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function app_private.content_fingerprint(uuid)
  from public, anon, authenticated;

create or replace function app_private.build_content_archive_impact(
  p_content_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  version_row public.content_versions;
begin
  select version_record.* into version_row
  from public.content_versions version_record
  where version_record.id = p_content_version_id;
  if version_row.id is null then
    raise exception 'content version does not exist' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'content_version_id', version_row.id,
    'course_id', version_row.course_id,
    'row_version', version_row.row_version,
    'snapshot_sha256', encode(
      extensions.digest(version_row.snapshot::text, 'sha256'), 'hex'
    ),
    'task_count', (
      select count(*) from public.tasks task_row
      where task_row.content_version_id = version_row.id
    ),
    'task_schedule_count', (
      select count(*)
      from public.task_schedules schedule_row
      join public.tasks task_row on task_row.id = schedule_row.task_id
      where task_row.content_version_id = version_row.id
    ),
    'attempt_count', (
      select count(*)
      from public.attempts attempt_row
      join public.tasks task_row on task_row.id = attempt_row.task_id
      where task_row.content_version_id = version_row.id
    ),
    'open_attempt_count', (
      select count(*)
      from public.attempts attempt_row
      join public.tasks task_row on task_row.id = attempt_row.task_id
      where task_row.content_version_id = version_row.id
        and attempt_row.state in ('in_progress', 'submitted', 'revision_required', 'resubmitted')
    ),
    'submission_count', (
      select count(*)
      from public.submissions submission_row
      join public.tasks task_row on task_row.id = submission_row.task_id
      where task_row.content_version_id = version_row.id
    )
  );
end;
$$;

revoke all on function app_private.build_content_archive_impact(uuid)
  from public, anon, authenticated;

create or replace function public.get_content_archive_impact(
  p_content_version_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_id uuid;
  impact_payload jsonb;
  fingerprint text;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select course_row.organization_id into v_organization_id
  from public.content_versions version_row
  join public.courses course_row on course_row.id = version_row.course_id
  where version_row.id = p_content_version_id;
  if not found
     or not (select app_private.can_run_content_operation(
       v_organization_id, 'content.publish'
     )) then
    raise exception 'content publication scope denied' using errcode = '42501';
  end if;

  impact_payload := app_private.build_content_archive_impact(p_content_version_id);
  fingerprint := encode(
    extensions.digest(impact_payload::text, 'sha256'), 'hex'
  );
  return impact_payload || jsonb_build_object('fingerprint', fingerprint);
end;
$$;

revoke all on function public.get_content_archive_impact(uuid) from public, anon;
grant execute on function public.get_content_archive_impact(uuid)
  to authenticated, service_role;

create or replace function public.submit_content_for_review(
  p_content_version_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns public.content_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_id uuid;
  version_row public.content_versions;
  receipt_row public.content_workflow_receipts;
  payload_hash text;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_content_version_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid version, CAS, idempotency key and correlation ID are required'
      using errcode = '22023';
  end if;

  select course_row.organization_id into v_organization_id
  from public.content_versions content_version
  join public.courses course_row on course_row.id = content_version.course_id
  where content_version.id = p_content_version_id;
  if not found
     or not (select app_private.can_run_content_operation(
       v_organization_id, 'content.manage'
     )) then
    raise exception 'content management scope denied' using errcode = '42501';
  end if;

  payload_hash := encode(extensions.digest(
    jsonb_build_object(
      'content_version_id', p_content_version_id,
      'expected_version', p_expected_version
    )::text,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_id::text || ':submit_for_review:' || p_idempotency_key, 0
  ));

  select receipt_record.* into receipt_row
  from public.content_workflow_receipts receipt_record
  where receipt_record.actor_id = v_actor_id
    and receipt_record.operation = 'submit_for_review'
    and receipt_record.idempotency_key = p_idempotency_key;
  if receipt_row.id is not null then
    if receipt_row.content_version_id <> p_content_version_id
       or receipt_row.payload_hash <> payload_hash then
      raise exception 'idempotency key was reused with a different content payload'
        using errcode = '22023';
    end if;
    select content_version.* into version_row
    from public.content_versions content_version
    where content_version.id = p_content_version_id;
    return version_row;
  end if;

  select content_version.* into version_row
  from public.content_versions content_version
  where content_version.id = p_content_version_id
  for update;
  if version_row.row_version <> p_expected_version
     or version_row.state <> 'draft' then
    raise exception 'content version is stale or not draft' using errcode = '40001';
  end if;

  perform app_private.assert_content_version_ready(p_content_version_id);

  update public.content_versions content_version
  set state = 'in_review'
  where content_version.id = p_content_version_id
    and content_version.row_version = p_expected_version
    and content_version.state = 'draft'
  returning content_version.* into version_row;
  if version_row.id is null then
    raise exception 'content version became stale' using errcode = '40001';
  end if;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    v_organization_id, v_actor_id, 'content_admin', 'content.review_submitted',
    'content_version', version_row.id, version_row.row_version,
    p_correlation_id,
    jsonb_build_object('content_fingerprint',
      app_private.content_fingerprint(version_row.id))
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    v_organization_id, 'content_version', version_row.id, version_row.row_version,
    'content.review_submitted.v1', 1, p_correlation_id,
    jsonb_build_object(
      'content_version_id', version_row.id,
      'course_id', version_row.course_id,
      'version_number', version_row.version_number
    )
  );

  insert into public.content_workflow_receipts (
    actor_id, operation, content_version_id, idempotency_key, payload_hash,
    result_state, result_row_version, correlation_id
  ) values (
    v_actor_id, 'submit_for_review', version_row.id, p_idempotency_key, payload_hash,
    version_row.state, version_row.row_version, p_correlation_id
  );

  return version_row;
end;
$$;

create or replace function public.decide_content_review(
  p_content_version_id uuid,
  p_expected_version bigint,
  p_decision text,
  p_comment text,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns public.content_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_id uuid;
  version_row public.content_versions;
  receipt_row public.content_workflow_receipts;
  review_row public.content_reviews;
  payload_hash text;
  fingerprint text;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_content_version_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_decision not in ('approved', 'changes_requested')
     or nullif(btrim(p_comment), '') is null
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid review decision, comment, CAS and idempotency key are required'
      using errcode = '22023';
  end if;

  select course_row.organization_id into v_organization_id
  from public.content_versions content_version
  join public.courses course_row on course_row.id = content_version.course_id
  where content_version.id = p_content_version_id;
  if not found
     or not (select app_private.can_run_content_operation(
       v_organization_id, 'content.publish'
     )) then
    raise exception 'content publication scope denied' using errcode = '42501';
  end if;

  payload_hash := encode(extensions.digest(
    jsonb_build_object(
      'content_version_id', p_content_version_id,
      'expected_version', p_expected_version,
      'decision', p_decision,
      'comment', p_comment
    )::text,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_id::text || ':decide_review:' || p_idempotency_key, 0
  ));

  select receipt_record.* into receipt_row
  from public.content_workflow_receipts receipt_record
  where receipt_record.actor_id = v_actor_id
    and receipt_record.operation = 'decide_review'
    and receipt_record.idempotency_key = p_idempotency_key;
  if receipt_row.id is not null then
    if receipt_row.content_version_id <> p_content_version_id
       or receipt_row.payload_hash <> payload_hash then
      raise exception 'idempotency key was reused with a different content payload'
        using errcode = '22023';
    end if;
    select content_version.* into version_row
    from public.content_versions content_version
    where content_version.id = p_content_version_id;
    return version_row;
  end if;

  select content_version.* into version_row
  from public.content_versions content_version
  where content_version.id = p_content_version_id
  for update;
  if version_row.row_version <> p_expected_version
     or version_row.state <> 'in_review' then
    raise exception 'content version is stale or not in review' using errcode = '40001';
  end if;

  if p_decision = 'approved' then
    perform app_private.assert_content_version_ready(p_content_version_id);
  end if;
  fingerprint := app_private.content_fingerprint(p_content_version_id);

  insert into public.content_reviews (
    content_version_id, reviewer_id, decision, comment,
    content_fingerprint, expected_content_version_row_version
  ) values (
    p_content_version_id, v_actor_id, p_decision, p_comment,
    fingerprint, p_expected_version
  ) returning * into review_row;

  update public.content_versions content_version
  set state = case when p_decision = 'changes_requested'
    then 'draft'::public.content_version_state
    else content_version.state end,
    change_summary = content_version.change_summary
  where content_version.id = p_content_version_id
    and content_version.row_version = p_expected_version
    and content_version.state = 'in_review'
  returning content_version.* into version_row;
  if version_row.id is null then
    raise exception 'content version became stale' using errcode = '40001';
  end if;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    v_organization_id, v_actor_id, 'content_publisher', 'content.review_decided',
    'content_version', version_row.id, version_row.row_version,
    p_correlation_id,
    jsonb_build_object(
      'content_review_id', review_row.id,
      'decision', p_decision,
      'content_fingerprint', fingerprint
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    v_organization_id, 'content_version', version_row.id, version_row.row_version,
    'content.review_decided.v1', 1, p_correlation_id,
    jsonb_build_object(
      'content_version_id', version_row.id,
      'course_id', version_row.course_id,
      'content_review_id', review_row.id,
      'decision', p_decision
    )
  );

  insert into public.content_workflow_receipts (
    actor_id, operation, content_version_id, idempotency_key, payload_hash,
    result_state, result_row_version, correlation_id
  ) values (
    v_actor_id, 'decide_review', version_row.id, p_idempotency_key, payload_hash,
    version_row.state, version_row.row_version, p_correlation_id
  );

  return version_row;
end;
$$;

create or replace function public.publish_content_version(
  p_content_version_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns public.content_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_id uuid;
  version_row public.content_versions;
  receipt_row public.content_workflow_receipts;
  latest_review public.content_reviews;
  payload_hash text;
  fingerprint text;
  render_snapshot jsonb;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_content_version_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid version, CAS, idempotency key and correlation ID are required'
      using errcode = '22023';
  end if;

  select course_row.organization_id into v_organization_id
  from public.content_versions content_version
  join public.courses course_row on course_row.id = content_version.course_id
  where content_version.id = p_content_version_id;
  if not found
     or not (select app_private.can_run_content_operation(
       v_organization_id, 'content.publish'
     )) then
    raise exception 'content publication scope denied' using errcode = '42501';
  end if;

  payload_hash := encode(extensions.digest(
    jsonb_build_object(
      'content_version_id', p_content_version_id,
      'expected_version', p_expected_version
    )::text,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_id::text || ':publish:' || p_idempotency_key, 0
  ));

  select receipt_record.* into receipt_row
  from public.content_workflow_receipts receipt_record
  where receipt_record.actor_id = v_actor_id
    and receipt_record.operation = 'publish'
    and receipt_record.idempotency_key = p_idempotency_key;
  if receipt_row.id is not null then
    if receipt_row.content_version_id <> p_content_version_id
       or receipt_row.payload_hash <> payload_hash then
      raise exception 'idempotency key was reused with a different content payload'
        using errcode = '22023';
    end if;
    select content_version.* into version_row
    from public.content_versions content_version
    where content_version.id = p_content_version_id;
    return version_row;
  end if;

  select content_version.* into version_row
  from public.content_versions content_version
  where content_version.id = p_content_version_id
  for update;
  if version_row.row_version <> p_expected_version
     or version_row.state <> 'in_review' then
    raise exception 'content version is stale or not publishable' using errcode = '40001';
  end if;

  perform app_private.assert_content_version_ready(p_content_version_id);
  fingerprint := app_private.content_fingerprint(p_content_version_id);

  select review_record.* into latest_review
  from public.content_reviews review_record
  where review_record.content_version_id = p_content_version_id
  order by review_record.created_at desc, review_record.id desc
  limit 1;
  if latest_review.id is null
     or latest_review.decision <> 'approved'
     or latest_review.content_fingerprint is distinct from fingerprint then
    raise exception 'an approved current content review is required before publication'
      using errcode = '23514';
  end if;

  update public.stages stage_row
  set state = 'active'
  where stage_row.content_version_id = p_content_version_id
    and stage_row.state = 'draft';
  update public.tasks task_row
  set state = 'active'
  where task_row.content_version_id = p_content_version_id
    and task_row.state = 'draft';

  render_snapshot := app_private.build_content_snapshot(p_content_version_id);

  update public.content_versions content_version
  set state = 'published',
      snapshot = render_snapshot,
      published_by = v_actor_id,
      published_at = statement_timestamp()
  where content_version.id = p_content_version_id
    and content_version.row_version = p_expected_version
    and content_version.state = 'in_review'
  returning content_version.* into version_row;
  if version_row.id is null then
    raise exception 'content version became stale' using errcode = '40001';
  end if;

  update public.courses course_row
  set state = 'active', archived_at = null
  where course_row.id = version_row.course_id
    and (course_row.state <> 'active' or course_row.archived_at is not null);

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    v_organization_id, v_actor_id, 'content_publisher', 'content.version_published',
    'content_version', version_row.id, version_row.row_version,
    p_correlation_id,
    jsonb_build_object(
      'content_review_id', latest_review.id,
      'content_fingerprint', fingerprint,
      'snapshot_sha256', encode(
        extensions.digest(render_snapshot::text, 'sha256'), 'hex'
      )
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    v_organization_id, 'content_version', version_row.id, version_row.row_version,
    'content.version_published.v1', 1, p_correlation_id,
    jsonb_build_object(
      'content_version_id', version_row.id,
      'course_id', version_row.course_id,
      'version_number', version_row.version_number,
      'snapshot_sha256', encode(
        extensions.digest(render_snapshot::text, 'sha256'), 'hex'
      )
    )
  );

  insert into public.content_workflow_receipts (
    actor_id, operation, content_version_id, idempotency_key, payload_hash,
    result_state, result_row_version, correlation_id
  ) values (
    v_actor_id, 'publish', version_row.id, p_idempotency_key, payload_hash,
    version_row.state, version_row.row_version, p_correlation_id
  );

  return version_row;
end;
$$;

create or replace function public.archive_content_version(
  p_content_version_id uuid,
  p_expected_version bigint,
  p_impact_fingerprint text,
  p_reason text,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns public.content_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_organization_id uuid;
  version_row public.content_versions;
  receipt_row public.content_workflow_receipts;
  payload_hash text;
  impact_payload jsonb;
  expected_fingerprint text;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_content_version_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_impact_fingerprint is null
     or p_impact_fingerprint !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_reason), '') is null
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'valid impact confirmation, reason, CAS and idempotency key are required'
      using errcode = '22023';
  end if;

  select course_row.organization_id into v_organization_id
  from public.content_versions content_version
  join public.courses course_row on course_row.id = content_version.course_id
  where content_version.id = p_content_version_id;
  if not found
     or not (select app_private.can_run_content_operation(
       v_organization_id, 'content.publish'
     )) then
    raise exception 'content publication scope denied' using errcode = '42501';
  end if;

  payload_hash := encode(extensions.digest(
    jsonb_build_object(
      'content_version_id', p_content_version_id,
      'expected_version', p_expected_version,
      'impact_fingerprint', p_impact_fingerprint,
      'reason', p_reason
    )::text,
    'sha256'
  ), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor_id::text || ':archive:' || p_idempotency_key, 0
  ));

  select receipt_record.* into receipt_row
  from public.content_workflow_receipts receipt_record
  where receipt_record.actor_id = v_actor_id
    and receipt_record.operation = 'archive'
    and receipt_record.idempotency_key = p_idempotency_key;
  if receipt_row.id is not null then
    if receipt_row.content_version_id <> p_content_version_id
       or receipt_row.payload_hash <> payload_hash then
      raise exception 'idempotency key was reused with a different content payload'
        using errcode = '22023';
    end if;
    select content_version.* into version_row
    from public.content_versions content_version
    where content_version.id = p_content_version_id;
    return version_row;
  end if;

  select content_version.* into version_row
  from public.content_versions content_version
  where content_version.id = p_content_version_id
  for update;
  if version_row.row_version <> p_expected_version
     or version_row.state <> 'published' then
    raise exception 'content version is stale or not published' using errcode = '40001';
  end if;

  impact_payload := app_private.build_content_archive_impact(p_content_version_id);
  expected_fingerprint := encode(
    extensions.digest(impact_payload::text, 'sha256'), 'hex'
  );
  if p_impact_fingerprint <> expected_fingerprint then
    raise exception 'content archive impact confirmation is stale'
      using errcode = '40001';
  end if;

  update public.content_versions content_version
  set state = 'archived',
      archived_by = v_actor_id,
      archived_at = statement_timestamp(),
      archive_reason = p_reason,
      archive_impact_fingerprint = p_impact_fingerprint
  where content_version.id = p_content_version_id
    and content_version.row_version = p_expected_version
    and content_version.state = 'published'
  returning content_version.* into version_row;
  if version_row.id is null then
    raise exception 'content version became stale' using errcode = '40001';
  end if;

  update public.courses course_row
  set state = 'inactive'
  where course_row.id = version_row.course_id
    and not exists (
      select 1 from public.content_versions remaining_version
      where remaining_version.course_id = course_row.id
        and remaining_version.state = 'published'
    )
    and course_row.state = 'active';

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    v_organization_id, v_actor_id, 'content_publisher', 'content.version_archived',
    'content_version', version_row.id, version_row.row_version,
    p_correlation_id,
    jsonb_build_object(
      'reason', p_reason,
      'impact_fingerprint', p_impact_fingerprint,
      'impact', impact_payload
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    v_organization_id, 'content_version', version_row.id, version_row.row_version,
    'content.version_archived.v1', 1, p_correlation_id,
    jsonb_build_object(
      'content_version_id', version_row.id,
      'course_id', version_row.course_id,
      'version_number', version_row.version_number,
      'impact_fingerprint', p_impact_fingerprint
    )
  );

  insert into public.content_workflow_receipts (
    actor_id, operation, content_version_id, idempotency_key, payload_hash,
    result_state, result_row_version, correlation_id
  ) values (
    v_actor_id, 'archive', version_row.id, p_idempotency_key, payload_hash,
    version_row.state, version_row.row_version, p_correlation_id
  );

  return version_row;
end;
$$;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.submit_content_for_review(uuid,bigint,text,uuid)',
    'public.decide_content_review(uuid,bigint,text,text,text,uuid)',
    'public.publish_content_version(uuid,bigint,text,uuid)',
    'public.archive_content_version(uuid,bigint,text,text,text,uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', function_signature);
    execute format('grant execute on function %s to authenticated, service_role', function_signature);
  end loop;
end $$;
