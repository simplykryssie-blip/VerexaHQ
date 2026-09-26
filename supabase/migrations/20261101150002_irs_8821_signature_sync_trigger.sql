-- IRS Form 8821 reconciliation, part 3: close the signature -> status dead
-- end. Nothing previously moved an irs_authorizations row into 'signed' --
-- awaiting_identity_verification/identity_verified/awaiting_signature/signed
-- were all deliberately excluded from set_irs_authorization_status's manual
-- allow-list on the assumption they'd be reached automatically, but no
-- trigger ever existed to do that. Hooked onto the same
-- "AFTER UPDATE OF status ... WHEN (new.status <> 'pending')" event
-- trg_record_signature_activity already uses, as a separate trigger function
-- (not folded into record_signature_activity itself) so this stays isolated
-- from that generic activity-logging trigger's blast radius.
create or replace function public.sync_irs_authorization_on_signer_signed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'signed' then
    update public.irs_authorizations
    set status = 'signed', updated_at = now()
    where signature_request_id = new.signature_request_id
      and status in ('draft', 'awaiting_identity_verification', 'identity_verification_rejected', 'identity_verified', 'awaiting_signature');
  end if;
  return new;
end;
$$;

create trigger trg_sync_irs_authorization_on_signer_signed
  after update of status on public.signature_request_signers
  for each row
  when (new.status = 'signed')
  execute function public.sync_irs_authorization_on_signer_signed();

-- One-time reconciliation: any authorization already stuck pre-signed whose
-- linked signer had, in fact, already signed before this trigger existed.
update public.irs_authorizations ia
set status = 'signed', updated_at = now()
where ia.status in ('draft', 'awaiting_identity_verification', 'identity_verification_rejected', 'identity_verified', 'awaiting_signature')
  and exists (
    select 1 from public.signature_request_signers s
    where s.signature_request_id = ia.signature_request_id and s.status = 'signed'
  );
