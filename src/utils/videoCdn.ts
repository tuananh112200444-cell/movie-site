const DEFAULT_BACKBLAZE_BUCKET = 'videomeu8';
const DEFAULT_VIDEO_CDN_ORIGIN = 'https://video.khophim.org';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function normalizeVideoCdnUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) return '';

  const cdnOrigin = trimTrailingSlash(
    (import.meta.env.VITE_VIDEO_CDN_ORIGIN as string | undefined) || DEFAULT_VIDEO_CDN_ORIGIN
  );
  const bucket = (
    (import.meta.env.VITE_BACKBLAZE_BUCKET as string | undefined) || DEFAULT_BACKBLAZE_BUCKET
  ).trim();

  if (!cdnOrigin || !bucket) return value;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith('backblazeb2.com')) return value;

    const filePrefix = `/file/${bucket}/`;
    if (!url.pathname.startsWith(filePrefix)) return value;

    const objectPath = url.pathname.slice(filePrefix.length);
    const cdnUrl = new URL(`${cdnOrigin}/${objectPath}`);
    cdnUrl.search = url.search;
    return cdnUrl.toString();
  } catch {
    return value;
  }
}
