#!/usr/bin/env bun
/**
 * scripts/orch-stamp-updated-at.mjs — diff-based updated_at stamper, wired
 * into scripts/orch-apply.sh (Stage 1.5 — runs AFTER Stage 0/1 validation,
 * BEFORE the conservation check and CAS-mtime rename).
 *
 * Task:   FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH
 * Cause:  scripts/orch-apply.sh — the single mandatory gated write path for
 *         docs/data/orch/orch-state.json — had ZERO timestamp handling.
 *         updated_at on task_board rows was stamped only by whichever of the
 *         30+ ad-hoc jq transform callers happened to remember, leaving most
 *         rows permanently null (both TaskSchema sites that reference
 *         updated_at — HeadSchema:227, MetaSchema:245 — declare it optional,
 *         so omitting it always validated clean and nothing ever complained).
 *
 * PURPOSE:
 *   Stamp task_board row `updated_at` at the write path itself, diff-based:
 *   only rows whose content actually changed between the live document and
 *   the candidate get a fresh timestamp. Existing nulls on untouched rows
 *   are left exactly as-is — NO backfill from git history or file mtime
 *   (a synthesised timestamp is worse than a null one: it makes staleness
 *   sweeps confidently wrong and falsifies the audit trail).
 *
 * HEAD STAMPING (task: FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A):
 *   `.head` (the top-level routing pointer, singular — NOT a task_board row)
 *   gets the SAME diff-based `updated_at` treatment as rows, via the exact
 *   same comparator (excluding STAMP_FIELD from the equality check). Root
 *   cause this closes: 30+ ad-hoc jq callers replace `.head` with a bare
 *   whole-object literal (e.g. `.head = {status:$s, active_task_id:$id,
 *   next_agent:$n}`) that omits `updated_at`/`updated_by` entirely; because
 *   HeadSchema declares both `.optional()` + `.passthrough()`, that write
 *   validates clean and the routing pointer silently loses its freshness
 *   stamp (apps/mcp-server/src/__tests__/1837a-pipeline-state.test.ts AC-1/
 *   AC-3 — HeadSchema:227).
 *   `.head.updated_by` is different from `.head.updated_at`: it identifies
 *   WHICH AGENT wrote the pointer, information this script cannot honestly
 *   invent (same principle as the no-timestamp-backfill rule above — a
 *   fabricated agent name would be worse than an honest placeholder). So:
 *     - If the candidate already carries `updated_by` (the overwhelming
 *       common case — most callers DO set it; see git history), it is left
 *       byte-for-byte alone — it "comes from the caller", exactly like every
 *       other `updated_by`/`_updated_by` field in this schema (_meta,
 *       signal_queue, task_board) is always caller-supplied and never
 *       actuator-synthesised.
 *     - Only if the candidate's head CHANGED (per the diff rule below) AND
 *       `updated_by` is missing/empty does this script backfill an honest,
 *       self-identifying placeholder (HEAD_UPDATED_BY_FALLBACK) — never a
 *       fabricated agent identity — so the schema-required field is never
 *       silently absent again, closing the recurrence gap for good without
 *       requiring every one of the 30+ ad-hoc callers to be individually
 *       fixed.
 *   No second mechanism, no new CLI arg, no orch-apply.sh call-site change —
 *   this reuses the same comparator/CLI contract already wired into Stage 1.5.
 *
 * ALGORITHM:
 *   1. Flatten every task_board row (all lanes, id-keyed — id is a REQUIRED
 *      TaskSchema field, always unique) from BOTH the live file and the
 *      candidate file into id -> row-object maps.
 *   2. For each candidate row: compare its content against the live row
 *      with the SAME id, EXCLUDING the `updated_at` field itself. Excluding
 *      it is what makes this idempotent — the stamp we write can never
 *      feed back into the "did this change?" predicate on a second pass
 *      (re-running orch-apply.sh with a candidate that now matches the just
 *      -landed live file produces zero further stamps, not universal churn).
 *   3. If content differs (including: the row is new — no live counterpart
 *      with that id) -> candidate row's updated_at = now (ISO-8601 UTC,
 *      passed in by the caller from a real `date -u` call — this script
 *      never invents a timestamp).
 *   4. If content is identical -> the candidate row is left byte-for-byte
 *      alone, INCLUDING whatever updated_at value it already carries
 *      (already-stamped-and-unchanged rows are not re-stamped; untouched
 *      null rows stay null).
 *
 * DIFF UNIT — LANE-AGNOSTIC (deliberate choice, not an oversight):
 *   Row identity + content is compared by `id` alone, independent of which
 *   task_board lane array the row currently lives in. A row that moves lane
 *   (e.g., backlog[] -> ready[]) WITHOUT any field change is therefore NOT
 *   treated as "changed" by this predicate.
 *   Rationale: (a) orch-validate.mjs Stage 1b (checkLaneCoherence) hard-fails
 *   any candidate where a row's `status` doesn't match its lane, so in the
 *   overwhelming majority of real lane moves `status` itself changes as part
 *   of the same edit — that IS content, and IS caught. The only case this
 *   choice actually excludes is a status value legal in more than one lane
 *   (e.g. BLOCKED, valid in both backlog and review) moved between those
 *   lanes with literally no other field touched — a rare pure-bookkeeping
 *   relocation, not a change to the task's substance. (b) Position/array-
 *   index-based diffing is fragile against jq's normal idiom of rebuilding
 *   whole arrays (a caller can reorder or rebuild an array without moving
 *   any row semantically) — id-content diffing is the robust standard here
 *   and avoids false "changed" noise from incidental array reshaping.
 *
 * USAGE:
 *   bun scripts/orch-stamp-updated-at.mjs <liveFilePath> <candidateFilePath> <nowIso>
 *   Mutates <candidateFilePath> IN PLACE. NEVER reads or writes <liveFilePath>
 *   beyond a read-only load for the diff.
 *
 * EXIT CODES:
 *   0 = stamping pass complete (candidate rewritten; 0 or more rows stamped)
 *   3 = usage error / file not found / unreadable / unparseable — caller
 *       (orch-apply.sh) must treat this as an abort, live file untouched.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

// All row-bearing task_board lanes. Flat lanes cover the 7 flat lanes in the
// "9 task-bearing lanes" schema comment (orchStateSchema.ts §7) plus the
// legacy `archive` lane (also Lane-typed, also indexed by collectAllTaskIds
// for referential integrity) — deliberately inclusive so no lane is silently
// skipped. Nested lanes cover active_sprints[].tasks[] and
// closed_sprints[].tasks[] (the remaining 2 of the 9).
const FLAT_LANES = ['backlog', 'done', 'done_verified', 'in_progress', 'qa', 'ready', 'review', 'archive'];
const NESTED_SPRINT_GROUPS = ['active_sprints', 'closed_sprints'];

const STAMP_FIELD = 'updated_at';

// ─── Head stamping (FIX-ORCHSTATE-HEAD-STAMP-DROPPED-CI-RED-1837A) ──────────
const HEAD_UPDATED_BY_FIELD = 'updated_by';
// Honest, self-identifying fallback — used ONLY when the candidate's head
// changed AND the caller omitted updated_by. Never a fabricated agent name.
const HEAD_UPDATED_BY_FALLBACK = 'orch-apply (Stage 1.5 auto-stamp — caller omitted updated_by)';

/**
 * @param {string} path
 * @param {string} label
 * @returns {unknown}
 */
