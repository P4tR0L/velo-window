import type { LocalNow } from "../../types.ts";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    // Throws a RangeError for an unknown timezone name; callers translate that.
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

/** Local date, hour and minute of an instant in the given IANA timezone (DST-aware). */
export function toLocalDateTime(epochMs: number, timezone: string): LocalNow {
  const parts = new Map<string, string>();
  for (const part of formatterFor(timezone).formatToParts(new Date(epochMs))) {
    parts.set(part.type, part.value);
  }
  return {
    date: `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`,
    hour: Number(parts.get("hour")) % 24,
    minute: Number(parts.get("minute")),
  };
}
