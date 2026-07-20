-- Tighten the server-side external evidence URL boundary. This forward-only
-- correction preserves the existing exact-context, receipt, digest-locking,
-- audit and replay behavior while validating the HTTPS authority explicitly.

create or replace function public.create_external_task_evidence(
  p_attempt_id uuid,
  p_title text,
  p_source_uri text,
  p_sha256_hex text,
  p_idempotency_key text
)
returns public.evidence
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  attempt_record public.attempts;
  context_record record;
  normalized_title text := nullif(btrim(p_title), '');
  normalized_uri text := btrim(p_source_uri);
  normalized_authority text;
  normalized_hash text := lower(btrim(p_sha256_hex));
  payload_hash text;
  receipt_record public.attempt_command_receipts;
  evidence_record public.evidence;
begin
  normalized_authority := substring(
    normalized_uri from '^https://([^/?#]*)'
  );

  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_attempt_id is null
     or normalized_title is null
     or length(normalized_title) > 255
     or p_source_uri is null
     or p_source_uri <> normalized_uri
     or p_source_uri ~ '[[:space:]]'
     or length(normalized_uri) > 2048
     or normalized_uri !~
       '^https://[^/?#[:space:]]+([/?#][^[:space:]]*)?$'
     or normalized_authority is null
     or normalized_authority = ''
     or normalized_authority like '%@%'
     or normalized_authority !~
       '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?::[0-9]{1,5})?$'
     or p_sha256_hex is null
     or normalized_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 200 then
    raise exception 'invalid external evidence payload'
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
  if not found
     or attempt_record.state not in ('in_progress', 'revision_required') then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  payload_hash := app_private.attempt_command_payload_hash(
    jsonb_build_object(
      'operation', 'create_external_task_evidence',
      'actor_id', v_actor_id,
      'organization_id', attempt_record.organization_id,
      'enrollment_id', attempt_record.enrollment_id,
      'cohort_id', attempt_record.cohort_id,
      'course_id', attempt_record.course_id,
      'content_version_id', attempt_record.content_version_id,
      'task_id', attempt_record.task_id,
      'attempt_id', attempt_record.id,
      'title', normalized_title,
      'source_uri', normalized_uri,
      'sha256_hex', normalized_hash
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'attempt-receipt:' || v_actor_id::text
        || ':create_external_task_evidence:' || p_idempotency_key,
      0
    )
  );

  select receipt.* into receipt_record
  from public.attempt_command_receipts receipt
  where receipt.actor_id = v_actor_id
    and receipt.operation = 'create_external_task_evidence'
    and receipt.idempotency_key = p_idempotency_key;
  if receipt_record.id is not null then
    if receipt_record.attempt_id <> attempt_record.id
       or receipt_record.organization_id <> attempt_record.organization_id
       or receipt_record.enrollment_id <> attempt_record.enrollment_id
       or receipt_record.cohort_id <> attempt_record.cohort_id
       or receipt_record.course_id <> attempt_record.course_id
       or receipt_record.content_version_id <>
         attempt_record.content_version_id
       or receipt_record.task_id <> attempt_record.task_id
       or receipt_record.payload_hash <> payload_hash then
      raise exception 'external evidence idempotency conflict'
        using errcode = '23505';
    end if;
    select evidence.* into evidence_record
    from public.evidence evidence
    where evidence.id = receipt_record.evidence_id
      and evidence.organization_id = attempt_record.organization_id
      and evidence.owner_id = v_actor_id
      and evidence.task_id = attempt_record.task_id;
    if not found then
      raise exception 'external evidence receipt is corrupt'
        using errcode = '55000';
    end if;
    return evidence_record;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'external-evidence:' || v_actor_id::text || ':' || normalized_hash,
      0
    )
  );

  select evidence.* into evidence_record
  from public.evidence evidence
  where evidence.owner_id = v_actor_id
    and evidence.sha256_hex = normalized_hash
    and evidence.evidence_kind = 'external';
  if evidence_record.id is not null then
    if evidence_record.organization_id <> attempt_record.organization_id
       or evidence_record.task_id is distinct from attempt_record.task_id
       or evidence_record.title <> normalized_title
       or evidence_record.source_uri <> normalized_uri then
      raise exception 'external evidence digest is already bound elsewhere'
        using errcode = '23505';
    end if;
  else
    insert into public.evidence (
      organization_id, owner_id, task_id, evidence_kind, title,
      source_uri, sha256_hex, metadata
    ) values (
      attempt_record.organization_id,
      v_actor_id,
      attempt_record.task_id,
      'external',
      normalized_title,
      normalized_uri,
      normalized_hash,
      jsonb_build_object(
        'source', 'learner_external_link',
        'attempt_id', attempt_record.id,
        'enrollment_id', attempt_record.enrollment_id,
        'content_version_id', attempt_record.content_version_id
      )
    ) returning * into evidence_record;
  end if;

  insert into public.attempt_command_receipts (
    actor_id, operation, organization_id, enrollment_id, cohort_id,
    course_id, content_version_id, task_id, attempt_id, evidence_id,
    expected_attempt_row_version, idempotency_key, payload_hash,
    correlation_id
  ) values (
    v_actor_id,
    'create_external_task_evidence',
    attempt_record.organization_id,
    attempt_record.enrollment_id,
    attempt_record.cohort_id,
    attempt_record.course_id,
    attempt_record.content_version_id,
    attempt_record.task_id,
    attempt_record.id,
    evidence_record.id,
    attempt_record.row_version,
    p_idempotency_key,
    payload_hash,
    app_private.uuid7()
  ) returning * into receipt_record;

  insert into public.audit_events (
    organization_id, actor_id, actor_role, event_type, aggregate_type,
    aggregate_id, aggregate_version, correlation_id, metadata
  ) values (
    attempt_record.organization_id,
    v_actor_id,
    'learner',
    'evidence.created',
    'evidence',
    evidence_record.id,
    1,
    receipt_record.correlation_id,
    jsonb_build_object(
      'attempt_id', attempt_record.id,
      'enrollment_id', attempt_record.enrollment_id,
      'content_version_id', attempt_record.content_version_id,
      'task_id', attempt_record.task_id,
      'evidence_kind', evidence_record.evidence_kind
    )
  );

  return evidence_record;
end;
$$;

alter function public.create_external_task_evidence(
  uuid, text, text, text, text
) owner to postgres;
revoke all on function public.create_external_task_evidence(
  uuid, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_external_task_evidence(
  uuid, text, text, text, text
) to authenticated, service_role;
