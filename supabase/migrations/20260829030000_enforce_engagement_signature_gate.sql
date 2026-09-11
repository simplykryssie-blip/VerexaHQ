-- Phase 4 (Quote -> Engagement -> Signature -> Tax Prep pipeline) QA finding:
-- nothing prevented an engagement from being marked Waiting On Payment /
-- Ready To Release / Completed without a real signed engagement letter ever
-- existing for it. Both places staff change engagement status
-- (app/(app)/engagements/[id]/StatusSelect.tsx, components/engagements/
-- EngagementBoard.tsx) are plain `.update({status})` calls with no signature
-- check, and no Postgres function/trigger validated the transition either --
-- fire_engagement_letter_signed_automations() only fires configured
-- automations on a completed signature, it never blocks or requires
-- anything. Confirmed live: staff could drag an engagement straight from
-- "Waiting On Signature" (or any status) to "Completed" with zero signature
-- on file.
--
-- Fixed with a BEFORE UPDATE guard on engagements, mirroring the existing
-- enforce_ero_efile_gate pattern: entering any of the three post-signature
-- statuses requires a completed signature_requests row for THIS engagement.
-- The engagement link is indirect (signature_requests.attachment_id ->
-- attachments.entity_type='engagement'/entity_id), the same join
-- fire_engagement_letter_signed_automations() already uses -- mirrored here
-- rather than reinvented so both stay in sync if that linkage ever changes.
-- Applies to every workspace and every engagement with no exceptions, per
-- explicit decision: even a service/workflow with no engagement-letter step
-- must still have one on file before advancing past Waiting On Signature.

create or replace function public.enforce_engagement_signature_gate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_has_signed_letter boolean;
begin
  if new.status in ('Waiting On Payment', 'Ready To Release', 'Completed')
     and old.status is distinct from new.status
  then
    select exists (
      select 1
      from public.signature_requests sr
      join public.attachments a on a.id = sr.attachment_id
      where a.entity_type = 'engagement'
        and a.entity_id = new.id
        and sr.status = 'completed'
        and sr.engagement_letter_template_id is not null
    ) into v_has_signed_letter;

    if not v_has_signed_letter then
      raise exception 'This engagement needs a completed, signed engagement letter on file before it can move to %.', new.status;
    end if;
  end if;
  return new;
end;
$function$;

create trigger trg_enforce_engagement_signature_gate
  before update on public.engagements
  for each row execute function public.enforce_engagement_signature_gate();
