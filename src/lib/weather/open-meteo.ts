import { z } from "zod";
import type { HourlySample } from "../../types.ts";
import { toLocalDateTime } from "./local-time.ts";
import { WeatherServiceError } from "./weather-service-error.ts";

export const GEOCODING_BASE_URL = "https://geocoding-api.open-meteo.com";
export const FORECAST_BASE_URL = "https://api.open-meteo.com";

const HOURLY_VARIABLES = "temperature_2m,wind_speed_10m,wind_gusts_10m,weather_code,precipitation_probability";

export interface AdapterOptions {
  /** Overrides the provider base URL; production call sites never set it. */
  baseUrl?: string;
}

export interface GeocodedPlace {
  latitude: number;
  longitude: number;
  label: string;
  timezone: string;
}

export interface HourlyForecast {
  /** IANA timezone of the forecast location, as returned by the provider. */
  timezone: string;
  samples: HourlySample[];
}

const geocodingResponseSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        timezone: z.string(),
        country: z.string().optional(),
        admin1: z.string().optional(),
      }),
    )
    .optional(),
});

const nullableNumbers = z.array(z.number().nullable());

const forecastResponseSchema = z.object({
  timezone: z.string(),
  hourly: z
    .object({
      time: z.array(z.number()),
      temperature_2m: nullableNumbers,
      wind_speed_10m: nullableNumbers,
      wind_gusts_10m: nullableNumbers,
      weather_code: nullableNumbers,
      precipitation_probability: nullableNumbers,
    })
    .refine(
      (hourly) =>
        [
          hourly.temperature_2m,
          hourly.wind_speed_10m,
          hourly.wind_gusts_10m,
          hourly.weather_code,
          hourly.precipitation_probability,
        ].every((series) => series.length === hourly.time.length),
      { message: "Hourly series have different lengths." },
    ),
});

function unavailable(message = "Weather data is currently unavailable."): WeatherServiceError {
  return new WeatherServiceError("WEATHER_UNAVAILABLE", message);
}

/** GET a JSON document; any network, timeout, status or parse failure becomes WEATHER_UNAVAILABLE. */
async function getJson(url: URL, signal: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(url, { signal, headers: { accept: "application/json" } });
    if (!response.ok) throw unavailable();
    return (await response.json()) as unknown;
  } catch (error) {
    throw error instanceof WeatherServiceError ? error : unavailable();
  }
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildLabel(parts: readonly (string | undefined)[]): string {
  const unique: string[] = [];
  for (const part of parts) {
    const trimmed = part?.trim();
    if (trimmed && !unique.includes(trimmed)) unique.push(trimmed);
  }
  return unique.join(", ");
}

/** Resolve a typed place name to one best match, or `null` when the provider has none. */
export async function geocodePlace(
  query: string,
  signal: AbortSignal,
  options?: AdapterOptions,
): Promise<GeocodedPlace | null> {
  let url: URL;
  try {
    url = new URL("/v1/search", options?.baseUrl ?? GEOCODING_BASE_URL);
  } catch {
    throw unavailable();
  }
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const parsed = geocodingResponseSchema.safeParse(await getJson(url, signal));
  if (!parsed.success) throw unavailable();

  const match = parsed.data.results?.[0];
  if (!match) return null;

  return {
    latitude: match.latitude,
    longitude: match.longitude,
    label: buildLabel([match.name, match.admin1, match.country]),
    timezone: match.timezone,
  };
}

/**
 * Hourly forecast for today and the next seven days, as samples in the location's local time.
 *
 * Samples missing temperature, wind, gust or weather code are dropped; precipitation
 * probability may stay null.
 */
export async function fetchHourlySamples(
  latitude: number,
  longitude: number,
  signal: AbortSignal,
  options?: AdapterOptions,
): Promise<HourlyForecast> {
  let url: URL;
  try {
    url = new URL("/v1/forecast", options?.baseUrl ?? FORECAST_BASE_URL);
  } catch {
    throw unavailable();
  }
  url.searchParams.set("latitude", String(roundCoordinate(latitude)));
  url.searchParams.set("longitude", String(roundCoordinate(longitude)));
  url.searchParams.set("hourly", HOURLY_VARIABLES);
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("forecast_days", "8");

  const parsed = forecastResponseSchema.safeParse(await getJson(url, signal));
  if (!parsed.success) throw unavailable();

  const { timezone, hourly } = parsed.data;
  const samples: HourlySample[] = [];
  try {
    hourly.time.forEach((seconds, index) => {
      const tempC = hourly.temperature_2m[index];
      const windKmh = hourly.wind_speed_10m[index];
      const gustKmh = hourly.wind_gusts_10m[index];
      const weatherCode = hourly.weather_code[index];
      if (tempC == null || windKmh == null || gustKmh == null || weatherCode == null) return;

      const local = toLocalDateTime(seconds * 1000, timezone);
      samples.push({
        date: local.date,
        hour: local.hour,
        tempC,
        windKmh,
        gustKmh,
        weatherCode,
        precipProbability: hourly.precipitation_probability[index] ?? null,
      });
    });
  } catch {
    // An unknown timezone name from the provider makes the timestamps unusable.
    throw unavailable();
  }

  return { timezone, samples };
}
