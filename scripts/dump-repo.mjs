#!/usr/bin/env node
/**
 * dump-repo.mjs — dump the repo into two TXT files.
 *
 *   repo-dump/SNAPSHOT.txt  — every eligible file: "=== path ===" header + full contents
 *   repo-dump/CHANGES.txt   — git-log-style report of what is changed vs HEAD
 *                             (branch commits, status, per-file diffstat, full diffs,
 *                              full contents of untracked/new files)
 *
 * Usage:
 *   node scripts/dump-repo.mjs                # both files
 *   node scripts/dump-repo.mjs --snapshot     # only SNAPSHOT.txt
 *   node scripts/dump-repo.mjs --changes      # only CHANGES.txt
 *   node scripts/dump-repo.mjs --dry-run      # list what WOULD be included, write nothing
 *   node scripts/dump-repo.mjs --out <dir>    # output dir (default: ./repo-dump)
 *   node scripts/dump-repo.mjs --concurrency 32
 *
 * Safety:
 *   - Read-only against the repo. Only ever writes the two files inside --out.
 *   - Uses `git ls-files` so .gitignore is honoured (node_modules, dist, .env, logs...).
 *   - Extra deny-list below for env files, lockfiles, binaries, generated junk.
 *   - Binary sniff (NUL byte) + per-file size cap → never dumps a font/image/blob.
 *   - Never follows symlinks. Never deletes anything. Refuses to run outside a git repo.
 *   - Warns (does not silently include) lines that look like secrets.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs, createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execFileP = promisify(execFile);

// ───────────────────────── config ─────────────────────────

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

const OUT_DIR = path.resolve(opt('--out', 'repo-dump'));
const SNAPSHOT_FILE = path.join(OUT_DIR, 'SNAPSHOT.txt');
const CHANGES_FILE = path.join(OUT_DIR, 'CHANGES.txt');
const DRY_RUN = flag('--dry-run');
const DO_SNAPSHOT = flag('--snapshot') || !flag('--changes');
const DO_CHANGES = flag('--changes') || !flag('--snapshot');
const CONCURRENCY = Number(opt('--concurrency', Math.max(8, os.cpus().length * 4)));
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB — anything bigger is not source

// Paths / names that are never eligible (on top of .gitignore).
const DENY_EXACT_NAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  '.DS_Store',
  'Thumbs.db',
]);
const DENY_PATTERNS = [
  /(^|\/)\.env(\..*)?$/i, // .env, .env.local, .env.example ...
  /(^|\/)node_modules\//,
  /(^|\/)(dist|build|out|coverage|\.next|\.turbo|\.cache|\.vite)\//,
  /(^|\/)drizzle\/meta\//, // generated migration snapshots/journal
  /(^|\/)repo-dump\//, // our own output
  /\.(log|pid|seed|tsbuildinfo|map)$/i,
];
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.zip', '.gz', '.tar', '.7z', '.rar',
  '.mp3', '.mp4', '.wav', '.mov', '.webm',
  '.exe', '.dll', '.so', '.dylib', '.wasm', '.node',
  '.db', '.sqlite', '.sqlite3', '.lockb',
]);
const SECRET_RE =
  /(api[_-]?key|secret|token|password|passwd|private[_-]?key|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY)\s*[:=]\s*['"]?[A-Za-z0-9_\-\/+=.]{12,}/i;

// ───────────────────────── helpers ─────────────────────────

const t0 = Date.now();
const elapsed = () => ((Date.now() - t0) / 1000).toFixed(2) + 's';
const log = (...m) => console.error(`[${elapsed()}]`, ...m);
const human = (b) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`;

async function git(...a) {
  const { stdout } = await execFileP('git', a, { maxBuffer: 256 * 1024 * 1024 });
  return stdout;
}

function isEligible(rel) {
  const base = path.posix.basename(rel);
  if (DENY_EXACT_NAMES.has(base)) return false;
  if (DENY_PATTERNS.some((re) => re.test(rel))) return false;
  if (BINARY_EXT.has(path.posix.extname(rel).toLowerCase())) return false;
  return true;
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** Run `fn` over `items` with bounded concurrency, preserving order of results. */
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

