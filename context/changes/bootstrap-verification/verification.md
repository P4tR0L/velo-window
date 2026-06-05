---
bootstrapped_at: 2026-06-05T13:43:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: velo-window
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: velo-window
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

Solo developer building a cycling weather-window finder MVP in 3 weeks (after-hours only) with auth and AI-driven route recommendations as must-have features. The 10x Astro Starter is the recommended default for (web-app, js) and ships Supabase auth, PostgreSQL database, and Cloudflare Pages edge deploy out of the box — exactly the batteries needed without assembling them piecemeal. All four agent-friendly criteria pass (typed, convention-based, popular in training data, well-documented), and the starter's TypeScript-first discipline with Zod schemas at boundaries keeps the AI agent effective. AI integration (weather API + LLM route recommendations) fits naturally into Astro API routes hitting external services. CI runs on GitHub Actions with auto-deploy-on-merge.

## Pre-scaffold verification

| Signal        | Value                                           | Severity      | Notes                                              |
| ------------- | ----------------------------------------------- | ------------- | -------------------------------------------------- |
| npm package   | not run                                         | —             | cmd_template uses git clone, not an npm create CLI |
| GitHub repo   | not run                                         | —             | gh CLI not installed; could not query GitHub API   |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 19
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: append-merged (7 new patterns from starter: .astro/, yarn-debug.log*, yarn-error.log*, pnpm-debug.log*, .env.production, .dev.vars, .wrangler/)
**.bootstrap-scaffold cleanup**: deleted
**Upstream .git/ removal**: deleted before move-up

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/2/0/0 direct of total 0/1/9/0 (direct = @astrojs/check moderate, wrangler moderate)

#### HIGH findings

- **devalue** v5.6.3–5.8.0 — DoS via sparse array deserialization (GHSA-77vg-94rm-hx3p, CVSS 7.5). Transitive dependency. Fix available via `npm audit fix`.

#### MODERATE findings

- **ws** v8.0.0–8.20.0 — Uninitialized memory disclosure (GHSA-58qx-3vcg-4xpx, CVSS 4.4). Transitive via @supabase/realtime-js and miniflare. Fix available.
- **yaml** v2.0.0–2.8.2 — Stack Overflow via deeply nested YAML collections (GHSA-48c2-rrv3-qjmp, CVSS 4.3). Transitive via yaml-language-server. Fix available via @astrojs/check downgrade.
- **@astrojs/check** >=0.9.3 — Affected via @astrojs/language-server → volar-service-yaml chain. Direct dependency. Fix: downgrade to 0.9.2 (semver major).
- **@astrojs/language-server** >=2.14.0 — Affected via volar-service-yaml. Transitive.
- **volar-service-yaml** <=0.0.70 — Affected via yaml-language-server. Transitive.
- **yaml-language-server** — Affected via yaml. Transitive.
- **wrangler** v3.108.0–4.93.0 — Affected via miniflare → ws chain. Direct dependency. Fix available.
- **miniflare** v3.20250204.0–4.20260518.0 — Affected via ws. Transitive.
- **@cloudflare/vite-plugin** v0.0.7–1.37.2 — Affected via miniflare, wrangler, ws chain. Transitive.

## Hints recorded but not acted on

| Hint                     | Value              |
| ------------------------ | ------------------ |
| bootstrapper_confidence  | first-class        |
| quality_override         | false              |
| path_taken               | standard           |
| self_check_answers       | null               |
| team_size                | solo               |
| deployment_target        | cloudflare-pages   |
| ci_provider              | github-actions     |
| ci_default_flow          | auto-deploy-on-merge |
| has_auth                 | true               |
| has_payments             | false              |
| has_realtime             | false              |
| has_ai                   | true               |
| has_background_jobs      | false              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
