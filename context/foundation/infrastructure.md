---
project: velo-window
researched_at: 2026-06-10
recommended_platform: Cloudflare (Workers + Static Assets)
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR)
  runtime: Cloudflare workerd (@astrojs/cloudflare)
---

## Recommendation

**Deploy on Cloudflare (Workers + Static Assets) via `wrangler deploy`.**

It is the only candidate to pass all five agent-friendly criteria, the free tier comfortably covers a low-QPS MVP, and it is already the stack's configured adapter (`@astrojs/cloudflare`) — so there is zero migration cost. Critically for this product, Cloudflare excludes I/O-wait from its CPU-time limit, so long OpenRouter LLM round-trips do not count against the budget — sidestepping the hard 10s free-tier function timeout that makes the runner-up (Netlify) risky for the AI recommendation path. The developer is also already familiar with Cloudflare (interview Q3), which breaks the tie at the top.

## Platform Comparison

Hard filters applied first: the app is stateless (no WebSockets / no background workers — interview Q1 + PRD `has_realtime: false`, `has_background_jobs: false`), so no platform is dropped for lacking persistent processes; and every candidate supports Astro 6 SSR (TypeScript) through an official adapter, so none is dropped on runtime grounds. The decision therefore rests on scoring + constraints.

| Platform | CLI-first | Managed/Serverless | Agent docs | Stable deploy API | MCP / Integration | Verdict |
|---|---|---|---|---|---|---|
| **Cloudflare** (Workers + Static Assets) | Pass | Pass | Pass (`llms.txt`) | Pass (`wrangler deploy`/`rollback`) | Pass (official MCPs + `wrangler-action@v3`) | **5/5** |
| **Netlify** | Partial (no rollback CLI) | Pass | Pass (`llms.txt`) | Pass (`netlify deploy --prod`) | Pass (`@netlify/mcp`, GA) | 4.5/5 |
| **Vercel** | Pass | Pass | Pass (MDX/GitHub) | Pass (`vercel --prod`) | Partial (MCP read-only, public beta) | 4.5/5 |
| **Railway** | Pass | Pass | Partial | Pass | Pass (official MCP) | 4/5 |
| **Render** | Partial (deploy hooks + CLI) | Pass | Pass (`llms.txt` + MCP) | Pass | Pass (official MCP) | 4/5 |
| **Fly.io** | Pass (`flyctl`) | Partial (Docker/VM surface) | Pass (MDX/GitHub) | Pass (`fly deploy`) | Partial (experimental MCP) | 3.5/5 |

**Per-platform notes**

- **Cloudflare** — Current path (verified 2026-06-10) is Workers + Static Assets via `wrangler deploy`; `@astrojs/cloudflare` v13+ dropped Pages support and Pages is in maintenance mode (not killed). Wrangler 4 is current. Astro 6's dev server runs real `workerd`, retiring `platformProxy` / `wrangler pages dev`. Free tier (100k req/day, 10ms CPU, I/O-wait excluded) easily covers the MVP. Ships `llms.txt`, official MCP servers, and `wrangler-action@v3` for CI. Gotchas: `nodejs_compat` flag, `imageService: 'passthrough'`, secrets via `.dev.vars` / `wrangler secret put` + `astro:env/server`. Astro 6 + Dynamic Workers are beta; the rest GA.
- **Netlify** — `@astrojs/netlify` v7 (GA) on Astro 6 Adapter API; SSR via Netlify Functions. Official `@netlify/mcp` and GA `netlify logs` CLI. Credit-based free tier (300 credits/mo) is comfortable at this scale. Two real frictions: **sync function timeout is 10s on free** (26s only on Pro via support ticket) — dangerous for OpenRouter calls — and **rollback is UI-only** (no CLI command), which dents the CLI-first score.
- **Vercel** — `@astrojs/vercel` v10 (GA); serverless functions with Fluid compute (300s default timeout — generous for LLM calls). Full `vercel` CLI incl. `rollback`/`logs`/`inspect`. Two drawbacks: **Hobby tier bans commercial use**, forcing ~$20/mo Pro, and the **Vercel MCP is read-only public beta** (since 2025-08-04). Single-region (`iad1`) by default, which is fine here.
- **Railway** — Strong container PaaS DX with official local+remote MCP and per-second billing; always-on Node means **no cold starts**. But **no permanent free tier** (one-time $5 trial → Hobby $5/mo), and its co-located-database advantage is moot because Q5 locked in external Supabase.
- **Render** — Best agent ops of the container trio (official MCP + agent skills + `llms.txt`); Starter ($7/mo) has no cold starts. Free web services **spin down after 15 min idle** (30–60s cold start), which conflicts with the "available during ride-planning hours" NFR unless paid.
- **Fly.io** — `flyctl` is excellent and docs are agent-readable, but it is Docker/VM-centric (more operational surface), has **no free tier** (~$2–5/mo), scale-to-zero reintroduces cold starts, and its MCP is still experimental — overkill for a stateless low-QPS MVP.

