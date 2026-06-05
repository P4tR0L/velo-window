# Repository Guidelines

Astro 6 SSR application with React 19 islands, Tailwind 4, Supabase cookie-based auth, and shadcn/ui components. Deployed to Cloudflare Workers via `@astrojs/cloudflare`. See @CLAUDE.md for detailed architecture and agent-specific conventions.

## Hard Rules

- Never use Next.js directives (`"use client"`, `"use server"`). Astro uses its own island architecture.
- Never concatenate Tailwind class strings manually. Use the `cn()` helper from `@/lib/utils`.
- API routes must export `const prerender = false` (the app uses full SSR mode).
- Always enable RLS on new Supabase tables with granular per-operation, per-role policies.
- Unused variables must be prefixed with `_` — all others trigger ESLint errors.
- Never disable or suppress the no-console ESLint rule. If you need runtime logging, use the project's logger (if one exists) or ask.
