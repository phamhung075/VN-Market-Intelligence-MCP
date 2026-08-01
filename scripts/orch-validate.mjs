#!/usr/bin/env bun
/**
 * scripts/orch-validate.mjs — Two-stage Zod validator for orch-state.json
 *
 * Sprint:     SSOT-INTEGRITY-PERIMETER
 * Task:       SSOT-W1-ZOD-VALIDATOR-CLI (rank 2)
 * Directive:  docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md § Step 3
 * Authority:  docs/policies/dev-standards.md § Script Persistence (CANONICAL pointer added)
 *
 * INVOCATION (bun required — imports .ts schema directly, no transpile step needed):
 *   bun scripts/orch-validate.mjs                        # default: docs/data/orch/orch-state.json
 *   bun scripts/orch-validate.mjs path/to/candidate.json # validate any candidate file
 *
 * TWO STAGES:
 *   Stage 0 (raw text, pre-parse): duplicate JSON key scan on raw bytes.
 *     Zod operates on the post-JSON.parse object where dup keys collapse to the
 *     last value — silent data corruption. This scan runs BEFORE parse.
 *     Closes the feedback_ssot_duplicate_key clobber class.
 *   Stage 1: OrchStateSchema.safeParse(JSON.parse(text))
 *     Stage 1b: checkLaneCoherence() — HARD FAIL (SHG migration complete, 0 live
 *       violations as of D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING). Flipped from
 *       warn-print-only to process.exit(2) once D3 (relabel) + D2.5 (schema-blocked
 *       lane) + D1 (sweep-execute) landed DONE_VERIFIED under sprint
 *       BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP.
 *     Stage 1c: checkRefIntegrity() — hard fail on dangling detail_ref / payload_ref
 *     Stage 1d: checkSprintGoalStatusCanonical() — hard fail on non-canonical
 *       .sprint_goal.entries[].status terminal-status drift (CLOSED/COMPLETE/done/
 *       done_verified, etc. instead of DONE/DONE_VERIFIED/...). Closes the recurring-8x
 *       drift class from task FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT that defeated
 *       scripts/orch-cold-evict.sh's TERMINAL_SET eviction predicate.
 *     Stage 1e: checkDecorativeSequencingFields() — hard fail on a reverse-only
 *       `blocks` edge (present but unbacked by a matching depends_on/blocked_by
 *       on the named target, or malformed) or any non-empty `co_edit` value.
 *       Closes task FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE — both
 *       fields read as sequencing/atomic-ship constraints but were read by
 *       ZERO consumers anywhere in the repo.
 *     Stage 1f: checkDependsDivergence() — hard fail when a row's `.depends`
 *       names an id absent from `.depends_on` while BOTH fields are present.
 *       Closes task FIX-DEVTEAM-IDLE-CHAIN-DANGLING-DEPS-STRAND-5-P0-ROWS
 *       AC-3 — scripts/lib/devteam-eligibility.jq's effective_depends_on()
 *       UNIONS `.depends_on` + `.depends` + `.blocked_by`, so editing only
 *       one field on a stale dep can never shrink the effective set; a
 *       deleted id left resident in `.depends` alone silently resurrects
 *       forever and permanently fail-closes deps_satisfied() (the incident
 *       that starved 5 P0 rows for 3 days, 2026-07-29 to 2026-08-01).
 *     Stage 1g: checkMissingDependencyReport() — NON-FATAL report (never
 *       exits non-zero on its own) of rows whose effective dependency set
 *       resolves to MISSING in both the hot board's 7 flat lanes and the
 *       cold archive (docs/data/orch/archive/YYYY-MM.json .done_tasks[]).
 *       Deliberately not a hard fail — FIX-DEPSSATISFIED-COLD-ARCHIVED-
 *       DEP-RESOLVES-MISSING already ratifies this as a separate, smaller
 *       class of genuine unknowns/free-text deps; this stage exists purely
 *       for live visibility.
 *
 * EXIT CODES:
 *   0  = Stage 0 + Stage 1 pass (zero coherence issues, zero dangling refs, canonical statuses)
 *        (Stage 1g may still print a non-fatal report — does not affect exit code)
 *   1  = Stage 0 failure (duplicate JSON keys detected in raw text)
 *   2  = Stage 1 failure (schema violation) OR Stage 1b (lane-coherence) OR
 *        Stage 1c (dangling refs) OR Stage 1d (sprint_goal status drift) OR
 *        Stage 1e (decorative blocks/co_edit field) OR Stage 1f
 *        (.depends/.depends_on divergence)
 *   3  = file not found / unreadable
 *
 * AUTO-FIX ERROR CONTRACT (per directive § "Auto-fix error contract"):
 *   Every failure prints, per issue: path, problem, expected, and a fix: hint.
 *   Hint mapper is keyed by Zod issue.code + whether the path ends in "status".
 *
 * SHIM: scripts/orch-state-validate.sh is now a THIN SHIM that exec's this script.
 *   G-1..G-5 hard gates are covered by Stage 0 + Stage 1 (superset proof in shim header).
 *   Demoted by: SSOT-W1-BASH-SHIM (SSOT-INTEGRITY-PERIMETER sprint, 2026-06-27).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import TypeScript schema directly — bun transpiles .ts on the fly (no compile step).
// Single source of truth: orchStateSchema.ts is the ONE enum + ONE schema.
// Do NOT duplicate the schema here.
import {
  OrchStateSchema,
  checkLaneCoherence,
  checkRefIntegrity,
  checkSprintGoalStatusCanonical,
  checkDecorativeSequencingFields,
  checkDependsDivergence,
  checkMissingDependencyReport,
  collectHotDepStatusLaneIds,
} from '../apps/mcp-server/src/infrastructure/orchStateSchema.ts';

// ─── Paths ────────────────────────────────────────────────────────────────────

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPTS_DIR, '..');
const DEFAULT_TARGET = 'docs/data/orch/orch-state.json';

/** Canonical enum values — single SSOT from orchStateSchema.ts StatusEnum. */
const STATUS_ENUM_DISPLAY =
  'BACKLOG|TODO|IN_PROGRESS|REVIEW|QA|DONE|DONE_VERIFIED|BLOCKED|DEFERRED|CANCELLED|SKIPPED|READY';

