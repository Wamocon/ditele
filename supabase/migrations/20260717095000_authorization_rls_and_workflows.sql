-- Defense-in-depth authorization, named database transitions, and atomic workflow RPCs.

create or replace function app_private.has_role(
  p_role_code text,
  p_organization_id uuid default null,
  p_cohort_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.code = p_role_code
      and ur.revoked_at is null
      and ur.valid_from <= statement_timestamp()
      and (ur.valid_until is null or ur.valid_until > statement_timestamp())
      and (ur.organization_id is null or ur.organization_id = p_organization_id)
      and (ur.cohort_id is null or ur.cohort_id = p_cohort_id)
  );
$$;

create or replace function app_private.has_permission(
  p_permission_code text,
  p_organization_id uuid default null,
  p_cohort_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = (select auth.uid())
      and p.code = p_permission_code
      and ur.revoked_at is null
      and ur.valid_from <= statement_timestamp()
      and (ur.valid_until is null or ur.valid_until > statement_timestamp())
      and (ur.organization_id is null or ur.organization_id = p_organization_id)
      and (ur.cohort_id is null or ur.cohort_id = p_cohort_id)
  );
$$;

create or replace function app_private.is_active_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = (select auth.uid())
      and om.state = 'active'
      and (om.valid_until is null or om.valid_until > statement_timestamp())
  ) or (select app_private.has_role('admin'));
$$;

create or replace function app_private.can_access_cohort(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cohort_memberships cm
    where cm.cohort_id = p_cohort_id
      and cm.user_id = (select auth.uid())
      and cm.state = 'active'
  ) or exists (
    select 1
    from public.cohorts c
    where c.id = p_cohort_id
      and (select app_private.has_permission('cohort.manage', c.organization_id, c.id))
  );
$$;

create or replace function app_private.can_train_cohort(p_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cohort_memberships cm
    where cm.cohort_id = p_cohort_id
      and cm.user_id = (select auth.uid())
      and cm.role = 'trainer'
      and cm.state = 'active'
  ) or exists (
    select 1
    from public.cohorts c
    where c.id = p_cohort_id
      and (select app_private.has_permission('cohort.manage', c.organization_id, c.id))
  );
$$;

create or replace function app_private.can_access_submission(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.submissions s
    where s.id = p_submission_id
      and (
        s.learner_id = (select auth.uid())
        or (select app_private.can_train_cohort(s.cohort_id))
      )
  );
$$;

create or replace function app_private.can_access_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.questions q
    where q.id = p_question_id
      and (
        q.learner_id = (select auth.uid())
        or q.assigned_trainer_id = (select auth.uid())
        or (select app_private.can_train_cohort(q.cohort_id))
      )
  );
$$;

create or replace function app_private.can_access_evidence(p_evidence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.evidence e
    left join public.submission_versions sv on sv.id = e.submission_version_id
    left join public.submissions s on s.id = sv.submission_id
    where e.id = p_evidence_id
      and (
        e.owner_id = (select auth.uid())
        or (s.id is not null and (select app_private.can_train_cohort(s.cohort_id)))
        or (select app_private.has_permission('organization.manage', e.organization_id))
      )
  );
$$;

revoke all on function app_private.has_role(text, uuid, uuid) from public;
revoke all on function app_private.has_permission(text, uuid, uuid) from public;
revoke all on function app_private.is_active_organization_member(uuid) from public;
revoke all on function app_private.can_access_cohort(uuid) from public;
revoke all on function app_private.can_train_cohort(uuid) from public;
revoke all on function app_private.can_access_submission(uuid) from public;
revoke all on function app_private.can_access_question(uuid) from public;
revoke all on function app_private.can_access_evidence(uuid) from public;

grant execute on function app_private.has_role(text, uuid, uuid) to authenticated, service_role;
grant execute on function app_private.has_permission(text, uuid, uuid) to authenticated, service_role;
grant execute on function app_private.is_active_organization_member(uuid) to authenticated, service_role;
grant execute on function app_private.can_access_cohort(uuid) to authenticated, service_role;
grant execute on function app_private.can_train_cohort(uuid) to authenticated, service_role;
grant execute on function app_private.can_access_submission(uuid) to authenticated, service_role;
grant execute on function app_private.can_access_question(uuid) to authenticated, service_role;
grant execute on function app_private.can_access_evidence(uuid) to authenticated, service_role;

