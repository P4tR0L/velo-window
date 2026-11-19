# AI Ride Recommendation Implementation Plan

## Overview

Roadmap slice S-02. Every matched ride window gets an AI recommendation: a short summary, route-style advice (what kind of ride, which way to face the wind, pacing) and riding-style tips grounded in that window's own forecast. The existing search endpoint makes one batched OpenRouter call after matching, with its own deadline so search plus recommendation stays inside the 10 s requirement. The AI receives weather only — no place name and no coordinates — and answers in a strict, length-bounded JSON shape. If the AI is slow, unavailable or returns unusable output, the matched windows still show, each with a plain "recommendation unavailable" note, and the response carries a typed status instead of any server logging.

## Current State Analysis

- S-01 is archived and shipped. `searchRideWindows` (`src/lib/services/ride-window-search.ts`) resolves the place, fetches the Open-Meteo forecast, matches windows and returns `RideWindowSearchResponse` (`src/types.ts`). `POST /api/ride-windows/search` (`src/pages/api/ride-windows/search.ts`) authenticates with `locals.user`, validates with zod and maps `WeatherServiceError` to typed errors.
- No LLM code and no OpenRouter secret exist. `astro.config.mjs` `env.schema` declares only `SUPABASE_URL` and `SUPABASE_KEY` (optional secrets). `infrastructure.md` already names OpenRouter as the LLM and the key as a Worker secret read through `astro:env/server`.
- `HourlySample` and `WindowSlot` carry temperature, sustained wind, gust and precipitation probability, but no wind direction. The Open-Meteo adapter (`src/lib/weather/open-meteo.ts`) does not request `wind_direction_10m`.
- The UI is `RideSearch.tsx` (busy label), `RideSearchResults.tsx` (`WindowCard` with an hourly table) and `useRideWindowSearch.ts` (`isSearchResponse` only checks `location` and a `windows` array, so it accepts richer windows unchanged).
- No app logger exists, and AGENTS.md forbids suppressing `no-console`. No test runner (parked in the roadmap); `scripts/check-window-matching.ts` (`npm run check:windows`) is the pattern for named-case checks and runs in CI (`.github/workflows/ci.yml`).
- Cloudflare Workers with `nodejs_compat` (`wrangler.jsonc`). The request already uses three subrequests (Supabase `getUser`, geocode, forecast); the AI adds one, still well under the cap. `infrastructure.md` warns that large JSON parsing counts as CPU time, so the AI response is bounded with `max_tokens`.

## Desired End State

A signed-in user runs the existing search on `/dashboard`. For each matched window the card shows, below the hourly table, a recommendation block: a summary line, route advice and two to four riding-style tips that refer to that window's conditions (temperature, wind and wind direction, gusts, rain probability). When the AI cannot answer, the same cards show the weather with a short "Recommendation unavailable" note. When no window matches, no AI call is made and S-01's no-match message is unchanged. The AI never sees the place name, coordinates or any user-typed text, and dangerous hours never reach it because only server-matched windows are sent.

Verification: `npm run check:windows`, `npm run check:recommendations`, `npm run lint`, `npm run build`, plus the manual checks in each phase.

### Key Discoveries:

- `src/lib/services/ride-window-search.ts:14-66` — the single place that orchestrates a search; the recommendation call slots in after `findRideWindows` and before the response is built.
- `src/pages/api/ride-windows/search.ts:20-52` — API route shape and typed error mapping; secrets can be read here through `astro:env/server` and passed down, which keeps the service importable without Astro virtual modules.
- `src/lib/weather/match-windows.ts:122-137` — `WindowSlot` is built from the start sample (and `gustKmh` from the end sample); wind direction follows the start sample like the other instantaneous values.
- `src/lib/weather/open-meteo.ts:7,157-185` — `HOURLY_VARIABLES` and the zod response schema are the only places to add a forecast variable; samples with a null in required fields are dropped, optional ones stay null.
- `src/components/hooks/useRideWindowSearch.ts:49-54` — the client response guard only checks `location` and `windows`, so the extended response needs no hook change.
- `scripts/check-window-matching.ts` — named-case checks with `node:assert`, run through `node --experimental-strip-types`; pure modules use relative `.ts` imports and `import type`.
- OpenRouter chat completions accept `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`; `provider.require_parameters: true` stops routing to providers that would drop it, but strictness is not guaranteed, so the parsed object must still be validated with zod (docs: https://openrouter.ai/docs/guides/features/structured-outputs).

## What We're NOT Doing

- Route paths, named roads, maps or any use of the user's location by the AI (S-03). The place label and coordinates are never sent to OpenRouter.
- Saving, browsing or editing recommendations (S-04, S-05). Nothing is persisted.
- A server-side logger, error tracking or any `console` use. Failures surface as a typed recommendation status in the response; nothing is recorded server-side.
- A per-window retry button, a second endpoint, or progressive rendering. Windows appear when the single request finishes.
- Re-ranking windows. Windows stay chronological as S-01 defined; the AI does not reorder or filter them.
- Streaming responses, caching recommendations, rate limiting or per-user cost limits. The call is bounded by `max_tokens`, the window count and a deadline only; an authenticated user can still trigger one paid call per search.
- Letting users choose the model, tone or advice style in the UI.
- Free-text user input in the prompt. The prompt is built only from server-matched numbers and fixed text.
- A test framework. Verification extends the named-case script pattern.

## Implementation Approach

Build the pure parts first (data, prompt, output contract) and prove them with a fixture script, then add the OpenRouter I/O and service wiring, then the UI. Decisions made during planning:

- **One batched call.** After matching, one OpenRouter request carries all matched windows (an index per window) and returns one recommendation per window. It is made only when at least one window exists.
- **All-or-nothing output.** The model must return exactly one entry per window index, each passing the schema. Any parse, schema, count or index failure discards the whole answer, and every window gets `recommendation: null` with status `invalid-output`.
- **Weather only, no location.** The prompt contains the weekday, each window's hours, the per-hour temperature, sustained wind, gust, wind direction (as a compass point the wind comes from) and rain probability, and the user's own wind and temperature limits. It contains no place name, coordinates, user id or user-typed text.
- **Typed status, no logging.** `recommendationStatus` is `null` (no windows, no call), `"ok"`, `"unavailable"` (key missing, network error, timeout, non-2xx, provider error) or `"invalid-output"`.
- **Graceful degradation.** Failure never affects the matched windows or the no-match message.
- **Model is configurable.** Optional `OPENROUTER_MODEL` secret; otherwise a code constant. `OPENROUTER_API_KEY` is an optional secret; when missing the status is `"unavailable"` and no request is made.
- **Deadline.** The recommendation step has a total budget of 9 s counted from the start of the search. It receives the time that is left; if less than 2 s remain it is skipped as `"unavailable"`.

## Critical Implementation Details

- **Safety bounds the AI, not the other way round.** Only windows returned by `findRideWindows` are put in the prompt, so excluded hours (danger, wind, temperature) never reach the model. The system prompt must tell the model to advise only for the supplied windows and hours, never to suggest riding outside them or in conditions beyond the supplied numbers, never to name places, roads or routes it cannot know, and never to mention the user's location. The output schema has no hour or place fields, so the model cannot add windows or move them.
- **Wind direction convention.** Open-Meteo `wind_direction_10m` is meteorological: the bearing the wind comes from, in degrees. The prompt labels it "wind from <compass>" (for example `NW`), so the advice about headwind and tailwind is not inverted. Direction may be null; the prompt then says "direction unknown".
- **Strict schema, validated twice.** Send the JSON schema to OpenRouter with `strict: true` and `provider.require_parameters: true`, but always re-validate the parsed content with zod: a provider may not enforce it. Text fields have maximum lengths enforced by the zod schema and are rendered as plain text by React (no markdown or HTML).
- **Secrets never reach messages.** Error messages and responses must not contain the API key, the prompt or the model output; typed codes only.
- **Module constraints for the check script.** `src/lib/recommendation/compass.ts`, `prompt.ts` and `output-schema.ts` use relative `.ts` imports and `import type` and must not import `@/` aliases or `astro:*`, so Node can run them. `output-schema.ts` may import the `zod` package like the existing adapter. The OpenRouter client and the service are not imported by the check script.

## Phase 1: Recommendation core and checks

### Overview

Wind direction flows through the forecast and matcher, the shared types carry the recommendation shapes, and the prompt builder and output parser exist as pure, tested code. No network, no UI.

### Changes Required:

#### 1. Shared types

**File**: `src/types.ts` (modify)

**Intent**: Add the recommendation vocabulary and the wind direction field so all phases share one set of types, and extend the search response without breaking S-01 consumers.

**Contract**: `HourlySample` and `WindowSlot` gain `windDirectionDeg: number | null` (0–360, the direction the wind comes from). New exports: `WindowRecommendation` (`summary`, `routeAdvice`, `styleTips: string[]`), `RecommendedWindow` (`RideWindow` plus `recommendation: WindowRecommendation | null`) and `RecommendationStatus = "ok" | "unavailable" | "invalid-output"`. `RideWindowSearchResponse.windows` becomes `RecommendedWindow[]` and the response gains `recommendationStatus: RecommendationStatus | null` (`null` when there are no windows). `WindowSearchResult.windows` stays `RideWindow[]`.

#### 2. Forecast adapter

**File**: `src/lib/weather/open-meteo.ts` (modify)

**Intent**: Request wind direction so recommendations can reason about headwind and tailwind.

**Contract**: Add `wind_direction_10m` to `HOURLY_VARIABLES`, to the zod hourly schema (nullable numbers, included in the equal-length refinement) and to the produced samples as `windDirectionDeg` (`null` when the provider gives null; the sample is not dropped for a missing direction).

#### 3. Matcher

**File**: `src/lib/weather/match-windows.ts` (modify)

**Intent**: Carry wind direction from the start sample into each passing slot, like temperature and sustained wind.

**Contract**: `WindowSlot.windDirectionDeg` is copied from the slot's start sample. Matching, hazard and no-match behaviour are unchanged.

#### 4. Compass labels

**File**: `src/lib/recommendation/compass.ts` (new)

**Intent**: One pure place that turns a bearing into a readable "wind from" point, shared by the prompt and any future UI.

**Contract**: `compassPoint(degrees: number | null): string` returns one of the 16 points (`N`, `NNE` … `NNW`) for a bearing normalised to 0–360, and `"unknown"` for `null`. 348.75 up to but excluding 11.25 is `N`; each point covers 22.5°.

#### 5. Prompt builder

**File**: `src/lib/recommendation/prompt.ts` (new)

**Intent**: Build the system and user messages from matched windows and the user's limits, in one reviewable place that enforces "weather only, no location".

**Contract**: `buildRecommendationPrompt(input: { windows: readonly RideWindow[]; criteria: RideCriteria }): { system: string; user: string }`. The `system` text states the guardrails from "Critical Implementation Details" in plain language. The `user` text lists the weekday name, the user's max wind and min temperature, and each window by zero-based index with its hours and per-hour temperature (°C), sustained wind (km/h), gust (km/h), "wind from" compass point and rain probability (or "n/a"). The input type has no field for location, so none can be added by accident. The builder accepts any number of windows.

#### 6. Output contract and parser

**File**: `src/lib/recommendation/output-schema.ts` (new)

**Intent**: Define what a valid model answer looks like, as both the JSON schema sent to OpenRouter and the zod schema used to validate it, and reject anything else.

**Contract**: Exports `RECOMMENDATION_JSON_SCHEMA` (strict, `additionalProperties: false`) and `parseRecommendations(content: string, windowCount: number): WindowRecommendation[] | null`. The answer shape is `{ recommendations: [{ windowIndex, summary, routeAdvice, styleTips }] }`. Limits: `summary` 1–200 characters, `routeAdvice` 1–400, `styleTips` 2–4 items of 1–160 characters each, all trimmed. The parser returns the recommendations ordered by window index, or `null` for invalid JSON, schema failure, a count different from `windowCount`, a duplicate or out-of-range index. All-or-nothing: no partial result.

#### 7. Check script, npm script and CI

**File**: `scripts/check-recommendations.ts` (new), `scripts/check-window-matching.ts` (modify), `package.json`, `.github/workflows/ci.yml`

**Intent**: A named-case script is the verification for the prompt and output rules, and the existing fixtures keep compiling after `windDirectionDeg` is added.

**Contract**: `package.json` gains `"check:recommendations": "node --experimental-strip-types scripts/check-recommendations.ts"`; CI runs it after `check:windows` and before build. `scripts/check-window-matching.ts`'s `sample()` helper defaults `windDirectionDeg` and one case asserts it is copied into slots. The new script runs the cases under Testing Strategy, exits non-zero on the first failed assertion, prints a pass count with `process.stdout.write` (not `console`).

### Success Criteria:

#### Automated Verification:

- `npm run check:windows` passes (including the wind-direction slot case)
- `npm run check:recommendations` passes with every agreed case
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- The case names printed by `check:recommendations` cover compass points, no-location prompt, matched-windows-only prompt and every output rejection rule
- The system prompt text reads as the guardrails in "Critical Implementation Details" (weather-bounded, no invented roads or places, no excluded hours)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: OpenRouter adapter and service wiring

### Overview

Declare the secrets, add the OpenRouter client, and extend the search service and route so every response carries a recommendation per window plus a typed status, degrading to windows-only on any AI failure.

### Changes Required:

#### 1. Secrets

**File**: `astro.config.mjs`, `.env.example` (modify)

**Intent**: Declare the two new server secrets so they are read through `astro:env/server` like the Supabase ones.

**Contract**: `env.schema` gains `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`, both `envField.string({ context: "server", access: "secret", optional: true })`. `.env.example` gains matching placeholder lines. CI needs no new secret (both optional; the build does not call the service).

#### 2. OpenRouter client

**File**: `src/lib/recommendation/openrouter.ts` (new)

**Intent**: The only module that talks to OpenRouter; turns a prompt into validated recommendations or a typed failure.

**Contract**: Exports `DEFAULT_RECOMMENDATION_MODEL` (a fast, low-cost instruction model whose OpenRouter listing supports `json_schema` structured outputs — confirm against the current OpenRouter model catalogue while implementing), a `RecommendationError` with `code: "unavailable" | "invalid-output"`, and `requestRecommendations(input: { apiKey; model; prompt; windowCount; signal }): Promise<WindowRecommendation[]>`. It POSTs to `https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer <key>`, the system and user messages, a low temperature, `max_tokens` bounded by the window count (about 300 per window, capped), `response_format` set to the strict JSON schema and `provider: { require_parameters: true }`. Network error, abort, non-2xx, a top-level or `choices[0].error` provider error, or missing content throws `unavailable`. Present but unusable content (non-JSON, schema, count or index failure through `parseRecommendations`) throws `invalid-output`. Messages never contain the key, prompt or model output.

#### 3. Search service

**File**: `src/lib/services/ride-window-search.ts` (modify)

**Intent**: Run the recommendation step after matching without ever affecting the windows or the no-match message.

**Contract**: `searchRideWindows(request, options?: { recommendation?: { apiKey?: string; model?: string } })`. Capture the start time at the top. When `windows.length > 0`: if no API key, or fewer than 2 s remain of a 9 s total budget, status is `"unavailable"`; otherwise call `requestRecommendations` with `AbortSignal.timeout(remaining)` and the built prompt. On success each window gets its recommendation and status is `"ok"`; on `RecommendationError` (or any unexpected error) every window gets `recommendation: null` with the error's status (unexpected errors map to `"unavailable"`). With no windows, `recommendationStatus` is `null` and no request is made. Existing `WeatherServiceError` handling and the S-01 fields are unchanged.

#### 4. API route

**File**: `src/pages/api/ride-windows/search.ts` (modify)

**Intent**: Pass the secrets from `astro:env/server` into the service; no other behaviour change.

**Contract**: Imports `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` from `astro:env/server` and passes them as `options.recommendation`. Status codes and error bodies are unchanged: an AI failure is still a 200 with `recommendationStatus` set. The request body and AI content are never logged.

### Success Criteria:

#### Automated Verification:

- `npm run check:windows` still passes
- `npm run check:recommendations` still passes
- `npm run lint` passes
- `npm run build` passes
- An unauthenticated `POST /api/ride-windows/search` still returns 401 against `npm run dev`

#### Manual Verification:

- With a valid `OPENROUTER_API_KEY` in `.dev.vars`, a typed-place search that has windows returns one recommendation per window and `recommendationStatus: "ok"` in the network response
- A search with no matching windows (strict limits) makes no OpenRouter request and returns `recommendationStatus: null` with the no-match message unchanged
- With the key removed, the same search returns the windows with `recommendation: null` and `recommendationStatus: "unavailable"`
- With `OPENROUTER_MODEL` set to a nonexistent slug, the response is `"unavailable"` with windows intact
- Search plus recommendation completes within 10 seconds across at least five consecutive searches
- The response and dev-server output contain no API key, prompt text or coordinates

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Recommendation UI

### Overview

Show the recommendation on each window card, a clear note when it is unavailable, and confirm the full flow on a phone-sized screen.

### Changes Required:

#### 1. Window card

**File**: `src/components/ride-search/RideSearchResults.tsx` (modify)

**Intent**: Present the recommendation next to the hourly data it is based on, and make a missing recommendation visible without hiding the weather.

**Contract**: `WindowCard` takes a `RecommendedWindow` and the response's `recommendationStatus`. When `recommendation` is present it renders below the table: the summary, a "Route" paragraph with `routeAdvice`, and a list of `styleTips` as plain text. When it is null and the status is `"unavailable"` or `"invalid-output"` it renders one short note ("Recommendation unavailable right now. The weather above is still current.", with a distinct line for invalid output such as "We couldn't use the AI answer for this window.") styled like the existing card text. Classes go through `cn()`; layout stays single-column and wraps long text (`break-words`) for 375 px.

#### 2. Busy label

**File**: `src/components/ride-search/RideSearch.tsx` (modify)

**Intent**: The request now includes the AI step, so the loading label must not look frozen.

**Contract**: The `loading` label becomes "Finding windows and recommendations…" (the `locating` label is unchanged).

### Success Criteria:

#### Automated Verification:

- `npm run check:windows` still passes
- `npm run check:recommendations` still passes
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- A typed-place search with windows shows a summary, route advice and 2–4 tips on every card, and the text refers to that window's conditions (wind from the stated direction, temperature, rain chance)
- The advice never names a place, road or route and never suggests riding at hours outside the card's window
- With the API key removed, each card shows the weather plus the unavailable note and no error banner
- A no-match search shows only S-01's no-match message
- The page is usable at 375 px width with no horizontal scroll, and results appear within 10 seconds
- No coordinates, place names or recommendation text appear in browser storage after a search

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

No test framework (parked in the roadmap). `scripts/check-recommendations.ts` is the unit-level check, one named case per rule:

- **Compass points**: 0 → `N`, 45 → `NE`, 90 → `E`, 225 → `SW`, 348.75 → `N`, 11.24 → `N`, 11.25 → `NNE`, 360 → `N`; `null` → `unknown`.
- **Slot direction**: matched windows carry `windDirectionDeg` from the start sample (added to `check-window-matching.ts`).
- **Prompt, weather only**: the prompt text for a window contains temperature, sustained wind, gust, "wind from" compass point and rain probability, and the user's limits; a `null` direction produces "unknown" and `null` rain probability produces "n/a".
- **Prompt, no location**: the builder takes only windows and criteria (no location field); the prompt text for a fixture contains none of the place names or coordinate patterns used in the test's search request fixture, and has no latitude/longitude wording.
- **Prompt, matched windows only**: two windows produce indices 0 and 1 and list only their hours; hours outside them never appear.
- **System guardrails**: the system text contains the guardrail statements (advise only for supplied windows, no invented roads or places, no location mention).
- **Output, valid**: a well-formed answer for two windows parses into two recommendations ordered by index.
- **Output, rejections**: invalid JSON, missing field, extra field, empty text, `summary` over 200 characters, `routeAdvice` over 400, fewer than 2 or more than 4 tips, a tip over 160 characters, wrong count, duplicate index and out-of-range index each return `null` (all-or-nothing).
- **Output, JSON schema**: `RECOMMENDATION_JSON_SCHEMA` is strict (`additionalProperties: false` at every object level) and its limits match the zod schema.

### Integration Tests:

None automated. The OpenRouter client and service are exercised manually against the live API in Phase 2 and end to end in Phase 3.

### Manual Testing Steps:

1. Put `OPENROUTER_API_KEY` in `.dev.vars`; sign in, search a typed place that has windows and read the recommendation on each card.
2. Compare a card's advice with its table: wind direction, temperature and rain chance should agree.
3. Run strict limits to confirm no AI request and S-01's no-match message.
4. Remove the key, then set a bad `OPENROUTER_MODEL`, and confirm the unavailable note with the weather intact.
5. Time five consecutive searches and check a 375 px viewport.

## Performance Considerations

One additional subrequest per search that has windows (Supabase, geocode, forecast, OpenRouter: four, well under the Workers cap). A single batched call avoids per-window round trips. The recommendation step runs after matching and uses a shared 9 s budget from the start of the search, so the 10 s requirement holds even when the forecast was slow; the AI is skipped when less than 2 s remain. `max_tokens` is bounded by window count to limit latency, cost and the CPU spent parsing JSON. Windows on a single day are few (at most one per two slots in the 1–24 hour range), so the prompt stays small.

## Migration Notes

None for the database: no tables, no migrations. New configuration: `OPENROUTER_API_KEY` (required for recommendations) and optional `OPENROUTER_MODEL`, in `.dev.vars` for local dev and `npx wrangler secret put OPENROUTER_API_KEY` for production; without the key the app keeps working and shows the unavailable note. Repository changes: two optional env fields, one npm script and one CI step.

## References

- Roadmap item S-02: `context/foundation/roadmap.md` (section "S-02: AI ride recommendation")
- PRD: `context/foundation/prd.md` (US-01, FR-003, NFR response time, Guardrails)
- Infrastructure notes (OpenRouter, secrets, subrequests, CPU): `context/foundation/infrastructure.md`
- Prior slice plan: `context/archive/2026-11-17-ride-window-search/plan.md`
- Search service and route: `src/lib/services/ride-window-search.ts:14-66`, `src/pages/api/ride-windows/search.ts:20-52`
- Matcher slot construction: `src/lib/weather/match-windows.ts:122-137`
- Forecast adapter variables and schema: `src/lib/weather/open-meteo.ts:7,157-185`
- Window card: `src/components/ride-search/RideSearchResults.tsx:6-47`
- OpenRouter structured outputs: https://openrouter.ai/docs/guides/features/structured-outputs

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Recommendation core and checks

#### Automated

- [x] 1.1 `npm run check:windows` passes (including the wind-direction slot case) — 49486ed
- [x] 1.2 `npm run check:recommendations` passes with every agreed case — 49486ed
- [x] 1.3 `npm run lint` passes — 49486ed
- [x] 1.4 `npm run build` passes — 49486ed

#### Manual

- [x] 1.5 The case names printed by `check:recommendations` cover compass points, no-location prompt, matched-windows-only prompt and every output rejection rule — 49486ed
- [x] 1.6 The system prompt text reads as the guardrails in "Critical Implementation Details" (weather-bounded, no invented roads or places, no excluded hours) — 49486ed

### Phase 2: OpenRouter adapter and service wiring

#### Automated

- [x] 2.1 `npm run check:windows` still passes — eff23a0
- [x] 2.2 `npm run check:recommendations` still passes — eff23a0
- [x] 2.3 `npm run lint` passes — eff23a0
- [x] 2.4 `npm run build` passes — eff23a0
- [x] 2.5 An unauthenticated `POST /api/ride-windows/search` still returns 401 against `npm run dev` — eff23a0

#### Manual

- [x] 2.6 With a valid `OPENROUTER_API_KEY` in `.dev.vars`, a typed-place search that has windows returns one recommendation per window and `recommendationStatus: "ok"` in the network response — eff23a0
- [x] 2.7 A search with no matching windows (strict limits) makes no OpenRouter request and returns `recommendationStatus: null` with the no-match message unchanged — eff23a0
- [x] 2.8 With the key removed, the same search returns the windows with `recommendation: null` and `recommendationStatus: "unavailable"` — eff23a0
- [x] 2.9 With `OPENROUTER_MODEL` set to a nonexistent slug, the response is `"unavailable"` with windows intact — eff23a0
- [x] 2.10 Search plus recommendation completes within 10 seconds across at least five consecutive searches — eff23a0
- [x] 2.11 The response and dev-server output contain no API key, prompt text or coordinates — eff23a0

### Phase 3: Recommendation UI

#### Automated

- [x] 3.1 `npm run check:windows` still passes
- [x] 3.2 `npm run check:recommendations` still passes
- [x] 3.3 `npm run lint` passes
- [x] 3.4 `npm run build` passes

#### Manual

- [x] 3.5 A typed-place search with windows shows a summary, route advice and 2–4 tips on every card, and the text refers to that window's conditions (wind from the stated direction, temperature, rain chance)
- [x] 3.6 The advice never names a place, road or route and never suggests riding at hours outside the card's window
- [x] 3.7 With the API key removed, each card shows the weather plus the unavailable note and no error banner
- [x] 3.8 A no-match search shows only S-01's no-match message
- [x] 3.9 The page is usable at 375 px width with no horizontal scroll, and results appear within 10 seconds
- [x] 3.10 No coordinates, place names or recommendation text appear in browser storage after a search
