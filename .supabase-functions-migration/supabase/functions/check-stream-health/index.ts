import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const HEAD_TIMEOUT_MS = 8000;
const BATCH_SIZE = 30;
// Domains that serve JSON/API, not video streams — skip HEAD check
const API_ONLY_DOMAINS = [
  "kisskh.do",
  "kisskh.co",
  "kisskh.me",
  "kisskh.net"
];
function isApiOnlyStream(url) {
  try {
    const { hostname } = new URL(url);
    return API_ONLY_DOMAINS.some((d)=>hostname === d || hostname.endsWith(`.${d}`));
  } catch  {
    return false;
  }
}
// Streams from these sources are considered always-active (proxy resolves them)
const PROXY_SOURCES = [
  "kisskh"
];
async function checkUrlHealth(url) {
  const start = Date.now();
  // Skip HEAD for API-only domains — they serve JSON, not video
  if (isApiOnlyStream(url)) {
    return {
      ok: true,
      timeMs: 0,
      code: 200
    };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), HEAD_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "*/*"
      },
      redirect: "follow"
    });
    clearTimeout(timer);
    const timeMs = Date.now() - start;
    if (res.ok || [
      200,
      206,
      301,
      302,
      307,
      308
    ].includes(res.status)) {
      return {
        ok: true,
        code: res.status,
        timeMs
      };
    }
    return {
      ok: false,
      code: res.status,
      timeMs,
      error: `HTTP ${res.status}`
    };
  } catch (err) {
    const timeMs = Date.now() - start;
    return {
      ok: false,
      timeMs,
      error: err.name === "AbortError" ? "Timeout" : err.message
    };
  }
}
export default async function handler(req) {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({
      error: "Method not allowed"
    }), {
      status: 405,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results = {
    checked: 0,
    healthy: 0,
    dead: 0,
    skipped_api: 0,
    unpublished: 0,
    errors: 0,
    details: []
  };
  try {
    // 1. Fetch active streams in batches
    let offset = 0;
    let hasMore = true;
    while(hasMore){
      const { data: streams, error } = await supabase.from("streams").select("id, movie_id, stream_url, embed_url, source, server_name").eq("is_active", true).range(offset, offset + BATCH_SIZE - 1);
      if (error) {
        results.errors++;
        results.details.push(`Fetch error: ${error.message}`);
        break;
      }
      if (!streams || streams.length === 0) {
        hasMore = false;
        break;
      }
      for (const stream of streams){
        // Skip proxy-based sources — they resolve URLs on-demand
        if (PROXY_SOURCES.includes(stream.source ?? "")) {
          results.skipped_api++;
          continue;
        }
        const urlToCheck = stream.stream_url || stream.embed_url;
        if (!urlToCheck) {
          results.dead++;
          await supabase.from("streams").update({
            is_active: false
          }).eq("id", stream.id);
          continue;
        }
        // Skip API-only domains
        if (isApiOnlyStream(urlToCheck)) {
          results.skipped_api++;
          continue;
        }
        const health = await checkUrlHealth(urlToCheck);
        results.checked++;
        // Log the check
        await supabase.from("stream_health_logs").insert({
          stream_id: stream.id,
          movie_id: stream.movie_id,
          checked_at: new Date().toISOString(),
          status: health.ok ? "healthy" : "dead",
          http_code: health.code ?? null,
          response_time_ms: health.timeMs,
          error_message: health.error ?? "",
          is_reachable: health.ok
        }).catch(()=>{}); // Non-critical
        if (health.ok) {
          results.healthy++;
        } else {
          results.dead++;
          await supabase.from("streams").update({
            is_active: false,
            updated_at: new Date().toISOString()
          }).eq("id", stream.id);
          results.details.push(`DEAD ${stream.source} ${stream.server_name}: ${urlToCheck.slice(0, 80)} (${health.error})`);
        }
      }
      offset += BATCH_SIZE;
      if (streams.length < BATCH_SIZE) hasMore = false;
    }
    // 2. Only unpublish movies with ZERO active streams AND ZERO episodes
    // This prevents unpublishing KissKH movies whose streams resolve via proxy
    const { data: moviesToCheck } = await supabase.from("movies").select("id, slug, name, is_published").eq("is_published", true).eq("source_site", "ophim1.com") // Only check OPhim movies for unpublishing
    .order("updated_at", {
      ascending: false
    }).limit(100);
    for (const movie of moviesToCheck ?? []){
      const { count: activeCount } = await supabase.from("streams").select("id", {
        count: "exact",
        head: true
      }).eq("movie_id", movie.id).eq("is_active", true);
      const { count: episodeCount } = await supabase.from("episodes").select("id", {
        count: "exact",
        head: true
      }).eq("movie_id", movie.id);
      // Only unpublish if no active streams AND no episodes at all
      if ((activeCount ?? 0) === 0 && (episodeCount ?? 0) === 0) {
        await supabase.from("movies").update({
          is_published: false,
          updated_at: new Date().toISOString()
        }).eq("id", movie.id);
        results.unpublished++;
        results.details.push(`UNPUBLISHED ${movie.slug}: no streams and no episodes`);
      }
    }
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message,
      ...results
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
}
