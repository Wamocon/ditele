-- Engagement, notifications, audit/outbox, integrations, AI and privacy operations.

create table public.xp_ledger (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  source_event_id uuid not null,
  source_kind text not null check (source_kind in ('accepted_submission', 'validated_evidence', 'mastery_gain', 'completed_mission')),
  points integer not null check (points > 0),
  rule_version integer not null check (rule_version > 0),
  rationale text not null,
  awarded_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint xp_ledger_source_unique unique (learner_id, source_event_id),
  constraint xp_ledger_rationale_not_blank check (length(btrim(rationale)) > 0)
);

create index xp_ledger_learner_awarded_idx on public.xp_ledger (learner_id, awarded_at desc);
create index xp_ledger_org_awarded_idx on public.xp_ledger (organization_id, awarded_at desc);
create index xp_ledger_skill_awarded_idx on public.xp_ledger (skill_id, awarded_at desc);

create table public.badges (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  code text not null,
  labels jsonb not null check (jsonb_typeof(labels) = 'object'),
  descriptions jsonb not null default '{}'::jsonb check (jsonb_typeof(descriptions) = 'object'),
  rule jsonb not null check (jsonb_typeof(rule) = 'object'),
  rule_version integer not null default 1 check (rule_version > 0),
  state public.record_state not null default 'draft',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create unique index badges_global_code_version_uidx on public.badges (code, rule_version) where organization_id is null;
create unique index badges_tenant_code_version_uidx on public.badges (organization_id, code, rule_version) where organization_id is not null;
create index badges_org_state_idx on public.badges (organization_id, state, code);

create table public.badge_awards (
  id uuid primary key default app_private.uuid7(),
  badge_id uuid not null references public.badges(id) on delete restrict,
  learner_id uuid not null references auth.users(id) on delete cascade,
  source_event_id uuid not null,
  awarded_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint badge_awards_source_unique unique (badge_id, learner_id, source_event_id)
);

create index badge_awards_learner_idx on public.badge_awards (learner_id, awarded_at desc);

create table public.missions (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  labels jsonb not null check (jsonb_typeof(labels) = 'object'),
  rule jsonb not null check (jsonb_typeof(rule) = 'object'),
  rule_version integer not null default 1 check (rule_version > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  state public.record_state not null default 'draft',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint missions_org_code_version_unique unique (organization_id, code, rule_version),
  constraint missions_time_order check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index missions_org_state_idx on public.missions (organization_id, state, starts_at, ends_at);

create table public.mission_progress (
  id uuid primary key default app_private.uuid7(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  completed_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint mission_progress_learner_unique unique (mission_id, learner_id)
);

create index mission_progress_learner_idx on public.mission_progress (learner_id, updated_at desc);

create table public.leaderboard_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  learner_id uuid not null references auth.users(id) on delete cascade,
  opted_in boolean not null default false,
  alias text,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (organization_id, learner_id),
  constraint leaderboard_preferences_alias check (not opted_in or nullif(btrim(alias), '') is not null)
);

create index leaderboard_preferences_opt_in_idx on public.leaderboard_preferences (organization_id, updated_at desc) where opted_in;

create table public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'push')),
  event_family text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (user_id, channel, event_family)
);

create table public.notifications (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  template_key text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  deduplication_key text not null,
  state public.notification_state not null default 'pending',
  created_at timestamptz not null default statement_timestamp(),
  delivered_at timestamptz,
  read_at timestamptz,
  cancelled_at timestamptz,
  constraint notifications_deduplication_unique unique (recipient_id, deduplication_key)
);

create index notifications_recipient_unread_idx on public.notifications (recipient_id, created_at desc) where read_at is null and cancelled_at is null;
create index notifications_delivery_queue_idx on public.notifications (state, created_at) where state in ('pending', 'failed');
create index notifications_org_created_idx on public.notifications (organization_id, created_at desc) where organization_id is not null;

create table public.delivery_attempts (
  id uuid primary key default app_private.uuid7(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'push')),
  attempt_number integer not null check (attempt_number > 0),
  outcome text not null check (outcome in ('delivered', 'retry', 'failed', 'suppressed')),
  provider_reference text,
  error_code text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint delivery_attempts_notification_number_unique unique (notification_id, channel, attempt_number)
);

