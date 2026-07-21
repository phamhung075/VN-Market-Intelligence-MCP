#!/usr/bin/env node
// Canonical drain helper for docs/agents/dev-team/flow/drain-signals.md §0a-1 + §0a-2.
// Drains docs/signals/*.json → fingerprint dedup vs signals.db → processed/ + DB INSERT → 7-day prune.
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
// ORCH_APPLY_LIVE_FILE_OVERRIDE reused from scripts/orch-apply.sh's own convention (test-only override —
// see scripts/orch-cold-evict.sh / scripts/orch-backlog-stub.sh precedent). No-op in production: both
// this script and orch-apply.sh independently default to the identical canonical live path.
const ORCH_STATE = process.env.ORCH_APPLY_LIVE_FILE_OVERRIDE || path.join(ROOT, 'docs/data/orch/orch-state.json');
const ORCH_APPLY_SH = path.join(ROOT, 'scripts', 'orch-apply.sh');

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

  // Record the move for the payload_ref repoint pass below (both branches move the file away
  // from its original inbox path — replay dupes still dangle any ref pointing at the original).
  movedRefs[`docs/signals/${base}`] = `docs/signals/${path.relative(SIG, dest).split(path.sep).join('/')}`;

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
    if (pa && pa < cutoffIso) { fs.unlinkSync(ppath); pruned++; }
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

  const computeCandidate = () => {
    const out = execFileSync('jq', ['--argjson', 'map', JSON.stringify(map), filter, ORCH_STATE], { encoding: 'utf8' });
    return JSON.parse(out);
  };

  const MAX_CAS_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_CAS_RETRIES; attempt++) {
    let result;
    try {
      result = computeCandidate();
    } catch (e) {
      console.error(`[drain-signals] WARN: payload_ref repoint jq computation failed (non-fatal, orch-state.json untouched): ${e.message}`);
      return;
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
