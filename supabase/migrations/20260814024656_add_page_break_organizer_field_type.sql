alter table public.organizer_fields drop constraint organizer_fields_field_type_check;

alter table public.organizer_fields add constraint organizer_fields_field_type_check
  check (field_type = any (array[
    'short_text','paragraph','number','currency','date','dropdown','checkbox',
    'radio_button','multiple_choice','address','ssn','ein','file_upload',
    'signature','repeating_section','page_break'
  ]));