create or replace function app_private.validate_named_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean := false;
begin
  if new.state = old.state then
    return new;
  end if;

  allowed := case tg_table_name
    when 'cohorts' then
      (old.state = 'waiting' and new.state in ('active', 'cancelled'))
      or (old.state = 'active' and new.state in ('completed', 'cancelled'))
    when 'enrollments' then
      (old.state = 'requested' and new.state in ('approved', 'rejected', 'cancelled'))
      or (old.state = 'approved' and new.state in ('assigned', 'cancelled'))
      or (old.state = 'assigned' and new.state in ('completed', 'cancelled'))
    when 'submissions' then
      (old.state = 'submitted' and new.state in ('accepted', 'revision_required', 'withdrawn'))
      or (old.state = 'revision_required' and new.state = 'resubmitted')
      or (old.state = 'resubmitted' and new.state in ('accepted', 'revision_required', 'withdrawn'))
    when 'questions' then
      (old.state = 'open' and new.state in ('assigned', 'archived'))
      or (old.state = 'assigned' and new.state in ('answered', 'transferred', 'archived'))
      or (old.state = 'transferred' and new.state in ('assigned', 'answered', 'archived'))
      or (old.state = 'answered' and new.state = 'archived')
    when 'lab_sessions' then
      (old.state = 'requested' and new.state in ('provisioning', 'failed'))
      or (old.state = 'provisioning' and new.state in ('ready', 'failed'))
      or (old.state = 'ready' and new.state in ('active', 'reset_pending', 'destroy_pending', 'expired'))
      or (old.state = 'active' and new.state in ('validating', 'reset_pending', 'destroy_pending', 'expired', 'failed'))
      or (old.state = 'validating' and new.state in ('active', 'destroy_pending', 'failed'))
      or (old.state = 'reset_pending' and new.state in ('ready', 'failed'))
      or (old.state = 'destroy_pending' and new.state in ('destroyed', 'failed'))
      or (old.state = 'failed' and new.state in ('provisioning', 'destroy_pending'))
      or (old.state = 'expired' and new.state = 'destroy_pending')
    when 'certificates' then
      (old.state = 'eligible' and new.state = 'issued')
      or (old.state = 'issued' and new.state in ('available', 'revoked'))
      or (old.state = 'available' and new.state in ('revoked', 'expired'))
    when 'integration_deliveries' then
      (old.state = 'pending' and new.state in ('processing', 'cancelled'))
      or (old.state = 'processing' and new.state in ('delivered', 'retry_scheduled', 'dead_letter'))
      or (old.state = 'retry_scheduled' and new.state in ('processing', 'dead_letter', 'cancelled'))
      or (old.state = 'dead_letter' and new.state = 'retry_scheduled')
    when 'content_versions' then
      (old.state = 'draft' and new.state in ('in_review', 'archived'))
      or (old.state = 'in_review' and new.state in ('draft', 'published', 'archived'))
    else false
  end;

  if not allowed then
    raise exception 'invalid % transition: % -> %', tg_table_name, old.state, new.state using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function app_private.validate_named_transition() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cohorts', 'enrollments', 'submissions', 'questions', 'lab_sessions',
    'certificates', 'integration_deliveries', 'content_versions'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.validate_named_transition()',
      table_name || '_validate_transition', table_name
    );
  end loop;
end $$;

-- All API-facing tables fail closed unless an explicit policy below applies.
do $$
declare
  table_name text;
begin
  for table_name in
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.courses, public.course_localizations to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

create policy courses_public_catalog on public.courses
  for select to anon, authenticated
  using (state = 'active' and archived_at is null and organization_id is null);

create policy course_localizations_public_catalog on public.course_localizations
  for select to anon, authenticated
  using (exists (
    select 1 from public.courses c
    where c.id = course_id and c.state = 'active' and c.archived_at is null and c.organization_id is null
  ));

create policy profiles_self_read on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.has_role('admin')));
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()) or (select app_private.has_role('admin')))
  with check (user_id = (select auth.uid()) or (select app_private.has_role('admin')));

create policy roles_authenticated_read on public.roles for select to authenticated using (true);
create policy permissions_authenticated_read on public.permissions for select to authenticated using (true);
create policy role_permissions_authenticated_read on public.role_permissions for select to authenticated using (true);