### Shortlisted Platforms

#### 1. Cloudflare (Recommended)

Passes all five criteria, free at this scale, already wired into the stack, familiar to the developer, and — uniquely among the serverless three — its CPU-time model means slow LLM responses don't trip a wall-clock timeout. The container trio (Railway/Render/Fly) were ruled out of the shortlist because they add always-on billing and Node-server/Docker management for no benefit on a stateless app whose data layer (Supabase) and AI (OpenRouter) are both external.

#### 2. Netlify

The closest alternative and already familiar to the developer, with first-class agent tooling (official MCP + structured `netlify logs`). It loses the top spot on two concrete points: the **10s free-tier function timeout** is a live hazard for OpenRouter latency against a 10s product NFR, and **rollback requires the dashboard** (no CLI), weakening unattended agent ops.

#### 3. Vercel

Best-in-class serverless DX and a 300s Fluid-compute timeout that would actually be the safest for long LLM calls. It drops to third because the **Hobby commercial-use ban** pushes any monetized MVP to ~$20/mo (the worst cost of the serverless three under a cost≈DX preference), the developer has no stated Vercel familiarity, and its **MCP is read-only beta**.

## Anti-Bias Cross-Check: Cloudflare

### Devil's Advocate — Weaknesses

1. **Adapter churn under a tight deadline.** `@astrojs/cloudflare` v13+ dropped Pages support and Astro 6 is itself beta; a solo dev with ~3 after-hours weeks can hit adapter edge cases, and most existing tutorials/Stack Overflow answers still describe the obsolete Pages path, actively misleading both developer and agent.
2. **`workerd` is not Node.** The Supabase SSR client or any transitively Node-API-dependent dependency can fail at runtime unless `nodejs_compat` is configured correctly — classic "works in dev, breaks deployed" loops.
3. **Subrequest limits.** Workers cap subrequests per request; the route-recommendation flow fans out to a weather API + OpenRouter + Supabase in a single request and can brush that ceiling, with non-obvious failure modes.
4. **Thin free-tier observability.** `wrangler tail` is ephemeral; durable post-mortem of a bad AI recommendation needs Workers Logs / Logpush, which add configuration (and cost beyond free retention).
5. **Edge ↔ single-region-DB latency.** Globally distributed Workers hitting one Supabase region add round-trip chattiness; the 10s NFR can erode for distant users without Smart Placement (or Hyperdrive), which is extra setup.

### Pre-Mortem — How This Could Fail

The team shipped Velo Window on Cloudflare Workers in week 3. Early on they followed an older Pages-based tutorial, lost two evenings reconciling it with the v13 adapter, and pinned versions only after a mysterious build break. The Supabase SSR client threw at runtime until `nodejs_compat` was added — invisible in local dev. Then the route-recommendation endpoint began intermittently failing under load: chained weather + OpenRouter + Supabase calls brushed the subrequest ceiling, and because free-tier logs were ephemeral, they couldn't reproduce it. Worse, every DB query crossed from a random edge POP to a single Supabase region, pushing the cold path past the 10s NFR for users far from that region. Lacking time to configure Smart Placement/Hyperdrive, they shipped with a flaky AI path. The root cause wasn't Cloudflare's quality — it was assuming "edge serverless" behaves like a regional Node box, and underestimating runtime-fidelity and data-locality gaps on a tight solo timeline.

### Unknown Unknowns

- **CPU-time vs wall-time:** the 10ms (free) / 30s (paid) limit is CPU time, not wall-clock — but parsing large LLM/JSON payloads *is* CPU and can trip it even though the LLM wait itself is free.
- **Subrequest caps** (simultaneous + total per request) are easy to miss until a fan-out route hits them.
- **Astro 6 + `@astrojs/cloudflare` are both recent** — undocumented combinations exist; version pinning is mandatory, not optional.
- **Secrets model differs from the old Pages flow:** `.dev.vars` / `wrangler secret put` + `astro:env/server` `getSecret()` — not the Pages dashboard bindings many guides still assume.
- **DB latency may force Hyperdrive or Smart Placement**, each with its own config (and Hyperdrive its own pricing) that isn't visible on the marketing page.

