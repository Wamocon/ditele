-- Correct PL/pgSQL output/column name conflicts without changing the public RPC contracts.

do $migration$
declare
  function_body text;
begin
  select procedure_row.prosrc into function_body
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid =
    'public.save_attempt_draft(uuid,bigint,text,uuid[],jsonb,integer,uuid[])'::regprocedure;

  execute format($function$
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
    as %L
  $function$, '#variable_conflict use_column' || chr(10) || function_body);

  select procedure_row.prosrc into function_body
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid =
    'public.decide_submission(uuid,uuid,bigint,public.review_decision,text,jsonb,text,uuid)'::regprocedure;

  execute format($function$
    create or replace function public.decide_submission(
      p_submission_id uuid,
      p_submission_version_id uuid,
      p_expected_version bigint,
      p_decision public.review_decision,
      p_comment text,
      p_criterion_scores jsonb,
      p_idempotency_key text,
      p_correlation_id uuid
    )
    returns public.submissions
    language plpgsql
    security definer
    set search_path = ''
    as %L
  $function$, '#variable_conflict use_variable' || chr(10) || function_body);
end
$migration$;
