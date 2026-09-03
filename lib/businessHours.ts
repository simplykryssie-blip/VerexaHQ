// Shared by the staff-side settings form and the portal booking API --
// there's no existing availability concept anywhere in the app, so this is
// the whole model: fixed weekly hours per day, candidate start times offered
// on a fixed grid, each booking's actual length coming from the specific
// service (services.estimated_duration_minutes), falling back to the grid
// length for services with no duration set.

export type DayHours = { start: string; end: string } | null;

export type BusinessHours = {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
};

export const WEEKDAYS: (keyof BusinessHours)[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  sunday: null,
  monday: { start: "09:00", end: "17:00" },
  tuesday: { start: "09:00", end: "17:00" },
  wednesday: { start: "09:00", end: "17:00" },
  thursday: { start: "09:00", end: "17:00" },
  friday: { start: "09:00", end: "17:00" },
  saturday: null,
};

export const DEFAULT_SLOT_MINUTES = 30;
export const BOOKING_WINDOW_DAYS = 14;

// A single-day closure is start === end; a span (e.g. the week between
// Christmas and New Year's) covers every date from start through end
// inclusive. Both are 'YYYY-MM-DD'.
export type HolidayRange = { start: string; end: string };

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Shared by firm-wide holidays and per-staff time off -- both are just a
// list of inclusive [start, end] 'YYYY-MM-DD' spans checked the same way.
export function isDateInAnyRange(isoDate: string, ranges: { start: string; end: string }[]): boolean {
  return ranges.some((r) => isoDate >= r.start && isoDate <= r.end);
}

export function isHoliday(isoDate: string, holidays: HolidayRange[]): boolean {
  return isDateInAnyRange(isoDate, holidays);
}

// A service's own booking window, e.g. "only Jan 1 - Apr 15" for a tax
// season -- month/day only ('MM-DD'), so it recurs every year without
// anyone having to remember to update it. Handles a window that wraps
// across the new year (e.g. "11-01" to "02-28"). Both null (the default
// for every existing service) means no seasonal restriction at all.
export function isDateInSeason(isoDate: string, seasonStart: string | null, seasonEnd: string | null): boolean {
  if (!seasonStart || !seasonEnd) return true;
  const monthDay = isoDate.slice(5);
  return seasonStart <= seasonEnd ? monthDay >= seasonStart && monthDay <= seasonEnd : monthDay >= seasonStart || monthDay <= seasonEnd;
}

// A service restricted to specific weekdays (e.g. "Tuesdays and Thursdays
// only" for ERO onboarding), independent of which days the firm is
// generally open. Null/empty means every day the firm is open is fine.
export function isWeekdayAllowedForService(date: Date, allowedWeekdays: number[] | null): boolean {
  if (!allowedWeekdays || allowedWeekdays.length === 0) return true;
  return allowedWeekdays.includes(date.getDay());
}

export type ServiceAvailabilityRules = {
  seasonStart: string | null;
  seasonEnd: string | null;
  allowedWeekdays: number[] | null;
};

// Combines a service's seasonal window and allowed-weekday rules into the
// one check the booking routes need before even looking at the day's hours.
export function isServiceBookableOnDate(date: Date, rules: ServiceAvailabilityRules): boolean {
  return isDateInSeason(toIsoDate(date), rules.seasonStart, rules.seasonEnd) && isWeekdayAllowedForService(date, rules.allowedWeekdays);
}

// `date` is a plain local calendar day (midnight); returns candidate slot
// start times as Date objects for that day, spaced by `gridMinutes` and
// each guaranteed to fit a `durationMinutes`-long appointment before
// closing -- before existing appointments/lead time are subtracted out.
// `holidays` are the same system_settings shape the business-hours due-date
// engine reads -- a date falling in any range closes the day entirely
// regardless of its normal weekly hours.
export function slotsForDay(date: Date, hours: BusinessHours, gridMinutes: number, durationMinutes: number, holidays: HolidayRange[] = []): Date[] {
  if (isHoliday(toIsoDate(date), holidays)) return [];
  const dayKey = WEEKDAYS[date.getDay()];
  const day = hours[dayKey];
  if (!day) return [];

  const startMin = timeToMinutes(day.start);
  const endMin = timeToMinutes(day.end);
  const slots: Date[] = [];
  for (let m = startMin; m + durationMinutes <= endMin; m += gridMinutes) {
    const slot = new Date(date);
    slot.setHours(0, 0, 0, 0);
    slot.setMinutes(m);
    slots.push(slot);
  }
  return slots;
}

export const DEFAULT_BOOKING_MIN_NOTICE_HOURS = 0;
export const DEFAULT_BOOKING_BUFFER_MINUTES = 0;

// Removes slots that overlap an existing appointment (padded by
// `bufferMinutes` on both sides, e.g. so back-to-back bookings always leave
// a gap) or fall before `now` -- callers wanting a minimum-notice window
// (e.g. "no same-day bookings") pass `now` as `Date.now() + noticeHours`
// rather than the literal current instant, so this function itself only
// ever needs to know "the earliest instant to offer."
export function filterAvailableSlots(
  candidates: Date[],
  durationMinutes: number,
  existing: { start_at: string; end_at: string }[],
  now: Date,
  bufferMinutes = 0
): Date[] {
  return candidates.filter((slot) => {
    const slotEnd = new Date(slot.getTime() + durationMinutes * 60000);
    if (slot < now) return false;
    return !existing.some((a) => {
      const aStart = new Date(new Date(a.start_at).getTime() - bufferMinutes * 60000);
      const aEnd = new Date(new Date(a.end_at).getTime() + bufferMinutes * 60000);
      return slot < aEnd && slotEnd > aStart;
    });
  });
}
