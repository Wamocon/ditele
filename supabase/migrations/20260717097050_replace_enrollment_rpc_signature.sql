-- PostgreSQL preserves input argument names across CREATE OR REPLACE. Drop the
-- three-argument overload before recreating it with optional note ordering.
drop function public.request_enrollment(uuid, text, text);