class Progress {
  constructor(label, totalBytes, totalFiles) {
    this.label = label;
    this.totalBytes = totalBytes;
    this.totalFiles = totalFiles;
    this.doneBytes = 0;
    this.doneFiles = 0;
    this.start = Date.now();
    this.lastPrint = 0;
  }
  tick(bytes, force = false) {
    this.doneBytes += bytes;
    this.doneFiles++;
    const now = Date.now();
    if (!force && now - this.lastPrint < 100 && this.doneFiles !== this.totalFiles) return;
    this.lastPrint = now;
    const frac = this.totalBytes ? this.doneBytes / this.totalBytes : this.doneFiles / this.totalFiles;
    const el = (now - this.start) / 1000;
    const eta = frac > 0 ? (el / frac) * (1 - frac) : 0;
    const bar = '█'.repeat(Math.round(frac * 24)).padEnd(24, '░');
    process.stderr.write(
      `\r[${elapsed()}] ${this.label} ${bar} ${(frac * 100).toFixed(1).padStart(5)}%  ` +
        `${this.doneFiles}/${this.totalFiles} files  ${human(this.doneBytes)}/${human(this.totalBytes)}  ` +
        `ETA ${eta.toFixed(1)}s   `,
    );
    if (this.doneFiles === this.totalFiles) process.stderr.write('\n');
  }
}

function header(title, sub = '') {
  const line = '='.repeat(88);
  return `${line}\n${title}${sub ? `\n${sub}` : ''}\n${line}\n`;
}

async function writeOut(file, chunks) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(file, { encoding: 'utf8' });
    ws.on('error', reject);
    ws.on('finish', resolve);
    for (const c of chunks) ws.write(c);
    ws.end();
  });
  const { size } = await fs.stat(file);
  return size;
}

// ───────────────────────── file discovery ─────────────────────────

async function discoverFiles(repoRoot) {
  // tracked + untracked-but-not-ignored, NUL-separated, deleted files excluded.
  const raw = await git('ls-files', '-z', '--cached', '--others', '--exclude-standard');
  const deleted = new Set((await git('ls-files', '-z', '--deleted')).split('\0').filter(Boolean));
  const all = raw.split('\0').filter(Boolean);
  const candidates = all.filter((f) => !deleted.has(f) && isEligible(f));

  // stat concurrently: drop symlinks, dirs (submodules), oversize files.
  const stats = await pool(candidates, CONCURRENCY, async (rel) => {
    try {
      const st = await fs.lstat(path.join(repoRoot, rel));
      if (st.isSymbolicLink() || !st.isFile()) return { rel, skip: 'not a regular file' };
      if (st.size > MAX_FILE_BYTES) return { rel, skip: `too large (${human(st.size)})` };
      return { rel, size: st.size };
    } catch (e) {
      return { rel, skip: `stat failed: ${e.message}` };
    }
  });

  const skipped = stats.filter((s) => s.skip);
  const files = stats.filter((s) => !s.skip).sort((a, b) => a.rel.localeCompare(b.rel));
  return { files, skipped, totalSeen: all.length };
}

// ───────────────────────── SNAPSHOT ─────────────────────────

async function buildSnapshot(repoRoot, branch, head) {
  const { files, skipped, totalSeen } = await discoverFiles(repoRoot);
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  log(`snapshot: ${files.length} eligible of ${totalSeen} seen, ${human(totalBytes)} to read, ` +
      `${skipped.length} skipped by stat, concurrency=${CONCURRENCY}`);
  for (const s of skipped) log(`  skip ${s.rel}: ${s.skip}`);

  if (DRY_RUN) {
    console.log(files.map((f) => `${human(f.size).padStart(10)}  ${f.rel}`).join('\n'));
    return null;
  }

  const prog = new Progress('SNAPSHOT', totalBytes, files.length);
  const secretHits = [];
  const binaryHits = [];

  const bodies = await pool(files, CONCURRENCY, async (f) => {
    const buf = await fs.readFile(path.join(repoRoot, f.rel));
    prog.tick(buf.length);
    if (looksBinary(buf)) {
      binaryHits.push(f.rel);
      return header(`FILE: ${f.rel}`, `(binary, ${human(buf.length)} — contents omitted)`) + '\n';
    }
    const text = buf.toString('utf8');
    const lines = text.split('\n');
    lines.forEach((ln, i) => {
      if (SECRET_RE.test(ln)) secretHits.push(`${f.rel}:${i + 1}`);
    });
    return (
      header(`FILE: ${f.rel}`, `${human(buf.length)} · ${lines.length} lines`) +
      text +
      (text.endsWith('\n') ? '' : '\n') +
      '\n'
    );
  });

  const toc = files.map((f, i) => `${String(i + 1).padStart(4)}. ${f.rel}  (${human(f.size)})`).join('\n');
  const preamble =
    header(
      `REPO SNAPSHOT — ${path.basename(repoRoot)}`,
      `branch: ${branch}   HEAD: ${head}\ngenerated: ${new Date().toISOString()}\n` +
        `files: ${files.length}   bytes: ${human(totalBytes)}\n` +
        `excluded: .gitignore'd paths, .env*, lockfiles, binaries/fonts/images, drizzle/meta, files > ${human(MAX_FILE_BYTES)}`,
    ) +
    '\nTABLE OF CONTENTS\n' + toc + '\n\n';

  const size = await writeOut(SNAPSHOT_FILE, [preamble, ...bodies]);
  if (binaryHits.length) log(`note: ${binaryHits.length} file(s) sniffed as binary, contents omitted: ${binaryHits.join(', ')}`);
  if (secretHits.length) {
    log(`⚠ WARNING: ${secretHits.length} line(s) look like secrets — review before sharing SNAPSHOT.txt:`);
    for (const h of secretHits) log(`    ${h}`);
  }
  log(`wrote ${SNAPSHOT_FILE} (${human(size)})`);
  return size;
}

