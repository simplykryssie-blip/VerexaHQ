-- signature_requests has no template linkage today (only attachment_id) --
-- Request Documents and Send Organizer are already derivable from existing
-- entity_id/template_id columns, but "already sent for this stage's
-- engagement-letter template" structurally is not without this. This is a
-- gap-fill on an existing table, not a new state-tracking table.
alter table public.signature_requests
  add column engagement_letter_template_id uuid references public.engagement_letter_templates(id) on delete set null;

create index signature_requests_engagement_letter_template_id_idx
  on public.signature_requests(engagement_letter_template_id) where engagement_letter_template_id is not null;
