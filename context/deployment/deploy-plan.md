# Cloudflare Deployment Plan — manual + push-to-main (no GitHub Actions)

Set up two deployment paths for velo-window on Cloudflare Workers (Workers + Static Assets), both without GitHub Actions — a manual `wrangler deploy`, and auto-deploy on push to `main` via Cloudflare's native Workers Builds Git integration — and wire the existing Supabase credentials so auth works in dev and production. GitHub Actions is explicitly deferred to later.

Target the Workers + Static Assets path recommended in [context/foundation/infrastructure.md](../foundation/infrastructure.md), not the legacy Pages path. The stack is already correctly configured — no code or config changes are needed.

- **Part A — Manual:** `wrangler deploy` from the CLI (also creates the Worker + `workers.dev` subdomain on first run).
- **Part B — Auto on push to `main`:** Cloudflare's native Workers Builds Git integration (dashboard-configured), which builds and deploys on every push.

## Checklist

- [ ] Create local `.dev.vars` with `SUPABASE_URL` and `SUPABASE_KEY` (gitignored)
- [ ] Run `npm run build` to verify the production Worker bundle builds cleanly
- [ ] Human step: `npx wrangler login` (interactive browser auth)
- [ ] Set runtime Worker secrets via `npx wrangler secret put SUPABASE_URL` and `SUPABASE_KEY`
- [ ] Run `npx wrangler deploy` to create and deploy the velo-window Worker
- [ ] Verify with `wrangler deployments list`, open the `workers.dev` URL, and test signin/signup
- [ ] Human step: connect the Worker to the GitHub repo via Cloudflare Workers Builds (branch `main`, build `npm run build`, deploy `npx wrangler deploy`) and add `SUPABASE_*` build variables
- [ ] Push a commit to `main` and confirm Workers Builds auto-builds and promotes a new Active Deployment

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

- [astro.config.mjs](../../astro.config.mjs): `output: "server"` + `adapter: cloudflare()`, `SUPABASE_*` declared `optional`.
- [wrangler.jsonc](../../wrangler.jsonc): `compatibility_flags: ["nodejs_compat"]`, `compatibility_date: "2026-05-08"`, `ASSETS` binding -> `./dist`, observability enabled.
- Wrangler `4.98.0` installed but **not authenticated** (`wrangler whoami` -> not logged in).
- Supabase credentials available. Auth is null-guarded in [src/lib/supabase.ts](../../src/lib/supabase.ts), so it works once `SUPABASE_URL`/`SUPABASE_KEY` are set and degrades gracefully if they ever go missing.
- No `supabase/migrations/` — nothing to migrate; Supabase Auth is built-in.

## Part A — Manual deploy

1. **Verify the production build locally** (catches `workerd`/bundle issues before hitting Cloudflare):

```bash
npm run build
```

2. **Authenticate Wrangler — human/interactive step** (opens a browser):

```bash
npx wrangler login
```

3. **Set runtime Worker secrets** (each command prompts for the value — paste it; the value is not stored in shell history):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
```

4. **Deploy to production.** First deploy creates the `velo-window` Worker and (if not already done) prompts to register a free `*.workers.dev` subdomain:

```bash
npx wrangler deploy
```

5. **Verify it's live:**

```bash
npx wrangler deployments list
```

Then open the printed `https://velo-window.<subdomain>.workers.dev` URL. Expect: homepage renders; `/dashboard` redirects to `/auth/signin`; signup/signin now work against Supabase. (After signup, confirm the email per Supabase's flow / `/auth/confirm-email`.)

6. **Optional smoke-tail** to watch live runtime logs while clicking through:

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
