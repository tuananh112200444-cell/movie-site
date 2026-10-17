# Playback system audit — 17 October 2026

Scope: provider ingestion/identity, persisted sources, health proof, scheduling,
recovery, viewer feedback, public detail cache, player fallback and the two
local scans of 30,000 movie records. This is a system audit and repair, not
proof that every episode on every device plays continuously.

Confirmed gaps and changes:

- Catalog task priority starved provider repair (last completed 10 October).
  Both brains now claim the oldest due task before using priority as a tie-break.
- The detail proxy ignored `Full`/`tap-full` in unverified coverage checks and
  treated two unverified providers as sufficient. Full movies and multiple
  unchecked sources now enter bounded recovery. Opaque HTML `ok` is not direct
  playback evidence. Cache hits also enqueue recovery without blocking viewers.
- Source probes selected only one URL per provider and could repeatedly probe
  the same failed URL. Selection now rotates by last-check time and fills the
  remaining probe budget with alternative URLs from the same provider.
- Different English translations prevented local source reuse. A separate
  indexed counterpart rule requires exact Vietnamese title, year/type,
  at least two normalized shared actor names, no conflicting TMDB/IMDb, and
  explicit matching seasons for series. It adds source candidates only; it
  does not merge movie records and does not weaken canonical merge rules.
- The 30,000 local scan results were isolated files. A private, idempotent
  import maps old movie IDs through merge chains and queues unresolved samples.
  It never marks streams dead from a 403/timeout and never marks a whole movie
  healthy from one sample. Viewer error priority remains above bulk imports.
- The player source badge said “Đang phát” merely when selected. It now says
  “Đang chọn”; the source selection badge is not a playback-success signal.
- The telemetry repair worker counted any successful internal HTTP operation
  as a repaired film. It now requires media proof for the requested episode,
  records pending work separately, and bounds discovery/probes. Brain logs
  retain checked/verified/inconclusive counts and repair outcomes rather than
  making an operation-success flag stand in for playback success.

Existing validated protections retained: requested-movie write binding,
strict year/season/ID checks, private merge archives and aliases, stale-write
tombstone guard, real HLS segment bytes, inconclusive region probes, fenced
recovery leases and SMALL capacity protection.

Limits: provider outages/403 blocks cannot be prevented by this website.
Cross-origin iframe `load` events cannot prove media decoding or progress.
The scheduled recovery worker is deliberately bounded and does not clear a
large backlog immediately. Successful media samples do not prove all episodes,
decryption variants, seeking or compatibility with all viewer devices.

Tests: systemic-playback-contract-regression.mjs plus rollback SQL for translated
titles/shared cast, false identity rejection, merged-ID import, idempotency,
permissions and task fairness; existing provider, media-proof, target-binding,
recovery-worker, persistence and scheduler contracts are rerun. Live verification
must separately confirm scheduled work, import counts, public API and browser
playback before reporting completion.
