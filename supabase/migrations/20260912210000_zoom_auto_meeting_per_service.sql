-- Lets a service's booking location be "zoom" -- a fresh, unique Zoom
-- meeting created per appointment (via the resolved host's connected Zoom
-- account) instead of one static link everyone who books that service
-- would otherwise share. zoom_host_user_id is the fallback host when the
-- appointment has no specific staff_id (e.g. booked through the general or
-- service-specific link rather than a staff member's own link, where that
-- staff member's own Zoom connection is used instead).
alter table public.services drop constraint services_booking_location_type_check;
alter table public.services add constraint services_booking_location_type_check
  check (booking_location_type in ('call', 'link', 'zoom'));

alter table public.services add column if not exists zoom_host_user_id uuid references auth.users(id) on delete set null;
