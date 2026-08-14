import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
async function withTimeout(promise, timeoutMs, fallback) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((resolve)=>{
        timer = setTimeout(()=>resolve(fallback), timeoutMs);
      })
    ]);
  } finally{
    if (timer !== undefined) clearTimeout(timer);
  }
}
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Method not allowed"
    }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  }
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    let body = {};
    try {
      body = await req.json();
    } catch  {
    // ignore parse errors, use empty body
    }
    const { url, page_path, user_agent } = body;
    if (!url) {
      return new Response(JSON.stringify({
        success: true,
        skipped: true
      }), {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    }
    const { error } = await withTimeout(supabase.from("banner_clicks").insert({
      url,
      page_path: page_path || "/",
      user_agent: (user_agent || "").slice(0, 250)
    }), 700, {
      error: {
        message: "banner click insert timeout"
      }
    });
    if (error) {
      return new Response(JSON.stringify({
        success: true,
        queued: false
      }), {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS
        }
      });
    }
    return new Response(JSON.stringify({
      success: true
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({
      success: true,
      queued: false,
      warning: msg
    }), {
      status: 202,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS
      }
    });
  }
});
