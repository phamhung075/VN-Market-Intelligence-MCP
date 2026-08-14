#!/usr/bin/env node
// scripts/agents-flow/drain-signals-durable.test.js — AC-2 negative-control harness for
// FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE (architect brief docs/architecture-briefs/
// 2026-07-25-devteam-idle-chain-rotation-durable-inbox.md §3.1-3.4).
//
// Proves the append-before-destructive durable-inbox contract end-to-end, across the tick
// chain a real dev-team session walks (drain -> rotation -> Step 1 PO Triage), NOT just the
// single-drain-call scenarios already covered by scripts/agents-flow/drain-signals.test.js:
//
//   Scenario 1 — append succeeds -> destructive drain runs -> pending_triage_inbox is fully
//                populated (all N entries, full payload, never a pointer).
//   Scenario 2 — SHORT-CIRCUIT: a later tick's rotation winner is bounded1 (NOT step1_triage)
//                -> bounded1's REAL promote+claim scripts run and move board state -> the
//                durable inbox from scenario 1 is byte-identical afterward (not lost).
//   Scenario 3 — TRIAGE TURN: step1_triage's own read (main.md §"Durable-inbox read") + its own
//                subtractive-by-envelope_id clear (main.md §"Durable-inbox CLEAR") — both jq
//                filters reused byte-verbatim from docs/agents/dev-team/flow/main.md, not
//                reimplemented — empty the inbox completely.
//   Scenario 3b — a concurrent append landing BETWEEN Step 1's read and its clear write survives
//                the subtractive clear untouched (proves "never a blind `= []`" — brief §3.2's
//                explicit defensive-against-concurrent-append design point).
//   Scenario 4 — append FAILS (durable-inbox orch-apply.sh write blocked by a read-only
//                containing directory — a genuinely different failure point than the pre-existing
//                "orch-state.json missing" scenario in drain-signals.test.js, which fails at
//                drain-signals.js's own !fs.existsSync(ORCH_STATE) early-exit instead of inside
//                orch-apply.sh's own write step): NO destructive action, source files/DB rows
//                untouched, byte-identical orch-state.json — then RETRY once the directory is
//                writable again succeeds cleanly (recovery-on-retry, explicitly called out as the
//                hardest part of this scenario in the task's own Risk & Constraints section).
//
// Plus two supporting negative controls:
//   - Backward-compat: a pre-migration fixture with NO `dev_team_idle_chain` key at all must not
//     crash Step 1's own read (defaults to `[]`) and must bootstrap the key cleanly on first append.
//   - Conservation Guard Extension (subtask 2, scripts/orch-conservation-check.mjs §3.4,
//     UPDATED 2026-08-14 by FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-
//     CLEAR — see that script's own header for the full rationale): `pending_triage_inbox` was
//     removed from the `signal_total` magnitude ratio (it is a drain-to-zero queue, not an
//     accumulating log) and is now guarded by its own independent, never-bypassable per-envelope
//     row-identity dimension instead. An UNDECLARED candidate that silently drops entries (full
//     wipe OR a single entry) is REJECTED; the SAME drop is ACCEPTED once every dropped
//     `envelope_id` is named via `ORCH_APPLY_DECLARED_INBOX_TRIAGED` — the exact declaration
//     `docs/agents/dev-team/flow/main.md` § Step 1 "Durable-inbox CLEAR" now makes, letting a
//     full clear-to-zero land in ONE write instead of the artificial multi-write sub-batching PO
//     previously needed. A normal single-entry inbox growth (zero drops) is NOT blocked either way.
//
// ISOLATION: every scenario builds its own mkdtemp harness — a full self-contained COPY of
// drain-signals.js + the real orch-apply.sh/orch-validate.mjs/orch-conservation-check.mjs/
// orchStateSchema.ts gate chain (mirrors scripts/agents-flow/drain-signals.test.js's
// makeOrchRefHarness() pattern — duplicated here, not required-in, because that file is a
// standalone runnable script with top-level side effects, not an importable module) + (scenario 2
// only) the REAL scripts/devteam-backlog-{promote,claim}-bounded1.jq + their
// scripts/lib/devteam-eligibility.jq dependency. node_modules is SYMLINKED (never copied) for zod
// resolution. NEVER touches the live docs/data/orch/orch-state.json or docs/signals/*.json.
//
// Run: node scripts/agents-flow/drain-signals-durable.test.js
// Exit 0 = all pass, Exit 1 = any fail.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DRAIN_SCRIPT = path.join(REPO_ROOT, 'scripts/agents-flow/drain-signals.js');

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
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