create policy organizations_member_read on public.organizations
  for select to authenticated
  using ((select app_private.is_active_organization_member(id)));
create policy organizations_admin_write on public.organizations
  for all to authenticated
  using ((select app_private.has_role('admin')))
  with check ((select app_private.has_role('admin')));

create policy organization_memberships_scoped_read on public.organization_memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.has_permission('organization.manage', organization_id)));
create policy organization_memberships_admin_write on public.organization_memberships
  for all to authenticated
  using ((select app_private.has_permission('organization.manage', organization_id)))
  with check ((select app_private.has_permission('organization.manage', organization_id)));

create policy user_roles_scoped_read on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.has_permission('organization.manage', organization_id, cohort_id)));
create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using ((select app_private.has_permission('organization.manage', organization_id, cohort_id)) or (select app_private.has_role('admin')))
  with check ((select app_private.has_permission('organization.manage', organization_id, cohort_id)) or (select app_private.has_role('admin')));

create policy impersonation_actor_read on public.impersonation_sessions
  for select to authenticated
  using (actor_user_id = (select auth.uid()) or subject_user_id = (select auth.uid()) or (select app_private.has_role('admin')));
create policy impersonation_admin_write on public.impersonation_sessions
  for all to authenticated
  using ((select app_private.has_role('admin')))
  with check ((select app_private.has_role('admin')) and actor_user_id = (select auth.uid()));

create policy courses_member_read on public.courses
  for select to authenticated
  using (organization_id is null or (select app_private.is_active_organization_member(organization_id)));
create policy courses_content_write on public.courses
  for all to authenticated
  using ((select app_private.has_permission('content.manage', organization_id)))
  with check ((select app_private.has_permission('content.manage', organization_id)));

create policy course_localizations_member_read on public.course_localizations
  for select to authenticated
  using (exists (
    select 1 from public.courses c
    where c.id = course_id and (c.organization_id is null or (select app_private.is_active_organization_member(c.organization_id)))
  ));
create policy course_localizations_content_write on public.course_localizations
  for all to authenticated
  using (exists (
    select 1 from public.courses c
    where c.id = course_id and (select app_private.has_permission('content.manage', c.organization_id))
  ))
  with check (exists (
    select 1 from public.courses c
    where c.id = course_id and (select app_private.has_permission('content.manage', c.organization_id))
  ));

-- Course child records share the course authorization boundary.
do $$
declare
  spec record;
begin
  for spec in select * from (values
    ('content_versions', 'course_id'),
    ('stages', 'course_id'),
    ('tasks', 'course_id')
  ) as rows(table_name, course_column)
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.courses c where c.id = %I and (c.organization_id is null or app_private.is_active_organization_member(c.organization_id))))',
      spec.table_name || '_member_read', spec.table_name, spec.course_column
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.courses c where c.id = %I and app_private.has_permission(''content.manage'', c.organization_id))) with check (exists (select 1 from public.courses c where c.id = %I and app_private.has_permission(''content.manage'', c.organization_id)))',
      spec.table_name || '_content_write', spec.table_name, spec.course_column, spec.course_column
    );
  end loop;
end $$;

create policy content_reviews_scoped on public.content_reviews
  for all to authenticated
  using (exists (
    select 1 from public.content_versions cv join public.courses c on c.id = cv.course_id
    where cv.id = content_version_id and (select app_private.has_permission('content.manage', c.organization_id))
  ))
  with check (reviewer_id = (select auth.uid()) and exists (
    select 1 from public.content_versions cv join public.courses c on c.id = cv.course_id
    where cv.id = content_version_id and (select app_private.has_permission('content.manage', c.organization_id))
  ));

create policy stage_localizations_member_read on public.stage_localizations
  for select to authenticated using (exists (
    select 1 from public.stages s join public.courses c on c.id = s.course_id
    where s.id = stage_id and (c.organization_id is null or (select app_private.is_active_organization_member(c.organization_id)))
  ));
create policy stage_localizations_content_write on public.stage_localizations
  for all to authenticated
  using (exists (select 1 from public.stages s join public.courses c on c.id = s.course_id where s.id = stage_id and (select app_private.has_permission('content.manage', c.organization_id))))
  with check (exists (select 1 from public.stages s join public.courses c on c.id = s.course_id where s.id = stage_id and (select app_private.has_permission('content.manage', c.organization_id))));

