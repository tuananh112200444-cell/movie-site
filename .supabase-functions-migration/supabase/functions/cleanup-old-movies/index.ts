import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
/**
 * Cleanup Old Movies — xoá phim không có lượt xem sau 30 ngày
 * Giữ DB dưới 500MB bằng cách dọn dẹp phim không hoạt động.
 */ serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS
    });
  }
  // Only accept POST or GET with admin-like secret
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret') || req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (expectedSecret && secret !== expectedSecret) {
    return new Response(JSON.stringify({
      error: 'Unauthorized'
    }), {
      status: 401,
      headers: {
        ...CORS,
        'Content-Type': 'application/json'
      }
    });
  }
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString();
    // 1. Find movies with watch_count = 0 AND last_watched_at IS NULL AND created_at < 30 days ago
    const { data: staleMovies, error: fetchError } = await supabase.from('movies').select('id, slug, name, created_at').eq('watch_count', 0).is('last_watched_at', null).lt('created_at', cutoff).limit(500);
    if (fetchError) throw fetchError;
    if (!staleMovies || staleMovies.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        deleted: 0,
        message: 'Không có phim nào cần xoá'
      }), {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/json'
        }
      });
    }
    const idsToDelete = staleMovies.map((m)=>m.id);
    // 2. Delete episodes first (FK cascade should handle, but explicit is safer)
    const { error: epDeleteError } = await supabase.from('episodes').delete().in('movie_id', idsToDelete);
    if (epDeleteError) {
      console.error('[cleanup] Episodes delete error:', epDeleteError);
    }
    // 3. Delete external_sources references
    const slugs = staleMovies.map((m)=>m.slug);
    const { error: srcDeleteError } = await supabase.from('external_sources').delete().in('slug', slugs);
    if (srcDeleteError) {
      console.error('[cleanup] External sources delete error:', srcDeleteError);
    }
    // 4. Delete movies
    const { error: movieDeleteError } = await supabase.from('movies').delete().in('id', idsToDelete);
    if (movieDeleteError) throw movieDeleteError;
    // 5. Log cleanup stats
    const deletedCount = staleMovies.length;
    console.log(`[cleanup] Deleted ${deletedCount} stale movies and their episodes`);
    return new Response(JSON.stringify({
      success: true,
      deleted: deletedCount,
      slugs: slugs.slice(0, 20),
      message: `Đã xoá ${deletedCount} phim không có lượt xem sau 30 ngày`
    }), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    console.error('[cleanup] Error:', e);
    return new Response(JSON.stringify({
      error: String(e)
    }), {
      status: 500,
      headers: {
        ...CORS,
        'Content-Type': 'application/json'
      }
    });
  }
});