// ---------------------------------------------------------------------------
// Harness builder — real orch-apply.sh/orch-validate.mjs/orch-conservation-check.mjs/
// orchStateSchema.ts chain, isolated copy (drain-signals.test.js's makeOrchRefHarness()
// pattern, duplicated per this file's own header note above). withEligibilityChain also
// copies the bounded1 promote/claim scripts + their shared eligibility lib (Scenario 2 only).
// ---------------------------------------------------------------------------
function deriveOrchApplyHelpers() {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/orch-apply.sh'), 'utf8');
  const re = /\$\{REPO_ROOT\}\/scripts\/([A-Za-z0-9_-]+\.(?:sh|mjs|js))/g;
  const found = new Set();
  let m;
  while ((m = re.exec(src)) !== null) found.add(`scripts/${m[1]}`);
  if (found.size === 0) {
    throw new Error('deriveOrchApplyHelpers(): matched 0 helpers in orch-apply.sh — regex is stale, fix it before trusting this harness');
  }
  return [...found];
}

function makeDurableHarness({ withEligibilityChain = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drain-durable-test-'));
  fs.mkdirSync(path.join(dir, 'scripts/agents-flow'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/signals'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/data/orch/archive'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'apps/mcp-server/src/infrastructure'), { recursive: true });

  fs.copyFileSync(SRC_DRAIN_SCRIPT, path.join(dir, 'scripts/agents-flow/drain-signals.js'));
  for (const rel of ['scripts/orch-apply.sh', ...deriveOrchApplyHelpers()]) {
    fs.copyFileSync(path.join(REPO_ROOT, rel), path.join(dir, rel));
  }
  fs.copyFileSync(
    path.join(REPO_ROOT, 'apps/mcp-server/src/infrastructure/orchStateSchema.ts'),
    path.join(dir, 'apps/mcp-server/src/infrastructure/orchStateSchema.ts'),
  );
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  fs.symlinkSync(path.join(REPO_ROOT, 'apps/mcp-server/node_modules'), path.join(dir, 'apps/mcp-server/node_modules'));

  if (withEligibilityChain) {
    fs.mkdirSync(path.join(dir, 'scripts/lib'), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, 'scripts/lib/devteam-eligibility.jq'), path.join(dir, 'scripts/lib/devteam-eligibility.jq'));
    fs.copyFileSync(path.join(REPO_ROOT, 'scripts/devteam-backlog-promote-bounded1.jq'), path.join(dir, 'scripts/devteam-backlog-promote-bounded1.jq'));
    fs.copyFileSync(path.join(REPO_ROOT, 'scripts/devteam-backlog-claim-bounded1.jq'), path.join(dir, 'scripts/devteam-backlog-claim-bounded1.jq'));
    // Empty-but-valid detail/archive inputs (same convention as
    // scripts/audits/devteam-dispatch-gate-satisfiability.sh's own `empty-archive.json`:
    // `--slurpfile` on a 0-byte file yields `[]`) — our synthetic backlog row has no
    // detail_ref/depends_on, so it needs neither a real detail entry nor archive lookups.
    fs.writeFileSync(path.join(dir, 'docs/data/orch/archive/backlog-detail.json'), JSON.stringify({ items: [] }));
    fs.writeFileSync(path.join(dir, 'empty-archive.json'), '');
  }

  execFileSync('sqlite3', [path.join(dir, 'docs/signals/signals.db'), SCHEMA]);
  return dir;
}

function cleanup(dir) {
  // Scenario 4 leaves docs/data/orch/ read-only mid-run — restore write permission first,
  // else a recursive rmSync EACCES-fails partway through and leaks the mkdtemp fixture.
  try { fs.chmodSync(path.join(dir, 'docs/data/orch'), 0o755); } catch (e) { /* dir may not exist yet */ }
  fs.rmSync(dir, { recursive: true, force: true });
}

function seedSignal(sigDir, filename, obj) {
  fs.writeFileSync(path.join(sigDir, filename), JSON.stringify(obj));
}

