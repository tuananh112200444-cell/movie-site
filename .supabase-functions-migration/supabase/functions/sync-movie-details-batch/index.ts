import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
async function fetchDetail(base, slug) {
  try {
    const url = `${base.replace(/\/$/, "")}/phim/${slug}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return {
      ok: false,
      text: await res.text().catch(()=>""),
      url,
      servers: []
    };
    const data = await res.json();
    const servers = [];
    const epMap = new Map();
    const sList = data?.episodes || data?.data?.episodes || data?.server_data || data?.data?.server_data || [];
    for (const s of sList){
      const serverName = s.server_name || s.server_name || "Vietsub #1";
      const items = (s.items || []).map((e)=>{
        const slug = e.slug || e.filename || e.name || `tap-${e.name || "1"}`;
        return {
          name: e.name || "Tập 1",
          slug,
          link_m3u8: e.link_m3u8 || "",
          link_embed: e.link_embed || ""
        };
      });
      servers.push({
        server_name: serverName,
        server_data: items
      });
      for (const e of items){
        if (e.link_m3u8) epMap.set(e.slug, {
          movieSlug: slug,
          server: serverName,
          link_m3u8: e.link_m3u8,
          link_embed: e.link_embed || ""
        });
      }
    }
    return {
      ok: true,
      servers,
      epMap,
      url
    };
  } catch (e) {
    return {
      ok: false,
      text: e.message || String(e),
      url: `${base}/phim/${slug}`,
      servers: []
    };
  }
}
function getBaseDomain(base) {
  try {
    return new URL(base).hostname;
  } catch  {
    return base;
  }
}
async function writeLog(supabase, opts) {
  try {
    await supabase.from("sync_logs").insert({
      function_name: opts.functionName,
      run_at: new Date().toISOString(),
      scanned: opts.scanned,
      added: opts.added,
      updated: opts.updated,
      skipped: 0,
      deduped: 0,
      errors: opts.errors,
      details: opts.log.map((l)=>JSON.stringify(l)),
      elapsed_ms: opts.elapsedMs,
      success: opts.success
    });
  } catch (e) {
    console.error("Log insert failed:", e.message || String(e));
  }
}
export default async function handler(req) {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({
      ok: false,
      error: "Missing SUPABASE_SERVICE_ROLE_KEY"
    }), {
      status: 500
    });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const start = Date.now();
  const log = [];
  let totalEpisodes = 0;
  let totalStreams = 0;
  let totalErrors = 0;
  const { data: movies, error: moviesErr } = await supabase.from("movies").select("slug,id").order("created_at", {
    ascending: false
  }).limit(10);
  if (moviesErr) {
    const elapsed = Date.now() - start;
    const result = {
      ok: false,
      error: moviesErr.message,
      durationMs: elapsed
    };
    await writeLog(supabase, {
      functionName: "sync-movie-details-batch",
      scanned: 0,
      added: 0,
      updated: 0,
      errors: 1,
      log: [
        {
          error: moviesErr.message
        }
      ],
      elapsedMs: elapsed,
      success: false
    });
    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 500
    });
  }
  if (!movies?.length) {
    const elapsed = Date.now() - start;
    const result = {
      ok: true,
      note: "No movies to process",
      durationMs: elapsed
    };
    await writeLog(supabase, {
      functionName: "sync-movie-details-batch",
      scanned: 0,
      added: 0,
      updated: 0,
      errors: 0,
      log: [
        {
          note: "No movies to process"
        }
      ],
      elapsedMs: elapsed,
      success: true
    });
    return new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  const bases = [
    "https://ophim1.com",
    "https://phimapi.com",
    "https://phim.nguonc.com/api"
  ];
  for (const movie of movies){
    let success = false;
    for (const base of bases){
      const detail = await fetchDetail(base, movie.slug);
      log.push({
        slug: movie.slug,
        source: base,
        ok: detail.ok,
        error: detail.ok ? null : detail.text
      });
      if (!detail.ok || !detail.servers.length) {
        if (!detail.ok) totalErrors++;
        continue;
      }
      const episodeRows = detail.servers.map((s)=>({
          movie_id: movie.id,
          server_name: s.server_name || "Vietsub #1",
          server_data: s.server_data
        }));
      if (episodeRows.length) {
        const { error: epErr } = await supabase.from("episodes").upsert(episodeRows, {
          onConflict: "movie_id,server_name"
        });
        log.push({
          slug: movie.slug,
          table: "episodes",
          error: epErr?.message || null,
          count: episodeRows.length
        });
        if (epErr) totalErrors++;
        else totalEpisodes += episodeRows.length;
      }
      const streams = [];
      for (const s of detail.servers){
        const serverName = s.server_name || "Vietsub #1";
        const baseDomain = getBaseDomain(base);
        for (const e of s.server_data || []){
          if (e.link_m3u8) {
            streams.push({
              movie_id: movie.id,
              episode_slug: e.slug,
              source: baseDomain,
              server_name: serverName,
              stream_url: e.link_m3u8,
              embed_url: e.link_embed || "",
              priority: 0,
              is_active: true,
              updated_at: new Date().toISOString()
            });
          }
        }
      }
      if (streams.length) {
        const { error: stErr } = await supabase.from("streams").upsert(streams, {
          onConflict: "movie_id,episode_slug,source"
        });
        log.push({
          slug: movie.slug,
          table: "streams",
          error: stErr?.message || null,
          count: streams.length
        });
        if (stErr) totalErrors++;
        else totalStreams += streams.length;
      }
      success = true;
      break;
    }
    if (!success) {
      log.push({
        slug: movie.slug,
        note: "All sources failed or no episodes"
      });
      totalErrors++;
    }
  }
  const elapsed = Date.now() - start;
  const result = {
    ok: true,
    moviesProcessed: movies.length,
    episodesSynced: totalEpisodes,
    streamsSynced: totalStreams,
    durationMs: elapsed,
    log
  };
  await writeLog(supabase, {
    functionName: "sync-movie-details-batch",
    scanned: movies.length,
    added: totalEpisodes,
    updated: totalStreams,
    errors: totalErrors,
    log,
    elapsedMs: elapsed,
    success: true
  });
  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json"
    }
  });
}
