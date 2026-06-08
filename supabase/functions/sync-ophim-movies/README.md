# sync-ophim-movies

Imports fresh OPhim movies into `public.movies`, inserts missing episodes into
`movie_episodes`, `episodes`, and `streams`, clears home/search caches, and
writes a row to `sync_logs`.

## Deploy

```bash
supabase functions deploy sync-ophim-movies
supabase secrets set CRON_SECRET="replace-with-a-long-random-secret"
```

## Test

```bash
curl "https://PROJECT_REF.supabase.co/functions/v1/sync-ophim-movies?dry_run=1&pages=1&limit=5&secret=YOUR_CRON_SECRET"
curl "https://PROJECT_REF.supabase.co/functions/v1/sync-ophim-movies?pages=2&limit=48&secret=YOUR_CRON_SECRET"
curl "https://PROJECT_REF.supabase.co/functions/v1/sync-ophim-movies?pages=1&limit=5&episodes=1&secret=YOUR_CRON_SECRET"
```

## Schedule

Run every 10 minutes:

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'sync-ophim-movies-every-10-minutes',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://PROJECT_REF.supabase.co/functions/v1/sync-ophim-movies?pages=2&limit=48&secret=YOUR_CRON_SECRET',
    timeout_milliseconds := 25000
  );
  $$
);
```

The scheduled job syncs movie metadata first so search results appear quickly.
Episode rows are handled by `auto-sync-ophim-episodes`; pass `episodes=1` only
for small manual batches.

For faster coverage after first deploy, call once with `pages=5&limit=150`.
