import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
export default async function handler(req) {
  if (req.method !== "POST" && req.method !== "GET" && req.method !== "DELETE") {
    return new Response(JSON.stringify({
      error: "Method not allowed"
    }), {
      status: 405
    });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  const hoursParam = url.searchParams.get("hours");
  const hours = hoursParam ? parseInt(hoursParam, 10) : 24;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { error, count } = await supabase.from("movie_api_cache").delete({
    count: "exact"
  }).lt("expires_at", cutoff);
  return new Response(JSON.stringify({
    success: !error,
    deleted: count ?? 0,
    error: error?.message ?? null,
    cutoff
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