## Operational Story

- **Preview deploys**: `wrangler versions upload` publishes a preview Version with a unique `*.workers.dev` preview URL without shifting production traffic; promote with `wrangler versions deploy`. In CI, `cloudflare/wrangler-action@v3` runs the upload on PR branches. Preview URLs are public by default — gate sensitive previews behind Cloudflare Access if needed.
- **Secrets**: `SUPABASE_URL`, `SUPABASE_KEY`, and the OpenRouter API key live as Worker secrets (`wrangler secret put <NAME>`), read at runtime via `astro:env/server` `getSecret()`. Local dev uses `.dev.vars` (gitignored). CI uses GitHub Actions repository secrets passed to `wrangler-action`. Rotate by re-running `wrangler secret put` and redeploying.
- **Rollback**: `wrangler rollback [<version-id>]` instantly reverts the Worker to a prior uploaded Version (list with `wrangler deployments list`). Time-to-revert is seconds. Caveat: rollback reverts code only — Supabase schema migrations are external and do **not** roll back automatically.
- **Approval**: an agent may upload preview Versions, tail logs, and run `wrangler deployments list` unattended. A human should approve promoting a Version to production (`wrangler versions deploy` / merge to `master`), rotating the primary Supabase/OpenRouter secret, and any destructive Supabase migration.
- **Logs**: `wrangler tail` streams live runtime logs read-only; `wrangler deployments list` shows deploy history. For durable history, enable Workers Logs / Logpush. The Cloudflare MCP server also exposes observability tools for structured agent access.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Following obsolete Pages-based tutorials wastes deadline time | Devil's advocate / Pre-mortem | M | M | Pin `astro@6` + `@astrojs/cloudflare@13+`; follow only current Workers + Static Assets docs; ignore `wrangler pages` guidance |
| Supabase SSR / Node-dependent libs fail on `workerd` | Devil's advocate / Unknown unknowns | M | H | Set `nodejs_compat` in `wrangler.toml`; test the deployed Worker (not just dev) early; prefer Web-standard `fetch` for OpenRouter |
| Subrequest limit hit by weather + OpenRouter + Supabase fan-out | Devil's advocate / Unknown unknowns | L | M | Keep per-request subrequests minimal; sequence/batch calls; monitor via `wrangler tail`; upgrade to paid if needed |
| Edge ↔ single-region Supabase latency breaks 10s NFR | Pre-mortem | M | M | Enable Smart Placement; consider Hyperdrive for Postgres pooling/caching; keep Supabase region close to primary user base |
| Ephemeral free-tier logs hinder debugging AI failures | Devil's advocate | M | M | Enable Workers Logs / Logpush before launch; add structured app-level logging on the recommendation path |
| CPU-time limit tripped by large LLM/JSON payload parsing | Unknown unknowns | L | M | Bound OpenRouter `max_tokens`; avoid heavy synchronous parsing; upgrade to paid (30s CPU) if observed |
| Astro 6 beta status introduces undocumented bugs | Research finding | M | M | Pin exact versions; keep a lockfile; watch the `@astrojs/cloudflare` changelog; budget buffer time in week 3 |

## Getting Started

Validated against the project's pinned stack (Astro 6 + `@astrojs/cloudflare` adapter, Wrangler 4, Node 22) as of 2026-06-10 — the Workers + Static Assets path, not the legacy Pages path.

1. **Confirm the adapter & runtime config.** Ensure `astro.config.mjs` uses `output: 'server'` with `adapter: cloudflare(...)`, and `wrangler.toml` sets `compatibility_flags = ["nodejs_compat"]` plus a recent `compatibility_date`. (Already scaffolded by the 10x Astro starter — verify, don't re-add.)
2. **Run local dev with real runtime fidelity:** `npm run dev` — Astro 6's dev server runs `workerd` directly, so there's no separate `wrangler pages dev` step. Put local secrets in `.dev.vars`.
3. **Authenticate Wrangler:** `npx wrangler login` (one-time, interactive — a human step).
4. **Set production secrets:** `npx wrangler secret put SUPABASE_URL`, `... SUPABASE_KEY`, and your OpenRouter key.
5. **Deploy:** `npx wrangler deploy` (or merge to `master` to trigger auto-deploy via `cloudflare/wrangler-action@v3` per the GitHub Actions flow). Verify with `npx wrangler deployments list` and tail with `npx wrangler tail`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (beyond noting the existing GitHub Actions auto-deploy flow)
- Production-scale architecture (multi-region, HA, DR)
