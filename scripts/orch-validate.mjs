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
 *     Stage 1i: flagged-row-without-resolvable-handler — NON-FATAL report
 *       (supervised and/or plan_only set while next_agent AND owner are both
 *       empty in BOTH the board row and backlog-detail.json; epic wrappers
 *       excluded — handler-less by design). Predicate mirrors
 *       scripts/lib/devteam-eligibility.jq as composed by
 *       scripts/audits/bounded1-supervised-lane-report.sh; runs BEFORE Stage 1h
 *       because 1h can exit(2) and would otherwise swallow this report.
 *     Stage 1h: checkSprintRegistryReferentialIntegrity() — sprint-registry
 *       dangling-id guard (task FIX-SPRINT-REGISTRY-DANGLING-IDS-BREAK-
 *       SIGNOFF-AND-JOURNAL-ARCHIVE, brief §3/§4, A1-corrected per the board
 *       row's po_review_note). Known-id union is STRICT (active_sprints[].id
 *       hot ∪ closed_sprints[].id hot ∪ cold closed_sprints[].id / closed_
 *       sprint_goals sprint ids) — deliberately EXCLUDES `.done_tasks[].sprint`
 *       (weak per-task provenance signal, see orchStateSchema.ts §16). Default
 *       mode `warn` (env `ORCH_SPRINT_REGISTRY_MODE`, mirrors
 *       `GIT_NOTEBOOK_IMMUTABILITY_MODE`): prints + writes one aggregated
 *       docs/signals/ entry (deduped by violating-id-set hash), exits 0. Mode
 *       `reject`: same detection, exit 2. Do NOT flip the default to `reject`
 *       until `scripts/audits/verify-sprint-registry-referential-integrity.mjs`
 *       reads `violations==0` against the live file (brief §3 arming gate /
 *       §11.8 step 7).
 *
 * EXIT CODES:
 *   0  = Stage 0 + Stage 1 pass (zero coherence issues, zero dangling refs, canonical statuses)
 *        (Stage 1g and Stage 1i may still print non-fatal reports — neither affects exit code;
 *        Stage 1h in the default `warn` mode may still print + signal — does not
 *        affect exit code either)
 *   1  = Stage 0 failure (duplicate JSON keys detected in raw text)
 *   2  = Stage 1 failure (schema violation) OR Stage 1b (lane-coherence) OR
 *        Stage 1c (dangling refs) OR Stage 1d (sprint_goal status drift) OR
 *        Stage 1e (decorative blocks/co_edit field) OR Stage 1f
 *        (.depends/.depends_on divergence) OR Stage 1h in `reject` mode
 *        (ORCH_SPRINT_REGISTRY_MODE=reject, not the default)
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

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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
  checkSprintRegistryReferentialIntegrity,
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

// ── Stage 1i: supervised/plan_only row with NO resolvable dispatch lane ───────
// (FIX-ORCHSTATE-MINT-FLAGGED-ROW-WITHOUT-RESOLVABLE-HANDLER, architect brief
//  docs/architecture-briefs/2026-08-23-fix-orchstate-mint-flagged-row-no-handler.md)
//
// DEFECT: `supervised: true` / `plan_only: true` assert "this row needs a
// DELIBERATE dispatch decision". If the row ALSO has no resolvable handler
// (`next_agent` and `owner` both empty, inline and in backlog-detail.json),
// it claims a lane no mechanism can route it through — every picker skips it,
// and it ages silently. 4 live rows aged 15-58 days before being hand-repaired
// on 2026-08-14; nothing prevented the next one.
//
// NOT the invariant "every row needs a handler": `owner: null` +
// `next_agent: null` with NEITHER flag set is a LEGITIMATE, documented parked
// state and must never be reported. The flag is what turns it into a
// contradiction. Both flags are checked with OR, not AND — 3 of the 4 live
// violators carried only ONE flag, so a both-flags predicate would have missed
// three quarters of the very cohort this exists to catch.
//
// NON-FATAL BY DESIGN, with a dated promotion path. The brief's §4 chose
// report-first over a fatal `superRefine` because the 0-violator baseline
// proves the read-only REPLAY is clean, not that every future write-time
// position is; `orchStateSchema.ts:658-661` already documents this exact
// "standalone function now, superRefine once the gating conditions land"
// migration as this codebase's own pattern. Promotion is a separate, gated
// follow-up (N consecutive clean write cycles) — deliberately not done here.
//
// PLACEMENT: physically BEFORE Stage 1h even though it is numbered after it.
// Stage 1h can `process.exit(2)` in reject mode, and a non-fatal report placed
// downstream of that would be silently skipped on exactly the runs where board
// health matters most.
//
// PREDICATE IS MIRRORED, NOT REINVENTED. SSOT is
// `scripts/lib/devteam-eligibility.jq` (`effective_supervised`,
// `effective_plan_only`, `effective_owner`, `effective_next_agent`) as composed
// by `scripts/audits/bounded1-supervised-lane-report.sh`'s own
// `dispatch_lane($detail_items; $roster_map)`. Only the two-line
// detail-first/board-fallback lookups are ported; the resolution ALGORITHM is
// not forked. KNOWN COUPLING (brief risk flag): two implementations of one
// rule can silently diverge — the cross-check is to re-run
// `bounded1-supervised-lane-report.sh` against the same board snapshot and
// confirm the counts agree. Do that whenever EITHER file changes.

