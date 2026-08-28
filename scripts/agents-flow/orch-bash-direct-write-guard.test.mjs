/**
 * scripts/agents-flow/orch-bash-direct-write-guard.test.mjs
 *
 * Sprint:  COWORK-GUARANTEED-SLOT-CATCHUP
 * Task:    HOOK-ENFORCEMENT-BASH-HEURISTIC-GUARD
 * Run:     bun test scripts/agents-flow/orch-bash-direct-write-guard.test.mjs
 *
 * COVERS (architecture brief docs/architecture-briefs/2026-08-26-hook-
 * enforcement-plane-mcp-socket.md §6.2 + §8 staged rollout):
 *
 *   Rule class 2 — direct-bypass Bash writes to docs/data/orch/orch-state.json
 *   that skip the mandated `orch-apply.sh` wrapper. Heuristic (honestly scoped):
 *   detects write-verbs (`>`, `>>`, `tee`, `mv`, `cp`, `sed -i`) targeting a
 *   path resolving to orch-state.json when the command does NOT also contain
 *   `orch-apply.sh`. Deliberately does NOT claim to defeat string obfuscation
 *   (`X="docs/data/orch/orch-state.json"; ... > "$X"`) — asserted as a
 *   documented limit below, not as a defect.
 *
 *   Staging (§8):
 *     Stage 1 (SHIPPED, default): observe-only — a would-flag command is
 *       appended to the sibling would-block log, exit 0, NEVER `decision:block`.
 *     Stage 2 (NOT active by default): `ORCH_BASH_GUARD_MODE=block` enables
 *       `{"decision":"block","reason":"..."}` + exit 2. Promotion is PO-gated
 *       (§8: both Stage-1 criteria — deliberate-violation fires the log AND
 *       zero false positives over >=20 real orch-state-touching Bash
 *       invocations — must be met first).
 *     Kill switch (§8): `ORCH_BASH_GUARD_DISABLE=1` → exit 0, no log, no block.
 *
 *   WEDGE-GUARD (same binding policy as orch-state-hook-prewrite.mjs): any
 *   infrastructure failure (unparseable stdin, missing tool fields, log write
 *   failure) → fail-open exit 0, warn to stderr. A hook must never break work.
 */

import { test, expect, describe } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPTS_DIR, '../..');
const GUARD_MJS = resolve(SCRIPTS_DIR, 'orch-bash-direct-write-guard.mjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a PreToolUse Bash payload with the given command. */
function bashPayload(command) {
  return JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
}

/**
 * Invoke the guard with the given stdin + env overrides.
 * Returns spawnSync result (status, stdout, stderr).
 */
function runGuard(stdinData, extraEnv = {}) {
  return spawnSync('bun', [GUARD_MJS], {
    input: stdinData,
    encoding: 'utf-8',
    cwd: PROJECT_ROOT,
    timeout: 30000,
    env: { ...process.env, ...extraEnv },
  });
}

/** Fresh temp dir for one test's would-block log + cleanup. */
function tempLogDir() {
  const dir = mkdtempSync(join(tmpdir(), 'orch-bash-guard-test-'));
  const logPath = join(dir, 'would-block.jsonl');
  return { dir, logPath };
}

/** Read a would-block log file as parsed JSON lines (skipping any `#` schema comment). */
function readLogLines(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf-8')
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('#'))
    .map((l) => JSON.parse(l));
}

// ── Stage 1 (default, observe-only): would-flag → log append, exit 0 ─────────

