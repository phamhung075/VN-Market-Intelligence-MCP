#!/usr/bin/env node
// Canonical drain helper for docs/agents/dev-team/flow/drain-signals.md §0a-1 + §0a-2.
// Drains docs/signals/*.json → fingerprint dedup vs signals.db → durable-inbox append (gate) →
// processed/ + DB INSERT → 7-day prune.
// DRAIN-INJECTION-SAFE: payload fields never touch a shell command line (sqlite3 fed via stdin, SQL built with '' escaping).
// Scope: file drain + signal_queue.rows[].payload_ref repoint (FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE,
//   2026-07-21 — see below). Queue-row READ-marking (§0a-D) and the flow's own commit stay in the flow
//   (dispatcher duties) — this script's orch-state write is a SEPARATE, self-contained orch-apply.sh
//   write, gated + committed independently of the flow's §0a-D-PRUNE commit.
// Usage: node scripts/agents-flow/drain-signals.js   (run from anywhere; repo root derived from script location)
// First shipped 2026-06-07 after the bash one-liner equivalent wedged (zero-CPU hang, nested-quote eval).
//
// FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE (2026-07-21): this script used to move docs/signals/*.json →
// processed/ with ZERO awareness of orch-state.json .signal_queue — any row whose payload_ref pointed
// at a file this script moved would dangle, hard-failing scripts/orch-validate.mjs Stage 1c on the
// NEXT orch-apply write, fleet-wide, for ANY agent (recurred 4x live 2026-07-21). Fix: after the file
// move loop, rewrite every signal_queue.rows[].payload_ref that pointed at a moved file to its new
// processed/ location, in a dedicated orch-apply.sh-gated write (Zod schema + conservation + CAS —
// same gate every other orch-state writer goes through). Test: scripts/agents-flow/drain-signals.test.js
// "FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE" scenario (isolated harness, never touches the live orch-state.json).
//
// FIX-DRAINPRUNE-SKIP-LIVE-REFERENCED-PROCESSED-FILES (2026-07-23): the above fix only covers the
// MOVE step — the separate 7-day PRUNE step (below) still deleted any aged-out processed/ file
// unconditionally, including ones still referenced by a live task_board detail_ref or signal_queue
// payload_ref, leaving the SAME class of Stage 1c dangling ref (recurred 2026-07-23, drain commit
// 395e224ad). Fix: before pruning a candidate, check it against a referenced-basename set gathered
// from ORCH_STATE (mirrors Stage 1c's own checkRefIntegrity() walk) and SKIP the delete if referenced.
// Test: scripts/agents-flow/drain-signals.test.js "FIX-DRAINPRUNE-SKIP-LIVE-REFERENCED-PROCESSED-FILES"
// scenario (isolated harness, never touches the live orch-state.json).
//
// FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN (2026-08-08): destructive-before-delivery bug —
// this script used to classify+move+fingerprint+INSERT every file in the SAME pass that decided
// routing, with zero durable record surviving anywhere if the calling dev-team tick short-circuited
// before Step 1 PO Triage ran (rotation picks a different lane that tick) — the file was already
// gone from docs/signals/ the instant mv() ran, recoverable only by hand-reading processed/ before
// the 7-day prune. Fix (architect brief docs/architecture-briefs/2026-07-25-devteam-idle-chain-
// rotation-durable-inbox.md §3.1): split into two passes — pass 1 classifies every file
// (non-destructive), builds ONE batch of full-payload envelopes for the tick's newly-routable
// signals, and durably appends the WHOLE batch to `.dev_team_idle_chain.pending_triage_inbox` via
// appendDurableBatch() (below) BEFORE pass 2 runs. Pass 2 (mv/fingerprint/DB-INSERT) executes ONLY
// if the append succeeded; on failure every file is retained untouched, re-evaluated next tick.
// Test: scripts/agents-flow/drain-signals.test.js "FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN"
// scenario (isolated harness, never touches the live orch-state.json).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
// DRAIN_SIGNALS_DIR_OVERRIDE — test-only override (same convention as
// ORCH_APPLY_LIVE_FILE_OVERRIDE below). No-op in production: defaults to the identical
// canonical inbox path. Added FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY (2026-07-23)
// so dev-team-tick-preflight.sh's Step 5 idle-check can point --count-drainable at its
// isolated SIGNALS_DIR test fixtures instead of the live docs/signals/.
const SIG = process.env.DRAIN_SIGNALS_DIR_OVERRIDE || path.join(ROOT, 'docs/signals');
const PROC = path.join(SIG, 'processed');
const DB = path.join(SIG, 'signals.db');
const NOW = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const PROCESSED_BY = process.env.DRAIN_PROCESSED_BY || 'dev-team';
// ORCH_APPLY_LIVE_FILE_OVERRIDE reused from scripts/orch-apply.sh's own convention (test-only override —
// see scripts/orch-cold-evict.sh / scripts/orch-backlog-stub.sh precedent). No-op in production: both
// this script and orch-apply.sh independently default to the identical canonical live path.
const ORCH_STATE = process.env.ORCH_APPLY_LIVE_FILE_OVERRIDE || path.join(ROOT, 'docs/data/orch/orch-state.json');
const ORCH_APPLY_SH = path.join(ROOT, 'scripts', 'orch-apply.sh');
// FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE / ENOBUFS (2026-07-21): hoisted to module scope so
// appendDurableBatch() (FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN, 2026-08-08) can reuse the
// same headroom — its jq filter also emits the whole orch-state document. execFileSync's
// default maxBuffer (measured 1,048,576 bytes on this machine) is smaller than that output
// the moment the live doc crosses ~1MB (measured docs/data/orch/orch-state.json =
// 1,109,434 bytes on 2026-07-21, and the doc only grows) — execFileSync then throws ENOBUFS
// on every future run, permanently. 64MB gives multi-decade headroom over the doc's current
// growth rate; this is cheap (bounded by one process's stdout buffer) so there is no reason
// to be stingy.
const JQ_MAX_BUFFER = 64 * 1024 * 1024;

