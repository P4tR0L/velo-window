---
project: "Velo Window"
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-07-05
  after_hours_only: true
created: 2026-06-04
updated: 2026-06-04
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "decision paralysis — too many weather variables to manually weigh"
    - topic: "insight"
      decision: "personal thresholds not served by weather apps; no tool combines weather-window + AI route; motivation lost while scrolling forecasts"
    - topic: "persona scope"
      decision: "primarily yourself — single user solving own cycling problem"
    - topic: "auth strategy"
      decision: "login with email+password or OAuth; flat user model, no roles"
    - topic: "MVP timeline"
      decision: "3 weeks after-hours; 5-step flow with optional location"
    - topic: "business logic core"
      decision: "weather-window matching + AI route recommendation; matching is the domain rule, AI is secondary layer"
    - topic: "NFR targets"
      decision: "response <10s; forecast freshness <3h; privacy; mobile-friendly; high availability"
    - topic: "product type"
      decision: "web-app"
    - topic: "target scale"
      decision: "medium (dozens to a hundred); at 100x scale API rate-limiting becomes critical"
    - topic: "timeline"
      decision: "hard deadline 2026-07-05; after-hours only; 3 weeks effort"
    - topic: "non-goals"
      decision: "no sharing, no gpx import, no Strava, no own weather model, no realtime tracking, no offline, no multi-sport"
  frs_drafted: 8
  quality_check_status: accepted
---

## Vision & Problem Statement

A recreational cyclist wants to ride but faces decision paralysis: too many weather variables (wind speed, temperature, time-of-day) to manually weigh across hourly forecasts. By the time they've scrolled through weather apps and decided, the motivation is gone or the window has passed.

Existing weather apps don't filter by personal cycling thresholds (wind tolerance, minimum temperature, available time slots), and no tool combines weather-window discovery with AI-driven route and style recommendations in a single flow. The insight: the cyclist's personal comfort envelope is the missing input — once you have it, finding "go now" moments becomes a lookup, not a research project.

## User & Persona

### Primary persona

**You** — a recreational cyclist who rides regularly but is discouraged by the effort of finding rideable weather windows. You have specific comfort thresholds (max wind speed, min temperature) and limited time slots on specific days of the week. You want the app to surface "go now" moments with route and style recommendations instead of making you hunt through hourly forecasts.

## Access Control

Login with email + password or OAuth (e.g., Google). Flat user model — every authenticated user sees the same capabilities. No admin role, no role separation. Unauthenticated users cannot access the app beyond the login/sign-up screen.

## Success Criteria

### Primary

- The app finds a valid weather window matching user-defined criteria (day, time slot, min temp, max wind, optional location) AND delivers an AI route/style recommendation that the user accepts. Target: 75% acceptance rate of proposed windows/routes.

### Secondary

- User returns and uses the app again the following week (repeat engagement as a proxy for value delivered).

### Guardrails

- Weather data must be accurate and fresh — a stale forecast leading to a bad recommendation is a safety failure.
- AI must never recommend a route during dangerous conditions (storm, extreme wind beyond user threshold, extreme heat). If no safe window exists, say so explicitly rather than forcing a recommendation.

## Functional Requirements

### Ride Planning

- FR-001: User can set ride criteria (day of week, time window, min temperature, max wind speed, optional starting location). Priority: must-have
  > Socrates: No counter-argument; stands as written.
- FR-002: User can find weather windows matching their criteria via weather API lookup. Priority: must-have
  > Socrates: Counter-argument considered: "Weather API is unreliable or rate-limited — the app becomes useless when the API is down." Resolution: kept; app must show clear error states when API is unavailable. Added as guardrail concern.
- FR-003: User can receive an AI-generated route recommendation with riding style tips based on the matched weather window and conditions (and route path if location provided). Priority: must-have
  > Socrates: Counter-argument considered: "AI hallucinates routes that don't exist or gives dangerous style advice." Resolution: kept; the existing guardrail (no recommendations during dangerous conditions) covers this. AI output must be bounded by the weather data it was given.

### Route Management

- FR-004: User can save a chosen weather window + route + criteria as a ride log entry. Priority: must-have
  > Socrates: Counter-argument considered: "Saved routes become stale instantly — weather changes." Resolution: kept; reframed as ride history/log (record of what was planned/ridden), not a future plan to reuse verbatim.
- FR-005: User can browse saved rides as a compact ride log with associated criteria and AI recommendations. Priority: must-have
  > Socrates: Counter-argument considered: "A long list of past routes with expired weather data is noise." Resolution: kept; framed as compact ride log — useful to see what criteria/conditions worked in the past, not a full route browser.
- FR-006: User can edit a saved route's criteria or notes. Priority: must-have
  > Socrates: Counter-argument considered: "Edit adds UI complexity rarely used — scope creep for MVP." Resolution: kept; user wants to tweak saved criteria without deleting and recreating.
- FR-007: User can delete a saved route. Priority: must-have
  > Socrates: No counter-argument; stands as written.

### Authentication

- FR-008: User can create an account and log in via email+password or OAuth. Priority: must-have
  > Socrates: No counter-argument; stands as written.

## User Stories

### US-01: User finds a rideable weather window and gets a route recommendation

- **Given** a logged-in user with ride criteria set (day, time window, min temp, max wind, optional location)
- **When** they request a weather window search
- **Then** they see matching time slots with an AI-generated route recommendation and riding style tips for each

#### Acceptance Criteria

- At least one matching window is shown if weather data contains a slot meeting all criteria
- If no window matches, a clear message explains why (e.g., "wind exceeds 25 km/h in all slots on Thursday")
- Route recommendation includes riding style tips appropriate to the conditions
- If location is provided, recommendation includes a suggested route path

## Business Logic

The app matches a cyclist's personal comfort envelope (wind + temperature thresholds, time availability, location) against hourly weather forecasts and recommends the optimal ride window with tailored route and style guidance.

Inputs the rule consumes (user-facing):

- Max acceptable wind speed (selected from predefined ranges)
- Min acceptable temperature (selected from predefined ranges)
- Day of week and time window (e.g., Thursday 15:00–17:00)
- Optional starting location

Output: a ranked set of rideable time windows within the user's criteria, each paired with an AI-generated route recommendation and riding style tips adapted to the specific conditions of that window (wind direction, temperature, precipitation probability).

The user encounters this in the product flow as: set criteria → receive matched windows with recommendations → accept and save.

## Non-Functional Requirements

- Weather window search + AI recommendation delivered within 10 seconds of request.
- Weather data displayed to the user is no older than 3 hours at time of display.
- User location data is not shared with third parties beyond what is strictly needed for weather lookup and route generation. No location history is retained beyond active sessions unless explicitly saved by the user.
- The product is fully usable on mobile devices — the primary use case is checking before heading out on a phone.
- The app is accessible during typical ride-planning hours (mornings, evenings, weekends) with no scheduled downtime during those periods.

## Non-Goals

- **No route sharing between users** — social features are out of MVP scope; the app serves individual planning only.
- **No .gpx import** — route import from external formats is a post-MVP feature.
- **No Strava/sport platform integrations** — no sync with external fitness ecosystems for MVP.
- **No custom weather prediction model** — rely entirely on existing weather API; building proprietary forecasting is out of scope permanently.
- **No real-time ride tracking or GPS logging** — the app plans rides, it doesn't track them live.
- **No offline-first guarantee** — the app requires internet to fetch weather and generate AI recommendations.
- **No multi-sport support** — cycling only; no running, hiking, or other activities.

## Quality cross-check

All elements present. No gaps. Status: accepted.
