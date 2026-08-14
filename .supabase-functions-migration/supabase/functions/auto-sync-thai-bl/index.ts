import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPHIM_API = "https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat";
const OPHIM_DETAIL = (slug)=>`https://ophim1.com/phim/${slug}`;
const THAI_KEYWORDS = [
  "thai",
  "thái",
  "thailand"
];
const BL_TAGS = [
  "bl",
  "boys love",
  "boyslove",
  "boylove",
  "gay",
  "đam mỹ",
  "nam x nam"
];
const GL_TAGS = [
  "gl",
  "girls love",
  "girlslove",
  "girllove",
  "lesbian",
  "bách hợp",
  "nữ x nữ"
];
function isThai(countries) {
  return countries.some((c)=>THAI_KEYWORDS.some((kw)=>(c.name ?? "").toLowerCase().includes(kw) || (c.slug ?? "").toLowerCase().includes(kw)));
}
function detectBlGlType(categories, name, originName) {
  const allText = `${name} ${originName}`.toLowerCase();
  const catText = categories.map((c)=>`${c.name ?? ""} ${c.slug ?? ""}`).join(" ").toLowerCase();
  const isBl = BL_TAGS.some((tag)=>allText.includes(tag) || catText.includes(tag));
  const isGl = GL_TAGS.some((tag)=>allText.includes(tag) || catText.includes(tag));
  if (isBl) return "thai_bl";
  if (isGl) return "thai_gl";
  return null;
}
function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs);
  return fetch(url, {
    signal: controller.signal
  }).finally(()=>clearTimeout(timer));
}
async function fetchPhimMoi(page = 1) {
  const res = await fetchWithTimeout(`${OPHIM_API}?page=${page}`, 15000);
  if (!res.ok) throw new Error(`List API HTTP ${res.status}`);
  const json = await res.json();
  const items = json.data?.items ?? json.items ?? [];
  return Array.isArray(items) ? items : [];
}
async function fetchDetail(slug) {
  const res = await fetchWithTimeout(OPHIM_DETAIL(slug), 15000);
  if (!res.ok) throw new Error(`Detail API HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
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
    scanned: 0,
    added: 0,
    skipped: 0,
    errors: 0,
    details: []
  };
  try {
    const movies = await fetchPhimMoi(1);
    results.scanned = movies.length;
    for (const item of movies){
      try {
        const countries = item.country ?? [];
        if (!isThai(countries)) {
          results.skipped++;
          continue;
        }
        const categories = item.category ?? [];
        const blType = detectBlGlType(categories, item.name ?? "", item.origin_name ?? "");
        if (!blType) {
          results.skipped++;
          continue;
        }
        const sourceSlug = item.slug;
        const { data: existing } = await supabase.from("thai_bl_movies").select("id").eq("source_slug", sourceSlug).maybeSingle();
        if (existing) {
          results.skipped++;
          continue;
        }
        const detail = await fetchDetail(sourceSlug);
        const movie = detail.movie ?? detail ?? {};
        const episodes = detail.episodes ?? [];
        const { data: inserted, error: insertErr } = await supabase.from("thai_bl_movies").insert({
          slug: item.slug,
          name: item.name ?? movie.name ?? "",
          origin_name: item.origin_name ?? movie.origin_name ?? "",
          content: movie.content ?? "",
          type: blType,
          status: movie.status ?? "",
          thumb_url: item.thumb_url ?? movie.thumb_url ?? "",
          poster_url: item.poster_url ?? movie.poster_url ?? "",
          quality: item.quality ?? movie.quality ?? "",
          lang: item.lang ?? movie.lang ?? "",
          time: movie.time ?? "",
          episode_current: item.episode_current ?? movie.episode_current ?? "",
          episode_total: movie.episode_total ?? "",
          year: typeof item.year === "number" ? item.year : typeof movie.year === "number" ? movie.year : parseInt(item.year ?? movie.year ?? "0", 10) || null,
          actor: movie.actor ?? [],
          director: movie.director ?? [],
          category: categories,
          country: countries,
          trailer_url: movie.trailer_url ?? "",
          source_site: "ophim1.com",
          source_slug: sourceSlug,
          is_active: true
        }).select("id").single();
        if (insertErr) {
          results.errors++;
          results.details.push(`Insert err ${sourceSlug}: ${insertErr.message}`);
          continue;
        }
        if (episodes.length > 0) {
          const epsPayload = episodes.map((ep)=>({
              movie_id: inserted.id,
              server_name: ep.server_name ?? "Server 1",
              server_data: Array.isArray(ep.server_data) ? ep.server_data : []
            }));
          const { error: epsErr } = await supabase.from("thai_bl_episodes").insert(epsPayload);
          if (epsErr) results.details.push(`Eps err ${sourceSlug}: ${epsErr.message}`);
        }
        results.added++;
      } catch (err) {
        results.errors++;
        results.details.push(`Loop err: ${err.message}`);
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
