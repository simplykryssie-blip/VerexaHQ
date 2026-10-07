-- The automation condition evaluator's partner_onboarding.agreement_signed
-- field only ever checked the heavier signature_requests pipeline, so a
-- partner onboarding signed through the new public, connection-scoped link
-- (which sets partner_onboardings.agreement_signed_at directly, per Firm
-- Connections 2.0 -- see 20261107030000) could never satisfy this
-- condition -- any wait/condition step gating on it would stay blocked
-- forever. OR'ing in agreement_signed_at is not null makes this consistent
-- with get_my_partner_onboarding and get_public_partner_onboarding, which
-- already treat either mechanism as "signed".
--
-- Found and verified via a real stuck production case (Krystal Esters'
-- Tax Avenue Pro purchase): her automation run was also blocked on a
-- workspace-specific wait condition unrelated to this evaluator (fixed
-- directly against that workspace's automation configuration, not via a
-- migration, since it's tenant-specific data). Once both were fixed, her
-- real automation run completed end-to-end without any manual step-forcing.
do $do_block$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public._evaluate_condition_list(jsonb,jsonb,uuid,uuid,uuid,uuid,uuid)'::regprocedure) into v_def;

  v_new := replace(
    v_def,
    E'        when ''partner_onboarding.agreement_signed'' then (exists (\n          select 1 from public.signature_requests sr\n          where sr.id = v_onboarding.agreement_signature_request_id and sr.status = ''completed''\n        ))::text\n',
    E'        when ''partner_onboarding.agreement_signed'' then (\n          v_onboarding.agreement_signed_at is not null\n          or exists (\n            select 1 from public.signature_requests sr\n            where sr.id = v_onboarding.agreement_signature_request_id and sr.status = ''completed''\n          )\n        )::text\n'
  );

  if v_new = v_def then
    raise exception 'anchor for partner_onboarding.agreement_signed not found -- no change applied';
  end if;

  execute v_new;
end;
$do_block$;
