# Bounded playback source recovery

Supabase runs `playback-source-recovery` every five minutes. One invocation
claims one movie with a three-minute fenced lease, checks one episode using
up to three provider alternatives, and discovers at most one provider before
checking media again. Provider discovery rotates across KKPhim, NguonC and
VSMOV on subsequent attempts. Existing connector identity checks remain in
place. OPhim is excluded.

Viewer-triggered repairs and independent source failures enter the same queue.
Repeated detail requests preserve an exact requested episode and the original
pending queue position. Three recent critical viewer events also receive priority.
A keyset cursor introduces published films first, then eligible unpublished
films. Draft, hidden, superseded and preview-only films are excluded.

`verified_sample` / `recovered_sample` prove media retrieval for the sampled
episode only. HLS requires a valid master/media playlist and real segment bytes.
HTML, JSON and empty bodies do not count. `pending_browser` is inconclusive,
not a dead stream or successful playback. `no_source` means no verified source
was obtained in this bounded attempt, not that every provider was exhausted.
Three discovery attempts rotate providers before the longer backoff. Successful
samples revisit after seven days, advancing the episode cursor.

This is incremental coverage, not an immediate full audit of 50,000 films or
every episode. Browser decoding, encrypted key retrieval, seeking and playback
from every viewer network still require browser telemetry/validation.

Capacity protection pauses the scheduled job and SQL claims. Targeted unified
provider repair also respects protection. The existing capacity controller
resumes paused jobs automatically. Nothing upgrades the SMALL compute plan,
deletes films, or republishes the whole catalog.

Inspect `public.playback_recovery_queue` (latest result/evidence per movie),
`private.playback_recovery_scan` (keyset progress and singleton lease), and
`sync_logs` with `function_name = 'playback-source-recovery'`. Only service-role
RPC callers can enqueue, claim or complete work. Unauthenticated HTTP calls
are rejected by the cron-secret check. No secrets are stored in queue evidence.

To pause the worker, disable `bounded-playback-source-recovery` and remove its
entry from `runtime_capacity_managed_jobs` so the capacity controller cannot
reactivate it. Preserve queued work and evidence for resumption.

Validation: worker scenarios, media body validation, episode alias tests,
provider health regressions and transactional SQL tests for leases, fencing,
backoff, privileges, queue priority and publication preservation.
