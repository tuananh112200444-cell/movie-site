# Base title and season-one canonicalization

User scope: one movie/search result for a base title and its identical season 1;
preserve season 2/3 as separate records. Preserve sources, history and old URLs.

Root causes span two paths: live search merged external/provider snapshots by
literal titles, and ingestion stored different fingerprints for an unspecified
season and explicit season 1. Fixing only search could not retire stored copies;
merging only stored copies could not stop external search reintroducing aliases.

The new identity bridge requires equal verified year, series type, normalized
Vietnamese base title and original base title, no conflicting external IDs, and
only unknown/season-one scopes. It does not treat all unknown seasons as one.
Aggregate markers, contradictory metadata, later seasons and advertised larger
collections are excluded from automatic preserving merges. Provider-verified
exceptions are recorded privately with the supporting external IDs and season.

The resolver serializes incoming base/season-one aliases with a shared lock,
looks up the existing identity through indexed bilingual base titles, and
registers future provider aliases on that movie. All existing resolver routes
still check current type, season and external IDs. Shared code now also handles
base titles whose stored season column already says 1. Targeted import, admin,
TMDB, NguonC/KKPhim, gap repair and auxiliary connectors use the shared contract.
CobePhim, local Motchill/CobePhim and TMDB catalogue get a service-only,
lookup-only bridge before creating another movie.

Existing duplicates run through the established preserving merge: archived
parents/children, source URL collision handling, history/session movement,
provider identity redirection, retired-row write guards and canonical aliases.
No parent movie rows are hard-deleted. Only the implicit-first candidate prefix
is processed by the dedicated runner. It supports resume, per-group transactions,
capacity protection and a bounded delay between groups.

Validation includes executable real-function tests for source-order-independent
search, remakes, conflicting IDs/original titles, aggregates and later seasons;
SQL rollback fixtures prove that repeated imports reuse one ID, season 2 stays
separate, sources and historical URLs survive a merge, and rollback archives
exist. Existing provider, outage, media-proof, target-binding and health
persistence regressions passed. Reviewed multi-season partition tests preserve
109 + 50 Gao Nep Gao Te sources and future URL-change propagation.

Load protection paused the runner when cumulative scans rose. Investigation
found movie_watch_sessions had about 207,000 rows without a leading movie_id
index: its cumulative sequential tuple reads were about 597 million. A
concurrent movie_id index now supports ownership lookup; a real count for 338
sessions used Index Only Scan and completed in 4.506 ms. Archive schema lookups
also use indexed pg_attribute access rather than repeated information_schema
inspection. Capacity guard thresholds were not weakened or bypassed.

Provider reviews were run locally with three requests at a time against KKPhim,
NguonC and VSMov. They confirmed that some retained candidates are whole-series
collections or carry incompatible provider metadata; they are not all safe
whole-record merges. Those sources must not be deleted or attached wholesale
to season 1. The public search contract can represent aliases without pretending
that unknown episodes have been verified as season 1.

Live release 0db66e49a4de verified at khophim.org and
https://20703eeb.movie-site-eds.pages.dev. Search checked live: Dau Tay Ngot Ngao
returns one stored movie; Song The Sung Phi returns one first-season/base movie
and separate 2/3; Thien Su Nha Ben retains distinct season 1/2. This is not a
claim that all video URLs or every viewer device have been playback-tested.

Final reconciliation, approximately 15:23 Vietnam time:

- 438 candidate groups assessed; 410 completed/merged (including groups already
  resolved by another preserving merge), 28 remain review, zero ready or failed.
- Exactly 400 source movie records retired onto canonical records. Zero retired
  records remain public and zero source-slug aliases are missing.
- 10,990 distinct archived stream/embed URL pairs resolved to final canonical
  records and compared against current streams: zero missing pairs.
- 4,067 distinct archived viewing sessions compared against final canonical
  ownership: zero missing sessions. Archive rows themselves may repeat a session
  across successive group merges, so raw archive-row counts are not session totals.
- The runner's local counter shows 407 because one committed three-group batch
  finished while its parent process was stopped for inspection. Final counts
  above come from database ledgers, not the local progress counter.
- Final runtime capacity normal. Final post-deployment SQL rollback regression
  passed. No capacity thresholds were overridden and SMALL was retained.

The 28 review groups contain oversized/combined episode collections or
inconsistent provider metadata. Examples include Castlevania 32 vs first-season
4 episodes, Gao Nep Gao Te 159 vs 109 (already explicitly partitioned separately),
and metadata that providers label with another season/year. They were not blindly
whole-record merged. Some require reviewed episode partitions or further source
identity evidence. Therefore this is completion of all verified automatic merge
candidates, not a claim that every potential duplicate or video failure in the
entire catalogue has been resolved.
