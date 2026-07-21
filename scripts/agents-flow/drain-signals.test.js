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
const { execFileSync, spawnSync } = require('child_process');

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
// FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE — verification gate (row: docs/data/orch/orch-state.json
// task_board.backlog, id FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE).
//
// Fully self-contained harness: on top of the usual drain-signals.js + signals.db isolation,
// this ALSO copies the read-only orch-apply.sh / orch-validate.mjs / orch-conservation-check.mjs
// gate chain + orchStateSchema.ts (node_modules SYMLINKED, never copied) into the same isolated
// tmp root, so the REAL, unmodified validator/conservation-guard gate runs end-to-end against an
// ISOLATED TEMP COPY of orch-state.json seeded inside this harness. The LIVE
// docs/data/orch/orch-state.json is NEVER read or written by this scenario — the harness's own
// orch-state.json lives only under its own mkdtemp root and is deleted by cleanup(h) below.
//
// Asserts all 3 gate conditions live (a green validator ALONE is not sufficient — see row):
//   (1) the seeded file is now in processed/
//   (2) the row's payload_ref was rewritten to the processed/ path
//   (3) the REAL scripts/orch-validate.mjs (bun — see its own #!/usr/bin/env bun shebang;
//       plain node cannot import its .ts schema dependency) exits 0 against the harness copy
// ---------------------------------------------------------------------------
function makeOrchRefHarness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drain-orchref-test-'));
  fs.mkdirSync(path.join(dir, 'scripts/agents-flow'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/signals'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/data/orch'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'apps/mcp-server/src/infrastructure'), { recursive: true });

  fs.copyFileSync(SRC_SCRIPT, path.join(dir, 'scripts/agents-flow/drain-signals.js'));
  for (const rel of ['scripts/orch-apply.sh', 'scripts/orch-validate.mjs', 'scripts/orch-conservation-check.mjs']) {
    fs.copyFileSync(path.join(REPO_ROOT, rel), path.join(dir, rel));
  }
  fs.copyFileSync(
    path.join(REPO_ROOT, 'apps/mcp-server/src/infrastructure/orchStateSchema.ts'),
    path.join(dir, 'apps/mcp-server/src/infrastructure/orchStateSchema.ts'),
  );
  // Symlink (never copy) node_modules so `zod` resolves for the copied orchStateSchema.ts —
  // both the root and the apps/mcp-server-local node_modules dirs bun's resolver will walk to.
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  fs.symlinkSync(path.join(REPO_ROOT, 'apps/mcp-server/node_modules'), path.join(dir, 'apps/mcp-server/node_modules'));

  execFileSync('sqlite3', [path.join(dir, 'docs/signals/signals.db'), SCHEMA]);
  return dir;
}

{
  const h = makeOrchRefHarness();
  const sigDir = path.join(h, 'docs/signals');
  const orchStatePath = path.join(h, 'docs/data/orch/orch-state.json');
  const scriptPath = path.join(h, 'scripts/agents-flow/drain-signals.js');
  const validatePath = path.join(h, 'scripts/orch-validate.mjs');

  // Seed synthetic signal file directly in the harness inbox (never the live docs/signals/).
  const sigFile = {
    from: 'test-harness', to: 'po', type: 'gate-verify', priority: 'LOW',
    createdAt: '2026-07-21T00:00:00Z', payload: { note: 'FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE gate' },
  };
  fs.writeFileSync(path.join(sigDir, 'gate-verify-signal.json'), JSON.stringify(sigFile));

  // Seed the ISOLATED TEMP COPY of orch-state.json — minimal-but-schema-valid fixture (head +
  // empty task_board + one signal_queue row whose payload_ref points at the seeded file above).
  const orchStateFixture = {
    head: { status: 'idle', active_task_id: null, next_agent: null },
    task_board: { backlog: [], active_sprints: [] },
    signal_queue: {
      _updated_at: '2026-07-21T00:00:00Z',
      _updated_by: 'test-harness',
      rows: [
        { id: 'gate-verify-row', summary: 'gate verify', severity: 'LOW', status: 'NEW', payload_ref: 'docs/signals/gate-verify-signal.json' },
      ],
      archive: [],
    },
  };
  fs.writeFileSync(orchStatePath, JSON.stringify(orchStateFixture, null, 2));

  execFileSync('node', [scriptPath], { encoding: 'utf8' }); // run the drain (isolated harness only)

  // Assertion 1 — seeded file now in processed/
  assert('FIX-DRAIN-PAYLOADREF gate (1) file moved to processed/', fs.existsSync(path.join(sigDir, 'processed/gate-verify-signal.json')), true);

  // Assertion 2 — row's payload_ref repointed to the processed/ path, in the isolated copy only
  const finalOrch = JSON.parse(fs.readFileSync(orchStatePath, 'utf8'));
  const row = finalOrch.signal_queue.rows.find((r) => r.id === 'gate-verify-row');
  assert('FIX-DRAIN-PAYLOADREF gate (2) payload_ref repointed', row && row.payload_ref, 'docs/signals/processed/gate-verify-signal.json');

  // Assertion 3 — the REAL validator (bun, per its shebang) exits 0 against the harness copy
  let validateOk = false;
  let validateErr = '';
  try {
    execFileSync('bun', [validatePath, orchStatePath], { encoding: 'utf8' });
    validateOk = true;
  } catch (e) {
    validateErr = (e.stderr || e.message || '').toString();
  }
  assert('FIX-DRAIN-PAYLOADREF gate (3) orch-validate.mjs exits 0', validateOk, true);
  if (!validateOk) console.log(`        orch-validate stderr: ${validateErr}`);

  cleanup(h);
}