create policy task_localizations_member_read on public.task_localizations
  for select to authenticated using (exists (
    select 1 from public.tasks t join public.courses c on c.id = t.course_id
    where t.id = task_id and (c.organization_id is null or (select app_private.is_active_organization_member(c.organization_id)))
  ));
create policy task_localizations_content_write on public.task_localizations
  for all to authenticated
  using (exists (select 1 from public.tasks t join public.courses c on c.id = t.course_id where t.id = task_id and (select app_private.has_permission('content.manage', c.organization_id))))
  with check (exists (select 1 from public.tasks t join public.courses c on c.id = t.course_id where t.id = task_id and (select app_private.has_permission('content.manage', c.organization_id))));

create policy task_options_member_read on public.task_options
  for select to authenticated using (exists (
    select 1 from public.tasks t join public.courses c on c.id = t.course_id
    where t.id = task_id and (c.organization_id is null or (select app_private.is_active_organization_member(c.organization_id)))
  ));
create policy task_options_content_write on public.task_options
  for all to authenticated
  using (exists (select 1 from public.tasks t join public.courses c on c.id = t.course_id where t.id = task_id and (select app_private.has_permission('content.manage', c.organization_id))))
  with check (exists (select 1 from public.tasks t join public.courses c on c.id = t.course_id where t.id = task_id and (select app_private.has_permission('content.manage', c.organization_id))));

create policy media_assets_scoped_read on public.media_assets
  for select to authenticated using (owner_id = (select auth.uid()) or organization_id is null or (select app_private.is_active_organization_member(organization_id)));
create policy media_assets_scoped_write on public.media_assets
  for all to authenticated
  using (owner_id = (select auth.uid()) or (select app_private.has_permission('content.manage', organization_id)))
  with check (owner_id = (select auth.uid()) or (select app_private.has_permission('content.manage', organization_id)));

create policy bug_categories_member_read on public.bug_categories
  for select to authenticated using (organization_id is null or (select app_private.is_active_organization_member(organization_id)));
create policy bug_categories_content_write on public.bug_categories
  for all to authenticated using ((select app_private.has_permission('content.manage', organization_id)))
  with check ((select app_private.has_permission('content.manage', organization_id)));

create policy cohorts_scoped_read on public.cohorts for select to authenticated using ((select app_private.can_access_cohort(id)));
create policy cohorts_scoped_write on public.cohorts
  for all to authenticated using ((select app_private.has_permission('cohort.manage', organization_id, id)))
  with check ((select app_private.has_permission('cohort.manage', organization_id, id)));

create policy cohort_memberships_scoped_read on public.cohort_memberships for select to authenticated using ((select app_private.can_access_cohort(cohort_id)));
create policy cohort_memberships_scoped_write on public.cohort_memberships
  for all to authenticated
  using (exists (select 1 from public.cohorts c where c.id = cohort_id and (select app_private.has_permission('cohort.manage', c.organization_id, c.id))))
  with check (exists (select 1 from public.cohorts c where c.id = cohort_id and (select app_private.has_permission('cohort.manage', c.organization_id, c.id))));

create policy task_schedules_scoped_read on public.task_schedules for select to authenticated using ((select app_private.can_access_cohort(cohort_id)));
create policy task_schedules_scoped_write on public.task_schedules
  for all to authenticated
  using (exists (select 1 from public.cohorts c where c.id = cohort_id and (select app_private.has_permission('cohort.manage', c.organization_id, c.id))))
  with check (exists (select 1 from public.cohorts c where c.id = cohort_id and (select app_private.has_permission('cohort.manage', c.organization_id, c.id))));

create policy enrollments_scoped_read on public.enrollments
  for select to authenticated using (learner_id = (select auth.uid()) or (select app_private.has_permission('enrollment.decide', organization_id, cohort_id)));
create policy enrollments_learner_insert on public.enrollments
  for insert to authenticated with check (learner_id = (select auth.uid()) and state = 'requested');
create policy enrollments_admin_update on public.enrollments
  for update to authenticated
  using ((select app_private.has_permission('enrollment.decide', organization_id, cohort_id)))
  with check ((select app_private.has_permission('enrollment.decide', organization_id, cohort_id)));

-- Self-owned learner work with cohort-scoped trainer access.
create policy attempts_scoped on public.attempts
  for all to authenticated
  using (learner_id = (select auth.uid()) or (select app_private.can_train_cohort(cohort_id)))
  with check (learner_id = (select auth.uid()) or (select app_private.can_train_cohort(cohort_id)));
