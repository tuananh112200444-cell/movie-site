import fs from 'node:fs';

function loadEnvFile(path = '.env') {
  if (!fs.existsSync(path)) return {};
  const env = {};
  const text = fs.readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
  return env;
}

const env = { ...loadEnvFile(), ...process.env };
const supabaseUrl = env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error('Missing VITE_PUBLIC_SUPABASE_URL or VITE_PUBLIC_SUPABASE_ANON_KEY');
}

const marker = `diagnostics-regression-${Date.now()}`;
const response = await fetch(`${supabaseUrl}/rest/v1/player_error_events`, {
  method: 'POST',
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  },
  body: JSON.stringify({
    event_type: 'diagnostics_regression',
    movie_slug: 'diagnostics-test',
    movie_title: 'Diagnostics Regression Test',
    episode_slug: 'tap-1',
    episode_name: 'Tap 1',
    server_name: 'Regression',
    player_mode: 'test',
    source_host: 'localhost',
    playback_time: 12,
    duration: 120,
    buffered_ahead: 4,
    error_message: marker,
    user_agent: 'diagnostics-regression',
    page_url: 'https://khophim.org/__diagnostics_regression__',
    connection_type: 'test',
    effective_type: '4g',
    downlink: 10,
    device_memory: 8,
    hardware_concurrency: 8,
    viewport_width: 1280,
    viewport_height: 720,
    visibility_state: 'visible',
  }),
});

const body = await response.text();
if (!response.ok) {
  throw new Error(`Diagnostics insert failed: HTTP ${response.status} ${body}`);
}

console.log(JSON.stringify({ ok: true, status: response.status, marker }, null, 2));
