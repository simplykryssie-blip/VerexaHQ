-- Phase 4E-B: the Phase 4E-A audit found these four B13 RPCs still carrying
-- Postgres's default EXECUTE-to-PUBLIC grant (never explicitly revoked),
-- which also propagates to anon -- inconsistent with the established
-- convention elsewhere in this codebase (accept_quote/decline_quote are
-- authenticated-only, no PUBLIC/anon). Internal authorization inside these
-- functions is correct and unchanged (is_portal_user/has_permission both
-- correctly reject an anon caller since auth.uid() is null for them), so
-- this is a hardening-only change, not a logic change.
revoke execute on function public.mark_ready_for_client_review(uuid) from public;
revoke execute on function public.mark_ready_for_client_review(uuid) from anon;

revoke execute on function public.approve_client_review(uuid, text) from public;
revoke execute on function public.approve_client_review(uuid, text) from anon;

revoke execute on function public.request_client_review_changes(uuid, text) from public;
revoke execute on function public.request_client_review_changes(uuid, text) from anon;

revoke execute on function public.decline_client_review_filing(uuid, text) from public;
revoke execute on function public.decline_client_review_filing(uuid, text) from anon;
