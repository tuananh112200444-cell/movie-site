# Season identity repair, 17 October 2026

Confirmed owning components: canonical SQL resolver and legacy external-ID
indexes, shared identity helper, sync-ophim-movies (also imports KKPhim and
NguonC), gap-provider repair, detail proxy, edge local fallback and TMDB enrichment.

The former TMDB/IMDb indexes enforced one row per external ID, even for series
with multiple seasons. New indexes include media type, effective season and
aggregate scope. All resolver branches now check current season/type/ID
compatibility, including stored provider identities and canonical fingerprints.
Shared helpers and target imports reject a conflicting or unknown season rather
than treating a shared series ID, year or slug as proof. Unknown is not season 1.
The edge local fallback and auxiliary detail merge apply the same guard.

NguonC's Gao Nep Gao Te collection numbers 159 episodes cumulatively, with
explicit boundaries at 1-Phan 1 and 110-Phan 2. Reviewed private partitions now
copy 109 candidates to season 1 and 50 to season 2, renumbering 110 to episode 1.
The original collection is preserved. Copied URLs remain unchecked. A ledger
records each source/target pair. Future URL changes on that reviewed collection
are forwarded idempotently; only changed URLs reset health. Unreviewed collections
are not guessed or automatically merged. Historical public routes preserve the
110-to-1 boundary. The unrelated VSMov Nobody's Fool record is not merged.

Live inventory: 53,555 active records at the initial query; 7,616 contain a
season marker in name/original title/slug. Follow-up metadata audit recorded
20 season conflicts and 19 movie records with provider-type conflicts (initial
22 conflicting provider links can refer to the same movie). These are review
cases, not a count of unplayable titles. Publication mismatch is deliberately
not treated as proof of corruption because SEO and playback publication differ.

Validated: transactional rollback SQL for same-TMDB/same-year distinct seasons,
poisoned provider identity, conflicting labels and aggregate-vs-season; real
import and edge fallback function tests; reviewed historical route boundaries;
existing target binding, provider, media-proof and outage contracts. The live
partition check confirms 109 + 50 ledger entries. Season 1 episode 1 played for
more than 63 seconds in a real browser after the main release. Public detail
API returned 109 KKPhim episodes for season 1 and 50 for season 2.

Main production release dbb5a5fdd026 was verified at both khophim.org and
https://1771dda7.movie-site-eds.pages.dev. The follow-up route release must be
verified separately. Backend migrations 20261017110000 and 20261017113000 were
applied. Capacity remained normal. No paid compute upgrade was requested.

Remaining: review the contradictory season/type records against actual provider
episodes, review other aggregate collections before partitioning them, and
continue media checks. No claim that all episodes/providers/devices now work.
