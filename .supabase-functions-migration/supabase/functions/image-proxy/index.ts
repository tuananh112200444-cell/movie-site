// Edge Function: image-proxy
// Tự động download ảnh từ OPhim CDN → cache vào Supabase Storage → trả về Storage CDN URL
// Nếu ảnh đã có trong Storage thì trả về ngay, không cần download lại
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
const OPHIM_IMAGE_DOMAINS = [
  "img.ophim.live",
  "img.phimapi.com",
  "phimimg.com",
  "img.nguonc.com"
];
function isValidOphimUrl(url) {
  try {
    const u = new URL(url);
    return OPHIM_IMAGE_DOMAINS.some((d)=>u.hostname === d);
  } catch  {
    return false;
  }
}
function getStoragePathFromUrl(url) {
  // img.ophim.live/uploads/movies/abc-thumb.jpg → movies/abc-thumb.jpg
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/^\//, "");
    if (path.startsWith("uploads/")) {
      path = path.slice("uploads/".length);
    }
    // Remove query params, keep clean path
    return path;
  } catch  {
    return "";
  }
}
// Supabase client from edge function runtime
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});
Deno.serve(async (req)=>{
  const origin = req.headers.get("origin") || "*";
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400"
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
        "Access-Control-Allow-Origin": origin
      }
    });
  }
  let body;
  try {
    body = await req.json();
  } catch  {
    return new Response(JSON.stringify({
      error: "Invalid JSON"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin
      }
    });
  }
  const { url: ophimUrl, width = 200, quality = 15 } = body;
  if (!ophimUrl || !isValidOphimUrl(ophimUrl)) {
    return new Response(JSON.stringify({
      error: "Invalid or missing OPhim image URL",
      url: ophimUrl
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin
      }
    });
  }
  const storagePath = getStoragePathFromUrl(ophimUrl);
  if (!storagePath) {
    return new Response(JSON.stringify({
      error: "Could not derive storage path from URL"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin
      }
    });
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/posters/${storagePath}`;
  // ── 1. Check if image already exists in Storage by HEAD request ──
  try {
    const headRes = await fetch(publicUrl, {
      method: "HEAD"
    });
    if (headRes.ok || headRes.status === 200) {
      return new Response(JSON.stringify({
        success: true,
        cached: true,
        url: publicUrl,
        storagePath
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
          "Cache-Control": "public, max-age=86400"
        }
      });
    }
  } catch  {
  // Continue to download
  }
  // ── 2. Download from OPhim ──
  let imageBlob;
  let contentType;
  try {
    const fetchRes = await fetch(ophimUrl, {
      method: "GET",
      headers: {
        "Accept": "image/webp,image/avif,image/apng,image/png,image/jpeg,*/*",
        "Referer": ""
      },
      redirect: "follow"
    });
    if (!fetchRes.ok) {
      return new Response(JSON.stringify({
        error: `OPhim fetch failed: ${fetchRes.status}`
      }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin
        }
      });
    }
    imageBlob = await fetchRes.blob();
    contentType = fetchRes.headers.get("content-type") || "image/jpeg";
    if (imageBlob.size < 100) {
      return new Response(JSON.stringify({
        error: "OPhim returned empty/invalid image"
      }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin
        }
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({
      error: "Failed to download from OPhim",
      details: String(e)
    }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin
      }
    });
  }
  // ── 3. Upload to Supabase Storage ──
  const { error: uploadError } = await supabase.storage.from("posters").upload(storagePath, imageBlob, {
    contentType,
    upsert: true
  });
  if (uploadError) {
    return new Response(JSON.stringify({
      error: "Storage upload failed",
      details: uploadError.message
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin
      }
    });
  }
  return new Response(JSON.stringify({
    success: true,
    cached: false,
    url: publicUrl,
    storagePath,
    size: imageBlob.size,
    contentType
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Cache-Control": "public, max-age=86400"
    }
  });
});