const detailItemsById = (() => {
  // Fail-soft, exactly like Stage 1g's archive read: an unreadable or
  // malformed detail file must never block a non-fatal report or the write.
  try {
    // Test seam: ORCH_VALIDATE_DETAIL_PATH lets the AC fixture suite inject a
    // scratch detail file so the detail-first override branch is provable
    // without touching the real one. Production leaves it unset.
    const detailPath = process.env.ORCH_VALIDATE_DETAIL_PATH
      ? resolve(process.env.ORCH_VALIDATE_DETAIL_PATH)
      : resolve(PROJECT_ROOT, 'docs/data/orch/archive/backlog-detail.json');
    const raw = JSON.parse(readFileSync(detailPath, 'utf-8'));
    const items = raw?.items ?? [];
    if (Array.isArray(items)) {
      // Real-data drift: `.items` is an ARRAY in some snapshots and an OBJECT
      // in others — `detail_items_from` in the jq SSOT normalizes both, so this
      // port must too (see FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE Case 1c).
      const out = Object.create(null);
      for (const it of items) if (it && typeof it.id === 'string' && it.id) out[it.id] = it;
      return out;
    }
    return items && typeof items === 'object' ? items : Object.create(null);
  } catch {
    return Object.create(null);
  }
})();

// Mirrors effective_supervised / effective_plan_only: EITHER location true.
// Conservative default — absent in both means NOT flagged.
function flaggedEitherWay(row) {
  const d = (row && typeof row.id === 'string' && detailItemsById[row.id]) || null;
  const sup = row?.supervised === true || d?.supervised === true;
  const plan = row?.plan_only === true || d?.plan_only === true;
  return sup || plan;
}

// Mirrors effective_owner / effective_next_agent: detail-FIRST, board-FALLBACK,
// a non-empty STRING in either position wins.
function detailFirstString(row, field) {
  const d = (row && typeof row.id === 'string' && detailItemsById[row.id]) || null;
  const fromDetail = d ? d[field] : null;
  if (typeof fromDetail === 'string' && fromDetail !== '') return fromDetail;
  const inline = row?.[field];
  return typeof inline === 'string' ? inline : '';
}

// Mirrors effective_children / is_epic_wrapper: a non-empty children[] in
// EITHER location makes the row a decomposition container, not a dispatchable
// atomic task. `as_dep_array` in the jq SSOT also normalizes the bare-string
// real-data drift (~7/321 backlog-detail rows), so this port does too.
//
// WRAPPERS MUST BE EXCLUDED, and this is not an optimisation — it is the
// difference between a true and a false positive. An epic wrapper legitimately
// has no dispatch lane: bounded1-supervised-lane-report.sh's own READY-WRAPPER
// section documents it as a "NO-PICKER-BY-DESIGN class ... closed out instead
// by docs/agents/dev-team/flow/post-cycle.md § Step 4.4 Epic-Wrapper Autoclose
// Sweep once all_children_terminal", which is why the report's GATING class is
// scoped `non-wrapper`. Caught by the brief's own mandated cross-check against
// that script: without this filter Stage 1i reported
// FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS (supervised+plan_only, 38 d,
// lane none) while the jq SSOT correctly counted 0 — the port, not the board,
// was wrong.
function isEpicWrapper(row) {
  const asArray = (v) => (v == null ? [] : typeof v === 'string' ? [v] : Array.isArray(v) ? v : []);
  const inline = asArray(row?.children);
  if (inline.length > 0) return true;
  const d = (row && typeof row.id === 'string' && detailItemsById[row.id]) || null;
  return asArray(d?.children).length > 0;
}

