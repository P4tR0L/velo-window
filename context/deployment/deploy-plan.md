# Cloudflare Deployment Plan — manual + push-to-main (no GitHub Actions)

Set up two deployment paths for velo-window on Cloudflare Workers (Workers + Static Assets), both without GitHub Actions — a manual `wrangler deploy`, and auto-deploy on push to `main` via Cloudflare's native Workers Builds Git integration — and wire the existing Supabase credentials so auth works in dev and production. GitHub Actions is explicitly deferred to later.

Target the Workers + Static Assets path recommended in [context/foundation/infrastructure.md](../foundation/infrastructure.md), not the legacy Pages path. The stack is already correctly configured — no code or config changes are needed.

- **Part A — Manual:** `wrangler deploy` from the CLI (also creates the Worker + `workers.dev` subdomain on first run).
- **Part B — Auto on push to `main`:** Cloudflare's native Workers Builds Git integration (dashboard-configured), which builds and deploys on every push.

## Checklist

- [x] Create local `.dev.vars` with `SUPABASE_URL` and `SUPABASE_KEY` (gitignored)
- [x] Run `npm run build` to verify the production Worker bundle builds cleanly
- [x] Human step: `npx wrangler login` (interactive browser auth)
- [x] Set runtime Worker secrets via `npx wrangler secret put SUPABASE_URL` and `SUPABASE_KEY`
- [x] Run `npx wrangler deploy` to create and deploy the velo-window Worker
- [x] Verify with `wrangler deployments list`, open the `workers.dev` URL, and test signin/signup
- [x] Human step: connect the Worker to the GitHub repo via Cloudflare Workers Builds (branch `main`, build `npm run build`, deploy `npx wrangler deploy`) and add `SUPABASE_`* build variables
- [x] Push a commit to `main` and confirm Workers Builds auto-builds and promotes a new Active Deployment

## Supabase wiring (three places)

`SUPABASE_URL` = your project URL (e.g. `https://<ref>.supabase.co`); `SUPABASE_KEY` = the anon/public key. No DB migrations exist in `supabase/` (only `config.toml`), so there is nothing to migrate — Supabase Auth is built-in, and these two values are all that auth needs.

- **Local dev** → create `.dev.vars` (gitignored) at repo root:

```
SUPABASE_URL=https://<your-ref>.supabase.co
SUPABASE_KEY=<your-anon-key>
```

- **Runtime (production Worker)** → set as Worker secrets in Part A.
- **Auto-deploy builds** → set as build variables in Part B.

(The anon key is safe to expose client-side by design, but treating it as a secret here keeps it out of git and the build logs.)

## Preconditions (already verified)

- [astro.config.mjs](../../astro.config.mjs): `output: "server"` + `adapter: cloudflare()`, `SUPABASE_`* declared `optional`.
- [wrangler.jsonc](../../wrangler.jsonc): `compatibility_flags: ["nodejs_compat"]`, `compatibility_date: "2026-05-08"`, `ASSETS` binding -> `./dist`, observability enabled.
- Wrangler `4.98.0` installed but **not authenticated** (`wrangler whoami` -> not logged in).
- Supabase credentials available. Auth is null-guarded in [src/lib/supabase.ts](../../src/lib/supabase.ts), so it works once `SUPABASE_URL`/`SUPABASE_KEY` are set and degrades gracefully if they ever go missing.
- No `supabase/migrations/` — nothing to migrate; Supabase Auth is built-in.

## Prerequisites — configure the CLI and Supabase

Do these once before Part A. They cover (1) the Wrangler/Cloudflare CLI and (2) the Supabase project + credentials. None of these touch repo code — they configure your local machine and external accounts.

### 1. Toolchain

