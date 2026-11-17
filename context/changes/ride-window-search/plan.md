# Ride Window Search Implementation Plan

## Overview

Roadmap slice S-01. A signed-in cyclist opens `/dashboard`, enters a weekday, a whole-hour time range, a minimum temperature, a maximum wind speed and an optional starting place, and sees the matching hourly weather windows — or a clear, quantified reason none match. Forecasts come from Open-Meteo. A pure, dependency-free matcher holds the safety-critical rules (what counts as a window, wind basis, never offering dangerous hours, ordering, which date "Thursday" means) and is checked by a plain Node script that also runs in CI.

## Current State Analysis

- No ride, weather, or window-matching code exists. The app is the Astro starter plus Supabase email/password auth (`src/pages/api/auth/`, `src/pages/auth/`).
- `src/pages/dashboard.astro` is a protected placeholder (welcome text and sign-out). `src/middleware.ts` guards `/dashboard` through `PROTECTED_ROUTES` and sets `context.locals.user`.
- No validation library is installed (`package.json` has no `zod`), although AGENTS.md requires zod validation on API routes. No shared `src/types.ts`, no `src/components/hooks/`, no `src/lib/services/`.
- Only `button.tsx` exists under `src/components/ui/`.
- No weather provider and no secrets for one. `astro.config.mjs` `env.schema` declares only the Supabase secrets.
- No app logger. ESLint is strict type-checked with `no-console: warn` and the rule may not be suppressed (AGENTS.md hard rule).
- No test runner (parked in the roadmap). CI (`.github/workflows/ci.yml`) runs `npm ci`, `astro sync`, `npm run lint`, `npm run build` on Node 22 (`.nvmrc` 22.14.0).
- Cloudflare Workers runtime with `nodejs_compat` (`wrangler.jsonc`). A request has a subrequest cap (`context/foundation/infrastructure.md`), so the search stays at three subrequests (Supabase `getUser`, geocode, forecast).

## Desired End State

On `/dashboard`, a signed-in user submits criteria and gets one of:

1. One or more windows, listed earliest first, each showing its hours with temperature, wind, gust and precipitation probability, plus the resolved place name and a "forecast fetched at" time.
2. A no-match message with counts, for example "Wind exceeds 25 km/h in all 2 slots on Thursday".
3. A clear error for an unknown place, an unavailable or incomplete forecast, or denied device location.

Dangerous hours (thunderstorm, gusts ≥ 60 km/h, air temperature ≥ 35 °C, freezing rain or drizzle) never appear in any window, whatever the user's limits. The page is usable at 375 px width. A location typed or detected is used for the lookup only and is never stored or logged.

Verification: `npm run check:windows`, `npm run lint`, `npm run build`, plus the manual checks in each phase.

### Key Discoveries:

- `src/middleware.ts:4-23` — auth is resolved per request into `context.locals.user`; API routes must check `locals.user` themselves (only `/dashboard` is in `PROTECTED_ROUTES`).
- `src/pages/api/auth/signin.ts:1-20` — the existing API route shape (`APIRoute`, `createClient`); new routes must also export `const prerender = false` and validate with zod.
- `src/components/auth/SignInForm.tsx:13-86` — the React form pattern (controlled state, inline field errors, `FormField`, `SubmitButton`).
- `astro/tsconfigs/base.json` sets `allowImportingTsExtensions: true` and `verbatimModuleSyntax: true`, so a pure `.ts` module with relative `.ts` imports and `import type` can be run directly by `node --experimental-strip-types`.
- Open-Meteo hourly data (docs): `temperature_2m`, `wind_speed_10m`, `weather_code` are instantaneous at the timestamp; `wind_gusts_10m` is the maximum of the _preceding_ hour. With `timezone=auto` timestamps use one fixed UTC offset resolved at request time and DST changes inside the range are ignored; `timeformat=unixtime` plus the returned `timezone` name avoids that.

## What We're NOT Doing

