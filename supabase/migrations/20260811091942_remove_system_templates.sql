-- Product decision: every firm starts empty and builds their own forms,
-- engagement letters, and email/SMS templates -- no shared Verexa starter
-- library. Deletes every workspace_id IS NULL row from those four tables.
--
-- organizer_responses.organizer_template_id is NOT NULL with ON DELETE NO
-- ACTION, so it has to be cleared first. Its answers live in
-- organizer_response_answers, keyed off organizer_fields, which cascade-
-- deletes with the template -- so a response against a system form loses
-- its answers regardless of what points at it, and is deleted outright
-- rather than left behind hollowed out.
--
-- services.organizer_template_id / engagement_letter_template_id are
-- already ON DELETE SET NULL, so existing service packages just lose their
-- default template link and firms pick their own once they've built one.

delete from organizer_responses
where organizer_template_id in (select id from organizer_templates where workspace_id is null);

delete from organizer_templates where workspace_id is null;
delete from engagement_letter_templates where workspace_id is null;
delete from email_templates where workspace_id is null;
delete from sms_templates where workspace_id is null;
