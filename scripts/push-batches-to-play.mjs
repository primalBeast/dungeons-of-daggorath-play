/**
 * Push .push-batches/*.json to dungeons-of-daggorath-play via GitHub Git Data API.
 * Mirrors grok_com_github push_files behavior for large batch payloads.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const BATCH_DIR = join(ROOT, '.push-batches');
const OWNER = 'primalBeast';
const REPO = 'dungeons-of-daggorath-play';
const BRANCH = 'main';

const README = `# Dungeons of Daggorath — Play

Browser remake of the classic TRS-80 dungeon crawler.

**Play:** https://primalbeast.github.io/dungeons-of-daggorath-play/

Source code is maintained in the private repo [dungeons-of-daggorath](https://github.com/primalBeast/dungeons-of-daggorath).
`;

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
  console.error('No GitHub token. Set GITHUB_TOKEN or configure git credentials.');
  process.exit(2);
}

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
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 800)}`);
  return data;
}

const BIN_EXT = /\.(png|jpe?g|gif|wav)$/i;

async function pushBatch(files, message, retries = 5) {
  const treeEntries = [];
  for (const file of files) {
    const isBinary = BIN_EXT.test(file.path);
    const blob = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({
        content: file.content,
        encoding: isBinary ? 'base64' : 'utf-8',
      }),
    });
    treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    process.stdout.write('.');
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
    const parent = await gh(`/repos/${OWNER}/${REPO}/git/commits/${ref.object.sha}`);

    const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: parent.tree.sha, tree: treeEntries }),
    });

    const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [parent.sha],
      }),
    });

    try {
      await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      return { sha: commit.sha, count: files.length };
    } catch (err) {
      if (!String(err.message).includes('422') || attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

const startFrom = Number(process.env.START_BIN || 0);
const skipText = process.env.SKIP_TEXT === '1';
const skipReadme = process.env.SKIP_README === '1';

const results = [];
let totalFiles = 0;

if (!skipText && startFrom === 0) {
  const text = JSON.parse(readFileSync(join(BATCH_DIR, 'text.json'), 'utf8')).filter(
    (f) => f.path !== 'README.md',
  );
  const textResult = await pushBatch(text, 'Add game source files');
  results.push({ batch: 'text', ...textResult });
  totalFiles += textResult.count;
  console.log(`\ntext: ${textResult.sha} (${textResult.count} files)`);
}

// Binary batches
for (let i = startFrom; i <= 13; i++) {
  const path = join(BATCH_DIR, `bin-${i}.json`);
  const files = JSON.parse(readFileSync(path, 'utf8'));
  const r = await pushBatch(files, `Add binary assets batch ${i}`);
  results.push({ batch: `bin-${i}`, ...r });
  totalFiles += r.count;
  console.log(`bin-${i}: ${r.sha} (${r.count} files)`);
}

let latestCommitSha = results.at(-1)?.sha;
if (!skipReadme) {
  const readmeResult = await pushBatch([{ path: 'README.md', content: README }], 'Add README');
  results.push({ batch: 'README', ...readmeResult });
  totalFiles += readmeResult.count;
  latestCommitSha = readmeResult.sha;
  console.log(`README: ${readmeResult.sha}`);
}

const summary = {
  owner: OWNER,
  repo: REPO,
  branch: BRANCH,
  totalFiles,
  latestCommitSha,
  results,
};
writeFileSync(join(BATCH_DIR, 'push-summary.json'), JSON.stringify(summary, null, 2));
console.log('\nDONE', JSON.stringify(summary));