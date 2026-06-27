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
 *     Stage 1b: checkLaneCoherence() — WARN-only during SHG migration (~72 violations expected)
 *     Stage 1c: checkRefIntegrity() — hard fail on dangling detail_ref / payload_ref
 *
 * EXIT CODES:
 *   0  = Stage 0 + Stage 1 pass (coherence warnings do NOT cause non-zero exit during migration)
 *   1  = Stage 0 failure (duplicate JSON keys detected in raw text)
 *   2  = Stage 1 failure (schema violation) OR Stage 1c failure (dangling refs)
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

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import TypeScript schema directly — bun transpiles .ts on the fly (no compile step).
// Single source of truth: orchStateSchema.ts is the ONE enum + ONE schema.
// Do NOT duplicate the schema here.
import {
  OrchStateSchema,
  checkLaneCoherence,
  checkRefIntegrity,
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

// ── Stage 1b: Lane coherence (warn-only during SHG migration) ─────────────────
//
// checkLaneCoherence() is exported SEPARATELY from OrchStateSchema because
// the live data has ~72 coherence violations during the SHG migration period
// (backlog[] still contains REVIEW/IN_PROGRESS/DONE stragglers pre-SHG-2).
// These do NOT cause safeParse to fail — they are reported as warnings here.
// Switch coherence to a hard-fail AFTER SHG-2 (status migration) + SHG-4 (eviction) complete.

const coherenceIssues = checkLaneCoherence(result.data);

// ── Stage 1c: Referential integrity (hard fail on dangling refs) ──────────────
//
// Checks that detail_ref and signal_queue.rows[].payload_ref point to existing files.
// Uses existsSync as the injected file resolver (keeps the schema unit-testable).

const refIssues = checkRefIntegrity(result.data, existsSync, PROJECT_ROOT);

// Print coherence warnings (non-blocking during migration)
if (coherenceIssues.length > 0) {
  const c = coherenceIssues.length;
  process.stderr.write(
    `\n[orch-validate] COHERENCE WARNINGS (${c} issue${c !== 1 ? 's' : ''} — SHG migration in progress, not blocking exit):\n`
  );
  const showMax = Math.min(c, 10); // cap display — full count in header
  for (let i = 0; i < showMax; i++) {
    const ci = coherenceIssues[i];
    process.stderr.write(
      `  [${i + 1}] task_board.${ci.lane}[id=${ci.taskId}].status: ` +
        `"${ci.status}" is not allowed in lane "${ci.lane}"\n`
    );
    process.stderr.write(`        expected: ${ci.allowedStatuses.join('|')}\n`);
    process.stderr.write(`        fix: ${ci.fix}\n`);
  }
  if (c > showMax) {
    process.stderr.write(`  ... and ${c - showMax} more coherence issue(s)\n`);
  }
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

// ── All checks passed ──────────────────────────────────────────────────────────

if (coherenceIssues.length > 0) {
  process.stdout.write(
    `[orch-validate] Stage 0 + Stage 1 PASS — ` +
      `${coherenceIssues.length} coherence warning(s) (SHG migration, non-blocking) — ${absPath}\n`
  );
} else {
  process.stdout.write(`[orch-validate] Stage 0 + Stage 1 PASS — ${absPath}\n`);
}
process.exit(0);
