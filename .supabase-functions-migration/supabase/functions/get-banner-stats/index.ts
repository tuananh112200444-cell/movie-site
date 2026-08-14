import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Method not allowed"
    }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    let body = {};
    try {
      body = await req.json();
    } catch  {
    // ignore
    }
    const range = typeof body.range === "string" ? body.range : "all";
    const days = range === "all" ? null : parseInt(range, 10);
    let cutoff = null;
    if (days && !isNaN(days)) {
      const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      cutoff = d.toISOString();
    }
    const baseColumns = "id, url, page_path, user_agent, clicked_at, fingerprint";
    const buildCountQuery = (table)=>{
      let q = supabase.from(table).select("*", {
        count: "exact",
        head: true
      });
      if (cutoff) {
        q = q.gte("clicked_at", cutoff);
      }
      return q;
    };
    const buildDetailQuery = (table)=>{
      let q = supabase.from(table).select(baseColumns).order("clicked_at", {
        ascending: false
      });
      if (cutoff) {
        q = q.gte("clicked_at", cutoff);
      }
      // No limit — let Supabase return all matching rows for this table
      return q;
    };
    const [entryCountRes, entryDetailRes, stickyCountRes, stickyDetailRes, legacyCountRes, legacyDetailRes] = await Promise.all([
      buildCountQuery("entry_banner_clicks"),
      buildDetailQuery("entry_banner_clicks"),
      buildCountQuery("sticky_banner_clicks"),
      buildDetailQuery("sticky_banner_clicks"),
      buildCountQuery("banner_clicks"),
      buildDetailQuery("banner_clicks")
    ]);
    const entryData = entryDetailRes.error ? [] : entryDetailRes.data ?? [];
    const stickyData = stickyDetailRes.error ? [] : stickyDetailRes.data ?? [];
    const legacyData = legacyDetailRes.error ? [] : legacyDetailRes.data ?? [];
    return new Response(JSON.stringify({
      entry: entryData,
      entryTotal: entryCountRes.count ?? 0,
      sticky: stickyData,
      stickyTotal: stickyCountRes.count ?? 0,
      legacy: legacyData,
      legacyTotal: legacyCountRes.count ?? 0,
      errors: {
        entry: entryDetailRes.error ? entryDetailRes.error.message : null,
        sticky: stickyDetailRes.error ? stickyDetailRes.error.message : null,
        legacy: legacyDetailRes.error ? legacyDetailRes.error.message : null
      }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({
      error: msg
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
});
