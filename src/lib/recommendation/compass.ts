const COMPASS_POINTS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

const DEGREES_PER_POINT = 360 / COMPASS_POINTS.length;

/**
 * Compass point of a bearing in degrees, one of 16 points of 22.5° each (N covers 348.75 up
 * to but excluding 11.25). The bearing is normalised to 0-360; `null` (or a non-finite
 * number) gives "unknown".
 */
export function compassPoint(degrees: number | null): string {
  if (degrees === null || !Number.isFinite(degrees)) return "unknown";
  const normalised = ((degrees % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalised / DEGREES_PER_POINT) % COMPASS_POINTS.length];
}