function loadDoc(path, label) {
  if (!existsSync(path)) {
    process.stderr.write(`[orch-stamp-updated-at] ERROR: ${label} file not found: ${path}\n`);
    process.exit(3);
  }
  let text;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (err) {
    process.stderr.write(
      `[orch-stamp-updated-at] ERROR: cannot read ${label} file: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(3);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    process.stderr.write(
      `[orch-stamp-updated-at] ERROR: ${label} file is not valid JSON: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(3);
  }
}

/**
 * Flatten all task_board rows in a doc into an id -> row-object Map.
 * Object references are preserved (not cloned) so callers can mutate rows
 * in place and have the mutation reflected in the original doc tree.
 * @param {unknown} doc
 * @returns {Map<string, Record<string, unknown>>}
 */
function flattenRows(doc) {
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map();
  const tb = doc && typeof doc === 'object' ? /** @type {any} */ (doc).task_board : undefined;
  if (!tb || typeof tb !== 'object') return map;

  const addRow = (row) => {
    if (row && typeof row === 'object' && typeof row.id === 'string' && row.id.length > 0) {
      // First occurrence wins if an id somehow repeats across lanes (should
      // not happen — id is unique by construction — but never throw here;
      // this script must never be the thing that blocks a write).
      if (!map.has(row.id)) map.set(row.id, row);
    }
  };

  for (const lane of FLAT_LANES) {
    const arr = tb[lane];
    if (Array.isArray(arr)) for (const row of arr) addRow(row);
  }
  for (const group of NESTED_SPRINT_GROUPS) {
    const sprints = tb[group];
    if (Array.isArray(sprints)) {
      for (const sprint of sprints) {
        const tasks = sprint && typeof sprint === 'object' ? sprint.tasks : undefined;
        if (Array.isArray(tasks)) for (const row of tasks) addRow(row);
      }
    }
  }
  return map;
}

/**
 * Order-independent deep equality for JSON-shaped values.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const aObj = /** @type {Record<string, unknown>} */ (a);
  const bObj = /** @type {Record<string, unknown>} */ (b);
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, k)) return false;
    if (!deepEqual(aObj[k], bObj[k])) return false;
  }
  return true;
}