// Shared drainable-shape predicate (FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY, 2026-07-23):
// a routable signal must carry at least one of from/source OR type/signal_type; a top-level
// array or an object with NEITHER field is litter (state file / cowork telemetry / tick
// residue), not a signal. SAME predicate used by (1) the main drain loop's "SKIP non-signal
// shape" guard below and (2) the --count-drainable subcommand below — single definition,
// never forked (docs/agents/dev-team/flow/drain-signals.md MANDATORY PERSIST GUARD and
// scripts/agents-flow/dev-team-tick-preflight.sh Step 5 idle-check both consume (2) instead
// of a raw `ls docs/signals/*.json | wc -l`, which previously counted litter too).
function isDrainableShape(j) {
  if (Array.isArray(j)) return false;
  if (j.from == null && j.source == null && j.type == null && j.signal_type == null) return false;
  return true;
}

// --count-drainable subcommand (FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY, 2026-07-23).
// Read-only count of docs/signals/*.json (top-level inbox, excludes processed/) that pass
// isDrainableShape() above. No DB open, no file mutation, no orch-state touch — zero side
// effects, safe to call on every tick. Unparseable JSON does not count either (nothing
// routable). Usage: node scripts/agents-flow/drain-signals.js --count-drainable
// Prints "drainable_count=<n>" and exits 0 (n=0 on any degradation — dir missing, etc).
if (process.argv[2] === '--count-drainable') {
  let n = 0;
  try {
    const files = fs.existsSync(SIG) ? fs.readdirSync(SIG).filter(f => f.endsWith('.json')) : [];
    for (const base of files) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(SIG, base), 'utf8'));
        if (isDrainableShape(j)) n++;
      } catch (e) { /* unparseable — not drainable, not counted (mirrors main loop's own catch) */ }
    }
  } catch (e) { /* SIG dir unreadable — count stays 0, never blocks the caller */ }
  console.log(`drainable_count=${n}`);
  process.exit(0);
}

