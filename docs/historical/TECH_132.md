# TECH-132: VPS Auto-Deploy on Merge

status: APPROVED_BY_ARCHITECT
req_ref: REQ-132

## Brownfield Impact

- Files created: `scripts/maybe-deploy-vps.sh`, `src/__tests__/1378-vps-auto-deploy.test.ts`
- Files modified: `.claude/knowledge/dev-standards.md` (Branch Hygiene — insert step 4a)
- Files deleted: none
- Breaking changes: no — zero TypeScript source changes, zero schema changes

## Architecture Decision

This sprint is pure shell + documentation. No TypeScript source is touched. `scripts/maybe-deploy-vps.sh` follows the same pattern as `scripts/test-all.sh` — a standalone Bash utility that lives outside the DDD source tree. The FAKE_DIFF env-override pattern decouples the test from live git history, keeping the Bun test suite deterministic on any branch.

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| maybe-deploy-vps.sh | infrastructure (shell) | `scripts/maybe-deploy-vps.sh` | NEW |
| 1378 TDD test | test | `src/__tests__/1378-vps-auto-deploy.test.ts` | NEW |
| Branch hygiene step 4a | documentation | `.claude/knowledge/dev-standards.md` | MODIFY |

## Interface Contracts

### scripts/maybe-deploy-vps.sh — full logic spec

```
SYNOPSIS
  ./scripts/maybe-deploy-vps.sh [--dry-run]

ENVIRONMENT (read from .env if present)
  FAKE_DIFF                      — newline-separated path list (test isolation only)
  TELEGRAM_BOT_TOKEN             — optional; skip notification if unset
  TELEGRAM_INFO_WORK_CHANNEL_ID  — optional; skip notification if unset

EXIT CODES
  0  — trigger path (deploy ran or dry-run) + skip path
  1  — deploy-vinahost.sh not found at repo root (hard failure)

STDOUT
  "VPS deploy triggered"          — real deploy
  "VPS deploy triggered (dry-run)" — dry-run + VPS files detected
  "VPS deploy skipped"             — no VPS files changed
  "VPS deploy skipped (dry-run)"   — dry-run + no VPS files changed

STDERR
  warning when git diff fails (shallow clone)
  error when deploy-vinahost.sh missing

TRIGGER PATTERNS (anchored grep)
  ^vps-scripts/
  ^deploy-vinahost\.sh$
```

### Internal flow (pseudocode)

```bash
#!/bin/bash
set -euo pipefail

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

# Source .env if present (silent)
[ -f "$(dirname "$0")/../.env" ] && source "$(dirname "$0")/../.env" 2>/dev/null || true

# Diff detection
if [ -n "${FAKE_DIFF:-}" ]; then
  DIFF_OUTPUT="$FAKE_DIFF"
else
  DIFF_OUTPUT=$(git diff HEAD~1 --name-only 2>/dev/null || { echo "WARN: git diff failed — skipping VPS deploy" >&2; echo ""; })
fi

# Trigger check (prefix-anchored; ^vps-scripts/ and ^deploy-vinahost\.sh$)
TRIGGERED=false
while IFS= read -r line; do
  if [[ "$line" =~ ^vps-scripts/ ]] || [[ "$line" = "deploy-vinahost.sh" ]]; then
    TRIGGERED=true
    break
  fi
done <<< "$DIFF_OUTPUT"

if $TRIGGERED; then
  if $DRY_RUN; then
    echo "VPS deploy triggered (dry-run)"
  else
    DEPLOY="$(dirname "$0")/../deploy-vinahost.sh"
    if [ ! -f "$DEPLOY" ]; then
      echo "ERROR: deploy-vinahost.sh not found at repo root" >&2
      exit 1
    fi
    echo "VPS deploy triggered"
    bash "$DEPLOY"
    # Telegram WORK-channel notification (silent on missing vars)
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_INFO_WORK_CHANNEL_ID:-}" ]; then
      curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="${TELEGRAM_INFO_WORK_CHANNEL_ID}" \
        -d text="VPS deploy complete: vps-scripts/ or deploy-vinahost.sh changed in last merge." \
        > /dev/null
    fi
  fi
else
  if $DRY_RUN; then
    echo "VPS deploy skipped (dry-run)"
  else
    echo "VPS deploy skipped"
  fi
fi
```

### dev-standards.md — Branch Hygiene patch

Insert after step 4, before step 5:

