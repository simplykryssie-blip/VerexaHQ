// No timezone library dependency exists in this codebase, so this is the
// whole model: two small, well-known techniques that need nothing but Intl,
// already available in both Node and every browser this app targets.

// Converts a plain local wall-clock time ('YYYY-MM-DD', 'HH:MM') in a given
// IANA zone into the real UTC instant it represents, DST-aware. Works by
// guessing the instant is UTC, checking what that guess actually reads as
// in the target zone, then correcting by the difference -- the standard
// round-trip-through-Intl technique for zoned time without a library.
export function zonedTimeToUtc(isoDate: string, hhmm: string, timeZone: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(utcGuess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));

  return new Date(utcGuess - (asIfUtc - utcGuess));
}

// The calendar date (YYYY-MM-DD) a real instant falls on in a given IANA
// zone -- e.g. resolving which day an already-chosen appointment instant
// belongs to for holiday/time-off lookups, which are keyed by date, not
// instant. en-CA is the one common locale whose default date format is
// already YYYY-MM-DD, so no manual reassembly of the formatted parts.
export function isoDateInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// The weekday of a plain calendar date is the same everywhere on Earth --
// deliberately avoids the server's own local clock (new Date(isoDate).getDay()
// would silently depend on which timezone the server process happens to run
// in) by parsing the date as UTC and reading it back as UTC.
export function weekdayOfIsoDate(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}
