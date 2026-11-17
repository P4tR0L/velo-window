/** Hour of day as `HH:00`; 24 renders as `24:00`. */
export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Weekday and date for a local `YYYY-MM-DD` date, e.g. "Saturday, 22 November". */
export function formatTargetDate(date: string): string {
  const instant = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(instant.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(instant);
}

/** Wall-clock time of an ISO instant in the given IANA timezone, e.g. "22 Nov, 14:05 CET". */
export function formatFetchedAt(iso: string, timezone: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
      timeZone: timezone,
    }).format(instant);
  } catch {
    return iso;
  }
}
