---
task_id: "P1-A"
pilot: "stock-price"
phase: "1"
title: "cmd/sandbox/main.go — sandbox runner (CGO_ENABLED=0)"
assigned_to: "dev-stock-price"
created_at: "2026-05-24T00:00:00Z"
created_by: "pm"
sprint_deadline: "2026-07-04"
estimated_duration: "45 minutes"
ac_count: 5
hard_gates:
  - "AC-5 (R-CGO pre-check): CGO_ENABLED=0 go build -o ./bin/sp-sandbox ./cmd/sandbox/ MUST exit 0 before P1-B1 dispatch"
depends_on: []
blocks: ["P1-B1"]
signals_required:
  - "dev-stock-price DONE + sandbox runner PASS signal (includes sandbox output evidence)"
---

# TASK P1-A — `cmd/sandbox/main.go` — Sandbox Runner (CGO_ENABLED=0)

**Pilot:** stock-price (fleet pilot 3)  
**Phase:** 1  
**Owner:** dev-stock-price  
**Status:** READY FOR DISPATCH  
**Duration:** ~45 minutes  
**AC Count:** 5 (all hard gates)

## Background

The sandbox runner drives all G7, G8, G12 verification for Phase 1. It MUST build under `CGO_ENABLED=0` to prove that the primitive/module/sandbox layers do not leak CGO dependencies from `pkg/infrastructure/fetchers.go`. The sandbox runner imports ONLY `pkg/primitive/*` and `pkg/module/*` — never `pkg/infrastructure/` or `pkg/application/` or `pkg/interface/`.

**R-CGO pre-check gate:** This task establishes the no-CGO barrier. If the sandbox builder reaches any CGO code, the build will fail and P1-A is BLOCKED.

## Files to Create

- **`apps/stock-price/cmd/sandbox/main.go`** (CREATE)

## Acceptance Criteria

### AC-1 — Flag parser

Sandbox accepts three command-line flags:

- `-tier` (required; values: `primitive` | `module` | `all`)
  - `primitive` → run only primitive-tier scenarios
  - `module` → run only module-tier scenarios
  - `all` → run both primitive and module scenarios in sequence

- `-module` (required; value: `stock-price`)
  - Module identifier for scenario path resolution

- `-scenario` (required; values: `all` | path to a specific `.json` file)
  - `all` → load all scenario files in the appropriate `docs/scenarios/stock-price/<tier>/` directory
  - File path (e.g., `docs/scenarios/stock-price/primitives/price-quote-normalizer-golden.json`) → load and run only that specific scenario

**Evidence:** Invoke the sandbox with valid flags and capture the usage/help output.

---

### AC-2 — Scenario JSON path resolution

Scenario JSON files are loaded from:

- **For `-tier=primitive`:** `docs/scenarios/stock-price/primitives/`
  - Expected files: `*-golden.json`, `*-edge.json`, `*-failure.json` (populated by P1-B1, P1-B2, P1-B3)

- **For `-tier=module`:** `docs/scenarios/stock-price/module/`
  - Expected files: `*-golden.json`, `*-edge.json` (populated by P1-C)

Zero live HTTP calls; zero SQLite connections.

**Evidence:** Sandbox runs against existing placeholder scenario files or logs a clear "no scenarios found" message if files do not yet exist.

---

### AC-3 — Exit code and output

- **Exit 0 if all scenarios pass** (or no scenarios found)
- **Exit non-zero if any scenario fails**
- **Output:** Per-scenario PASS/FAIL summary to stdout (e.g., `PASS: price-quote-normalizer-golden.json` or `FAIL: price-quote-normalizer-edge.json: <error message>`)

**Evidence:** Run the sandbox and paste the summary output into the handoff RETURN block.

---

### AC-4 — Zero credential reads (mandatory)

Verify that the sandbox process never reads or imports any credential/secret keys:

```bash
grep -c "DB_PATH\|STOCK_PRICE_DB\|API_KEY\|SECRET\|TOKEN\|PASSWORD" apps/stock-price/cmd/sandbox/main.go
```

Must return **0**.

**Evidence:** Paste the grep output (exit code + line count).

