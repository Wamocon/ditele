begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
set search_path = public, extensions;
select no_plan();

-- BUG-068..BUG-077 and BUG-096 structural contracts: exact publication
-- identities, qualified trainer policies, immutable published graphs, and one
-- sorted mastery lock protocol.
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid =
        'public.task_rubric_assignments'::pg_catalog.regclass
      and constraint_record.conname =
        'task_rubric_assignments_task_version_fk'
      and constraint_record.contype = 'f'
      and constraint_record.convalidated
      and pg_catalog.pg_get_constraintdef(constraint_record.oid) =
        'FOREIGN KEY (task_id, content_version_id) REFERENCES tasks(id, content_version_id) ON DELETE CASCADE'
  ),
  'rubric assignments have a validated composite task-publication foreign key'
);

select ok(
  (
    select policy_record.qual like
      '%cohort_record.course_id = content_versions.course_id%'
      and policy_record.qual like
        '%cohort_record.content_version_id = content_versions.id%'
      and policy_record.qual like '%cohort_record.state = ''active''%'
      and policy_record.qual like '%can_train_cohort(cohort_record.id)%'
    from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'content_versions'
      and policy_record.policyname =
        'content_versions_pinned_active_trainer_read'
  ),
  'content-version trainer policy requires an exact active cohort pin'
);

select ok(
  (
    select policy_record.qual like
      '%cohort_record.course_id = stages.course_id%'
      and policy_record.qual like
        '%cohort_record.content_version_id = stages.content_version_id%'
    from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'stages'
      and policy_record.policyname = 'stages_pinned_trainer_read'
  )
  and (
    select policy_record.qual like
      '%cohort_record.course_id = tasks.course_id%'
      and policy_record.qual like
        '%cohort_record.content_version_id = tasks.content_version_id%'
    from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'tasks'
      and policy_record.policyname = 'tasks_pinned_trainer_read'
  ),
  'stage and task trainer policies qualify both exact outer publication keys'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.policyname in (
        'courses_member_read', 'course_localizations_member_read'
      )
  )
  and exists (
    select 1
    from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'courses'
      and policy_record.policyname = 'courses_pinned_trainer_read'
  )
  and exists (
    select 1
    from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'course_localizations'
      and policy_record.policyname =
        'course_localizations_pinned_trainer_read'
  ),
  'broad member metadata reads are replaced by exact trainer pin policies'
);

select ok(
  (
    select policy_record.qual like
      '%cohort_record.content_version_id = task_record.content_version_id%'
      and policy_record.qual not like '%task_schedules%'
    from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'task_option_answers'
      and policy_record.policyname = 'task_option_answers_reviewer_read'
  )
  and (
    select policy_record.qual like
      '%cohort_record.content_version_id = task_record.content_version_id%'
      and policy_record.qual not like '%task_schedules%'
    from pg_catalog.pg_policies policy_record
    where policy_record.schemaname = 'public'
      and policy_record.tablename = 'task_model_answers'
      and policy_record.policyname = 'task_model_answers_reviewer_read'
  ),
  'solution access uses an exact trainable publication without a schedule dependency'
);

select ok(
  position(
    'auth.uid() is null' in lower(pg_catalog.pg_get_functiondef(
      'app_private.guard_immutable_content_graph()'::pg_catalog.regprocedure
    ))
  ) = 0
  and position(
    'auth.uid() is null' in lower(pg_catalog.pg_get_functiondef(
      'app_private.guard_published_rubric_definition()'::pg_catalog.regprocedure
    ))
  ) = 0,
  'published graph and rubric guards contain no auth-null mutation bypass'
);

select ok(
  (
    select count(*) = 2
    from pg_catalog.pg_trigger trigger_record
    where trigger_record.tgname in (
      'mastery_events_serialize_identity',
      'mastery_snapshots_serialize_identity'
    )
      and not trigger_record.tgisinternal
      and trigger_record.tgfoid =
        'app_private.serialize_mastery_identity()'::pg_catalog.regprocedure
  )
  and pg_catalog.pg_get_functiondef(
    'app_private.serialize_mastery_identity()'::pg_catalog.regprocedure
  ) like '%pg_advisory_xact_lock%mastery:%',
  'events and snapshots share one tenant-learner-skill advisory lock identity'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'app_private.decide_submission_effects_unowned(uuid,uuid,bigint,public.review_decision,text,jsonb,text,uuid)'::pg_catalog.regprocedure
  ) ~ '(?s)select distinct criterion.skill_id.*order by criterion.skill_id.*pg_advisory_xact_lock.*group by criterion.skill_id[[:space:]]+order by criterion.skill_id.*for update;',
  'accepted multi-skill reviews prelock sorted identities and lock snapshots in the same order'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'app_private.validate_mastery_scope()'::pg_catalog.regprocedure
  ) like '%event_record.new_basis_points =%mastery_basis_points%'
  and pg_catalog.pg_get_functiondef(
    'app_private.validate_mastery_scope()'::pg_catalog.regprocedure
  ) like '%event_record.rule_version = new.rule_version%',
  'mastery snapshot validation binds source identity, score, and rule version'
);

select ok(
  pg_catalog.pg_get_functiondef(
    'app_private.guard_published_rubric_definition()'::pg_catalog.regprocedure
  ) ~ '(?s)for locked_version_id in.*order by version_record.id.*for share.*version_record.state in \(''published'', ''archived''\)',
  'rubric mutations lock every affected publication in canonical order before state evaluation'
);

-- Exercise the same aborting preflight used by the migration against corrupt
-- legacy rows. All corruption lives in one external rollback-only transaction;
-- replication-role bypass is scoped to that transaction and never weakens the
-- installed constraints in the test database.
select extensions.dblink_connect(
  'integrity_preflight',
  'host=supabase_db_ditele-v2 port=5432 dbname=postgres user=supabase_admin password=postgres'
);

select is(
  extensions.dblink_exec(
    'integrity_preflight',
    $preflight_setup$
      begin;
      set local session_replication_role = replica;
      create or replace function pg_temp.capture_content_preflight()
      returns text
      language plpgsql
      set search_path = ''
      as $capture$
      begin
        perform app_private.assert_content_integrity_preflight();
        return 'OK';
      exception
        when others then
          return sqlstate || ':' || sqlerrm;
      end;
      $capture$;
    $preflight_setup$
  ),
  'CREATE FUNCTION'::text,
  'rollback-only preflight session installs an exception capture boundary'
);

select is(
  extensions.dblink_exec(
    'integrity_preflight',
    $bad_assignment$
      insert into public.task_rubric_assignments (
        id, organization_id, task_id, content_version_id, rubric_id,
        created_by
      ) values (
        '0198102d-0000-7000-8000-000000000901',
        '01980a10-0000-7000-8000-000000000001',
        '01980a26-0000-7000-8000-000000000001',
        '01980a22-0000-7000-8000-000000000002',
        '01980a2b-0000-7000-8000-000000000001',
        '01980a00-0000-7000-8000-000000000003'
      )
    $bad_assignment$
  ),
  'INSERT 0 1'::text,
  'rollback-only fixture can represent a legacy assignment with a false publication pin'
);

select is(
  (
    select result_record.outcome
    from extensions.dblink(
      'integrity_preflight',
      'select pg_temp.capture_content_preflight()'
    ) as result_record(outcome text)
  ),
  '23514:preflight: 1 task rubric assignments have no exact task publication',
  'migration preflight aborts on an inexact rubric assignment publication'
);

select is(
  extensions.dblink_exec(
    'integrity_preflight',
    $cleanup_bad_assignment$
      delete from public.task_rubric_assignments
      where id = '0198102d-0000-7000-8000-000000000901'
    $cleanup_bad_assignment$
  ),
  'DELETE 1'::text,
  'rollback-only assignment corruption is isolated before the next probe'
);

select is(
  extensions.dblink_exec(
    'integrity_preflight',
    $bad_question$
      insert into public.questions (
        id, organization_id, learner_id, cohort_id, task_id,
        assigned_trainer_id, state, subject, idempotency_key,
        content_version_id
      ) values (
        '01981040-0000-7000-8000-000000000901',
        '01980a10-0000-7000-8000-000000000001',
        '01980a00-0000-7000-8000-000000000001',
        '01980a30-0000-7000-8000-000000000001',
        '01980a26-0000-7000-8000-000000000001', null,
        'open', 'Legacy inexact publication question',
        'integrity-preflight-question-0901',
        '01980a22-0000-7000-8000-000000000002'
      )
    $bad_question$
  ),
  'INSERT 0 1'::text,
  'rollback-only fixture can represent a legacy question with a false publication pin'
);

select is(
  (
    select result_record.outcome
    from extensions.dblink(
      'integrity_preflight',
      'select pg_temp.capture_content_preflight()'
    ) as result_record(outcome text)
  ),
  '23514:preflight: 1 questions have an ambiguous cohort/task publication pin',
  'migration preflight aborts on an ambiguous question publication'
);

select is(
  extensions.dblink_exec(
    'integrity_preflight',
    $cleanup_bad_question$
      delete from public.questions
      where id = '01981040-0000-7000-8000-000000000901'
    $cleanup_bad_question$
  ),
  'DELETE 1'::text,
  'rollback-only question corruption is isolated before the next probe'
);

