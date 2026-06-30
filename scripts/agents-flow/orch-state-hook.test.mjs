/**
 * scripts/agents-flow/orch-state-hook.test.mjs
 *
 * Sprint:  SSOT-INTEGRITY-PERIMETER
 * Task:    SSOT-W1-HOOK-ENFORCE
 * Run:     bun test scripts/agents-flow/orch-state-hook.test.mjs
 *
 * COVERS:
 *   QA-5  Write of bad orch-state (status "PARKED") is BLOCKED — deny reason returned.
 *         File must NOT reach disk. Verified by checking that the hook exits 2 and
 *         stdout is a structured {"decision":"block","reason":"..."} JSON object.
 *
 *   AC-2  PreToolUse Write + Edit paths both intercept orch-state.json writes.
 *   AC-3  PostToolUse Bash backstop always exits 0 (non-blocking).
 *   AC-4  Error-path coverage:
 *           stdin parse error   → allow through (exit 0, empty stdout)
 *           empty stdin         → allow through (exit 0)
 *           non-orch file path  → allow through (exit 0, empty stdout)
 *           Edit old_string not found → allow through (exit 0)
 *   AC-6  No regressions on non-orch Write/Edit/Bash calls.
 *
 * WEDGE-GUARD (binding override of original brief):
 *   VALIDATION failure (validator ran, status bad)    → BLOCK. ✅
 *   INFRASTRUCTURE failure (bun not found, validator  → FAIL-OPEN: exit 0, warn to stderr.
 *     missing, spawn error — cannot determine validity)
 *   Both error paths are now testable via env var overrides added to the hook:
 *     ORCH_HOOK_VALIDATOR=/nonexistent  — simulates validator missing
 *     ORCH_HOOK_BUN_BIN=/nonexistent    — simulates bun spawn fail
 *   See describe block "WEDGE-GUARD — infrastructure failures MUST allow write through" below.
 */

import { test, expect, describe } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPTS_DIR, '../..');
const HOOK_MJS = resolve(SCRIPTS_DIR, 'orch-state-hook-prewrite.mjs');
const BACKSTOP_SH = resolve(SCRIPTS_DIR, 'orch-state-hook-bash-backstop.sh');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal structurally valid orch-state JSON string with the given
 * task status. Any non-canonical status value (e.g. "PARKED") will fail the
 * Zod StatusEnum check in the validator.
 */
function buildOrchContent(taskStatus) {
  return JSON.stringify({
    head: { status: 'idle' },
    signal_queue: {
      _updated_at: '2026-06-27T00:00:00Z',
      _updated_by: 'test',
      rows: [],
    },
    task_board: {
      backlog: [{ id: 'TASK-001', status: taskStatus }],
      active_sprints: [],
    },
  });
}

/**
 * Build a PreToolUse Write payload for the given file path and content.
 */
function writePayload(filePath, content) {
  return JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: filePath, content },
  });
}

/**
 * Invoke the prewrite hook with the given stdin string.
 * Returns spawnSync result (status, stdout, stderr).
 */
function runPrewrite(stdinData) {
  return spawnSync('bun', [HOOK_MJS], {
    input: stdinData,
    encoding: 'utf-8',
    cwd: PROJECT_ROOT,
    timeout: 30000,
  });
}

// ── QA-5: Write of bad orch-state is blocked ──────────────────────────────────

describe('QA-5 — Write of invalid orch-state is BLOCKED', () => {
  test('status "PARKED" (invalid enum) → block decision + exit 2', () => {
    const payload = writePayload(
      'docs/data/orch/orch-state.json',
      buildOrchContent('PARKED'),
    );

    const result = runPrewrite(payload);

    // Exit code must be 2 (block) — NOT 0 (allow)
    expect(result.status).toBe(2);

    // stdout must be a valid JSON block decision
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.decision).toBe('block');
    expect(typeof parsed.reason).toBe('string');

    // reason must mention the offending value
    expect(parsed.reason).toContain('PARKED');
    expect(parsed.reason).toContain('BLOCKED');
  });

  test('reason contains structured error from validator (status enum list)', () => {
    const payload = writePayload(
      'docs/data/orch/orch-state.json',
      buildOrchContent('FOLDED'),
    );

    const result = runPrewrite(payload);

    expect(result.status).toBe(2);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.decision).toBe('block');
    // Validator auto-fix contract: expected enum list must appear in reason
    expect(parsed.reason).toMatch(/BACKLOG\|TODO\|IN_PROGRESS/);
  });
});

