---
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
---

## Why this stack

Solo developer building a cycling weather-window finder MVP in 3 weeks (after-hours only) with auth and AI-driven route recommendations as must-have features. The 10x Astro Starter is the recommended default for (web-app, js) and ships Supabase auth, PostgreSQL database, and Cloudflare Pages edge deploy out of the box — exactly the batteries needed without assembling them piecemeal. All four agent-friendly criteria pass (typed, convention-based, popular in training data, well-documented), and the starter's TypeScript-first discipline with Zod schemas at boundaries keeps the AI agent effective. AI integration (weather API + LLM route recommendations) fits naturally into Astro API routes hitting external services. CI runs on GitHub Actions with auto-deploy-on-merge.
