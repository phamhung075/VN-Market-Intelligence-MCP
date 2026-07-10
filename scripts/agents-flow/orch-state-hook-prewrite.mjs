#!/usr/bin/env bun
/**
 * scripts/agents-flow/orch-state-hook-prewrite.mjs
 * PreToolUse gate — Write|Edit on docs/data/orch/orch-state.json
 *
 * Sprint:    SSOT-INTEGRITY-PERIMETER
 * Task:      SSOT-W1-HOOK-ENFORCE
 * Directive: docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md
 * Authority: docs/policies/dev-standards.md § Script Persistence (CANONICAL pointer added)
 *
 * ROLE (Point-1 enforcement — hook side):
 *   Validates the PROPOSED write against the Zod schema BEFORE it lands on disk.
 *   Shells out to the canonical Zod validator: scripts/orch-validate.mjs
 *   (SSOT-W1-ZOD-VALIDATOR-CLI) — never duplicates the schema.
 *   The server-side enforcement (SSOT-W1-SERVER-ENFORCE) covers internal server writes;
 *   this hook closes the Claude tool-call side (Write + Edit tools).
 *
 *   Also shells out to scripts/orch-conservation-check.mjs (FIX-ORCHSTATE-
 *   CONSERVATION-GUARD-CIRCUIT-BREAKER) — defense-in-depth parity with the
 *   primary Stage-2 gate in scripts/orch-apply.sh. Secondary hardening, not
 *   the load-bearing fix (the writer-audit found zero live direct-Write/Edit
 *   bypass sites of orch-apply.sh — see docs/architecture-briefs/
 *   2026-07-10-auditor-orchstate-conservation-guard.md §4.3). Honors the same
 *   ORCH_APPLY_ALLOW_SHRINK bypass, read from this hook process's own env.
 *
 * WRITE handling:
 *   Extracts tool_input.content → writes to temp file → validates → block or allow.
 *
 * EDIT handling:
 *   Reads current orch-state.json, applies proposed old_string→new_string replacement
 *   to a temp copy, validates the result → block or allow.
 *   (replace_all flag honoured per Edit tool spec.)
 *
 * INPUT (stdin): PreToolUse JSON hook payload
 *   { "tool_name": "Write"|"Edit", "tool_input": { "file_path": "...", ... } }
 *
 * OUTPUT on block: {"decision":"block","reason":"..."} to stdout; exit 2
 * OUTPUT on pass:  nothing; exit 0
 * OUTPUT on error: nothing (allow through — hook errors must never break work);
 *                  errors written to stderr for debugging only.
 *
 * EXIT CODES: 0 = allow, 2 = block (schema violation), 0 = allow-through on hook error
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// ── Path resolution ──────────────────────────────────────────────────────────
// Use import.meta.url so paths are correct regardless of CWD when hook fires.
const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPTS_DIR, '../..');
const ORCHSTATE_PATH = resolve(PROJECT_ROOT, 'docs/data/orch/orch-state.json');

// ORCH_HOOK_VALIDATOR — override validator path (test coverage for fail-open infra paths).
// ORCH_HOOK_CONSERVATION_CHECK — override conservation-check path (same test-coverage intent).
// ORCH_HOOK_BUN_BIN  — override bun binary (test coverage for spawn-fail fail-open path).
// All overrides default to the production values when env vars are absent.
const VALIDATOR_PATH =
  process.env.ORCH_HOOK_VALIDATOR ?? resolve(PROJECT_ROOT, 'scripts/orch-validate.mjs');
const CONSERVATION_CHECK_PATH =
  process.env.ORCH_HOOK_CONSERVATION_CHECK ??
  resolve(PROJECT_ROOT, 'scripts/orch-conservation-check.mjs');
const BUN_BIN = process.env.ORCH_HOOK_BUN_BIN ?? 'bun';

// ── Block helper ─────────────────────────────────────────────────────────────
function block(reason) {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason: `[orch-state-hook] BLOCKED: ${reason}`,
    }) + '\n'
  );
  process.exit(2);
}

// ── Main ─────────────────────────────────────────────────────────────────────
let hookInput;
try {
  const raw = readFileSync('/dev/stdin', 'utf-8');
  if (!raw.trim()) process.exit(0);
  hookInput = JSON.parse(raw);
} catch (err) {
  // Unparseable stdin → allow through silently
  process.stderr.write(`[orch-state-hook] stdin parse error: ${err.message}\n`);
  process.exit(0);
}

const toolName = String(hookInput?.tool_name ?? '');
const filePath = String(hookInput?.tool_input?.file_path ?? '');

// Fast-path: only intercept orch-state.json writes
if (!filePath.endsWith('orch-state.json')) process.exit(0);
if (toolName !== 'Write' && toolName !== 'Edit') process.exit(0);

// Validator missing = INFRASTRUCTURE failure (cannot determine validity) → FAIL-OPEN.
// Wedge-guard binding decision: a spawned agent may have no bun in PATH; a hard block
// there wedges every orch-state write = system wedge. Warn loudly; never block.
if (!existsSync(VALIDATOR_PATH)) {
  process.stderr.write(
    `[orch-state-hook] WARN: validator not found at ${VALIDATOR_PATH} — ` +
    `allowing write through (infrastructure fail-open; run SSOT-W1-ZOD-VALIDATOR-CLI to restore)\n`
  );
  process.exit(0);
}

// Conservation-check script missing = INFRASTRUCTURE failure → FAIL-OPEN (same policy as above).
if (!existsSync(CONSERVATION_CHECK_PATH)) {
  process.stderr.write(
    `[orch-state-hook] WARN: conservation-check not found at ${CONSERVATION_CHECK_PATH} — ` +
    `allowing write through (infrastructure fail-open; run FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER to restore)\n`
  );
  process.exit(0);
}

const PROPOSAL_TMP = resolve(
  PROJECT_ROOT,
  `.claude/tmp/orch-hook-proposal-${Date.now()}.json`
);

// Ensure tmp dir exists
try {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(resolve(PROJECT_ROOT, '.claude/tmp'), { recursive: true });
} catch {}

let proposedContent;

try {
  if (toolName === 'Write') {
    proposedContent = hookInput.tool_input?.content;
    if (typeof proposedContent !== 'string') {
      block('Write tool_input.content is missing or non-string');
    }
  } else {
    // Edit: apply proposed replacement to a copy of the current file
    if (!existsSync(ORCHSTATE_PATH)) {
      // File doesn't exist yet — nothing to protect
      process.exit(0);
    }
    const current = readFileSync(ORCHSTATE_PATH, 'utf-8');
    const oldStr = String(hookInput.tool_input?.old_string ?? '');
    const newStr = String(hookInput.tool_input?.new_string ?? '');
    const replaceAll = Boolean(hookInput.tool_input?.replace_all ?? false);

    if (oldStr === '') {
      // Empty old_string → no match possible; let Edit tool handle it
      process.exit(0);
    }

    if (replaceAll) {
      proposedContent = current.split(oldStr).join(newStr);
    } else {
      const idx = current.indexOf(oldStr);
      if (idx === -1) {
        // old_string not found → Edit will fail on its own; allow through
        process.exit(0);
      }
      proposedContent = current.slice(0, idx) + newStr + current.slice(idx + oldStr.length);
    }
  }

  // Write proposal to temp file for validation
  writeFileSync(PROPOSAL_TMP, proposedContent, 'utf-8');

  // Invoke canonical Zod validator (same binary used by SSOT-W1-ZOD-VALIDATOR-CLI)
  const result = spawnSync(BUN_BIN, [VALIDATOR_PATH, PROPOSAL_TMP], {
    encoding: 'utf-8',
    cwd: PROJECT_ROOT,
    timeout: 15000, // 15s safety cap
  });

  if (result.error) {
    // bun spawn failed (bun not in PATH, etc.) → allow through to avoid breaking work
    process.stderr.write(`[orch-state-hook] validator spawn error: ${result.error.message}\n`);
    process.exit(0);
  }

  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    const stdout = (result.stdout ?? '').trim();
    const detail = stderr || stdout || `exit ${result.status}`;
    // Truncate to keep the JSON block reason readable
    const truncated = detail.length > 600 ? detail.slice(0, 600) + ' …(truncated)' : detail;
    block(`schema validation failed (exit ${result.status}): ${truncated}`);
  }

  // Schema validation passed — Stage 2 parity: conservation circuit-breaker
  // (FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER). Compares this
  // proposal's whole-board totals against the CURRENT on-disk live file.
  // Skipped when the live file does not exist yet (first-time create — no
  // baseline to shrink against). Honors ORCH_APPLY_ALLOW_SHRINK from this
  // hook process's own env — set ONLY by the 2 legitimate bulk-eviction
  // writers (scripts/orch-cold-evict.sh, docs/agents/pm/flow/task-archive.md);
  // neither of those calls the Write/Edit tools directly (they write via
  // orch-apply.sh), so in practice this branch fires without the bypass set
  // — it is defense-in-depth, not the load-bearing gate (brief §4.3).
  if (existsSync(ORCHSTATE_PATH)) {
    const conservationResult = spawnSync(
      BUN_BIN,
      [CONSERVATION_CHECK_PATH, ORCHSTATE_PATH, PROPOSAL_TMP],
      { encoding: 'utf-8', cwd: PROJECT_ROOT, timeout: 15000 }
    );

    if (conservationResult.error) {
      // spawn failed → allow through (infra fail-open, same policy as validator spawn above)
      process.stderr.write(
        `[orch-state-hook] conservation-check spawn error: ${conservationResult.error.message}\n`
      );
    } else if (conservationResult.status === 1) {
      const stderr = (conservationResult.stderr ?? '').trim();
      const stdout = (conservationResult.stdout ?? '').trim();
      const detail = stderr || stdout || `exit ${conservationResult.status}`;
      const truncated = detail.length > 600 ? detail.slice(0, 600) + ' …(truncated)' : detail;
      block(`conservation check failed: ${truncated}`);
    } else if (conservationResult.status !== 0) {
      // exit 3 (usage/file error) or any other non-1 status — infra class, fail-open (never block).
      process.stderr.write(
        `[orch-state-hook] WARN: conservation-check usage/infra error (exit ${conservationResult.status}) — allowing through\n`
      );
    }
  }

  // Validation passed — allow the write
  process.exit(0);
} finally {
  try { unlinkSync(PROPOSAL_TMP); } catch {}
}