// ── AC-2: PreToolUse Write + Edit paths ──────────────────────────────────────

describe('AC-2 — PreToolUse Write and Edit paths', () => {
  test('Write with valid status passes through (exit 0, empty stdout)', () => {
    const payload = writePayload(
      'docs/data/orch/orch-state.json',
      buildOrchContent('BACKLOG'),
    );

    const result = runPrewrite(payload);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  test('Edit: replacing valid status with invalid ("PARKED") is BLOCKED', () => {
    // The hook reads the live orch-state.json, applies the replacement, and validates.
    // "BACKLOG" exists in the live file — replacing with "PARKED" must be blocked.
    const payload = JSON.stringify({
      tool_name: 'Edit',
      tool_input: {
        file_path: 'docs/data/orch/orch-state.json',
        old_string: '"BACKLOG"',
        new_string: '"PARKED"',
        replace_all: false,
      },
    });

    const result = runPrewrite(payload);

    expect(result.status).toBe(2);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('PARKED');
  });

  test('Edit: old_string not found in file → allow through (exit 0)', () => {
    const payload = JSON.stringify({
      tool_name: 'Edit',
      tool_input: {
        file_path: 'docs/data/orch/orch-state.json',
        old_string: 'THIS_STRING_CANNOT_APPEAR_IN_FILE_xXx9z9z',
        new_string: 'PARKED',
      },
    });

    const result = runPrewrite(payload);

    expect(result.status).toBe(0);
  });
});

// ── AC-3: PostToolUse Bash backstop always exits 0 ───────────────────────────

describe('AC-3 — PostToolUse Bash backstop is non-blocking (always exits 0)', () => {
  function runBackstop(stdinData) {
    return spawnSync('bash', [BACKSTOP_SH], {
      input: stdinData,
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      timeout: 30000,
    });
  }

  test('Unrelated Bash command (no orch path) → exit 0', () => {
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'echo hello' },
    });
    const result = runBackstop(payload);
    expect(result.status).toBe(0);
  });

  test('Bash command mentioning orch-state (read-only cat) → exit 0', () => {
    // Even if it triggers the validator and the validator passes, exit must be 0
    const payload = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'cat docs/data/orch/orch-state.json' },
    });
    const result = runBackstop(payload);
    expect(result.status).toBe(0);
  });

  test('Empty stdin → exit 0', () => {
    const result = runBackstop('');
    expect(result.status).toBe(0);
  });
});

// ── AC-4: Error path coverage ─────────────────────────────────────────────────