// ─── Stage 0: Duplicate-key scanner ──────────────────────────────────────────
//
// Runs on raw text BEFORE JSON.parse. JSON.parse silently collapses duplicate
// keys to the last value — this scanner detects them first.
//
// Implements a recursive-descent tokenizer that correctly handles:
//   - String escape sequences (especially \" which must NOT terminate the key string)
//   - Nested objects and arrays (separate key-tracking context per object)
//   - All JSON primitive types (string / number / boolean / null)
//
// Ref: feedback_ssot_duplicate_key — "last-key-wins" clobber class.

/**
 * Scan raw JSON text for duplicate keys at any nesting level.
 * @param {string} text Raw JSON text
 * @returns {{ key: string, path: string }[]} Array of duplicates found
 */
function findDuplicateJsonKeys(text) {
  const results = [];
  let pos = 0;
  const len = text.length;

  function skipWs() {
    while (
      pos < len &&
      (text[pos] === ' ' || text[pos] === '\t' || text[pos] === '\n' || text[pos] === '\r')
    ) {
      pos++;
    }
  }

  /**
   * Read a JSON string starting at pos (which must be '"').
   * Advances pos past the closing '"'. Returns the string content.
   * Correctly handles \" (escaped double-quote does NOT end the string).
   */
  function readString() {
    pos++; // skip opening '"'
    let s = '';
    while (pos < len) {
      const c = text[pos];
      if (c === '\\') {
        pos++;
        if (pos < len) s += text[pos++]; // consume the escaped character
      } else if (c === '"') {
        pos++; // skip closing '"'
        break;
      } else {
        s += c;
        pos++;
      }
    }
    return s;
  }

  /** Parse any JSON value starting at current pos. */
  function parseValue(path) {
    skipWs();
    if (pos >= len) return;
    const c = text[pos];
    if (c === '{') {
      parseObject(path);
    } else if (c === '[') {
      parseArray(path);
    } else if (c === '"') {
      readString(); // string value — just consume
    } else {
      // number, true, false, null — consume until delimiter
      while (pos < len && ',}]'.indexOf(text[pos]) === -1 && ' \t\n\r'.indexOf(text[pos]) === -1) {
        pos++;
      }
    }
  }

  /**
   * Parse a JSON object, tracking keys seen at this level.
   * Reports duplicate keys with their full dot-notation path.
   */
  function parseObject(path) {
    pos++; // skip '{'
    const seen = new Set();
    skipWs();
    if (pos < len && text[pos] === '}') {
      pos++;
      return;
    }

    while (pos < len) {
      skipWs();
      if (pos >= len || text[pos] !== '"') break; // malformed or unexpected end

      const key = readString();
      const keyPath = path ? `${path}.${key}` : key;

      if (seen.has(key)) {
        results.push({ key, path: keyPath });
      }
      seen.add(key);

      skipWs();
      if (pos < len && text[pos] === ':') pos++; // skip ':'

      parseValue(keyPath);

      skipWs();
      if (pos < len && text[pos] === ',') {
        pos++;
        continue;
      }
      if (pos < len && text[pos] === '}') {
        pos++;
        break;
      }
      break; // malformed
    }
  }

  /** Parse a JSON array, tracking elements by index for path reporting. */
  function parseArray(path) {
    pos++; // skip '['
    skipWs();
    if (pos < len && text[pos] === ']') {
      pos++;
      return;
    }

    let idx = 0;
    while (pos < len) {
      skipWs();
      parseValue(`${path}[${idx}]`);
      idx++;
      skipWs();
      if (pos < len && text[pos] === ',') {
        pos++;
        continue;
      }
      if (pos < len && text[pos] === ']') {
        pos++;
        break;
      }
      break; // malformed
    }
  }

  skipWs();
  parseValue('');
  return results;
}

