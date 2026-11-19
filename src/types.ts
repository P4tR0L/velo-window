/**
 * Shared entities and DTOs for ride window search.
 *
 * Pure type-only module: keep it free of runtime code and non-relative imports so the
 * matcher and its check script can run directly under `node --experimental-strip-types`.
 */

/** User-chosen ride criteria. Hours are whole local hours of the searched place. */
export interface RideCriteria {
  /** ISO weekday: 1 = Monday ... 7 = Sunday. */
  isoWeekday: number;
  /** First hour of the range, 0-23, inclusive. */
  startHour: number;
  /** End of the range, 1-24, exclusive, greater than `startHour`. */
  endHour: number;
  /** Maximum sustained wind in km/h (inclusive). */
  maxWindKmh: number;
  /** Minimum air temperature in °C (inclusive). */
  minTempC: number;
}

/** One hourly forecast sample in the searched place's local time. */
export interface HourlySample {
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  /** Local hour, 0-23. */
  hour: number;
  tempC: number;
  /** Sustained wind speed at the timestamp, km/h. */
  windKmh: number;
  /** Maximum gust over the preceding hour, km/h. */
  gustKmh: number;
  weatherCode: number;
  precipProbability: number | null;
  /** Direction the wind comes from, degrees 0-360 (meteorological); `null` when the provider has none. */
  windDirectionDeg: number | null;
}

/** Current local date and time of the searched place. */
export interface LocalNow {
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  hour: number;
  minute: number;
}

/** Danger rules that can exclude a slot regardless of user criteria. */
export type Hazard = "thunderstorm" | "freezing-precipitation" | "strong-gusts" | "extreme-heat";

/** One evaluated, passing hourly slot. It covers `hour` to `hour + 1`. */
export interface WindowSlot {
  date: string;
  hour: number;
  tempC: number;
  windKmh: number;
  /** Maximum gust over the slot's hour (the sample at the slot's end). */
  gustKmh: number;
  precipProbability: number | null;
  /** Direction the wind comes from at the slot's start, degrees 0-360; `null` when unknown. */
  windDirectionDeg: number | null;
}

/** An unbroken run of passing slots on one date. `endHour` is exclusive. */
export interface RideWindow {
  date: string;
  startHour: number;
  endHour: number;
  slots: WindowSlot[];
}

export type NoMatchCause = "wind" | "temperature" | "danger" | "forecast-gap";

/** Why slots in the searched range failed, with counts. */
export interface NoMatchReason {
  cause: NoMatchCause;
  slotsAffected: number;
  totalSlots: number;
  /** For `danger`: which danger rules fired across the affected slots. */
  hazards?: Hazard[];
}

export interface WindowSearchResult {
  /** Local date, `YYYY-MM-DD`, the search resolved to. */
  targetDate: string;
  windows: RideWindow[];
  /** Empty when at least one window exists. */
  noMatchReasons: NoMatchReason[];
}

/** AI advice for one ride window, grounded in that window's own forecast. */
export interface WindowRecommendation {
  summary: string;
  routeAdvice: string;
  styleTips: string[];
}

/** A ride window with its AI recommendation; `null` when none could be produced. */
export interface RecommendedWindow extends RideWindow {
  recommendation: WindowRecommendation | null;
}

/** Outcome of the recommendation step for a search that has windows. */
export type RecommendationStatus = "ok" | "unavailable" | "invalid-output";

/** Successful response of the search API. */
export interface RideWindowSearchResponse {
  location: { label: string; timezone: string };
  /** ISO time of the forecast fetch. */
  fetchedAt: string;
  targetDate: string;
  windows: RecommendedWindow[];
  /** `null` when there are no windows (no recommendation was attempted). */
  recommendationStatus: RecommendationStatus | null;
  /** Human-readable reason; `null` when windows exist. */
  noMatchMessage: string | null;
}

export type ApiErrorCode = "UNAUTHENTICATED" | "INVALID_REQUEST" | "PLACE_NOT_FOUND" | "WEATHER_UNAVAILABLE";

/** Error codes the search UI can show: the API codes plus the client-only `LOCATION_DENIED`. */
export type SearchErrorCode = ApiErrorCode | "LOCATION_DENIED";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}
