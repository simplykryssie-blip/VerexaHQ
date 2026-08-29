-- Revises 20260829030000: that migration hard-blocked (raised an exception)
-- entering Waiting On Payment / Ready To Release / Completed without a
-- completed engagement-letter signature on file. Changed on explicit
-- instruction to warn-but-allow instead: staff should see a confirmation
-- warning but be able to override and proceed anyway. A DB trigger can only
-- allow or reject a write outright -- it can't show a UI dialog or accept an
-- "I know, continue anyway" override -- so the check moves to the frontend
-- (StatusSelect.tsx, EngagementBoard.tsx), and the hard block is removed.
--
-- The signature-lookup logic itself is preserved as a plain function
-- (renamed from the guard trigger function) so both frontend call sites can
-- reuse the exact same "does this engagement have a completed, signed
-- engagement letter" check via one RPC instead of duplicating the query.

drop trigger if exists trg_enforce_engagement_signature_gate on public.engagements;
drop function if exists public.enforce_engagement_signature_gate();

create or replace function public.engagement_has_signed_letter(p_engagement_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.signature_requests sr
    join public.attachments a on a.id = sr.attachment_id
    where a.entity_type = 'engagement'
      and a.entity_id = p_engagement_id
      and sr.status = 'completed'
      and sr.engagement_letter_template_id is not null
  );
$function$;
