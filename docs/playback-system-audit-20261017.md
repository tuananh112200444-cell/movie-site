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

Live verification at 17 October 2026, approximately 12:54 Vietnam time:

- Frontend release `9d0ba23c46c0` verified at the deployment URL and khophim.org.
  Backend follow-up `5b0e16ae` deployed to auto-repair-player-issues and both brains.
- Provider repair completed at 12:47 Vietnam time with no task error, after
  previously being starved since 10 October. Capacity controller reports normal.
- Imported exactly 30,000 local audit records; 6,577 unresolved samples mapped
  to 6,576 distinct canonical movie records and were queued. This is not a
  claim of completed repairs or complete episode coverage.
- Total recovery queue (including pre-existing work) currently has 8,502 rows
  with no completed outcome, 38 pending_browser, 10 no_source, 36 verified_sample
  and 37 recovered_sample. These counts can change as scheduled work runs.
- Scheduled recovery completed another recovered_sample at 12:49 and a
  pending_browser attempt at 12:54. Its bounded pace remains one movie per five
  minutes, subject to capacity and retry guards; a large backlog remains.
- Real browser playback progressed for Tren Ban Nhau Duoi Ban Muu and Yeu Mot
  Nguoi Khac episode 8. Transformers 4 has a ready-state-4 video at 138.57 seconds,
  paused after verification. This does not certify all episodes or devices.
- Protected auto-repair dry-run returned HTTP 200, zero recent candidates and
  zero scanned events. Actual-handler regression separately proves that failed,
  inconclusive and wrong-episode probes cannot count as repaired, while matching
  episode media proof can.
- Systemic SQL rollback tests, provider/identity/media-proof/recovery/scheduler
  regressions, telemetry proof regression and production build checks passed.

Operational interpretation: the confirmed pipeline defects above are repaired
and deployed. Catalog-wide playback recovery is still in progress. Blocked
providers need an alternative source or browser verification; they must not be
reported as either healthy media or definitively absent media from a 403 alone.
