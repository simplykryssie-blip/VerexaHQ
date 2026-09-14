-- Phase 5E MVP: row-level payout export behind Reports > Network. Same
-- security/scoping model as get_network_payout_summary (Phase 5B) -- reads
-- firm_payouts as-is, no recomputation, no write. Only pending/paid rows are
-- ever returned (disputed is confirmed dead code and is not offered as a
-- filter or export value). Does not modify get_network_payout_summary or
-- any other existing function.
create or replace function public.get_network_payout_export(
  p_workspace_id uuid,
  p_period_start date default null,
  p_period_end date default null,
  p_status text default null
)
returns table(
  partner_name text,
  period_start date,
  period_end date,
  amount_owed numeric,
  status text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  if p_status is not null and p_status not in ('pending', 'paid') then
    raise exception 'invalid status filter: %', p_status;
  end if;

  return query
    select
      coalesce(cw.name, fc.manual_name, 'Connected firm'),
      fp.period_start,
      fp.period_end,
      fp.amount_owed_to_ptin,
      fp.status
    from public.firm_payouts fp
    join public.firm_connections fc on fc.id = fp.connection_id
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    where fp.parent_workspace_id = p_workspace_id
      and fp.status in ('pending', 'paid')
      and (p_status is null or fp.status = p_status)
      and (p_period_start is null or fp.period_start >= p_period_start)
      and (p_period_end is null or fp.period_end <= p_period_end)
    order by fp.period_start desc, coalesce(cw.name, fc.manual_name, 'Connected firm');
end;
$$;

revoke all on function public.get_network_payout_export(uuid, date, date, text) from public;
grant execute on function public.get_network_payout_export(uuid, date, date, text) to authenticated;
