-- Migration-history recovery: schema prerequisites for the
-- execute_automation_step recovery in the next migration.
--
-- automation_dedupe_key (one column per side-effect table, keyed
-- 'automation_step:'||step_id||':'||run_id by execute_automation_step)
-- makes every automation-triggered task/appointment/signature-request/
-- quote/note/message creation idempotent: a retried or resumed step that
-- had already partially succeeded does not create a second one.
alter table public.tasks add column if not exists automation_dedupe_key text;
create unique index if not exists tasks_automation_dedupe_key_uidx on public.tasks(automation_dedupe_key) where automation_dedupe_key is not null;

alter table public.appointments add column if not exists automation_dedupe_key text;
create unique index if not exists appointments_automation_dedupe_key_uidx on public.appointments(automation_dedupe_key) where automation_dedupe_key is not null;

alter table public.quotes add column if not exists automation_dedupe_key text;
create unique index if not exists quotes_automation_dedupe_key_uidx on public.quotes(automation_dedupe_key) where automation_dedupe_key is not null;

alter table public.notes add column if not exists automation_dedupe_key text;
create unique index if not exists notes_automation_dedupe_key_uidx on public.notes(automation_dedupe_key) where automation_dedupe_key is not null;

alter table public.messages add column if not exists automation_dedupe_key text;
create unique index if not exists messages_automation_dedupe_key_uidx on public.messages(automation_dedupe_key) where automation_dedupe_key is not null;

alter table public.signature_requests add column if not exists automation_dedupe_key text;
create unique index if not exists signature_requests_automation_dedupe_key_uidx on public.signature_requests(automation_dedupe_key) where automation_dedupe_key is not null;

-- parent_run_id/chain_depth: a start_workflow step creates a new
-- automation_runs row; these track which run started it and how many
-- workflow-to-workflow hops deep it is, so execute_automation_step can cap
-- runaway workflow-starts-workflow loops instead of recursing forever.
alter table public.automation_runs
  add column if not exists parent_run_id uuid references public.automation_runs(id) on delete set null,
  add column if not exists chain_depth int not null default 0;

create index if not exists automation_runs_parent_run_id_idx on public.automation_runs(parent_run_id) where parent_run_id is not null;

comment on column public.automation_runs.parent_run_id is 'The run whose start_workflow step created this run, if any. Null for a run started directly by a trigger.';
comment on column public.automation_runs.chain_depth is '0 for a trigger-started run; parent''s chain_depth + 1 for a workflow-started one. Capped at 10 by execute_automation_step''s start_workflow branch -- not customer-configurable.';