create policy attempt_drafts_scoped on public.attempt_drafts
  for all to authenticated
  using (exists (select 1 from public.attempts a where a.id = attempt_id and (a.learner_id = (select auth.uid()) or (select app_private.can_train_cohort(a.cohort_id)))))
  with check (exists (select 1 from public.attempts a where a.id = attempt_id and a.learner_id = (select auth.uid())));
create policy submissions_scoped on public.submissions
  for select to authenticated using ((select app_private.can_access_submission(id)));
create policy submissions_learner_write on public.submissions
  for all to authenticated using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));
create policy submission_versions_scoped on public.submission_versions
  for select to authenticated using ((select app_private.can_access_submission(submission_id)));
create policy submission_versions_learner_insert on public.submission_versions
  for insert to authenticated with check (submitted_by = (select auth.uid()) and exists (select 1 from public.submissions s where s.id = submission_id and s.learner_id = (select auth.uid())));
create policy submission_answers_scoped_read on public.submission_answers
  for select to authenticated using (exists (select 1 from public.submission_versions sv where sv.id = submission_version_id and (select app_private.can_access_submission(sv.submission_id))));
create policy submission_answers_learner_insert on public.submission_answers
  for insert to authenticated with check (exists (select 1 from public.submission_versions sv join public.submissions s on s.id = sv.submission_id where sv.id = submission_version_id and s.learner_id = (select auth.uid())));

create policy reviews_scoped_read on public.reviews
  for select to authenticated using ((select app_private.can_access_submission(submission_id)));
create policy reviews_trainer_insert on public.reviews
  for insert to authenticated with check (reviewer_id = (select auth.uid()) and exists (select 1 from public.submissions s where s.id = submission_id and (select app_private.can_train_cohort(s.cohort_id))));
create policy review_transfers_scoped on public.review_transfers
  for select to authenticated using ((select app_private.can_access_submission(submission_id)));
create policy review_transfers_trainer_insert on public.review_transfers
  for insert to authenticated with check (from_trainer_id = (select auth.uid()) and exists (select 1 from public.submissions s where s.id = submission_id and (select app_private.can_train_cohort(s.cohort_id))));

create policy questions_scoped_read on public.questions for select to authenticated using ((select app_private.can_access_question(id)));
create policy questions_learner_insert on public.questions for insert to authenticated with check (learner_id = (select auth.uid()));
create policy questions_scoped_update on public.questions
  for update to authenticated using ((select app_private.can_access_question(id)))
  with check ((select app_private.can_access_question(id)));
create policy question_messages_scoped_read on public.question_messages for select to authenticated using ((select app_private.can_access_question(question_id)));
create policy question_messages_scoped_insert on public.question_messages for insert to authenticated with check (author_id = (select auth.uid()) and (select app_private.can_access_question(question_id)));
create policy question_transfers_scoped_read on public.question_transfers for select to authenticated using ((select app_private.can_access_question(question_id)));
create policy question_transfers_trainer_insert on public.question_transfers for insert to authenticated with check (from_trainer_id = (select auth.uid()) and (select app_private.can_access_question(question_id)));

create policy ratings_scoped on public.ratings for all to authenticated
  using (learner_id = (select auth.uid()) or (select app_private.has_permission('organization.manage', organization_id)))
  with check (learner_id = (select auth.uid()));

-- Definitions visible to active tenant members; management remains permission-scoped.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'learning_paths', 'skills', 'rubrics', 'placement_assessments', 'lab_definitions',
    'badges', 'missions', 'product_packages'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (organization_id is null or app_private.is_active_organization_member(organization_id))',
      table_name || '_member_read', table_name
    );
  end loop;
end $$;

create policy learning_paths_admin_write on public.learning_paths for all to authenticated
  using ((select app_private.has_permission('content.manage', organization_id))) with check ((select app_private.has_permission('content.manage', organization_id)));
create policy skills_admin_write on public.skills for all to authenticated
  using ((select app_private.has_permission('content.manage', organization_id))) with check ((select app_private.has_permission('content.manage', organization_id)));
create policy rubrics_admin_write on public.rubrics for all to authenticated
  using ((select app_private.has_permission('content.manage', organization_id))) with check ((select app_private.has_permission('content.manage', organization_id)));

