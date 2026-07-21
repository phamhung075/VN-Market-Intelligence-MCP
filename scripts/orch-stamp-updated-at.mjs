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
 * Shallow clone of a row with STAMP_FIELD removed — used ONLY for the
 * equality check; never written back anywhere.
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
function withoutStampField(row) {
  const clone = { ...row };
  delete clone[STAMP_FIELD];
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
  const changed = !liveRow || !deepEqual(withoutStampField(candidateRow), withoutStampField(liveRow));
  if (changed) {
    candidateRow[STAMP_FIELD] = nowArg;
    stampedCount++;
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

process.stdout.write(`[orch-stamp-updated-at] stamped ${stampedCount} row(s) (updated_at=${nowArg})\n`);
process.exit(0);
