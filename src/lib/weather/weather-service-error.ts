import type { ApiErrorCode } from "../../types.ts";

export type WeatherServiceErrorCode = Extract<ApiErrorCode, "PLACE_NOT_FOUND" | "WEATHER_UNAVAILABLE">;

/** Typed failure of the weather service; the message is plain and never contains coordinates. */
export class WeatherServiceError extends Error {
  code: WeatherServiceErrorCode;

  constructor(code: WeatherServiceErrorCode, message: string) {
    super(message);
    this.name = "WeatherServiceError";
    this.code = code;
  }
}
