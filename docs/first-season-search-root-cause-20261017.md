# Base-title / first-season duplicate search root cause

The reported Dau Tay Ngot Ngao example was reproduced in production with
`/api/search?q=dâu tây ngọt ngào`: two items, one external `dau-tay-ngot-ngao`
without a database ID and one canonical UUID-backed `dau-tay-ngot-ngao-phan-1`.
Database inspection by both Vietnamese and English titles found only one active
movie for this show. Its KKPhim and NguonC provider identities point to the same
UUID. This example is not two movie rows needing a database merge.

The owning function is `mergeProviderNeutralSearchRows` in the Pages API. It
combines database results, static snapshots and external provider searches.
Its old comparator required equal normalized names, leaving `(Phần 1)` and
`(Season 1)` in the identity. Exact base-title relevance then ranked the external
base-title route before the stored first-season route. Provider fallback runs
again on later searches, so deleting a duplicate database record alone cannot
prevent this visible duplicate from returning.

Commit cd5b69d6 adds a bounded first-season equivalence rule to that shared
search merger. It requires the same verified year and base localized title,
compatible series type, consistent original titles when both exist, and no
conflicting external IDs. Unknown and explicit season 1 can share a search
result; explicit seasons 2/3 and known aggregate collections do not. The stored
canonical UUID route takes precedence over the external-only alias regardless
of arrival/ranking order. The search cache namespace changes to v22.

This does not relax the database or stream-binding season guard. Display
equivalence is not permission to attach unknown provider episodes to season 1.
Existing genuinely duplicated movie rows require separate identity verification
and a preserving merge; series-wide provider collections require reviewed
episode partitions. These concerns must not be conflated with live-search
duplicate rendering.

Tests execute the actual search handler under a database-outage fixture and
verify one canonical result, plus order independence, contradictory IDs and
original titles, remakes and separate seasons. Existing season, target-binding
and outage regressions also pass. Production release verification is recorded
in the chat/tool outputs once deployment completes.

Production verification: both khophim.org/release.json and
https://f53e662c.movie-site-eds.pages.dev/release.json report cd5b69d61eeb.
The live Vietnamese query now returns exactly one result, canonical UUID
4099b0cb-91c5-4ed4-a0d6-930423767f80 and slug dau-tay-ngot-ngao-phan-1.

A separate indexed, bounded catalogue query found 423 active base-slug /
first-season-slug pairs with equal year and series type, excluding records
already marked aggregate. These are candidates, not 423 verified identical
episode collections. They have not been merged by this search-rendering fix.
The broader normalized-title inventory timed out and was not repeated; therefore
423 is not claimed as an exhaustive catalogue-wide duplicate count. Database
and provider ingestion still distinguish unknown season from season 1; merging
those stored records requires a strong identity bridge and preserving merge,
not a blanket global assumption that unknown always means season 1.
