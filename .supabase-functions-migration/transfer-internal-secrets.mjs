import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const source = "dzpddbthdeqbkrcjlzap";
const target = "ceoxbhsdodllziyxmbqr";
const workdir = "C:\\Users\\CPS\\Documents\\khophim-supabase-migration";

function run(args) {
  const result = spawnSync("npx.cmd", args, {
    cwd: workdir,
    encoding: "utf8",
    windowsHide: true,
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || result.error?.message || `supabase exited ${result.status}`);
  }
  return result.stdout;
}

const raw = run([
  "supabase", "db", "query", "--linked", "--output", "json",
  "select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET' limit 1;",
]);
const parsed = JSON.parse(raw);
const cronSecret = parsed.rows?.[0]?.decrypted_secret;
if (typeof cronSecret !== "string" || !/^[a-f0-9]{64}$/i.test(cronSecret)) {
  throw new Error("CRON_SECRET nguồn không đúng định dạng an toàn mong đợi");
}

run(["supabase", "link", "--project-ref", target]);
run([
  "supabase", "db", "query", "--linked",
  `select vault.create_secret('${cronSecret}', 'CRON_SECRET', 'KhoPhim internal scheduler secret');`,
]);

const adminSessionSecret = randomBytes(32).toString("hex");
const secrets = [
  `CRON_SECRET=${cronSecret}`,
  `BLVIETSUB_SYNC_SECRET=${cronSecret}`,
  `COBEPHIM_SYNC_SECRET=${cronSecret}`,
  `GLVIETSUB_SYNC_SECRET=${cronSecret}`,
  `MOTCHILL_SYNC_SECRET=${cronSecret}`,
  `ONLYFLIX_SYNC_SECRET=${cronSecret}`,
  `PLAYER_REPAIR_SECRET=${cronSecret}`,
  `STREAM_HEALTH_SECRET=${cronSecret}`,
  `TMDB_CATALOG_SECRET=${cronSecret}`,
  `MOVIE_DETAIL_PROXY_SECRET=${cronSecret}`,
  `ADMIN_SESSION_SECRET=${adminSessionSecret}`,
  "SITE_URL=https://khophim.org",
  "BLVIETSUB_FEED_URL=https://blvietsub.com/sitemap_index.xml",
  "BLVIETSUB_PROXY_URL=https://khophim.org/internal/blvietsub-proxy",
  "SCHEDULE_ALERT_LEAD_MINUTES=30",
  "SCHEDULE_ALERT_WINDOW_MINUTES=5",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL=khophim@khophim-501001.iam.gserviceaccount.com",
];
run(["supabase", "secrets", "set", "--project-ref", target, ...secrets]);
console.log(JSON.stringify({ ok: true, target, secretNames: secrets.map((item) => item.split("=", 1)[0]) }));
