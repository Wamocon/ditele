-- Trainers need learner display context only inside cohorts they actively train.
create policy profiles_shared_active_cohort_trainer_read on public.profiles
  for select to authenticated
  using (exists (
    select 1
    from public.cohort_memberships learner_membership
    join public.cohorts cohort_row on cohort_row.id = learner_membership.cohort_id
    join public.cohort_memberships trainer_membership
      on trainer_membership.cohort_id = learner_membership.cohort_id
    where learner_membership.user_id = profiles.user_id
      and learner_membership.role = 'learner'
      and learner_membership.state = 'active'
      and trainer_membership.user_id = (select auth.uid())
      and trainer_membership.role = 'trainer'
      and trainer_membership.state = 'active'
      and cohort_row.state = 'active'
  ));

