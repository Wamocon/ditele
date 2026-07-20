-- Deterministic, replayable export requests record their exact export family and filters.
alter table public.data_export_requests
  add column export_kind text not null default 'learners'
    check (export_kind in ('learners', 'cohort_progress', 'certificates', 'reviews', 'issues')),
  add column filters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(filters) = 'object');

create index data_export_requests_org_kind_queue_idx
  on public.data_export_requests (organization_id, export_kind, state, created_at)
  where state in ('requested', 'processing');

