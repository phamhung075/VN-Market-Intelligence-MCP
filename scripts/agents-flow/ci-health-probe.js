#!/usr/bin/env node
// CANON-SCRIPT for docs/agents/dev-team/flow/ci-health-probe.md (CI-0..CI-4).
// Probes GitHub Actions CI health on origin/main once per dev-team hourly tick.
// Emits a ci_red signal to docs/signals/ if CI is RED on the current HEAD.
// Always non-fatal — a failure at any step logs WARN and exits 0.
// SAFE-JSON: all gh/git output fields pass through JSON.parse / jq bound args only.
//            execFileSync(cmd, [array-args]) — never execSync with string concat.
// Deps: child_process, crypto, fs, path only (mirrors drain-signals.js).
// Usage: node scripts/agents-flow/ci-health-probe.js
// First shipped 2026-06-08 — CI-HEALTH-FIX-BRIDGE.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SIG_DIR = path.join(ROOT, 'docs', 'signals');
const PROC_DIR = path.join(SIG_DIR, 'processed');
const DB = path.join(SIG_DIR, 'signals.db');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(msg);
}

function warn(msg) {
  console.log(`[ci-health-probe] WARN: ${msg}`);
}

function safeExecFile(cmd, args, opts) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { encoding: 'utf8', ...opts }) };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

// ---------------------------------------------------------------------------
// CI-0 — Non-fatal gh availability check
// ---------------------------------------------------------------------------

const ghCheck = spawnSync('gh', ['--version'], { encoding: 'utf8' });
if (ghCheck.error) {
  log('[ci-health-probe] SKIP: gh not found — skipping, dev-team tick continues');
  process.exit(0);
}

const authCheck = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
if (authCheck.status !== 0) {
  log('[ci-health-probe] SKIP: gh unauthenticated — skipping, dev-team tick continues');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// CI-1 — Fetch current HEAD + latest CI run (STALE-RUN GATE)
// ---------------------------------------------------------------------------

// git fetch origin main --quiet (non-fatal if offline)
const fetchResult = safeExecFile('git', ['-C', ROOT, 'fetch', 'origin', 'main', '--quiet']);
if (!fetchResult.ok) {
  warn(`git fetch failed (${fetchResult.err}) — skipping, dev-team tick continues`);
  process.exit(0);
}

const headResult = safeExecFile('git', ['-C', ROOT, 'rev-parse', 'origin/main']);
if (!headResult.ok) {
  warn(`git rev-parse origin/main failed — skipping`);
  process.exit(0);
}
const HEAD_SHA = headResult.out.trim();

// gh run list — SAFE: array args, output parsed as JSON only
const runsResult = safeExecFile('gh', [
  'run', 'list',
  '--repo', 'phamhung075/VN-Market-Intelligence-MCP',
  '--branch', 'main',
  '--limit', '5',
  '--json', 'databaseId,headSha,status,conclusion,event,workflowName'
]);
if (!runsResult.ok) {
  warn(`gh run list failed (${runsResult.err}) — skipping, dev-team tick continues`);
  process.exit(0);
}

let runs;
try {
  runs = JSON.parse(runsResult.out);
} catch (e) {
  warn(`gh run list output unparseable: ${e.message} — skipping`);
  process.exit(0);
}

// STALE-RUN GATE: select most-recent run where workflowName=="CI" AND headSha==HEAD_SHA
const run = runs.find(r => r.workflowName === 'CI' && r.headSha === HEAD_SHA) || null;

if (!run) {
  log(`[ci-health-probe] No CI run found for HEAD ${HEAD_SHA} — skipping`);
  process.exit(0);
}

const CONCLUSION = run.conclusion || run.status;
const RUN_ID = run.databaseId;
const RUN_URL = `https://github.com/phamhung075/VN-Market-Intelligence-MCP/actions/runs/${RUN_ID}`;

if (CONCLUSION === 'success') {
  log(`[ci-health-probe] CI GREEN on HEAD ${HEAD_SHA} (run ${RUN_ID}) — no signal`);
  process.exit(0);
}

// Only act on terminal conclusions
const IN_PROGRESS_STATES = new Set(['in_progress', 'queued', 'waiting']);
if (IN_PROGRESS_STATES.has(run.status)) {
  log(`[ci-health-probe] CI run ${RUN_ID} still ${run.status} — skipping until terminal`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// CI-2 — Per-job conclusions
// ---------------------------------------------------------------------------

// gh run view — SAFE: array args, no field interpolation into shell
const jobsResult = safeExecFile('gh', [
  'run', 'view', String(RUN_ID),
  '--repo', 'phamhung075/VN-Market-Intelligence-MCP',
  '--json', 'status,conclusion,jobs'
]);
if (!jobsResult.ok) {
  warn(`gh run view failed (${jobsResult.err}) — skipping`);
  process.exit(0);
}

let runDetail;
try {
  runDetail = JSON.parse(jobsResult.out);
} catch (e) {
  warn(`gh run view output unparseable: ${e.message} — skipping`);
  process.exit(0);
}

const allJobs = Array.isArray(runDetail.jobs) ? runDetail.jobs : [];

// Collect failing jobs: conclusion != success AND conclusion != skipped
const failingJobs = allJobs
  .filter(j => j.conclusion !== 'success' && j.conclusion !== 'skipped')
  .map(j => ({ name: j.name, conclusion: j.conclusion, jobId: j.databaseId }));

if (failingJobs.length === 0) {
  log(`[ci-health-probe] No failing jobs found for run ${RUN_ID} — skipping`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// CI-3 — 3-layer dedup fingerprint
// ---------------------------------------------------------------------------

// Sort job names for stable fingerprint
const sortedJobNames = failingJobs.map(j => j.name).sort();
const SORTED_JOBS_STR = sortedJobNames.join(',');
const DEDUP_KEY = `ci_red:${HEAD_SHA}:${SORTED_JOBS_STR}`;
const FINGERPRINT = crypto.createHash('sha256').update(DEDUP_KEY).digest('hex');

// Layer 1: probe-level signals_processed DB check
if (fs.existsSync(DB)) {
  try {
    const countRaw = execFileSync(
      'sqlite3',
      [DB, `SELECT count(*) FROM signals_processed WHERE fingerprint='${FINGERPRINT}';`],
      { encoding: 'utf8' }
    ).trim();
    if (countRaw !== '0') {
      log(`[ci-health-probe] ci_red already emitted for HEAD ${HEAD_SHA} jobs [${SORTED_JOBS_STR}] — dedup, skip`);
      process.exit(0);
    }
  } catch (e) {
    warn(`sqlite3 fingerprint check failed (${e.message}) — treating as 0, continuing`);
  }
}

// Layer 1b: filesystem scan — check docs/signals/ and docs/signals/processed/ for matching fingerprint
// (catches the case where drain hasn't run yet — signal file exists but not yet in DB)
const dirsToScan = [SIG_DIR, PROC_DIR];
for (const dir of dirsToScan) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const base of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, base), 'utf8');
      const parsed = JSON.parse(raw);
      // Check both top-level dedup_key and payload fingerprint
      if (parsed.dedup_key === DEDUP_KEY) {
        log(`[ci-health-probe] duplicate fingerprint found in ${path.join(dir, base)} — dedup, skip`);
        process.exit(0);
      }
    } catch { /* skip unparseable */ }
  }
}

