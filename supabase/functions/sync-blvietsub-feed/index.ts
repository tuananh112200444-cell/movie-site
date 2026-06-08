import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FEED_URL = 'https://www.blvietsub.top/feeds/posts/default';
const SOURCE_SITE = 'blvietsub';
const SOURCE_NAME = 'BLVietsub';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SupabaseClient = ReturnType<typeof createClient>;

interface BloggerEntry {
  title?: { $t?: string };
  content?: { $t?: string };
  summary?: { $t?: string };
  published?: { $t?: string };
  updated?: { $t?: string };
  category?: Array<{ term?: string }>;
  link?: Array<{ rel?: string; href?: string }>;
}

interface ParsedEpisode {
  serverName: string;
  episodeNumber: number;
  episodeName: string;
  slug: string;
  linkEmbed: string;
  linkM3u8: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function slugify(value: string): string {
  const cleaned = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'phim';
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(html: string): string {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim(),
  );
}

function textBetween(html: string, pattern: RegExp): string {
  const match = pattern.exec(html);
  return match ? stripTags(match[1] || '') : '';
}

function firstMatch(html: string, pattern: RegExp): string {
  return pattern.exec(html)?.[1] || '';
}

function getAlternateLink(entry: BloggerEntry): string {
  return entry.link?.find((link) => link.rel === 'alternate')?.href || '';
}

function getBlogSlug(sourceUrl: string, title: string): string {
  try {
    const last = new URL(sourceUrl).pathname.split('/').filter(Boolean).pop() || '';
    return last.replace(/\.html$/i, '') || slugify(title);
  } catch {
    return slugify(title);
  }
}

function normalizeImage(url: string): string {
  return url.replace(/\/s\d+\//, '/s640/');
}
