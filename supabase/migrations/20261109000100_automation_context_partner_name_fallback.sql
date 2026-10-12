-- Partner-purchase / partner-onboarding runs have no contact and no engagement,
-- so execute_automation_step's merge context filled client_name / first_name /
-- client_first_name with empty strings. Real production symptoms: the task
-- "Verify Payment Success for " and the welcome email subject
-- "Welcome to Tax Avenue Pro-!" both rendered with no name.
--
-- Falls back to the partner's identity (resolve_firm_connection_identity: the
-- workspace-backed partner's owner/name, or the manually-entered owner/name of
-- one who hasn't got a workspace yet) ONLY when the run has no contact or
-- engagement name -- every run that already resolved a name is unchanged.
do $do_block$
declare
  v_def text;
  v_new text;
  v_owner_expr constant text :=
    $e$nullif(btrim(coalesce(public.resolve_firm_connection_identity(v_connection_id)->>'owner_name', public.resolve_firm_connection_identity(v_connection_id)->>'name', '')), '')$e$;
begin
  select pg_get_functiondef('public.execute_automation_step(uuid,uuid)'::regprocedure) into v_def;

  v_new := replace(
    v_def,
    $a$    'client_name', btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')),
    'first_name', v_eng.first_name,
    'client_first_name', v_eng.first_name,$a$,
    format(
      $b$    'client_name', coalesce(nullif(btrim(coalesce(v_eng.first_name, '') || ' ' || coalesce(v_eng.last_name, '')), ''), %1$s, ''),
    'first_name', coalesce(v_eng.first_name, split_part(%1$s, ' ', 1)),
    'client_first_name', coalesce(v_eng.first_name, split_part(%1$s, ' ', 1)),$b$,
      v_owner_expr
    )
  );

  if v_new = v_def then
    raise exception 'anchor for the client_name context entries not found in execute_automation_step -- no change applied';
  end if;

  execute v_new;
end;
$do_block$;