// Mirrors dispatch_lane's own precedence: next_agent wins, then owner, else
// "none". The roster-membership branch of the jq original is deliberately NOT
// ported — it distinguishes on-roster from off-roster lanes, and this report
// only cares about the "no lane at all" case.
function resolvedDispatchLane(row) {
  const na = detailFirstString(row, 'next_agent');
  if (na !== '') return na;
  const ow = detailFirstString(row, 'owner');
  if (ow !== '') return ow;
  return 'none';
}

// Scope matches bounded1-supervised-lane-report.sh's own coverage EXACTLY (it
// grew from backlog-only to also ready/review in the 2026-07-30 AC-5
// extension). in_progress[]/qa[] are excluded — an owner is a structural
// precondition of being in either. active_sprints[] excluded for Stage 1g's own
// reason (WIP-normal intra-sprint noise); done[]/done_verified[] are terminal.
// Epic wrappers are excluded per-row (see isEpicWrapper above), matching the
// report script's own `non-wrapper` scoping of its GATING class.
const FLAGGED_NO_HANDLER_LANES = ['backlog', 'ready', 'review'];

const flaggedNoHandlerIssues = [];
for (const lane of FLAGGED_NO_HANDLER_LANES) {
  const rows = result.data?.task_board?.[lane] ?? [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;
    if (!flaggedEitherWay(row)) continue;              // unflagged parked row — LEGAL, never reported
    if (isEpicWrapper(row)) continue;                  // decomposition container — handler-less BY DESIGN
    if (resolvedDispatchLane(row) !== 'none') continue; // has a handler — nothing to report
    flaggedNoHandlerIssues.push({
      path: `task_board.${lane}[${i}]`,
      taskId: row.id ?? '(no id)',
      supervised: row.supervised === true || detailItemsById[row.id]?.supervised === true,
      plan_only: row.plan_only === true || detailItemsById[row.id]?.plan_only === true,
    });
  }
}

if (flaggedNoHandlerIssues.length > 0) {
  const c = flaggedNoHandlerIssues.length;
  process.stdout.write(
    `\n[orch-validate] REPORT — Stage 1i (${c} row${c !== 1 ? 's' : ''} flagged supervised/plan_only with NO resolvable dispatch lane; NON-FATAL, see docs/architecture-briefs/2026-08-23-fix-orchstate-mint-flagged-row-no-handler.md):\n`
  );
  for (let i = 0; i < c; i++) {
    const fi = flaggedNoHandlerIssues[i];
    const flags = [fi.supervised ? 'supervised' : null, fi.plan_only ? 'plan_only' : null]
      .filter(Boolean)
      .join('+');
    process.stdout.write(
      `  [${i + 1}] ${fi.path} (id=${fi.taskId}): ${flags} set but next_agent AND owner are both empty (inline and in backlog-detail.json) — no picker can route it\n`
    );
    process.stdout.write(
      `      fix: set next_agent (or owner) to the deliberate handler this flag is asserting, or clear the flag if the row is genuinely parked\n`
    );
  }
}

// ── Stage 1h: sprint-registry referential-integrity guard (warn-first) ────────
//
// Strict known-id union (A1 correction, orchStateSchema.ts §16): cold archive
// closed_sprints[].id + closed_sprint_goals sprint ids ONLY — deliberately a
// SEPARATE set from Stage 1g's archiveIds (that one is done_tasks[].id, the
// weak per-task provenance signal this stage must never treat as "known").
// coldDoneTasks (id + own .sprint) is collected too — same § 15 DI contract —
// used ONLY for STEP-0 task-id-collision resolution inside the delegated
// classifySprintRegistryDanglingIds() call, never as a "known sprint id" source.