create index delivery_attempts_retry_idx on public.delivery_attempts (next_attempt_at) where outcome = 'retry';

create table public.analytics_consents (
  id uuid primary key default app_private.uuid7(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  purpose text not null,
  policy_version text not null,
  granted boolean not null,
  recorded_at timestamptz not null default statement_timestamp(),
  withdrawn_at timestamptz,
  constraint analytics_consents_scope_version_unique unique (user_id, organization_id, purpose, policy_version)
);

create index analytics_consents_org_purpose_idx on public.analytics_consents (organization_id, purpose, recorded_at desc) where organization_id is not null;

create table public.analytics_events (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  schema_version integer not null check (schema_version > 0),
  occurred_at timestamptz not null default statement_timestamp(),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  consent_id uuid references public.analytics_consents(id) on delete set null,
  correlation_id uuid,
  retention_until timestamptz,
  created_at timestamptz not null default statement_timestamp()
);

create index analytics_events_org_name_time_idx on public.analytics_events (organization_id, event_name, occurred_at desc);
create index analytics_events_actor_time_idx on public.analytics_events (actor_id, occurred_at desc) where actor_id is not null;
create index analytics_events_consent_idx on public.analytics_events (consent_id) where consent_id is not null;
create index analytics_events_retention_idx on public.analytics_events (retention_until) where retention_until is not null;

create table public.audit_events (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  aggregate_version bigint,
  correlation_id uuid not null,
  causation_id uuid,
  ip_hash text,
  user_agent_hash text,
  consent_basis text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp()
);

create index audit_events_org_time_idx on public.audit_events (organization_id, occurred_at desc) where organization_id is not null;
create index audit_events_actor_time_idx on public.audit_events (actor_id, occurred_at desc) where actor_id is not null;
create index audit_events_aggregate_idx on public.audit_events (aggregate_type, aggregate_id, occurred_at desc);
create index audit_events_correlation_idx on public.audit_events (correlation_id, occurred_at);

create table public.outbox_events (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_version bigint not null check (aggregate_version > 0),
  event_type text not null,
  schema_version integer not null check (schema_version > 0),
  correlation_id uuid not null,
  causation_id uuid,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  available_at timestamptz not null default statement_timestamp(),
  claimed_at timestamptz,
  processed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  created_at timestamptz not null default statement_timestamp(),
  constraint outbox_events_aggregate_version_unique unique (aggregate_type, aggregate_id, aggregate_version, event_type)
);

create index outbox_events_pending_queue_idx on public.outbox_events (available_at, created_at) where processed_at is null;
create index outbox_events_org_pending_idx on public.outbox_events (organization_id, available_at) where processed_at is null and organization_id is not null;
create index outbox_events_correlation_idx on public.outbox_events (correlation_id);

create table public.integration_connections (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider_kind text not null check (provider_kind in ('eloomi', 'lti', 'xapi', 'cmi5', 'webhook', 'oidc')),
  name text not null,
  state public.record_state not null default 'draft',
  configuration_redacted jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration_redacted) = 'object'),
  secret_reference text,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint integration_connections_org_name_unique unique (organization_id, provider_kind, name)
);

create index integration_connections_org_state_idx on public.integration_connections (organization_id, provider_kind, state);

