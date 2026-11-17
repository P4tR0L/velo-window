---
project: Velo Window
version: 1
status: draft
created: 2026-11-17
updated: 2026-11-17
prd_version: 1
main_goal: speed
top_blocker: decisions
milestone_id: first-usable-ride-planner
milestone_seq: 1
milestone_status: open
---

# Roadmap: Velo Window

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; the next milestone continues this file. Archive only when an independent roadmap replaces it.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-01: First usable ride planner** — Status: open

- **Intent:** A signed-in cyclist can turn their personal limits into safe, matching ride windows, get an AI route recommendation for each, and keep a log of the rides they chose — the full scope of PRD v1.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every S-NN below is `done`.
- **Scope anchors:** FR-001 – FR-008, US-01.

## Vision recap

Recreational cyclists lose the urge to ride while manually weighing wind, temperature and time of day across hourly forecasts, and no existing tool filters forecasts by a rider's own limits or pairs a window with route and riding-style advice. Velo Window takes the cyclist's comfort envelope — their maximum wind, minimum temperature, available time slots and optional starting location — and turns finding a rideable window into a lookup, each window paired with an AI route recommendation. The core hypothesis (the one bet that, if wrong, makes the rest of the product pointless) is that this personal envelope is the missing input: once the app has it, "go now" moments can be found for the rider instead of by them.

## North star

**S-02: User gets an AI route recommendation with riding-style tips for each matched window** — the smallest flow that meets the PRD's primary success criterion (a matching window _and_ a recommendation the user accepts); with `main_goal: speed`, it comes immediately after its only prerequisite, `S-01`.

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the core hypothesis. It is placed as early as its prerequisites allow, because everything else only matters if this works.

## At a glance

| ID   | Change ID              | Outcome (user can …)                                                                    | Prerequisites | PRD refs                                                       | Status   |
| ---- | ---------------------- | --------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------- | -------- |
| S-01 | ride-window-search     | enter ride criteria and see the matching weather windows, or a clear reason none match  | —             | US-01, FR-001, FR-002, NFR: freshness, NFR: mobile, NFR: location privacy, Guardrails | ready    |
| S-02 | ai-ride-recommendation | get an AI route recommendation with riding-style tips for each matched window           | S-01          | US-01, FR-003, NFR: response time, Guardrails                  | proposed |
| S-03 | route-path-from-start  | see a suggested route path from their starting location as part of the recommendation   | S-02          | US-01, FR-001, FR-003, NFR: location privacy                   | blocked  |
| S-04 | ride-log-save-browse   | save a chosen window with its recommendation and criteria, and browse their ride log    | S-02          | FR-004, FR-005, NFR: location privacy                          | proposed |
| S-05 | ride-log-edit-delete   | edit a saved ride's criteria or notes, and delete a saved ride                          | S-04          | FR-006, FR-007                                                 | proposed |
| S-06 | third-party-sign-in    | create an account and sign in with a third-party identity provider                      | —             | FR-008                                                         | blocked  |

The PRD's non-functional requirements are unnumbered, so they are cited by topic: `NFR: freshness` = weather data no older than 3 hours when shown; `NFR: response time` = search + recommendation within 10 seconds; `NFR: mobile` = fully usable on a phone; `NFR: location privacy` = location shared only for weather lookup and route generation, not retained unless the user saves it. `Guardrails` = PRD §Success Criteria → Guardrails (fresh data; no recommendation in dangerous conditions).

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                                  | Chain                             | Note                                                                                                                             |
| ------ | -------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A      | Find a window and get a recommendation | `S-01` → `S-02` → `S-03`          | The required chain to the north star (`S-02`); `S-03` extends it once its question is answered.                                  |
| B      | Ride log                               | `S-04` → `S-05`                   | Joins Stream A at `S-02`; can run alongside `S-03`.                                                                              |
| C      | Sign-in options                        | `S-06`                            | Standalone; can run at any point once its scope question is answered.                                                           |

## Baseline

What's already in place in the codebase as of `2026-11-17` (auto-researched + user-confirmed).
This milestone adds no foundations on top of it.