// Layer 2 (PO open-entry check): this is handled downstream by triage-signals;
// the fingerprint field in the signal payload enables PO to detect open ci_red task for head_sha.
// We do not query the task store here — that is PO's gate, not probe's gate (per spec §3-LAYER DEDUP note).

// ---------------------------------------------------------------------------
// CI-4 — Emit ci_red signal
// ---------------------------------------------------------------------------

const TS = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const TS_DIGITS = TS.replace(/[-:TZ]/g, '');
const HEAD_SHA_SHORT = HEAD_SHA.slice(0, 8);
const SIGNAL_FILENAME = `ci-red-${HEAD_SHA_SHORT}-${TS_DIGITS}.json`;
const SIGNAL_PATH = path.join(SIG_DIR, SIGNAL_FILENAME);

// Ensure docs/signals/ exists
fs.mkdirSync(SIG_DIR, { recursive: true });

// SAFE-JSON: all dynamic fields via JSON.stringify — no shell interpolation
const signal = {
  from: 'ci-health-probe',
  to: 'po',
  type: 'ci_red',
  priority: 'high',
  createdAt: TS,
  dedup_key: DEDUP_KEY,
  payload: {
    check_id: `CI-RED-${HEAD_SHA_SHORT}`,
    head_sha: HEAD_SHA,
    run_id: RUN_ID,
    run_url: RUN_URL,
    conclusion: CONCLUSION,
    failing_jobs: failingJobs,
    fingerprint: FINGERPRINT,
    zone_owner: 'dev-team (CI fix)',
    summary: `CI RED on main HEAD ${HEAD_SHA}: ${SORTED_JOBS_STR}`,
    suggested_sprint_class: 'FIX',
    verification_gate: 'ci_green_on_subsequent_push'
  }
};

fs.writeFileSync(SIGNAL_PATH, JSON.stringify(signal, null, 2) + '\n');

log(`[ci-health-probe] Emitted ci_red signal: ${SIGNAL_PATH} (run ${RUN_ID}, HEAD ${HEAD_SHA}, jobs: ${SORTED_JOBS_STR})`);

// ---------------------------------------------------------------------------
// CI-4 — Always exit 0 (non-fatal)
// ---------------------------------------------------------------------------
process.exit(0);
