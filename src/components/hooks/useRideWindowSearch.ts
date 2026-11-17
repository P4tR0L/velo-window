import { useCallback, useRef, useState } from "react";
import type { ApiErrorCode, RideCriteria, RideWindowSearchResponse, SearchErrorCode } from "@/types";

export interface RideSearchInput {
  criteria: RideCriteria;
  /** Place typed by the user; empty means "use the device location". */
  place: string;
}

export type RideSearchState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "loading" }
  | { status: "success"; response: RideWindowSearchResponse }
  | { status: "error"; code: SearchErrorCode; message: string };

const ERROR_MESSAGES: Record<SearchErrorCode, string> = {
  UNAUTHENTICATED: "Your session has expired. Sign in again to search for ride windows.",
  INVALID_REQUEST: "Something is wrong with the search settings. Check them and try again.",
  PLACE_NOT_FOUND: "We couldn't find that place. Check the spelling or try a nearby town.",
  WEATHER_UNAVAILABLE: "Weather data is unavailable right now, so we can't show windows. Try again in a moment.",
  LOCATION_DENIED:
    "We couldn't get your location. Type a place name above, or allow location access in your browser and try again.",
};

const API_ERROR_CODES: readonly string[] = [
  "UNAUTHENTICATED",
  "INVALID_REQUEST",
  "PLACE_NOT_FOUND",
  "WEATHER_UNAVAILABLE",
] satisfies ApiErrorCode[];

/** Hard stop for the location lookup, covering browsers that never time out a pending prompt. */
const LOCATION_DEADLINE_MS = 30_000;
const LOCATION_TIMEOUT_MS = 10_000;

interface Coordinates {
  latitude: number;
  longitude: number;
}

function errorState(code: SearchErrorCode): RideSearchState {
  return { status: "error", code, message: ERROR_MESSAGES[code] };
}

function readErrorCode(data: unknown): ApiErrorCode | null {
  if (typeof data !== "object" || data === null || !("error" in data)) return null;
  const error = data.error;
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = error.code;
  return typeof code === "string" && API_ERROR_CODES.includes(code) ? (code as ApiErrorCode) : null;
}

function isSearchResponse(data: unknown): data is RideWindowSearchResponse {
  return (
    typeof data === "object" && data !== null && "location" in data && "windows" in data && Array.isArray(data.windows)
  );
}

/** Ask the browser for the current position. Rejects on denial, timeout or missing support. */
function getDevicePosition(): Promise<Coordinates> {
  return new Promise<Coordinates>((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation is not supported."));
      return;
    }
    const deadline = setTimeout(() => {
      reject(new Error("Location request timed out."));
    }, LOCATION_DEADLINE_MS);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(deadline);
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      (positionError) => {
        clearTimeout(deadline);
        reject(new Error(positionError.message));
      },
      { enableHighAccuracy: false, timeout: LOCATION_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

/** Owns the search flow; coordinates only live in memory for the duration of one request. */
export function useRideWindowSearch() {
  const [state, setState] = useState<RideSearchState>({ status: "idle" });
  const latestSearch = useRef(0);

  const search = useCallback((input: RideSearchInput) => {
    latestSearch.current += 1;
    const searchId = latestSearch.current;
    const isCurrent = () => latestSearch.current === searchId;

    async function run() {
      const place = input.place.trim();
      let location: { kind: "place"; query: string } | ({ kind: "coords" } & Coordinates);

      if (place) {
        location = { kind: "place", query: place };
      } else {
        setState({ status: "locating" });
        try {
          location = { kind: "coords", ...(await getDevicePosition()) };
        } catch {
          if (isCurrent()) setState(errorState("LOCATION_DENIED"));
          return;
        }
        if (!isCurrent()) return;
      }

      setState({ status: "loading" });
      try {
        const response = await fetch("/api/ride-windows/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input.criteria, location }),
        });
        const data: unknown = await response.json().catch(() => null);
        if (!isCurrent()) return;

        if (response.ok && isSearchResponse(data)) {
          setState({ status: "success", response: data });
        } else {
          setState(errorState(readErrorCode(data) ?? "WEATHER_UNAVAILABLE"));
        }
      } catch {
        if (isCurrent()) setState(errorState("WEATHER_UNAVAILABLE"));
      }
    }

    void run();
  }, []);

  return { state, search };
}