create policy path_assignments_scoped on public.path_assignments for select to authenticated
  using (learner_id = (select auth.uid()) or (select app_private.can_train_cohort((select cm.cohort_id from public.cohort_memberships cm where cm.user_id = learner_id and cm.state = 'active' limit 1))) or (select app_private.has_permission('organization.manage', organization_id)));
create policy path_assignments_admin_write on public.path_assignments for all to authenticated
  using ((select app_private.has_permission('organization.manage', organization_id))) with check ((select app_private.has_permission('organization.manage', organization_id)));

create policy evidence_scoped_read on public.evidence for select to authenticated using ((select app_private.can_access_evidence(id)));
create policy evidence_owner_insert on public.evidence for insert to authenticated with check (owner_id = (select auth.uid()));
create policy evidence_artifacts_scoped_read on public.evidence_artifacts for select to authenticated using ((select app_private.can_access_evidence(evidence_id)));
create policy evidence_artifacts_owner_insert on public.evidence_artifacts for insert to authenticated with check ((select app_private.can_access_evidence(evidence_id)));
create policy validation_results_scoped_read on public.validation_results for select to authenticated using ((select app_private.can_access_evidence(evidence_id)));

create policy mastery_events_scoped_read on public.mastery_events for select to authenticated
  using (learner_id = (select auth.uid()) or (select app_private.has_permission('organization.manage', organization_id)));
create policy mastery_snapshots_scoped_read on public.mastery_snapshots for select to authenticated
  using (learner_id = (select auth.uid()) or (select app_private.has_permission('organization.manage', organization_id)));

create policy lab_sessions_scoped on public.lab_sessions for select to authenticated
  using (learner_id = (select auth.uid()) or (select app_private.has_permission('organization.manage', organization_id)));
create policy lab_sessions_learner_insert on public.lab_sessions for insert to authenticated with check (learner_id = (select auth.uid()) and state = 'requested');
create policy lab_leases_scoped_read on public.lab_leases for select to authenticated
  using (exists (select 1 from public.lab_sessions ls where ls.id = lab_session_id and ls.learner_id = (select auth.uid())));

create policy portfolios_owner on public.portfolios for all to authenticated
  using (learner_id = (select auth.uid()) or (select app_private.has_permission('organization.manage', organization_id)))
  with check (learner_id = (select auth.uid()));
create policy portfolio_items_owner on public.portfolio_items for all to authenticated
  using (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.learner_id = (select auth.uid())))
  with check (exists (select 1 from public.portfolios p where p.id = portfolio_id and p.learner_id = (select auth.uid())));
create policy portfolio_publications_owner_read on public.portfolio_publications for select to authenticated
  using (exists (select 1 from public.portfolios p where p.id = portfolio_id and (p.learner_id = (select auth.uid()) or (select app_private.has_permission('organization.manage', p.organization_id)))));
create policy portfolio_publications_owner_insert on public.portfolio_publications for insert to authenticated
  with check (published_by = (select auth.uid()) and exists (select 1 from public.portfolios p where p.id = portfolio_id and p.learner_id = (select auth.uid())));

create policy certificates_scoped_read on public.certificates for select to authenticated
  using (learner_id = (select auth.uid()) or (select app_private.has_permission('organization.manage', organization_id)));
create policy certificate_events_scoped_read on public.certificate_events for select to authenticated
  using (exists (select 1 from public.certificates c where c.id = certificate_id and (c.learner_id = (select auth.uid()) or (select app_private.has_permission('organization.manage', c.organization_id)))));

create policy xp_ledger_self_read on public.xp_ledger for select to authenticated using (learner_id = (select auth.uid()));
create policy badge_awards_self_read on public.badge_awards for select to authenticated using (learner_id = (select auth.uid()));
create policy mission_progress_self on public.mission_progress for select to authenticated using (learner_id = (select auth.uid()));
create policy leaderboard_preferences_self on public.leaderboard_preferences for all to authenticated
  using (learner_id = (select auth.uid())) with check (learner_id = (select auth.uid()));

create policy notification_preferences_self on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_self_read on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_self_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

create policy audit_events_privileged_read on public.audit_events for select to authenticated
  using ((select app_private.has_permission('audit.read', organization_id)));