---

### AC-5 — R-CGO pre-check (HARD GATE)

**This is a hard gate. P1-B1 cannot be dispatched unless this passes.**

Build the sandbox binary under `CGO_ENABLED=0`:

```bash
cd apps/stock-price
CGO_ENABLED=0 go build -o ./bin/sp-sandbox ./cmd/sandbox/
```

This command MUST exit 0 (exit code = 0).

**If this fails:**
- Sandbox is importing a package that transitively pulls in `mattn/go-sqlite3` or other CGO code.
- Investigate the import chain via `go build -v` output.
- P1-A is **BLOCKED** — do not continue to P1-B1 until the import chain is fixed.
- Escalate to architect if the leak is structural.

**If this passes:**
- Record the verdict in the RETURN block: **R-CGO pre-check: PASS**
- Proceed to P1-B1 dispatch (PM decision after DONE signal).

**Evidence:** Paste the build command output and the exit code. Confirm `./bin/sp-sandbox` binary is created and executable.

---

## Test & Verify (before RETURN)

1. **No credentials leaked:**
   ```bash
   grep -c "DB_PATH\|STOCK_PRICE_DB\|API_KEY\|SECRET\|TOKEN\|PASSWORD" apps/stock-price/cmd/sandbox/main.go
   ```
   Expected: 0

2. **CGO_ENABLED=0 build succeeds:**
   ```bash
   cd apps/stock-price
   CGO_ENABLED=0 go build -o ./bin/sp-sandbox ./cmd/sandbox/
   echo "Exit code: $?"
   ```
   Expected exit code: 0

3. **Sandbox runs without crashing:**
   ```bash
   cd apps/stock-price
   ./bin/sp-sandbox -tier=primitive -module=stock-price -scenario=all
   ```
   Expected: Exits 0 or non-zero gracefully (with meaningful error, not a panic).

---

## RETURN Block (fill in after task completion)

**DEV-STOCK-PRICE: DO NOT WRITE THIS YET — waiting for task completion.**

When you complete P1-A:

1. Provide the grep output (AC-4)
2. Provide the `CGO_ENABLED=0 go build` command output and exit code (AC-5)
3. Provide the sandbox dry-run output (AC-3, if scenario files exist; otherwise "no scenarios found yet")
4. Confirm R-CGO pre-check verdict: **PASS** or **BLOCKED**
5. Include the sandbox binary size (e.g., `ls -lh bin/sp-sandbox`)

**Hard gate:** P1-B1 is BLOCKED until AC-5 exits 0 and R-CGO pre-check is **PASS**.

---

## Next Task

**P1-B1** (extract `price-quote-normalizer` primitive + R-CGO gate AC-8) is NEXT, only after P1-A completion signal received and R-CGO pre-check is PASS.

---

## Phase 1 Context

- **Charter:** `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md`
- **Task Plan:** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md`
- **Dispatch Signal:** `docs/signals/po-pilot3-stock-price-phase1-open-20260523T223738Z.json`
- **WIP Policy:** 1 sequential — P1-A completes before P1-B1 dispatched
- **G12 DoD Gate:** This task does NOT trigger the G12 DoD gate (sandbox runner, not yet a primitive/module). G12 streak #1 starts at P1-B1.

---

## Constraints (binding)

- **L84 explicit-file staging:** Stage `apps/stock-price/cmd/sandbox/main.go` only; never `git add .` or `-A`
- **No `--force`, `--no-verify`, `--no-gpg-sign`**
- **No `git push`** — work on `main` only; user owns the push
- **All work on `main`** — no branches
- **Frozen anchor:** `debba8eaff0724d1fb32fc9d28640201cc32d1cc` — no retag, no rewrite, no push
- **CGO boundary:** Sandbox must NOT import from `pkg/infrastructure/` (where `fetchers.go` lives with `mattn/go-sqlite3`)

---

## Success Criteria

- AC-1 through AC-5 all verified
- R-CGO pre-check = **PASS**
- Binary created at `apps/stock-price/bin/sp-sandbox`
- P1-A completion signal emitted
- P1-B1 unblocked for next dispatch