select is(
  extensions.dblink_exec(
    'integrity_preflight',
    $bad_mastery_event$
      insert into public.mastery_events (
        id, organization_id, learner_id, skill_id,
        previous_basis_points, new_basis_points, rule_version,
        rationale, source_event_id
      ) values (
        '0198102e-0000-7000-8000-000000000901',
        '01980a10-0000-7000-8000-000000000001',
        '01980a00-0000-7000-8000-000000000003',
        '0198102a-0000-7000-8000-000000000901',
        0, 1000, 1, 'Legacy missing skill reference',
        '01981053-0000-7000-8000-000000000901'
      )
    $bad_mastery_event$
  ),
  'INSERT 0 1'::text,
  'rollback-only fixture can represent a legacy mastery event with a missing skill'
);

select is(
  (
    select result_record.outcome
    from extensions.dblink(
      'integrity_preflight',
      'select pg_temp.capture_content_preflight()'
    ) as result_record(outcome text)
  ),
  '23514:preflight: 1 mastery events have incompatible skill or evidence scope',
  'migration preflight aborts on incompatible mastery-event scope'
);

select is(
  extensions.dblink_exec(
    'integrity_preflight',
    $cleanup_bad_mastery_event$
      delete from public.mastery_events
      where id = '0198102e-0000-7000-8000-000000000901'
    $cleanup_bad_mastery_event$
  ),
  'DELETE 1'::text,
  'rollback-only mastery-event corruption is isolated before the next probe'
);

select is(
  extensions.dblink_exec(
    'integrity_preflight',
    $bad_mastery_snapshot$
      insert into public.mastery_events (
        id, organization_id, learner_id, skill_id,
        previous_basis_points, new_basis_points, rule_version,
        rationale, source_event_id
      ) values (
        '0198102e-0000-7000-8000-000000000902',
        '01980a10-0000-7000-8000-000000000001',
        '01980a00-0000-7000-8000-000000000003',
        '01980a2a-0000-7000-8000-000000000001',
        0, 5000, 1, 'Legacy snapshot source fixture',
        '01981053-0000-7000-8000-000000000902'
      );
      insert into public.mastery_snapshots (
        organization_id, learner_id, skill_id, mastery_basis_points,
        source_event_id, rule_version
      ) values (
        '01980a10-0000-7000-8000-000000000001',
        '01980a00-0000-7000-8000-000000000003',
        '01980a2a-0000-7000-8000-000000000001', 4999,
        '0198102e-0000-7000-8000-000000000902', 1
      )
    $bad_mastery_snapshot$
  ),
  'INSERT 0 1'::text,
  'rollback-only fixture can represent a snapshot drifting from its source event'
);

select is(
  (
    select result_record.outcome
    from extensions.dblink(
      'integrity_preflight',
      'select pg_temp.capture_content_preflight()'
    ) as result_record(outcome text)
  ),
  '23514:preflight: 1 mastery snapshots disagree with their exact source event',
  'migration preflight aborts on a mastery snapshot score mismatch'
);

select is(
  extensions.dblink_exec(
    'integrity_preflight',
    $cleanup_bad_mastery_snapshot$
      delete from public.mastery_snapshots
      where source_event_id = '0198102e-0000-7000-8000-000000000902';
      delete from public.mastery_events
      where id = '0198102e-0000-7000-8000-000000000902'
    $cleanup_bad_mastery_snapshot$
  ),
  'DELETE 1'::text,
  'rollback-only mastery-snapshot corruption is isolated before the clean probe'
);

select is(
  (
    select result_record.outcome
    from extensions.dblink(
      'integrity_preflight',
      'select pg_temp.capture_content_preflight()'
    ) as result_record(outcome text)
  ),
  'OK'::text,
  'migration preflight accepts the clean graph after each corruption is removed'
);

select is(
  extensions.dblink_exec('integrity_preflight', 'rollback'),
  'ROLLBACK'::text,
  'all deliberately corrupt legacy rows are rolled back together'
);

select is(
  extensions.dblink_disconnect('integrity_preflight'),
  'OK'::text,
  'rollback-only preflight session disconnects cleanly'
);

select ok(
  not exists (
    select 1 from public.task_rubric_assignments
    where id = '0198102d-0000-7000-8000-000000000901'
  )
  and not exists (
    select 1 from public.questions
    where id = '01981040-0000-7000-8000-000000000901'
  )
  and not exists (
    select 1 from public.mastery_events
    where id in (
      '0198102e-0000-7000-8000-000000000901',
      '0198102e-0000-7000-8000-000000000902'
    )
  ),
  'preflight probes leave no corrupt rows outside their rollback boundary'
);

-- Trainer-scope fixtures include a global draft, an unassigned same-tenant
-- publication, an assigned cross-tenant publication, and one schedule-free
-- flexible publication the seeded trainer owns exactly.
insert into public.organizations (id, slug, name, state)
values (
  '01981010-0000-7000-8000-000000000002',
  'integrity-other-tenant', 'Integrity Other Tenant', 'active'
);