// GATE-B recurrence-count subcommand (FIX-DRAINESC-SEVERITY-RECURRENCE-GATE, 2026-07-04).
// Read-only bootstrap safety-net query for drain-esc-dispatch.md GATE-B Tier 2 (used ONLY when
// GATE-B Tier 1 — board-row-exists — finds nothing). Reuses the SAME signals_processed table this
// script already populates in §0a-1 — no schema change, no write. Self-contained escape helper
// (independent of sqlEsc() below) to avoid touching the existing hardened drain-mode code path.
// Usage: printf '%s' '{"type":"esc-deep-dive-request","ticker":"MBB","quarter":"Q1-2026",
//   "trigger_id":"ESC-2","context":{...}}' | node scripts/agents-flow/drain-signals.js --recurrence-count
// Prints "count=<n>" (n=0 on any degradation) and exits 0. SELECT-only. SAFE-JSON: args read from
// stdin JSON, never shell-interpolated raw (feedback_signal_payload_shell_injection: bound-param only).
// Placed BEFORE the drain-mode DB-availability gate below so the no-arg default invocation
// (process.argv[2] undefined) is entirely unaffected — this branch is skipped in that case (AC7).
if (process.argv[2] === '--recurrence-count') {
  const escB = (s) => String(s ?? '').replace(/'/g, "''");
  try {
    const args = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));   // matches orch-state-hook-prewrite.mjs convention
    if (!fs.existsSync(DB)) { console.log('count=0'); process.exit(0); }
    const contextText = JSON.stringify(args.context ?? null);
    const sql = `SELECT COUNT(*) FROM signals_processed WHERE type='${escB(args.type)}' ` +
      `AND json_extract(payload,'$.ticker')='${escB(args.ticker)}' ` +
      `AND json_extract(payload,'$.quarter')='${escB(args.quarter)}' ` +
      `AND json_extract(payload,'$.trigger_id')='${escB(args.trigger_id)}' ` +
      `AND json_extract(payload,'$.context')='${escB(contextText)}';`;
    const n = parseInt(execFileSync('sqlite3', [DB, sql], { encoding: 'utf8' }).trim(), 10);
    console.log(`count=${Number.isFinite(n) ? n : 0}`);
  } catch (e) {
    console.log('count=0');   // graceful degrade — never blocks the GATE-B caller
  }
  process.exit(0);
}

if (!fs.existsSync(DB)) {
  // §0a-0 degradation: db unavailable → skip drain, inbox retained for retry
  console.log('[drain-signals] WARN: signals.db unavailable — skipping drain, inbox retained for retry');
  process.exit(0);
}
fs.mkdirSync(PROC, { recursive: true });

const known = new Set(
  execFileSync('sqlite3', [DB, 'SELECT fingerprint FROM signals_processed;'], { encoding: 'utf8' })
    .split('\n').filter(Boolean)
);

