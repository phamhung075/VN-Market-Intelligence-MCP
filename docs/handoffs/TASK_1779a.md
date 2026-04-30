# TASK 1779a — SSH Executor Infrastructure Layer

**Sprint:** SPRINT-S
**Parent:** 1779 — Add systemctl restart capability to VPS trigger tools
**Branch:** `task/1779a-ssh-exec`
**Owner:** developer
**Priority:** high
**Type:** feature
**Estimate:** ~2h

---

## Context

The MCP server needs to trigger `systemctl restart` on the Vinahost VPS from within the Docker container. This task creates the low-level SSH executor in the infrastructure layer — the building block for the handler (1779b) and the Docker/known_hosts verification (1779c).

---

## Acceptance Criteria

1. File `apps/mcp-server/src/infrastructure/vps/sshExec.ts` exists.
2. Function signature: `export async function sshExec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>`
3. Uses `Bun.spawn` with args array — NO shell string interpolation (injection-safe).
4. SSH flags hard-coded in args: `-o BatchMode=yes`, `-o ConnectTimeout=10`, `-o StrictHostKeyChecking=yes`.
5. Process timeout: 15 000 ms — resolves with `exitCode: 124` and `stderr: "SSH timeout"` if exceeded.
6. Reads `VPS_HOST` and `VPS_SSH_USER` from `Bun.env` (never `process.env`). Throws `Error("VPS_HOST not configured")` if missing.
7. Import paths use `.js` extension (ESM).
8. Test file `apps/mcp-server/src/__tests__/1779a-ssh-exec.test.ts` with at minimum:
   - Missing `VPS_HOST` throws correct error
   - Missing `VPS_SSH_USER` throws correct error
   - Timeout path resolves to `exitCode: 124`
   - Non-zero exit code is passed through correctly
   - No real SSH connections in any test (mock `Bun.spawn`)

---

## File to Create

```
apps/mcp-server/src/infrastructure/vps/sshExec.ts
apps/mcp-server/src/__tests__/1779a-ssh-exec.test.ts
```

---

## Risks / Notes

- Do NOT use shell string concatenation — command must be passed as a pre-validated string from the caller (handler in 1779b enforces allowlist before calling this).
- `Bun.spawn` stdin should be set to `null`; stdout and stderr to `"pipe"`.
- VPS identity file path: `VPS_SSH_KEY_PATH` from `Bun.env` (default `/run/secrets/vps_ssh_key`); pass via `-i` arg if set.

---

## Done When

- [x] `sshExec.ts` compiles with `bun tsc --noEmit` (no TypeScript errors)
- [x] All 1779a tests pass: `bun test src/__tests__/1779a-ssh-exec.test.ts` — 7 pass, 0 fail, 100% line coverage
- [x] No real SSH is attempted in any test
- [x] Committed on branch `task/1779a-ssh-exec` (530c8ed4)

## Implementation Notes (developer → qa)

- `sshExec(command, timeoutMs?)` — `command` is a single pre-validated string (allowlist enforced by 1779b handler)
- Reads `VPS_HOST`, `VPS_SSH_USER`, `VPS_SSH_KEY_PATH` from `Bun.env`; throws immediately if either of first two is absent
- Timeout races `proc.exited` against `setTimeout`; on timeout calls `proc.kill()` and resolves `{ exitCode: 124, stderr: "SSH timeout" }`
- Args array: `["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=yes", "-i", keyPath, "user@host", command]`
- Regression baseline: 8272 pass / 18 fail on main before task; identical after task (0 regressions)
