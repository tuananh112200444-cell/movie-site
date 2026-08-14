const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
async function invokeFunction(name) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      }
    });
    return {
      ok: res.ok,
      status: res.status,
      text: await res.text()
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      text: err.message || String(err)
    };
  }
}
export default async function handler(req) {
  // Optional secret key validation
  const url = new URL(req.url);
  const secret = url.searchParams.get("key");
  const expected = Deno.env.get("SYNC_SECRET_KEY");
  if (expected && secret !== expected) {
    return new Response(JSON.stringify({
      error: "Unauthorized"
    }), {
      status: 401
    });
  }
  const start = Date.now();
  // Run both sync functions in parallel
  const [syncList, syncDetail] = await Promise.all([
    invokeFunction("daily-sync-new-movies"),
    invokeFunction("sync-movie-details-batch")
  ]);
  return new Response(JSON.stringify({
    ok: true,
    elapsedMs: Date.now() - start,
    syncList,
    syncDetail,
    timestamp: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
