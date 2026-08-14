import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
/**
 * Movie Poster CDN — Supabase Storage Cache
 *
 * Cách B: Cache ảnh từ OPhim vào Supabase Storage.
 * Lần 1: download → upload → redirect 307 tới Storage public URL
 * Lần 2+: redirect 307 tới Storage public URL (instant, < 50ms)
 *
 * Input: ?path=/uploads/movies/xxx.jpg
 */ const BUCKET = 'movie-posters';
function getSupabaseClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}
async function ensureBucket(supabase) {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b)=>b.name === BUCKET);
    if (!exists) {
      await supabase.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: 5242880
      });
    }
  } catch  {
  // Bucket may already exist — ignore
  }
}
serve(async (req)=>{
  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  if (!path) {
    return new Response(JSON.stringify({
      error: 'Missing path param'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  const cleanPath = path.replace(/^\/uploads\/movies\//, '').replace(/^[\/]+/, '');
  const ophimUrl = `https://img.ophim.live/uploads/movies/${cleanPath}`;
  try {
    const supabase = getSupabaseClient();
    await ensureBucket(supabase);
    // 1. Check if file already exists in Storage
    const { data: fileData, error: dlErr } = await supabase.storage.from(BUCKET).download(cleanPath);
    if (!dlErr && fileData) {
      // File exists → redirect to public URL
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(cleanPath);
      return new Response(null, {
        status: 307,
        headers: {
          'Location': data.publicUrl,
          'Cache-Control': 'public, max-age=604800, s-maxage=604800',
          'X-Cache-Status': 'HIT',
          'X-CDN-By': 'supabase-storage',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    // 2. File not cached → download from OPhim
    const res = await fetch(ophimUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://ophim1.com/'
      }
    });
    if (!res.ok) {
      // Fallback to original if fetch fails
      return new Response(null, {
        status: 307,
        headers: {
          'Location': ophimUrl,
          'Cache-Control': 'public, max-age=3600',
          'X-Cache-Status': 'FALLBACK',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    const blob = await res.blob();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    // 3. Upload to Supabase Storage
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(cleanPath, blob, {
      contentType,
      upsert: true
    });
    if (upErr) {
      // Upload failed → fallback
      return new Response(null, {
        status: 307,
        headers: {
          'Location': ophimUrl,
          'Cache-Control': 'public, max-age=3600',
          'X-Cache-Status': 'UPLOAD_FAIL',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    // 4. Success → redirect to public URL
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(cleanPath);
    return new Response(null, {
      status: 307,
      headers: {
        'Location': data.publicUrl,
        'Cache-Control': 'public, max-age=604800, s-maxage=604800',
        'X-Cache-Status': 'MISS',
        'X-CDN-By': 'supabase-storage',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (e) {
    return new Response(null, {
      status: 307,
      headers: {
        'Location': ophimUrl,
        'Cache-Control': 'public, max-age=3600',
        'X-Cache-Status': 'ERROR',
        'X-Error': String(e).slice(0, 200),
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
});