// ─── Auto-fix hint formatter ──────────────────────────────────────────────────
//
// Per directive § "Auto-fix error contract":
//   Every failure prints, per issue: path, problem, expected, and a fix: hint.
//   Hint mapper is keyed by Zod issue.code + lane context.
//
// Output format (matches directive example exactly):
//   [N] path.to.field: "BAD_VALUE" is not a valid status.
//       expected: BACKLOG|TODO|...
//       fix: use an enum value; put the "BAD_VALUE" qualifier in verify_note.

/**
 * Format a single Zod issue as an actionable error string.
 * @param {import('zod').ZodIssue} issue
 * @param {number} n 1-based issue number
 * @returns {string}
 */
function formatZodIssue(issue, n) {
  const pathParts = issue.path.map((p) =>
    typeof p === 'number' ? `[${p}]` : `.${p}`
  );
  const path =
    pathParts.length > 0
      ? pathParts.join('').replace(/^\./, '')
      : '(root)';

  let problem, expected, fix;

  switch (issue.code) {
    case 'invalid_enum_value': {
      const received = String(issue.received ?? '(unknown)');
      const isStatus = issue.path[issue.path.length - 1] === 'status';
      problem = `"${received}" is not a valid ${isStatus ? 'status' : 'enum value'}`;
      expected =
        Array.isArray(issue.options) && issue.options.length > 0
          ? issue.options.join('|')
          : STATUS_ENUM_DISPLAY;
      fix = isStatus
        ? `use an enum value; put the "${received}" qualifier in verify_note`
        : `use one of the allowed values: ${expected}`;
      break;
    }

    case 'unrecognized_keys': {
      const keys = (issue.keys ?? []).map((k) => `"${k}"`).join(', ');
      problem = `unrecognized key(s): ${keys}`;
      expected = 'only known schema keys';
      fix =
        `remove the unknown key(s) or migrate to cold storage ` +
        `(docs/data/orch/archive/backlog-detail.json)`;
      break;
    }

    case 'invalid_type': {
      problem = `expected ${issue.expected}, received ${issue.received}`;
      expected = issue.expected;
      fix = `provide a ${issue.expected} value for this field`;
      break;
    }

    case 'too_small': {
      const min = issue.minimum ?? 1;
      problem = `value is too small (minimum: ${min})`;
      expected = `non-empty (minimum length ${min})`;
      fix = `ensure the field is non-empty (e.g., "id" must be at least ${min} character(s))`;
      break;
    }

    case 'custom': {
      // Covers head.active_task_id referential integrity from superRefine.
      // The schema embeds the fix hint in the message after "fix: ".
      const rawMessage = issue.message ?? 'custom validation failed';
      const fixMatch = rawMessage.match(/fix:\s*(.+)$/);
      problem = fixMatch ? rawMessage.replace(/\s*fix:\s*.+$/, '').trim() : rawMessage;
      expected = 'valid reference';
      fix = fixMatch ? fixMatch[1] : 'correct the reference or set to null';
      break;
    }

    default: {
      problem = issue.message ?? `${issue.code} validation failed`;
      expected = 'valid value per schema';
      fix = 'correct the field value per the schema definition';
    }
  }

  return `[${n}] ${path}: ${problem}.\n    expected: ${expected}\n    fix: ${fix}.`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const targetArg = process.argv[2] ?? DEFAULT_TARGET;
const absPath = resolve(PROJECT_ROOT, targetArg);

// File existence check
if (!existsSync(absPath)) {
  process.stderr.write(`[orch-validate] ERROR: file not found: ${absPath}\n`);
  process.exit(3);
}

// Read file
let text;
try {
  text = readFileSync(absPath, 'utf-8');
} catch (err) {
  process.stderr.write(`[orch-validate] ERROR: cannot read file: ${err.message}\n`);
  process.exit(3);
}

// ── Stage 0: Duplicate key scan ────────────────────────────────────────────────
// Must run on raw text BEFORE JSON.parse (dup keys silently collapse post-parse).

const dupKeys = findDuplicateJsonKeys(text);
if (dupKeys.length > 0) {
  const count = dupKeys.length;
  process.stderr.write(
    `\nORCH-STATE VALIDATION FAILED — Stage 0 (${count} duplicate key${count > 1 ? 's' : ''}) — fix and retry:\n`
  );
  for (let i = 0; i < count; i++) {
    const d = dupKeys[i];
    process.stderr.write(`[${i + 1}] ${d.path}: duplicate key "${d.key}"\n`);
    process.stderr.write(
      `    fix: remove the duplicate key; JSON.parse silently uses the last value, masking data corruption\n`
    );
  }
  process.exit(1);
}

// ── Stage 1: Schema parse ──────────────────────────────────────────────────────

let parsed;
try {
  parsed = JSON.parse(text);
} catch (err) {
  // Stage 0 passed (no dup keys) but JSON is still malformed — report clearly.
  process.stderr.write(
    `[orch-validate] Stage 0 passed but JSON.parse failed (malformed JSON):\n  ${err.message}\n`
  );
  process.exit(2);
}

const result = OrchStateSchema.safeParse(parsed);
if (!result.success) {
  const issues = result.error.issues;
  process.stderr.write(
    `\nORCH-STATE VALIDATION FAILED (${issues.length} issue${issues.length !== 1 ? 's' : ''}) — fix and retry:\n`
  );
  for (let i = 0; i < issues.length; i++) {
    process.stderr.write(formatZodIssue(issues[i], i + 1) + '\n');
  }
  process.exit(2);
}

// ── Stage 1b: Lane coherence (HARD-FAIL — SHG migration complete) ─────────────
//
// checkLaneCoherence() is exported SEPARATELY from OrchStateSchema.
// SHG migration (D3 relabel + D2.5 schema-blocked-lane + D1 sweep-execute, all
// DONE_VERIFIED under sprint BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP) has driven live
// coherence warnings to 0. Coherence is now a HARD FAIL like Stage 1c/1d — any
// lane/status mismatch blocks the write instead of merely printing a warning.
// Task: D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING.

const coherenceIssues = checkLaneCoherence(result.data);

// ── Stage 1c: Referential integrity (hard fail on dangling refs) ──────────────
//
// Checks that detail_ref and signal_queue.rows[].payload_ref point to existing files.
// Uses existsSync as the injected file resolver (keeps the schema unit-testable).

const refIssues = checkRefIntegrity(result.data, existsSync, PROJECT_ROOT);

// Hard-fail on lane coherence issues
if (coherenceIssues.length > 0) {
  const c = coherenceIssues.length;
  process.stderr.write(
    `\nORCH-STATE VALIDATION FAILED — Stage 1b (${c} lane-coherence issue${c !== 1 ? 's' : ''}) — fix and retry:\n`
  );
  for (let i = 0; i < c; i++) {
    const ci = coherenceIssues[i];
    process.stderr.write(
      `[${i + 1}] task_board.${ci.lane}[id=${ci.taskId}].status: ` +
        `"${ci.status}" is not allowed in lane "${ci.lane}"\n`
    );
    process.stderr.write(`    expected: ${ci.allowedStatuses.join('|')}\n`);
    process.stderr.write(`    fix: ${ci.fix}\n`);
  }
  process.exit(2);
}

// Hard-fail on dangling refs
if (refIssues.length > 0) {
  const c = refIssues.length;
  process.stderr.write(
    `\nORCH-STATE VALIDATION FAILED — Stage 1c (${c} dangling ref${c !== 1 ? 's' : ''}) — fix and retry:\n`
  );
  for (let i = 0; i < c; i++) {
    const ri = refIssues[i];
    process.stderr.write(`[${i + 1}] ${ri.path}: ${ri.message}\n`);
    process.stderr.write(`    fix: ${ri.fix}\n`);
  }
  process.exit(2);
}

// ── Stage 1d: sprint_goal terminal-status canonicalization (hard fail) ────────
//
// Rejects non-canonical terminal-status drift in .sprint_goal.entries[].status
// (CLOSED/COMPLETE/done/done_verified/CANCELED/COMPLETED instead of the
// canonical DONE/DONE_VERIFIED/CANCELLED/DEFERRED/SKIPPED TERMINAL_SET tokens).
// Task: FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT AC-2 (durable write-time guard).
// Operates on raw `parsed` (not `result.data`) — sprint_goal is an untyped
// z.record(z.unknown()) field, so this works identically against fixtures.

const sprintGoalIssues = checkSprintGoalStatusCanonical(parsed);

if (sprintGoalIssues.length > 0) {
  const c = sprintGoalIssues.length;
  process.stderr.write(
    `\nORCH-STATE VALIDATION FAILED — Stage 1d (${c} sprint_goal status drift issue${c !== 1 ? 's' : ''}) — fix and retry:\n`
  );
  for (let i = 0; i < c; i++) {
    const si = sprintGoalIssues[i];
    process.stderr.write(
      `[${i + 1}] sprint_goal.entries[${si.index}] (sprint_id="${si.sprintId}").status: "${si.status}" is not canonical.\n`
    );
    process.stderr.write(`    expected: ${si.canonical}\n`);
    process.stderr.write(`    fix: ${si.fix}\n`);
  }
  process.exit(2);
}

// ── Stage 1e: decorative blocks/co_edit field guard (hard fail) ────────────────
//
// Rejects a reverse-only `blocks` edge (present, non-empty, but the named
// target does not carry the source id back in its own
// depends_on/depends/blocked_by — i.e. the ONLY fields
// scripts/lib/devteam-eligibility.jq's effective_depends_on() actually reads)
// or a malformed `blocks` value (not an array of task-id strings), and any
// non-empty `co_edit` value (no forward-field equivalent exists at all).
// Task: FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE.
// Operates on `result.data` (schema-parsed, passthrough fields intact) —
// same input as Stage 1b/1c.

const decorativeFieldIssues = checkDecorativeSequencingFields(result.data);

if (decorativeFieldIssues.length > 0) {
  const c = decorativeFieldIssues.length;
  process.stderr.write(
    `\nORCH-STATE VALIDATION FAILED — Stage 1e (${c} decorative blocks/co_edit field issue${c !== 1 ? 's' : ''}) — fix and retry:\n`
  );
  for (let i = 0; i < c; i++) {
    const di = decorativeFieldIssues[i];
    process.stderr.write(`[${i + 1}] ${di.path} (id=${di.taskId}).${di.field}: ${di.message}\n`);
    process.stderr.write(`    fix: ${di.fix}\n`);
  }
  process.exit(2);
}

// ── Stage 1f: .depends / .depends_on divergence guard (hard fail) ─────────────
//
// A row carrying BOTH `.depends` and `.depends_on` where `.depends` names an
// id absent from `.depends_on` is rejected — see orchStateSchema.ts §13 for
// the full incident writeup (FIX-DEVTEAM-IDLE-CHAIN-DANGLING-DEPS-STRAND-5-
// P0-ROWS AC-3). Live-verified 0 violations on 2026-08-01 across all 9
// task-bearing lanes, so this cannot regress any row that is clean today.

const dependsDivergenceIssues = checkDependsDivergence(result.data);

if (dependsDivergenceIssues.length > 0) {
  const c = dependsDivergenceIssues.length;
  process.stderr.write(
    `\nORCH-STATE VALIDATION FAILED — Stage 1f (${c} .depends/.depends_on divergence issue${c !== 1 ? 's' : ''}) — fix and retry:\n`
  );
  for (let i = 0; i < c; i++) {
    const dd = dependsDivergenceIssues[i];
    process.stderr.write(`[${i + 1}] ${dd.path} (id=${dd.taskId}): ${dd.message}\n`);
    process.stderr.write(`    fix: ${dd.fix}\n`);
  }
  process.exit(2);
}

// ── Stage 1g: missing-dependency report (NON-FATAL — live visibility only) ────
//
// Reports, but never fails the write on, rows whose effective dependency set
// resolves to MISSING in both the hot board's 7 flat lanes and the cold
// archive (docs/data/orch/archive/YYYY-MM.json .done_tasks[]). See
// orchStateSchema.ts §14 for full scope rationale (active_sprints excluded
// as WIP-normal intra-sprint noise; closed_sprints included as settled/
// frozen). Archive read is best-effort/fail-soft — a missing or malformed
// monthly archive file never blocks this report (or the write), it just
// yields a smaller "known ids" set for that run.

const archiveDir = resolve(PROJECT_ROOT, 'docs/data/orch/archive');
const archiveIds = new Set();
try {
  const archiveFiles = readdirSync(archiveDir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
  for (const af of archiveFiles) {
    try {
      const archiveDoc = JSON.parse(readFileSync(resolve(archiveDir, af), 'utf-8'));
      for (const t of archiveDoc.done_tasks ?? []) {
        if (t && typeof t.id === 'string' && t.id) archiveIds.add(t.id);
      }
    } catch {
      // fail-soft: one unreadable/malformed monthly archive file must not
      // block this non-fatal report (or the write itself).
    }
  }
} catch {
  // fail-soft: archive dir missing entirely — report runs with hot-lane ids only.
}

const resolvedDepIds = new Set([
  ...collectHotDepStatusLaneIds(result.data.task_board),
  ...archiveIds,
]);
const missingDepIssues = checkMissingDependencyReport(result.data, resolvedDepIds);

if (missingDepIssues.length > 0) {
  const c = missingDepIssues.length;
  process.stdout.write(
    `\n[orch-validate] REPORT — Stage 1g (${c} row${c !== 1 ? 's' : ''} with a dependency resolving to MISSING in both hot board + cold archive; NON-FATAL, see orchStateSchema.ts §14):\n`
  );
  for (let i = 0; i < c; i++) {
    const mi = missingDepIssues[i];
    process.stdout.write(`  [${i + 1}] ${mi.path} (id=${mi.taskId}): ${JSON.stringify(mi.missingIds)}\n`);
  }
}

// ── All checks passed ──────────────────────────────────────────────────────────
// coherenceIssues is always empty here — Stage 1b exits(2) above on any issue.

process.stdout.write(`[orch-validate] Stage 0 + Stage 1 PASS — ${absPath}\n`);
process.exit(0);
