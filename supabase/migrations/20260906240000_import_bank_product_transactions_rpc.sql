-- Bulk CSV import for bank product transactions. A staff member matches
-- rows from their bank's report to Verexa engagements by engagement_number
-- (deterministic, unlike fuzzy name matching) and uploads a CSV; this RPC
-- resolves each row's engagement_number to an engagement_id server-side
-- (bypassing engagements_select's engagements.view requirement, since a
-- billing.manage user may not hold that permission) and inserts the
-- transaction, collecting any per-row failure instead of aborting the
-- whole batch.

create function public.import_bank_product_transactions(p_workspace_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row jsonb;
  v_engagement_id uuid;
  v_inserted int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not public.has_permission(p_workspace_id, 'billing.manage') then
    raise exception 'You do not have permission to import bank product transactions';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_engagement_id := null;
    select id into v_engagement_id
      from public.engagements
      where workspace_id = p_workspace_id
        and engagement_number = (v_row ->> 'engagement_number')
      limit 1;

    if v_engagement_id is null then
      v_errors := v_errors || jsonb_build_object(
        'engagement_number', v_row ->> 'engagement_number',
        'reason', 'No engagement found with this number'
      );
      continue;
    end if;

    begin
      insert into public.bank_product_transactions (
        workspace_id, engagement_id, bank_partner, product_type,
        prep_fee_collected, bank_fee, addon_fee, rebate_amount,
        disbursement_method, status, created_by
      ) values (
        p_workspace_id, v_engagement_id,
        nullif(v_row ->> 'bank_partner', ''),
        coalesce(nullif(v_row ->> 'product_type', ''), 'other'),
        nullif(v_row ->> 'prep_fee_collected', '')::numeric,
        nullif(v_row ->> 'bank_fee', '')::numeric,
        nullif(v_row ->> 'addon_fee', '')::numeric,
        nullif(v_row ->> 'rebate_amount', '')::numeric,
        nullif(v_row ->> 'disbursement_method', ''),
        coalesce(nullif(v_row ->> 'status', ''), 'pending'),
        auth.uid()
      );
      v_inserted := v_inserted + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object(
        'engagement_number', v_row ->> 'engagement_number',
        'reason', sqlerrm
      );
    end;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'errors', v_errors);
end;
$function$;