function seedOrchState(orchStatePath, extra = {}) {
  fs.writeFileSync(orchStatePath, JSON.stringify({
    head: { status: 'idle', active_task_id: null, next_agent: null },
    task_board: {
      backlog: [], ready: [], in_progress: [], review: [], qa: [], done: [], done_verified: [],
      active_sprints: [],
    },
    signal_queue: { _updated_at: '2026-08-09T00:00:00Z', _updated_by: 'test-harness', rows: [] },
    ...extra,
  }, null, 2));
}

function runDrain(h) {
  return spawnSync('node', [path.join(h, 'scripts/agents-flow/drain-signals.js')], { encoding: 'utf8' });
}

// Runs the REAL bounded1 promote + claim scripts (jq `include` resolves relative to CWD —
// verified empirically, see scripts/lib/devteam-eligibility.jq's own header — hence {cwd: h}
// with repo-root-relative script paths, mirroring every real caller's own invocation contract).
function runBounded1(h, orchStatePath) {
  const NOW = '2026-08-09T12:00:00Z';
  const DETAIL = path.join(h, 'docs/data/orch/archive/backlog-detail.json');
  const ARCHIVE = path.join(h, 'empty-archive.json');
  const promoted = execFileSync('jq', [
    '--arg', 'now', NOW, '--slurpfile', 'detail', DETAIL, '--slurpfile', 'archive', ARCHIVE,
    '-f', 'scripts/devteam-backlog-promote-bounded1.jq', orchStatePath,
  ], { cwd: h, encoding: 'utf8' });
  fs.writeFileSync(orchStatePath, promoted);
  const claimed = execFileSync('jq', [
    '--arg', 'now', NOW, '-f', 'scripts/devteam-backlog-claim-bounded1.jq', orchStatePath,
  ], { cwd: h, encoding: 'utf8' });
  fs.writeFileSync(orchStatePath, claimed);
}

// Step 1's own subtractive-clear filter, byte-verbatim from docs/agents/dev-team/flow/main.md
// § Step 1 — PO Triage "Durable-inbox CLEAR" block (never a blind `= []` — brief §3.2).
const STEP1_CLEAR_FILTER = '.dev_team_idle_chain.pending_triage_inbox |= map(select(.envelope_id as $i | ($ids|index($i))|not))';

function step1Read(orchStatePath) {
  const out = execFileSync('jq', ['-c', '.dev_team_idle_chain.pending_triage_inbox // []', orchStatePath], { encoding: 'utf8' });
  return JSON.parse(out);
}

function step1Clear(orchStatePath, consumedIds) {
  const out = execFileSync('jq', ['--argjson', 'ids', JSON.stringify(consumedIds), STEP1_CLEAR_FILTER, orchStatePath], { encoding: 'utf8' });
  fs.writeFileSync(orchStatePath, out);
}

const ESC_FIXTURES = [
  { file: 'sig-esc.json', obj: { from: 'bctc-analyst', to: 'dev-team', type: 'esc-deep-dive-request', priority: 'HIGH', createdAt: '2026-08-09T10:00:00Z', payload: { trigger_id: 'ESC-2', ticker: 'DURTEST', quarter: 'Q2-2026', report_id: 'r1', guard_key: 'esc-deepdive:DURTEST:Q2-2026:ESC-2', context: { a: 1 }, all_esc_fired: ['ESC-2'] } } },
  { file: 'sig-audit.json', obj: { from: 'tran-ngoc-bau', to: 'dev-team', type: 'audit-handoff', priority: 'MED', createdAt: '2026-08-09T10:01:00Z', payload: { note: 'audit finding' } } },
  { file: 'sig-cired.json', obj: { from: 'ci-health-probe', to: 'dev-team', type: 'ci_red', priority: 'HIGH', createdAt: '2026-08-09T10:02:00Z', payload: { pipeline: 'gate' } } },
  { file: 'sig-generic.json', obj: { from: 'unified-agent', to: 'dev-team', type: 'anomaly_generic', priority: 'LOW', createdAt: '2026-08-09T10:03:00Z', payload: { note: 'generic' } } },
];

