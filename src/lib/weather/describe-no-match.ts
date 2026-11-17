import type { Hazard, NoMatchReason, RideCriteria } from "../../types.ts";
import { isoWeekdayOf } from "./match-windows.ts";

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const HAZARD_NAMES: Record<Hazard, string> = {
  thunderstorm: "thunderstorm",
  "freezing-precipitation": "freezing rain or drizzle",
  "strong-gusts": "strong gusts",
  "extreme-heat": "extreme heat",
};

function describeScope(reason: NoMatchReason, weekday: string): string {
  const slots = reason.totalSlots === 1 ? "slot" : "slots";
  return reason.slotsAffected === reason.totalSlots
    ? `in all ${reason.totalSlots} ${slots} on ${weekday}`
    : `in ${reason.slotsAffected} of ${reason.totalSlots} ${slots} on ${weekday}`;
}

function describeReason(reason: NoMatchReason, criteria: RideCriteria, weekday: string): string {
  const scope = describeScope(reason, weekday);

  switch (reason.cause) {
    case "wind":
      return `Wind exceeds ${criteria.maxWindKmh} km/h ${scope}.`;
    case "temperature":
      return `Temperature is below ${criteria.minTempC} °C ${scope}.`;
    case "danger": {
      const hazards = (reason.hazards ?? []).map((hazard) => HAZARD_NAMES[hazard]);
      const detail = hazards.length > 0 ? ` (${hazards.join(", ")})` : "";
      return `Dangerous weather${detail} ${scope}.`;
    }
    case "forecast-gap":
      return `Forecast data is missing for ${scope.replace(/^in /, "")}.`;
  }
}

/**
 * Human sentence(s) for why no window matched, e.g. "Wind exceeds 25 km/h in all 2 slots on Thursday."
 * Each reason is its own sentence; reasons are joined with a single space.
 */
export function describeNoMatch(reasons: readonly NoMatchReason[], criteria: RideCriteria, targetDate: string): string {
  const weekday = WEEKDAY_NAMES[isoWeekdayOf(targetDate) - 1];
  if (reasons.length === 0) return "No matching windows.";
  return reasons.map((reason) => describeReason(reason, criteria, weekday)).join(" ");
}
