-- Two gaps found while shipping the Zoom auto-meeting feature:
-- 1. The internal Calendar's manual "New appointment" form has no concept
--    of a service at all (title/client/staff/time only), unlike the public
--    booking link and portal self-booking, which are always tied to one.
-- 2. Neither booking path checks a service's own appointments for a
--    time-slot conflict against an appointment created through the OTHER
--    path -- a client can book Friday 5pm online while a staff member
--    independently books that same person for Friday 5pm on the internal
--    calendar, with no warning either way.
--
-- allow_overlapping_bookings lets a firm decide, per service, whether that
-- service tolerates being double-booked (e.g. a quick optional consult call)
-- or not (e.g. a full Tax Prep session, the default). service_id on
-- appointments is what makes that policy checkable for a manually-created
-- appointment in the first place, and lets the manual form auto-fill
-- duration/location the same way the public/portal booking flows already do.
alter table public.services add column if not exists allow_overlapping_bookings boolean not null default false;
alter table public.appointments add column if not exists service_id uuid references public.services(id) on delete set null;