```
4a. If changed files include `vps-scripts/**` or `deploy-vinahost.sh`, run
    `./scripts/maybe-deploy-vps.sh` before deleting the task branch.
```

### src/__tests__/1378-vps-auto-deploy.test.ts — test spec

```typescript
process.env["DB_PATH"] = ":memory:";
// src/__tests__/1378-vps-auto-deploy.test.ts
// Task 1378 — TDD: maybe-deploy-vps.sh detection logic (Sprint 132)
//
// All tests use --dry-run + FAKE_DIFF env var — no git history manipulation,
// no SSH, no network. Script must be RED before scripts/maybe-deploy-vps.sh
// exists (file-exists assertion fails). GREEN after task 1379.
//
// TC-1: script file exists and is executable
// TC-2: trigger path — FAKE_DIFF contains vps-scripts/ path → "VPS deploy triggered"
// TC-3: skip path   — FAKE_DIFF contains only src/ path → "VPS deploy skipped"
// TC-4: trigger path — FAKE_DIFF contains deploy-vinahost.sh → "VPS deploy triggered"
// TC-5: prefix guard — FAKE_DIFF contains src/test-vps-scripts/helper.ts → "VPS deploy skipped"
// TC-6: empty diff   — FAKE_DIFF="" → "VPS deploy skipped"

import { describe, it, expect } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dir, "../../");
const SCRIPT = join(PROJECT_ROOT, "scripts/maybe-deploy-vps.sh");

// Helper: run script synchronously with --dry-run and FAKE_DIFF env
function runScript(fakeDiff: string): { stdout: string; exitCode: number } {
  const result = Bun.spawnSync(["bash", SCRIPT, "--dry-run"], {
    env: { ...process.env, FAKE_DIFF: fakeDiff },
    cwd: PROJECT_ROOT,
  });
  return {
    stdout: result.stdout.toString(),
    exitCode: result.exitCode ?? 1,
  };
}

// TC-1: file exists and is executable
describe("Task 1378 — TC-1: script exists and is executable", () => {
  it("TC-1: scripts/maybe-deploy-vps.sh exists", () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  it("TC-1: scripts/maybe-deploy-vps.sh is executable", () => {
    const st = statSync(SCRIPT);
    // owner execute bit (0o100)
    expect(!!(st.mode & 0o100)).toBe(true);
  });
});

// TC-2: trigger path via vps-scripts/
describe("Task 1378 — TC-2: trigger on vps-scripts/ path", () => {
  it("TC-2: stdout contains 'VPS deploy triggered' and exits 0", () => {
    const { stdout, exitCode } = runScript("vps-scripts/fetch-prices.sh\nsrc/scheduler/jobs.ts");
    expect(stdout).toContain("VPS deploy triggered");
    expect(exitCode).toBe(0);
  });
});

// TC-3: skip path — only src/ files
describe("Task 1378 — TC-3: skip on non-VPS paths", () => {
  it("TC-3: stdout contains 'VPS deploy skipped' and exits 0", () => {
    const { stdout, exitCode } = runScript("src/scheduler/jobs.ts\ndocs/TECH_132.md");
    expect(stdout).toContain("VPS deploy skipped");
    expect(exitCode).toBe(0);
  });
});

// TC-4: trigger path via deploy-vinahost.sh itself
describe("Task 1378 — TC-4: trigger on deploy-vinahost.sh", () => {
  it("TC-4: stdout contains 'VPS deploy triggered' and exits 0", () => {
    const { stdout, exitCode } = runScript("deploy-vinahost.sh");
    expect(stdout).toContain("VPS deploy triggered");
    expect(exitCode).toBe(0);
  });
});

// TC-5: prefix guard — substring 'vps-scripts' inside different dir must not trigger
describe("Task 1378 — TC-5: prefix guard — src/test-vps-scripts/ must not trigger", () => {
  it("TC-5: stdout contains 'VPS deploy skipped' and exits 0", () => {
    const { stdout, exitCode } = runScript("src/test-vps-scripts/helper.ts");
    expect(stdout).toContain("VPS deploy skipped");
    expect(exitCode).toBe(0);
  });
});

// TC-6: empty diff
describe("Task 1378 — TC-6: empty FAKE_DIFF → skipped", () => {
  it("TC-6: stdout contains 'VPS deploy skipped' and exits 0", () => {
    const { stdout, exitCode } = runScript("");
    expect(stdout).toContain("VPS deploy skipped");
    expect(exitCode).toBe(0);
  });
});
```

## Task Breakdown (for PM)

Dependency order — both on same branch `task/1378-1379-vps-auto-deploy`:

| Task | Title | Depends on |
|------|-------|-----------|
| 1378 | test(vps-auto-deploy): TDD — write test first, must be RED | none |
| 1379 | feat(vps-auto-deploy): create script + update dev-standards.md | 1378 |

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| `set -euo pipefail` breaks on empty FAKE_DIFF heredoc | Medium | Low | Quote `"$FAKE_DIFF"` in assignment; `|| true` on git diff fallback |
| Bash regex `[[ =~ ]]` not portable to `/bin/sh` | Low | Low | Shebang is `#!/bin/bash`; script does not run on `/bin/sh` |
| `deploy-vinahost.sh` path resolution when script called from non-root cwd | Medium | Medium | Resolve via `$(dirname "$0")/../deploy-vinahost.sh` (relative to script, not cwd) |
| `Bun.spawnSync` env merge pollutes FAKE_DIFF in other tests | Low | Medium | FAKE_DIFF only set in test env spread; process.env does not carry it across describes |
| `.env` source pollutes dry-run env vars in CI | Low | Low | `.env` absent in CI; `|| true` guard prevents abort |

## Security Review

- SQL parameterized? N/A (no SQL)
- File paths validated (no `../`)? Yes — script uses only controlled paths (`$0`-relative)
- External HTTP rate-limited? N/A (single curl call, post-deploy, non-dry-run only)
- Secrets via Bun.env only? Yes — `TELEGRAM_BOT_TOKEN` sourced from `.env`, not hardcoded; missing = silent skip
