# Verified movie merge

`run_verified_movie_merge_batch` processes at most five ready Tier A candidate
groups per call and rechecks each current movie against strict identity rules.
Unknown/conflicting seasons, release years or external IDs go to review.
Runtime capacity protection pauses the batch. The local runner uses three
groups per transaction and a 25-second timeout; failed transactions roll back.

Each committed merge has a ledger and full JSON snapshots of both the chosen
movie and donors, including playback, comments, watch sessions and aliases.
Distinct URLs that collide on a server/episode key are retained under a donor
server suffix. Exact URL duplicates may collapse, while source movies remain
as unpublished tombstones linked to the canonical movie. No parent movie row
is deleted. Existing aliases are repointed without chains. Comments retain
their IDs and likes; watch sessions move; progress keeps the greatest stored
position on duplicate episode entries. Separate editorial reviews are retained.

`rollback_canonical_merge` restores archived movie and playback data for v2
merges. It refuses to overwrite later movie edits or dependent merges. Legacy
merges retain their original rollback implementation. Updated timestamps are
set by existing triggers, so a recovery is not a byte-identical timestamp replay.
Archives remain available for reviewed recovery when freshness guards prevent
automatic rollback. Do not discard the merge ledger/archive.

The batch is a finite maintenance run, not a recurring automatic permission
to merge every similar title. Failed and review groups are not retried blindly.
Old URLs are verified via the movie-detail proxy's existing slug-alias route.

Validation: `scripts/verified-merge-regression.sql` in a rollback transaction
checks both movie snapshots, URL preservation, hidden donor, alias resolution
and movie metadata restoration on the Transformers group.