// ============================================================================
// Scenario 1 — append succeeds, destructive happens
// ============================================================================
let scenario1Harness;
let scenario1OrchStatePath;
let scenario1InboxSnapshot;
{
  const h = makeDurableHarness();
  const sigDir = path.join(h, 'docs/signals');
  const orchStatePath = path.join(h, 'docs/data/orch/orch-state.json');
  seedOrchState(orchStatePath);
  for (const f of ESC_FIXTURES) seedSignal(sigDir, f.file, f.obj);

  const run = runDrain(h);
  assert('S1: drain exits 0', run.status, 0);
  for (const f of ESC_FIXTURES) {
    assert(`S1: ${f.file} moved to processed/`, fs.existsSync(path.join(sigDir, 'processed', f.file)), true);
  }
  assert('S1: db_count matches N=4 inserts', /db_count=4/.test(run.stdout), true);

  const doc = JSON.parse(fs.readFileSync(orchStatePath, 'utf8'));
  const inbox = doc.dev_team_idle_chain?.pending_triage_inbox ?? [];
  assert('S1: pending_triage_inbox has exactly N=4 entries', inbox.length, ESC_FIXTURES.length);
  for (const f of ESC_FIXTURES) {
    const entry = inbox.find((e) => e.from === f.obj.from && e.type === f.obj.type);
    assert(`S1: inbox entry present for ${f.file} (from=${f.obj.from}/type=${f.obj.type})`, !!entry, true);
    if (entry) {
      assert(`S1: inbox entry payload for ${f.file} matches source (deep-equal, inlined not a pointer)`, entry.payload, f.obj.payload);
      assert(`S1: inbox entry source="file" for ${f.file}`, entry.source, 'file');
    }
  }

  // Keep this harness alive — scenarios 2/3/3b chain off its post-drain orch-state.json
  // (same durable inbox contents a real multi-tick dev-team session would carry forward).
  scenario1Harness = h;
  scenario1OrchStatePath = orchStatePath;
  scenario1InboxSnapshot = inbox;
}

// ============================================================================
// Scenario 2 — short-circuit (non-triage dispatch): signals retained, not lost
// ============================================================================
{
  const h = makeDurableHarness({ withEligibilityChain: true });
  const orchStatePath = path.join(h, 'docs/data/orch/orch-state.json');
  fs.copyFileSync(scenario1OrchStatePath, orchStatePath);

  const before = JSON.parse(fs.readFileSync(orchStatePath, 'utf8'));
  assert("S2 precondition: inbox carries scenario 1's N=4 entries into this tick", before.dev_team_idle_chain?.pending_triage_inbox?.length, scenario1InboxSnapshot.length);

  // Seed ONE eligible BOUNDED-1 backlog candidate — proves bounded1 actually FIRES this tick
  // (not a vacuous no-op that would make "inbox unchanged" trivially true for the wrong reason).
  before.task_board.backlog.push({ id: 'DURABLE-TEST-SYNTH-BOUNDED1', status: 'BACKLOG', priority: 'P2', type: 'FIX', zone: 'cross-service/', next_agent: 'developer' });
  fs.writeFileSync(orchStatePath, JSON.stringify(before, null, 2));

  runBounded1(h, orchStatePath);

  const after = JSON.parse(fs.readFileSync(orchStatePath, 'utf8'));
  assert('S2: bounded1 actually fired — candidate row moved to in_progress[]', (after.task_board.in_progress || []).some((r) => r.id === 'DURABLE-TEST-SYNTH-BOUNDED1'), true);
  assert('S2: durable inbox byte-identical after bounded1 runs (short-circuit does not lose signals)', after.dev_team_idle_chain.pending_triage_inbox, before.dev_team_idle_chain.pending_triage_inbox);
  assert('S2: inbox still carries all N=4 original entries', after.dev_team_idle_chain.pending_triage_inbox.length, scenario1InboxSnapshot.length);

  cleanup(h);
}

// ============================================================================
// Scenario 3 — triage turn: read inbox, subtractive clear by envelope_id
// ============================================================================
{
  const h = makeDurableHarness();
  const orchStatePath = path.join(h, 'docs/data/orch/orch-state.json');
  fs.copyFileSync(scenario1OrchStatePath, orchStatePath);

  const pendingSignals = step1Read(orchStatePath);
  assert('S3: read returns all N=4 entries carried over from prior ticks', pendingSignals.length, scenario1InboxSnapshot.length);

  const consumedIds = pendingSignals.map((e) => e.envelope_id);
  step1Clear(orchStatePath, consumedIds);

  const doc = JSON.parse(fs.readFileSync(orchStatePath, 'utf8'));
  assert('S3: inbox fully emptied after PO triages every entry (0 remaining)', doc.dev_team_idle_chain.pending_triage_inbox.length, 0);

  cleanup(h);
}