insert into public.courses (
  id, organization_id, slug, state, default_locale, created_by
)
values
  (
    '01981020-0000-7000-8000-000000000010', null,
    'integrity-global-draft', 'draft', 'en',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981020-0000-7000-8000-000000000011',
    '01980a10-0000-7000-8000-000000000001',
    'integrity-main-draft', 'draft', 'en',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981020-0000-7000-8000-000000000012',
    '01981010-0000-7000-8000-000000000002',
    'integrity-other-draft', 'draft', 'en',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981020-0000-7000-8000-000000000020',
    '01980a10-0000-7000-8000-000000000001',
    'integrity-flexible-review', 'active', 'en',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.course_localizations (
  id, course_id, locale, title, summary, description_html
)
values
  (
    '01981021-0000-7000-8000-000000000010',
    '01981020-0000-7000-8000-000000000010', 'en',
    'Global draft', 'Hidden global draft', '<p>Hidden</p>'
  ),
  (
    '01981021-0000-7000-8000-000000000011',
    '01981020-0000-7000-8000-000000000011', 'en',
    'Main draft', 'Hidden tenant draft', '<p>Hidden</p>'
  ),
  (
    '01981021-0000-7000-8000-000000000012',
    '01981020-0000-7000-8000-000000000012', 'en',
    'Other draft', 'Hidden cross-tenant draft', '<p>Hidden</p>'
  ),
  (
    '01981021-0000-7000-8000-000000000020',
    '01981020-0000-7000-8000-000000000020', 'en',
    'Flexible review', 'Exact flexible trainer pin', '<p>Exact</p>'
  );

insert into public.content_versions (
  id, course_id, version_number, state, snapshot, created_by
)
values
  (
    '01981022-0000-7000-8000-000000000010',
    '01981020-0000-7000-8000-000000000010', 1, 'draft', '{}',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981022-0000-7000-8000-000000000011',
    '01981020-0000-7000-8000-000000000011', 1, 'draft', '{}',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981022-0000-7000-8000-000000000012',
    '01981020-0000-7000-8000-000000000012', 1, 'draft', '{}',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981022-0000-7000-8000-000000000020',
    '01981020-0000-7000-8000-000000000020', 1, 'draft', '{}',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.stages (
  id, course_id, content_version_id, position, state
)
values
  (
    '01981023-0000-7000-8000-000000000010',
    '01981020-0000-7000-8000-000000000010',
    '01981022-0000-7000-8000-000000000010', 0, 'draft'
  ),
  (
    '01981023-0000-7000-8000-000000000011',
    '01981020-0000-7000-8000-000000000011',
    '01981022-0000-7000-8000-000000000011', 0, 'draft'
  ),
  (
    '01981023-0000-7000-8000-000000000012',
    '01981020-0000-7000-8000-000000000012',
    '01981022-0000-7000-8000-000000000012', 0, 'draft'
  ),
  (
    '01981023-0000-7000-8000-000000000020',
    '01981020-0000-7000-8000-000000000020',
    '01981022-0000-7000-8000-000000000020', 0, 'active'
  );

insert into public.tasks (
  id, course_id, stage_id, content_version_id, position, task_kind,
  state, expected_minutes
)
values
  (
    '01981026-0000-7000-8000-000000000010',
    '01981020-0000-7000-8000-000000000010',
    '01981023-0000-7000-8000-000000000010',
    '01981022-0000-7000-8000-000000000010', 0, 'knowledge',
    'draft', 10
  ),
  (
    '01981026-0000-7000-8000-000000000011',
    '01981020-0000-7000-8000-000000000011',
    '01981023-0000-7000-8000-000000000011',
    '01981022-0000-7000-8000-000000000011', 0, 'knowledge',
    'draft', 10
  ),
  (
    '01981026-0000-7000-8000-000000000012',
    '01981020-0000-7000-8000-000000000012',
    '01981023-0000-7000-8000-000000000012',
    '01981022-0000-7000-8000-000000000012', 0, 'knowledge',
    'draft', 10
  ),
  (
    '01981026-0000-7000-8000-000000000020',
    '01981020-0000-7000-8000-000000000020',
    '01981023-0000-7000-8000-000000000020',
    '01981022-0000-7000-8000-000000000020', 0, 'knowledge',
    'active', 10
  );

insert into public.task_localizations (
  id, task_id, locale, title, instructions_html
)
values
  (
    '01981027-0000-7000-8000-000000000011',
    '01981026-0000-7000-8000-000000000011', 'en',
    'Hidden tenant task', '<p>Hidden</p>'
  ),
  (
    '01981027-0000-7000-8000-000000000012',
    '01981026-0000-7000-8000-000000000012', 'en',
    'Cross-tenant task', '<p>Cross-tenant</p>'
  ),
  (
    '01981027-0000-7000-8000-000000000020',
    '01981026-0000-7000-8000-000000000020', 'en',
    'Flexible exact task', '<p>Review this task</p>'
  );

insert into public.task_options (
  id, task_id, option_key, labels, position
)
values
  (
    '01981028-0000-7000-8000-000000000011',
    '01981026-0000-7000-8000-000000000011',
    'hidden', '{"en":"Hidden answer"}', 0
  ),
  (
    '01981028-0000-7000-8000-000000000020',
    '01981026-0000-7000-8000-000000000020',
    'exact', '{"en":"Exact answer"}', 0
  );

insert into public.task_option_answers (
  task_option_id, is_correct, updated_by
)
values
  (
    '01981028-0000-7000-8000-000000000011', true,
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981028-0000-7000-8000-000000000020', true,
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.task_model_answers (
  task_localization_id, model_answer, updated_by
)
values
  (
    '01981027-0000-7000-8000-000000000011',
    'Hidden tenant model answer',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981027-0000-7000-8000-000000000020',
    'Flexible exact model answer',
    '01980a00-0000-7000-8000-000000000003'
  );

-- Two otherwise valid active publications prove that a tenant role alone is
-- insufficient: one cohort has no trainer assignment and the other is owned
-- by a tenant in which the assigned trainer has no active principal.
update public.courses
set state = 'active'
where id in (
  '01981020-0000-7000-8000-000000000011',
  '01981020-0000-7000-8000-000000000012'
);

update public.stages
set state = 'active'
where id in (
  '01981023-0000-7000-8000-000000000011',
  '01981023-0000-7000-8000-000000000012'
);

update public.tasks
set state = 'active'
where id in (
  '01981026-0000-7000-8000-000000000011',
  '01981026-0000-7000-8000-000000000012'
);

update public.content_versions
set state = 'in_review'
where id in (
  '01981022-0000-7000-8000-000000000011',
  '01981022-0000-7000-8000-000000000012'
);

update public.content_versions
set state = 'published',
    published_by = '01980a00-0000-7000-8000-000000000003',
    published_at = statement_timestamp()
where id in (
  '01981022-0000-7000-8000-000000000011',
  '01981022-0000-7000-8000-000000000012'
);

update public.content_versions
set state = 'in_review'
where id = '01981022-0000-7000-8000-000000000020';

update public.content_versions
set state = 'published',
    published_by = '01980a00-0000-7000-8000-000000000003',
    published_at = statement_timestamp()
where id = '01981022-0000-7000-8000-000000000020';

insert into public.cohorts (
  id, organization_id, course_id, content_version_id, name, state,
  progression_mode, starts_at, created_by
)
values
  (
    '01981030-0000-7000-8000-000000000011',
    '01980a10-0000-7000-8000-000000000001',
    '01981020-0000-7000-8000-000000000011',
    '01981022-0000-7000-8000-000000000011',
    'Unassigned Active Trainer Scope', 'active', 'flexible',
    statement_timestamp() - interval '1 day',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981030-0000-7000-8000-000000000012',
    '01981010-0000-7000-8000-000000000002',
    '01981020-0000-7000-8000-000000000012',
    '01981022-0000-7000-8000-000000000012',
    'Cross-Tenant Active Trainer Scope', 'active', 'flexible',
    statement_timestamp() - interval '1 day',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981030-0000-7000-8000-000000000020',
    '01980a10-0000-7000-8000-000000000001',
    '01981020-0000-7000-8000-000000000020',
    '01981022-0000-7000-8000-000000000020',
    'Flexible Exact Trainer Pin', 'active', 'flexible',
    statement_timestamp() - interval '1 day',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.cohort_memberships (
  id, cohort_id, user_id, role, state, assigned_by
)
values (
  '01981031-0000-7000-8000-000000000020',
  '01981030-0000-7000-8000-000000000020',
  '01980a00-0000-7000-8000-000000000002',
  'trainer', 'active',
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.cohort_memberships (
  id, cohort_id, user_id, role, state, assigned_by
)
values (
  '01981031-0000-7000-8000-000000000012',
  '01981030-0000-7000-8000-000000000012',
  '01980a00-0000-7000-8000-000000000002',
  'trainer', 'active',
  '01980a00-0000-7000-8000-000000000003'
);

select is(
  (
    select count(*)::bigint
    from public.task_schedules schedule_record
    where schedule_record.cohort_id =
      '01981030-0000-7000-8000-000000000020'
  ),
  0::bigint,
  'the flexible trainer fixture intentionally has no task schedule'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select count(*)::bigint
    from public.stages stage_record
    where stage_record.id in (
      '01980a23-0000-7000-8000-000000000001',
      '01981023-0000-7000-8000-000000000020'
    )
  ),
  2::bigint,
  'trainer reads stages from both exact scheduled and flexible publication pins'
);

select is(
  (
    select count(*)::bigint
    from public.tasks task_record
    where task_record.id in (
      '01980a26-0000-7000-8000-000000000001',
      '01981026-0000-7000-8000-000000000020'
    )
  ),
  2::bigint,
  'trainer reads tasks from both exact scheduled and flexible publication pins'
);

select is(
  (
    select count(*)::bigint
    from public.content_versions version_record
    where version_record.id =
      '01981022-0000-7000-8000-000000000020'
  ),
  1::bigint,
  'active trainer reads the exact active cohort content-version pin'
);

select is(
  (
    select concat_ws(':',
      (select count(*) from public.content_versions
       where id = '01981022-0000-7000-8000-000000000011'),
      (select count(*) from public.content_versions
       where id = '01981022-0000-7000-8000-000000000012'),
      (select count(*) from public.content_versions
       where id = '01981022-0000-7000-8000-000000000010')
    )
  ),
  '0:0:0',
  'trainer cannot read an unassigned, cross-tenant, or unrelated version'
);

select is(
  (
    select count(*)::bigint
    from public.stages stage_record
    where stage_record.id in (
      '01981023-0000-7000-8000-000000000010',
      '01981023-0000-7000-8000-000000000011',
      '01981023-0000-7000-8000-000000000012'
    )
  ),
  0::bigint,
  'trainer cannot browse global, same-tenant, or cross-tenant unpinned stages'
);

select is(
  (
    select count(*)::bigint
    from public.tasks task_record
    where task_record.id in (
      '01981026-0000-7000-8000-000000000010',
      '01981026-0000-7000-8000-000000000011',
      '01981026-0000-7000-8000-000000000012'
    )
  ),
  0::bigint,
  'trainer cannot browse global, same-tenant, or cross-tenant unpinned tasks'
);

select is(
  (
    select count(*)::bigint
    from public.courses course_record
    where course_record.id in (
      '01981020-0000-7000-8000-000000000010',
      '01981020-0000-7000-8000-000000000011',
      '01981020-0000-7000-8000-000000000012'
    )
  ),
  0::bigint,
  'trainer raw course reads exclude every unpinned scope'
);

select is(
  (
    select count(*)::bigint
    from public.course_localizations localization_record
    where localization_record.course_id in (
      '01981020-0000-7000-8000-000000000010',
      '01981020-0000-7000-8000-000000000011',
      '01981020-0000-7000-8000-000000000012'
    )
  ),
  0::bigint,
  'trainer raw localization reads exclude every unpinned scope'
);

select is(
  (
    select concat_ws(':',
      (select count(*) from public.courses
       where id = '01981020-0000-7000-8000-000000000020'),
      (select count(*) from public.course_localizations
       where course_id = '01981020-0000-7000-8000-000000000020'),
      (select count(*) from public.task_option_answers
       where task_option_id = '01981028-0000-7000-8000-000000000020'),
      (select count(*) from public.task_model_answers
       where task_localization_id =
         '01981027-0000-7000-8000-000000000020')
    )
  ),
  '1:1:1:1',
  'exact flexible trainer pin grants metadata and both solution families'
);

select is(
  (
    select concat_ws(':',
      (select count(*) from public.task_option_answers
       where task_option_id = '01981028-0000-7000-8000-000000000011'),
      (select count(*) from public.task_model_answers
       where task_localization_id =
         '01981027-0000-7000-8000-000000000011')
    )
  ),
  '0:0',
  'trainer cannot read same-tenant unpinned assessment solutions'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select is(
  (
    select count(*)::bigint
    from public.content_versions version_record
    where version_record.id =
      '01981022-0000-7000-8000-000000000020'
  ),
  0::bigint,
  'learner membership never grants raw content-version access'
);

reset role;

update public.cohort_memberships
set state = 'suspended'
where id = '01981031-0000-7000-8000-000000000020';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select count(*)::bigint
    from public.content_versions version_record
    where version_record.id =
      '01981022-0000-7000-8000-000000000020'
  ),
  0::bigint,
  'suspended trainer membership revokes the pinned content version'
);

reset role;

update public.cohort_memberships
set state = 'removed', removed_at = statement_timestamp()
where id = '01981031-0000-7000-8000-000000000020';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select count(*)::bigint
    from public.content_versions version_record
    where version_record.id =
      '01981022-0000-7000-8000-000000000020'
  ),
  0::bigint,
  'removed trainer membership revokes the pinned content version'
);

reset role;

update public.cohort_memberships
set state = 'active', removed_at = null
where id = '01981031-0000-7000-8000-000000000020';

update public.cohorts
set state = 'cancelled'
where id = '01981030-0000-7000-8000-000000000020';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000002', true
);

