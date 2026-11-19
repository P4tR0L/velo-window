# AI Ride Recommendation — Plan Brief

> Full plan: `context/changes/ai-ride-recommendation/plan.md`

## What & Why

Roadmap slice S-02 and the product's north star: each matched ride window gets an AI recommendation — summary, route-style advice and riding-style tips — grounded in that window's own forecast. This is the step that proves the core hypothesis: a rider's personal limits yield not just a "go now" window but advice the rider can act on.

## Starting Point

S-01 (archived) already finds windows: `searchRideWindows` fetches the Open-Meteo forecast, matches danger-free windows and returns them through `POST /api/ride-windows/search`, shown on `/dashboard`. There is no LLM code, no OpenRouter secret, no logger and no wind direction in the forecast data.

## Desired End State

After a search, each window card shows its hourly weather plus a recommendation: a summary, route advice (ride type, which way to face the wind, pacing) and 2–4 riding-style tips that refer to that window's conditions. If the AI cannot answer, the cards still show the weather with a short "Recommendation unavailable" note. No-match searches behave exactly as in S-01 and make no AI call.

## Key Decisions Made

| Decision           | Choice                                                                 | Why (1 sentence)                                                                           | Source |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ |
| AI failure         | Show windows without a recommendation, with a note                     | The safety-critical weather result is never lost because the AI is down.                   | Plan   |
| Request shape      | Same request, one batched call after matching                          | The AI only sees server-matched, danger-free windows and no client-sent weather is trusted. | Plan   |
| AI inputs          | Weather and the user's limits only, no place or coordinates            | Keeps location out of the LLM until S-03 and stops invented roads.                         | Plan   |
| Wind direction     | Added to the forecast adapter, passed as "wind from" compass point     | The PRD says advice adapts to wind direction; headwind/tailwind advice needs it.           | Plan   |
| Output contract    | Strict JSON schema, zod re-validation, all-or-nothing, length-bounded  | A provider may not enforce the schema, and a half-valid answer is worse than none.         | Plan   |
| Observability      | No logger; typed `recommendationStatus` in the response               | Respects the no-console hard rule without new infrastructure.                              | Plan   |
| Model              | Optional `OPENROUTER_MODEL` secret, code default verified at build time | Model and cost can change without a deploy; the key is `OPENROUTER_API_KEY`.               | Plan   |
| Time budget        | 9 s total from search start; AI skipped if under 2 s remain            | Keeps search plus recommendation inside the 10 s requirement.                              | Plan   |

## Scope

**In scope:** wind direction in forecast and slots; recommendation types; weather-only prompt builder; strict output parser; OpenRouter client; service and API wiring with typed status; recommendation block on window cards; `check:recommendations` script and CI step.

**Out of scope:** route paths or any use of location by the AI (S-03); saving or editing recommendations (S-04, S-05); a logger; retry button or second endpoint; rate limiting; model or style selection UI; a test framework.

## Architecture / Approach

Pure core first: wind direction flows from Open-Meteo through the matcher into slots; a prompt builder and an output schema/parser are pure and fixture-checked. Then `openrouter.ts` posts one chat completion (strict `json_schema`, `require_parameters`, bounded `max_tokens`), the service calls it only when windows exist and within the time budget, and the route passes the two optional secrets. Any AI failure maps to a typed status and null recommendations while the windows are returned untouched. The UI renders the recommendation or a note per card.

## Phases at a Glance

| Phase                                  | What it delivers                                                                  | Key risk                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Recommendation core and checks      | Wind direction in data, types, prompt builder, output parser, `check:recommendations` | Prompt guardrails are only as good as the cases that check them       |
| 2. OpenRouter adapter and service wiring | Secrets, client with budget, response with recommendation + status per window     | Latency near the 10 s target; provider ignoring the strict schema     |
| 3. Recommendation UI                   | Recommendation on each card, unavailable note, loading label, 375 px check       | Advice quality can only be judged manually                            |

**Prerequisites:** S-01 shipped; an OpenRouter API key (`OPENROUTER_API_KEY` in `.dev.vars`; `wrangler secret put` for production).
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- The model may produce plausible but poor advice; the schema and prompt bound its form and inputs but cannot prove quality, so Phase 3 includes manual reading of real answers.
- A batched call waits for the AI before any window is shown; if latency is too high in practice, the two-step approach (rejected for now) becomes the fallback.
- Without server-side logging, a past bad AI answer cannot be investigated afterwards; revisit if that bites.
- An authenticated user can trigger one paid call per search; cost is bounded only by `max_tokens`, window count and the key's own OpenRouter limits.
- The default model slug must be checked against OpenRouter's current catalogue during Phase 2.

## Success Criteria (Summary)

- A search that has windows shows a grounded recommendation on every card within 10 seconds.
- AI failure of any kind leaves the windows and the weather data intact, with a clear note.
- The AI never receives a place name, coordinates or any hours the matcher excluded.