// ---------------------------------------------------------------------------
// Scenario 3b — concurrent-append survives the subtractive clear (proves "never a blind
// `= []`" — main.md's own "Durable-inbox CLEAR" comment / brief §3.2's explicit
// defensive-against-concurrent-append design point: an entry landing between Step 1's read
// and its clear write must NOT be wiped out by that clear).
// ---------------------------------------------------------------------------
{
  const h = makeDurableHarness();
  const orchStatePath = path.join(h, 'docs/data/orch/orch-state.json');
  fs.copyFileSync(scenario1OrchStatePath, orchStatePath);

  const pendingSignals = step1Read(orchStatePath);
  const consumedIds = pendingSignals.map((e) => e.envelope_id);

  // Simulate a concurrent append landing AFTER the read above, BEFORE the clear write below —
  // a brand-new envelope PO never saw this turn.
  const lateEntry = {
    envelope_id: 'late-concurrent-envelope', source: 'file', from: 'race-agent', to: 'dev-team',
    type: 'race-signal', priority: 'LOW', payload: { note: 'landed mid-triage' },
    createdAt: '2026-08-09T11:00:00Z', drained_at: '2026-08-09T11:00:00Z', routed_to: 'PO Step 0-SIG',
  };
  const withLateAppend = JSON.parse(fs.readFileSync(orchStatePath, 'utf8'));
  withLateAppend.dev_team_idle_chain.pending_triage_inbox.push(lateEntry);
  fs.writeFileSync(orchStatePath, JSON.stringify(withLateAppend, null, 2));

  step1Clear(orchStatePath, consumedIds);

  const doc = JSON.parse(fs.readFileSync(orchStatePath, 'utf8'));
  assert('S3b: subtractive clear leaves EXACTLY the late-concurrent entry (not blind-wiped)', doc.dev_team_idle_chain.pending_triage_inbox.length, 1);
  assert('S3b: surviving entry is the late-concurrent one, not a stale one', doc.dev_team_idle_chain.pending_triage_inbox[0]?.envelope_id, 'late-concurrent-envelope');

  cleanup(h);
}

cleanup(scenario1Harness); // release scenario 1's harness now that S2/S3/S3b are done reading from its snapshot

// ============================================================================
// Scenario 4 — append FAILS (read-only orch dir): NO destructive action; retry-on-recovery
// once the directory is writable again.
// ============================================================================
{
  const h = makeDurableHarness();
  const sigDir = path.join(h, 'docs/signals');
  const orchDir = path.join(h, 'docs/data/orch');
  const orchStatePath = path.join(orchDir, 'orch-state.json');
  seedOrchState(orchStatePath);

  const fixture = { file: 'sig-readonly.json', obj: { from: 'bctc-analyst', to: 'dev-team', type: 'esc-deep-dive-request', priority: 'HIGH', createdAt: '2026-08-09T10:00:00Z', payload: { trigger_id: 'ESC-9', ticker: 'RODIR', quarter: 'Q2-2026', report_id: 'r2', guard_key: 'esc-deepdive:RODIR:Q2-2026:ESC-9', context: {}, all_esc_fired: ['ESC-9'] } } };
  seedSignal(sigDir, fixture.file, fixture.obj);

  const beforeState = fs.readFileSync(orchStatePath, 'utf8');

  // Make the CONTAINING DIRECTORY read-only (r-xr-xr-x, no write bit) — orch-apply.sh's own
  // `mktemp "$(dirname LIVE_FILE)/.orch-apply-XXXXXXXX.json"` needs write permission on this
  // directory; the file itself stays readable (existence/mtime checks still pass), so this
  // fails INSIDE orch-apply.sh's own write step — a genuinely distinct failure point from the
  // pre-existing "no orch-state.json" scenario in drain-signals.test.js (which fails at
  // drain-signals.js's own `!fs.existsSync(ORCH_STATE)` early-exit branch instead).
  fs.chmodSync(orchDir, 0o555);

  let run1;
  try {
    run1 = runDrain(h);
    assert('S4: drain process itself does not crash on a durable-append failure', run1.status, 0);
    assert('S4: stderr carries the durable-inbox append WARN', /WARN: durable-inbox append failed/.test(run1.stderr), true);
    assert('S4: stdout reports RETAINED, not routed-to-po', new RegExp(`${fixture.file} → RETAINED`).test(run1.stdout), true);
    assert('S4: source file NOT moved to processed/ (destructive action skipped)', fs.existsSync(path.join(sigDir, 'processed', fixture.file)), false);
    assert('S4: source file still present at top-level docs/signals/', fs.existsSync(path.join(sigDir, fixture.file)), true);
    assert('S4: zero DB inserts (fingerprint not written)', /inserted=0/.test(run1.stdout), true);
  } finally {
    // Restore write permission BEFORE any further read/assert — orch-state.json itself must
    // be byte-UNCHANGED by the failed attempt (no partial write leaked past mktemp's failure).
    fs.chmodSync(orchDir, 0o755);
  }
  assert('S4: orch-state.json byte-unchanged after the failed append attempt', fs.readFileSync(orchStatePath, 'utf8'), beforeState);

  // Retry-on-recovery (task's own Risk & Constraints: "ensure the retry/recovery semantics are
  // correct before claiming append failed") — same tick logic, directory now writable again,
  // must succeed cleanly with nothing lost.
  const run2 = runDrain(h);
  assert('S4 recovery: retry after directory becomes writable exits 0', run2.status, 0);
  assert('S4 recovery: source file now moved to processed/', fs.existsSync(path.join(sigDir, 'processed', fixture.file)), true);
  assert('S4 recovery: db_count=1 after successful retry', /db_count=1/.test(run2.stdout), true);
  const recoveredDoc = JSON.parse(fs.readFileSync(orchStatePath, 'utf8'));
  assert('S4 recovery: pending_triage_inbox now has exactly 1 entry (the retried signal)', recoveredDoc.dev_team_idle_chain?.pending_triage_inbox?.length, 1);

  cleanup(h);
}

