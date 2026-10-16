type ProviderProbeRow = { source?: string; stream_url?: string; embed_url?: string; last_error?: string | null };
type ProviderProbeResult = { status: number | null; error?: string };
/** An edge-region HTTP error is inconclusive for paired KKPhim CDN/player URLs.
 * This never turns an embed HTML response into verified media playback. */
export function isInconclusiveKkphimProbe(row: ProviderProbeRow, result: ProviderProbeResult): boolean {
  if (![401,403,404].includes(result.status ?? 0)) return false;
  if (/^Viewer telemetry(?::| confirmed)/i.test(row.last_error || '')
    || /^Viewer telemetry confirmed/i.test(result.error || '')) return false;
  try {
    const direct = new URL(row.stream_url || '');
    const embed = new URL(row.embed_url || '');
    if(direct.protocol!=='https:' || embed.protocol!=='https:')return false;
    const host=direct.hostname.toLowerCase();
    const trustedHost=host==='a.kvp726.com' || host==='phim1280.tv' || host.endsWith('.phim1280.tv')
      || /^(?:[a-z0-9-]+\.)*kkphimplayer\d+\.com$/.test(host);
    if(!trustedHost || !/\.m3u8$/i.test(direct.pathname))return false;
    if(embed.hostname!=='player.phimapi.com' || !embed.pathname.startsWith('/player/'))return false;
    return new URL(embed.searchParams.get('url') || '').href===direct.href;
  } catch { return false; }
}

