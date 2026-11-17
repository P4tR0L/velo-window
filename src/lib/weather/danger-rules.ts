import type { Hazard, HourlySample } from "../../types.ts";

/** Gusts at or above this value (km/h) are dangerous. */
export const DANGER_GUST_KMH = 60;

/** Air temperature at or above this value (°C) is dangerous. */
export const DANGER_HEAT_C = 35;

/** WMO weather codes for thunderstorm (with or without hail). */
export const THUNDERSTORM_CODES: ReadonlySet<number> = new Set([95, 96, 99]);

/** WMO weather codes for freezing drizzle (56, 57) and freezing rain (66, 67). */
export const FREEZING_PRECIPITATION_CODES: ReadonlySet<number> = new Set([56, 57, 66, 67]);

/** Fixed reporting order of hazards. */
export const HAZARD_ORDER: readonly Hazard[] = [
  "thunderstorm",
  "freezing-precipitation",
  "strong-gusts",
  "extreme-heat",
];

/**
 * Hazards present for a slot covering `start.hour` to `end.hour` (the next consecutive hour).
 *
 * Weather codes and temperatures are checked at both samples. Gusts are checked only at the
 * end sample: `wind_gusts_10m` is the maximum of the preceding hour, so it describes the slot.
 * Gust and heat comparisons are inclusive.
 */
export function findHazards(start: HourlySample, end: HourlySample): Hazard[] {
  const found = new Set<Hazard>();

  for (const sample of [start, end]) {
    if (THUNDERSTORM_CODES.has(sample.weatherCode)) found.add("thunderstorm");
    if (FREEZING_PRECIPITATION_CODES.has(sample.weatherCode)) found.add("freezing-precipitation");
    if (sample.tempC >= DANGER_HEAT_C) found.add("extreme-heat");
  }

  if (end.gustKmh >= DANGER_GUST_KMH) found.add("strong-gusts");

  return HAZARD_ORDER.filter((hazard) => found.has(hazard));
}
