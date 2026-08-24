export type DashboardRange = "day" | "week" | "month" | "quarter" | "year";

export const DASHBOARD_RANGES: { value: DashboardRange; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

export function isDashboardRange(value: string | undefined): value is DashboardRange {
  return DASHBOARD_RANGES.some((r) => r.value === value);
}

/** [start, end) bounds for the calendar period containing `now` that this range represents. */
export function getRangeBounds(range: DashboardRange, now = new Date()): { start: Date; end: Date; label: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);

  switch (range) {
    case "day":
      end.setDate(end.getDate() + 1);
      return { start, end, label: start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) };
    case "week": {
      // Monday-start week.
      const dayOfWeek = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - dayOfWeek);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
      return { start, end, label: `Week of ${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` };
    }
    case "month":
      start.setDate(1);
      end.setTime(start.getTime());
      end.setMonth(end.getMonth() + 1);
      return { start, end, label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
    case "quarter": {
      const quarterStartMonth = Math.floor(start.getMonth() / 3) * 3;
      start.setMonth(quarterStartMonth, 1);
      end.setTime(start.getTime());
      end.setMonth(end.getMonth() + 3);
      return { start, end, label: `Q${quarterStartMonth / 3 + 1} ${start.getFullYear()}` };
    }
    case "year":
      start.setMonth(0, 1);
      end.setTime(start.getTime());
      end.setFullYear(end.getFullYear() + 1);
      return { start, end, label: String(start.getFullYear()) };
  }
}
