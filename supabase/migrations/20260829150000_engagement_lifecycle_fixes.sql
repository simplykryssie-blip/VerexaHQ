-- Three bugs found during an Engagements end-to-end QA pass:
--
-- 1. engagements.current_stage was never initialized on creation. The sync
--    trigger (sync_engagement_current_stage, fired from pipeline_runs) only
--    ran `after update ... when (new.current_stage_id is distinct from
--    old.current_stage_id)` -- which never fires on the initial INSERT of a
--    fresh pipeline_runs row, and doesn't fire on create_engagement's
--    client->engagement handoff UPDATE either (that update only flips
--    entity_type/entity_id, not current_stage_id). So a freshly created
--    engagement showed a blank Stage until its pipeline genuinely advanced
--    past the first stage. The function body already no-ops safely for
--    irrelevant rows (checks entity_type/current_stage_id itself), so it's
--    safe to fire on every insert/update instead of only on a narrow WHEN.
--
-- 2. Two BEFORE INSERT triggers both try to default engagement staff
--    assignment, and fire in alphabetical-by-name order:
--    apply_engagement_default_assignment (falls back to the workspace
--    owner) ran BEFORE trg_prefill_engagement_assignments (falls back to
--    the client's own relationship_manager_id/default_reviewer_id/
--    default_compliance_officer_id). Since the owner-fallback trigger
--    always sets assigned_staff_id whenever a workspace has an owner, the
--    client-specific relationship-manager default became dead code for
--    that field in any workspace with an owner -- new engagements always
--    inherited the workspace owner instead of the client's actual
--    relationship manager. Renamed the owner-fallback trigger so it sorts
--    (and fires) after the client-default trigger, making the more
--    specific client-level default win, with the workspace owner staying
--    as the last-resort fallback when the client has none configured.
--
-- 3. record_signature/decline_signature (the in-app staff/portal signing
--    path) have no tracked migration anywhere in this repo's history --
--    confirmed by grepping supabase/migrations/ -- unlike their public
--    /sign/[token] counterparts (record_signature_by_token,
--    decline_signature_by_token). Backfilling them here closes that
--    schema-drift risk, and along the way:
--      - record_signature had zero validation on its inputs (could record
--        a "signed" signer with a blank typed_name, or signature_type=
--        'drawn' with no image), and no `where status = 'pending'` guard,
--        so it could silently re-sign an already-signed or declined
--        signer. record_signature_by_token requires a typed name always
--        and requires an image when the type is 'drawn'. The frontend
--        (SignaturesPanel.tsx) deliberately supports two audiences here --
--        portal signers must both type and draw, but staff signing in
--        person on someone's behalf may use typed-only -- so the fix
--        preserves that distinction (typed_name always required; an image
--        is only required when signature_type='drawn') rather than
--        forcing "both always", which would break the legitimate
--        staff-typed-only flow.
--      - decline_signature had no `where status = 'pending'` guard either,
--        unlike decline_signature_by_token. Added the same guard plus an
--        exception on a stale decline, for consistency.

drop trigger if exists trg_sync_engagement_current_stage on public.pipeline_runs;
create trigger trg_sync_engagement_current_stage
  after insert or update on public.pipeline_runs
  for each row execute function public.sync_engagement_current_stage();

alter trigger apply_engagement_default_assignment on public.engagements
  rename to zz_apply_engagement_default_assignment;

create or replace function public.record_signature(
  p_signer_id uuid,
  p_signature_type text,
  p_signature_image_path text default null,
  p_typed_name text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_workspace_id uuid;
  v_attachment_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_signer_email text;
  v_caller_email text;
  v_pending_count int;
begin
  if p_typed_name is null or btrim(p_typed_name) = '' then
    raise exception 'A typed signature is required';
  end if;
  if p_signature_type = 'drawn' and (p_signature_image_path is null or btrim(p_signature_image_path) = '') then
    raise exception 'A drawn signature is required';
  end if;

  select s.signature_request_id, r.workspace_id, r.attachment_id, a.entity_type, a.entity_id, s.signer_email
  into v_request_id, v_workspace_id, v_attachment_id, v_entity_type, v_entity_id, v_signer_email
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  where s.id = p_signer_id;

  if v_request_id is null then
    raise exception 'signer not found';
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();

  if not (
    public.has_permission(v_workspace_id, 'signatures.request')
    or (
      v_signer_email is not null and lower(v_caller_email) = lower(v_signer_email)
      and public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    )
  ) then
    raise exception 'insufficient permissions';
  end if;

  update public.signature_request_signers
  set status = 'signed', signature_type = p_signature_type, signature_image_path = p_signature_image_path,
      typed_name = btrim(p_typed_name), signed_at = now()
  where id = p_signer_id and status = 'pending';

  if not found then
    raise exception 'this signing request is no longer pending';
  end if;

  select count(*) into v_pending_count from public.signature_request_signers
  where signature_request_id = v_request_id and status = 'pending';

  if v_pending_count = 0 then
    update public.signature_requests set status = 'completed', updated_at = now() where id = v_request_id;
    update public.attachments set is_locked = true where id = v_attachment_id;
  end if;
end;
$function$;

create or replace function public.decline_signature(p_signer_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_workspace_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_signer_email text;
  v_caller_email text;
begin
  select s.signature_request_id, r.workspace_id, a.entity_type, a.entity_id, s.signer_email
  into v_request_id, v_workspace_id, v_entity_type, v_entity_id, v_signer_email
  from public.signature_request_signers s
  join public.signature_requests r on r.id = s.signature_request_id
  join public.attachments a on a.id = r.attachment_id
  where s.id = p_signer_id;

  if v_request_id is null then
    raise exception 'signer not found';
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();

  if not (
    public.has_permission(v_workspace_id, 'signatures.request')
    or (
      v_signer_email is not null and lower(v_caller_email) = lower(v_signer_email)
      and public.is_portal_user_for_entity(v_entity_type, v_entity_id)
    )
  ) then
    raise exception 'insufficient permissions';
  end if;

  update public.signature_request_signers
  set status = 'declined', declined_at = now(), decline_reason = p_reason
  where id = p_signer_id and status = 'pending';

  if not found then
    raise exception 'this signing request is no longer pending';
  end if;

  update public.signature_requests set status = 'declined', updated_at = now() where id = v_request_id;
end;
$function$;
