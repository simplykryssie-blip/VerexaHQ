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

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// `date` is a plain local calendar day (midnight); returns candidate slot
// start times as Date objects for that day, spaced by `gridMinutes` and
// each guaranteed to fit a `durationMinutes`-long appointment before
// closing -- before existing appointments/lead time are subtracted out.
// `holidays` are 'YYYY-MM-DD' strings (same system_settings shape the
// business-hours due-date engine reads) -- a holiday closes the day
// entirely regardless of its normal weekly hours.
export function slotsForDay(date: Date, hours: BusinessHours, gridMinutes: number, durationMinutes: number, holidays: string[] = []): Date[] {
  if (holidays.includes(toIsoDate(date))) return [];
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

// Removes slots that overlap an existing appointment or fall before `now`,
// using the specific service's duration to compute each candidate's end time.
export function filterAvailableSlots(
  candidates: Date[],
  durationMinutes: number,
  existing: { start_at: string; end_at: string }[],
  now: Date
): Date[] {
  return candidates.filter((slot) => {
    const slotEnd = new Date(slot.getTime() + durationMinutes * 60000);
    if (slot < now) return false;
    return !existing.some((a) => {
      const aStart = new Date(a.start_at);
      const aEnd = new Date(a.end_at);
      return slot < aEnd && slotEnd > aStart;
    });
  });
}