/**
 * Shallow clone of an object with one field removed — used ONLY for the
 * equality check; never written back anywhere. Reused for both row
 * `updated_at` diffing and `.head` `updated_at` diffing (same rule).
 * @param {Record<string, unknown>} obj
 * @param {string} field
 * @returns {Record<string, unknown>}
 */
function omitField(obj, field) {
  const clone = { ...obj };
  delete clone[field];
  return clone;
}

// ─── Main ───────────────────────────────────────────────────────────────────

const [, , liveArg, candidateArg, nowArg] = process.argv;

if (!liveArg || !candidateArg || !nowArg) {
  process.stderr.write(
    '[orch-stamp-updated-at] USAGE: bun scripts/orch-stamp-updated-at.mjs <liveFilePath> <candidateFilePath> <nowIso>\n'
  );
  process.exit(3);
}

const liveDoc = loadDoc(liveArg, 'live');
const candidateDoc = loadDoc(candidateArg, 'candidate');

const liveRows = flattenRows(liveDoc);
const candidateRows = flattenRows(candidateDoc);

let stampedCount = 0;

for (const [id, candidateRow] of candidateRows) {
  const liveRow = liveRows.get(id);
  const changed = !liveRow || !deepEqual(omitField(candidateRow, STAMP_FIELD), omitField(liveRow, STAMP_FIELD));
  if (changed) {
    candidateRow[STAMP_FIELD] = nowArg;
    stampedCount++;
  }
}

// ─── Head stamping ────────────────────────────────────────────────────────
// `.head` is a singleton (not a task_board row) — same diff-based rule as
// above, applied once. See header comment for the updated_by fallback
// rationale.
let headStamped = false;
const liveHead = liveDoc && typeof liveDoc === 'object' ? /** @type {any} */ (liveDoc).head : undefined;
const candidateHead = candidateDoc && typeof candidateDoc === 'object' ? /** @type {any} */ (candidateDoc).head : undefined;

if (candidateHead && typeof candidateHead === 'object') {
  const headChanged =
    !liveHead ||
    typeof liveHead !== 'object' ||
    !deepEqual(omitField(candidateHead, STAMP_FIELD), omitField(liveHead, STAMP_FIELD));
  if (headChanged) {
    candidateHead[STAMP_FIELD] = nowArg;
    const existingUpdatedBy = candidateHead[HEAD_UPDATED_BY_FIELD];
    if (typeof existingUpdatedBy !== 'string' || existingUpdatedBy.length === 0) {
      candidateHead[HEAD_UPDATED_BY_FIELD] = HEAD_UPDATED_BY_FALLBACK;
    }
    headStamped = true;
  }
}

try {
  writeFileSync(candidateArg, JSON.stringify(candidateDoc, null, 2) + '\n', 'utf-8');
} catch (err) {
  process.stderr.write(
    `[orch-stamp-updated-at] ERROR: cannot write candidate file: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(3);
}

process.stdout.write(
  `[orch-stamp-updated-at] stamped ${stampedCount} row(s) + head=${headStamped ? 'stamped' : 'unchanged'} (updated_at=${nowArg})\n`
);
process.exit(0);
