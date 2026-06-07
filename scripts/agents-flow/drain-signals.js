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
const report = [];

for (const base of files) {
  const fp_path = path.join(SIG, base);
  const raw = fs.readFileSync(fp_path, 'utf8');
  let j;
  try { j = JSON.parse(raw); } catch (e) { report.push(`${base} → SKIP unparseable: ${e.message}`); continue; }

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

// §0a-2 prune: DB rows + processed/ files older than 7 days (field compare, both date formats)
const cutoffCompact = new Date(Date.now() - 7 * 864e5).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const cutoffIso = new Date(Date.now() - 7 * 864e5).toISOString();
try {
  execFileSync('sqlite3', [DB, `DELETE FROM signals_processed WHERE processed_at < '${cutoffCompact}' OR processed_at < '${cutoffIso}';`]);
} catch (e) {
  console.log(`[drain-signals] WARN: DB prune failed (non-fatal): ${e.message}`);
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
