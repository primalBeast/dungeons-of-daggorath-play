/**
 * Upload repository contents to GitHub using the Git Data API.
 * Requires GITHUB_TOKEN (classic PAT with repo scope) in the environment.
 *
 * Usage (PowerShell):
 *   $env:GITHUB_TOKEN = '<pat>'
 *   node scripts/upload-via-github-api.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const OWNER = 'primalBeast';
const REPO = 'dungeons-of-daggorath';
const BRANCH = 'main';
const SKIP = new Set(['.git', 'node_modules', 'terminals', 'mcps', 'research', '.push-batches']);
const TEXT_EXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.md', '.yml', '.yaml']);
const BIN_EXT = /\.(png|jpe?g|gif|wav)$/i;

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('Missing GITHUB_TOKEN. Create a classic PAT with repo scope at https://github.com/settings/tokens');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 500)}`);
  return data;
}

const files = walk(ROOT)
  .filter((abs) => !abs.endsWith('upload-via-github-api.mjs') && !abs.endsWith('push-to-github.mjs') && !abs.endsWith('prepare-push-batches.mjs'))
  .map((abs) => {
    const path = relative(ROOT, abs).replace(/\\/g, '/');
    const ext = path.includes('.') ? path.slice(path.lastIndexOf('.')) : '';
    const buf = readFileSync(abs);
    const isText = TEXT_EXT.has(ext) || path.endsWith('.nojekyll') || path === '.gitignore';
    return {
      path,
      encoding: isText ? 'utf-8' : 'base64',
      content: isText ? buf.toString('utf8') : buf.toString('base64'),
    };
  });

console.log('uploading', files.length, 'files...');

const blobs = [];
for (const file of files) {
  const blob = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: file.content, encoding: file.encoding }),
  });
  blobs.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  process.stdout.write('.');
}

const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tree: blobs }),
});

let parentSha = null;
try {
  const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  parentSha = ref.object.sha;
} catch {
  parentSha = null;
}

const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Initial commit: Dungeons of Daggorath browser remake with GitHub Pages',
    tree: tree.sha,
    ...(parentSha ? { parents: [parentSha] } : {}),
  }),
});

if (parentSha) {
  await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commit.sha, force: true }),
  });
} else {
  await gh(`/repos/${OWNER}/${REPO}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: commit.sha }),
  });
}

console.log('\nPushed', commit.sha);
console.log(`https://github.com/${OWNER}/${REPO}`);