- AI recommendations and route paths (S-02, S-03) and saving or browsing rides (S-04, S-05). Nothing is persisted: no criteria, windows, or locations.
- Multiple weekdays per search, overnight ranges (end before start), minute-level times, or a horizon beyond today + 7 days.
- Falling back to next week when today still has remaining hours but none match. The fallback applies only when today's window has fully passed.
- Letting the user pick among several geocoding matches. The top result is used and its resolved name is shown so a wrong match is visible.
- Rain or snow amount as a user criterion, treating heavy rain or snow as dangerous, and apparent temperature or wind chill.
- A gust-based user limit or any derived second wind threshold. The user's limit applies to sustained wind only.
- Server-side logging. There is no logger and `no-console` may not be suppressed; failures surface as typed errors in the UI.
- A test framework (Vitest or similar), forecast caching, rate limiting, and unit switching (km/h and °C only).
- Third-party sign-in (S-06) and any new Supabase tables or migrations.

## Implementation Approach

Build the rules first as pure functions with no I/O, prove them with a fixture script, then add the network layer, then the route and UI. Matching decisions made during planning:

- A **window** is an unbroken run of passing hourly slots inside the user's range, minimum one slot. Windows are listed chronologically, earliest first.
- Time ranges are whole hours, start inclusive and end exclusive (15:00–17:00 means the 15:00 and 16:00 slots), in the **searched location's local time**.
- The user's limits are inclusive: wind exactly at the max passes, temperature exactly at the min passes. Wind limits are checked against sustained wind.
- **Danger is separate from the user's limits** and always excludes a slot: weather code in {95, 96, 99} (thunderstorm) or {56, 57, 66, 67} (freezing drizzle or rain), gusts ≥ 60 km/h, air temperature ≥ 35 °C.
- **Weekday**: today if it is the chosen weekday and any hour of the range is still ahead (range end × 60 > current minutes); otherwise the next date with that weekday within the next seven days. Today's already-finished hours are dropped; the hour in progress counts.
- Wind and temperature presets are fixed lists: max wind 10, 15, 20, 25, 30, 35 km/h; min temperature 0, 5, 10, 15, 20 °C.
- Location: a typed place is geocoded server-side (top result). With no typed place the browser requests device coordinates at search time. Coordinates are rounded to two decimals before going to the provider. If permission is denied the user is asked to type a place.

## Critical Implementation Details

- **Slot evaluation and gust timing.** A slot starting at timestamp T covers T to T+1. The user's temperature and wind limits use the samples at T. Danger uses the weather codes and temperatures at T and T+1 and the gust value at T+1 (the maximum of the hour T to T+1, since `wind_gusts_10m` is a preceding-hour maximum). A slot without a T+1 sample is not evaluable and is excluded, never assumed safe; if that leaves no evaluable slot, the reason is a forecast gap rather than "wind" or "temperature".
- **Timezone and DST.** Request `timeformat=unixtime` and convert each timestamp to local date and hour with `Intl.DateTimeFormat` using the `timezone` name in the response, so hours stay correct across a DST change. "Now" is derived the same way.
- **Freshness guard.** The forecast must contain a sample for the current local hour. If it does not, treat the forecast as unusable and return the weather-unavailable error instead of matching against old data.
- **Pure-module constraint.** `src/types.ts`, `src/lib/ride-criteria.ts` and everything under `src/lib/weather/` that the check script imports must use relative `.ts` imports and `import type`, with no `@/` alias, `astro:*`, or `zod` imports, so Node can run them. The open-meteo adapter may import `zod` (a package) but still uses relative imports.
- **No `console` in the check script.** Assert with `node:assert` and signal failure by exit code; print a final summary line with `process.stdout.write`, not `console`.

## Phase 1: Matching core and check script

### Overview

All rules from "Implementation Approach" as pure code, plus a dependency-free script that asserts them, wired into `npm run check:windows` and CI. No network, no UI.

### Changes Required:

#### 1. Shared types

**File**: `src/types.ts` (new)

**Intent**: Single home for the entities shared by the matcher, service, API and UI so the phases agree on one vocabulary.

