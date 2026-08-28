-- Simplify layout_width to a plain full/half toggle (JotForm-style "shrink"
-- switch) per user feedback -- third/two_thirds added unnecessary choice
-- without a matching quick-toggle UI. Downgrade any existing two_thirds/third
-- rows to half before narrowing the constraint.
update public.organizer_fields set layout_width = 'half' where layout_width in ('two_thirds', 'third');

alter table public.organizer_fields drop constraint organizer_fields_layout_width_check;
alter table public.organizer_fields add constraint organizer_fields_layout_width_check check (
  layout_width = any (array['full', 'half'])
);
