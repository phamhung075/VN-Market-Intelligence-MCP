#!/usr/bin/env node
// Test harness for scripts/agents-flow/drain-signals.js — GATE-B Tier 2 recurrence-count
// subcommand (FIX-DRAINESC-SEVERITY-RECURRENCE-GATE, 2026-07-04) + drain-mode regression guard.
//
// ISOLATION: every scenario runs inside its own mkdtemp harness with its OWN
// scripts/agents-flow/drain-signals.js copy + docs/signals/signals.db — never touches the
// live docs/signals/signals.db or docs/signals/*.json inbox (production data).
//
// Run: node scripts/agents-flow/drain-signals.test.js
// Exit 0 = all pass, Exit 1 = any fail.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_SCRIPT = path.join(REPO_ROOT, 'scripts/agents-flow/drain-signals.js');

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL  ${label}`);
    console.log(`        expected: ${JSON.stringify(expected)}`);
    console.log(`        actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Harness builder — isolated tmp tree so ROOT/SIG/DB resolve away from prod.
// ---------------------------------------------------------------------------
const SCHEMA = `CREATE TABLE signals_processed (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint     TEXT    UNIQUE NOT NULL,
    from_agent      TEXT    NOT NULL,
    to_agent        TEXT,
    type            TEXT,
    priority        TEXT,
    payload         TEXT,
    created_at      TEXT    NOT NULL,
    processed_at    TEXT    NOT NULL,
    processed_by    TEXT    NOT NULL DEFAULT 'dev-team',
    result          TEXT    NOT NULL,
    source_filename TEXT
  );`;

function makeHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drain-signals-test-'));
  fs.mkdirSync(path.join(dir, 'scripts/agents-flow'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/signals'), { recursive: true });
  fs.copyFileSync(SRC_SCRIPT, path.join(dir, 'scripts/agents-flow/drain-signals.js'));
  execFileSync('sqlite3', [path.join(dir, 'docs/signals/signals.db'), SCHEMA]);
  return dir;
}

const escB = (s) => String(s ?? '').replace(/'/g, "''");

function seedRow(dbPath, { fingerprint, ticker, quarter, trigger_id, context, priority = 'HIGH' }) {
  const payload = JSON.stringify({ ticker, quarter, trigger_id, context });
  const sql = `INSERT INTO signals_processed (fingerprint, from_agent, to_agent, type, priority, payload, created_at, processed_at, processed_by, result, source_filename) VALUES ('${escB(fingerprint)}','bctc-analyst','dev-team','esc-deep-dive-request','${escB(priority)}','${escB(payload)}','2026-07-01T00:00:00Z','2026-07-01T00:00:00Z','dev-team','routed-to-po','${escB(fingerprint)}.json');`;
  execFileSync('sqlite3', [dbPath, sql]);
}

function recurrenceCount(scriptPath, args) {
  const stdin = JSON.stringify({ type: 'esc-deep-dive-request', ...args });
  const out = execFileSync('node', [scriptPath, '--recurrence-count'], { input: stdin, encoding: 'utf8' });
  const m = out.trim().match(/^count=(-?\d+)$/);
  return m ? parseInt(m[1], 10) : NaN;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// AC5 — Tier-2 passes on count==1 (first occurrence never suppressed). Ticker: CTG.
// ---------------------------------------------------------------------------
{
  const h = makeHarness();
  const dbPath = path.join(h, 'docs/signals/signals.db');
  const scriptPath = path.join(h, 'scripts/agents-flow/drain-signals.js');
  seedRow(dbPath, { fingerprint: 'fp1', ticker: 'CTG', quarter: 'Q2-2026', trigger_id: 'ESC-3', context: { ocf: 1, np: 2 } });
  const n = recurrenceCount(scriptPath, { ticker: 'CTG', quarter: 'Q2-2026', trigger_id: 'ESC-3', context: { ocf: 1, np: 2 } });
  assert('AC5 count==1 (first occurrence, CTG) → n<2, GATE-B Tier-2 PASS', n < 2, true);
  assert('AC5 exact count value', n, 1);
  cleanup(h);
}

// ---------------------------------------------------------------------------
// AC4 + AC9 — Tier-2 blocks on count>=2 (bootstrap net), ticker: MBB (matches live
// MBB|Q1-2026|ESC-2 fixture — byte-identical context, docs/signals/signals.db verified).
// ---------------------------------------------------------------------------
{
  const h = makeHarness();
  const dbPath = path.join(h, 'docs/signals/signals.db');
  const scriptPath = path.join(h, 'scripts/agents-flow/drain-signals.js');
  const ctx = { assets_total: 666711, liabilities_total: 567490, equity_total: 0, imbalance: 0.1488 };
  seedRow(dbPath, { fingerprint: 'fp1', ticker: 'MBB', quarter: 'Q1-2026', trigger_id: 'ESC-2', context: ctx });
  seedRow(dbPath, { fingerprint: 'fp2', ticker: 'MBB', quarter: 'Q1-2026', trigger_id: 'ESC-2', context: ctx });
  const n = recurrenceCount(scriptPath, { ticker: 'MBB', quarter: 'Q1-2026', trigger_id: 'ESC-2', context: ctx });
  assert('AC4 count>=2 (MBB bootstrap net) → GATE-B Tier-2 FAIL (reflow-needed-hint)', n >= 2, true);
  assert('AC4 exact count value', n, 2);
  cleanup(h);
}

// ---------------------------------------------------------------------------
// AC9 — no ticker hardcode: a THIRD distinct ticker/quarter never seen before → count==0.
// ---------------------------------------------------------------------------
{
  const h = makeHarness();
  const dbPath = path.join(h, 'docs/signals/signals.db');
  const scriptPath = path.join(h, 'scripts/agents-flow/drain-signals.js');
  seedRow(dbPath, { fingerprint: 'fp1', ticker: 'MBB', quarter: 'Q1-2026', trigger_id: 'ESC-2', context: { a: 1 } });
  const n = recurrenceCount(scriptPath, { ticker: 'FPT', quarter: 'Q4-2026', trigger_id: 'ESC-1', context: { x: 1 } });
  assert('AC9 novel ticker (FPT, unrelated to seeded MBB row) → count==0, no per-ticker branching', n, 0);
  cleanup(h);
}

// ---------------------------------------------------------------------------
// AC8 — injection safety: ticker + context containing a single quote must not error
// or break the SQL, and must still count correctly (bound-escape, never raw shell/SQL interp).
// ---------------------------------------------------------------------------
{
  const h = makeHarness();
  const dbPath = path.join(h, 'docs/signals/signals.db');
  const scriptPath = path.join(h, 'scripts/agents-flow/drain-signals.js');
  const ticker = "MB'B";
  const context = { note: "single'quote test" };
  seedRow(dbPath, { fingerprint: 'fp1', ticker, quarter: 'Q1-2026', trigger_id: 'ESC-5', context, priority: 'MED' });
  let n, threw = false;
  try {
    n = recurrenceCount(scriptPath, { ticker, quarter: 'Q1-2026', trigger_id: 'ESC-5', context });
  } catch (e) {
    threw = true;
  }
  assert('AC8 injection fixture does not throw', threw, false);
  assert('AC8 single-quote ticker/context still counts correctly', n, 1);
}

// ---------------------------------------------------------------------------
// Degradation — missing DB / malformed stdin JSON never blocks the caller (count=0, exit 0).
// ---------------------------------------------------------------------------
{
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'drain-signals-test-nodb-'));
  fs.mkdirSync(path.join(h, 'scripts/agents-flow'), { recursive: true });
  fs.mkdirSync(path.join(h, 'docs/signals'), { recursive: true }); // signals.db intentionally absent
  const scriptPath = path.join(h, 'scripts/agents-flow/drain-signals.js');
  fs.copyFileSync(SRC_SCRIPT, scriptPath);

  const out1 = execFileSync('node', [scriptPath, '--recurrence-count'], {
    input: JSON.stringify({ type: 'esc-deep-dive-request', ticker: 'MBB', quarter: 'Q1-2026', trigger_id: 'ESC-2', context: {} }),
    encoding: 'utf8',
  });
  assert('degrade: missing DB → count=0', out1.trim(), 'count=0');

  fs.mkdirSync(path.join(h, 'docs/signals'), { recursive: true });
  execFileSync('sqlite3', [path.join(h, 'docs/signals/signals.db'), SCHEMA]);
  const out2 = execFileSync('node', [scriptPath, '--recurrence-count'], { input: 'not-json{{{', encoding: 'utf8' });
  assert('degrade: malformed stdin JSON → count=0', out2.trim(), 'count=0');
  cleanup(h);
}

// ---------------------------------------------------------------------------
// AC7 — drain-mode regression guard: no-arg invocation on a fixture inbox is untouched
// by the new subcommand (golden stdout; new CLI branch is skipped since argv[2] is undefined).
// ---------------------------------------------------------------------------
{
  const h = makeHarness();
  const sigDir = path.join(h, 'docs/signals');
  const scriptPath = path.join(h, 'scripts/agents-flow/drain-signals.js');
  const fixture1 = {
    from: 'bctc-analyst', to: 'dev-team', type: 'esc-deep-dive-request',
    summary: 'ESC deep-dive: TEST Q1-2026 ESC-2', severity: 'HIGH', status: 'NEW', payload_ref: null,
    payload: { trigger_id: 'ESC-2', ticker: 'TEST', quarter: 'Q1-2026', report_id: 'r1', guard_key: 'esc-deepdive:TEST:Q1-2026:ESC-2', context: { a: 1 }, all_esc_fired: ['ESC-2'] },
    createdAt: '2026-07-04T00:00:00Z',
  };
  fs.writeFileSync(path.join(sigDir, 'sig-a.json'), JSON.stringify(fixture1));
  const out = execFileSync('node', [scriptPath], { encoding: 'utf8' });
  const expected = 'sig-a.json → routed-to-po\ninserted=1 pruned_files=0\ndb_count=1\n';
  assert('AC7 drain-mode (no args) golden stdout on fixture inbox', out, expected);
  assert('AC7 new CLI branch never fires on no-arg invocation (argv[2] undefined)', fs.existsSync(path.join(sigDir, 'processed/sig-a.json')), true);
  cleanup(h);
}

// ---------------------------------------------------------------------------
// UC-SDF-P4 (FIX-DRAIN-SIGNALS-LEGACY-PRUNE-HOLE) — legacy/unstamped processed/ files
// fall back to file mtime for pruning. Before this fix, a file with no
// _processed.processedAt (and no top-level processedAt) was NEVER pruned regardless of
// age — this regression guard asserts the mtime fallback now ages such files out, while
// still leaving stamped/recent files untouched.
// ---------------------------------------------------------------------------
{
  const h = makeHarness();
  const sigDir = path.join(h, 'docs/signals');
  const procDir = path.join(sigDir, 'processed');
  fs.mkdirSync(procDir, { recursive: true });
  const scriptPath = path.join(h, 'scripts/agents-flow/drain-signals.js');

  const oldLegacy = path.join(procDir, 'legacy-old.json');
  const freshLegacy = path.join(procDir, 'legacy-fresh.json');
  const stampedOld = path.join(procDir, 'stamped-old.json'); // stamped + old → pruned by existing field-compare rule (unchanged)
  fs.writeFileSync(oldLegacy, JSON.stringify({ from: 'x', type: 'y' })); // no _processed block at all
  fs.writeFileSync(freshLegacy, JSON.stringify({ from: 'x', type: 'y' }));
  fs.writeFileSync(stampedOld, JSON.stringify({ from: 'x', type: 'y', _processed: { processedAt: '2026-06-01T00:00:00Z' } }));

  const eightDaysAgoSec = (Date.now() - 8 * 864e5) / 1000;
  fs.utimesSync(oldLegacy, eightDaysAgoSec, eightDaysAgoSec); // backdate mtime past the 7-day cutoff

  execFileSync('node', [scriptPath], { encoding: 'utf8' }); // empty inbox — exercises prune step only

  assert('UC-SDF-P4 legacy file (no stamp) older than mtime cutoff IS pruned', fs.existsSync(oldLegacy), false);
  assert('UC-SDF-P4 legacy file (no stamp) within mtime cutoff is NOT pruned', fs.existsSync(freshLegacy), true);
  assert('UC-SDF-P4 stamped+old file still pruned by unchanged field-compare rule', fs.existsSync(stampedOld), false);

  // Idempotency — second run is a no-op on the survivor, no error.
  execFileSync('node', [scriptPath], { encoding: 'utf8' });
  assert('UC-SDF-P4 idempotent re-run: fresh legacy file still survives', fs.existsSync(freshLegacy), true);
  cleanup(h);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const total = passed + failed;
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
if (failed > 0) {
  console.log('OVERALL: FAIL');
  process.exit(1);
} else {
  console.log('OVERALL: PASS');
  process.exit(0);
}
