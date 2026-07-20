-- Expose only the display names needed to render an authorized question
-- conversation. Participant identities are derived from immutable question
-- history; caller scope remains the canonical can_access_question predicate.

create or replace function public.list_my_question_participant_contexts()
returns table (
  question_id uuid,
  user_id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct
    question_record.id as question_id,
    participant_record.user_id,
    coalesce(
      nullif(btrim(profile_record.display_name), ''),
      'Participant'
    ) as display_name
  from public.questions question_record
  cross join lateral (
    select question_record.learner_id as user_id
    union all
    select question_record.assigned_trainer_id
    where question_record.assigned_trainer_id is not null
    union all
    select message_record.author_id
    from public.question_messages message_record
    where message_record.question_id = question_record.id
    union all
    select transfer_record.from_trainer_id
    from public.question_transfers transfer_record
    where transfer_record.question_id = question_record.id
    union all
    select transfer_record.to_trainer_id
    from public.question_transfers transfer_record
    where transfer_record.question_id = question_record.id
  ) participant_record
  left join public.profiles profile_record
    on profile_record.user_id = participant_record.user_id
  where (select app_private.can_access_question(question_record.id))
  order by question_record.id, participant_record.user_id;
$$;

alter function public.list_my_question_participant_contexts()
  owner to postgres;
revoke all on function public.list_my_question_participant_contexts()
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_question_participant_contexts()
  to authenticated, service_role;