describe('AC-4 — PreToolUse error paths', () => {
  test('Stdin parse error → allow through silently (exit 0)', () => {
    const result = runPrewrite('NOT VALID JSON');
    expect(result.status).toBe(0);
    // Hook must emit nothing to stdout (stderr is ok)
    expect(result.stdout.trim()).toBe('');
  });

  test('Empty stdin → allow through (exit 0)', () => {
    const result = runPrewrite('');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  test('stdin with non-string tool_name → allow through (exit 0)', () => {
    const result = runPrewrite(JSON.stringify({ tool_name: null, tool_input: {} }));
    expect(result.status).toBe(0);
  });
});

// ── AC-6: No regressions on non-orch calls ────────────────────────────────────

describe('AC-6 — Non-orch Write/Edit calls pass through', () => {
  test('Write to a TypeScript source file → exit 0', () => {
    const payload = writePayload(
      'apps/mcp-server/src/some-tool.ts',
      'export const x = 1;',
    );
    const result = runPrewrite(payload);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  test('Write to a markdown file → exit 0', () => {
    const payload = writePayload(
      'docs/handoffs/SOME-TASK.md',
      '# Handoff\n\nContent.',
    );
    const result = runPrewrite(payload);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  test('Edit on a non-orch file → exit 0', () => {
    const payload = JSON.stringify({
      tool_name: 'Edit',
      tool_input: {
        file_path: 'docs/handoffs/SOME-TASK.md',
        old_string: 'old',
        new_string: 'new',
      },
    });
    const result = runPrewrite(payload);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });
});

// ── WEDGE-GUARD: infrastructure fail-open paths ───────────────────────────────
//
// Binding directive: infrastructure failures (cannot DETERMINE validity) MUST
// allow the write through. NEVER block-hard on missing validator or missing bun.
// Rationale: a spawned agent may lack `bun` on its PATH; blocking there wedges
// ALL orch-state writes — the exact regression that killed the prior worker.
//
// Both paths are exercised via env var overrides added to the hook:
//   ORCH_HOOK_VALIDATOR — override validator path (default: scripts/orch-validate.mjs)
//   ORCH_HOOK_BUN_BIN   — override bun binary path (default: bun)

describe('WEDGE-GUARD — infrastructure failures MUST allow write through (fail-open)', () => {
  function runPrewriteWithEnv(stdinData, extraEnv) {
    return spawnSync('bun', [HOOK_MJS], {
      input: stdinData,
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      timeout: 30000,
      env: { ...process.env, ...extraEnv },
    });
  }

  test('validator missing (ORCH_HOOK_VALIDATOR=/nonexistent) → allow through (exit 0, no block json)', () => {
    const payload = writePayload(
      'docs/data/orch/orch-state.json',
      buildOrchContent('BACKLOG'), // valid content — but infrastructure unavailable
    );

    const result = runPrewriteWithEnv(payload, {
      ORCH_HOOK_VALIDATOR: '/nonexistent/orch-validate.mjs',
    });

    // Must allow through: validator unavailable = infrastructure failure, not validation failure
    expect(result.status).toBe(0);
    // stdout must be empty (no block JSON)
    expect(result.stdout.trim()).toBe('');
    // Warning must appear on stderr (surfaced to agent)
    expect(result.stderr).toContain('WARN');
  });

  test('validator missing + invalid content (PARKED) → STILL allow through (infrastructure beats validation)', () => {
    // Even invalid content must pass when the validator cannot run.
    // The hook cannot determine validity without infrastructure — fail-open is unconditional.
    const payload = writePayload(
      'docs/data/orch/orch-state.json',
      buildOrchContent('PARKED'), // invalid status — but validator is unavailable
    );

    const result = runPrewriteWithEnv(payload, {
      ORCH_HOOK_VALIDATOR: '/nonexistent/orch-validate.mjs',
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  test('bun spawn fail (ORCH_HOOK_BUN_BIN=/nonexistent/bun) → allow through (exit 0, no block json)', () => {
    const payload = writePayload(
      'docs/data/orch/orch-state.json',
      buildOrchContent('PARKED'), // invalid — but bun cannot be spawned; must still allow
    );

    const result = runPrewriteWithEnv(payload, {
      ORCH_HOOK_BUN_BIN: '/nonexistent/bun',
    });

    // Must allow through: bun not found = infrastructure failure (system wedge if blocked)
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  test('valid orch-state write with production validator → passes unimpeded (exit 0)', () => {
    // Regression gate: the production validator path must continue to allow valid writes.
    // This exercises the full happy path: hook intercepts → validator runs → PASS → exit 0.
    const payload = writePayload(
      'docs/data/orch/orch-state.json',
      buildOrchContent('BACKLOG'),
    );

    const result = runPrewrite(payload); // uses production env (no overrides)

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });
});
