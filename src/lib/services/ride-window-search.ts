import type {
  LocalNow,
  RecommendationStatus,
  RecommendedWindow,
  RideCriteria,
  RideWindow,
  RideWindowSearchResponse,
} from "../../types.ts";
import {
  DEFAULT_RECOMMENDATION_MODEL,
  RecommendationError,
  requestRecommendations,
} from "../recommendation/openrouter.ts";
import { buildRecommendationPrompt } from "../recommendation/prompt.ts";
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

/** Total budget, from the start of the search, within which the recommendation step must finish. */
const TOTAL_BUDGET_MS = 9000;

/** The recommendation step is skipped when less than this is left of the total budget. */
const MIN_RECOMMENDATION_MS = 2000;

const DEVICE_LOCATION_LABEL = "Your current location";

export interface SearchOptions {
  recommendation?: { apiKey?: string; model?: string };
}

interface RecommendationOutcome {
  windows: RecommendedWindow[];
  status: RecommendationStatus | null;
}

/** Trimmed value, or `undefined` when it is missing or blank. */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/**
 * Add an AI recommendation to each matched window. Never throws and never changes the windows:
 * any failure leaves every `recommendation` null and reports a typed status. The prompt gets
 * only the matched windows and the criteria, never the location.
 */
async function recommendForWindows(
  windows: RideWindow[],
  criteria: RideCriteria,
  startedAt: number,
  options: SearchOptions["recommendation"],
): Promise<RecommendationOutcome> {
  if (windows.length === 0) return { windows: [], status: null };

  const withoutRecommendation = (status: RecommendationStatus): RecommendationOutcome => ({
    windows: windows.map((window) => ({ ...window, recommendation: null })),
    status,
  });

  const apiKey = nonEmpty(options?.apiKey);
  const remainingMs = TOTAL_BUDGET_MS - (Date.now() - startedAt);
  if (!apiKey || remainingMs < MIN_RECOMMENDATION_MS) return withoutRecommendation("unavailable");

  try {
    const recommendations = await requestRecommendations({
      apiKey,
      model: nonEmpty(options?.model) ?? DEFAULT_RECOMMENDATION_MODEL,
      prompt: buildRecommendationPrompt({ windows, criteria }),
      windowCount: windows.length,
      signal: AbortSignal.timeout(remainingMs),
    });
    return {
      windows: windows.map((window, index) => ({ ...window, recommendation: recommendations[index] ?? null })),
      status: "ok",
    };
  } catch (error) {
    return withoutRecommendation(error instanceof RecommendationError ? error.code : "unavailable");
  }
}

/** Resolve the location, fetch the forecast and find ride windows for one search. */
export async function searchRideWindows(
  request: RideSearchRequest,
  options?: SearchOptions,
): Promise<RideWindowSearchResponse> {
  const startedAt = Date.now();
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
  const recommended = await recommendForWindows(result.windows, criteria, startedAt, options?.recommendation);

  return {
    location: { label, timezone: forecast.timezone },
    fetchedAt: fetchedAt.toISOString(),
    targetDate: result.targetDate,
    windows: recommended.windows,
    recommendationStatus: recommended.status,
    noMatchMessage:
      result.windows.length === 0 ? describeNoMatch(result.noMatchReasons, criteria, result.targetDate) : null,
  };
}
