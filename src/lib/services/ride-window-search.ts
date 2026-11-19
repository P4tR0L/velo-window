import type { LocalNow, RideCriteria, RideWindowSearchResponse } from "../../types.ts";
import type { RideSearchRequest } from "../schemas/ride-search-request.ts";
import { describeNoMatch } from "../weather/describe-no-match.ts";
import { toLocalDateTime } from "../weather/local-time.ts";
import { findRideWindows } from "../weather/match-windows.ts";
import { fetchHourlySamples, geocodePlace } from "../weather/open-meteo.ts";
import { WeatherServiceError } from "../weather/weather-service-error.ts";

export { WeatherServiceError } from "../weather/weather-service-error.ts";
export type { WeatherServiceErrorCode } from "../weather/weather-service-error.ts";

/** Shared deadline for the geocode and forecast calls, to stay within the 10 s requirement. */
const SEARCH_TIMEOUT_MS = 8000;

const DEVICE_LOCATION_LABEL = "Your current location";

/** Resolve the location, fetch the forecast and find ride windows for one search. */
export async function searchRideWindows(request: RideSearchRequest): Promise<RideWindowSearchResponse> {
  const signal = AbortSignal.timeout(SEARCH_TIMEOUT_MS);

  let latitude: number;
  let longitude: number;
  let label: string;
  if (request.location.kind === "place") {
    const place = await geocodePlace(request.location.query, signal);
    if (!place) {
      throw new WeatherServiceError("PLACE_NOT_FOUND", "No place matches that search.");
    }
    ({ latitude, longitude, label } = place);
  } else {
    ({ latitude, longitude } = request.location);
    label = DEVICE_LOCATION_LABEL;
  }

  const forecast = await fetchHourlySamples(latitude, longitude, signal);
  const fetchedAt = new Date();

  let now: LocalNow;
  try {
    now = toLocalDateTime(fetchedAt.getTime(), forecast.timezone);
  } catch {
    throw new WeatherServiceError("WEATHER_UNAVAILABLE", "Weather data is currently unavailable.");
  }

  const hasCurrentHour = forecast.samples.some((sample) => sample.date === now.date && sample.hour === now.hour);
  if (!hasCurrentHour) {
    throw new WeatherServiceError("WEATHER_UNAVAILABLE", "The weather forecast is out of date.");
  }

  const criteria: RideCriteria = {
    isoWeekday: request.isoWeekday,
    startHour: request.startHour,
    endHour: request.endHour,
    maxWindKmh: request.maxWindKmh,
    minTempC: request.minTempC,
  };
  const result = findRideWindows({ samples: forecast.samples, criteria, now });

  return {
    location: { label, timezone: forecast.timezone },
    fetchedAt: fetchedAt.toISOString(),
    targetDate: result.targetDate,
    windows: result.windows.map((window) => ({ ...window, recommendation: null })),
    recommendationStatus: null,
    noMatchMessage:
      result.windows.length === 0 ? describeNoMatch(result.noMatchReasons, criteria, result.targetDate) : null,
  };
}
