/**
 * Enable GitHub Pages on a repo via REST API.
 * Uses GITHUB_TOKEN or git credential fill.
 */
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

function getGitToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const proc = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    cwd: ROOT,
  });
  const creds = {};
  for (const line of (proc.stdout || '').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) creds[line.slice(0, i)] = line.slice(i + 1);
  }
  return creds.password || creds.username || null;
}

const token = getGitToken();
if (!token) {
  console.error('No GitHub token available');
  process.exit(2);
}

const owner = process.argv[2] || 'primalBeast';
const repo = process.argv[3] || 'dungeons-of-daggorath-play';
const buildType = process.argv[4] || 'workflow';

async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { ok: res.ok, status: res.status, data, text };
}

async function main() {
  const existing = await gh(`/repos/${owner}/${repo}/pages`);
  if (existing.ok) {
    console.log(`Pages already enabled: ${existing.data.html_url || existing.data.status}`);
    console.log(`Build type: ${existing.data.build_type}`);
    return;
  }

  if (existing.status !== 404) {
    console.error(`GET pages failed: ${existing.status} ${existing.text}`);
    process.exit(1);
  }

  const created = await gh(`/repos/${owner}/${repo}/pages`, {
    method: 'POST',
    body: JSON.stringify({ build_type: buildType }),
  });

  if (!created.ok) {
    console.error(`Create pages failed: ${created.status} ${created.text}`);
    process.exit(1);
  }

  console.log(`Pages enabled (${buildType})`);
  console.log(`URL: ${created.data.html_url || `https://${owner.toLowerCase()}.github.io/${repo}/`}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});