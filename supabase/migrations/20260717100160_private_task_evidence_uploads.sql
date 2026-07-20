-- BUG-047: private, actor-bound task evidence uploads.
--
-- Objects are quarantined behind an exact upload intent. The database never
-- trusts browser-supplied object metadata: only the service-only finalize RPC
-- may persist the MIME type, byte count and digest produced by the server-side
-- byte validator. Evidence provenance remains append-only after finalization.

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'task-evidence-private',
  'task-evidence-private',
  false,
  26214400,
  array[
    'application/json',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'text/csv',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    updated_at = statement_timestamp();

create type public.evidence_upload_state as enum (
  'pending', 'ready', 'rejected', 'removed', 'expired'
);

-- Uploaded evidence has an artifact row rather than a public/source URI. All
-- other evidence kinds retain the original source-presence rule.
alter table public.evidence
  drop constraint evidence_source_present,
  add constraint evidence_source_present check (
    (
      evidence_kind = 'upload'
      and source_uri is null
      and submission_version_id is null
      and lab_session_id is null
    )
    or (
      evidence_kind <> 'upload'
      and (
        submission_version_id is not null
        or lab_session_id is not null
        or source_uri is not null
      )
    )
  );

-- The old index made a file digest globally unique per owner and kind. Keep
-- that behavior unchanged for every non-upload kind. Upload uniqueness belongs
-- to the mutable upload lifecycle below: an immutable evidence row survives a
-- draft removal, while a later independently validated re-upload must remain
-- possible.
drop index public.evidence_owner_hash_uidx;

create unique index evidence_owner_hash_non_upload_uidx
  on public.evidence (owner_id, sha256_hex, evidence_kind)
  where evidence_kind <> 'upload';

create table public.evidence_uploads (
  id uuid primary key default app_private.uuid7(),
  organization_id uuid not null,
  enrollment_id uuid not null,
  owner_id uuid not null,
  cohort_id uuid not null,
  course_id uuid not null,
  content_version_id uuid not null,
  task_id uuid not null,
  attempt_id uuid not null,
  bucket_id text not null default 'task-evidence-private',
  object_key text not null,
  title text not null,
  original_file_name text not null,
  declared_mime_type text not null,
  declared_byte_size bigint not null,
  client_sha256 text not null,
  verified_mime_type text,
  verified_byte_size bigint,
  verified_sha256 text,
  state public.evidence_upload_state not null default 'pending',
  evidence_id uuid references public.evidence(id) on delete restrict,
  media_asset_id uuid references public.media_assets(id) on delete restrict,
  idempotency_key text not null,
  correlation_id uuid not null,
  expires_at timestamptz not null,
  finalized_at timestamptz,
  rejected_at timestamptz,
  removed_at timestamptz,
  expired_at timestamptz,
  rejection_code text,
  cleanup_available_at timestamptz,
  cleanup_claim_token uuid,
  cleanup_claimed_by text,
  cleanup_claimed_at timestamptz,
  cleanup_lease_expires_at timestamptz,
  cleanup_attempt_count integer not null default 0,
  cleanup_last_error_code text,
  storage_deleted_at timestamptz,
  row_version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint evidence_uploads_attempt_context_fk foreign key (
    attempt_id, organization_id, enrollment_id, owner_id, cohort_id,
    course_id, content_version_id, task_id
  ) references public.attempts (
    id, organization_id, enrollment_id, learner_id, cohort_id,
    course_id, content_version_id, task_id
  ) on delete restrict,
  constraint evidence_uploads_actor_key_unique
    unique (owner_id, idempotency_key),
  constraint evidence_uploads_object_key_unique unique (object_key),
  constraint evidence_uploads_evidence_unique unique (evidence_id),
  constraint evidence_uploads_media_asset_unique unique (media_asset_id),
  constraint evidence_uploads_exact_identity_unique
    unique (id, owner_id, attempt_id),
  constraint evidence_uploads_bucket check (
    bucket_id = 'task-evidence-private'
  ),
  constraint evidence_uploads_object_key check (
    object_key = organization_id::text || '/' || owner_id::text || '/'
      || attempt_id::text || '/' || id::text
  ),
  constraint evidence_uploads_title check (
    title = btrim(title) and length(title) between 1 and 255
  ),
  constraint evidence_uploads_file_name check (
    original_file_name = btrim(original_file_name)
    and length(original_file_name) between 1 and 255
    and octet_length(original_file_name) <= 255
    and original_file_name !~ '[\\/[:cntrl:]]'
  ),
  constraint evidence_uploads_declared_mime check (
    declared_mime_type in (
      'application/json', 'application/pdf', 'image/jpeg', 'image/png',
      'text/csv', 'text/plain'
    )
  ),
  constraint evidence_uploads_declared_size check (
    declared_byte_size between 1 and case declared_mime_type
      when 'application/json' then 1048576
      when 'text/csv' then 5242880
      when 'text/plain' then 5242880
      when 'application/pdf' then 10485760
      when 'image/jpeg' then 26214400
      when 'image/png' then 26214400
      else 0
    end
  ),
  constraint evidence_uploads_client_hash check (
    client_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint evidence_uploads_verified_tuple check (
    (
      verified_mime_type is null
      and verified_byte_size is null
      and verified_sha256 is null
    )
    or (
      verified_mime_type is not null
      and verified_byte_size is not null
      and verified_sha256 is not null
      and verified_mime_type in (
        'application/json', 'application/pdf', 'image/jpeg', 'image/png',
        'text/csv', 'text/plain'
      )
      and verified_byte_size between 1 and case verified_mime_type
        when 'application/json' then 1048576
        when 'text/csv' then 5242880
        when 'text/plain' then 5242880
        when 'application/pdf' then 10485760
        when 'image/jpeg' then 26214400
        when 'image/png' then 26214400
        else 0
      end
      and verified_sha256 ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint evidence_uploads_rejection_code check (
    rejection_code is null
    or rejection_code in (
      'empty_file', 'hash_mismatch', 'intent_expired', 'malformed_content',
      'malware_detected', 'mime_mismatch', 'object_unavailable',
      'size_mismatch', 'unsupported_content'
    )
  ),
  constraint evidence_uploads_idempotency_key check (
    length(idempotency_key) between 16 and 200
  ),
  constraint evidence_uploads_expiry check (
    expires_at > created_at
    and expires_at <= created_at + interval '3 hours'
  ),
  constraint evidence_uploads_cleanup check (
    cleanup_attempt_count >= 0
    and (
      (
        cleanup_claim_token is null
        and cleanup_claimed_by is null
        and cleanup_claimed_at is null
        and cleanup_lease_expires_at is null
      )
      or (
        cleanup_claim_token is not null
        and cleanup_claimed_by is not null
        and cleanup_claimed_at is not null
        and cleanup_lease_expires_at is not null
        and cleanup_claimed_by ~ '^[a-z0-9_.:-]{1,80}$'
        and cleanup_lease_expires_at > cleanup_claimed_at
        and state in ('rejected', 'removed', 'expired')
        and storage_deleted_at is null
      )
    )
    and (
      cleanup_last_error_code is null
      or cleanup_last_error_code ~ '^[a-z0-9_.-]{1,80}$'
    )
    and (
      storage_deleted_at is null
      or state in ('rejected', 'removed', 'expired')
    )
  ),
  constraint evidence_uploads_row_version check (row_version > 0),
  constraint evidence_uploads_state_consistency check (
    (
      state = 'pending'
      and verified_sha256 is null
      and evidence_id is null
      and media_asset_id is null
      and finalized_at is null
      and rejected_at is null
      and removed_at is null
      and expired_at is null
      and rejection_code is null
      and storage_deleted_at is null
    )
    or (
      state = 'ready'
      and verified_sha256 is not null
      and evidence_id is not null
      and media_asset_id is not null
      and finalized_at is not null
      and rejected_at is null
      and removed_at is null
      and expired_at is null
      and rejection_code is null
      and cleanup_available_at is null
      and storage_deleted_at is null
    )
    or (
      state = 'rejected'
      and verified_sha256 is null
      and evidence_id is null
      and media_asset_id is null
      and finalized_at is null
      and rejected_at is not null
      and removed_at is null
      and expired_at is null
      and rejection_code is not null
    )
    or (
      state = 'removed'
      and verified_sha256 is not null
      and evidence_id is not null
      and media_asset_id is not null
      and finalized_at is not null
      and rejected_at is null
      and removed_at is not null
      and expired_at is null
      and rejection_code is null
    )
    or (
      state = 'expired'
      and verified_sha256 is null
      and evidence_id is null
      and media_asset_id is null
      and finalized_at is null
      and rejected_at is null
      and removed_at is null
      and expired_at is not null
      and rejection_code = 'intent_expired'
    )
  )
);

create index evidence_uploads_attempt_context_idx on public.evidence_uploads (
  attempt_id, organization_id, enrollment_id, owner_id, cohort_id,
  course_id, content_version_id, task_id
);
create index evidence_uploads_owner_state_idx on public.evidence_uploads (
  owner_id, state, created_at desc
);
create index evidence_uploads_cleanup_idx on public.evidence_uploads (
  cleanup_available_at, created_at
) where state in ('pending', 'rejected', 'removed', 'expired')
  and storage_deleted_at is null;

create index evidence_uploads_pending_expiry_idx
  on public.evidence_uploads (expires_at, created_at, id)
  where state = 'pending';

create index evidence_uploads_owner_pending_quota_idx
  on public.evidence_uploads (owner_id, expires_at)
  include (declared_byte_size)
  where state = 'pending';

create unique index evidence_uploads_ready_digest_uidx
  on public.evidence_uploads (owner_id, attempt_id, verified_sha256)
  where state = 'ready';

create table public.evidence_upload_command_receipts (
  id uuid primary key default app_private.uuid7(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (
    operation in ('intent', 'finalize', 'reject', 'remove')
  ),
  upload_id uuid not null,
  attempt_id uuid not null,
  evidence_id uuid references public.evidence(id) on delete restrict,
  expected_draft_version bigint,
  result_draft_version bigint,
  idempotency_key text not null check (
    length(idempotency_key) between 16 and 200
  ),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  correlation_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz not null default statement_timestamp(),
  constraint evidence_upload_receipts_actor_operation_key_unique
    unique (actor_id, operation, idempotency_key),
  constraint evidence_upload_receipts_upload_context_fk foreign key (
    upload_id, actor_id, attempt_id
  ) references public.evidence_uploads (id, owner_id, attempt_id)
    on delete restrict,
  constraint evidence_upload_receipts_result_consistency check (
    (
      operation in ('intent', 'reject')
      and evidence_id is null
      and expected_draft_version is null
      and result_draft_version is null
    )
    or (
      operation = 'finalize'
      and evidence_id is not null
      and expected_draft_version is null
      and result_draft_version is null
    )
    or (
      operation = 'remove'
      and evidence_id is not null
      and expected_draft_version is not null
      and result_draft_version is not null
      and expected_draft_version > 0
      and result_draft_version >= expected_draft_version
    )
  )
);

create index evidence_upload_receipts_upload_context_idx
  on public.evidence_upload_command_receipts (
    upload_id, actor_id, attempt_id
  );
create index evidence_upload_receipts_evidence_idx
  on public.evidence_upload_command_receipts (evidence_id)
  where evidence_id is not null;

alter table public.evidence_uploads enable row level security;
alter table public.evidence_uploads force row level security;
alter table public.evidence_upload_command_receipts enable row level security;
alter table public.evidence_upload_command_receipts force row level security;

revoke all on public.evidence_uploads
  from public, anon, authenticated, service_role;
revoke all on public.evidence_upload_command_receipts
  from public, anon, authenticated, service_role;

-- Evidence artifact linkage and evidence-kind media metadata are command-owned.
-- Preserve existing authoring behavior for every other media kind while
-- closing the raw DML paths that could forge or rewrite uploaded evidence.
drop policy if exists evidence_owner_insert on public.evidence;
create policy evidence_owner_insert
on public.evidence for insert to authenticated
with check (
  evidence_kind <> 'upload'
  and owner_id = (select auth.uid())
);

drop policy if exists evidence_artifacts_owner_insert
  on public.evidence_artifacts;
revoke insert, update, delete on public.evidence_artifacts
  from authenticated;

drop policy if exists media_assets_scoped_insert on public.media_assets;
drop policy if exists media_assets_scoped_update on public.media_assets;
drop policy if exists media_assets_scoped_delete on public.media_assets;

create policy media_assets_non_evidence_insert
on public.media_assets for insert to authenticated
with check (
  media_kind <> 'evidence'
  and (
    owner_id = (select auth.uid())
    or (select app_private.has_permission('content.manage', organization_id))
  )
);

create policy media_assets_non_evidence_update
on public.media_assets for update to authenticated
using (
  media_kind <> 'evidence'
  and (
    owner_id = (select auth.uid())
    or (select app_private.has_permission('content.manage', organization_id))
  )
)
with check (
  media_kind <> 'evidence'
  and (
    owner_id = (select auth.uid())
    or (select app_private.has_permission('content.manage', organization_id))
  )
);

create policy media_assets_non_evidence_delete
on public.media_assets for delete to authenticated
using (
  media_kind <> 'evidence'
  and (
    owner_id = (select auth.uid())
    or (select app_private.has_permission('content.manage', organization_id))
  )
);

create function app_private.evidence_upload_name_matches_mime(
  p_file_name text,
  p_mime_type text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_mime_type
    when 'application/json' then lower(p_file_name) ~ '[.]json$'
    when 'application/pdf' then lower(p_file_name) ~ '[.]pdf$'
    when 'image/jpeg' then lower(p_file_name) ~ '[.](jpe?g)$'
    when 'image/png' then lower(p_file_name) ~ '[.]png$'
    when 'text/csv' then lower(p_file_name) ~ '[.]csv$'
    when 'text/plain' then lower(p_file_name) ~ '[.]txt$'
    else false
  end;
$$;

alter function app_private.evidence_upload_name_matches_mime(text, text)
  owner to postgres;
revoke all on function app_private.evidence_upload_name_matches_mime(text, text)
  from public, anon, authenticated, service_role;

-- Service callbacks cannot safely rely on auth.uid(). Re-derive the exact
-- learner delivery tuple from the explicit actor and require the same active
-- profile, tenant, cohort, role, permission and immutable publication facts as
-- the actor command before any evidence is finalized.
create function app_private.exact_learner_attempt_context(
  p_attempt_id uuid,
  p_actor_id uuid
)
returns table (
  attempt_id uuid,
  organization_id uuid,
  enrollment_id uuid,
  learner_id uuid,
  cohort_id uuid,
  course_id uuid,
  content_version_id uuid,
  task_id uuid,
  attempt_state public.attempt_state,
  attempt_row_version bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    attempt_record.id,
    attempt_record.organization_id,
    attempt_record.enrollment_id,
    attempt_record.learner_id,
    attempt_record.cohort_id,
    attempt_record.course_id,
    attempt_record.content_version_id,
    attempt_record.task_id,
    attempt_record.state,
    attempt_record.row_version
  from public.attempts attempt_record
  join public.profiles profile_record
    on profile_record.user_id = attempt_record.learner_id
   and profile_record.state = 'active'
   and profile_record.deactivated_at is null
  join public.organizations organization_record
    on organization_record.id = attempt_record.organization_id
   and organization_record.state = 'active'
   and organization_record.archived_at is null
  join public.organization_memberships organization_membership
    on organization_membership.organization_id = attempt_record.organization_id
   and organization_membership.user_id = attempt_record.learner_id
   and organization_membership.state = 'active'
   and organization_membership.removed_at is null
   and (
     organization_membership.valid_until is null
     or organization_membership.valid_until > statement_timestamp()
   )
  join public.enrollments enrollment_record
    on enrollment_record.id = attempt_record.enrollment_id
   and enrollment_record.organization_id = attempt_record.organization_id
   and enrollment_record.learner_id = attempt_record.learner_id
   and enrollment_record.cohort_id = attempt_record.cohort_id
   and enrollment_record.course_id = attempt_record.course_id
   and enrollment_record.state = 'assigned'
  join public.cohorts cohort_record
    on cohort_record.id = attempt_record.cohort_id
   and cohort_record.organization_id = attempt_record.organization_id
   and cohort_record.course_id = attempt_record.course_id
   and cohort_record.content_version_id = attempt_record.content_version_id
   and cohort_record.state = 'active'
  join public.cohort_memberships cohort_membership
    on cohort_membership.cohort_id = attempt_record.cohort_id
   and cohort_membership.user_id = attempt_record.learner_id
   and cohort_membership.role = 'learner'
   and cohort_membership.state = 'active'
   and cohort_membership.removed_at is null
  join public.tasks task_record
    on task_record.id = attempt_record.task_id
   and task_record.course_id = attempt_record.course_id
   and task_record.content_version_id = attempt_record.content_version_id
  join public.content_versions version_record
    on version_record.id = attempt_record.content_version_id
   and version_record.course_id = attempt_record.course_id
   and version_record.state in ('published', 'archived')
  join public.courses course_record
    on course_record.id = attempt_record.course_id
   and (
     course_record.organization_id is null
     or course_record.organization_id = attempt_record.organization_id
   )
  where attempt_record.id = p_attempt_id
    and attempt_record.learner_id = p_actor_id
    and 1 = (
      select count(distinct scoped_assignment.organization_id)
      from public.user_roles scoped_assignment
      join public.organizations scoped_organization
        on scoped_organization.id = scoped_assignment.organization_id
       and scoped_organization.state = 'active'
       and scoped_organization.archived_at is null
      join public.organization_memberships scoped_membership
        on scoped_membership.organization_id = scoped_assignment.organization_id
       and scoped_membership.user_id = p_actor_id
       and scoped_membership.state = 'active'
       and scoped_membership.removed_at is null
       and (
         scoped_membership.valid_until is null
         or scoped_membership.valid_until > statement_timestamp()
       )
      where scoped_assignment.user_id = p_actor_id
        and scoped_assignment.organization_id is not null
        and scoped_assignment.revoked_at is null
        and scoped_assignment.valid_from <= statement_timestamp()
        and (
          scoped_assignment.valid_until is null
          or scoped_assignment.valid_until > statement_timestamp()
        )
    )
    and exists (
      select 1
      from public.user_roles role_assignment
      join public.roles role_record
        on role_record.id = role_assignment.role_id
       and role_record.code = 'learner'
      where role_assignment.user_id = p_actor_id
        and role_assignment.organization_id = attempt_record.organization_id
        and (
          role_assignment.cohort_id is null
          or role_assignment.cohort_id = attempt_record.cohort_id
        )
        and role_assignment.revoked_at is null
        and role_assignment.valid_from <= statement_timestamp()
        and (
          role_assignment.valid_until is null
          or role_assignment.valid_until > statement_timestamp()
        )
    )
    and exists (
      select 1
      from public.user_roles permission_assignment
      join public.role_permissions role_permission
        on role_permission.role_id = permission_assignment.role_id
      join public.permissions permission_record
        on permission_record.id = role_permission.permission_id
       and permission_record.code = 'cohort.read'
      where permission_assignment.user_id = p_actor_id
        and permission_assignment.organization_id = attempt_record.organization_id
        and (
          permission_assignment.cohort_id is null
          or permission_assignment.cohort_id = attempt_record.cohort_id
        )
        and permission_assignment.revoked_at is null
        and permission_assignment.valid_from <= statement_timestamp()
        and (
          permission_assignment.valid_until is null
          or permission_assignment.valid_until > statement_timestamp()
        )
    )
    and app_private.is_valid_learner_content_snapshot(
      version_record.snapshot,
      course_record.id,
      course_record.slug,
      version_record.id,
      version_record.version_number
    )
    and app_private.snapshot_task_payload(
      version_record.snapshot, attempt_record.task_id
    ) is not null;
$$;

alter function app_private.exact_learner_attempt_context(uuid, uuid)
  owner to postgres;
revoke all on function app_private.exact_learner_attempt_context(uuid, uuid)
  from public, anon, authenticated, service_role;

create function app_private.guard_evidence_upload_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.enrollment_id is distinct from old.enrollment_id
     or new.owner_id is distinct from old.owner_id
     or new.cohort_id is distinct from old.cohort_id
     or new.course_id is distinct from old.course_id
     or new.content_version_id is distinct from old.content_version_id
     or new.task_id is distinct from old.task_id
     or new.attempt_id is distinct from old.attempt_id
     or new.bucket_id is distinct from old.bucket_id
     or new.object_key is distinct from old.object_key
     or new.title is distinct from old.title
     or new.original_file_name is distinct from old.original_file_name
     or new.declared_mime_type is distinct from old.declared_mime_type
     or new.declared_byte_size is distinct from old.declared_byte_size
     or new.client_sha256 is distinct from old.client_sha256
     or new.idempotency_key is distinct from old.idempotency_key
     or new.correlation_id is distinct from old.correlation_id
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at then
    raise exception 'evidence upload identity is immutable'
      using errcode = '55000';
  end if;

  if (old.verified_sha256 is not null and (
        new.verified_mime_type is distinct from old.verified_mime_type
        or new.verified_byte_size is distinct from old.verified_byte_size
        or new.verified_sha256 is distinct from old.verified_sha256
      ))
     or (old.evidence_id is not null and
       new.evidence_id is distinct from old.evidence_id)
     or (old.media_asset_id is not null and
       new.media_asset_id is distinct from old.media_asset_id)
     or (old.storage_deleted_at is not null and
       new.storage_deleted_at is distinct from old.storage_deleted_at) then
    raise exception 'evidence upload verified facts are immutable'
      using errcode = '55000';
  end if;

  if not (
    new.state = old.state
    or (old.state = 'pending' and new.state in ('ready', 'rejected', 'expired'))
    or (old.state = 'ready' and new.state = 'removed')
  ) then
    raise exception 'invalid evidence upload transition'
      using errcode = '55000';
  end if;

  new.row_version := old.row_version + 1;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

alter function app_private.guard_evidence_upload_mutation() owner to postgres;
revoke all on function app_private.guard_evidence_upload_mutation()
  from public, anon, authenticated, service_role;

create trigger evidence_uploads_guard_mutation
before update on public.evidence_uploads
for each row execute function app_private.guard_evidence_upload_mutation();

create trigger evidence_upload_receipts_immutable
before update or delete on public.evidence_upload_command_receipts
for each row execute function app_private.reject_mutation();

create function app_private.can_insert_task_evidence_object(
  p_bucket_id text,
  p_object_key text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  upload_record public.evidence_uploads;
begin
  if p_bucket_id is distinct from 'task-evidence-private'
     or p_object_key is null then
    return false;
  end if;

  -- Serialize Storage INSERT policy evaluation with reject, expiry, and
  -- finalize transitions. Authorization is evaluated only after the exact
  -- aggregate row is locked, closing the policy-check/state-change race.
  select upload.* into upload_record
  from public.evidence_uploads upload
  where upload.bucket_id = p_bucket_id
    and upload.object_key = p_object_key
    and upload.owner_id = (select auth.uid())
    and upload.state = 'pending'
    and upload.expires_at > statement_timestamp()
  for update;
  if not found then
    return false;
  end if;

  return exists (
    select 1
    from app_private.exact_learner_attempt_context(
      upload_record.attempt_id, upload_record.owner_id
    )
  );
end;
$$;

create function app_private.can_read_task_evidence_object(
  p_bucket_id text,
  p_object_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_bucket_id = 'task-evidence-private'
    and exists (
      select 1
      from public.evidence_uploads upload_record
      where upload_record.bucket_id = p_bucket_id
        and upload_record.object_key = p_object_key
        and upload_record.storage_deleted_at is null
        and upload_record.owner_id = (select auth.uid())
        and upload_record.state = 'pending'
        and upload_record.expires_at > statement_timestamp()
        and exists (
          select 1
          from app_private.exact_learner_attempt_context(
            upload_record.attempt_id, upload_record.owner_id
          )
        )
    );
$$;

alter function app_private.can_insert_task_evidence_object(text, text)
  owner to postgres;
alter function app_private.can_read_task_evidence_object(text, text)
  owner to postgres;
revoke all on function app_private.can_insert_task_evidence_object(text, text)
  from public, anon, authenticated, service_role;
revoke all on function app_private.can_read_task_evidence_object(text, text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.can_insert_task_evidence_object(text, text)
  to authenticated, service_role;
grant execute on function app_private.can_read_task_evidence_object(text, text)
  to authenticated, service_role;

create policy task_evidence_objects_insert
on storage.objects for insert to authenticated
with check (
  owner_id = (select auth.uid())::text
  and (select app_private.can_insert_task_evidence_object(
    bucket_id, name
  ))
);

create policy task_evidence_objects_read
on storage.objects for select to authenticated
using ((select app_private.can_read_task_evidence_object(
  bucket_id, name
)));

create function public.create_task_evidence_upload_intent(
  p_attempt_id uuid,
  p_title text,
  p_original_file_name text,
  p_declared_mime_type text,
  p_declared_byte_size bigint,
  p_client_sha256 text,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns table (
  upload_id uuid,
  bucket_id text,
  object_key text,
  upload_state public.evidence_upload_state,
  rejection_code text,
  expires_at timestamptz,
  replayed boolean,
  correlation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  attempt_record public.attempts;
  context_record record;
  upload_record public.evidence_uploads;
  receipt_record public.evidence_upload_command_receipts;
  payload_hash text;
  upload_identifier uuid;
  active_pending_count bigint;
  active_pending_bytes numeric;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_attempt_id is null
     or p_title is null
     or p_title <> btrim(p_title)
     or length(p_title) not between 1 and 255
     or p_original_file_name is null
     or p_original_file_name <> btrim(p_original_file_name)
     or length(p_original_file_name) not between 1 and 255
     or octet_length(p_original_file_name) > 255
     or p_original_file_name ~ '[\\/[:cntrl:]]'
     or p_declared_mime_type is null
     or p_declared_mime_type not in (
       'application/json', 'application/pdf', 'image/jpeg', 'image/png',
       'text/csv', 'text/plain'
     )
     or not app_private.evidence_upload_name_matches_mime(
       p_original_file_name, p_declared_mime_type
     )
     or p_declared_byte_size is null
     or p_declared_byte_size not between 1 and (case p_declared_mime_type
       when 'application/json' then 1048576
       when 'text/csv' then 5242880
       when 'text/plain' then 5242880
       when 'application/pdf' then 10485760
       when 'image/jpeg' then 26214400
       when 'image/png' then 26214400
       else 0
     end)
     or p_client_sha256 is null
     or p_client_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'invalid evidence upload intent'
      using errcode = '22023';
  end if;

  select attempt.* into attempt_record
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and attempt.learner_id = v_actor_id
  for update;
  if not found then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  select context.* into context_record
  from app_private.current_actor_exact_attempt_context(p_attempt_id) context;
  if not found then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  payload_hash := app_private.attempt_command_payload_hash(
    jsonb_build_object(
      'operation', 'task_evidence_upload_intent',
      'actor_id', v_actor_id,
      'organization_id', attempt_record.organization_id,
      'enrollment_id', attempt_record.enrollment_id,
      'cohort_id', attempt_record.cohort_id,
      'course_id', attempt_record.course_id,
      'content_version_id', attempt_record.content_version_id,
      'task_id', attempt_record.task_id,
      'attempt_id', attempt_record.id,
      'title', p_title,
      'original_file_name', p_original_file_name,
      'declared_mime_type', p_declared_mime_type,
      'declared_byte_size', p_declared_byte_size,
      'client_sha256', p_client_sha256
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'evidence-upload-receipt:' || v_actor_id::text || ':intent:'
        || p_idempotency_key,
      0
    )
  );

  select receipt.* into receipt_record
  from public.evidence_upload_command_receipts receipt
  where receipt.actor_id = v_actor_id
    and receipt.operation = 'intent'
    and receipt.idempotency_key = p_idempotency_key;
  if receipt_record.id is not null then
    if receipt_record.attempt_id <> attempt_record.id
       or receipt_record.payload_hash <> payload_hash
       or receipt_record.correlation_id <> p_correlation_id then
      raise exception 'evidence upload intent idempotency conflict'
        using errcode = '23505';
    end if;
    select upload.* into upload_record
    from public.evidence_uploads upload
    where upload.id = receipt_record.upload_id
      and upload.owner_id = v_actor_id
      and upload.attempt_id = attempt_record.id;
    if not found then
      raise exception 'evidence upload intent receipt is corrupt'
        using errcode = '55000';
    end if;
    return query select
      upload_record.id,
      upload_record.bucket_id,
      upload_record.object_key,
      upload_record.state,
      case
        when upload_record.state = 'rejected'
          then upload_record.rejection_code
        when upload_record.state = 'expired' then 'intent_expired'
        else null
      end,
      upload_record.expires_at,
      true,
      receipt_record.correlation_id;
    return;
  end if;

  if attempt_record.state not in ('in_progress', 'revision_required') then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  -- Quotas are actor-wide rather than attempt-wide. The attempt row lock above
  -- cannot serialize two intents for different attempts owned by the same
  -- learner, so take a dedicated actor lock before reading and consuming the
  -- pending-object budget.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'evidence-upload-quota:' || v_actor_id::text,
      0
    )
  );

  select
    count(*), coalesce(sum(upload.declared_byte_size), 0)
  into active_pending_count, active_pending_bytes
  from public.evidence_uploads upload
  where upload.owner_id = v_actor_id
    and upload.state = 'pending'
    and upload.expires_at > statement_timestamp();
  if active_pending_count >= 10
     or active_pending_bytes + p_declared_byte_size > 262144000 then
    raise exception 'evidence upload pending quota exceeded'
      using errcode = '54000';
  end if;

  upload_identifier := app_private.uuid7();
  insert into public.evidence_uploads (
    id, organization_id, enrollment_id, owner_id, cohort_id, course_id,
    content_version_id, task_id, attempt_id, bucket_id, object_key, title,
    original_file_name, declared_mime_type, declared_byte_size,
    client_sha256, idempotency_key, correlation_id, expires_at,
    cleanup_available_at
  ) values (
    upload_identifier,
    attempt_record.organization_id,
    attempt_record.enrollment_id,
    v_actor_id,
    attempt_record.cohort_id,
    attempt_record.course_id,
    attempt_record.content_version_id,
    attempt_record.task_id,
    attempt_record.id,
    'task-evidence-private',
    attempt_record.organization_id::text || '/' || v_actor_id::text || '/'
      || attempt_record.id::text || '/' || upload_identifier::text,
    p_title,
    p_original_file_name,
    p_declared_mime_type,
    p_declared_byte_size,
    p_client_sha256,
    p_idempotency_key,
    p_correlation_id,
    statement_timestamp() + interval '15 minutes',
    statement_timestamp() + interval '15 minutes'
  ) returning * into upload_record;

  insert into public.evidence_upload_command_receipts (
    actor_id, operation, upload_id, attempt_id, idempotency_key,
    payload_hash, correlation_id
  ) values (
    v_actor_id, 'intent', upload_record.id, attempt_record.id,
    p_idempotency_key, payload_hash, p_correlation_id
  ) returning * into receipt_record;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    upload_record.organization_id,
    v_actor_id,
    'learner',
    'evidence.upload_intent_created',
    'evidence_upload',
    upload_record.id,
    upload_record.row_version,
    p_correlation_id,
    jsonb_build_object(
      'attempt_id', upload_record.attempt_id,
      'enrollment_id', upload_record.enrollment_id,
      'content_version_id', upload_record.content_version_id,
      'task_id', upload_record.task_id,
      'declared_mime_type', upload_record.declared_mime_type,
      'declared_byte_size', upload_record.declared_byte_size
    )
  );

  return query select
    upload_record.id,
    upload_record.bucket_id,
    upload_record.object_key,
    upload_record.state,
    null::text,
    upload_record.expires_at,
    false,
    receipt_record.correlation_id;
end;
$$;

alter function public.create_task_evidence_upload_intent(
  uuid, text, text, text, bigint, text, text, uuid
) owner to postgres;
revoke all on function public.create_task_evidence_upload_intent(
  uuid, text, text, text, bigint, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.create_task_evidence_upload_intent(
  uuid, text, text, text, bigint, text, text, uuid
) to authenticated;

create function public.finalize_task_evidence_upload_service(
  p_upload_id uuid,
  p_actor_id uuid,
  p_verified_mime_type text,
  p_verified_byte_size bigint,
  p_verified_sha256 text,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns table (
  upload_id uuid,
  evidence_id uuid,
  media_asset_id uuid,
  title text,
  original_file_name text,
  mime_type text,
  byte_size bigint,
  sha256_hex text,
  captured_at timestamptz,
  replayed boolean,
  correlation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_attempt_id uuid;
  attempt_record public.attempts;
  context_record record;
  upload_record public.evidence_uploads;
  receipt_record public.evidence_upload_command_receipts;
  evidence_record public.evidence;
  media_record public.media_assets;
  payload_hash text;
begin
  if p_upload_id is null
     or p_actor_id is null
     or p_verified_mime_type is null
     or p_verified_mime_type not in (
       'application/json', 'application/pdf', 'image/jpeg', 'image/png',
       'text/csv', 'text/plain'
     )
     or p_verified_byte_size is null
     or p_verified_byte_size not between 1 and (case p_verified_mime_type
       when 'application/json' then 1048576
       when 'text/csv' then 5242880
       when 'text/plain' then 5242880
       when 'application/pdf' then 10485760
       when 'image/jpeg' then 26214400
       when 'image/png' then 26214400
       else 0
     end)
     or p_verified_sha256 is null
     or p_verified_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'invalid evidence upload finalization'
      using errcode = '22023';
  end if;

  select upload.attempt_id into target_attempt_id
  from public.evidence_uploads upload
  where upload.id = p_upload_id;
  if target_attempt_id is null then
    raise exception 'evidence upload unavailable' using errcode = '42501';
  end if;

  select attempt.* into attempt_record
  from public.attempts attempt
  where attempt.id = target_attempt_id
  for update;
  if not found then
    raise exception 'evidence upload unavailable' using errcode = '42501';
  end if;

  select upload.* into upload_record
  from public.evidence_uploads upload
  where upload.id = p_upload_id
  for update;
  if not found
     or upload_record.owner_id <> p_actor_id
     or upload_record.attempt_id <> attempt_record.id then
    raise exception 'evidence upload unavailable' using errcode = '42501';
  end if;

  select context.* into context_record
  from app_private.exact_learner_attempt_context(
    upload_record.attempt_id, p_actor_id
  ) context;
  if not found then
    raise exception 'evidence upload unavailable' using errcode = '42501';
  end if;

  payload_hash := app_private.attempt_command_payload_hash(
    jsonb_build_object(
      'operation', 'task_evidence_upload_finalize',
      'actor_id', p_actor_id,
      'organization_id', upload_record.organization_id,
      'enrollment_id', upload_record.enrollment_id,
      'cohort_id', upload_record.cohort_id,
      'course_id', upload_record.course_id,
      'content_version_id', upload_record.content_version_id,
      'task_id', upload_record.task_id,
      'attempt_id', upload_record.attempt_id,
      'upload_id', upload_record.id,
      'verified_mime_type', p_verified_mime_type,
      'verified_byte_size', p_verified_byte_size,
      'verified_sha256', p_verified_sha256
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'evidence-upload-receipt:' || p_actor_id::text || ':finalize:'
        || p_idempotency_key,
      0
    )
  );

  select receipt.* into receipt_record
  from public.evidence_upload_command_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.operation = 'finalize'
    and receipt.idempotency_key = p_idempotency_key;
  if receipt_record.id is not null then
    if receipt_record.upload_id <> upload_record.id
       or receipt_record.attempt_id <> upload_record.attempt_id
       or receipt_record.payload_hash <> payload_hash
       or receipt_record.correlation_id <> p_correlation_id then
      raise exception 'evidence upload finalize idempotency conflict'
        using errcode = '23505';
    end if;
    select evidence.* into evidence_record
    from public.evidence evidence
    where evidence.id = receipt_record.evidence_id
      and evidence.owner_id = p_actor_id
      and evidence.task_id = upload_record.task_id;
    select media.* into media_record
    from public.media_assets media
    where media.id = upload_record.media_asset_id
      and media.owner_id = p_actor_id
      and media.object_key = upload_record.object_key;
    if evidence_record.id is null or media_record.id is null then
      raise exception 'evidence upload finalize receipt is corrupt'
        using errcode = '55000';
    end if;
    return query select
      upload_record.id,
      evidence_record.id,
      media_record.id,
      evidence_record.title,
      upload_record.original_file_name,
      media_record.mime_type,
      media_record.byte_size,
      evidence_record.sha256_hex,
      evidence_record.captured_at,
      true,
      receipt_record.correlation_id;
    return;
  end if;

  if attempt_record.state not in ('in_progress', 'revision_required') then
    raise exception 'evidence upload unavailable' using errcode = '42501';
  end if;

  -- The validator may attest only the exact, server-generated object target
  -- bound to this intent. Storage metadata remains deliberately
  -- non-authoritative, but a live object row owned by the learner must exist;
  -- locking it prevents a concurrent replacement/deletion while provenance is
  -- finalized.
  perform 1
  from storage.objects object_record
  where object_record.bucket_id = upload_record.bucket_id
    and object_record.name = upload_record.object_key
    and object_record.owner_id = p_actor_id::text
  for key share;
  if not found then
    raise exception 'verified evidence upload object is unavailable'
      using errcode = '22023';
  end if;

  if upload_record.state <> 'pending'
     or upload_record.expires_at <= statement_timestamp()
     or upload_record.declared_mime_type <> p_verified_mime_type
     or upload_record.declared_byte_size <> p_verified_byte_size
     or upload_record.client_sha256 <> p_verified_sha256
     or not app_private.evidence_upload_name_matches_mime(
       upload_record.original_file_name, p_verified_mime_type
     ) then
    raise exception 'verified evidence upload does not match its intent'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'uploaded-evidence:' || p_actor_id::text || ':'
        || upload_record.task_id::text || ':' || p_verified_sha256,
      0
    )
  );

  if exists (
    select 1
    from public.evidence_uploads existing_upload
    where existing_upload.owner_id = p_actor_id
      and existing_upload.attempt_id = upload_record.attempt_id
      and existing_upload.verified_sha256 = p_verified_sha256
      and existing_upload.state = 'ready'
      and existing_upload.id <> upload_record.id
  ) then
    raise exception 'uploaded evidence digest is already ready for attempt'
      using errcode = '23505';
  end if;

  insert into public.media_assets (
    organization_id, owner_id, object_key, media_kind, mime_type,
    byte_size, sha256_hex, state
  ) values (
    upload_record.organization_id,
    p_actor_id,
    upload_record.object_key,
    'evidence',
    p_verified_mime_type,
    p_verified_byte_size,
    p_verified_sha256,
    'active'
  ) returning * into media_record;

  insert into public.evidence (
    organization_id, owner_id, task_id, evidence_kind, title, source_uri,
    sha256_hex, metadata
  ) values (
    upload_record.organization_id,
    p_actor_id,
    upload_record.task_id,
    'upload',
    upload_record.title,
    null,
    p_verified_sha256,
    jsonb_build_object(
      'source', 'learner_private_upload',
      'upload_id', upload_record.id,
      'attempt_id', upload_record.attempt_id,
      'enrollment_id', upload_record.enrollment_id,
      'content_version_id', upload_record.content_version_id,
      'original_file_name', upload_record.original_file_name,
      'mime_type', p_verified_mime_type,
      'size_bytes', p_verified_byte_size
    )
  ) returning * into evidence_record;

  insert into public.evidence_artifacts (
    evidence_id, media_asset_id, artifact_role
  ) values (
    evidence_record.id, media_record.id, 'primary'
  );

  update public.evidence_uploads upload
  set verified_mime_type = p_verified_mime_type,
      verified_byte_size = p_verified_byte_size,
      verified_sha256 = p_verified_sha256,
      state = 'ready',
      evidence_id = evidence_record.id,
      media_asset_id = media_record.id,
      finalized_at = statement_timestamp(),
      cleanup_available_at = null
  where upload.id = upload_record.id
  returning * into upload_record;

  insert into public.evidence_upload_command_receipts (
    actor_id, operation, upload_id, attempt_id, evidence_id,
    idempotency_key, payload_hash, correlation_id
  ) values (
    p_actor_id,
    'finalize',
    upload_record.id,
    upload_record.attempt_id,
    evidence_record.id,
    p_idempotency_key,
    payload_hash,
    p_correlation_id
  ) returning * into receipt_record;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    upload_record.organization_id,
    p_actor_id,
    'learner',
    'evidence.upload_finalized',
    'evidence',
    evidence_record.id,
    1,
    p_correlation_id,
    jsonb_build_object(
      'upload_id', upload_record.id,
      'attempt_id', upload_record.attempt_id,
      'task_id', upload_record.task_id,
      'mime_type', p_verified_mime_type,
      'byte_size', p_verified_byte_size
    )
  );

  insert into public.outbox_events (
    organization_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, schema_version, correlation_id, payload
  ) values (
    upload_record.organization_id,
    'evidence',
    evidence_record.id,
    1,
    'evidence.upload_finalized.v1',
    1,
    p_correlation_id,
    jsonb_build_object(
      'evidence_id', evidence_record.id,
      'upload_id', upload_record.id,
      'learner_id', p_actor_id,
      'attempt_id', upload_record.attempt_id,
      'task_id', upload_record.task_id,
      'mime_type', p_verified_mime_type,
      'byte_size', p_verified_byte_size
    )
  );

  return query select
    upload_record.id,
    evidence_record.id,
    media_record.id,
    evidence_record.title,
    upload_record.original_file_name,
    media_record.mime_type,
    media_record.byte_size,
    evidence_record.sha256_hex,
    evidence_record.captured_at,
    false,
    receipt_record.correlation_id;
end;
$$;

alter function public.finalize_task_evidence_upload_service(
  uuid, uuid, text, bigint, text, text, uuid
) owner to postgres;
revoke all on function public.finalize_task_evidence_upload_service(
  uuid, uuid, text, bigint, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_task_evidence_upload_service(
  uuid, uuid, text, bigint, text, text, uuid
) to service_role;

create function public.reject_task_evidence_upload_service(
  p_upload_id uuid,
  p_actor_id uuid,
  p_rejection_code text,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns table (
  upload_id uuid,
  upload_state public.evidence_upload_state,
  bucket_id text,
  object_key text,
  replayed boolean,
  correlation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_attempt_id uuid;
  attempt_record public.attempts;
  upload_record public.evidence_uploads;
  receipt_record public.evidence_upload_command_receipts;
  payload_hash text;
begin
  if p_upload_id is null
     or p_actor_id is null
     or p_rejection_code is null
     or p_rejection_code not in (
       'empty_file', 'hash_mismatch', 'malformed_content',
       'malware_detected', 'mime_mismatch', 'object_unavailable',
       'size_mismatch', 'unsupported_content'
     )
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'invalid evidence upload rejection'
      using errcode = '22023';
  end if;

  select upload.attempt_id into target_attempt_id
  from public.evidence_uploads upload
  where upload.id = p_upload_id;
  if target_attempt_id is null then
    raise exception 'evidence upload unavailable' using errcode = '42501';
  end if;
  select attempt.* into attempt_record
  from public.attempts attempt
  where attempt.id = target_attempt_id
  for update;
  select upload.* into upload_record
  from public.evidence_uploads upload
  where upload.id = p_upload_id
  for update;
  if upload_record.id is null
     or upload_record.owner_id <> p_actor_id
     or upload_record.attempt_id <> attempt_record.id then
    raise exception 'evidence upload unavailable' using errcode = '42501';
  end if;

  payload_hash := app_private.attempt_command_payload_hash(
    jsonb_build_object(
      'operation', 'task_evidence_upload_reject',
      'actor_id', p_actor_id,
      'attempt_id', upload_record.attempt_id,
      'upload_id', upload_record.id,
      'rejection_code', p_rejection_code
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'evidence-upload-receipt:' || p_actor_id::text || ':reject:'
        || p_idempotency_key,
      0
    )
  );
  select receipt.* into receipt_record
  from public.evidence_upload_command_receipts receipt
  where receipt.actor_id = p_actor_id
    and receipt.operation = 'reject'
    and receipt.idempotency_key = p_idempotency_key;
  if receipt_record.id is not null then
    if receipt_record.upload_id <> upload_record.id
       or receipt_record.payload_hash <> payload_hash
       or receipt_record.correlation_id <> p_correlation_id then
      raise exception 'evidence upload reject idempotency conflict'
        using errcode = '23505';
    end if;
    return query select
      upload_record.id,
      upload_record.state,
      upload_record.bucket_id,
      upload_record.object_key,
      true,
      receipt_record.correlation_id;
    return;
  end if;

  if upload_record.state <> 'pending' then
    raise exception 'evidence upload is not pending' using errcode = '55000';
  end if;
  update public.evidence_uploads upload
  set state = 'rejected',
      rejected_at = statement_timestamp(),
      rejection_code = p_rejection_code,
      cleanup_available_at = statement_timestamp()
  where upload.id = upload_record.id
  returning * into upload_record;

  insert into public.evidence_upload_command_receipts (
    actor_id, operation, upload_id, attempt_id, idempotency_key,
    payload_hash, correlation_id
  ) values (
    p_actor_id, 'reject', upload_record.id, upload_record.attempt_id,
    p_idempotency_key, payload_hash, p_correlation_id
  ) returning * into receipt_record;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    upload_record.organization_id,
    p_actor_id,
    'learner',
    'evidence.upload_rejected',
    'evidence_upload',
    upload_record.id,
    upload_record.row_version,
    p_correlation_id,
    jsonb_build_object(
      'attempt_id', upload_record.attempt_id,
      'task_id', upload_record.task_id,
      'rejection_code', p_rejection_code
    )
  );

  return query select
    upload_record.id,
    upload_record.state,
    upload_record.bucket_id,
    upload_record.object_key,
    false,
    receipt_record.correlation_id;
end;
$$;

alter function public.reject_task_evidence_upload_service(
  uuid, uuid, text, text, uuid
) owner to postgres;
revoke all on function public.reject_task_evidence_upload_service(
  uuid, uuid, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.reject_task_evidence_upload_service(
  uuid, uuid, text, text, uuid
) to service_role;

create function app_private.guard_ready_uploaded_evidence_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  evidence_kind text;
  attempt_record public.attempts;
  upload_record public.evidence_uploads;
begin
  select attempt.* into attempt_record
  from public.submissions submission
  join public.attempts attempt on attempt.id = submission.attempt_id
  where submission.id = new.submission_id
  for update of attempt;
  if not found then
    raise exception 'uploaded evidence submission context is invalid'
      using errcode = '22023';
  end if;

  select evidence.evidence_kind into evidence_kind
  from public.evidence evidence
  where evidence.id = new.evidence_id;
  if evidence_kind = 'upload' then
    select upload.* into upload_record
    from public.evidence_uploads upload
    where upload.evidence_id = new.evidence_id
    for key share;
    if not found
       or upload_record.state <> 'ready'
       or upload_record.attempt_id <> attempt_record.id then
      raise exception 'uploaded evidence is not ready'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

alter function app_private.guard_ready_uploaded_evidence_link()
  owner to postgres;
revoke all on function app_private.guard_ready_uploaded_evidence_link()
  from public, anon, authenticated, service_role;

create trigger submission_version_evidence_requires_ready_upload
before insert on public.submission_version_evidence
for each row execute function app_private.guard_ready_uploaded_evidence_link();

create function public.remove_task_uploaded_evidence(
  p_attempt_id uuid,
  p_evidence_id uuid,
  p_expected_draft_version bigint,
  p_idempotency_key text,
  p_correlation_id uuid
)
returns table (
  upload_id uuid,
  evidence_id uuid,
  bucket_id text,
  object_key text,
  result_draft_version bigint,
  replayed boolean,
  correlation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  attempt_record public.attempts;
  context_record record;
  upload_record public.evidence_uploads;
  receipt_record public.evidence_upload_command_receipts;
  draft_record public.attempt_drafts;
  payload_hash text;
  reference_count bigint;
  next_draft jsonb;
  resulting_draft_version bigint;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_attempt_id is null
     or p_evidence_id is null
     or p_expected_draft_version is null
     or p_expected_draft_version <= 0
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200
     or p_correlation_id is null then
    raise exception 'invalid evidence upload removal'
      using errcode = '22023';
  end if;

  select attempt.* into attempt_record
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and attempt.learner_id = v_actor_id
  for update;
  if not found then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;
  select context.* into context_record
  from app_private.current_actor_exact_attempt_context(p_attempt_id) context;
  if not found then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  select upload.* into upload_record
  from public.evidence_uploads upload
  where upload.attempt_id = attempt_record.id
    and upload.owner_id = v_actor_id
    and upload.evidence_id = p_evidence_id
  for update;
  if not found then
    raise exception 'uploaded evidence unavailable' using errcode = '42501';
  end if;

  payload_hash := app_private.attempt_command_payload_hash(
    jsonb_build_object(
      'operation', 'task_evidence_upload_remove',
      'actor_id', v_actor_id,
      'organization_id', upload_record.organization_id,
      'attempt_id', upload_record.attempt_id,
      'task_id', upload_record.task_id,
      'upload_id', upload_record.id,
      'evidence_id', p_evidence_id,
      'expected_draft_version', p_expected_draft_version
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'evidence-upload-receipt:' || v_actor_id::text || ':remove:'
        || p_idempotency_key,
      0
    )
  );
  select receipt.* into receipt_record
  from public.evidence_upload_command_receipts receipt
  where receipt.actor_id = v_actor_id
    and receipt.operation = 'remove'
    and receipt.idempotency_key = p_idempotency_key;
  if receipt_record.id is not null then
    if receipt_record.upload_id <> upload_record.id
       or receipt_record.evidence_id <> p_evidence_id
       or receipt_record.payload_hash <> payload_hash
       or receipt_record.correlation_id <> p_correlation_id then
      raise exception 'evidence upload remove idempotency conflict'
        using errcode = '23505';
    end if;
    return query select
      upload_record.id,
      p_evidence_id,
      upload_record.bucket_id,
      upload_record.object_key,
      receipt_record.result_draft_version,
      true,
      receipt_record.correlation_id;
    return;
  end if;

  if attempt_record.state not in ('in_progress', 'revision_required') then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  if upload_record.state <> 'ready' then
    raise exception 'uploaded evidence is not removable'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.submission_version_evidence link_record
    where link_record.evidence_id = p_evidence_id
  ) then
    raise exception 'submitted evidence cannot be removed'
      using errcode = '55000';
  end if;

  select draft.* into draft_record
  from public.attempt_drafts draft
  where draft.attempt_id = attempt_record.id
  for update;
  if not found or draft_record.row_version <> p_expected_draft_version then
    raise exception 'attempt draft became stale' using errcode = '40001';
  end if;

  select
    count(*) filter (where item.value ->> 'id' = p_evidence_id::text),
    coalesce(
      jsonb_agg(item.value order by item.ordinality)
        filter (where item.value ->> 'id' is distinct from p_evidence_id::text),
      '[]'::jsonb
    )
  into reference_count, next_draft
  from jsonb_array_elements(draft_record.evidence_draft)
    with ordinality item(value, ordinality);
  if reference_count > 1 then
    raise exception 'attempt draft has duplicate evidence references'
      using errcode = '55000';
  end if;

  resulting_draft_version := draft_record.row_version;
  if reference_count = 1 then
    update public.attempt_drafts draft
    set evidence_draft = next_draft,
        row_version = draft.row_version + 1,
        client_saved_at = statement_timestamp(),
        updated_at = statement_timestamp()
    where draft.attempt_id = attempt_record.id
      and draft.row_version = p_expected_draft_version
    returning draft.row_version into resulting_draft_version;
    if not found then
      raise exception 'attempt draft became stale' using errcode = '40001';
    end if;
  end if;

  update public.evidence_uploads upload
  set state = 'removed',
      removed_at = statement_timestamp(),
      cleanup_available_at = statement_timestamp()
  where upload.id = upload_record.id
  returning * into upload_record;

  insert into public.evidence_upload_command_receipts (
    actor_id, operation, upload_id, attempt_id, evidence_id,
    expected_draft_version, result_draft_version, idempotency_key,
    payload_hash, correlation_id
  ) values (
    v_actor_id,
    'remove',
    upload_record.id,
    upload_record.attempt_id,
    p_evidence_id,
    p_expected_draft_version,
    resulting_draft_version,
    p_idempotency_key,
    payload_hash,
    p_correlation_id
  ) returning * into receipt_record;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    upload_record.organization_id,
    v_actor_id,
    'learner',
    'evidence.upload_removed',
    'evidence',
    p_evidence_id,
    upload_record.row_version,
    p_correlation_id,
    jsonb_build_object(
      'upload_id', upload_record.id,
      'attempt_id', upload_record.attempt_id,
      'task_id', upload_record.task_id,
      'result_draft_version', resulting_draft_version
    )
  );

  return query select
    upload_record.id,
    p_evidence_id,
    upload_record.bucket_id,
    upload_record.object_key,
    resulting_draft_version,
    false,
    receipt_record.correlation_id;
end;
$$;

alter function public.remove_task_uploaded_evidence(
  uuid, uuid, bigint, text, uuid
) owner to postgres;
revoke all on function public.remove_task_uploaded_evidence(
  uuid, uuid, bigint, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.remove_task_uploaded_evidence(
  uuid, uuid, bigint, text, uuid
) to authenticated;

create function public.get_task_evidence_download_target(
  p_evidence_id uuid
)
returns table (
  evidence_id uuid,
  bucket_id text,
  object_key text,
  original_file_name text,
  mime_type text,
  byte_size bigint,
  sha256_hex text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return query
  select
    upload.evidence_id,
    upload.bucket_id,
    upload.object_key,
    upload.original_file_name,
    upload.verified_mime_type,
    upload.verified_byte_size,
    upload.verified_sha256
  from public.evidence_uploads upload
  where upload.evidence_id = p_evidence_id
    and upload.state = 'ready'
    and upload.storage_deleted_at is null
    and app_private.can_access_evidence(upload.evidence_id);
end;
$$;

alter function public.get_task_evidence_download_target(uuid)
  owner to postgres;
revoke all on function public.get_task_evidence_download_target(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_task_evidence_download_target(uuid)
  to authenticated;

-- Crash recovery projection: finalization and draft persistence are separate
-- transactions. A learner can safely rediscover exact-attempt ready evidence
-- without learning the private storage target or integrity/cleanup metadata.
create function public.list_my_ready_task_evidence_uploads(
  p_attempt_id uuid
)
returns table (
  upload_id uuid,
  evidence_id uuid,
  title text,
  original_file_name text,
  mime_type text,
  byte_size bigint,
  captured_at timestamptz,
  finalized_at timestamptz,
  immutable_linked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  context_record record;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select context.* into context_record
  from app_private.current_actor_exact_attempt_context(p_attempt_id) context;
  if not found
     or context_record.attempt_state not in (
       'in_progress', 'revision_required'
     ) then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  return query
  select
    upload.id,
    evidence.id,
    evidence.title,
    upload.original_file_name,
    upload.verified_mime_type,
    upload.verified_byte_size,
    evidence.captured_at,
    upload.finalized_at,
    exists (
      select 1
      from public.submission_version_evidence link_record
      where link_record.evidence_id = evidence.id
    )
  from public.evidence_uploads upload
  join public.evidence evidence
    on evidence.id = upload.evidence_id
   and evidence.organization_id = upload.organization_id
   and evidence.owner_id = upload.owner_id
   and evidence.task_id = upload.task_id
   and evidence.evidence_kind = 'upload'
  where upload.attempt_id = p_attempt_id
    and upload.owner_id = v_actor_id
    and upload.state = 'ready'
    and upload.storage_deleted_at is null
  order by upload.finalized_at, upload.id;
end;
$$;

alter function public.list_my_ready_task_evidence_uploads(uuid)
  owner to postgres;
revoke all on function public.list_my_ready_task_evidence_uploads(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_ready_task_evidence_uploads(uuid)
  to authenticated;

create function public.claim_task_evidence_upload_cleanup(
  p_limit integer,
  p_worker_id text,
  p_claim_token uuid
)
returns table (
  upload_id uuid,
  bucket_id text,
  object_key text,
  cleanup_attempt integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 100
     or p_worker_id is null
     or p_worker_id !~ '^[a-z0-9_.:-]{1,80}$'
     or p_claim_token is null then
    raise exception 'invalid evidence upload cleanup claim'
      using errcode = '22023';
  end if;

  with expired_candidates as (
    select upload.id
    from public.evidence_uploads upload
    where upload.state = 'pending'
      and upload.expires_at <= statement_timestamp()
    order by upload.expires_at, upload.created_at, upload.id
    for update skip locked
    limit p_limit
  ), expired_uploads as (
    update public.evidence_uploads upload
    set state = 'expired',
        expired_at = statement_timestamp(),
        rejection_code = 'intent_expired',
        cleanup_available_at = statement_timestamp()
    from expired_candidates candidate
    where upload.id = candidate.id
    returning upload.*
  )
  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  )
  select
    expired.organization_id,
    null,
    'system',
    'evidence.upload_expired',
    'evidence_upload',
    expired.id,
    expired.row_version,
    expired.correlation_id,
    jsonb_build_object(
      'attempt_id', expired.attempt_id,
      'task_id', expired.task_id
    )
  from expired_uploads expired;

  return query
  with candidates as (
    select upload.id
    from public.evidence_uploads upload
    where upload.state in ('rejected', 'removed', 'expired')
      and upload.storage_deleted_at is null
      and upload.cleanup_available_at <= statement_timestamp()
      and (
        (
          upload.cleanup_claim_token is null
          and upload.cleanup_claimed_by is null
          and upload.cleanup_claimed_at is null
          and upload.cleanup_lease_expires_at is null
        )
        or (
          upload.cleanup_claim_token is not null
          and upload.cleanup_claimed_by is not null
          and upload.cleanup_claimed_at is not null
          and upload.cleanup_lease_expires_at is not null
          and upload.cleanup_lease_expires_at <= statement_timestamp()
        )
      )
    order by upload.cleanup_available_at, upload.created_at, upload.id
    for update skip locked
    limit p_limit
  )
  update public.evidence_uploads upload
  set cleanup_claim_token = p_claim_token,
      cleanup_claimed_by = p_worker_id,
      cleanup_claimed_at = statement_timestamp(),
      cleanup_lease_expires_at = statement_timestamp() + interval '5 minutes',
      cleanup_attempt_count = upload.cleanup_attempt_count + 1
  from candidates
  where upload.id = candidates.id
  returning
    upload.id,
    upload.bucket_id,
    upload.object_key,
    upload.cleanup_attempt_count;
end;
$$;

alter function public.claim_task_evidence_upload_cleanup(integer, text, uuid)
  owner to postgres;
revoke all on function public.claim_task_evidence_upload_cleanup(integer, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_task_evidence_upload_cleanup(integer, text, uuid)
  to service_role;

create function public.complete_task_evidence_upload_cleanup(
  p_upload_id uuid,
  p_worker_id text,
  p_claim_token uuid,
  p_deleted boolean,
  p_error_code text default null,
  p_retry_at timestamptz default null
)
returns table (
  upload_id uuid,
  storage_deleted_at timestamptz,
  retry_at timestamptz,
  cleanup_attempt integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  upload_record public.evidence_uploads;
begin
  if p_upload_id is null
     or p_worker_id is null
     or p_worker_id !~ '^[a-z0-9_.:-]{1,80}$'
     or p_claim_token is null
     or p_deleted is null
     or (
       p_deleted
       and (p_error_code is not null or p_retry_at is not null)
     )
     or (
       not p_deleted
       and (
         p_error_code is null
         or p_error_code !~ '^[a-z0-9_.-]{1,80}$'
         or p_retry_at is null
         or p_retry_at <= statement_timestamp()
         or p_retry_at > statement_timestamp() + interval '7 days'
       )
     ) then
    raise exception 'invalid evidence upload cleanup completion'
      using errcode = '22023';
  end if;

  select upload.* into upload_record
  from public.evidence_uploads upload
  where upload.id = p_upload_id
  for update;
  if not found
     or upload_record.state not in ('rejected', 'removed', 'expired')
     or upload_record.storage_deleted_at is not null
     or upload_record.cleanup_claimed_by is distinct from p_worker_id
     or upload_record.cleanup_claim_token is distinct from p_claim_token
     or upload_record.cleanup_claimed_at is null
     or upload_record.cleanup_lease_expires_at is null
     or upload_record.cleanup_lease_expires_at <= statement_timestamp() then
    raise exception 'evidence upload cleanup claim is stale'
      using errcode = '40001';
  end if;

  if p_deleted then
    update public.evidence_uploads upload
    set storage_deleted_at = statement_timestamp(),
        cleanup_claim_token = null,
        cleanup_claimed_by = null,
        cleanup_claimed_at = null,
        cleanup_lease_expires_at = null,
        cleanup_available_at = null,
        cleanup_last_error_code = null
    where upload.id = upload_record.id
    returning * into upload_record;

    -- A removed upload retains immutable evidence provenance, but the linked
    -- media row must stop advertising a physically deleted object as active.
    if upload_record.media_asset_id is not null then
      update public.media_assets media
      set state = 'inactive',
          deleted_at = coalesce(media.deleted_at, statement_timestamp())
      where media.id = upload_record.media_asset_id
        and media.owner_id = upload_record.owner_id
        and media.media_kind = 'evidence'
        and media.object_key = upload_record.object_key;
      if not found then
        raise exception 'evidence upload media linkage is corrupt'
          using errcode = '55000';
      end if;
    end if;
  else
    update public.evidence_uploads upload
    set cleanup_claim_token = null,
        cleanup_claimed_by = null,
        cleanup_claimed_at = null,
        cleanup_lease_expires_at = null,
        cleanup_available_at = p_retry_at,
        cleanup_last_error_code = p_error_code
    where upload.id = upload_record.id
    returning * into upload_record;
  end if;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    upload_record.organization_id,
    null,
    'system',
    case when p_deleted
      then 'evidence.upload_storage_deleted'
      else 'evidence.upload_cleanup_failed'
    end,
    'evidence_upload',
    upload_record.id,
    upload_record.row_version,
    upload_record.correlation_id,
    jsonb_build_object(
      'cleanup_attempt', upload_record.cleanup_attempt_count,
      'error_code', p_error_code
    )
  );

  return query select
    upload_record.id,
    upload_record.storage_deleted_at,
    upload_record.cleanup_available_at,
    upload_record.cleanup_attempt_count;
end;
$$;

alter function public.complete_task_evidence_upload_cleanup(
  uuid, text, uuid, boolean, text, timestamptz
) owner to postgres;
revoke all on function public.complete_task_evidence_upload_cleanup(
  uuid, text, uuid, boolean, text, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.complete_task_evidence_upload_cleanup(
  uuid, text, uuid, boolean, text, timestamptz
) to service_role;
