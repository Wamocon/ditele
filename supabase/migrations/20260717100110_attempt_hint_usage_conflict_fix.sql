-- Correct the retry conflict target without rewriting the already-applied
-- attempt/history hardening migration. attempt_hint_usage has a surrogate
-- primary key; idempotency is defined by its (attempt_id, hint_id) constraint.

create or replace function public.save_attempt_draft(
  p_attempt_id uuid,
  p_expected_draft_version bigint,
  p_answer_text text,
  p_selected_option_ids uuid[],
  p_evidence_draft jsonb,
  p_elapsed_seconds integer,
  p_used_hint_ids uuid[]
)
returns table (
  attempt_id uuid,
  draft_version bigint,
  attempt_version bigint,
  elapsed_seconds integer,
  hint_used boolean,
  hint_first_used_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  attempt_record public.attempts;
  context_record record;
  draft_record public.attempt_drafts;
  refreshed_attempt public.attempts;
  distinct_selected_count bigint;
  distinct_hint_count bigint;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_attempt_id is null
     or p_expected_draft_version is null
     or p_expected_draft_version < 0
     or p_answer_text is null
     or length(p_answer_text) > 50000
     or p_selected_option_ids is null
     or cardinality(p_selected_option_ids) > 100
     or p_evidence_draft is null
     or jsonb_typeof(p_evidence_draft) is distinct from 'array'
     or jsonb_array_length(p_evidence_draft) > 50
     or pg_catalog.pg_column_size(p_evidence_draft) > 262144
     or p_elapsed_seconds is null
     or p_elapsed_seconds < 0
     or p_elapsed_seconds > 2678400
     or p_used_hint_ids is null
     or cardinality(p_used_hint_ids) > 100 then
    raise exception 'invalid draft payload' using errcode = '22023';
  end if;

  select attempt.* into attempt_record
  from public.attempts attempt
  where attempt.id = p_attempt_id
    and attempt.learner_id = actor_id
  for update;
  if not found then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  select context.* into context_record
  from app_private.current_actor_exact_attempt_context(p_attempt_id) context;
  if not found or attempt_record.state not in (
    'in_progress', 'revision_required'
  ) then
    raise exception 'attempt unavailable' using errcode = '42501';
  end if;

  select count(distinct selected_id) into distinct_selected_count
  from unnest(p_selected_option_ids) selected_id;
  if distinct_selected_count <> cardinality(p_selected_option_ids) then
    raise exception 'selected options must be distinct'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(p_selected_option_ids) selected_id
    where not exists (
      select 1
      from jsonb_array_elements(
        context_record.task_payload -> 'options'
      ) option_payload
      where option_payload.value ->> 'id' = selected_id::text
    )
  ) then
    raise exception 'selected option does not belong to the attempt task'
      using errcode = '22023';
  end if;

  select count(distinct hint_id) into distinct_hint_count
  from unnest(p_used_hint_ids) hint_id;
  if distinct_hint_count <> cardinality(p_used_hint_ids) then
    raise exception 'used hints must be distinct' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(p_used_hint_ids) hint_id
    where not exists (
      select 1
      from jsonb_array_elements(
        context_record.task_payload -> 'hints'
      ) hint_payload
      where hint_payload.value ->> 'id' = hint_id::text
    )
  ) then
    raise exception 'used hint does not belong to the attempt task'
      using errcode = '22023';
  end if;

  if p_expected_draft_version = 0 then
    insert into public.attempt_drafts (
      attempt_id, answer_text, selected_option_ids, evidence_draft,
      client_saved_at
    ) values (
      p_attempt_id,
      p_answer_text,
      p_selected_option_ids,
      p_evidence_draft,
      statement_timestamp()
    ) on conflict on constraint attempt_drafts_pkey do nothing
    returning * into draft_record;
  else
    update public.attempt_drafts draft
    set answer_text = p_answer_text,
        selected_option_ids = p_selected_option_ids,
        evidence_draft = p_evidence_draft,
        client_saved_at = statement_timestamp()
    where draft.attempt_id = p_attempt_id
      and draft.row_version = p_expected_draft_version
    returning draft.* into draft_record;
  end if;
  if draft_record.attempt_id is null then
    raise exception 'draft is stale' using errcode = '40001';
  end if;

  insert into public.attempt_hint_usage (attempt_id, hint_id)
  select p_attempt_id, hint_id
  from unnest(p_used_hint_ids) hint_id
  on conflict on constraint attempt_hint_usage_unique do nothing;

  update public.attempts attempt
  set elapsed_seconds = greatest(
        attempt.elapsed_seconds, p_elapsed_seconds
      ),
      hint_used = attempt.hint_used or cardinality(p_used_hint_ids) > 0,
      hint_first_used_at = case
        when attempt.hint_first_used_at is not null
          then attempt.hint_first_used_at
        when cardinality(p_used_hint_ids) > 0
          then (
            select min(usage.first_used_at)
            from public.attempt_hint_usage usage
            where usage.attempt_id = attempt.id
          )
        else null
      end,
      last_activity_at = statement_timestamp()
  where attempt.id = p_attempt_id
  returning attempt.* into refreshed_attempt;

  return query select
    refreshed_attempt.id,
    draft_record.row_version,
    refreshed_attempt.row_version,
    refreshed_attempt.elapsed_seconds,
    refreshed_attempt.hint_used,
    refreshed_attempt.hint_first_used_at,
    draft_record.updated_at;
end;
$$;

alter function public.save_attempt_draft(
  uuid, bigint, text, uuid[], jsonb, integer, uuid[]
) owner to postgres;
revoke all on function public.save_attempt_draft(
  uuid, bigint, text, uuid[], jsonb, integer, uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.save_attempt_draft(
  uuid, bigint, text, uuid[], jsonb, integer, uuid[]
) to authenticated, service_role;