create policy integration_connections_admin on public.integration_connections for all to authenticated
  using ((select app_private.has_permission('integration.replay', organization_id)))
  with check ((select app_private.has_permission('integration.replay', organization_id)));
create policy integration_deliveries_admin on public.integration_deliveries for all to authenticated
  using (exists (select 1 from public.integration_connections ic where ic.id = connection_id and (select app_private.has_permission('integration.replay', ic.organization_id))))
  with check (exists (select 1 from public.integration_connections ic where ic.id = connection_id and (select app_private.has_permission('integration.replay', ic.organization_id))));
create policy outbox_events_integration_read on public.outbox_events for select to authenticated
  using ((select app_private.has_permission('integration.replay', organization_id)));

create policy ai_conversations_self on public.ai_conversations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ai_messages_self_read on public.ai_messages for select to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));
create policy ai_safety_decisions_self_read on public.ai_safety_decisions for select to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

create policy consent_records_self on public.consent_records for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.has_permission('privacy.manage', organization_id)));
create policy consent_records_self_insert on public.consent_records for insert to authenticated with check (user_id = (select auth.uid()));
create policy data_export_requests_self on public.data_export_requests for all to authenticated
  using (requester_id = (select auth.uid()) or (select app_private.has_permission('privacy.manage', organization_id)))
  with check (requester_id = (select auth.uid()) or (select app_private.has_permission('privacy.manage', organization_id)));
create policy data_deletion_requests_self on public.data_deletion_requests for all to authenticated
  using (requester_id = (select auth.uid()) or (select app_private.has_permission('privacy.manage', organization_id)))
  with check (requester_id = (select auth.uid()) or (select app_private.has_permission('privacy.manage', organization_id)));

create policy entitlements_scoped_read on public.entitlements for select to authenticated
  using (user_id = (select auth.uid()) or (select app_private.has_permission('organization.manage', organization_id)));
create policy support_issues_create on public.support_issues for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy support_issues_scoped on public.support_issues for select to authenticated
  using (reporter_id = (select auth.uid()) or assignee_id = (select auth.uid()) or (select app_private.has_permission('support.manage', organization_id)));
create policy support_issues_manage on public.support_issues for update to authenticated
  using ((select app_private.has_permission('support.manage', organization_id)))
  with check ((select app_private.has_permission('support.manage', organization_id)));

-- Atomic enrollment decision writes state, audit and outbox in one short transaction.
create or replace function public.decide_enrollment(
  p_enrollment_id uuid,
  p_expected_version bigint,
  p_decision public.enrollment_state,
  p_reason text,
  p_correlation_id uuid
)
returns public.enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.enrollments;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'unsupported enrollment decision' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'decision reason is required' using errcode = '22023';
  end if;

  update public.enrollments e
  set state = p_decision,
      decision_reason = p_reason,
      decided_by = (select auth.uid()),
      decided_at = statement_timestamp()
  where e.id = p_enrollment_id
    and e.row_version = p_expected_version
    and e.state = 'requested'
    and (select app_private.has_permission('enrollment.decide', e.organization_id, e.cohort_id))
  returning e.* into result;

  if result.id is null then
    raise exception 'enrollment is stale, missing, or forbidden' using errcode = '40001';
  end if;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    result.organization_id, (select auth.uid()), 'admin', 'enrollment.decided', 'enrollment',
    result.id, result.row_version, p_correlation_id, jsonb_build_object('decision', p_decision, 'reason', p_reason)
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    result.organization_id, 'enrollment', result.id, result.row_version,
    'enrollment.decided.v1', 1, p_correlation_id,
    jsonb_build_object('enrollment_id', result.id, 'learner_id', result.learner_id, 'state', result.state)
  );

  insert into public.notifications (organization_id, recipient_id, event_type, template_key, payload, deduplication_key)
  values (
    result.organization_id, result.learner_id, 'enrollment.decided', 'notifications.enrollment_decided',
    jsonb_build_object('enrollment_id', result.id, 'state', result.state),
    'enrollment:' || result.id::text || ':version:' || result.row_version::text
  ) on conflict (recipient_id, deduplication_key) do nothing;

  return result;
end;
$$;

revoke all on function public.decide_enrollment(uuid, bigint, public.enrollment_state, text, uuid) from public, anon;
grant execute on function public.decide_enrollment(uuid, bigint, public.enrollment_state, text, uuid) to authenticated, service_role;

