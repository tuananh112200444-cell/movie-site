export function recoveryEpisodeAliases(episode: string): string[] {
 if(/^(?:full|tap-full|full-hd)$/i.test(episode))return ['full','tap-full','full-hd','1','01','tap-1','tap-01','episode-1','ep-1'];
 const match=/^(?:(?:tap|episode|ep)-)?0*(\d+)$/i.exec(episode);
 if(!match)return [episode];
 const number=String(Number(match[1]));
 const labels=[number,number.padStart(2,'0')];
 return [...new Set([episode,...labels.flatMap(n=>[n,`tap-${n}`,`episode-${n}`,`ep-${n}`])])];
}
export function recoveryVerdict(probe: Record<string, unknown>): 'verified_sample' | 'pending_browser' | 'no_source' | 'retry' {
 const rows=Array.isArray(probe.results)?probe.results as Array<Record<string,unknown>>:[];
 if(probe.success!==true) return 'retry';
 // Only the selected episode is covered; HTML reachability never proves playback.
 if(rows.some(r=>r.ok===true && r.inconclusive!==true && ['hls-segment','direct-media'].includes(String(r.playback_proof)))) return 'verified_sample';
 if(rows.some(r=>r.inconclusive===true)) return 'pending_browser';
 return 'no_source';
}
