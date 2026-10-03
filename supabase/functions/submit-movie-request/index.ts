import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set([
  'https://khophim.org',
  'https://www.khophim.org',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:4182',
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://khophim.org',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  try {
    const body = await request.json();
    const requestType = String(body.request_type || '').trim();
    const movieName = String(body.movie_name || '').trim();
    const movieUrl = String(body.movie_url || '').trim().slice(0, 500);
    const details = String(body.details || '').trim().slice(0, 1000);
    const contact = String(body.contact || '').trim().slice(0, 180);
    if (!['movie', 'missing_episode', 'source'].includes(requestType)) return json(request, { error: 'Loại yêu cầu không hợp lệ.' }, 400);
    if (movieName.length < 2 || movieName.length > 180) return json(request, { error: 'Tên phim cần từ 2 đến 180 ký tự.' }, 400);
    if (movieUrl && !/^https?:\/\//i.test(movieUrl)) return json(request, { error: 'URL phim không hợp lệ.' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: authData } = token ? await service.auth.getUser(token) : { data: { user: null } };
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || 'unknown';
    const salt = Deno.env.get('REQUEST_HASH_SALT') || serviceKey.slice(0, 32);
    const requesterHash = await sha256(`${salt}:${authData.user?.id || forwarded}`);

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await service
      .from('movie_requests')
      .select('id', { count: 'exact', head: true })
      .eq('requester_hash', requesterHash)
      .gte('created_at', since);
    if ((count || 0) >= 5) return json(request, { error: 'Bạn đã gửi nhiều yêu cầu. Vui lòng thử lại sau một giờ.' }, 429);

    const { data, error } = await service.from('movie_requests').insert({
      user_id: authData.user?.id || null,
      request_type: requestType,
      movie_name: movieName,
      movie_url: movieUrl || null,
      details: details || null,
      contact: contact || null,
      requester_hash: requesterHash,
    }).select('id,created_at').single();
    if (error) throw error;
    return json(request, { success: true, request: data }, 201);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : 'Không thể gửi yêu cầu.' }, 500);
  }
});
