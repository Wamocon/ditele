-- Cover the complete composite result-context foreign key introduced by
-- 100140. The narrower lookup indexes remain useful for their own query paths.

create index enrollment_request_receipts_result_context_idx
  on public.enrollment_request_receipts (
    enrollment_id,
    organization_id,
    actor_id,
    course_id
  );