select is(
  (
    select count(*)::bigint
    from public.content_versions version_record
    where version_record.id =
      '01981022-0000-7000-8000-000000000020'
  ),
  0::bigint,
  'cancelled cohort revokes its formerly pinned content version'
);

reset role;

-- Practical content is not reviewable until a complete mapping and one active,
-- non-empty, compatible rubric are available for every practical task.
insert into public.courses (
  id, organization_id, slug, state, default_locale, created_by
)
values (
  '01981020-0000-7000-8000-000000000030',
  '01980a10-0000-7000-8000-000000000001',
  'integrity-rubric-readiness', 'draft', 'en',
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.content_versions (
  id, course_id, version_number, state, created_by
)
values
  (
    '01981022-0000-7000-8000-000000000030',
    '01981020-0000-7000-8000-000000000030', 1, 'draft',
    '01980a00-0000-7000-8000-000000000003'
  ),
  (
    '01981022-0000-7000-8000-000000000031',
    '01981020-0000-7000-8000-000000000030', 2, 'draft',
    '01980a00-0000-7000-8000-000000000003'
  );

insert into public.stages (
  id, course_id, content_version_id, position, state
)
values (
  '01981023-0000-7000-8000-000000000030',
  '01981020-0000-7000-8000-000000000030',
  '01981022-0000-7000-8000-000000000030', 0, 'draft'
);

insert into public.tasks (
  id, course_id, stage_id, content_version_id, position, task_kind,
  state, expected_minutes
)
values (
  '01981026-0000-7000-8000-000000000030',
  '01981020-0000-7000-8000-000000000030',
  '01981023-0000-7000-8000-000000000030',
  '01981022-0000-7000-8000-000000000030', 0, 'practical',
  'draft', 20
);

insert into public.task_skill_mappings (
  id, task_id, skill_id, mapping_version, weight_basis_points,
  evidence_required
)
values (
  '0198102e-0000-7000-8000-000000000030',
  '01981026-0000-7000-8000-000000000030',
  '01980a2a-0000-7000-8000-000000000001', 1, 10000, true
);

select throws_ok(
  $$
    select app_private.assert_competency_graph_ready(
      '01981022-0000-7000-8000-000000000030'
    )
  $$,
  '23514',
  'every practical task requires an active non-empty review rubric',
  'practical publication readiness rejects a missing rubric assignment'
);

insert into public.rubrics (
  id, organization_id, code, labels, version, state, created_by
)
values (
  '0198102b-0000-7000-8000-000000000030', null,
  'integrity-empty-then-ready', '{"en":"Integrity rubric"}',
  1, 'active', '01980a00-0000-7000-8000-000000000003'
);

insert into public.task_rubric_assignments (
  id, organization_id, task_id, content_version_id, rubric_id, created_by
)
values (
  '0198102d-0000-7000-8000-000000000030',
  '01980a10-0000-7000-8000-000000000001',
  '01981026-0000-7000-8000-000000000030',
  '01981022-0000-7000-8000-000000000030',
  '0198102b-0000-7000-8000-000000000030',
  '01980a00-0000-7000-8000-000000000003'
);

select throws_ok(
  $$
    select app_private.assert_competency_graph_ready(
      '01981022-0000-7000-8000-000000000030'
    )
  $$,
  '23514',
  'every practical task requires an active non-empty review rubric',
  'practical publication readiness rejects an empty active rubric'
);

insert into public.rubric_criteria (
  id, rubric_id, skill_id, code, labels, position, max_points,
  required_for_acceptance
)
values (
  '0198102c-0000-7000-8000-000000000030',
  '0198102b-0000-7000-8000-000000000030',
  '01980a2a-0000-7000-8000-000000000001',
  'complete', '{"en":"Complete"}', 0, 10, true
);

select lives_ok(
  $$
    select app_private.assert_competency_graph_ready(
      '01981022-0000-7000-8000-000000000030'
    )
  $$,
  'practical publication readiness accepts the complete review contract'
);

select throws_ok(
  $$
    insert into public.task_rubric_assignments (
      id, organization_id, task_id, content_version_id, rubric_id, created_by
    ) values (
      '0198102d-0000-7000-8000-000000000031',
      '01980a10-0000-7000-8000-000000000001',
      '01981026-0000-7000-8000-000000000030',
      '01981022-0000-7000-8000-000000000031',
      '0198102b-0000-7000-8000-000000000030',
      '01980a00-0000-7000-8000-000000000003'
    )
  $$,
  '23514',
  'rubric assignment task and content version do not match',
  'runtime assignment validation rejects a cross-publication task identity'
);

-- Trusted auth-null sessions are no longer a content-fixture escape hatch.
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$
    insert into public.stages (
      id, course_id, content_version_id, position, state
    ) values (
      '01981023-0000-7000-8000-000000000099',
      '01980a20-0000-7000-8000-000000000001',
      '01980a22-0000-7000-8000-000000000001', 99, 'active'
    )
  $$,
  '55000',
  'published content graph is immutable',
  'auth-null owner cannot append a row to a published content graph'
);

select throws_ok(
  $$
    insert into public.rubric_criteria (
      id, rubric_id, skill_id, code, labels, position, max_points,
      required_for_acceptance
    ) values (
      '0198102c-0000-7000-8000-000000000099',
      '01980a2b-0000-7000-8000-000000000001',
      '01980a2a-0000-7000-8000-000000000001',
      'auth-null-late', '{"en":"Forbidden late criterion"}',
      99, 10, false
    )
  $$,
  '55000',
  'published rubric definitions are immutable',
  'auth-null owner cannot append a criterion used by a publication'
);

-- Missing prerequisite data is the one legacy-compatible case. Every explicit
-- malformed boundary fails closed, while valid 0 and 10000-scale thresholds
-- retain their documented semantics.
insert into public.content_versions (
  id, course_id, version_number, state, snapshot, created_by
)
values (
  '01981022-0000-7000-8000-000000000090',
  '01980a20-0000-7000-8000-000000000001', 90, 'draft', '{}',
  '01980a00-0000-7000-8000-000000000003'
);

insert into public.stages (
  id, course_id, content_version_id, position, state
)
values (
  '01981023-0000-7000-8000-000000000090',
  '01980a20-0000-7000-8000-000000000001',
  '01981022-0000-7000-8000-000000000090', 0, 'draft'
);

insert into public.tasks (
  id, course_id, stage_id, content_version_id, position, task_kind,
  state, expected_minutes
)
values
  (
    '01981026-0000-7000-8000-000000000090',
    '01980a20-0000-7000-8000-000000000001',
    '01981023-0000-7000-8000-000000000090',
    '01981022-0000-7000-8000-000000000090', 0, 'practical',
    'draft', 10
  ),
  (
    '01981026-0000-7000-8000-000000000091',
    '01980a20-0000-7000-8000-000000000001',
    '01981023-0000-7000-8000-000000000090',
    '01981022-0000-7000-8000-000000000090', 1, 'practical',
    'draft', 10
  );

insert into public.prerequisites (
  id, organization_id, target_task_id, required_skill_id,
  minimum_mastery_basis_points, rule_version
)
values
  (
    '01981029-0000-7000-8000-000000000090', null,
    '01981026-0000-7000-8000-000000000090',
    '01980a2a-0000-7000-8000-000000000001', 0, 1
  ),
  (
    '01981029-0000-7000-8000-000000000091', null,
    '01981026-0000-7000-8000-000000000091',
    '01980a2a-0000-7000-8000-000000000001', 1, 1
  );

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

