import type { RideCriteria } from "../types.ts";

/** Allowed maximum sustained wind presets, km/h. */
export const WIND_LIMIT_OPTIONS_KMH = [10, 15, 20, 25, 30, 35] as const;

/** Allowed minimum air temperature presets, °C. */
export const MIN_TEMP_OPTIONS_C = [0, 5, 10, 15, 20] as const;

/** Form defaults: Saturday 09:00-12:00, wind up to 20 km/h, at least 10 °C. */
export const DEFAULT_CRITERIA: RideCriteria = {
  isoWeekday: 6,
  startHour: 9,
  endHour: 12,
  maxWindKmh: 20,
  minTempC: 10,
};
