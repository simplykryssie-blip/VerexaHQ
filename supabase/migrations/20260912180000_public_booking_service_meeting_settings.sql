-- Public booking link (Phase 2): a service needs to say what happens once
-- someone books it -- staff calls them, or a posted meeting link (Zoom,
-- Google Meet, whatever the firm actually uses) goes out. Both null-safe
-- defaults ("call") so every existing service keeps behaving exactly as it
-- does today.
alter table public.services
  add column if not exists booking_location_type text not null default 'call' check (booking_location_type in ('call', 'link')),
  add column if not exists booking_meeting_url text;