const sqlEsc = (s) => String(s ?? '').replace(/'/g, "''");
const files = fs.readdirSync(SIG).filter(f => f.endsWith('.json')).sort();
const stmts = [];
const newFingerprints = [];
const report = [];
// FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE: old repo-relative path ("docs/signals/X.json") -> new
// repo-relative path ("docs/signals/processed/X.json" or "...-replay.json") for every file this
// run actually moves. Fed into repointPayloadRefs() after the loop to keep signal_queue.rows[]
// .payload_ref in sync with the move, in the same operation.
const movedRefs = {};

// FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN (2026-08-08) — signal routing table mirror
// (docs/agents/dev-team/flow/drain-signals.md §0a-3): (type, from) match wins; unmatched
// pairs fall through to "any other -> PO Step 0-SIG", the spec table's own last row. This is
// a literal, hand-kept mirror (not generated) of the small 8-row prose-annotated spec table —
// the spec stays authoritative (drain-signals.md § "Edit the spec first, then the script"); a
// change to the spec table MUST be reflected here in the same commit.
const ROUTING_TABLE = [
  { type: 'audit-handoff', from: 'tran-ngoc-bau', route: 'PO Step 0-TNB' },
  { type: 'brief_complete', from: 'agents-architect', route: 'PO Step 0-SIG' },
  { type: 'zone_missing_tier3', from: 'dev-team', route: 'PO Step 0-SIG' },
  { type: 'improvement_proposal_lane_b', from: 'po', route: 'PO Step 0-SIG' },
  { type: 'repair_task_request', from: 'system-auditor', route: 'PO Step 0-SIG' },
  { type: 'ci_red', from: 'ci-health-probe', route: 'PO Step 0-SIG' },
  { type: 'esc-deep-dive-request', from: 'bctc-analyst', route: 'ESC-DISPATCH' },
  { type: 'bug-escalation', from: 'commit-sweep-guard', route: 'PO Step 0-SIG' },
];
function computeRoutedTo(type, from) {
  const hit = ROUTING_TABLE.find((r) => r.type === type && r.from === from);
  return hit ? hit.route : 'PO Step 0-SIG'; // "any other" default — drain-signals.md §0a-3 last row
}

// Pass 1 — CLASSIFICATION ONLY (non-destructive), drain-signals.md §0a-1 steps 1-2: parse every
// file, compute fingerprint + dedup class. No file is moved, no DB row is written, no
// orch-state write happens in this pass — the durable-append gate below decides whether the
// destructive pass 2 runs at all.
const candidates = [];
for (const base of files) {
  const fp_path = path.join(SIG, base);
  const raw = fs.readFileSync(fp_path, 'utf8');
  let j;
  try { j = JSON.parse(raw); } catch (e) {
    // po_addendum_zerobyte(b) / CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR: an unparseable
    // (0-byte or truncated-write) file is a WRITER DEFECT, not routine inbox traffic — it must
    // be loud and immediately visible, distinguishable from the benign "SKIP non-signal shape"
    // path below (which fires on well-formed JSON that simply lacks from/type). Before this
    // fix it only landed in the batched `report` array printed once at the end (stdout),
    // indistinguishable in prominence from routine "routed-to-po" lines. console.error (stderr,
    // same channel as every other diagnostic in this file) so it never pollutes the stdout
    // golden-report regression guard (AC7) while still surfacing on every run, immediately.
    console.error(`[drain-signals] WARN unparseable JSON: ${base} — ${e.message} (0-byte or truncated write; file left in inbox, will re-warn every tick until removed at source)`);
    report.push(`${base} → SKIP unparseable: ${e.message}`);
    continue;
  }

  // Non-routable-shape guard: skip state files / non-signal JSON dropped in inbox by accident.
  // isDrainableShape() is the SAME predicate the --count-drainable subcommand above uses —
  // not forked (FIX-DRAIN-PERSIST-GUARD-COUNT-DRAINABLE-ONLY, 2026-07-23). A top-level array
  // or an object with neither from/type is not a signal — skip it, do NOT move/unlink.
  if (!isDrainableShape(j)) {
    console.log(`[drain-signals] SKIP non-signal shape: ${base} (no from/type — state file or unknown format; leaving in inbox)`);
    continue;
  }

  // Standard signal schema with fallbacks for telemetry/output files (null-safe per spec §0a-1)
  const from = j.from ?? j.source ?? 'unknown';
  const to = j.to ?? 'po';
  const type = j.type ?? j.signal_type ?? 'unknown';
  const priority = j.priority ?? j.severity ?? 'low';
  const createdAt = j.createdAt ?? j.ts ?? j.emitted_at ?? '';
  const payloadObj = j.payload ?? j;
  const payload = JSON.stringify(payloadObj);
  const fingerprint = crypto.createHash('sha256')
    .update(String(from) + String(type) + payload + String(createdAt)).digest('hex');

  let result, dest;
  if (known.has(fingerprint)) {
    result = 'skipped-duplicate-replay';
    dest = path.join(PROC, base.replace(/\.json$/, '-replay.json'));
  } else {
    result = 'routed-to-po';
    dest = path.join(PROC, base);
    known.add(fingerprint); // dedup within this batch too (classification-time, still non-destructive)
  }

  candidates.push({ base, fp_path, dest, raw: j, result, fingerprint, from, to, type, priority, payload, payloadObj, createdAt });
}

// FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN — build this tick's durable batch. Only the
// genuinely NEW (routed-to-po) entries need durable delivery: a skipped-duplicate-replay was
// already durably routed (fingerprint already in signals_processed) on a prior tick, so
// re-appending it would just be a redundant PO re-triage. Payload inlined, never a pointer —
// same dangling-ref-avoidance rationale as FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE below.
const batch = candidates
  .filter((c) => c.result === 'routed-to-po')
  .map((c) => ({
    envelope_id: c.fingerprint,
    source: 'file',
    from: c.from,
    to: c.to,
    type: c.type,
    priority: c.priority,
    payload: c.payloadObj,
    createdAt: c.createdAt,
    drained_at: NOW,
    routed_to: computeRoutedTo(c.type, c.from),
  }));

let destructiveAllowed = true;
if (batch.length > 0) {
  destructiveAllowed = appendDurableBatch(batch);
  if (!destructiveAllowed) {
    console.error(`[drain-signals] WARN: durable-inbox append failed — retaining ${batch.length} signal(s) in inbox for retry, skipping destructive drain this tick`);
  }
}

// Pass 2 — DESTRUCTIVE ACTION, gated on the durable append above (drain-signals.md §0a-1 step
// 3). Reached for EVERY classified file this tick (both routed-to-po AND
// skipped-duplicate-replay) — one atomic all-or-nothing decision per tick (architect brief
// §3.1 "all-or-nothing failure semantics for the tick"), not a per-file gate.
if (destructiveAllowed) {
  for (const c of candidates) {
    if (c.result === 'routed-to-po') {
      newFingerprints.push(c.fingerprint);
      stmts.push(
        `INSERT OR IGNORE INTO signals_processed (fingerprint, from_agent, to_agent, type, priority, payload, created_at, processed_at, processed_by, result, source_filename) VALUES ('${c.fingerprint}','${sqlEsc(c.from)}','${sqlEsc(c.to)}','${sqlEsc(c.type)}','${sqlEsc(c.priority)}','${sqlEsc(c.payload)}','${sqlEsc(c.createdAt)}','${NOW}','${sqlEsc(PROCESSED_BY)}','${c.result}','${sqlEsc(c.base)}');`
      );
    }

    // Record the move for the payload_ref repoint pass below (both branches move the file away
    // from its original inbox path — replay dupes still dangle any ref pointing at the original).
    movedRefs[`docs/signals/${c.base}`] = `docs/signals/${path.relative(SIG, c.dest).split(path.sep).join('/')}`;

    // Dual-record write: filesystem move is SSOT; DB INSERT is non-fatal (spec §0a-1)
    c.raw._processed = { fingerprint: c.fingerprint, processedAt: NOW, processedBy: PROCESSED_BY, result: c.result };
    fs.writeFileSync(c.dest, JSON.stringify(c.raw, null, 2) + '\n');
    fs.unlinkSync(c.fp_path);
    report.push(`${c.base} → ${c.result}`);
  }
} else {
  for (const c of candidates) {
    report.push(`${c.base} → RETAINED (durable append failed, will retry next tick)`);
  }
}

if (stmts.length) {
  try {
    execFileSync('sqlite3', [DB], { input: stmts.join('\n') + '\n', encoding: 'utf8' });
  } catch (e) {
    console.log(`[drain-signals] WARN: DB INSERT failed (non-fatal, file move is SSOT): ${e.message}`);
  }
}

// §0a-2 prune: DB rows older than 7 days.
// FIX-DRAIN-SIGNALS-DEDUP-PRUNE-STRCOMPARE: processed_at is stored as dash-ISO (YYYY-MM-DDTHH:MM:SSZ).
// A compact cutoff (YYYYMMDDTHHMMSSZ) always string-compares > any dash-ISO value because
// '-' (0x2D) < any digit (0x30), so the OR compact branch truncated the table on every drain.
// Epoch-seconds comparison is format-agnostic and correct for dash-ISO via strftime('%s', ...).
const cutoffEpoch = Math.floor((Date.now() - 7 * 864e5) / 1000);
const cutoffIso = new Date(Date.now() - 7 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
try {
  execFileSync('sqlite3', [DB, `DELETE FROM signals_processed WHERE CAST(strftime('%s', processed_at) AS INTEGER) < ${cutoffEpoch};`]);
} catch (e) {
  console.log(`[drain-signals] WARN: DB prune failed (non-fatal): ${e.message}`);
}

// FAIL-LOUD fence: new inserts must survive the 7-day prune (spec §0a-2).
// FIX-DRAIN-SIGNALS-FAILLOUD-AGGREGATE-COUNT-FALSEPOSITIVE: an aggregate before/after
// row-count comparison false-positives whenever the SAME run's 7-day prune (above)
// legitimately removes >= as many aged-out rows as were just inserted (e.g. insert=1,
// 3 unrelated rows age past the cutoff in this run → net count DROPS despite a
// perfectly healthy insert). Check the specific new fingerprints survived instead —
// that's what spec §0a-2 actually means by "must survive the prune", and it's immune
// to unrelated rows legitimately aging out in the same pass.
if (newFingerprints.length > 0) {
  const inClause = newFingerprints.map(f => `'${f}'`).join(',');
  const survived = parseInt(execFileSync('sqlite3', [DB, `SELECT COUNT(*) FROM signals_processed WHERE fingerprint IN (${inClause});`], { encoding: 'utf8' }).trim(), 10);
  if (survived < newFingerprints.length) {
    console.error(`[drain-signals] FAIL-LOUD: ${newFingerprints.length} new signal(s) inserted this run but only ${survived} survived the prune — INSERT or prune regression; investigate immediately`);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX-DRAINPRUNE-SKIP-LIVE-REFERENCED-PROCESSED-FILES (2026-07-23) — referenced-file guard
// ─────────────────────────────────────────────────────────────────────────────
// The prune loop below previously deleted any aged-out processed/ file unconditionally — it
// never checked whether the file was still referenced by a live task_board detail_ref or
// signal_queue payload_ref. FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE (above) only repoints
// payload_ref on MOVE; it does nothing for this separate PRUNE step. Result: an aged-out-but-
// still-referenced file (e.g. an obsolete backlog row's detail_ref) got silently unlinkSync'd,
// leaving a PERSISTENT Stage-1c dangling ref that hard-blocks EVERY orch-apply.sh write
// fleet-wide until someone hand-repairs it (confirmed 2026-07-23 — drain commit 395e224ad
// pruned docs/signals/processed/dev-team-20260716T112423Z-...json while backlog row
// FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE.detail_ref still pointed at it).
// Fix: gather every live detail_ref/payload_ref from ORCH_STATE — SAME walk as Stage 1c's
// checkRefIntegrity() in orchStateSchema.ts (flat task_board lanes + active_sprints/
// closed_sprints .tasks[] + signal_queue.rows[]) — and SKIP deleting any candidate whose
// basename is in that set, regardless of age. Does NOT restore already-pruned files and does
// NOT repoint anything — additive read-only guard in front of the existing unlinkSync call.
function gatherLiveReferencedBasenames() {
  const referenced = new Set();
  if (!fs.existsSync(ORCH_STATE)) return referenced; // no orch-state -> nothing to protect against (age-only prune, unchanged from pre-fix behavior)
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(ORCH_STATE, 'utf8'));
  } catch (e) {
    console.error(`[drain-signals] WARN: prune referenced-file guard could not parse ${ORCH_STATE} (${e.message}) — proceeding with EMPTY referenced set (age-only prune, unchanged from pre-fix behavior)`);
    return referenced;
  }

  const addRef = (ref) => {
    if (typeof ref !== 'string' || !ref) return;
    referenced.add(path.basename(ref.split('#')[0])); // strip #fragment, same convention as checkRefIntegrity()/repointPayloadRefs()
  };

  // Same lane set as Stage 1c's checkRefIntegrity() in orchStateSchema.ts — MUST stay in sync.
  const FLAT_LANES = ['backlog', 'done', 'done_verified', 'in_progress', 'qa', 'ready', 'review', 'archive'];
  const tb = doc.task_board || {};
  for (const lane of FLAT_LANES) {
    if (Array.isArray(tb[lane])) for (const t of tb[lane]) addRef(t && t.detail_ref);
  }
  for (const sprintArr of [tb.active_sprints, tb.closed_sprints]) {
    if (!Array.isArray(sprintArr)) continue;
    for (const sprint of sprintArr) {
      for (const t of (sprint && sprint.tasks) || []) addRef(t && t.detail_ref);
    }
  }

  for (const row of (doc.signal_queue && doc.signal_queue.rows) || []) addRef(row && row.payload_ref);

  return referenced;
}

const liveReferencedBasenames = gatherLiveReferencedBasenames();

let pruned = 0;
for (const pf of fs.readdirSync(PROC).filter(f => f.endsWith('.json'))) {
  const ppath = path.join(PROC, pf);
  try {
    const pj = JSON.parse(fs.readFileSync(ppath, 'utf8'));
    // FIX-DRAIN-SIGNALS-LEGACY-PRUNE-HOLE (UC-SDF-P4, 2026-07-16): legacy/unstamped files
    // (no _processed.processedAt AND no top-level processedAt) never carried either field,
    // so `pa` was undefined and the guard below silently skipped them forever — unbounded
    // accumulation (~1,283 files). Fall back to file mtime, converted to the SAME dash-ISO
    // shape as cutoffIso so the comparison stays a straight string compare. Scoped to this
    // file-plane prune ONLY — does NOT touch the DB-side epoch-seconds fix above.
    const pa = pj._processed?.processedAt ?? pj.processedAt ?? new Date(fs.statSync(ppath).mtimeMs).toISOString().replace(/\.\d+Z$/, 'Z');
    if (pa && pa < cutoffIso) {
      if (liveReferencedBasenames.has(pf)) {
        console.error(`[drain-signals] PRUNE SKIP (still referenced): ${pf} is >7d old but referenced by a live task_board.*[].detail_ref or signal_queue.rows[].payload_ref — leaving on disk`);
        continue;
      }
      fs.unlinkSync(ppath); pruned++;
    }
  } catch { /* leave unparseable files alone */ }
}

console.log(report.join('\n') || '[drain-signals] inbox empty — nothing to drain');
console.log(`inserted=${stmts.length} pruned_files=${pruned}`);
console.log('db_count=' + execFileSync('sqlite3', [DB, 'SELECT COUNT(*) FROM signals_processed;'], { encoding: 'utf8' }).trim());

// ─────────────────────────────────────────────────────────────────────────────
// FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE — payload_ref repoint (same operation as the move)
// ─────────────────────────────────────────────────────────────────────────────
// All diagnostics below go to stderr (console.error) ONLY — never stdout — so this
// section is a no-op w.r.t. the golden-stdout regression guard in drain-signals.test.js
// (AC7) and every other pre-existing caller that parses this script's stdout report.
if (Object.keys(movedRefs).length > 0) {
  repointPayloadRefs(movedRefs);
}

function repointPayloadRefs(map) {
  if (!fs.existsSync(ORCH_STATE)) {
    console.error(`[drain-signals] payload_ref repoint SKIP: orch-state.json not found at ${ORCH_STATE}`);
    return;
  }

  // jq filter: for every signal_queue.rows[] entry whose payload_ref (fragment stripped)
  // matches a key in $map, rewrite it to the mapped processed/ path (fragment preserved).
  // Emits {doc, changed} so the caller can skip the write entirely when nothing matched
  // (e.g. this run's moved files are unreferenced by any row — the common case).
  const filter = `
    (.signal_queue.rows // []) as $origRows
    | ([$origRows[] | select(.payload_ref? != null and ($map[(.payload_ref | split("#")[0])] // null) != null)] | length) as $changed
    | (if $changed > 0 then
         .signal_queue.rows |= map(
           if (.payload_ref? != null) then
             (.payload_ref | split("#")) as $parts
             | ($map[$parts[0]] // null) as $newPath
             | if $newPath != null then .payload_ref = ($newPath + (if $parts[1] != null then "#" + $parts[1] else "" end)) else . end
           else . end
         )
       else . end) as $newDoc
    | {doc: $newDoc, changed: $changed}
  `;

  // JQ_MAX_BUFFER (ENOBUFS headroom) is now a module-level const — see its definition near
  // ORCH_APPLY_SH above for the full FIX-DRAIN-PAYLOADREF-DANGLE-ON-MOVE / ENOBUFS rationale.

  const computeCandidate = () => {
    const out = execFileSync('jq', ['--argjson', 'map', JSON.stringify(map), filter, ORCH_STATE], { encoding: 'utf8', maxBuffer: JQ_MAX_BUFFER });
    return JSON.parse(out);
  };

  const MAX_CAS_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_CAS_RETRIES; attempt++) {
    let result;
    try {
      result = computeCandidate();
    } catch (e) {
      // FAIL-LOUD, not swallowed: a computation failure (ENOBUFS, jq crash, malformed
      // ORCH_STATE, etc.) means the repoint NEVER RAN — that is categorically different
      // from "nothing to repoint" (the genuinely-benign !result.changed branch below) and
      // must not share its silent return. This exact silent-swallow was the mechanism
      // behind recurring_bug_count=4 on this row: every prior "fix" left orch-state.json
      // dangling while reporting nothing wrong. Same FAIL-LOUD treatment as the two
      // orch-apply.sh failure paths below (lines ~268/272).
      console.error(`[drain-signals] FAIL-LOUD: payload_ref repoint jq computation failed (orch-state.json untouched, refs still dangling): ${e.message}\nAny row referencing a file moved this run still points at the pre-move path; orch-validate Stage 1c will hard-block the NEXT fleet orch-apply write until this is repaired.`);
      process.exit(1);
    }
    if (!result.changed) {
      console.error(attempt === 1
        ? '[drain-signals] payload_ref repoint: no signal_queue rows referenced moved files — orch-state.json untouched'
        : '[drain-signals] payload_ref repoint: rows already repointed by a concurrent writer — orch-state.json untouched');
      return;
    }
    const candidate = JSON.stringify(result.doc, null, 2) + '\n';
    try {
      // ORCH_APPLY_LIVE_FILE_OVERRIDE forwarded explicitly — required whenever ORCH_STATE is
      // itself an override (test isolation); a no-op in production (both default identically).
      execFileSync('bash', [ORCH_APPLY_SH], {
        input: candidate,
        encoding: 'utf8',
        env: { ...process.env, ORCH_APPLY_LIVE_FILE_OVERRIDE: ORCH_STATE },
      });
      console.error(`[drain-signals] payload_ref repoint: ${result.changed} signal_queue row(s) repointed -> ${ORCH_STATE}`);
      return;
    } catch (e) {
      if (e.status === 2 && attempt < MAX_CAS_RETRIES) {
        console.error(`[drain-signals] payload_ref repoint: orch-apply.sh CAS mismatch (attempt ${attempt}/${MAX_CAS_RETRIES}) - retrying`);
        continue;
      }
      console.error(`[drain-signals] FAIL-LOUD: payload_ref repoint orch-apply.sh write failed (exit ${e.status}) - ${result.changed} row(s) still reference moved file(s); orch-validate Stage 1c will hard-block the NEXT fleet orch-apply write until this is repaired.\n${e.stdout || ''}${e.stderr || ''}`);
      process.exit(1);
    }
  }
  console.error(`[drain-signals] FAIL-LOUD: payload_ref repoint CAS retry limit (${MAX_CAS_RETRIES}) exceeded — concurrent orch-state writer; orch-state.json untouched, refs still dangling`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX-DEVTEAM-IDLE-CHAIN-P2A-DURABLE-DRAIN (2026-08-08) — durable-append-before-destructive
// ─────────────────────────────────────────────────────────────────────────────
// docs/agents/dev-team/flow/drain-signals.md §0a-1 / architect brief
// docs/architecture-briefs/2026-07-25-devteam-idle-chain-rotation-durable-inbox.md §3.1.
// Appends the WHOLE tick's newly-routable-signal batch to
// `.dev_team_idle_chain.pending_triage_inbox` in ONE `orch-apply.sh`-gated write BEFORE the
// caller performs any destructive filesystem/DB action. Returns true on success (destructive
// pass 2 may proceed), false on ANY failure (missing/unreadable orch-state.json, jq
// computation error, orch-apply.sh CAS/Zod/conservation rejection, CAS retry exhaustion) —
// the caller must treat false as "retain everything, retry next tick", never partially apply
// the destructive step. All diagnostics go to stderr only (console.error) — never stdout — so
// this never pollutes the golden-report regression guard (AC7) or any other stdout consumer.
function appendDurableBatch(batch) {
  if (!fs.existsSync(ORCH_STATE)) {
    console.error(`[drain-signals] durable-inbox append FAILED: orch-state.json not found at ${ORCH_STATE} — retaining batch for retry`);
    return false;
  }

  const filter = `
    .dev_team_idle_chain.pending_triage_inbox = ((.dev_team_idle_chain.pending_triage_inbox // []) + $batch)
    | .dev_team_idle_chain._updated_at = $now
    | .dev_team_idle_chain._updated_by = "dev-team"
  `;

  const MAX_CAS_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_CAS_RETRIES; attempt++) {
    const nowTs = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    let candidate;
    try {
      candidate = execFileSync('jq', ['--argjson', 'batch', JSON.stringify(batch), '--arg', 'now', nowTs, filter, ORCH_STATE], { encoding: 'utf8', maxBuffer: JQ_MAX_BUFFER });
    } catch (e) {
      // Computation failure (ENOBUFS, jq crash, malformed ORCH_STATE) — the append NEVER RAN.
      // Same FAIL-LOUD-to-caller treatment as repointPayloadRefs()'s identical branch above,
      // except here the caller (not this function) decides the fail-loud action: retain the
      // batch and skip destructive drain this tick (never process.exit — a missing/malformed
      // orch-state.json must not crash the whole drain, it must just retain-and-retry).
      console.error(`[drain-signals] durable-inbox append FAILED: jq computation error (orch-state.json untouched): ${e.message}`);
      return false;
    }
    try {
      // ORCH_APPLY_LIVE_FILE_OVERRIDE forwarded explicitly — required whenever ORCH_STATE is
      // itself an override (test isolation); a no-op in production (both default identically).
      execFileSync('bash', [ORCH_APPLY_SH], {
        input: candidate,
        encoding: 'utf8',
        env: { ...process.env, ORCH_APPLY_LIVE_FILE_OVERRIDE: ORCH_STATE },
      });
      console.error(`[drain-signals] durable-inbox append: ${batch.length} signal(s) appended -> ${ORCH_STATE}`);
      return true;
    } catch (e) {
      if (e.status === 2 && attempt < MAX_CAS_RETRIES) {
        console.error(`[drain-signals] durable-inbox append: orch-apply.sh CAS mismatch (attempt ${attempt}/${MAX_CAS_RETRIES}) - retrying`);
        continue;
      }
      console.error(`[drain-signals] durable-inbox append FAILED: orch-apply.sh exit ${e.status} (live orch-state.json untouched)\n${e.stdout || ''}${e.stderr || ''}`);
      return false;
    }
  }
  console.error(`[drain-signals] durable-inbox append FAILED: CAS retry limit (${MAX_CAS_RETRIES}) exceeded — concurrent orch-state writer`);
  return false;
}
