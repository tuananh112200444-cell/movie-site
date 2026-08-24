# KhoPhim system ownership

This document is the source-of-truth boundary for production logic.

## Decision owners

Only three components may make cross-system decisions:

1. **Catalog Brain** owns provider scheduling, movie identity, episode truth,
   publication reconciliation and catalogue repair.
2. **Playback Brain** owns stream verification, health, source scoring and
   player recovery work.
3. **Runtime Governor** owns capacity protection and enables or pauses the two
   recurring brain schedulers.

OPhim, KKPhim, VSMOV, NguonC, BLVietsub, GLVietsub, Motchill and TMDB are
connectors. A connector may normalize and persist positive source evidence; it
must not schedule itself or choose another connector.

## Runtime contracts

- `public.system_brain_tasks` is the private durable task queue.
- `claim_system_brain_tasks` uses `FOR UPDATE SKIP LOCKED` and a finite lease.
- `complete_system_brain_task` owns retry backoff and the next due time.
- `catalog-brain` and `playback-brain` execute only allow-listed handlers.
- `evaluate_runtime_capacity` is the only component allowed to pause or resume
  recurring brain jobs.
- Cloudflare Pages Functions own routing, HTTP caching and deterministic SEO
  responses. They do not own movie/provider truth.
- The React application consumes canonical APIs. Production browser code must
  not fetch provider catalogues directly.

## Active recurring jobs

The intended steady state is four active jobs:

- `evaluate-runtime-capacity-every-2-minutes`
- `catalog-brain-every-2-minutes`
- `playback-brain-every-3-minutes`
- `cleanup-observability-logs-daily`

Historical cron rows may remain inactive for auditability, but they must have
`paused_by_capacity_guard = false` so the governor cannot resurrect them.

## Repository map

- `supabase/functions/catalog-brain`: catalogue task orchestrator.
- `supabase/functions/playback-brain`: playback task orchestrator.
- `supabase/functions/_shared/system-brain-runner.ts`: shared lease executor.
- `supabase/functions/sync-*`: provider connectors only.
- `functions/[[path]].js`: Cloudflare routing/cache/SEO boundary.
- `src/services/movieApi.ts`: compatibility facade for canonical web APIs;
  new provider policy must not be added here.
- `scripts/*-regression.mjs`: executable production contracts.

## Removal rule

Do not remove a function, cron job or trigger based only on its name. Removal
requires all of the following evidence:

1. no repository caller;
2. no active cron command;
3. a replacement contract or proof the one-time job is complete;
4. regression and production smoke checks after removal.
