-- The Dependents repeating section's "how many months did they live with
-- you" and "what school did they attend / what months were they enrolled"
-- questions always showed for every dependent, regardless of whether that
-- dependent lived with the client part-time or was a student at all. This
-- data-only fix only takes effect together with the code fix in the same
-- commit: conditional_logic on a repeating section's child fields was never
-- evaluated anywhere (RepeatingSectionInput/PublicRepeatingSection/
-- PreviewRepeatingSection all rendered every child unconditionally) -- so
-- setting it here would have silently done nothing without that fix.
update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"all","conditions":[{"field_id":"1ecde39c-66d2-447a-807d-1c185c4251c1","operator":"equals","value":"With me part of the year"}]}}'::jsonb
where id = '6b298662-56fd-43f6-a7f0-ec9f0ce0f4e3';

update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"all","conditions":[{"field_id":"5141dd13-258e-453e-b62b-d2697d9ddd7f","operator":"equals","value":"yes"}]}}'::jsonb
where id in ('a0f8f7fd-1e4c-4329-a967-d9ac86eb4603', '61f339f6-ec99-4221-ae7d-016487c6cbb9');

update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"all","conditions":[{"field_id":"bee2b163-a9a8-4430-acfe-a08c4abec66d","operator":"equals","value":"With me part of the year"}]}}'::jsonb
where id = '796f81fd-9d59-4a55-926a-d56dee52c43a';

update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"all","conditions":[{"field_id":"e45faa8f-0f48-4d72-beaa-fc474545940d","operator":"equals","value":"yes"}]}}'::jsonb
where id in ('d08fb285-1be8-4a8c-a7b4-43d21cdf97de', '5614598e-57f7-45e3-98b7-c3afe887ade3');
