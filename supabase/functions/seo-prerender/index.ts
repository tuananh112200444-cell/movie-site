import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// This function has been deprecated.
// All SEO prerendering is now handled directly by the Netlify Edge Function (bot-prerender.ts).
// This Supabase function is no longer used in the bot crawl pipeline.

serve(async (_req: Request) => {
  return new Response(
    JSON.stringify({
      status: 'deprecated',
      message: 'This function is no longer active. SEO prerendering is now handled by Netlify Edge Function.',
    }),
    {
      status: 410,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
});
