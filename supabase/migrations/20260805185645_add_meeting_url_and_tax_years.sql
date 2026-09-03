
alter table public.appointments add column if not exists meeting_url text;

create table if not exists public.tax_years (
  id uuid primary key default gen_random_uuid(),
  year int not null unique,
  created_at timestamptz not null default now()
);

insert into public.tax_years (year)
select y from unnest(array[2022,2023,2024,2025,2026,2027]) as y
on conflict (year) do nothing;

alter table public.tax_years enable row level security;

drop policy if exists tax_years_select_all on public.tax_years;
create policy tax_years_select_all on public.tax_years for select to authenticated using (true);

create or replace function public.ensure_next_tax_year()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int;
begin
  v_year := extract(year from now())::int + 1;
  insert into public.tax_years (year)
  values (v_year)
  on conflict (year) do nothing;
  return v_year;
end;
$$;

revoke all on function public.ensure_next_tax_year() from public;
grant execute on function public.ensure_next_tax_year() to authenticated, service_role;
