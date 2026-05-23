---
task_id: P1-KD-A
pilot: kinh-dich
phase: "1"
owner: dev-kinh-dich
status: READY
handoff_date: 2026-05-24T23:15:00Z
service: kinh-dich-service
language: TypeScript
runtime: bun
zone: apps/kinh-dich-service
estimated_effort: 45 minutes
ac_count: 6
depends_on: P0-KD-1, P0-KD-2, P0-KD-3, P0-KD-4 (all DONE)
blocks: P1-B1
blockers: none
---

# TASK_P1-KD-A: Bun Sandbox Runner + config.ts Bun.env Fix

## Summary

P1-A establishes the sandbox foundation for all G7, G8, G12 verification cycles. The sandbox runner (`src/sandbox/runner.ts`) drives scenario execution with zero infrastructure imports — hexagram logic is pure compute, naturally credential-free.

**Folded into this task:** one-line `config.ts` fix to replace `process.env` with `Bun.env` per dev-standards §Coding Standards for Bun services.

## Files to Touch

| File | Operation | Rationale |
|------|-----------|-----------|
| `apps/kinh-dich-service/src/sandbox/runner.ts` | CREATE | Bun sandbox harness — flags: --tier, --module, --scenario |
| `apps/kinh-dich-service/src/infrastructure/config.ts` | MODIFY | Replace `process.env` → `Bun.env` (one-liner) |

## Background

The sandbox runner is the **Day-0 critical path dependency** for all subsequent tasks (P1-B1 through P1-E). It accepts three command-line flags:
- `--tier` (values: `primitive` \| `module` \| `all`) — which sandbox tier to run
- `--module` (value: `kinh-dich`) — module identifier for scenario path resolution
- `--scenario` (values: `all` \| path to a specific JSON file)

Scenario JSONs are loaded from:
- `docs/scenarios/kinh-dich/primitives/` (for `--tier=primitive`)
- `docs/scenarios/kinh-dich/module/` (for `--tier=module`)

**Zero live HTTP calls, zero SQLite connections, zero Hono imports, zero infrastructure dependencies.**

## Acceptance Criteria

### AC-1: Sandbox accepts three flags

The runner **MUST** accept:
- `--tier primitive|module|all` — which sandbox tier to run
- `--module kinh-dich` — module identifier for scenario path resolution
- `--scenario all|<path.json>` — which scenarios to load

**Evidence:** Paste runner invocation examples into the handoff (e.g., `bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all`).

---

### AC-2: Scenario JSON loading from correct paths

Scenario JSONs are loaded from:
- `docs/scenarios/kinh-dich/primitives/` for `--tier=primitive`
- `docs/scenarios/kinh-dich/module/` for `--tier=module`

Zero live HTTP calls, zero SQLite connections, zero Hono imports.

**Evidence:** `grep -rn "docs/scenarios/kinh-dich" apps/kinh-dich-service/src/sandbox/runner.ts` returns ≥1 match per tier.

---

### AC-3: Exit code reflects scenario outcome

- Exits 0 if all loaded scenarios pass
- Exits non-zero if any scenario fails
- Prints per-scenario PASS/FAIL summary to stdout

**Evidence:** Paste one successful run (exit 0) output into the handoff.

---

### AC-4: Zero credential or infrastructure reads

```bash
grep -c "DB_PATH|KINH_DICH_DB|API_KEY|SECRET|TOKEN|PASSWORD|infrastructure|hono|SQLite" \
  apps/kinh-dich-service/src/sandbox/runner.ts
```

**MUST return 0.**

**Evidence:** Paste the grep output (0 matches) into the handoff.

---

### AC-5: Bun.env fix in config.ts

Replace `process.env` with `Bun.env` in `apps/kinh-dich-service/src/infrastructure/config.ts`.

```bash
grep -n "process\.env" apps/kinh-dich-service/src/infrastructure/config.ts
```

**MUST return 0 matches.**

```bash
grep -n "Bun\.env" apps/kinh-dich-service/src/infrastructure/config.ts
```

**MUST return ≥1 match per replaced occurrence.**

**Evidence:** Paste the before-and-after line numbers + git diff snippet into the handoff.

---

### AC-6: Zero-import pre-check (sandbox runner)

```bash
grep -rn "from.*infrastructure|from.*hono|from.*application|from.*interface" \
  apps/kinh-dich-service/src/sandbox/runner.ts
```

**MUST return 0.**

**Hard gate:** AC-6 failure = P1-A BLOCKED. Investigate import chain and fix before signaling DONE.

**Evidence:** Paste the grep output (0 matches) into the handoff.

---

## Hard Gates

| Gate | Condition | Action if Failed |
|------|-----------|------------------|
| **AC-6 (zero infrastructure imports)** | grep returns 0 | BLOCK P1-A — investigate import chain |

---

## Notes

- **No new devDependencies** in Phase 1. Sandbox uses only TypeScript/Bun built-ins + existing kinh-dich domain modules.
- **No `eslint.config.mjs` creation** in Phase 1. ESLint fence enforcement is Phase 2 (G4 task).
- **Pre-revert tags:** None created in Phase 1. Tags (`kinh-dich-pre-ci`, `kinh-dich-pre-delete`, `kinh-dich-pre-inject`) are created in Phase 2 per brownfield plan.
- **G12 DoD Gate:** P1-A is NOT a sandbox-producing task (it IS the sandbox foundation). Sandbox-green evidence gate applies to P1-B1 onward.

---

## DoD Gate (G12)

N/A — P1-A is the sandbox infrastructure task. Sandbox-green evidence gate applies to P1-B1 and subsequent tasks.

---

## Next Task

**Blocks:** P1-B1 (hexagram-resolver + R-FENCE discovery gate)

PM dispatches P1-B1 only after P1-A DONE signal + AC-6 verification.

---

## Commit Convention

L84 explicit-file staging. Commit subject example:
```
feat(dev-kinh-dich/p1-a): Bun sandbox runner + config.ts Bun.env fix (6 ACs)
```

No `--force`, no `--no-verify`, no `--no-gpg-sign`. All on main.

---

## Signal to Emit

**File:** `docs/signals/dev-kinh-dich-p1-a-done-<UTC>.json`

**Fields:**
```json
{
  "task_id": "P1-KD-A",
  "pilot": "kinh-dich",
  "phase": "1",
  "status": "DONE",
  "ac_results": {
    "AC-1": "PASS",
    "AC-2": "PASS",
    "AC-3": "PASS",
    "AC-4": "PASS",
    "AC-5": "PASS",
    "AC-6": "PASS"
  },
  "hard_gates": {
    "ZERO_INFRASTRUCTURE_IMPORTS": true
  },
  "sandbox_runner_location": "apps/kinh-dich-service/src/sandbox/runner.ts",
  "config_fix_status": "DONE",
  "next": "PM dispatches P1-B1 (hexagram-resolver + R-FENCE discovery)"
}
```

---

## References

- **Phase 1 Task Plan:** `docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-1-task-plan-ts.md` §P1-A
- **Brownfield Inventory:** `docs/architecture-briefs/2026-05-23-kinh-dich-factory/p0-brownfield-inventory.md` §2 (service structure)
- **Pilot Charter:** `docs/architecture-briefs/2026-05-23-kinh-dich-factory/pilot-charter.md` §G7, §G12
- **Dev Standards:** `docs/policies/dev-standards.md` §Coding Standards for Bun services
- **Agent Flow:** `.claude/flows/dev-kinh-dich/main.md` (G12 DoD Gate + R-FENCE Gate sections)
