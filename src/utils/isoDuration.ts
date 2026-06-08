/** Convert Vietnamese movie time string to ISO 8601 duration (e.g. PT120M).
 *  Handles: '120 phút', '2 giờ 30 phút', '45 phút/tập', '24 tập', etc.
 *  Returns undefined if the string cannot be parsed meaningfully.
 */
export function parseMovieTimeToISODuration(timeStr: string | null | undefined): string | undefined {
  if (!timeStr) return undefined;
  const s = String(timeStr).toLowerCase().trim();

  // Ignore cases like "24 tập" that have no time information
  if (/^\d+\s*t[ấa]p$/i.test(s) && !s.includes('phút') && !s.includes('giờ')) {
    return undefined;
  }

  let hours = 0;
  let minutes = 0;

  // Match hours – supports "2 giờ", "2h", "2 hour"
  const hourMatch = s.match(/(\d+)\s*(?:giờ|h)/i);
  if (hourMatch) {
    hours = parseInt(hourMatch[1], 10);
  }

  // Match minutes – supports "30 phút", "30p", "30 min"
  const minMatch = s.match(/(\d+)\s*(?:phút|p|min)/i);
  if (minMatch) {
    minutes = parseInt(minMatch[1], 10);
  }

  // If the string is just a number (e.g. "60"), treat it as minutes
  if (!hourMatch && !minMatch) {
    const rawNum = s.match(/^(\d+)$/);
    if (rawNum) {
      minutes = parseInt(rawNum[1], 10);
    }
  }

  // Handle cases like "45 phút/tập" – extract the minute value
  if (!hourMatch && !minMatch) {
    const perEpMatch = s.match(/(\d+)\s*(?:phút|p|min)\s*\/\s*t[ấa]p/i);
    if (perEpMatch) {
      minutes = parseInt(perEpMatch[1], 10);
    }
  }

  if (hours === 0 && minutes === 0) return undefined;

  let iso = 'PT';
  if (hours > 0) iso += `${hours}H`;
  if (minutes > 0) iso += `${minutes}M`;
  return iso;
}