// ───────────────────────── CHANGES ─────────────────────────

async function buildChanges(repoRoot, branch, head) {
  // Everything below is read-only git. Run the independent queries concurrently.
  const base = await git('rev-parse', '--verify', '--quiet', 'origin/main').catch(() =>
    git('rev-parse', '--verify', '--quiet', 'main').catch(() => ''),
  );
  const baseRef = base.trim() ? (await git('merge-base', 'HEAD', base.trim())).trim() : '';

  const [statusRaw, numstat, diffTracked, untrackedRaw, branchLog, lastCommit] = await Promise.all([
    git('status', '--porcelain=v1', '-z', '--untracked-files=all'),
    git('diff', 'HEAD', '--numstat', '--find-renames'),
    git('diff', 'HEAD', '--find-renames', '--patch', '--no-color', '--stat=120'),
    git('ls-files', '-z', '--others', '--exclude-standard'),
    baseRef ? git('log', '--no-color', `--format=%h %ad %an%n    %s`, '--date=short', `${baseRef}..HEAD`) : Promise.resolve(''),
    git('log', '-1', '--no-color', '--format=%H%n%an <%ae>%n%ad%n%n%s%n%n%b', '--date=iso'),
  ]);

  // status → per-file human list
  const statusEntries = [];
  const parts = statusRaw.split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].slice(0, 2);
    let p = parts[i].slice(3);
    if (code[0] === 'R' || code[0] === 'C') p = `${parts[++i]} -> ${p}`; // rename: next NUL field is the old path
    const what =
      code === '??' ? 'untracked (new)' :
      code.includes('D') ? 'deleted' :
      code.includes('A') ? 'added' :
      code.includes('R') ? 'renamed' :
      code.includes('M') ? 'modified' : code.trim();
    statusEntries.push(`${what.padEnd(16)} ${p}`);
  }

  // untracked files: no diff exists, so include full contents (eligible ones only)
  const untracked = untrackedRaw.split('\0').filter(Boolean).filter(isEligible).sort();
  const untrackedSizes = await pool(untracked, CONCURRENCY, async (rel) => {
    try {
      const st = await fs.lstat(path.join(repoRoot, rel));
      return st.isFile() && !st.isSymbolicLink() && st.size <= MAX_FILE_BYTES ? st.size : -1;
    } catch { return -1; }
  });
  const untrackedOk = untracked.filter((_, i) => untrackedSizes[i] >= 0);
  const untrackedBytes = untrackedSizes.filter((n) => n >= 0).reduce((a, b) => a + b, 0);

  log(`changes: ${statusEntries.length} status entries, ${untrackedOk.length} untracked files to inline (${human(untrackedBytes)})`);

  if (DRY_RUN) {
    console.log(statusEntries.join('\n'));
    return null;
  }

  const prog = new Progress('CHANGES ', untrackedBytes, untrackedOk.length);
  const untrackedBodies = await pool(untrackedOk, CONCURRENCY, async (rel) => {
    const buf = await fs.readFile(path.join(repoRoot, rel));
    prog.tick(buf.length);
    if (looksBinary(buf)) return header(`NEW FILE: ${rel}`, '(binary — omitted)') + '\n';
    const text = buf.toString('utf8');
    return header(`NEW FILE: ${rel}`, `${human(buf.length)} · ${text.split('\n').length} lines`) + text + (text.endsWith('\n') ? '' : '\n') + '\n';
  });
  if (untrackedOk.length === 0) process.stderr.write('');

  const chunks = [
    header(
      `CHANGE REPORT — ${path.basename(repoRoot)}`,
      `branch: ${branch}   HEAD: ${head}${baseRef ? `   merge-base with main: ${baseRef.slice(0, 7)}` : ''}\ngenerated: ${new Date().toISOString()}`,
    ),
    '\n',
    header('1. LAST COMMIT (HEAD)'), lastCommit.trim() + '\n\n',
    header('2. COMMITS ON THIS BRANCH NOT ON main'), (branchLog.trim() || '(none / main not found)') + '\n\n',
    header('3. WORKING TREE STATUS (uncommitted changes vs HEAD)'), (statusEntries.join('\n') || '(clean)') + '\n\n',
    header('4. DIFFSTAT (added / removed lines per tracked file)'),
    (numstat.trim()
      ? numstat.trim().split('\n').map((l) => { const [a, d, f] = l.split('\t'); return `  +${a.padEnd(6)} -${d.padEnd(6)} ${f}`; }).join('\n')
      : '(no tracked changes)') + '\n\n',
    header('5. FULL DIFF OF TRACKED FILES (git diff HEAD)'), (diffTracked.trim() || '(no tracked changes)') + '\n\n',
    header('6. UNTRACKED / NEW FILES (full contents — no diff exists for these)'),
    untrackedBodies.length ? '\n' + untrackedBodies.join('') : '(none)\n',
  ];

  const size = await writeOut(CHANGES_FILE, chunks);
  log(`wrote ${CHANGES_FILE} (${human(size)})`);
  return size;
}