- **Node.js v22.14.0** (matches `.nvmrc`). With nvm: `nvm install` then `nvm use` from the repo root. Verify: `node -v`.
- **Install dependencies:** `npm ci` (clean, lockfile-exact) at the repo root. This also provides Wrangler — it's a dev dependency, so use it via `npx wrangler …` rather than a global install (keeps the version pinned by `package.json`). Verify: `npx wrangler --version` (expect `4.x`).

### 2. Cloudflare CLI (Wrangler)

1. **Have a Cloudflare account** (free tier is sufficient — see [infrastructure.md](../foundation/infrastructure.md)). Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) if needed.
2. **Authenticate — human/interactive step** (opens a browser to grant Wrangler access to your account):

```bash
npx wrangler login
```

3. **Confirm you're logged in** and on the right account:

```bash
npx wrangler whoami
```

Expect your email and account name/ID. If you belong to multiple accounts, set `CLOUDFLARE_ACCOUNT_ID` in your shell (or `wrangler.jsonc`) so deploys target the intended one.

(CI/headless alternative — **not** needed for this manual flow: create an "Edit Cloudflare Workers" API token and export `CLOUDFLARE_API_TOKEN` instead of `wrangler login`. This is the path the deferred GitHub Actions deploy will use.)

### 3. Supabase

No DB migrations exist (`supabase/` has only `config.toml`), so there is **nothing to migrate** — Supabase Auth is built-in and only the project URL + anon key are required.