const coldClosedSprintIds = new Set();
const coldDoneTasks = [];
try {
  const archiveFiles = readdirSync(archiveDir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
  for (const af of archiveFiles) {
    try {
      const archiveDoc = JSON.parse(readFileSync(resolve(archiveDir, af), 'utf-8'));
      for (const s of archiveDoc.closed_sprints ?? []) {
        if (s && typeof s.id === 'string' && s.id) coldClosedSprintIds.add(s.id);
      }
      const goals = archiveDoc.closed_sprint_goals;
      if (Array.isArray(goals)) {
        for (const g of goals) {
          const sid = g?.sprint_id;
          if (typeof sid === 'string' && sid) coldClosedSprintIds.add(sid);
        }
      } else if (goals && typeof goals === 'object') {
        for (const sid of Object.keys(goals)) coldClosedSprintIds.add(sid);
      }
      for (const t of archiveDoc.done_tasks ?? []) {
        if (t && typeof t.id === 'string' && t.id) {
          coldDoneTasks.push({ id: t.id, sprint: typeof t.sprint === 'string' ? t.sprint : null });
        }
      }
    } catch {
      // fail-soft: one unreadable/malformed monthly archive file must not
      // block this write — smaller known-id set for that run only.
    }
  }
} catch {
  // fail-soft: archive dir missing entirely — Stage 1h runs hot-only known-ids.
}

const ORCH_SPRINT_REGISTRY_MODE = process.env.ORCH_SPRINT_REGISTRY_MODE === 'reject' ? 'reject' : 'warn';
const registryResult = checkSprintRegistryReferentialIntegrity(result.data, {
  coldClosedSprintIds,
  coldDoneTasks,
});

if (registryResult.violations.length > 0) {
  const c = registryResult.violations.length;
  const label = ORCH_SPRINT_REGISTRY_MODE === 'reject' ? 'FAIL' : 'WARN';
  process.stdout.write(
    `\n[orch-validate] ${label} — Stage 1h (${c} sprint-registry referential-integrity ` +
    `violation${c !== 1 ? 's' : ''}; ORCH_SPRINT_REGISTRY_MODE=${ORCH_SPRINT_REGISTRY_MODE}):\n`
  );
  registryResult.violations.forEach((v, i) => {
    process.stdout.write(
      `  [${i + 1}] id=${v.id} planes=${v.planes.join('+')}: ${v.detail}\n` +
      `      expected: a real active_sprints[]/closed_sprints[] object for this id\n` +
      `      fix: reconcile via scripts/audits/verify-sprint-registry-referential-integrity.mjs + PO sign-off, then scripts/orch-apply.sh\n`
    );
  });

  // One aggregated docs/signals/ entry per distinct violating-id set (dedup —
  // same discipline as scripts/agents-flow/context-bloat-backstop.sh / brief §3).
  const idSetHash = createHash('sha256')
    .update([...registryResult.violations.map((v) => v.id)].sort().join(','))
    .digest('hex')
    .slice(0, 16);
  const signalsDir = resolve(PROJECT_ROOT, 'docs/signals');
  const stemPrefix = `sprint-registry-integrity-${idSetHash}`;
  let alreadySignaled = false;
  try {
    alreadySignaled = readdirSync(signalsDir).some((f) => f.startsWith(stemPrefix) && f.endsWith('.json'));
  } catch {
    // fail-soft: docs/signals/ missing/unreadable — skip signal emission, never block the write.
    alreadySignaled = true;
  }
  if (!alreadySignaled) {
    try {
      const ts = new Date().toISOString().replace(/[:]/g, '');
      const signalPath = resolve(signalsDir, `${stemPrefix}-${ts}.json`);
      writeFileSync(
        signalPath,
        JSON.stringify(
          {
            from: 'orch-validate-stage1h',
            to: 'po',
            type: 'sprint_registry_dangling_ids',
            priority: 'high',
            createdAt: new Date().toISOString(),
            payload: {
              violation_count: registryResult.violations.length,
              ids: registryResult.violations.map((v) => ({ id: v.id, planes: v.planes })),
              action_required: 'reconcile_via_verify_sprint_registry_referential_integrity_script',
            },
          },
          null,
          2
        ) + '\n'
      );
    } catch {
      // fail-soft: signal write failure never blocks the underlying orch-state write.
    }
  }

  if (ORCH_SPRINT_REGISTRY_MODE === 'reject') {
    process.stderr.write(
      `\nORCH-STATE VALIDATION FAILED — Stage 1h (${c} sprint-registry referential-integrity ` +
      `violation${c !== 1 ? 's' : ''}, ORCH_SPRINT_REGISTRY_MODE=reject) — fix and retry:\n`
    );
    process.exit(2);
  }
}

// ── All checks passed ──────────────────────────────────────────────────────────
// coherenceIssues is always empty here — Stage 1b exits(2) above on any issue.

process.stdout.write(`[orch-validate] Stage 0 + Stage 1 PASS — ${absPath}\n`);
process.exit(0);
