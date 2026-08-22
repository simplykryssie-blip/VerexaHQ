create policy workspace_email_domains_insert on public.workspace_email_domains
for insert to authenticated
with check (has_permission(workspace_id, 'settings.manage'::text));

create policy workspace_email_domains_update on public.workspace_email_domains
for update to authenticated
using (has_permission(workspace_id, 'settings.manage'::text))
with check (has_permission(workspace_id, 'settings.manage'::text));

create policy workspace_email_domains_delete on public.workspace_email_domains
for delete to authenticated
using (has_permission(workspace_id, 'settings.manage'::text));
