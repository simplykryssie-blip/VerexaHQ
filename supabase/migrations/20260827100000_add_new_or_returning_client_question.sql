-- Adds a "new or returning client?" question near the top of both
-- workspaces' 2026 Individual Tax Organizer, right after the tax-year
-- confirmation and before any personal-info questions begin.
update public.organizer_fields set display_order = display_order + 10000
where organizer_template_id = '76ea6903-fb2d-4cc9-b428-7dddedc2b785' and display_order >= 4;
update public.organizer_fields set display_order = display_order - 9999
where organizer_template_id = '76ea6903-fb2d-4cc9-b428-7dddedc2b785' and display_order >= 10004;

insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options) values
('76ea6903-fb2d-4cc9-b428-7dddedc2b785', 'radio_button', 'Have you worked with Summit Tax & Financial Services before, or are you a new client?', 4, false,
 '[{"label":"New client","value":"New client"},{"label":"Returning client","value":"Returning client"}]');

update public.organizer_fields set display_order = display_order + 10000
where organizer_template_id = 'c03cf32b-928d-463f-b850-4e75d7fcca2e' and display_order >= 4;
update public.organizer_fields set display_order = display_order - 9999
where organizer_template_id = 'c03cf32b-928d-463f-b850-4e75d7fcca2e' and display_order >= 10004;

insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options) values
('c03cf32b-928d-463f-b850-4e75d7fcca2e', 'radio_button', 'Have you worked with MKB Financial Group before, or are you a new client?', 4, false,
 '[{"label":"New client","value":"New client"},{"label":"Returning client","value":"Returning client"}]');
