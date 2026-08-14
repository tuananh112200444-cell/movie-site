import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
function extractItems(json) {
  const candidates = [
    json?.items,
    json?.data?.items,
    json?.results,
    json?.data?.results,
    json?.movies,
    json?.data?.movies
  ];
  for (const c of candidates)if (Array.isArray(c) && c.length) return c;
  if (Array.isArray(json) && json.length) return json;
  if (json?.data && Array.isArray(json.data) && json.data.length) return json.data;
  return [];
}
function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  return fetch(url, {
    headers: {
      Accept: "application/json"
    },
    signal: controller.signal
  }).finally(()=>clearTimeout(timer));
}
async function fetchList(base, page = 1) {
  try {
    const u = new URL(base);
    u.searchParams.set("page", String(page));
    const res = await fetchWithTimeout(u.toString(), 10000);
    if (!res.ok) return {
      ok: false,
      text: await res.text().catch(()=>""),
      count: 0
    };
    const data = await res.json();
    const items = extractItems(data);
    return {
      ok: true,
      items,
      count: items.length
    };
  } catch (e) {
    if (e.name === "AbortError") return {
      ok: false,
      text: "Request timeout",
      count: 0
    };
    return {
      ok: false,
      text: e.message || String(e),
      count: 0
    };
  }
}
function looksLikeVietnamese(s) {
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(s || '');
}
function looksLikeEnglish(s) {
  return /^[a-zA-Z0-9\s'&:.,!\-–—()[\]]+$/i.test((s || '').trim());
}
function buildMovieInsert(m) {
  const year = Number(m.year || m.release_year || new Date().getFullYear());
  const viTitle = looksLikeVietnamese(m.name || '') ? m.name || '' : '';
  const enTitle = looksLikeEnglish(m.origin_name || '') ? m.origin_name || '' : looksLikeEnglish(m.name || '') && !viTitle ? m.name || '' : '';
  return {
    slug: m.slug,
    name: m.name || m.title || m.slug,
    year,
    type: m.type || "single",
    poster_url: m.poster_url || m.thumb_url || "",
    origin_name: m.origin_name || "",
    thumb_url: m.thumb_url || "",
    status: m.status || "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    title_vi: viTitle,
    title_en: enTitle,
    title_original: m.origin_name || m.name || ""
  };
}
async function writeLog(supabase, opts) {
  try {
    await supabase.from("sync_logs").insert({
      function_name: opts.functionName,
      run_at: new Date().toISOString(),
      scanned: opts.scanned,
      added: opts.added,
      updated: 0,
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
  const log = [
    {
      event: "start",
      ts: new Date().toISOString()
    }
  ];
  // Write start log immediately
  await writeLog(supabase, {
    functionName: "daily-sync-new-movies",
    scanned: 0,
    added: 0,
    errors: 0,
    log,
    elapsedMs: 0,
    success: true
  });
  let totalAdded = 0;
  let totalScanned = 0;
  let totalErrors = 0;
  const endpoints = [
    {
      url: "https://ophim1.com/danh-sach/phim-moi-cap-nhat",
      name: "OPhim",
      site: "ophim1.com"
    },
    {
      url: "https://phimapi.com/danh-sach/phim-moi-cap-nhat",
      name: "PhimAPI",
      site: "phimapi.com"
    }
  ];
  log.push({
    event: "fetch_begin",
    sources: endpoints.length
  });
  const results = await Promise.all(endpoints.map((ep)=>fetchList(ep.url, 1)));
  log.push({
    event: "fetch_done",
    results: results.map((r)=>({
        ok: r.ok,
        count: r.count
      }))
  });
  const allSlugs = new Set();
  for (const r of results){
    if (r.ok) (r.items || []).forEach((m)=>allSlugs.add(m.slug));
  }
  totalScanned = allSlugs.size;
  let existingSlugs = new Set();
  if (allSlugs.size > 0) {
    const { data: existingRows } = await supabase.from("movies").select("slug").in("slug", Array.from(allSlugs));
    existingSlugs = new Set((existingRows || []).map((r)=>r.slug));
  }
  for(let i = 0; i < endpoints.length; i++){
    const ep = endpoints[i];
    const r = results[i];
    if (!r.ok) {
      log.push({
        source: ep.name,
        error: r.text
      });
      totalErrors++;
      continue;
    }
    const newItems = (r.items || []).filter((m)=>!existingSlugs.has(m.slug));
    if (!newItems.length) {
      log.push({
        source: ep.name,
        note: "No new items",
        count: r.count
      });
      continue;
    }
    const toInsert = newItems.map(buildMovieInsert);
    const { data: inserted, error: insertErr } = await supabase.from("movies").upsert(toInsert, {
      onConflict: "slug",
      ignoreDuplicates: true
    }).select("id,slug");
    if (insertErr) {
      log.push({
        source: ep.name,
        table: "movies",
        error: insertErr.message
      });
      totalErrors++;
      continue;
    }
    const slugMap = new Map((inserted || []).map((r)=>[
        r.slug,
        r.id
      ]));
    const sources = newItems.filter((m)=>slugMap.has(m.slug)).map((m)=>({
        movie_id: slugMap.get(m.slug),
        source_name: ep.name,
        source_site: ep.site,
        source_slug: m.slug,
        source_movie_id: m.slug,
        source_url: `https://${ep.site}/${m.slug}`,
        status: "active",
        updated_at: new Date().toISOString()
      }));
    if (sources.length) {
      const { error: srcErr } = await supabase.from("movie_sources").upsert(sources, {
        onConflict: "movie_id,source_site,source_slug"
      });
      log.push({
        source: ep.name,
        table: "movie_sources",
        error: srcErr?.message || null,
        count: sources.length
      });
      if (srcErr) totalErrors++;
    }
    log.push({
      source: ep.name,
      table: "movies",
      inserted: (inserted || []).length
    });
    totalAdded += (inserted || []).length;
    for (const m of newItems)existingSlugs.add(m.slug);
  }
  const elapsed = Date.now() - start;
  const result = {
    ok: true,
    added: totalAdded,
    scanned: totalScanned,
    durationMs: elapsed,
    log
  };
  await writeLog(supabase, {
    functionName: "daily-sync-new-movies",
    scanned: totalScanned,
    added: totalAdded,
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
