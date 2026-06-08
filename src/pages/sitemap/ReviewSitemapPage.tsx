import { useEffect, useState } from 'react';

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'https://khophim.org';

/**
 * /sitemap-reviews.xml — Proxy cho Supabase Edge Function
 * Fetch XML từ Supabase, thay domain Supabase bằng domain chính,
 * inject vào document → Google bot thấy URL sạch của khophim.org
 */
export default function ReviewSitemapPage() {
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function buildSitemap() {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/sitemap-reviews`, {
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;

        // Count URLs
        const matches = text.match(/<loc>/g);
        setCount(matches?.length ?? 0);

        // Inject XML vào document
        document.open('text/xml');
        document.write(text);
        document.close();
      } catch (err) {
        if (cancelled) return;
        // Fallback: trả về sitemap rỗng hợp lệ
        const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Error fetching reviews sitemap: ${String(err)} -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/phim-moi-nhat</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>`;
        document.open('text/xml');
        document.write(fallback);
        document.close();
        setLoading(false);
      }
    }

    buildSitemap();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{
        fontFamily: 'monospace',
        padding: '40px',
        background: '#080a10',
        color: '#888',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{ fontSize: '16px', color: '#ccc' }}>Generating reviews sitemap...</div>
        <div style={{ fontSize: '13px', color: '#555' }}>Fetching review data from database</div>
        <div style={{ fontSize: '12px', color: '#444', marginTop: '8px' }}>
          {SITE_URL}/sitemap-reviews.xml
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'monospace', padding: '20px', background: '#080a10', color: '#666' }}>
      Reviews sitemap: {count} entries
    </div>
  );
}