// ───────────────────────── main ─────────────────────────

async function main() {
  let repoRoot;
  try {
    repoRoot = path.resolve((await git('rev-parse', '--show-toplevel')).trim()); // normalise slashes (Windows)
  } catch {
    console.error('error: not inside a git repository — refusing to run.');
    process.exit(1);
  }
  process.chdir(repoRoot);

  // Safety: output dir must live inside the repo (or be explicit), and we only touch our two files.
  const relOut = path.relative(repoRoot, OUT_DIR);
  const outInsideRepo = relOut !== '' && !relOut.startsWith('..') && !path.isAbsolute(relOut);
  if (!outInsideRepo && !flag('--out')) {
    console.error('error: output dir resolved outside the repo without --out; refusing.');
    process.exit(1);
  }
  for (const f of [SNAPSHOT_FILE, CHANGES_FILE]) {
    try {
      const st = await fs.lstat(f);
      if (st.isSymbolicLink() || !st.isFile()) {
        console.error(`error: ${f} exists and is not a regular file — refusing to overwrite.`);
        process.exit(1);
      }
    } catch { /* does not exist, fine */ }
  }

  const [branch, head] = await Promise.all([
    git('rev-parse', '--abbrev-ref', 'HEAD').then((s) => s.trim()),
    git('rev-parse', '--short', 'HEAD').then((s) => s.trim()),
  ]);
  log(`repo: ${repoRoot}  branch: ${branch}  HEAD: ${head}${DRY_RUN ? '  (DRY RUN — nothing will be written)' : ''}`);
  log(`outputs: ${DO_SNAPSHOT ? SNAPSHOT_FILE : ''} ${DO_CHANGES ? CHANGES_FILE : ''}`.trim());

  // Both reports are independent → build them concurrently.
  const tasks = [];
  if (DO_SNAPSHOT) tasks.push(buildSnapshot(repoRoot, branch, head));
  if (DO_CHANGES) tasks.push(buildChanges(repoRoot, branch, head));
  const results = await Promise.allSettled(tasks);

  let failed = false;
  for (const r of results) if (r.status === 'rejected') { failed = true; log('FAILED:', r.reason?.stack || r.reason); }
  log(`done in ${elapsed()}${failed ? ' (with errors)' : ''}`);
  process.exit(failed ? 1 : 0);
}

main();
