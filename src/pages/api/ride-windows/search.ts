import type { APIRoute } from "astro";
import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "astro:env/server";
import { rideSearchRequestSchema } from "@/lib/schemas/ride-search-request";
import { searchRideWindows, WeatherServiceError } from "@/lib/services/ride-window-search";
import type { ApiErrorBody, ApiErrorCode } from "@/types";

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, code: ApiErrorCode, message: string): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return json(body, status);
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in to search for ride windows.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "INVALID_REQUEST", "The search request is not valid JSON.");
  }

  const parsed = rideSearchRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return errorResponse(400, "INVALID_REQUEST", "The search request is invalid.");
  }

  try {
    const result = await searchRideWindows(parsed.data, {
      recommendation: { apiKey: OPENROUTER_API_KEY, model: OPENROUTER_MODEL },
    });
    return json(result, 200);
  } catch (error) {
    if (error instanceof WeatherServiceError) {
      if (error.code === "PLACE_NOT_FOUND") {
        return errorResponse(404, "PLACE_NOT_FOUND", "We couldn't find that place.");
      }
      return errorResponse(502, "WEATHER_UNAVAILABLE", "Weather data is currently unavailable.");
    }
    return errorResponse(502, "WEATHER_UNAVAILABLE", "Weather data is currently unavailable.");
  }
};
