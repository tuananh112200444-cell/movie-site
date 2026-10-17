# Doctor X episodes 3–4 restoration

Affected movie: bac-si-x, Doctor X: Mafia in White (2026), UUID
77bdca05-5d81-4e4a-bfc5-046dc760db26, providers agree on TMDB 293610.
This is separate from the older Japanese Doctor-X seasons.

Before repair: stored current_episode 2; last_synced_at 16 October 2026 07:35Z.
Stored sources were KKPhim episodes 1–2 and VSMOV episode 1. No archive rows
exist for this movie in the preserving merge archive and the movie is not retired.
The missing public episodes were stale ingestion, not evidence of deletion by
the preceding first-season merges.

Provider checks: VSMOV and NguonC list four episodes; KKPhim lists three.
Targeted authenticated syncs bound to the existing movie UUID imported VSMOV
episodes 2–4 and KKPhim episode 3, without creating another movie. The second
sync retained current_episode 4 even though KKPhim only advertised episode 3.
Public detail now returns all four episode choices. Existing URLs were retained.

Root gap: ongoing-refresh enrollment tested source_site/source_name for KKPhim
only. The canonical movie is labelled VSMOV despite having KKPhim source rows
and a phimapi provider identity; it was absent from kkphim_ongoing_refresh_queue.
The trigger now also accepts existing KKPhim streams/provider identities.
Existing publication, completion, season-retirement and cadence checks remain.
A rollback test confirmed queue enrollment, then the migration was applied.
The affected film is now enrolled. No global cron frequency or capacity guard
was changed.

Playback: episode 3 HLS played past 20 seconds, readyState 4 in the browser.
Episode 4 opened the VSMOV iframe titled Bac si X_VIETSUB - Tap 04.mkv;
iframe playback progress is verified separately before claiming success.