1. **Create / open a Supabase project** at [supabase.com/dashboard](https://supabase.com/dashboard) (free tier is fine).
2. **Grab the two credentials** from the dashboard → Project Settings → **API**:
  - `SUPABASE_URL` = Project URL, e.g. `https://<your-ref>.supabase.co`
  - `SUPABASE_KEY` = the **anon / public** key (not the `service_role` key — never ship that to the client/Worker).
3. **Configure local dev** — copy the example file and fill in the two values:

```bash
cp .env.example .dev.vars
```

Then edit `.dev.vars` (gitignored) to:

```
SUPABASE_URL=https://<your-ref>.supabase.co
SUPABASE_KEY=<your-anon-key>
```

  `.dev.vars` is what the Cloudflare `workerd` dev runtime reads (`npm run dev`); `.env` is the Node equivalent if you ever run outside `workerd`. Both are gitignored.
4. **Auth redirect URLs** — in the Supabase dashboard → Authentication → URL Configuration, add your local origin (`http://localhost:4321`) and, after Part A, your `https://velo-window.<subdomain>.workers.dev` origin so email-confirmation links resolve correctly.
5. **Smoke-test locally** before deploying: `npm run dev`, then exercise `/auth/signup` and `/auth/signin`. The client is null-guarded in [src/lib/supabase.ts](../../src/lib/supabase.ts), so wrong/missing values disable auth gracefully rather than crashing — if signin silently does nothing, re-check `.dev.vars`.

The runtime Worker and auto-deploy builds get these same two values set as secrets/build variables in Parts A and B below.

#### Local Supabase via Docker (optional — not required for deployment)

**Not needed for this deploy plan.** The flow above uses a hosted Supabase project, and `supabase/` currently has only `config.toml` (no `migrations/`), so there is nothing to run or migrate locally. `npm run dev` already hits the hosted project with full `workerd` runtime fidelity.

This becomes useful **later, when implementing business logic** — once you start writing real schema, RLS policies (a repo hard rule), or want to iterate offline without touching the shared project or burning free-tier quota. At that point:

1. **Install Docker Desktop** and start it (the local Supabase stack runs as containers: Postgres + Auth + Studio + others).
2. **Start the local stack** from the repo root:

```bash
npx supabase start
```

  First run pulls images (slow); afterwards it prints a local **API URL** (`http://127.0.0.1:54321`), an **anon key**, a **service_role key**, and a **Studio URL** (`http://127.0.0.1:54323`).
3. **Point local dev at the local stack** — swap `.dev.vars` to the printed values (keep the hosted values somewhere handy so you can switch back):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<local-anon-key-from-supabase-start>
```

4. **Develop schema with migrations** (this is what creates the `supabase/migrations/` directory the deploy plan currently notes as empty):

```bash
npx supabase migration new <short_description>   # YYYYMMDDHHmmss_<desc>.sql per repo convention
npx supabase db reset                            # re-apply all migrations + seed to the local DB
```

5. **Promote to the hosted project** when ready: `npx supabase link --project-ref <your-ref>` then `npx supabase db push` to apply local migrations to the hosted database. (Schema changes are external state — they do **not** roll back with `wrangler rollback`; see Notes.)
6. **Stop the stack** when done: `npx supabase stop`.

Deployment itself is unaffected by any of this — the Worker always talks to the **hosted** Supabase via the secrets set in Part A, never to a local container.

## Part A — Manual deploy

1. **Verify the production build locally** (catches `workerd`/bundle issues before hitting Cloudflare):

```bash
npm run build
```

1. **Authenticate Wrangler — human/interactive step** (opens a browser):

```bash
npx wrangler login
```

1. **Set runtime Worker secrets** (each command prompts for the value — paste it; the value is not stored in shell history):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

1. **Deploy to production.** First deploy creates the `velo-window` Worker and (if not already done) prompts to register a free `*.workers.dev` subdomain:

```bash
npx wrangler deploy
```

1. **Verify it's live:**

```bash
npx wrangler deployments list
```

Then open the printed `https://velo-window.<subdomain>.workers.dev` URL. Expect: homepage renders; `/dashboard` redirects to `/auth/signin`; signup/signin now work against Supabase. (After signup, confirm the email per Supabase's flow / `/auth/confirm-email`.)

1. **Optional smoke-tail** to watch live runtime logs while clicking through:

```bash
npx wrangler tail
```

## Part B — Auto-deploy on push to main (Cloudflare Workers Builds)

Cloudflare's native Git integration ("Workers Builds") deploys on every push without any GitHub Actions workflow. Verified current 2026-06-10 (Cloudflare Workers docs -> CI/CD -> Builds). All dashboard-driven — no repo file changes required. **Do Part A first** so the `velo-window` Worker exists, then connect it.

1. **Human step (dashboard):** Workers & Pages -> select the `velo-window` Worker -> Settings -> Builds -> Connect.
2. Authorize the Cloudflare GitHub app for `P4tR0L/velo-window`, choose the repo, and set the production branch to `main`.
3. Build settings:
  - Build command: `npm run build`
  - Deploy command: `npx wrangler deploy` (default; uses the `wrangler` version pinned in `package.json`)
4. Add build-time variables in the same Builds settings: `SUPABASE_URL`, `SUPABASE_KEY` (these are consumed by `npm run build`; the runtime Worker reads the secrets set in Part A step 3, which Workers Builds preserves across deploys).
5. **Verify:** push a commit to `main` -> Cloudflare builds and promotes a new Active Deployment automatically; confirm via `npx wrangler deployments list` / the `workers.dev` URL. Non-`main` branches get preview versions (`wrangler versions upload`) without touching production.

## Deferred (later / not in this deployment)

- **GitHub Actions deploy** — planned for later. When adding it: create a Cloudflare API token ("Edit Cloudflare Workers"), add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` repo secrets, and add a `deploy` job using `cloudflare/wrangler-action@v3` (`command: deploy`). Note: running both Workers Builds and an Actions deploy on the same branch would double-deploy, so pick one as the source of truth at that point. Separately, the existing [.github/workflows/ci.yml](../../.github/workflows/ci.yml) lint+build still triggers on `master` and should be corrected to `main`.

## Notes

- Secrets are null-guarded, so a missing value degrades gracefully (auth off) rather than crashing the app.
- `.dev.vars` and `dist/` are already gitignored — credentials won't be committed.
- Rollback if needed: `npx wrangler rollback` (reverts code only, not Supabase).

