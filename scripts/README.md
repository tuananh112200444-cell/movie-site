# Script groups

- `*-regression.mjs`, `*-audit.mjs`, `*-gate.mjs`: read-only verification.
- `generate-*`, `refresh-home-fallback.mjs`: deterministic build artifacts.
- `sync-*-external.mjs`, `sync-four-provider-catalogs.mjs`: operator-only
  backfill/import tools; never schedule these outside Catalog Brain.
- `repair-*`, `source-brain-warm-verified.mjs`: manual diagnostics or reviewed
  recovery tools; production recurring repair belongs to the brain queue.
- `start-*` and `watch-*`: temporary operator helpers, not production daemons.

Every script that mutates production must require an explicit apply flag or an
internal secret. Tests must never start a background sync process.