- **Frontend:** partial — Astro + React islands + Tailwind + shadcn/ui wired (`astro.config.mjs`, `components.json`); only starter pages (welcome, dashboard placeholder, auth pages). No ride or weather UI.
- **Backend / API:** partial — server-rendered Astro on Cloudflare Workers (`astro.config.mjs`); only the three auth endpoints (`src/pages/api/auth/`). No weather, AI, or window-matching logic; no input-validation library installed.
- **Data:** partial — Supabase server client wired (`src/lib/supabase.ts`); no migrations, tables, row-level security policies, generated types, or shared entity types.
- **Auth:** present — Supabase email+password sign-up / sign-in / sign-out (`src/pages/api/auth/`, `src/pages/auth/`); middleware protects `/dashboard` (`src/middleware.ts`). No third-party sign-in (only a disabled Apple stub in `supabase/config.toml`).
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`); manual deploy and auto-deploy on push to `main` verified (`context/deployment/deploy-plan.md`). CI (`.github/workflows/ci.yml`) runs lint + build on `main` (trigger corrected from a non-existent `master` branch on 2026-11-17). No secrets declared yet for a weather source or an AI service.
- **Observability:** partial — Cloudflare platform logs enabled (`wrangler.jsonc`); no app logger, no error tracking.
- **Testing:** absent — no test runner installed. CI (`.github/workflows/ci.yml`) already runs lint + build on `main`. An automated test suite is parked (see Parked); each slice is checked by those existing CI steps plus the checks written into its plan. Line endings are pinned to LF (`.gitattributes`), so local lint on Windows matches CI.

## Foundations

None in this milestone. Auth and deploy already exist (see Baseline). Everything else arrives with the first slice that needs it, so it is shaped by a working feature instead of guessed up front — the app's own layout and first product endpoint come with S-01, app logging and the weather/AI credentials with the first slice that calls those services (S-01, S-02), and the first data tables with S-04. The safety rules (dangerous windows are never offered; AI advice stays bounded by the window's forecast) are part of S-01 and S-02, checked there, not by a separate test-runner foundation.

## Slices

### S-01: Ride window search

- **Outcome:** User can enter ride criteria (day of week, time window, minimum temperature, maximum wind, optional starting location) and see the matching weather windows — or a clear reason why none match.
- **Change ID:** ride-window-search
- **PRD refs:** US-01, FR-001, FR-002, NFR: freshness, NFR: mobile, NFR: location privacy, Guardrails
- **Prerequisites:** —
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:**
  - Resolved 2026-11-17: when the user gives no starting location, the weather search uses the device's current location, requested at search time and never stored; if permission is denied, the user types a place instead. — Owner: user. Block: no.
  - What counts as dangerous weather regardless of the user's own limits — thunderstorms, heat above what temperature, gusts above what speed? Planning can propose defaults for you to confirm. — Owner: user. Block: no.
- **Risk:** First slice because every other slice consumes its windows; it holds the core matching rule and the first outside data source, so an unavailable or stale forecast must produce a clear error rather than a confident wrong answer, and windows with dangerous conditions must never be offered.
- **Status:** ready

### S-02: AI ride recommendation

- **Outcome:** User can get an AI route recommendation with riding-style tips for each matched window, grounded in that window's conditions.
- **Change ID:** ai-ride-recommendation
- **PRD refs:** US-01, FR-003, NFR: response time, Guardrails
- **Prerequisites:** S-01
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:**
  - If the AI service is slow or unavailable, should the matched windows still show (without a recommendation), or should the search report an error? — Owner: user. Block: no.
- **Risk:** Proves the core hypothesis, so it follows S-01 directly; the AI call can push search + recommendation past the response-time target, and its advice must stay bounded by the window's actual weather — never encouraging a ride the window search excluded.
- **Status:** proposed

### S-03: Route path from a starting location

- **Outcome:** User who gives a starting location can see a suggested route path from it as part of the recommendation.
- **Change ID:** route-path-from-start
- **PRD refs:** US-01, FR-001, FR-003, NFR: location privacy
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - What does a "suggested route path" look like in this milestone — a written route description from the starting point, or a road-level route on a map (which needs a map/routing data source)? — Owner: user. Block: yes.
- **Risk:** Split from S-02 so its two separate risks can't delay the north star: an AI-described path can name roads that don't exist, and this is the only step that sends the user's starting location beyond the weather lookup.
- **Status:** blocked

### S-04: Save rides and browse the ride log

- **Outcome:** User can save a chosen window with its recommendation and criteria as a ride log entry, and browse their ride log.
- **Change ID:** ride-log-save-browse
- **PRD refs:** FR-004, FR-005, NFR: location privacy
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** First slice that stores user data, so per-user storage and access rules arrive here rather than up front; a saved ride is the only place the app may keep a location (privacy NFR).
- **Status:** proposed

### S-05: Edit and delete saved rides

- **Outcome:** User can edit a saved ride's criteria or notes, and delete a saved ride.
- **Change ID:** ride-log-edit-delete
- **PRD refs:** FR-006, FR-007
- **Prerequisites:** S-04
- **Parallel with:** S-03, S-06
- **Blockers:** —
- **Unknowns:**
  - When a saved ride's criteria are edited, should the app re-check the window and recommendation, or only update the stored record (the log shows what was planned)? — Owner: user. Block: no.
- **Risk:** Lowest risk and last on the required chain because it only maintains records S-04 creates; the one trap is an edit leaving a log entry that contradicts the weather it was planned against.
- **Status:** proposed

### S-06: Third-party sign-in

- **Outcome:** User can create an account and sign in with a third-party identity provider, alongside the existing email+password sign-in.
- **Change ID:** third-party-sign-in
- **PRD refs:** FR-008
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - Is third-party sign-in needed in this milestone, or does the existing email+password sign-in already satisfy FR-008 ("email+password or third-party identity provider")? If it isn't needed, this slice moves to Parked. — Owner: user. Block: yes.
- **Risk:** Independent of the ride flow, so it can run at any point; under `main_goal: speed` it shouldn't take a slot from the required chain until you confirm it's wanted.
- **Status:** blocked

## Backlog Handoff

| Roadmap ID | Change ID              | Suggested issue title                                  | Ready for `/10x-plan` | Notes                                                                                          |
| ---------- | ---------------------- | ------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------- |
| S-01       | ride-window-search     | Search matching weather windows from ride criteria     | yes                   | Run `/10x-plan ride-window-search`; weather location decided (device location, typed fallback) |
| S-02       | ai-ride-recommendation | AI route recommendation + riding-style tips per window | no                    | North star; waits on S-01                                                                      |
| S-03       | route-path-from-start  | Suggested route path from a starting location          | no                    | Blocked: decide what a route path looks like; waits on S-02                                    |
| S-04       | ride-log-save-browse   | Save a planned ride and browse the ride log            | no                    | Waits on S-02                                                                                  |
| S-05       | ride-log-edit-delete   | Edit and delete saved rides                            | no                    | Waits on S-04                                                                                  |
| S-06       | third-party-sign-in    | Sign in with a third-party identity provider           | no                    | Blocked: confirm it's in scope (otherwise it moves to Parked)                                  |

## Open Roadmap Questions

The PRD lists no open questions; this one surfaced while sequencing.

1. **How will the success targets be measured — does saving a ride count as accepting a proposed window/route (the 75% acceptance target), and is "returns the following week" read from ride-log activity?** — Owner: user. Block: none (informs S-02, S-04).

## Parked

- **Route sharing between users** — Why parked: PRD §Non-Goals (individual planning only).
- **.gpx import** — Why parked: PRD §Non-Goals (post-MVP).
- **Sport platform integrations** — Why parked: PRD §Non-Goals.
- **Custom weather prediction model** — Why parked: PRD §Non-Goals (out of scope permanently; external weather data only).
- **Real-time ride tracking or GPS logging** — Why parked: PRD §Non-Goals (the app plans rides, it doesn't track them).
- **Offline-first guarantee** — Why parked: PRD §Non-Goals.
- **Multi-sport support** — Why parked: PRD §Non-Goals (cycling only).
- **Error tracking and alerting beyond the platform's built-in logs** — Why parked: `main_goal: speed`; platform logs plus the minimal app logging added with the first slice that calls outside services are enough to debug this milestone.
- **Automated test runner** — Why parked: CI already runs lint and build on every push to `main`. A test suite is not required to ship this milestone; it returns when the project is ready to add automated tests. The safety rules stay in S-01 and S-02.

## Milestone History

Append-only; carried forward verbatim into each successor milestone. No closed milestones yet.

## Done

Empty. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches a roadmap item is archived.