// ---------------------------------------------------------------------------
// FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE / ENOBUFS regression — repointPayloadRefs()'s
// `jq` execFileSync call had no maxBuffer, so Node's default (measured 1,048,576 bytes
// on this machine) silently truncated the read whenever the jq {doc,changed} output —
// essentially the WHOLE orch-state document plus a small wrapper — exceeded ~1MB. The
// live docs/data/orch/orch-state.json crossed that line on 2026-07-21 (measured
// 1,109,434 bytes), so this was not hypothetical: the repoint has been permanently
// dead in production since that point (the file only grows), surfacing only as a
// swallowed "non-fatal" WARN and a payload_ref that never actually moved — the exact
// mechanism behind this row's recurring_bug_count=4.
//
// Reuses the orch-ref harness above but pads the seeded orch-state.json fixture past
// 1MB via `dashboard_section_cache` (z.record(z.unknown()).optional() in
// orchStateSchema.ts — arbitrary-shape, schema-safe filler, does not affect the
// conservation-guard task_total/signal_total counts) so the REAL jq subprocess output
// genuinely exceeds Node's default execFileSync maxBuffer — no mocking of the failure.
// ---------------------------------------------------------------------------
{
  const h = makeOrchRefHarness();
  const sigDir = path.join(h, 'docs/signals');
  const orchStatePath = path.join(h, 'docs/data/orch/orch-state.json');
  const scriptPath = path.join(h, 'scripts/agents-flow/drain-signals.js');

  const sigFile = {
    from: 'test-harness', to: 'po', type: 'gate-verify-large', priority: 'LOW',
    createdAt: '2026-07-21T00:00:00Z', payload: { note: 'ENOBUFS maxBuffer regression gate' },
  };
  fs.writeFileSync(path.join(sigDir, 'gate-verify-large-signal.json'), JSON.stringify(sigFile));

  // Pad past Node's default execFileSync maxBuffer (1,048,576 bytes) with margin —
  // mirrors the live orch-state.json's real 2026-07-21 overflow (1,109,434 bytes).
  const PADDING_BYTES = 1_300_000;
  const orchStateFixture = {
    head: { status: 'idle', active_task_id: null, next_agent: null },
    task_board: { backlog: [], active_sprints: [] },
    dashboard_section_cache: { _test_padding: 'x'.repeat(PADDING_BYTES) },
    signal_queue: {
      _updated_at: '2026-07-21T00:00:00Z',
      _updated_by: 'test-harness',
      rows: [
        { id: 'gate-verify-large-row', summary: 'gate verify large', severity: 'LOW', status: 'NEW', payload_ref: 'docs/signals/gate-verify-large-signal.json' },
      ],
      archive: [],
    },
  };
  const fixtureText = JSON.stringify(orchStateFixture, null, 2);
  fs.writeFileSync(orchStatePath, fixtureText);
  assert('ENOBUFS gate precondition: fixture itself exceeds Node default maxBuffer (1,048,576 bytes)', fixtureText.length > 1_048_576, true);

  const run = spawnSync('node', [scriptPath], { encoding: 'utf8' });
  assert('ENOBUFS gate: drain process itself does not crash on a >1MB orch-state.json', run.status, 0);

  const finalOrch = JSON.parse(fs.readFileSync(orchStatePath, 'utf8'));
  const row = finalOrch.signal_queue.rows.find((r) => r.id === 'gate-verify-large-row');
  assert('ENOBUFS gate: file moved to processed/ regardless of orch-state.json size', fs.existsSync(path.join(sigDir, 'processed/gate-verify-large-signal.json')), true);
  assert('ENOBUFS gate: payload_ref repointed to processed/ path even when orch-state.json > 1MB', row && row.payload_ref, 'docs/signals/processed/gate-verify-large-signal.json');
  if (!row || row.payload_ref !== 'docs/signals/processed/gate-verify-large-signal.json') {
    console.log(`        ENOBUFS gate stderr: ${run.stderr}`);
  }

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
