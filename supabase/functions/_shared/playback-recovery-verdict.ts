export function recoveryVerdict(probe: Record<string, unknown>): 'verified_sample' | 'pending_browser' | 'no_source' | 'retry' {
 const rows=Array.isArray(probe.results)?probe.results as Array<Record<string,unknown>>:[];
 if(probe.success!==true) return 'retry';
 // Only the selected episode is covered; HTML reachability never proves playback.
 if(rows.some(r=>r.ok===true && r.inconclusive!==true && ['hls-segment','direct-media'].includes(String(r.playback_proof)))) return 'verified_sample';
 if(rows.some(r=>r.inconclusive===true)) return 'pending_browser';
 return 'no_source';
}
