import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

const files = [...new Set([...tracked, ...untracked])].filter((file) => {
  return !/^node_modules\//.test(file) &&
    !/^out\//.test(file) &&
    !/^dist\//.test(file) &&
    !/^\.git\//.test(file) &&
    !/^tmp_/.test(file) &&
    !/\.br$|\.gz$|\.png$|\.jpe?g$|\.gif$|\.webp$|\.ico$|\.mp4$|\.zip$/i.test(file);
});

const trackedForbiddenFiles = new Set(['.env', '.env.local', 'tools/video-pipeline/config.json']);
const secretPatterns = [
  { name: 'Cloudflare API token', re: /\bcf(?:at|ut)_[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Supabase access token', re: /\bsbp_[A-Za-z0-9_-]{20,}\b/ },
  { name: 'GitHub token', re: /\b(?:github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]{20,})\b/ },
  { name: 'KhoPhim cron secret', re: /\bkp-sync-[a-f0-9]{32,}\b/i },
  { name: 'Google service account private key JSON', re: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/ },
];

const findings = [];

for (const file of tracked) {
  if (trackedForbiddenFiles.has(file)) {
    findings.push({ file, name: 'Forbidden tracked local secret/config file', line: 1 });
  }
}

for (const file of files) {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const lines = text.split(/\r?\n/);
  lines.forEach((lineText, index) => {
    for (const pattern of secretPatterns) {
      if (pattern.re.test(lineText)) {
        findings.push({ file, name: pattern.name, line: index + 1 });
      }
    }
  });
}

if (findings.length > 0) {
  console.error('Security secret audit failed:');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.name}`);
  }
  process.exit(1);
}

console.log(`Security secret audit passed. Checked ${files.length} files.`);