// ---------------------------------------------------------------------------
// Backward-compat — main.md's `.dev_team_idle_chain.pending_triage_inbox // []` default: a
// fixture with NO `dev_team_idle_chain` key at all (pre-migration live-file shape) must not
// crash Step 1's own read, and a subsequent append must bootstrap the key cleanly.
// ---------------------------------------------------------------------------
{
  const h = makeDurableHarness();
  const orchStatePath = path.join(h, 'docs/data/orch/orch-state.json');
  seedOrchState(orchStatePath); // deliberately omits dev_team_idle_chain
  const preDoc = JSON.parse(fs.readFileSync(orchStatePath, 'utf8'));
  assert('backward-compat: fixture has no dev_team_idle_chain key (pre-migration shape)', 'dev_team_idle_chain' in preDoc, false);
  assert("backward-compat: Step 1's own read defaults the missing key to [] (no crash)", step1Read(orchStatePath), []);

  const sigDir = path.join(h, 'docs/signals');
  seedSignal(sigDir, 'sig-bootstrap.json', { from: 'bctc-analyst', to: 'dev-team', type: 'esc-deep-dive-request', priority: 'HIGH', createdAt: '2026-08-09T10:00:00Z', payload: { trigger_id: 'ESC-1', ticker: 'BOOT', quarter: 'Q2-2026', report_id: 'r3', guard_key: 'esc-deepdive:BOOT:Q2-2026:ESC-1', context: {}, all_esc_fired: ['ESC-1'] } });
  const run = runDrain(h);
  assert('backward-compat: drain succeeds and bootstraps dev_team_idle_chain on first write', run.status, 0);
  const postDoc = JSON.parse(fs.readFileSync(orchStatePath, 'utf8'));
  assert('backward-compat: pending_triage_inbox now has 1 entry', postDoc.dev_team_idle_chain?.pending_triage_inbox?.length, 1);

  cleanup(h);
}