**Contract**: Exports (type-only) `RideCriteria` (ISO weekday 1–7 where 1 = Monday, `startHour` 0–23, `endHour` 1–24 greater than `startHour`, `maxWindKmh`, `minTempC`), `HourlySample` (`date` as `YYYY-MM-DD`, `hour` 0–23 local, `tempC`, `windKmh`, `gustKmh`, `weatherCode`, `precipProbability: number | null`), `LocalNow` (`date`, `hour`, `minute`), `WindowSlot`, `RideWindow` (`date`, `startHour`, `endHour`, `slots`), `NoMatchReason` (`cause: "wind" | "temperature" | "danger" | "forecast-gap"`, `slotsAffected`, `totalSlots`, `hazards?` listing which danger rules fired), `WindowSearchResult` (`targetDate`, `windows`, `noMatchReasons`) and the API response and error DTOs used in Phase 3.

#### 2. Criteria presets

**File**: `src/lib/ride-criteria.ts` (new)

**Intent**: One source for the allowed wind and temperature presets and the form defaults, shared by the API schema and the UI.

**Contract**: Exports `WIND_LIMIT_OPTIONS_KMH = [10, 15, 20, 25, 30, 35]`, `MIN_TEMP_OPTIONS_C = [0, 5, 10, 15, 20]` as `as const` arrays and `DEFAULT_CRITERIA`. No imports beyond types.

#### 3. Danger rules

**File**: `src/lib/weather/danger-rules.ts` (new)

**Intent**: Keep every hard-exclusion limit in one reviewable place, independent of user criteria.

**Contract**: Exports `DANGER_GUST_KMH = 60`, `DANGER_HEAT_C = 35`, the thunderstorm and freezing-precipitation weather-code sets, and a function returning the list of hazards present for a slot given its start and end samples, evaluated per "Slot evaluation and gust timing". Comparisons for gust and heat are inclusive (60 and 35 are dangerous).

#### 4. Window matcher

**File**: `src/lib/weather/match-windows.ts` (new)

**Intent**: Turn consecutive hourly samples, the user's criteria and an injected "now" into windows or structured no-match reasons, so the boundary cases (16:30 on the chosen weekday, missing samples) are testable without a clock or network.

**Contract**:

```ts
findRideWindows(input: {
  samples: readonly HourlySample[];
  criteria: RideCriteria;
  now: LocalNow;
}): WindowSearchResult
```

Resolves `targetDate` per the weekday rule, keeps only slots whose end is after `now` when the target is today, evaluates each slot, and returns maximal runs of passing slots (minimum one) in chronological order. Every failing slot contributes to the reason counts for each cause that applies (a slot can count under both "danger" and "wind"). A slot that fails danger is never part of a window even when it passes the user's limits.

#### 5. No-match message

**File**: `src/lib/weather/describe-no-match.ts` (new)

**Intent**: Produce the human sentence the PRD asks for (for example "wind exceeds 25 km/h in all slots on Thursday") from the structured reasons, so the matcher stays free of copy.

**Contract**: `describeNoMatch(reasons, criteria, targetDate): string`. Uses "all N slots" when `slotsAffected === totalSlots` and "N of M slots" otherwise; names the weekday; mentions hazards by plain name; handles the forecast-gap cause.

#### 6. Check script, npm script and CI

**File**: `scripts/check-window-matching.ts` (new), `package.json`, `.github/workflows/ci.yml`

**Intent**: A named-case fixture script is the verification for the safety rules because a test runner is parked in the roadmap.

**Contract**: `package.json` gains `"check:windows": "node --experimental-strip-types scripts/check-window-matching.ts"`. CI gains a `npm run check:windows` step after lint and before build. The script runs the cases listed under Testing Strategy, fails with a non-zero exit code on the first failed assertion, and prints the number of cases passed.

### Success Criteria:

#### Automated Verification:

- `npm run check:windows` passes with every agreed-rule case
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- The case names printed by the check script cover every agreed rule (window runs, wind basis, danger limits, ordering, weekday and now, no-match reasons)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Weather service

### Overview

Add `zod`, the Open-Meteo adapter (place lookup and hourly forecast, normalised to local-time samples) and a search service that resolves the location, fetches the forecast, guards freshness and calls the matcher. No route or UI yet.

