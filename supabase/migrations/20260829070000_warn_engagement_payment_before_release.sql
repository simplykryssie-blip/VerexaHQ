-- Phase 5 finding: requires_payment_before_release is a real toggle in the
-- Service settings form (components/settings/ServiceForm.tsx) -- a firm can
-- turn it on believing it protects them -- but nothing in the platform ever
-- reads it. No trigger, function, or frontend check enforces it anywhere,
-- and confirmed live that no workspace currently has it enabled on any
-- service, meaning it has never actually been exercised. Same shape of gap
-- as the engagement signature check fixed earlier this phase.
--
-- Fixed with the same warn-but-allow pattern already established for
-- signatures: a reusable RPC plus a frontend confirmation, not a hard DB
-- block, so staff can still override in a genuine edge case (e.g. a
-- client the firm has decided to bill later).

create or replace function public.engagement_meets_payment_requirement(p_engagement_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when not coalesce((select s.requires_payment_before_release from public.engagements e join public.services s on s.id = e.service_id where e.id = p_engagement_id), false)
      then true
    else exists (select 1 from public.invoices i where i.engagement_id = p_engagement_id)
      and not exists (select 1 from public.invoices i where i.engagement_id = p_engagement_id and i.status not in ('paid', 'void'))
  end;
$function$;
