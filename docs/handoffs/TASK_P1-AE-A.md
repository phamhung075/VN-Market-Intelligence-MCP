---
title: "P1-AE-A — cmd/sandbox/main.go + ZERO-CREDS Hard Gate"
pilot: "alert-engine"
phase: "1"
phase_task: "P1-A"
owner: "dev-alert-engine"
date: "2026-05-24"
status: "READY"
reference_plan: "docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md §P1-A (lines 213–285)"
---

# Handoff — P1-A: `cmd/sandbox/main.go` + ZERO-CREDS Hard Gate

**Owner:** dev-alert-engine  
**Blocked by:** — (first Phase 1 task)  
**Blocks:** P1-B1 (first primitive extraction)

## Overview

The sandbox runner (`apps/alert-engine/cmd/sandbox/main.go`) is the entry point for all Phase 1 scenario verification. It MUST build and run with:
1. **CGO_ENABLED=0** (pure-Go sandbox, no mattn/go-sqlite3 leakage)
2. **ZERO Telegram credentials in the process environment**

These form the **hard gate** for Phase 1: if either fails, P1-A is BLOCKED and Phase 1 cannot proceed.

## Acceptance Criteria

### AC-1: Sandbox accepts three flags
```
-tier     : values = primitive | module | all
-module   : value = alert-engine
-scenario : values = all | path to specific JSON file
```

**Evidence:** Run `cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox --help` and paste flag descriptions to the RETURN block.

### AC-2: Scenario JSON loading
- Scenario JSON files loaded from `docs/scenarios/alert-engine/primitives/` (for `-tier=primitive`)
- Or from `docs/scenarios/alert-engine/module/` (for `-tier=module`)
- ZERO live HTTP calls, ZERO SQLite connections, ZERO Telegram API calls

### AC-3: Exit codes and output
- Exits 0 if all loaded scenarios pass
- Exits non-zero if any scenario fails
- Prints per-scenario PASS/FAIL summary to stdout

### AC-4: Zero-credential audit (ZERO-CREDS sub-gate-2: sandbox source grep)
```bash
grep -c "TELEGRAM\|BOT_TOKEN\|CHAT_ID\|TOKEN\|SECRET\|API_KEY\|PASSWORD" \
  apps/alert-engine/cmd/sandbox/main.go
```
Must return 0. Paste result to RETURN block.

### AC-5: Zero-infra import audit (Fence-A pre-check, sandbox)
```bash
grep -rn "pkg/infrastructure\|mattn/go-sqlite3\|pkg/application\|pkg/interface" \
  apps/alert-engine/cmd/sandbox/
```
Must return 0. Paste result to RETURN block.

### AC-6: R-CGO hard gate (CGO_ENABLED=0 build — ZERO-CREDS sub-gate-3)
```bash
cd apps/alert-engine && CGO_ENABLED=0 go build -o ./bin/ae-sandbox ./cmd/sandbox/
```
Exits 0. If this fails due to a transitive import reaching `mattn/go-sqlite3`, **P1-A is BLOCKED** — investigate the import chain and DO NOT proceed to P1-B1 until this passes. Paste build output (or "OK" if clean) to RETURN block.

### AC-7: Env audit baseline (ZERO-CREDS sub-gate-1 — MANDATORY)
```bash
env | grep -iE "TELEGRAM|BOT_TOKEN|CHAT_ID|TOKEN|SECRET|API_KEY|PASSWORD"
```
Run in the same shell context that will run the sandbox. Must return empty (no matches). Paste output to RETURN block as confirmation that the dev environment does not leak Telegram credentials into the sandbox process. This is the baseline proof of the ZERO-CREDS gate.

## Hard Gates (Must Pass Before P1-B1 Dispatch)

**AC-6 (CGO_ENABLED=0 build) AND AC-7 (env audit empty) MUST BOTH PASS** before P1-B1 is dispatched.

If either fails:
- **AC-6 failure** → Investigate transitive `mattn/go-sqlite3` import. P1-A is BLOCKED until resolved.
- **AC-7 failure** → Environment has leaked Telegram credentials. P1-A is BLOCKED until dev environment is cleaned.

Report BLOCKED status to PM immediately if either gate fails.

## Goal Posture

**NO goal flips.** This task sets up G7 sub-gates 1+2+3 but does not earn the goal yet.

- G7 sub-gate 1 (env audit empty) — PROVEN in AC-7
- G7 sub-gate 2 (source grep clean) — PROVEN in AC-4
- G7 sub-gate 3 (CGO_ENABLED=0 build) — PROVEN in AC-6
- G7 sub-gate 4 (edit-rerun cycle) — DEFERRED to P1-E (final proof)

Charter §4.5 SSOT remains untouched: `goalsEarned = 0`, no G-goal flips, `decisionMatrix` all `TBD`.

## Commit Subject Pattern

```
feat(alert-engine): P1-A — cmd/sandbox/main.go scaffold (CGO_ENABLED=0 + zero-creds gate)
```

## Key Notes

- The sandbox imports ONLY `pkg/primitive/*` and `pkg/module/*` — never `pkg/infrastructure/` (which contains `telegram.go` and `sqlite.go`).
- Scenario JSON files stand in for all live data — no real Telegram API calls, no real SQLite reads.
- The three flags (`-tier`, `-module`, `-scenario`) mirror the proven stock-price and kinh-dich pattern.
- CGO_ENABLED=0 proves the sandbox boundary is pure-Go (no SQLite driver leak).
- The env audit proves the sandbox process has no access to Telegram credentials.

## When Done

✓ Paste evidence from AC-1–7 to the RETURN block in strict sequence.  
✓ Confirm both hard gates passed (AC-6 + AC-7).  
✓ Write the commit with the subject pattern above.  
✓ Do NOT proceed to P1-B1 until both hard gates are green.
