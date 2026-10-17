# Split playback investigation and repair

The Transformers 4 incident exposed a targeted ingest bug. The connector
validated the provider's alternate slug against the requested movie, then
called the normal catalog resolver again. Existing provider aliases could
select a sibling movie row. Streams were written to that sibling while the
health check ran against the requested movie. A successful metadata update
therefore did not mean the requested route gained a working source.

Targeted ingestion now revalidates identity at the write boundary and binds
the requested movie ID. Normal catalog ingestion still uses its canonical
resolver. Both requested and provider slugs have their caches invalidated.

The provider repair brain also treated stored candidate URLs as sufficient
to close work. It now requires a recent verified direct sample and does not
treat pending provider coverage as complete. This is a sample, not proof of
all episodes. Existing source-recovery code still verifies the chosen episode.

At inspection time, 1,559 ready duplicate candidate groups contained 3,164
movie records, of which 1,281 were published. 2,871 member records had no
stored OK direct HLS. These are investigation candidates, not counts of
confirmed broken films: embedded players and untested URLs can still work.
No canonicalization task/job was found for those candidates.

The bounded source-recovery worker now visits ten existing candidate groups
per invocation using a keyset cursor. It queues eligible missing-source movies
and first tries sources already present on a strictly matching sibling.
It requires compatible year/type, no conflicting TMDB/IMDb IDs, and exact
external identity or normalized original title. Series require an explicit
matching season. Ambiguous matches are left for discovery/manual review.

Only active nonfailed direct HLS candidates are copied. They enter as
unchecked, retain audio/subtitle metadata, and are audited in the private
sibling_source_recovery_ledger. No movie records are merged or deleted, no
existing stream is overwritten, and publication is not forced. The worker
must fetch media before reporting recovered_sample. Runtime capacity protection
applies to seeding and copying as well as the existing verification queue.

Validation covers the wrong-provider-alias case, wrong year/type/season,
conflicting external IDs, episode padding, URL deduplication, idempotency,
audit logging, private permissions, capacity protection, pending coverage and
media-proof recovery outcomes. SQL tests run in a rollback transaction.
