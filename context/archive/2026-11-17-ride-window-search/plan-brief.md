# Ride Window Search — Plan Brief

> Full plan: `context/changes/ride-window-search/plan.md`

## What & Why

Roadmap slice S-01: a signed-in cyclist enters weekday, time range, minimum temperature, maximum wind and an optional starting place, and sees the matching hourly weather windows or a clear reason none match. It is the first slice because every later slice (AI recommendation, ride log) consumes its windows, and it holds the safety rule that dangerous hours are never offered.

## Starting Point

The app is the Astro starter with Supabase email/password auth and a placeholder `/dashboard`. There is no weather, matching, API-validation, logging or test code, and no weather provider or secret.

## Desired End State

On `/dashboard` the user submits criteria and gets windows listed earliest first (hours with temperature, wind, gust, precipitation probability, place name, fetch time), a quantified no-match sentence such as "Wind exceeds 25 km/h in all 2 slots on Thursday", or a plain error. Thunderstorm, gusts ≥ 60 km/h, ≥ 35 °C and freezing rain are never inside a window. Nothing about the user's location is stored or logged.

## Key Decisions Made

| Decision                | Choice                                                                                     | Why (1 sentence)                                                          | Source  |
| ----------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------- |
| What a window is        | Unbroken run of passing hours inside the range, minimum 1 hour                             | Surfaces every usable gap instead of hiding it behind one bad hour.       | Plan    |
| Wind basis              | User max applies to sustained wind; gusts only checked against the danger cap              | Matches how riders read "wind speed" without hiding most windy-but-fine days. | Plan |
| Danger defaults         | Thunderstorm, gusts ≥ 60 km/h, ≥ 35 °C, freezing drizzle/rain                              | Covers the PRD storm/wind/heat guardrail plus ice; rain stays the user's call. | Plan |
| Window ordering         | Chronological, earliest first                                                              | Predictable, fits "go now", no scoring formula to define.                 | Plan    |
| Which "Thursday"        | Today's remaining hours if any are ahead, else the next Thursday                           | Supports "go now" without showing hours already past.                     | Plan    |
| Weather provider        | Open-Meteo (forecast and geocoding)                                                        | Keyless, one provider for both lookups, fits the Workers subrequest budget. | Plan  |
| Rule verification       | Dependency-free `npm run check:windows` fixture script, also run in CI                     | Proves safety rules without reversing the parked test-runner decision.    | Plan    |
| Logging                 | None in S-01; failures are typed errors shown in the UI                                    | `no-console` may not be suppressed and no logger exists.                  | Plan    |
| Location handling       | Typed place, else device location at search time, never stored; denied means type a place  | Already decided in the roadmap.                                           | Roadmap |
| Limits and presets      | Inclusive limits; wind 10–35 km/h, min temp 0–20 °C in fixed steps; end hour exclusive     | Follows the PRD's "predefined ranges" and "exceeds" wording.              | Plan    |
| Times and privacy       | Hours in the searched place's local time; coordinates rounded to 2 decimals for the provider | Avoids timezone confusion and limits what the provider receives.        | Plan    |

## Scope

**In scope:** pure matcher and danger rules, Open-Meteo adapter, search service, authenticated validated API route, search form and results on `/dashboard`, check script and CI step.

**Out of scope:** AI recommendations and route paths, saving or browsing rides, multiple weekdays, overnight ranges, next-week fallback after remaining hours fail, geocode match picker, rain as a criterion, logging, a test framework, caching, third-party sign-in.

## Architecture / Approach

A pure `findRideWindows` module takes hourly samples, criteria and an injected "now" and returns windows or structured no-match reasons. A small Open-Meteo adapter converts unix timestamps to the place's local hours and drops incomplete samples. A service resolves the place, fetches, rejects forecasts missing the current hour and calls the matcher. `POST /api/ride-windows/search` checks auth and validates with zod, and a React island on `/dashboard` handles geolocation and rendering. Gusts are matched to the right hour because the provider reports them as a preceding-hour maximum.

## Phases at a Glance

| Phase                          | What it delivers                                                        | Key risk                                                            |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. Matching core and check script | Pure matcher, danger rules, no-match message, `check:windows` + CI step | Off-by-one in slot and gust timing or weekday boundaries            |
| 2. Weather service             | `zod`, Open-Meteo adapter, request schema, search service               | DST and timezone conversion, provider failures, stale forecasts     |
| 3. API route and search UI     | Authenticated endpoint, mobile-first form and results on `/dashboard`   | Geolocation denial flow and mobile layout                           |

**Prerequisites:** Supabase configured locally to sign in; network access to Open-Meteo; Node 22 for the check script.
**Estimated effort:** about 3 sessions, one per phase.

## Open Risks & Assumptions

- Open-Meteo's free tier is non-commercial with no SLA; heavy traffic would need a paid plan (fine for an MVP).
- The provider gives no model-run timestamp, so freshness rests on a live fetch plus the current-hour sample check.
- The danger limits (60 km/h gusts, 35 °C) are proposed defaults you confirmed; they live in one file for easy tuning.
- Wrong top geocoding match is possible; the resolved name is shown so it is visible.

## Success Criteria (Summary)

- A signed-in user gets matching windows or a clear quantified reason from their own limits, in under 10 seconds on a phone.
- No window ever contains a dangerous hour, proven by the check script and enforced in CI.
- Provider outages, unknown places and denied location produce clear states, and no location data is stored.
