-- Competency graph, evidence ledger, labs, portfolios and credentials.

create table public.skills (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  code text not null,
  labels jsonb not null check (jsonb_typeof(labels) = 'object'),
  descriptions jsonb not null default '{}'::jsonb check (jsonb_typeof(descriptions) = 'object'),
  taxonomy_version integer not null default 1 check (taxonomy_version > 0),
  state public.record_state not null default 'draft',
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create unique index skills_global_code_version_uidx on public.skills (code, taxonomy_version) where organization_id is null;
create unique index skills_tenant_code_version_uidx on public.skills (organization_id, code, taxonomy_version) where organization_id is not null;
create index skills_org_state_idx on public.skills (organization_id, state, taxonomy_version desc, code);

create table public.skill_edges (
  id uuid primary key default app_private.uuid7(),
  parent_skill_id uuid not null references public.skills(id) on delete cascade,
  child_skill_id uuid not null references public.skills(id) on delete cascade,
  relation text not null check (relation in ('contains', 'prerequisite', 'related')),
  created_at timestamptz not null default statement_timestamp(),
  constraint skill_edges_no_self check (parent_skill_id <> child_skill_id),
  constraint skill_edges_unique unique (parent_skill_id, child_skill_id, relation)
);

create index skill_edges_child_idx on public.skill_edges (child_skill_id, relation, parent_skill_id);

create table public.task_skill_mappings (
  id uuid primary key default app_private.uuid7(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  mapping_version integer not null default 1 check (mapping_version > 0),
  weight_basis_points integer not null check (weight_basis_points between 1 and 10000),
  evidence_required boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  constraint task_skill_mappings_unique unique (task_id, skill_id, mapping_version)
);

create index task_skill_mappings_skill_idx on public.task_skill_mappings (skill_id, mapping_version, task_id);

create table public.prerequisites (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  learning_path_id uuid references public.learning_paths(id) on delete cascade,
  target_task_id uuid references public.tasks(id) on delete cascade,
  required_task_id uuid references public.tasks(id) on delete restrict,
  required_skill_id uuid references public.skills(id) on delete restrict,
  minimum_mastery_basis_points integer check (minimum_mastery_basis_points between 0 and 10000),
  rule_version integer not null default 1 check (rule_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  constraint prerequisites_target check ((learning_path_id is not null)::integer + (target_task_id is not null)::integer = 1),
  constraint prerequisites_requirement check ((required_task_id is not null)::integer + (required_skill_id is not null)::integer = 1),
  constraint prerequisites_not_self_task check (target_task_id is null or required_task_id is null or target_task_id <> required_task_id)
);

create index prerequisites_org_version_idx on public.prerequisites (organization_id, rule_version, created_at);
create index prerequisites_path_idx on public.prerequisites (learning_path_id, rule_version) where learning_path_id is not null;
create index prerequisites_target_task_idx on public.prerequisites (target_task_id, rule_version) where target_task_id is not null;
create index prerequisites_required_task_idx on public.prerequisites (required_task_id) where required_task_id is not null;
create index prerequisites_required_skill_idx on public.prerequisites (required_skill_id) where required_skill_id is not null;

create table public.rubrics (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  labels jsonb not null check (jsonb_typeof(labels) = 'object'),
  version integer not null default 1 check (version > 0),
  state public.record_state not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint rubrics_org_code_version_unique unique (organization_id, code, version)
);

create index rubrics_org_state_idx on public.rubrics (organization_id, state, code, version desc);
create index rubrics_created_by_idx on public.rubrics (created_by) where created_by is not null;

create table public.rubric_criteria (
  id uuid primary key default app_private.uuid7(),
  rubric_id uuid not null references public.rubrics(id) on delete cascade,
  skill_id uuid references public.skills(id) on delete restrict,
  code text not null,
  labels jsonb not null check (jsonb_typeof(labels) = 'object'),
  position integer not null check (position >= 0),
  max_points numeric(8,2) not null check (max_points > 0),
  required_for_acceptance boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  constraint rubric_criteria_rubric_code_unique unique (rubric_id, code),
  constraint rubric_criteria_rubric_position_unique unique (rubric_id, position)
);

create index rubric_criteria_skill_idx on public.rubric_criteria (skill_id, rubric_id) where skill_id is not null;

create table public.review_rubric_scores (
  id uuid primary key default app_private.uuid7(),
  review_id uuid not null references public.reviews(id) on delete restrict,
  criterion_id uuid not null references public.rubric_criteria(id) on delete restrict,
  points numeric(8,2) not null check (points >= 0),
  comment text,
  created_at timestamptz not null default statement_timestamp(),
  constraint review_rubric_scores_unique unique (review_id, criterion_id)
);

create index review_rubric_scores_criterion_idx on public.review_rubric_scores (criterion_id, review_id);

create table public.evidence (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  task_id uuid references public.tasks(id) on delete restrict,
  submission_version_id uuid references public.submission_versions(id) on delete restrict,
  lab_session_id uuid,
  evidence_kind text not null check (evidence_kind in ('submission', 'lab', 'upload', 'review', 'placement', 'external')),
  title text not null,
  source_uri text,
  sha256_hex text not null check (sha256_hex ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  captured_at timestamptz not null default statement_timestamp(),
  retention_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint evidence_title_not_blank check (length(btrim(title)) > 0),
  constraint evidence_source_present check (submission_version_id is not null or lab_session_id is not null or source_uri is not null)
);

create unique index evidence_owner_hash_uidx on public.evidence (owner_id, sha256_hex, evidence_kind);
create index evidence_org_created_idx on public.evidence (organization_id, created_at desc);
create index evidence_owner_created_idx on public.evidence (owner_id, created_at desc);
create index evidence_task_idx on public.evidence (task_id, captured_at desc) where task_id is not null;
create index evidence_submission_version_idx on public.evidence (submission_version_id) where submission_version_id is not null;
create index evidence_lab_session_idx on public.evidence (lab_session_id) where lab_session_id is not null;

create table public.evidence_artifacts (
  id uuid primary key default app_private.uuid7(),
  evidence_id uuid not null references public.evidence(id) on delete restrict,
  media_asset_id uuid not null references public.media_assets(id) on delete restrict,
  artifact_role text not null check (artifact_role in ('primary', 'supporting', 'log', 'screenshot', 'report')),
  created_at timestamptz not null default statement_timestamp(),
  constraint evidence_artifacts_unique unique (evidence_id, media_asset_id)
);

create index evidence_artifacts_media_idx on public.evidence_artifacts (media_asset_id, evidence_id);

create table public.validation_results (
  id uuid primary key default app_private.uuid7(),
  evidence_id uuid not null references public.evidence(id) on delete restrict,
  validator_code text not null,
  validator_version text not null,
  outcome text not null check (outcome in ('passed', 'failed', 'inconclusive', 'error')),
  score_basis_points integer check (score_basis_points between 0 and 10000),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  idempotency_key text not null,
  validated_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint validation_results_idempotency_unique unique (evidence_id, idempotency_key)
);

create index validation_results_evidence_created_idx on public.validation_results (evidence_id, validated_at desc);

create table public.mastery_events (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  evidence_id uuid references public.evidence(id) on delete restrict,
  previous_basis_points integer not null check (previous_basis_points between 0 and 10000),
  new_basis_points integer not null check (new_basis_points between 0 and 10000),
  rule_version integer not null check (rule_version > 0),
  rationale text not null,
  source_event_id uuid not null,
  recorded_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint mastery_events_source_unique unique (learner_id, skill_id, source_event_id),
  constraint mastery_events_rationale_not_blank check (length(btrim(rationale)) > 0)
);

create index mastery_events_learner_skill_idx on public.mastery_events (learner_id, skill_id, recorded_at desc);
create index mastery_events_org_recorded_idx on public.mastery_events (organization_id, recorded_at desc);
create index mastery_events_skill_recorded_idx on public.mastery_events (skill_id, recorded_at desc);
create index mastery_events_evidence_idx on public.mastery_events (evidence_id) where evidence_id is not null;

create table public.mastery_snapshots (
  learner_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  mastery_basis_points integer not null check (mastery_basis_points between 0 and 10000),
  source_event_id uuid not null references public.mastery_events(id) on delete restrict,
  rule_version integer not null check (rule_version > 0),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (learner_id, skill_id)
);

create index mastery_snapshots_skill_score_idx on public.mastery_snapshots (skill_id, mastery_basis_points desc);
create index mastery_snapshots_org_score_idx on public.mastery_snapshots (organization_id, mastery_basis_points desc);
create index mastery_snapshots_source_event_idx on public.mastery_snapshots (source_event_id);

create table public.placement_assessments (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  labels jsonb not null check (jsonb_typeof(labels) = 'object'),
  version integer not null default 1 check (version > 0),
  state public.record_state not null default 'draft',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint placement_assessments_org_code_version_unique unique (organization_id, code, version)
);

create index placement_assessments_org_state_idx on public.placement_assessments (organization_id, state, code);

create table public.placement_items (
  id uuid primary key default app_private.uuid7(),
  assessment_id uuid not null references public.placement_assessments(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete restrict,
  skill_id uuid not null references public.skills(id) on delete restrict,
  position integer not null check (position >= 0),
  weight_basis_points integer not null check (weight_basis_points between 1 and 10000),
  created_at timestamptz not null default statement_timestamp(),
  constraint placement_items_assessment_position_unique unique (assessment_id, position),
  constraint placement_items_assessment_task_unique unique (assessment_id, task_id)
);

create index placement_items_task_idx on public.placement_items (task_id, assessment_id);
create index placement_items_skill_idx on public.placement_items (skill_id, assessment_id);

create table public.placement_attempts (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  assessment_id uuid not null references public.placement_assessments(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete cascade,
  state public.attempt_state not null default 'in_progress',
  responses jsonb not null default '{}'::jsonb check (jsonb_typeof(responses) = 'object'),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  idempotency_key text not null,
  row_version bigint not null default 1 check (row_version > 0),
  started_at timestamptz not null default statement_timestamp(),
  submitted_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint placement_attempts_idempotency_unique unique (learner_id, idempotency_key)
);

create index placement_attempts_learner_state_idx on public.placement_attempts (learner_id, state, updated_at desc);
create index placement_attempts_assessment_state_idx on public.placement_attempts (assessment_id, state, started_at desc);
create index placement_attempts_org_state_idx on public.placement_attempts (organization_id, state, started_at desc);

create table public.lab_definitions (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  code text not null,
  labels jsonb not null check (jsonb_typeof(labels) = 'object'),
  provider_kind text not null default 'unconfigured',
  scenario_version text not null,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  retention_seconds integer not null default 3600 check (retention_seconds between 300 and 604800),
  state public.record_state not null default 'draft',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create unique index lab_definitions_global_code_version_uidx on public.lab_definitions (code, scenario_version) where organization_id is null;
create unique index lab_definitions_tenant_code_version_uidx on public.lab_definitions (organization_id, code, scenario_version) where organization_id is not null;
create index lab_definitions_org_state_idx on public.lab_definitions (organization_id, state, code);

create table public.lab_sessions (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  lab_definition_id uuid not null references public.lab_definitions(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid references public.attempts(id) on delete restrict,
  state public.lab_session_state not null default 'requested',
  provider_reference text,
  idempotency_key text not null,
  failure_code text,
  failure_detail_redacted text,
  row_version bigint not null default 1 check (row_version > 0),
  requested_at timestamptz not null default statement_timestamp(),
  ready_at timestamptz,
  expires_at timestamptz,
  destroyed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint lab_sessions_idempotency_unique unique (learner_id, idempotency_key),
  constraint lab_sessions_expiry_order check (expires_at is null or expires_at > requested_at)
);

create unique index lab_sessions_active_learner_definition_uidx on public.lab_sessions (learner_id, lab_definition_id) where state in ('requested', 'provisioning', 'ready', 'active', 'validating', 'reset_pending');
create index lab_sessions_learner_state_idx on public.lab_sessions (learner_id, state, requested_at desc);
create index lab_sessions_definition_state_idx on public.lab_sessions (lab_definition_id, state, requested_at);
create index lab_sessions_org_state_idx on public.lab_sessions (organization_id, state, requested_at);
create index lab_sessions_attempt_idx on public.lab_sessions (attempt_id) where attempt_id is not null;
create index lab_sessions_expiry_idx on public.lab_sessions (expires_at) where state not in ('destroyed', 'expired');

alter table public.evidence
  add constraint evidence_lab_session_fkey foreign key (lab_session_id) references public.lab_sessions(id) on delete restrict;

create table public.lab_leases (
  id uuid primary key default app_private.uuid7(),
  lab_session_id uuid not null unique references public.lab_sessions(id) on delete cascade,
  lease_hash text not null unique check (length(lease_hash) >= 32),
  issued_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint lab_leases_expiry check (expires_at > issued_at)
);

create index lab_leases_active_expiry_idx on public.lab_leases (expires_at) where revoked_at is null;

create table public.portfolios (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  summary text not null default '',
  visibility text not null default 'private' check (visibility in ('private', 'organization', 'public')),
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint portfolios_learner_unique unique (learner_id),
  constraint portfolios_title_not_blank check (length(btrim(title)) > 0)
);

create index portfolios_org_visibility_idx on public.portfolios (organization_id, visibility, updated_at desc);

create table public.portfolio_items (
  id uuid primary key default app_private.uuid7(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  evidence_id uuid not null references public.evidence(id) on delete restrict,
  position integer not null check (position >= 0),
  reflection text not null default '',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint portfolio_items_evidence_unique unique (portfolio_id, evidence_id),
  constraint portfolio_items_position_unique unique (portfolio_id, position)
);

create index portfolio_items_evidence_idx on public.portfolio_items (evidence_id, portfolio_id);

create table public.portfolio_publications (
  id uuid primary key default app_private.uuid7(),
  portfolio_id uuid not null references public.portfolios(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  verifier_token_hash text not null unique check (length(verifier_token_hash) >= 32),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  published_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint portfolio_publications_version_unique unique (portfolio_id, version_number),
  constraint portfolio_publications_expiry check (expires_at is null or expires_at > published_at)
);

create index portfolio_publications_portfolio_published_idx on public.portfolio_publications (portfolio_id, published_at desc);
create index portfolio_publications_published_by_idx on public.portfolio_publications (published_by, published_at desc);

create table public.certificates (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete restrict,
  course_id uuid references public.courses(id) on delete restrict,
  state public.certificate_state not null default 'eligible',
  certificate_type text not null default 'course_completion' check (certificate_type in ('course_completion', 'exam', 'competency')),
  idempotency_key text not null,
  verification_token_hash text unique check (verification_token_hash is null or length(verification_token_hash) >= 32),
  media_asset_id uuid references public.media_assets(id) on delete restrict,
  eligibility_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(eligibility_snapshot) = 'object'),
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz,
  available_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint certificates_idempotency_unique unique (learner_id, idempotency_key),
  constraint certificates_issued_consistency check ((state in ('issued', 'available', 'revoked', 'expired') and issued_at is not null) or state = 'eligible')
);

create index certificates_learner_state_idx on public.certificates (learner_id, state, created_at desc);
create index certificates_org_state_idx on public.certificates (organization_id, state, created_at desc);
create index certificates_course_idx on public.certificates (course_id, state) where course_id is not null;
create index certificates_media_asset_idx on public.certificates (media_asset_id) where media_asset_id is not null;
create index certificates_issued_by_idx on public.certificates (issued_by) where issued_by is not null;

create table public.certificate_events (
  id uuid primary key default app_private.uuid7(),
  certificate_id uuid not null references public.certificates(id) on delete restrict,
  from_state public.certificate_state,
  to_state public.certificate_state not null,
  actor_id uuid references auth.users(id) on delete set null,
  reason text not null,
  source_event_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint certificate_events_source_unique unique (certificate_id, source_event_id),
  constraint certificate_events_reason_not_blank check (length(btrim(reason)) > 0)
);

create index certificate_events_certificate_created_idx on public.certificate_events (certificate_id, created_at desc);
create index certificate_events_actor_idx on public.certificate_events (actor_id, created_at desc) where actor_id is not null;

create trigger skills_bump_row_version before update on public.skills for each row execute function app_private.bump_row_version();
create trigger rubrics_set_updated_at before update on public.rubrics for each row execute function app_private.set_updated_at();
create trigger placement_assessments_set_updated_at before update on public.placement_assessments for each row execute function app_private.set_updated_at();
create trigger placement_attempts_bump_row_version before update on public.placement_attempts for each row execute function app_private.bump_row_version();
create trigger lab_definitions_set_updated_at before update on public.lab_definitions for each row execute function app_private.set_updated_at();
create trigger lab_sessions_bump_row_version before update on public.lab_sessions for each row execute function app_private.bump_row_version();
create trigger portfolios_bump_row_version before update on public.portfolios for each row execute function app_private.bump_row_version();
create trigger portfolio_items_set_updated_at before update on public.portfolio_items for each row execute function app_private.set_updated_at();
create trigger certificates_bump_row_version before update on public.certificates for each row execute function app_private.bump_row_version();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'review_rubric_scores', 'evidence', 'evidence_artifacts', 'validation_results',
    'mastery_events', 'portfolio_publications', 'certificate_events'
  ]
  loop
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function app_private.reject_mutation()',
      table_name || '_immutable', table_name
    );
  end loop;
end $$;