// ============================================================================
// Conservation Guard Extension (subtask 2 — scripts/orch-conservation-check.mjs §3.4):
// ORIGINALLY signal_total() counted BOTH signal_queue.rows AND
// dev_team_idle_chain.pending_triage_inbox (FIX-DEVTEAM-IDLE-CHAIN-TEST-DURABLE, 2026-08-09).
// SUPERSEDED (FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR,
// 2026-08-14): the inbox is a drain-to-zero QUEUE (main.md § Step 1 "Durable-inbox CLEAR"), not
// an accumulating log like signal_queue.rows[] — folding it into the magnitude ratio meant a
// single large LEGITIMATE clear tripped the same floor built to catch accidental mass-deletion,
// with no sanctioned bypass. The inbox is now EXCLUDED from signal_total entirely and given its
// own independent, never-bypassable per-envelope row-identity guard instead
// (ORCH_APPLY_DECLARED_INBOX_TRIAGED, mirrors signal_queue.rows[]'s existing
// ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS one level down). Calls the REAL bun script directly (no
// orch-apply.sh chain needed — this is a pure live-vs-candidate file comparator, not a write
// path) against hand-built fixtures.
// ============================================================================
{
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'conservation-inbox-test-'));
  const livePath = path.join(h, 'live.json');
  const candidatePath = path.join(h, 'candidate.json');
  const checkScript = path.join(REPO_ROOT, 'scripts/orch-conservation-check.mjs');

  // Fixed signal_queue.rows (SAME ids live vs candidate, both fixtures below) — keeps the
  // separate, independent signal_queue.rows[] row-identity dimension a clean pass so only the
  // pending_triage_inbox-driven dimension is under test here.
  const fixedRows = [
    { id: 'row-1', summary: 'r1', severity: 'LOW', status: 'NEW' },
    { id: 'row-2', summary: 'r2', severity: 'LOW', status: 'NEW' },
  ];
  const baseDoc = () => ({
    head: { status: 'idle', active_task_id: null, next_agent: null },
    task_board: { backlog: [], active_sprints: [] }, // task_total=0 < MIN_BASELINE(10) -> that metric is inert here, deliberately
    signal_queue: { _updated_at: '2026-08-09T00:00:00Z', _updated_by: 'test-harness', rows: fixedRows, archive: [] },
  });

  // --- Case A: silent full inbox wipe, UNDECLARED -> MUST still be rejected ----------------
  // Live: 2 signal_queue.rows (unchanged, ratio 1.0 — inert) + 10 pending_triage_inbox entries.
  // Candidate: same 2 rows, pending_triage_inbox WIPED to [] with NO
  // ORCH_APPLY_DECLARED_INBOX_TRIAGED set -> the inbox row-identity dimension (not signal_total
  // magnitude — that metric no longer includes this array at all) rejects it: 10 undeclared
  // envelope_id drops -> exit 1. Proves the "accidental full wipe" catch AC-1 requires still
  // holds even though the magnitude dimension that used to (partially) provide it is gone.
  {
    const liveDoc = baseDoc();
    liveDoc.dev_team_idle_chain = {
      pending_triage_inbox: Array.from({ length: 10 }, (_, i) => ({ envelope_id: `env-${i}`, source: 'file', from: 'x', to: 'dev-team', type: 'y', priority: 'LOW', payload: {}, createdAt: '2026-08-09T00:00:00Z' })),
    };
    const candidateDoc = baseDoc();
    candidateDoc.dev_team_idle_chain = { pending_triage_inbox: [] };
    fs.writeFileSync(livePath, JSON.stringify(liveDoc, null, 2));
    fs.writeFileSync(candidatePath, JSON.stringify(candidateDoc, null, 2));

    const run = spawnSync('bun', [checkScript, livePath, candidatePath], { encoding: 'utf8' });
    assert('conservation-ext: silent pending_triage_inbox wipe (10->0, undeclared, rows unchanged) is REJECTED — exit 1', run.status, 1);
    assert('conservation-ext: rejection reason names pending_triage_inbox row-identity', /pending_triage_inbox/.test(run.stdout + run.stderr), true);
  }

  // --- Case A2: same full wipe, but EVERY id declared via ORCH_APPLY_DECLARED_INBOX_TRIAGED --
  // MUST be accepted — proves a legitimate full clear-to-zero lands in ONE write, the entire
  // point of this task (AC-3, real fixture: scripts/test/orch-apply-wrapper-tests.sh
  // INBOX-FULL-DRAIN-DECLARED exercises the identical shape through the full orch-apply.sh chain).
  {
    const liveDoc = baseDoc();
    const ids = Array.from({ length: 10 }, (_, i) => `env-${i}`);
    liveDoc.dev_team_idle_chain = {
      pending_triage_inbox: ids.map((envelope_id) => ({ envelope_id, source: 'file', from: 'x', to: 'dev-team', type: 'y', priority: 'LOW', payload: {}, createdAt: '2026-08-09T00:00:00Z' })),
    };
    const candidateDoc = baseDoc();
    candidateDoc.dev_team_idle_chain = { pending_triage_inbox: [] };
    fs.writeFileSync(livePath, JSON.stringify(liveDoc, null, 2));
    fs.writeFileSync(candidatePath, JSON.stringify(candidateDoc, null, 2));

    const run = spawnSync('bun', [checkScript, livePath, candidatePath], {
      encoding: 'utf8',
      env: { ...process.env, ORCH_APPLY_DECLARED_INBOX_TRIAGED: ids.join(',') },
    });
    assert('conservation-ext: full inbox wipe (10->0) WITH every id declared is accepted — exit 0', run.status, 0);
  }

  // --- Case B: normal single-entry inbox growth -> MUST NOT be blocked (regression parity) --
  {
    const liveDoc = baseDoc();
    liveDoc.dev_team_idle_chain = { pending_triage_inbox: Array.from({ length: 10 }, (_, i) => ({ envelope_id: `env-${i}` })) };
    const candidateDoc = baseDoc();
    candidateDoc.dev_team_idle_chain = { pending_triage_inbox: [...liveDoc.dev_team_idle_chain.pending_triage_inbox, { envelope_id: 'env-new' }] };
    fs.writeFileSync(livePath, JSON.stringify(liveDoc, null, 2));
    fs.writeFileSync(candidatePath, JSON.stringify(candidateDoc, null, 2));

    const run = spawnSync('bun', [checkScript, livePath, candidatePath], { encoding: 'utf8' });
    assert('conservation-ext: normal single-entry inbox append is NOT blocked — exit 0', run.status, 0);
  }

  // --- Case C: single-entry inbox CONSUME (Step 1 clearing one entry), DECLARED -> MUST NOT be
  // blocked — this is the exact shape main.md § Step 1 "Durable-inbox CLEAR" now produces: it
  // already computes consumed_ids and passes them through as ORCH_APPLY_DECLARED_INBOX_TRIAGED.
  {
    const liveDoc = baseDoc();
    liveDoc.dev_team_idle_chain = { pending_triage_inbox: Array.from({ length: 10 }, (_, i) => ({ envelope_id: `env-${i}` })) };
    const candidateDoc = baseDoc();
    candidateDoc.dev_team_idle_chain = { pending_triage_inbox: liveDoc.dev_team_idle_chain.pending_triage_inbox.slice(1) };
    fs.writeFileSync(livePath, JSON.stringify(liveDoc, null, 2));
    fs.writeFileSync(candidatePath, JSON.stringify(candidateDoc, null, 2));

    const run = spawnSync('bun', [checkScript, livePath, candidatePath], {
      encoding: 'utf8',
      env: { ...process.env, ORCH_APPLY_DECLARED_INBOX_TRIAGED: 'env-0' },
    });
    assert('conservation-ext: single-entry inbox consume (10->9), declared, is NOT blocked — exit 0', run.status, 0);
  }

  // --- Case D: same single-entry consume, UNDECLARED -> MUST be rejected -------------------
  // Negative control: this exact shape (9/10 = 90% retained) sailed through the OLD magnitude
  // floor trivially — proves the new row-identity dimension catches even a small undeclared
  // drop, not just a full wipe (AC-1's literal "every envelope_id ... with no corresponding
  // marker" wording, not just a full-wipe special case).
  {
    const liveDoc = baseDoc();
    liveDoc.dev_team_idle_chain = { pending_triage_inbox: Array.from({ length: 10 }, (_, i) => ({ envelope_id: `env-${i}` })) };
    const candidateDoc = baseDoc();
    candidateDoc.dev_team_idle_chain = { pending_triage_inbox: liveDoc.dev_team_idle_chain.pending_triage_inbox.slice(1) };
    fs.writeFileSync(livePath, JSON.stringify(liveDoc, null, 2));
    fs.writeFileSync(candidatePath, JSON.stringify(candidateDoc, null, 2));

    const run = spawnSync('bun', [checkScript, livePath, candidatePath], { encoding: 'utf8' });
    assert('conservation-ext: single-entry inbox consume (10->9), UNDECLARED, is REJECTED — exit 1', run.status, 1);
  }

  fs.rmSync(h, { recursive: true, force: true });
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
