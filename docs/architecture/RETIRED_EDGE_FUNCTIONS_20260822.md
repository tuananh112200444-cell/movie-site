# Retired Supabase Edge Functions — 2026-08-22

These deployed functions had no matching source directory, no repository
caller and no active production cron command at the audit checkpoint. They
were removed after Catalog Brain and Playback Brain became the only recurring
orchestrators.

- admin-external-episode-overrides
- admin-external-movie-overrides
- admin-r2-upload-url
- admin-thai-bl
- auto-sync-thai-bl
- auto-sync-trigger
- check-stream-health
- cleanup-old-cache
- cleanup-old-movies
- daily-sync
- daily-sync-new-movies
- external-search
- extract-stream
- get-banner-stats
- google-ping
- image-proxy
- kisskh-blvietsub-sync
- kisskh-fast-library-sync
- kisskh-fast-movie-sync
- kisskh-proxy
- merge-search
- movie-poster-cdn
- movie-poster-proxy
- ping-test
- resolve-stream
- save-mapping
- scrape-movie-detail
- sitemap-handler
- sync-kisskh-movies
- sync-movie-details-batch
- tmdb-enrich
- trending-poster-urls
- upsert-movies

Replacement boundaries:

- provider ingestion and repairs: `catalog-brain`;
- source verification and player recovery: `playback-brain`;
- search: Cloudflare `/api/search` plus `search_movies_fast`;
- movie detail: Cloudflare `/api/movie-detail` plus `movie-detail-proxy`;
- sitemap: Cloudflare sitemap routes plus source-controlled sitemap functions;
- admin writes: source-controlled `admin-movie-upsert` and
  `admin-episode-upsert`.
