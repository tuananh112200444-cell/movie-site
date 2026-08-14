import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
/**
 * Movie Poster Proxy — Cloudflare Edge Cache
 *
 * Cách A: Proxy ảnh từ img.ophim.live qua edge function,
 * kèm header Cache-Control để Cloudflare cache 7 ngày.
 *
 * Input: ?path=/uploads/movies/xxx.jpg  hoặc  ?url=https://img.ophim.live/...
 */ serve(async (req)=>{
  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  const rawUrl = url.searchParams.get('url');
  if (!path && !rawUrl) {
    return new Response(JSON.stringify({
      error: 'Missing path or url param'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  const targetUrl = rawUrl || (path?.startsWith('http') ? path : `https://img.ophim.live${path?.startsWith('/') ? '' : '/'}${path}`);
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://ophim1.com/'
      }
    });
    if (!res.ok) {
      return new Response(JSON.stringify({
        error: 'Image not found',
        status: res.status
      }), {
        status: res.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    const body = await res.arrayBuffer();
    const headers = new Headers(res.headers);
    // Strip unwanted headers
    headers.delete('set-cookie');
    headers.delete('server');
    headers.delete('x-powered-by');
    // Force CDN cache for 7 days at edge + 1 day in browser
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('X-Cache-Status', 'MISS');
    headers.set('X-Proxy-By', 'khophim-cdn');
    const ct = headers.get('content-type') || 'image/jpeg';
    if (!headers.has('content-type')) {
      headers.set('content-type', ct);
    }
    return new Response(body, {
      status: 200,
      headers
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch image',
      detail: String(e)
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
});