create function pg_temp.seed_task_lock_reasons(p_task_payload jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select app_private.learner_snapshot_task_lock_reasons(
    '01980a33-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    '01980a30-0000-7000-8000-000000000001',
    'scheduled',
    '01980a22-0000-7000-8000-000000000001',
    (
      select version_record.snapshot
      from public.content_versions version_record
      where version_record.id =
        '01980a22-0000-7000-8000-000000000001'
    ),
    p_task_payload
  );
$$;

create function pg_temp.seed_skill_task_lock_reasons(
  p_task_id uuid,
  p_prerequisite_id uuid,
  p_minimum_mastery integer
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select app_private.learner_snapshot_task_lock_reasons(
    '01980a33-0000-7000-8000-000000000001',
    '01980a10-0000-7000-8000-000000000001',
    '01980a30-0000-7000-8000-000000000001',
    'flexible',
    '01981022-0000-7000-8000-000000000090',
    '{}'::jsonb,
    jsonb_build_object(
      'id', p_task_id,
      'prerequisites', jsonb_build_array(jsonb_build_object(
        'id', p_prerequisite_id,
        'rule_version', 1,
        'required_task_id', null,
        'required_skill', (
          select jsonb_build_object(
            'id', skill_record.id,
            'code', skill_record.code,
            'labels', skill_record.labels,
            'taxonomy_version', skill_record.taxonomy_version
          )
          from public.skills skill_record
          where skill_record.id =
            '01980a2a-0000-7000-8000-000000000001'
        ),
        'minimum_mastery_basis_points', p_minimum_mastery
      ))
    )
  );
$$;

select is(
  pg_temp.seed_task_lock_reasons(
    '{"id":"01980a26-0000-7000-8000-000000000001"}'::jsonb
  ),
  '[]'::jsonb,
  'a missing prerequisite key remains the explicit legacy-compatible case'
);

select is(
  pg_temp.seed_task_lock_reasons(
    '{"id":"01980a26-0000-7000-8000-000000000001","prerequisites":null}'::jsonb
  ),
  '[{"code":"configuration"}]'::jsonb,
  'an explicit null prerequisite collection fails closed'
);

select is(
  pg_temp.seed_task_lock_reasons(
    '{"id":"01980a26-0000-7000-8000-000000000001","prerequisites":{}}'::jsonb
  ),
  '[{"code":"configuration"}]'::jsonb,
  'an explicit object prerequisite collection fails closed'
);

select is(
  pg_temp.seed_task_lock_reasons(jsonb_build_object(
    'id', '01980a26-0000-7000-8000-000000000001',
    'prerequisites', jsonb_build_array('malformed')
  )),
  '[{"code":"configuration"}]'::jsonb,
  'a non-object prerequisite element fails closed'
);

select is(
  pg_temp.seed_task_lock_reasons(jsonb_build_object(
    'id', '01980a26-0000-7000-8000-000000000001',
    'prerequisites', jsonb_build_array(jsonb_build_object(
      'required_task_id', 'not-a-uuid',
      'required_skill', null,
      'minimum_mastery_basis_points', null
    ))
  )),
  '[{"code":"configuration"}]'::jsonb,
  'an invalid required-task UUID fails closed'
);

select is(
  pg_temp.seed_task_lock_reasons(jsonb_build_object(
    'id', '01980a26-0000-7000-8000-000000000001',
    'prerequisites', jsonb_build_array(jsonb_build_object(
      'required_task_id', null,
      'required_skill', jsonb_build_object(
        'id', '01980a2a-0000-7000-8000-000000000001'
      ),
      'minimum_mastery_basis_points', null
    ))
  )),
  '[{"code":"configuration"}]'::jsonb,
  'a null skill threshold fails closed'
);

select is(
  pg_temp.seed_task_lock_reasons(jsonb_build_object(
    'id', '01980a26-0000-7000-8000-000000000001',
    'prerequisites', jsonb_build_array(jsonb_build_object(
      'required_task_id', null,
      'required_skill', jsonb_build_object(
        'id', '01980a2a-0000-7000-8000-000000000001'
      ),
      'minimum_mastery_basis_points', 10001
    ))
  )),
  '[{"code":"configuration"}]'::jsonb,
  'a threshold above 10000 fails closed as configuration'
);

select is(
  pg_temp.seed_skill_task_lock_reasons(
    '01981026-0000-7000-8000-000000000090',
    '01981029-0000-7000-8000-000000000090',
    0
  ),
  '[]'::jsonb,
  'a canonical zero threshold is satisfied without a mastery snapshot'
);

select is(
  pg_temp.seed_skill_task_lock_reasons(
    '01981026-0000-7000-8000-000000000091',
    '01981029-0000-7000-8000-000000000091',
    1
  ),
  '[{"code":"required_skill","current_basis_points":0,"minimum_basis_points":1}]'::jsonb,
  'a canonical positive threshold reports the exact unmet mastery boundary'
);

-- Snapshot source facts are immutable invariants, not merely matching IDs.
reset role;
insert into public.mastery_events (
  id, organization_id, learner_id, skill_id, previous_basis_points,
  new_basis_points, rule_version, rationale, source_event_id
)
values (
  '0198102e-0000-7000-8000-000000000040',
  '01980a10-0000-7000-8000-000000000001',
  '01980a00-0000-7000-8000-000000000003',
  '01980a2a-0000-7000-8000-000000000001',
  0, 5000, 1, 'Exact source invariant fixture',
  '01981053-0000-7000-8000-000000000040'
);

select throws_ok(
  $$
    insert into public.mastery_snapshots (
      organization_id, learner_id, skill_id, mastery_basis_points,
      source_event_id, rule_version
    ) values (
      '01980a10-0000-7000-8000-000000000001',
      '01980a00-0000-7000-8000-000000000003',
      '01980a2a-0000-7000-8000-000000000001', 5001,
      '0198102e-0000-7000-8000-000000000040', 1
    )
  $$,
  '23514',
  'mastery snapshot must exactly match its source event score and rule',
  'snapshot insertion rejects a source-event score mismatch'
);

select throws_ok(
  $$
    insert into public.mastery_snapshots (
      organization_id, learner_id, skill_id, mastery_basis_points,
      source_event_id, rule_version
    ) values (
      '01980a10-0000-7000-8000-000000000001',
      '01980a00-0000-7000-8000-000000000003',
      '01980a2a-0000-7000-8000-000000000001', 5000,
      '0198102e-0000-7000-8000-000000000040', 2
    )
  $$,
  '23514',
  'mastery snapshot must exactly match its source event score and rule',
  'snapshot insertion rejects a source-event rule mismatch'
);

select lives_ok(
  $$
    insert into public.mastery_snapshots (
      organization_id, learner_id, skill_id, mastery_basis_points,
      source_event_id, rule_version
    ) values (
      '01980a10-0000-7000-8000-000000000001',
      '01980a00-0000-7000-8000-000000000003',
      '01980a2a-0000-7000-8000-000000000001', 5000,
      '0198102e-0000-7000-8000-000000000040', 1
    )
  $$,
  'snapshot insertion accepts an exact source identity, score, and rule'
);

select throws_ok(
  $$
    update public.mastery_snapshots
    set mastery_basis_points = 4999
    where organization_id = '01980a10-0000-7000-8000-000000000001'
      and learner_id = '01980a00-0000-7000-8000-000000000003'
      and skill_id = '01980a2a-0000-7000-8000-000000000001'
  $$,
  '23514',
  'mastery snapshot must exactly match its source event score and rule',
  'snapshot updates cannot drift away from immutable source facts'
);

-- A committed external fixture lets two independent READ COMMITTED sessions
-- exercise the production review command concurrently. Each review updates the
-- same learner and the same two skills, proving both same-skill serialization
-- and sorted multi-skill deadlock prevention without a mocked lock helper.
select extensions.dblink_connect(
  'integrity_mastery_setup',
  'host=supabase_db_ditele-v2 port=5432 dbname=postgres user=supabase_admin password=postgres'
);

select is(
  extensions.dblink_exec(
    'integrity_mastery_setup',
    $configure_cleanup$
      create or replace function pg_temp.cleanup_integrity_mastery_fixture()
      returns void
      language plpgsql
      set search_path = ''
      as $cleanup_body$
      begin
        perform pg_catalog.set_config(
          'session_replication_role', 'replica', true
        );

        delete from public.notifications notification_record
        where notification_record.deduplication_key in (
          'review:01981036-0000-7000-8000-000000000101',
          'review:01981036-0000-7000-8000-000000000102'
        );

        delete from public.audit_events audit_record
        where audit_record.aggregate_id in (
          '01981035-0000-7000-8000-000000000101',
          '01981035-0000-7000-8000-000000000102'
        );

        delete from public.outbox_events outbox_record
        where outbox_record.aggregate_id in (
          '01981035-0000-7000-8000-000000000101',
          '01981035-0000-7000-8000-000000000102'
        );

        delete from public.mastery_snapshots snapshot_record
        where snapshot_record.source_event_id in (
          select event_record.id
          from public.mastery_events event_record
          where event_record.evidence_id in (
            select evidence_record.id
            from public.evidence evidence_record
            where evidence_record.submission_version_id in (
              '01981036-0000-7000-8000-000000000101',
              '01981036-0000-7000-8000-000000000102'
            )
          )
        );

        delete from public.mastery_events event_record
        where event_record.evidence_id in (
          select evidence_record.id
          from public.evidence evidence_record
          where evidence_record.submission_version_id in (
            '01981036-0000-7000-8000-000000000101',
            '01981036-0000-7000-8000-000000000102'
          )
        );

        delete from public.review_rubric_scores score_record
        where score_record.review_id in (
          select review_record.id
          from public.reviews review_record
          where review_record.submission_id in (
            '01981035-0000-7000-8000-000000000101',
            '01981035-0000-7000-8000-000000000102'
          )
        );

        delete from public.evidence evidence_record
        where evidence_record.submission_version_id in (
          '01981036-0000-7000-8000-000000000101',
          '01981036-0000-7000-8000-000000000102'
        );

        delete from public.reviews review_record
        where review_record.submission_id in (
          '01981035-0000-7000-8000-000000000101',
          '01981035-0000-7000-8000-000000000102'
        );

        delete from public.submission_versions version_record
        where version_record.id in (
          '01981036-0000-7000-8000-000000000101',
          '01981036-0000-7000-8000-000000000102'
        );

        delete from public.submissions submission_record
        where submission_record.id in (
          '01981035-0000-7000-8000-000000000101',
          '01981035-0000-7000-8000-000000000102'
        );

        delete from public.attempts attempt_record
        where attempt_record.id in (
          '01981034-0000-7000-8000-000000000101',
          '01981034-0000-7000-8000-000000000102'
        );

        delete from public.task_schedules schedule_record
        where schedule_record.cohort_id =
          '01981030-0000-7000-8000-000000000100';

        delete from public.enrollments enrollment_record
        where enrollment_record.id =
          '01981033-0000-7000-8000-000000000100';

        delete from public.cohort_memberships membership_record
        where membership_record.cohort_id =
          '01981030-0000-7000-8000-000000000100';

        delete from app_private.cohort_assignment_revisions revision_record
        where revision_record.cohort_id =
          '01981030-0000-7000-8000-000000000100';

        delete from public.cohorts cohort_record
        where cohort_record.id =
          '01981030-0000-7000-8000-000000000100';

        delete from public.task_option_answers answer_record
        where answer_record.task_option_id in (
          select option_record.id
          from public.task_options option_record
          where option_record.task_id in (
            '01981026-0000-7000-8000-000000000101',
            '01981026-0000-7000-8000-000000000102',
            '01981026-0000-7000-8000-000000000103'
          )
        );

        delete from public.task_options option_record
        where option_record.task_id in (
          '01981026-0000-7000-8000-000000000101',
          '01981026-0000-7000-8000-000000000102',
          '01981026-0000-7000-8000-000000000103'
        );

        delete from public.task_assessments assessment_record
        where assessment_record.task_id in (
          '01981026-0000-7000-8000-000000000101',
          '01981026-0000-7000-8000-000000000102',
          '01981026-0000-7000-8000-000000000103'
        );

        delete from public.task_hints hint_record
        where hint_record.task_id in (
          '01981026-0000-7000-8000-000000000101',
          '01981026-0000-7000-8000-000000000102',
          '01981026-0000-7000-8000-000000000103'
        );

        delete from public.task_localizations localization_record
        where localization_record.task_id in (
          '01981026-0000-7000-8000-000000000101',
          '01981026-0000-7000-8000-000000000102',
          '01981026-0000-7000-8000-000000000103'
        );

        delete from public.task_skill_mappings mapping_record
        where mapping_record.task_id in (
          '01981026-0000-7000-8000-000000000101',
          '01981026-0000-7000-8000-000000000102',
          '01981026-0000-7000-8000-000000000103'
        );

        delete from public.task_rubric_assignments assignment_record
        where assignment_record.content_version_id =
          '01981022-0000-7000-8000-000000000100';

        delete from public.tasks task_record
        where task_record.content_version_id =
          '01981022-0000-7000-8000-000000000100';

        delete from public.stage_localizations localization_record
        where localization_record.stage_id =
          '01981023-0000-7000-8000-000000000100';

        delete from public.stages stage_record
        where stage_record.id =
          '01981023-0000-7000-8000-000000000100';

        delete from public.content_versions version_record
        where version_record.id =
          '01981022-0000-7000-8000-000000000100';

        delete from public.course_localizations localization_record
        where localization_record.course_id =
          '01981020-0000-7000-8000-000000000100';

        delete from public.courses course_record
        where course_record.id =
          '01981020-0000-7000-8000-000000000100';

        delete from public.rubric_criteria criterion_record
        where criterion_record.rubric_id =
          '0198102b-0000-7000-8000-000000000100';

        delete from public.rubrics rubric_record
        where rubric_record.id =
          '0198102b-0000-7000-8000-000000000100';

        delete from public.skills skill_record
        where skill_record.id =
          '0198102a-0000-7000-8000-000000000100';

        perform pg_catalog.set_config(
          'session_replication_role', 'origin', true
        );
      end;
      $cleanup_body$;
    $configure_cleanup$
  ),
  'CREATE FUNCTION'::text,
  'external fixture connection installs an exact-ID cleanup boundary'
);

select is(
  extensions.dblink_exec(
    'integrity_mastery_setup',
    $setup$
      begin;

      do $cleanup$
      begin
        perform pg_temp.cleanup_integrity_mastery_fixture();
      end
      $cleanup$;

      -- Lifecycle guards intentionally recognize only the owning postgres
      -- role used by audited definer commands. The superuser connection is
      -- retained solely for exact-ID cleanup of this committed test fixture.
      set local role postgres;

      insert into public.skills (
        id, organization_id, code, labels, descriptions,
        taxonomy_version, state
      ) values (
        '0198102a-0000-7000-8000-000000000100', null,
        'integrity-concurrent-review',
        '{"en":"Concurrent review"}',
        '{"en":"Concurrent mastery serialization."}', 1, 'active'
      );

      insert into public.courses (
        id, organization_id, slug, state, default_locale,
        estimated_minutes, created_by
      ) values (
        '01981020-0000-7000-8000-000000000100', null,
        'integrity-concurrent-review', 'active', 'en', 90,
        '01980a00-0000-7000-8000-000000000003'
      );

      insert into public.course_localizations (
        course_id, locale, title, summary, description_html,
        learning_outcomes
      )
      select
        '01981020-0000-7000-8000-000000000100',
        locale_record.locale,
        locale_record.title,
        locale_record.summary,
        locale_record.description_html,
        jsonb_build_array(locale_record.outcome)
      from (values
        ('en', 'Concurrent review', 'Review concurrency.',
          '<p>Concurrent review.</p>', 'Serialize mastery'),
        ('de', 'Paralleles Review', 'Review-Parallelität.',
          '<p>Paralleles Review.</p>', 'Mastery serialisieren'),
        ('ru', 'Параллельная проверка', 'Параллельная проверка.',
          '<p>Параллельная проверка.</p>', 'Сериализовать прогресс')
      ) locale_record(
        locale, title, summary, description_html, outcome
      );

      insert into public.content_versions (
        id, course_id, version_number, state, change_summary,
        snapshot, created_by
      ) values (
        '01981022-0000-7000-8000-000000000100',
        '01981020-0000-7000-8000-000000000100', 1, 'draft',
        'Concurrent review integrity fixture', '{}',
        '01980a00-0000-7000-8000-000000000003'
      );

      insert into public.stages (
        id, course_id, content_version_id, position, state
      ) values (
        '01981023-0000-7000-8000-000000000100',
        '01981020-0000-7000-8000-000000000100',
        '01981022-0000-7000-8000-000000000100', 0, 'active'
      );

      insert into public.stage_localizations (
        stage_id, locale, title, description_html
      )
      select
        '01981023-0000-7000-8000-000000000100',
        locale_record.locale, locale_record.title,
        locale_record.description_html
      from (values
        ('en', 'Review stage', '<p>Review stage.</p>'),
        ('de', 'Review-Stufe', '<p>Review-Stufe.</p>'),
        ('ru', 'Этап проверки', '<p>Этап проверки.</p>')
      ) locale_record(locale, title, description_html);

      insert into public.rubrics (
        id, organization_id, code, labels, version, state, created_by
      ) values (
        '0198102b-0000-7000-8000-000000000100', null,
        'integrity-concurrent-review',
        '{"en":"Concurrent review","de":"Paralleles Review","ru":"Параллельная проверка"}',
        1, 'active', '01980a00-0000-7000-8000-000000000003'
      );

      insert into public.rubric_criteria (
        id, rubric_id, skill_id, code, labels, position,
        max_points, required_for_acceptance
      ) values
        (
          '0198102c-0000-7000-8000-000000000101',
          '0198102b-0000-7000-8000-000000000100',
          '01980a2a-0000-7000-8000-000000000001',
          'risk', '{"en":"Risk"}', 0, 10, true
        ),
        (
          '0198102c-0000-7000-8000-000000000102',
          '0198102b-0000-7000-8000-000000000100',
          '0198102a-0000-7000-8000-000000000100',
          'evidence', '{"en":"Evidence"}', 1, 10, true
        );

      insert into public.tasks (
        id, course_id, stage_id, content_version_id, bug_category_id,
        position, task_kind, state, target_url, expected_minutes
      ) values
        (
          '01981026-0000-7000-8000-000000000101',
          '01981020-0000-7000-8000-000000000100',
          '01981023-0000-7000-8000-000000000100',
          '01981022-0000-7000-8000-000000000100',
          '01980a25-0000-7000-8000-000000000001',
          0, 'practical', 'active',
          'https://example.invalid/concurrent/one', 30
        ),
        (
          '01981026-0000-7000-8000-000000000102',
          '01981020-0000-7000-8000-000000000100',
          '01981023-0000-7000-8000-000000000100',
          '01981022-0000-7000-8000-000000000100',
          '01980a25-0000-7000-8000-000000000001',
          1, 'practical', 'active',
          'https://example.invalid/concurrent/two', 30
        ),
        (
          '01981026-0000-7000-8000-000000000103',
          '01981020-0000-7000-8000-000000000100',
          '01981023-0000-7000-8000-000000000100',
          '01981022-0000-7000-8000-000000000100',
          '01980a25-0000-7000-8000-000000000001',
          2, 'practical', 'active',
          'https://example.invalid/concurrent/three', 30
        );

      insert into public.task_localizations (
        task_id, locale, title, instructions_html, hint_text
      )
      select
        task_record.task_id,
        locale_record.locale,
        task_record.title || ' ' || upper(locale_record.locale),
        '<p>' || task_record.title || ' instructions</p>',
        'Use a testing heuristic.'
      from (values
        ('01981026-0000-7000-8000-000000000101'::uuid,
          'Concurrent task one'),
        ('01981026-0000-7000-8000-000000000102'::uuid,
          'Concurrent task two'),
        ('01981026-0000-7000-8000-000000000103'::uuid,
          'Never-started task')
      ) task_record(task_id, title)
      cross join (values ('en'), ('de'), ('ru')) locale_record(locale);

      insert into public.task_options (
        task_id, option_key, labels, position
      )
      select
        task_record.task_id,
        option_record.option_key,
        option_record.labels,
        option_record.position
      from (values
        ('01981026-0000-7000-8000-000000000101'::uuid),
        ('01981026-0000-7000-8000-000000000102'::uuid),
        ('01981026-0000-7000-8000-000000000103'::uuid)
      ) task_record(task_id)
      cross join (values
        (
          'verified',
          '{"en":"Verified","de":"Verifiziert","ru":"Проверено"}'::jsonb,
          0
        ),
        (
          'unverified',
          '{"en":"Unverified","de":"Nicht verifiziert","ru":"Не проверено"}'::jsonb,
          1
        )
      ) option_record(option_key, labels, position);

      insert into public.task_option_answers (
        task_option_id, is_correct,
        updated_by
      )
      select
        option_record.id,
        option_record.option_key = 'verified',
        '01980a00-0000-7000-8000-000000000003'
      from public.task_options option_record
      where option_record.task_id in (
        '01981026-0000-7000-8000-000000000101',
        '01981026-0000-7000-8000-000000000102',
        '01981026-0000-7000-8000-000000000103'
      );

      insert into public.task_assessments (
        task_id, question_translations, selection_mode,
        minimum_selections, maximum_selections
      )
      select
        task_record.task_id,
        '{"en":"What is verified?","de":"Was ist verifiziert?","ru":"Что проверено?"}',
        'single', 1, 1
      from (values
        ('01981026-0000-7000-8000-000000000101'::uuid),
        ('01981026-0000-7000-8000-000000000102'::uuid),
        ('01981026-0000-7000-8000-000000000103'::uuid)
      ) task_record(task_id);

      insert into public.task_hints (
        task_id, position, content_translations
      )
      select
        task_record.task_id, 0,
        '{"en":"Use evidence.","de":"Nutze Evidenz.","ru":"Используйте доказательства."}'
      from (values
        ('01981026-0000-7000-8000-000000000101'::uuid),
        ('01981026-0000-7000-8000-000000000102'::uuid),
        ('01981026-0000-7000-8000-000000000103'::uuid)
      ) task_record(task_id);

      insert into public.task_skill_mappings (
        task_id, skill_id, mapping_version, weight_basis_points,
        evidence_required
      )
      select task_record.task_id, skill_record.skill_id, 1, 5000, true
      from (values
        ('01981026-0000-7000-8000-000000000101'::uuid),
        ('01981026-0000-7000-8000-000000000102'::uuid),
        ('01981026-0000-7000-8000-000000000103'::uuid)
      ) task_record(task_id)
      cross join (values
        ('01980a2a-0000-7000-8000-000000000001'::uuid),
        ('0198102a-0000-7000-8000-000000000100'::uuid)
      ) skill_record(skill_id);

      insert into public.task_rubric_assignments (
        id, organization_id, task_id, content_version_id,
        rubric_id, created_by
      ) values
        (
          '0198102d-0000-7000-8000-000000000101', null,
          '01981026-0000-7000-8000-000000000101',
          '01981022-0000-7000-8000-000000000100',
          '0198102b-0000-7000-8000-000000000100',
          '01980a00-0000-7000-8000-000000000003'
        ),
        (
          '0198102d-0000-7000-8000-000000000102', null,
          '01981026-0000-7000-8000-000000000102',
          '01981022-0000-7000-8000-000000000100',
          '0198102b-0000-7000-8000-000000000100',
          '01980a00-0000-7000-8000-000000000003'
        ),
        (
          '0198102d-0000-7000-8000-000000000103', null,
          '01981026-0000-7000-8000-000000000103',
          '01981022-0000-7000-8000-000000000100',
          '0198102b-0000-7000-8000-000000000100',
          '01980a00-0000-7000-8000-000000000003'
        );

      do $ready$
      begin
        perform app_private.assert_competency_graph_ready(
          '01981022-0000-7000-8000-000000000100'
        );
      end
      $ready$;

      update public.content_versions
      set snapshot = app_private.build_content_snapshot(
        '01981022-0000-7000-8000-000000000100'
      )
      where id = '01981022-0000-7000-8000-000000000100';

      update public.content_versions
      set state = 'in_review'
      where id = '01981022-0000-7000-8000-000000000100';

      update public.content_versions
      set state = 'published',
          published_by = '01980a00-0000-7000-8000-000000000003',
          published_at = statement_timestamp()
      where id = '01981022-0000-7000-8000-000000000100';

      insert into public.cohorts (
        id, organization_id, course_id, content_version_id, name,
        state, progression_mode, starts_at, created_by
      ) values (
        '01981030-0000-7000-8000-000000000100',
        '01980a10-0000-7000-8000-000000000001',
        '01981020-0000-7000-8000-000000000100',
        '01981022-0000-7000-8000-000000000100',
        'Concurrent Review Cohort', 'active', 'scheduled',
        statement_timestamp() - interval '1 day',
        '01980a00-0000-7000-8000-000000000003'
      );

      insert into public.cohort_memberships (
        id, cohort_id, user_id, role, state, assigned_by
      ) values
        (
          '01981031-0000-7000-8000-000000000101',
          '01981030-0000-7000-8000-000000000100',
          '01980a00-0000-7000-8000-000000000001',
          'learner', 'active',
          '01980a00-0000-7000-8000-000000000003'
        ),
        (
          '01981031-0000-7000-8000-000000000102',
          '01981030-0000-7000-8000-000000000100',
          '01980a00-0000-7000-8000-000000000002',
          'trainer', 'active',
          '01980a00-0000-7000-8000-000000000003'
        );

      insert into public.enrollments (
        id, organization_id, learner_id, course_id, cohort_id, state,
        idempotency_key, decided_by, decided_at
      ) values (
        '01981033-0000-7000-8000-000000000100',
        '01980a10-0000-7000-8000-000000000001',
        '01980a00-0000-7000-8000-000000000001',
        '01981020-0000-7000-8000-000000000100',
        '01981030-0000-7000-8000-000000000100', 'assigned',
        'integrity-concurrency-enrollment-0100',
        '01980a00-0000-7000-8000-000000000003',
        statement_timestamp()
      );

      insert into public.task_schedules (
        id, cohort_id, task_id, available_from, due_at,
        changed_by, change_reason
      ) values
        (
          '01981032-0000-7000-8000-000000000101',
          '01981030-0000-7000-8000-000000000100',
          '01981026-0000-7000-8000-000000000101',
          statement_timestamp() - interval '2 days',
          statement_timestamp() - interval '1 hour',
          '01980a00-0000-7000-8000-000000000003',
          'Expired after learner started'
        ),
        (
          '01981032-0000-7000-8000-000000000102',
          '01981030-0000-7000-8000-000000000100',
          '01981026-0000-7000-8000-000000000102',
          statement_timestamp() - interval '2 days',
          statement_timestamp() - interval '1 hour',
          '01980a00-0000-7000-8000-000000000003',
          'Expired after revision started'
        ),
        (
          '01981032-0000-7000-8000-000000000103',
          '01981030-0000-7000-8000-000000000100',
          '01981026-0000-7000-8000-000000000103',
          statement_timestamp() - interval '2 days',
          statement_timestamp() - interval '1 hour',
          '01980a00-0000-7000-8000-000000000003',
          'Expired before learner started'
        );

      insert into public.attempts (
        id, organization_id, enrollment_id, learner_id, cohort_id,
        task_id, sequence_number, state, submitted_at,
        elapsed_seconds, row_version
      ) values
        (
          '01981034-0000-7000-8000-000000000101',
          '01980a10-0000-7000-8000-000000000001',
          '01981033-0000-7000-8000-000000000100',
          '01980a00-0000-7000-8000-000000000001',
          '01981030-0000-7000-8000-000000000100',
          '01981026-0000-7000-8000-000000000101',
          1, 'submitted', statement_timestamp(), 300, 1
        ),
        (
          '01981034-0000-7000-8000-000000000102',
          '01980a10-0000-7000-8000-000000000001',
          '01981033-0000-7000-8000-000000000100',
          '01980a00-0000-7000-8000-000000000001',
          '01981030-0000-7000-8000-000000000100',
          '01981026-0000-7000-8000-000000000102',
          1, 'resubmitted', statement_timestamp(), 420, 1
        );

      insert into public.submissions (
        id, organization_id, attempt_id, learner_id, cohort_id,
        task_id, state, latest_version_number, row_version
      ) values
        (
          '01981035-0000-7000-8000-000000000101',
          '01980a10-0000-7000-8000-000000000001',
          '01981034-0000-7000-8000-000000000101',
          '01980a00-0000-7000-8000-000000000001',
          '01981030-0000-7000-8000-000000000100',
          '01981026-0000-7000-8000-000000000101',
          'submitted', 1, 1
        ),
        (
          '01981035-0000-7000-8000-000000000102',
          '01980a10-0000-7000-8000-000000000001',
          '01981034-0000-7000-8000-000000000102',
          '01980a00-0000-7000-8000-000000000001',
          '01981030-0000-7000-8000-000000000100',
          '01981026-0000-7000-8000-000000000102',
          'resubmitted', 1, 1
        );

      insert into public.submission_versions (
        id, submission_id, version_number, idempotency_key,
        answer_text, elapsed_seconds, hint_used, task_snapshot,
        submitted_by
      ) values
        (
          '01981036-0000-7000-8000-000000000101',
          '01981035-0000-7000-8000-000000000101', 1,
          'integrity-concurrent-submission-0101',
          'First concurrent answer', 300, false,
          '{"task_id":"01981026-0000-7000-8000-000000000101","content_version_id":"01981022-0000-7000-8000-000000000100"}',
          '01980a00-0000-7000-8000-000000000001'
        ),
        (
          '01981036-0000-7000-8000-000000000102',
          '01981035-0000-7000-8000-000000000102', 1,
          'integrity-concurrent-submission-0102',
          'Second concurrent answer', 420, false,
          '{"task_id":"01981026-0000-7000-8000-000000000102","content_version_id":"01981022-0000-7000-8000-000000000100"}',
          '01980a00-0000-7000-8000-000000000001'
        );

      commit;
    $setup$
  ),
  'COMMIT'::text,
  'concurrent two-skill review fixture commits outside the pgTAP rollback'
);

select ok(
  app_private.is_valid_learner_content_snapshot(
    (
      select version_record.snapshot
      from public.content_versions version_record
      where version_record.id =
        '01981022-0000-7000-8000-000000000100'
    ),
    '01981020-0000-7000-8000-000000000100',
    'integrity-concurrent-review',
    '01981022-0000-7000-8000-000000000100', 1
  ),
  'the concurrent fixture is a strict valid learner publication snapshot'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claim.sub', '01980a00-0000-7000-8000-000000000001', true
);

select is(
  (
    select count(*)::bigint
    from public.list_my_available_question_contexts('en') context_record
    where context_record.cohort_id =
        '01981030-0000-7000-8000-000000000100'
      and context_record.task_id in (
        '01981026-0000-7000-8000-000000000101',
        '01981026-0000-7000-8000-000000000102'
      )
  ),
  2::bigint,
  'expired schedules preserve submitted and revision/resubmission question contexts'
);

select is(
  (
    select count(*)::bigint
    from public.list_my_available_question_contexts('en') context_record
    where context_record.cohort_id =
        '01981030-0000-7000-8000-000000000100'
      and context_record.task_id =
        '01981026-0000-7000-8000-000000000103'
  ),
  0::bigint,
  'an expired never-started task remains unavailable as a question context'
);

reset role;

select extensions.dblink_connect(
  'integrity_mastery_review_a',
  'host=supabase_db_ditele-v2 port=5432 dbname=postgres user=postgres password=postgres'
);

select extensions.dblink_connect(
  'integrity_mastery_review_b',
  'host=supabase_db_ditele-v2 port=5432 dbname=postgres user=postgres password=postgres'
);

select is(
  extensions.dblink_exec(
    'integrity_mastery_review_a',
    $configure_a$
      begin;
      set local role authenticated;
      set local "request.jwt.claim.role" = 'authenticated';
      set local "request.jwt.claim.sub" =
        '01980a00-0000-7000-8000-000000000002';
    $configure_a$
  ),
  'SET'::text,
  'first review session establishes an authenticated trainer transaction'
);

select is(
  extensions.dblink_exec(
    'integrity_mastery_review_b',
    $configure_b$
      begin;
      set local role authenticated;
      set local "request.jwt.claim.role" = 'authenticated';
      set local "request.jwt.claim.sub" =
        '01980a00-0000-7000-8000-000000000002';
    $configure_b$
  ),
  'SET'::text,
  'second review session establishes an authenticated trainer transaction'
);

select ok(
  extensions.dblink_send_query(
    'integrity_mastery_review_a',
    $review_a$
      with reviewed as materialized (
        select (public.decide_submission(
          '01981035-0000-7000-8000-000000000101',
          '01981036-0000-7000-8000-000000000101',
          1, 'accepted', 'Concurrent review A accepted',
          '[{"criterion_id":"0198102c-0000-7000-8000-000000000101","points":6},{"criterion_id":"0198102c-0000-7000-8000-000000000102","points":7}]',
          'integrity-concurrent-review-a-0101',
          '01981053-0000-7000-8000-000000000101'
        )).state::text as review_state
      )
      select reviewed.review_state, pg_catalog.pg_sleep(1) is null
      from reviewed
    $review_a$
  ) = 1,
  'first two-skill accepted review starts and retains mastery locks'
);

select pg_catalog.pg_sleep(0.2);

select ok(
  extensions.dblink_send_query(
    'integrity_mastery_review_b',
    $review_b$
      select (public.decide_submission(
        '01981035-0000-7000-8000-000000000102',
        '01981036-0000-7000-8000-000000000102',
        1, 'accepted', 'Concurrent review B accepted',
        '[{"criterion_id":"0198102c-0000-7000-8000-000000000101","points":8},{"criterion_id":"0198102c-0000-7000-8000-000000000102","points":9}]',
        'integrity-concurrent-review-b-0102',
        '01981053-0000-7000-8000-000000000102'
      )).state::text as review_state
    $review_b$
  ) = 1,
  'second review overlaps the first review on the same two mastery identities'
);

select pg_catalog.pg_sleep(0.2);

select is(
  extensions.dblink_is_busy('integrity_mastery_review_b'),
  1,
  'second multi-skill review waits on the first sorted advisory lock set'
);

create temporary table integrity_review_a_result (
  review_state text not null,
  waited boolean
) on commit drop;

insert into integrity_review_a_result (review_state, waited)
select result_record.review_state, result_record.waited
from extensions.dblink_get_result(
  'integrity_mastery_review_a'
) as result_record(review_state text, waited boolean);

select is(
  extensions.dblink_exec('integrity_mastery_review_a', 'commit'),
  'COMMIT'::text,
  'first review commits and releases both mastery identities'
);

create temporary table integrity_review_b_result (
  review_state text not null
) on commit drop;

insert into integrity_review_b_result (review_state)
select result_record.review_state
from extensions.dblink_get_result(
  'integrity_mastery_review_b'
) as result_record(review_state text);

select is(
  extensions.dblink_exec('integrity_mastery_review_b', 'commit'),
  'COMMIT'::text,
  'second review completes after the first lock holder commits'
);

select results_eq(
  $$
    select review_state from integrity_review_a_result
    union all
    select review_state from integrity_review_b_result
  $$,
  $$ values ('accepted'::text), ('accepted'::text) $$,
  'both concurrent production review commands complete successfully'
);

select is(
  extensions.dblink_disconnect('integrity_mastery_review_a'),
  'OK'::text,
  'first review session disconnects cleanly'
);

select is(
  extensions.dblink_disconnect('integrity_mastery_review_b'),
  'OK'::text,
  'second review session disconnects cleanly'
);

select results_eq(
  $$
    select
      event_record.skill_id,
      event_record.previous_basis_points,
      event_record.new_basis_points
    from public.mastery_events event_record
    where event_record.organization_id =
        '01980a10-0000-7000-8000-000000000001'
      and event_record.learner_id =
        '01980a00-0000-7000-8000-000000000001'
      and event_record.source_event_id in (
        select review_record.id
        from public.reviews review_record
        where review_record.submission_id in (
          '01981035-0000-7000-8000-000000000101',
          '01981035-0000-7000-8000-000000000102'
        )
      )
    order by event_record.skill_id, event_record.previous_basis_points
  $$,
  $$ values
    (
      '01980a2a-0000-7000-8000-000000000001'::uuid,
      0, 6000
    ),
    (
      '01980a2a-0000-7000-8000-000000000001'::uuid,
      6000, 8000
    ),
    (
      '0198102a-0000-7000-8000-000000000100'::uuid,
      0, 7000
    ),
    (
      '0198102a-0000-7000-8000-000000000100'::uuid,
      7000, 9000
    )
  $$,
  'each skill records one contiguous serialized predecessor chain'
);

select ok(
  (
    select count(*) = 2
    from public.mastery_snapshots snapshot_record
    join public.mastery_events event_record
      on event_record.id = snapshot_record.source_event_id
     and event_record.organization_id = snapshot_record.organization_id
     and event_record.learner_id = snapshot_record.learner_id
     and event_record.skill_id = snapshot_record.skill_id
     and event_record.new_basis_points =
       snapshot_record.mastery_basis_points
     and event_record.rule_version = snapshot_record.rule_version
    where snapshot_record.organization_id =
        '01980a10-0000-7000-8000-000000000001'
      and snapshot_record.learner_id =
        '01980a00-0000-7000-8000-000000000001'
      and (
        snapshot_record.skill_id =
          '01980a2a-0000-7000-8000-000000000001'
        and snapshot_record.mastery_basis_points = 8000
        or snapshot_record.skill_id =
          '0198102a-0000-7000-8000-000000000100'
        and snapshot_record.mastery_basis_points = 9000
      )
  ),
  'final concurrent snapshots point to exact final event scores and rules'
);

select is(
  extensions.dblink_exec(
    'integrity_mastery_setup',
    $cleanup$
      begin;
      do $run_cleanup$
      begin
        perform pg_temp.cleanup_integrity_mastery_fixture();
      end
      $run_cleanup$;
      commit;
    $cleanup$
  ),
  'COMMIT'::text,
  'external concurrency fixture cleanup commits successfully'
);

select is(
  extensions.dblink_disconnect('integrity_mastery_setup'),
  'OK'::text,
  'external fixture connection disconnects cleanly'
);

select ok(
  not exists (
    select 1 from public.courses course_record
    where course_record.id = '01981020-0000-7000-8000-000000000100'
  )
  and not exists (
    select 1 from public.submissions submission_record
    where submission_record.id in (
      '01981035-0000-7000-8000-000000000101',
      '01981035-0000-7000-8000-000000000102'
    )
  )
  and not exists (
    select 1 from public.skills skill_record
    where skill_record.id = '0198102a-0000-7000-8000-000000000100'
  ),
  'concurrency regression leaves no persistent external fixture rows'
);

select * from finish();
rollback;