create table public.integration_deliveries (
  id uuid primary key default app_private.uuid7(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  outbox_event_id uuid not null references public.outbox_events(id) on delete restrict,
  state public.delivery_state not null default 'pending',
  idempotency_key text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  acknowledged_at timestamptz,
  last_error_code text,
  last_error_redacted text,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint integration_deliveries_idempotency_unique unique (connection_id, idempotency_key),
  constraint integration_deliveries_event_unique unique (connection_id, outbox_event_id)
);

create index integration_deliveries_queue_idx on public.integration_deliveries (state, next_attempt_at, created_at) where state in ('pending', 'retry_scheduled');
create index integration_deliveries_event_idx on public.integration_deliveries (outbox_event_id);

create table public.webhook_deliveries (
  id uuid primary key default app_private.uuid7(),
  integration_delivery_id uuid not null unique references public.integration_deliveries(id) on delete cascade,
  endpoint_hash text not null,
  request_signature_version text not null,
  response_status integer check (response_status between 100 and 599),
  response_body_hash text,
  delivered_at timestamptz,
  created_at timestamptz not null default statement_timestamp()
);

create table public.integration_checkpoints (
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  stream_name text not null,
  checkpoint_value text not null,
  last_delivery_id uuid references public.integration_deliveries(id) on delete set null,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (connection_id, stream_name)
);

create index integration_checkpoints_delivery_idx on public.integration_checkpoints (last_delivery_id) where last_delivery_id is not null;

create table public.ai_conversations (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  user_id uuid references auth.users(id) on delete cascade,
  mode public.ai_mode not null,
  task_id uuid references public.tasks(id) on delete restrict,
  state public.record_state not null default 'active',
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index ai_conversations_user_time_idx on public.ai_conversations (user_id, created_at desc) where user_id is not null;
create index ai_conversations_org_mode_idx on public.ai_conversations (organization_id, mode, created_at desc) where organization_id is not null;
create index ai_conversations_task_idx on public.ai_conversations (task_id, created_at desc) where task_id is not null;

create table public.ai_messages (
  id uuid primary key default app_private.uuid7(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  sender text not null check (sender in ('user', 'assistant', 'system')),
  redacted_content text not null,
  source_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(source_refs) = 'array'),
  created_at timestamptz not null default statement_timestamp()
);

create index ai_messages_conversation_created_idx on public.ai_messages (conversation_id, created_at);

create table public.ai_safety_decisions (
  id uuid primary key default app_private.uuid7(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  message_id uuid references public.ai_messages(id) on delete cascade,
  outcome public.ai_safety_outcome not null,
  policy_version text not null,
  reason_codes text[] not null default '{}',
  created_at timestamptz not null default statement_timestamp()
);

create index ai_safety_decisions_conversation_idx on public.ai_safety_decisions (conversation_id, created_at desc);
create index ai_safety_decisions_message_idx on public.ai_safety_decisions (message_id) where message_id is not null;

create table public.ai_usage_events (
  id uuid primary key default app_private.uuid7(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  provider_code text not null,
  model_code text not null,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  estimated_cost_microunits bigint not null default 0 check (estimated_cost_microunits >= 0),
  provider_request_hash text,
  created_at timestamptz not null default statement_timestamp()
);

create index ai_usage_events_conversation_idx on public.ai_usage_events (conversation_id, created_at desc);
create index ai_usage_events_provider_time_idx on public.ai_usage_events (provider_code, created_at desc);

create table public.consent_records (
  id uuid primary key default app_private.uuid7(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  purpose text not null,
  legal_basis text not null,
  text_version text not null,
  granted boolean not null,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  recorded_at timestamptz not null default statement_timestamp(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint consent_records_version_unique unique (user_id, organization_id, purpose, text_version)
);

create index consent_records_org_purpose_idx on public.consent_records (organization_id, purpose, recorded_at desc) where organization_id is not null;

create table public.retention_policies (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete cascade,
  data_class text not null,
  policy_version text not null,
  retention_days integer not null check (retention_days > 0),
  legal_hold_enabled boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint retention_policies_scope_version_unique unique (organization_id, data_class, policy_version),
  constraint retention_policies_time_order check (effective_until is null or effective_until > effective_from)
);

create index retention_policies_org_effective_idx on public.retention_policies (organization_id, effective_from desc);
create index retention_policies_approved_by_idx on public.retention_policies (approved_by) where approved_by is not null;

create table public.data_export_requests (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  requester_id uuid not null references auth.users(id) on delete cascade,
  state public.request_state not null default 'requested',
  idempotency_key text not null,
  export_object_key text,
  export_sha256_hex text check (export_sha256_hex is null or export_sha256_hex ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz,
  completed_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint data_export_requests_idempotency_unique unique (requester_id, idempotency_key)
);

create index data_export_requests_requester_state_idx on public.data_export_requests (requester_id, state, created_at desc);
create index data_export_requests_org_state_idx on public.data_export_requests (organization_id, state, created_at) where organization_id is not null;

create table public.data_deletion_requests (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  requester_id uuid not null references auth.users(id) on delete cascade,
  state public.request_state not null default 'requested',
  idempotency_key text not null,
  legal_hold_reason text,
  decision_reason text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  completed_at timestamptz,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint data_deletion_requests_idempotency_unique unique (requester_id, idempotency_key)
);

create index data_deletion_requests_requester_state_idx on public.data_deletion_requests (requester_id, state, created_at desc);
create index data_deletion_requests_org_state_idx on public.data_deletion_requests (organization_id, state, created_at) where organization_id is not null;
create index data_deletion_requests_decided_by_idx on public.data_deletion_requests (decided_by) where decided_by is not null;

create table public.product_packages (
  id uuid primary key default app_private.uuid7(),
  code text not null unique,
  labels jsonb not null check (jsonb_typeof(labels) = 'object'),
  capabilities text[] not null default '{}',
  state public.record_state not null default 'draft',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table public.entitlements (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  product_package_id uuid not null references public.product_packages(id) on delete restrict,
  capability text not null,
  valid_from timestamptz not null default statement_timestamp(),
  valid_until timestamptz,
  source text not null default 'manual' check (source in ('manual', 'contract', 'promotion', 'migration')),
  source_reference text,
  created_at timestamptz not null default statement_timestamp(),
  constraint entitlements_validity check (valid_until is null or valid_until > valid_from)
);

create unique index entitlements_live_scope_uidx
  on public.entitlements (organization_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), product_package_id, capability)
  where valid_until is null;
create index entitlements_user_capability_idx on public.entitlements (user_id, capability, valid_until) where user_id is not null;
create index entitlements_package_idx on public.entitlements (product_package_id, capability);
create index entitlements_org_capability_idx on public.entitlements (organization_id, capability, valid_until);

create table public.support_issues (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid references public.organizations(id) on delete restrict,
  reporter_id uuid references auth.users(id) on delete set null,
  assignee_id uuid references auth.users(id) on delete set null,
  severity text not null check (severity in ('p0', 'p1', 'p2', 'p3')),
  state text not null default 'open' check (state in ('open', 'triaged', 'in_progress', 'resolved', 'closed')),
  title text not null,
  description_redacted text not null,
  correlation_id uuid,
  row_version bigint not null default 1 check (row_version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  resolved_at timestamptz,
  constraint support_issues_title_not_blank check (length(btrim(title)) > 0)
);

create index support_issues_queue_idx on public.support_issues (state, severity, created_at) where state not in ('resolved', 'closed');
create index support_issues_org_queue_idx on public.support_issues (organization_id, state, created_at) where organization_id is not null;
create index support_issues_reporter_idx on public.support_issues (reporter_id, created_at desc) where reporter_id is not null;
create index support_issues_assignee_idx on public.support_issues (assignee_id, state, created_at) where assignee_id is not null;

create table public.external_id_mappings (
  id uuid primary key default app_private.uuid7(),
  source_system text not null,
  entity_type text not null,
  external_id text not null,
  canonical_id uuid not null,
  source_checksum text,
  migrated_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  constraint external_id_mappings_source_unique unique (source_system, entity_type, external_id),
  constraint external_id_mappings_canonical_unique unique (source_system, entity_type, canonical_id)
);

create index external_id_mappings_canonical_idx on public.external_id_mappings (canonical_id, entity_type);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'badges', 'missions', 'integration_connections', 'integration_deliveries',
    'mission_progress', 'data_export_requests', 'data_deletion_requests', 'support_issues'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.bump_row_version()',
      table_name || '_bump_row_version', table_name
    );
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'leaderboard_preferences', 'notification_preferences', 'integration_checkpoints',
    'ai_conversations', 'product_packages'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'xp_ledger', 'badge_awards', 'delivery_attempts', 'analytics_consents',
    'analytics_events', 'audit_events', 'webhook_deliveries', 'ai_messages',
    'ai_safety_decisions', 'ai_usage_events', 'consent_records', 'external_id_mappings'
  ]
  loop
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function app_private.reject_mutation()',
      table_name || '_immutable', table_name
    );
  end loop;
end $$;