### Changes Required:

#### 1. Dependency

**File**: `package.json`, `package-lock.json`

**Intent**: Install `zod` for request and provider-response validation (AGENTS.md requires zod at API boundaries).

**Contract**: `npm install zod`; no other dependencies.

#### 2. Request schema

**File**: `src/lib/schemas/ride-search-request.ts` (new)

**Intent**: Validate the search request once for the API route and type it for the service.

**Contract**: Zod object with `isoWeekday` 1–7, `startHour` 0–23, `endHour` 1–24 with `endHour > startHour` (refinement), `maxWindKmh` and `minTempC` restricted to the presets in `src/lib/ride-criteria.ts`, and `location` as a discriminated union: `{ kind: "place", query }` (trimmed, 1–100 characters) or `{ kind: "coords", latitude, longitude }` (valid ranges). Exports the schema and the inferred request type.

#### 3. Open-Meteo adapter

**File**: `src/lib/weather/open-meteo.ts` (new)

**Intent**: The only module that talks to the provider; turns provider JSON into `HourlySample[]` in the searched location's local time, or a typed failure.

**Contract**: Exports `geocodePlace(query, signal)` (`geocoding-api.open-meteo.com/v1/search`, `count=1`; returns latitude, longitude, label built from name, region and country, and timezone, or `null` for no result) and `fetchHourlySamples(latitude, longitude, signal)` (`api.open-meteo.com/v1/forecast` with `hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,weather_code,precipitation_probability`, `wind_speed_unit=kmh`, `timezone=auto`, `timeformat=unixtime`, `forecast_days=8`). Provider responses are validated with zod. Samples with a null in any of temperature, wind, gust or weather code are dropped; `precipProbability` may be null. Coordinates are rounded to two decimals before they are placed in the request. Any non-2xx, timeout, network error or schema failure becomes a `WEATHER_UNAVAILABLE` error. Uses relative imports only.

#### 4. Search service

**File**: `src/lib/services/ride-window-search.ts` (new)

**Intent**: Orchestrate one search: resolve location, fetch, guard freshness, derive local "now", call `findRideWindows`, and build the response payload with the no-match message.

**Contract**: `searchRideWindows(request): Promise<RideWindowSearchResponse>` and a `WeatherServiceError` with `code` of `PLACE_NOT_FOUND` or `WEATHER_UNAVAILABLE`. One `AbortSignal.timeout(8000)` is shared by the geocode and forecast calls to respect the 10 s requirement. The response carries `location` (`label` and `timezone`; the label is "Your current location" for device coordinates and never includes coordinates), `fetchedAt` (ISO time of the fetch), `targetDate`, `windows`, and `noMatchMessage` (`null` when windows exist). A missing current-hour sample raises `WEATHER_UNAVAILABLE`.

### Success Criteria:

#### Automated Verification:

- `npm run check:windows` still passes
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- A one-off Node call to `geocodePlace("Krakow")` returns Polish coordinates with timezone Europe/Warsaw
- A one-off Node call to `fetchHourlySamples` for that place returns consecutive local-hour samples from today through today + 7 with no nulls in the required fields
- Pointing the adapter at an unreachable host yields a `WEATHER_UNAVAILABLE` error within 8 seconds

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: API route and search UI

### Overview

Expose the service through an authenticated, validated API route and build the mobile-first search form and results on `/dashboard`.

### Changes Required:

#### 1. Search API route

**File**: `src/pages/api/ride-windows/search.ts` (new)

**Intent**: Authenticated JSON endpoint that validates the body and returns the service result or a typed error.

**Contract**: Exports `const prerender = false` and `POST`. Returns 401 `UNAUTHENTICATED` when `context.locals.user` is null, 400 `INVALID_REQUEST` on a zod failure, 404 `PLACE_NOT_FOUND`, 502 `WEATHER_UNAVAILABLE`, and 200 with the `RideWindowSearchResponse` otherwise. Error bodies are `{ error: { code, message } }`. The request body is never logged and `locals.user` is the only auth check (no middleware change).

#### 2. Search state hook