describe('Stage 1 observe-only (default) — direct-bypass writes append would-block log, exit 0, never block', () => {
  test('`> docs/data/orch/orch-state.json` (redirect) → exit 0 + one log line', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload('jq \'.a=1\' docs/data/orch/orch-state.json > docs/data/orch/orch-state.json'),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(''); // never a block decision in Stage 1
      const lines = readLogLines(logPath);
      expect(lines).toHaveLength(1);
      expect(lines[0].hook).toBe('orch-bash-direct-write-guard');
      expect(lines[0].command).toContain('orch-state.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('`>>` append redirect → logged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload("echo '{}' >> docs/data/orch/orch-state.json"),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('`2>` stderr redirect to orch-state → logged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload("echo err 2> docs/data/orch/orch-state.json"),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('quoted target `> "docs/data/orch/orch-state.json"` → logged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload("echo '{}' > \"docs/data/orch/orch-state.json\""),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('absolute path target (substring form) → logged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload(`echo '{}' > /Users/admin/VN-Market-Intelligence-MCP/docs/data/orch/orch-state.json`),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('`tee docs/data/orch/orch-state.json` → logged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload('tee docs/data/orch/orch-state.json < /tmp/new.json'),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('`mv <src> docs/data/orch/orch-state.json` (dest) → logged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload('mv /tmp/new.json docs/data/orch/orch-state.json'),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('`cp <src> docs/data/orch/orch-state.json` (dest) → logged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload('cp /tmp/new.json docs/data/orch/orch-state.json'),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('`sed -i ... docs/data/orch/orch-state.json` (in-place) → logged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload("sed -i 's/BACKLOG/TODO/' docs/data/orch/orch-state.json"),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('glued redirect `>docs/data/orch/orch-state.json` (no space) → logged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload("echo '{}' >docs/data/orch/orch-state.json"),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('glued stderr `2>docs/data/orch/orch-state.json` → logged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload("cmd 2>docs/data/orch/orch-state.json"),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('multi-command `echo a; mv /tmp/x docs/data/orch/orch-state.json` → logged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload('echo a; mv /tmp/x docs/data/orch/orch-state.json'),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('log line carries ts + hook + session_id (from DSH_SESSION_ID when set)', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload("echo '{}' > docs/data/orch/orch-state.json"),
        {
          ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath,
          DSH_SESSION_ID: 'session-123eed97-8701-47f8-b7ee-90afc862380e',
        }
      );
      expect(result.status).toBe(0);
      const lines = readLogLines(logPath);
      expect(lines).toHaveLength(1);
      expect(lines[0].session_id).toBe('session-123eed97-8701-47f8-b7ee-90afc862380e');
      expect(typeof lines[0].ts).toBe('string');
      expect(lines[0].ts.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── Allow-through (no false positives) ───────────────────────────────────────

describe('Allow-through — legitimate commands never flagged (Stage-1 zero-FP seed)', () => {
  test('read-only `cat docs/data/orch/orch-state.json` → exit 0, no log', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(bashPayload('cat docs/data/orch/orch-state.json'), {
        ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath,
      });
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('jq READ + redirect to /tmp (path before `>`, target is /tmp) → not flagged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload("jq '.x' docs/data/orch/orch-state.json > /tmp/out.json"),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('mandated wrapper present: `jq ... | bash scripts/orch-apply.sh` → exit 0, no log', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload("jq '.a=1' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh"),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('mandated wrapper present even with a would-be-write verb → exit 0, no log', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload("jq '.a=1' docs/data/orch/orch-state.json | tee /tmp/x.json | bash scripts/orch-apply.sh"),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('`cp docs/data/orch/orch-state.json /tmp/backup.json` (dest NOT orch-state) → not flagged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload('cp docs/data/orch/orch-state.json /tmp/backup.json'),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('`git checkout docs/data/orch/orch-state.json` (rollback) → not flagged (no write verb)', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload('git checkout docs/data/orch/orch-state.json'),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('`bun scripts/orch-validate.mjs docs/data/orch/orch-state.json` (validate read) → not flagged', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload('bun scripts/orch-validate.mjs docs/data/orch/orch-state.json'),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unrelated command `echo hello` → exit 0, no log', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(bashPayload('echo hello'), {
        ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath,
      });
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('jq filter containing `>` inside quotes, orch-state READ → not flagged (quoted `>` is not a redirect)', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload("jq '.rows[] | select(.a > 1)' docs/data/orch/orch-state.json"),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('DOCUMENTED LIMIT — obfuscated target `X="docs/data/orch/orch-state.json"; jq . > "$X"` → NOT detected (exit 0, no log)', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload('X="docs/data/orch/orch-state.json"; jq . > "$X"'),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── Stage 2 (gated): block mode ──────────────────────────────────────────────

describe('Stage 2 block mode (ORCH_BASH_GUARD_MODE=block, NOT active by default)', () => {
  test('direct-bypass write → exit 2 with {"decision":"block","reason":...}', () => {
    const result = runGuard(
      bashPayload("echo '{}' > docs/data/orch/orch-state.json"),
      { ORCH_BASH_GUARD_MODE: 'block' }
    );
    expect(result.status).toBe(2);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('orch-apply.sh');
  });

  test('mandated wrapper still passes in block mode → exit 0', () => {
    const result = runGuard(
      bashPayload("jq '.a=1' docs/data/orch/orch-state.json | bash scripts/orch-apply.sh"),
      { ORCH_BASH_GUARD_MODE: 'block' }
    );
    expect(result.status).toBe(0);
  });

  test('block mode without ORCH_BASH_GUARD_MODE env (default) stays observe-only → exit 0, logs to would-block', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(bashPayload("echo '{}' > docs/data/orch/orch-state.json"), {
        ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath,
      });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('');
      expect(readLogLines(logPath)).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── Kill switch ──────────────────────────────────────────────────────────────

describe('Kill switch — ORCH_BASH_GUARD_DISABLE=1', () => {
  test('disables both observe logging and block mode → exit 0, no log, no stdout', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        bashPayload("echo '{}' > docs/data/orch/orch-state.json"),
        {
          ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath,
          ORCH_BASH_GUARD_MODE: 'block',
          ORCH_BASH_GUARD_DISABLE: '1',
        }
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('');
      expect(readLogLines(logPath)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── WEDGE-GUARD / error paths (fail-open) ────────────────────────────────────

describe('Error paths — fail-open exit 0', () => {
  test('unparseable stdin → exit 0, no stdout', () => {
    const result = runGuard('NOT VALID JSON');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  test('empty stdin → exit 0', () => {
    const result = runGuard('');
    expect(result.status).toBe(0);
  });

  test('non-Bash tool (Write) → exit 0, no log', () => {
    const { dir, logPath } = tempLogDir();
    try {
      const result = runGuard(
        JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'docs/data/orch/orch-state.json', content: '{}' } }),
        { ORCH_BASH_GUARD_WOULDBLOCK_LOG: logPath }
      );
      expect(result.status).toBe(0);
      expect(readLogLines(logPath)).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Bash payload missing tool_input.command → exit 0', () => {
    const result = runGuard(JSON.stringify({ tool_name: 'Bash', tool_input: {} }));
    expect(result.status).toBe(0);
  });

  test('would-block log write failure (unwritable dir) → exit 0, warn on stderr, never block', () => {
    const result = runGuard(
      bashPayload("echo '{}' > docs/data/orch/orch-state.json"),
      { ORCH_BASH_GUARD_WOULDBLOCK_LOG: '/nonexistent-dir-xyz/would-block.jsonl' }
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
    expect(result.stderr).toContain('WARN');
  });
});
