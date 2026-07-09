#!/usr/bin/env node
// Canonical drain helper for docs/agents/dev-team/flow/drain-signals.md §0a-1 + §0a-2.
// Drains docs/signals/*.json → fingerprint dedup vs signals.db → processed/ + DB INSERT → 7-day prune.
// DRAIN-INJECTION-SAFE: payload fields never touch a shell command line (sqlite3 fed via stdin, SQL built with '' escaping).
// Scope: file drain ONLY. Queue-row drain (§0a-D) and the commit stay in the flow (dispatcher duties).
// Usage: node scripts/agents-flow/drain-signals.js   (run from anywhere; repo root derived from script location)
// First shipped 2026-06-07 after the bash one-liner equivalent wedged (zero-CPU hang, nested-quote eval).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SIG = path.join(ROOT, 'docs/signals');
const PROC = path.join(SIG, 'processed');
const DB = path.join(SIG, 'signals.db');
const NOW = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const PROCESSED_BY = process.env.DRAIN_PROCESSED_BY || 'dev-team';

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

for (const base of files) {
  const fp_path = path.join(SIG, base);
  const raw = fs.readFileSync(fp_path, 'utf8');
  let j;
  try { j = JSON.parse(raw); } catch (e) { report.push(`${base} → SKIP unparseable: ${e.message}`); continue; }

  // Non-routable-shape guard: skip state files / non-signal JSON dropped in inbox by accident.
  // A routable signal must have at least one of: from/source OR type/signal_type.
  // A top-level array or an object with NEITHER field is not a signal — skip it, do NOT move/unlink.
  if (Array.isArray(j) || (j.from == null && j.source == null && j.type == null && j.signal_type == null)) {
    console.log(`[drain-signals] SKIP non-signal shape: ${base} (no from/type — state file or unknown format; leaving in inbox)`);
    continue;
  }

  // Standard signal schema with fallbacks for telemetry/output files (null-safe per spec §0a-1)
  const from = j.from ?? j.source ?? 'unknown';
  const to = j.to ?? 'po';
  const type = j.type ?? j.signal_type ?? 'unknown';
  const priority = j.priority ?? j.severity ?? 'low';
  const createdAt = j.createdAt ?? j.ts ?? j.emitted_at ?? '';
  const payload = JSON.stringify(j.payload ?? j);
  const fingerprint = crypto.createHash('sha256')
    .update(String(from) + String(type) + payload + String(createdAt)).digest('hex');

  let result, dest;
  if (known.has(fingerprint)) {
    result = 'skipped-duplicate-replay';
    dest = path.join(PROC, base.replace(/\.json$/, '-replay.json'));
  } else {
    result = 'routed-to-po';
    dest = path.join(PROC, base);
    known.add(fingerprint); // dedup within this batch too
    newFingerprints.push(fingerprint);
    stmts.push(
      `INSERT OR IGNORE INTO signals_processed (fingerprint, from_agent, to_agent, type, priority, payload, created_at, processed_at, processed_by, result, source_filename) VALUES ('${fingerprint}','${sqlEsc(from)}','${sqlEsc(to)}','${sqlEsc(type)}','${sqlEsc(priority)}','${sqlEsc(payload)}','${sqlEsc(createdAt)}','${NOW}','${sqlEsc(PROCESSED_BY)}','${result}','${sqlEsc(base)}');`
    );
  }

  // Dual-record write: filesystem move is SSOT; DB INSERT is non-fatal (spec §0a-1)
  j._processed = { fingerprint, processedAt: NOW, processedBy: PROCESSED_BY, result };
  fs.writeFileSync(dest, JSON.stringify(j, null, 2) + '\n');
  fs.unlinkSync(fp_path);
  report.push(`${base} → ${result}`);
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

let pruned = 0;
for (const pf of fs.readdirSync(PROC).filter(f => f.endsWith('.json'))) {
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(PROC, pf), 'utf8'));
    const pa = pj._processed?.processedAt ?? pj.processedAt;
    if (pa && pa < cutoffIso) { fs.unlinkSync(path.join(PROC, pf)); pruned++; }
  } catch { /* leave unparseable files alone */ }
}

console.log(report.join('\n') || '[drain-signals] inbox empty — nothing to drain');
console.log(`inserted=${stmts.length} pruned_files=${pruned}`);
console.log('db_count=' + execFileSync('sqlite3', [DB, 'SELECT COUNT(*) FROM signals_processed;'], { encoding: 'utf8' }).trim());