**File**: `src/components/hooks/useRideWindowSearch.ts` (new)

**Intent**: Own the client flow: request device location when no place is typed, post the request, and expose a simple state machine to the UI.

**Contract**: States `idle`, `locating`, `loading`, `success` (with the response) and `error` (with code and message). When the place field is empty it calls `navigator.geolocation.getCurrentPosition` at submit time; on denial, timeout or no support it moves to an error asking the user to type a place and sends no request. Coordinates are held only in memory for the request and never written to storage.

#### 3. Search form and results

**File**: `src/components/ride-search/RideSearch.tsx`, `src/components/ride-search/RideSearchForm.tsx`, `src/components/ride-search/RideSearchResults.tsx` (new)

**Intent**: A single-column, touch-friendly form and result cards that make the matching rules visible.

**Contract**: The form has weekday, start-hour and end-hour selects, wind and min-temperature selects populated from the presets, and an optional place input; native `select` elements are used for phone-friendly pickers and styling goes through `cn()`. Labels state that times are local to the searched place. Results show the resolved place name, the "forecast fetched at" time (in the searched place's timezone), then either window cards listed in order (each with its hours, temperature, wind, gust and precipitation probability) or the no-match message. Error states have distinct, plain copy for place not found, weather unavailable, and location denied. The root component is hydrated with `client:load`.

#### 4. Dashboard page

**File**: `src/pages/dashboard.astro` (modify)

**Intent**: Replace the placeholder card with the ride planner while keeping the page protected and the sign-out control.

**Contract**: Renders `Topbar` and the `RideSearch` island inside the existing `Layout`; `/dashboard` stays in `PROTECTED_ROUTES`.

### Success Criteria:

#### Automated Verification:

- `npm run check:windows` still passes
- `npm run lint` passes
- `npm run build` passes
- An unauthenticated `POST /api/ride-windows/search` returns 401 against `npm run dev`

#### Manual Verification:

- A typed-place search ("Krakow") shows windows or a no-match reason, the resolved place name and a forecast-fetched time
- An empty-place search asks for device location and shows results labelled "Your current location" when allowed
- Denying location permission shows a prompt to type a place and sends no search request
- A shown window's temperature and wind match the same hours on open-meteo.com for that place
- Strict limits (wind 10, min temperature 20 in a cool week) show a no-match message with counts, for example "Wind exceeds 10 km/h in all N slots on Thursday"
- An unknown place ("zzzzqqq") shows a clear place-not-found message
- With the provider base URL temporarily broken, the UI shows a weather-unavailable error and no windows (revert afterwards)
- The page is usable at 375 px width with no horizontal scroll, and results appear within 10 seconds
- Visiting `/dashboard` signed out redirects to the sign-in page
- No coordinates or place names appear in browser storage after a search

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

No test framework (parked in the roadmap). `scripts/check-window-matching.ts` is the unit-level check, one named case per rule:

- **Run split**: hour 15 passes and hour 16 fails the wind limit within a 15–17 range gives one window covering 15:00–16:00.
- **Inclusive limits**: wind exactly at the max and temperature exactly at the min both pass; one step beyond fails.
- **Wind basis**: sustained 20 with gust 45 and max 25 passes; the same slot with gust 60 is excluded as danger; gust 59.9 passes.
- **Heat**: 35 °C is dangerous, 34.9 °C is not.
- **Weather codes**: 95, 96, 99, 56, 57, 66, 67 are dangerous; heavy rain (65) is not.
- **End sample danger**: a dangerous code at T+1 excludes the slot starting at T.
- **Safety invariant**: across a grid of gust, temperature and weather-code combinations, no returned window contains a slot with a danger hazard.
- **Missing next sample**: a slot without a T+1 sample is excluded; if nothing is evaluable the reason is a forecast gap.
- **Weekday, today**: Thursday 16:30 with range 15–17 searches only the 16:00 slot today; Thursday 16:59 still searches today; Thursday 17:00 with range 15–17 moves to next Thursday.
- **Weekday, other day**: a different weekday resolves to the next date within seven days.
- **Ordering**: two windows (08–10 and 14–16) are returned earliest first.
- **No-match reasons**: all slots too windy produce a wind reason with "all N slots" and the PRD-style sentence; a mix produces "N of M slots"; a danger-only failure names the hazard.

### Integration Tests:

None automated. The provider adapter is exercised manually against the live API in Phase 2 and end to end in Phase 3.

### Manual Testing Steps:

1. Sign in and open `/dashboard`; search with a typed place and compare one window to open-meteo.com.
2. Search with the place empty; allow, then repeat and deny device location.
3. Set strict limits and confirm the no-match sentence; try an unknown place.
4. Break the provider base URL temporarily and confirm the error state, then revert.
5. Check a 375 px viewport and the time to results.

## Performance Considerations

Three subrequests per search (Supabase `getUser`, geocode only when a place is typed, forecast), well under the Workers cap. One forecast call returns about 192 hourly rows for five variables. A shared 8 s abort deadline across the two provider calls keeps the total inside the 10 s requirement. Forecasts are fetched live per search and not cached, which also satisfies the 3-hour freshness requirement.

## Migration Notes

None. No database tables, no migrations, no new secrets (Open-Meteo is keyless). The only repository-level changes are the `zod` dependency, one npm script and one CI step.

## References

- Roadmap item S-01: `context/foundation/roadmap.md` (section "S-01: Ride window search")
- PRD: `context/foundation/prd.md` (US-01, FR-001, FR-002, NFRs, Guardrails)
- Auth and middleware pattern: `src/middleware.ts:4-23`, `src/pages/api/auth/signin.ts:1-20`
- Form pattern: `src/components/auth/SignInForm.tsx:13-86`
- Open-Meteo forecast API: https://open-meteo.com/en/docs
- Open-Meteo geocoding API: https://open-meteo.com/en/docs/geocoding-api

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Matching core and check script

#### Automated

- [x] 1.1 `npm run check:windows` passes with every agreed-rule case
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm run build` passes

#### Manual

- [x] 1.4 The case names printed by the check script cover every agreed rule (window runs, wind basis, danger limits, ordering, weekday and now, no-match reasons)

### Phase 2: Weather service

#### Automated

- [ ] 2.1 `npm run check:windows` still passes
- [ ] 2.2 `npm run lint` passes
- [ ] 2.3 `npm run build` passes

#### Manual

- [ ] 2.4 A one-off Node call to `geocodePlace("Krakow")` returns Polish coordinates with timezone Europe/Warsaw
- [ ] 2.5 A one-off Node call to `fetchHourlySamples` for that place returns consecutive local-hour samples from today through today + 7 with no nulls in the required fields
- [ ] 2.6 Pointing the adapter at an unreachable host yields a `WEATHER_UNAVAILABLE` error within 8 seconds

### Phase 3: API route and search UI

#### Automated

- [ ] 3.1 `npm run check:windows` still passes
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 `npm run build` passes
- [ ] 3.4 An unauthenticated `POST /api/ride-windows/search` returns 401 against `npm run dev`

#### Manual

- [ ] 3.5 A typed-place search ("Krakow") shows windows or a no-match reason, the resolved place name and a forecast-fetched time
- [ ] 3.6 An empty-place search asks for device location and shows results labelled "Your current location" when allowed
- [ ] 3.7 Denying location permission shows a prompt to type a place and sends no search request
- [ ] 3.8 A shown window's temperature and wind match the same hours on open-meteo.com for that place
- [ ] 3.9 Strict limits (wind 10, min temperature 20 in a cool week) show a no-match message with counts, for example "Wind exceeds 10 km/h in all N slots on Thursday"
- [ ] 3.10 An unknown place ("zzzzqqq") shows a clear place-not-found message
- [ ] 3.11 With the provider base URL temporarily broken, the UI shows a weather-unavailable error and no windows (revert afterwards)
- [ ] 3.12 The page is usable at 375 px width with no horizontal scroll, and results appear within 10 seconds
- [ ] 3.13 Visiting `/dashboard` signed out redirects to the sign-in page
- [ ] 3.14 No coordinates or place names appear in browser storage after a search
