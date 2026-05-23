---
title: "TASK_P1-A3 — cmd/sandbox/main.go Sandbox Harness"
phase: "1"
pilot: "macro-indicators"
task_id: "P1-A3"
owner: "dev-macro-indicators"
created_at: "2026-05-23T10:23:05Z"
created_by: "pm"
status: "READY-FOR-DISPATCH"
wip_claim: "phase_1_dev_team = ACTIVE (1 of 1 max)"
---

# TASK_P1-A3 — `cmd/sandbox/main.go` Sandbox Harness

**Pilot:** macro-indicators (Phase 1, Go language)  
**Owner:** dev-macro-indicators  
**Estimate:** 20 minutes  
**AC count:** 4  
**Goals:** G7 (Edit-JSON-and-rerun works), G12 (Dashboard-green before done)  
**Blocked by:** P1-A2 (cmd/server/main.go)  
**Blocks:** P1-A4 (pkg/ DDD scaffold)  
**Anchor:** 1776df8e (held throughout pilot — do not violate)

---

## Context

P1-A2 completed 2026-05-23T10:23:04Z: cmd/server/main.go composition root created (88 lines) + tools.go deleted. All 5 ACs pass. QA GREEN verdict (commits 0e2d9075 dev + ed1a426b signal).

P1-A3 now creates the sandbox runner harness — a CLI tool that loads scenario JSON files and executes registered primitives/modules, emitting pass/fail results. This mirrors the TA pilot's `apps/technical-analysis/cmd/sandbox/main.go` pattern exactly, adapted for macro-indicators module structure.

---

## Acceptance Criteria

### AC-1: CLI flag support

Sandbox runner accepts **exactly 3 flags** (use `flag` package or compatible):

- `-tier` (required, values: `primitive` | `module` | `all`) — selects which tier of scenarios to run
- `-module` (required, value: `macro-indicators`) — module name selector (redundant at P1 but future-proofing for multi-module sandbox)
- `-scenario` (required, values: `all` | `<filepath>`) — run all scenarios matching pattern or a specific scenario file path

**Example invocations (will work after P1-D1/D2 create scenarios):**

```bash
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=docs/scenarios/macro-indicators/primitives/macro-investment-clock-golden.json
```

**Verification:**

```bash
go run ./cmd/sandbox --help 2>&1 | grep -c "tier\|module\|scenario"
# Expected: ≥ 3 (flags documented)
```

---

### AC-2: Scenario JSON path resolution

Sandbox reads scenario JSON from `docs/scenarios/macro-indicators/` directory structure:

- If `-tier=primitive`: look in `docs/scenarios/macro-indicators/primitives/` subdirectory
- If `-tier=module`: look in `docs/scenarios/macro-indicators/module/` subdirectory
- If `-tier=all`: search both directories

If `-scenario=all`: glob all `*.json` files from selected tier directory and run each.  
If `-scenario=<filepath>`: read only that one file.

**No live API calls, no external HTTP requests** — scenarios are frozen JSON fixtures. All inputs + expected outputs are embedded in the JSON files.

**Verification (after P1-D1/D2 create scenarios):**

```bash
# Once scenarios exist:
find docs/scenarios/macro-indicators/primitives -name '*.json' | wc -l
# Expected: ≥ 3 (after P1-D1)

find docs/scenarios/macro-indicators/module -name '*.json' | wc -l
# Expected: ≥ 2 (after P1-D2)
```

---

### AC-3: Pass/fail reporting and exit code

Sandbox runner:

1. Loads each scenario JSON
2. Executes the registered primitive/module function with the scenario's `input` field
3. Compares the output against scenario's `expected` field
4. Prints one line per scenario: `PASS: <scenario-name>` or `FAIL: <scenario-name> (reason)`
5. At end: prints summary `N/N scenarios green` or `M failed, N passed`
6. **Exit code:** 0 if all scenarios pass, non-zero (e.g., 1) if any fail

**Verification (after scenarios exist):**

```bash
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
# Expected exit code: 0 (initially, no scenarios exist, so vacuous success)
```

---

### AC-4: Zero environment variable reads for secrets

Sandbox must **not** read any environment variables for API keys, database credentials, or tokens.

**Verification:**

```bash
grep -c "FRED_API_KEY\|DB_PASSWORD\|SECRET\|TOKEN\|API_KEY" \
  apps/macro-indicators/cmd/sandbox/main.go
# Expected: 0
```

---

## Files Touched

| File | Action | Notes |
|------|--------|-------|
| `apps/macro-indicators/cmd/sandbox/main.go` | CREATE | Sandbox CLI harness, ~150–200 lines |

---

## Implementation Pattern (Clone TA Sandbox)

Reference: `apps/technical-analysis/cmd/sandbox/main.go` at anchor 1776df8e

**High-level structure:**

```go
package main

import (
	"flag"
	"log/slog"
	"os"
	"path/filepath"
	// ... scenario loading + execution helpers
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// Parse flags
	tierFlag := flag.String("tier", "", "primitive|module|all")
	moduleFlag := flag.String("module", "", "module name, e.g., macro-indicators")
	scenarioFlag := flag.String("scenario", "", "all or filepath")
	flag.Parse()

	// Validate flags
	if *tierFlag == "" || *moduleFlag == "" || *scenarioFlag == "" {
		logger.Error("missing required flags: -tier, -module, -scenario")
		os.Exit(1)
	}

	// Determine scenario directory
	var scenarioDir string
	if *tierFlag == "primitive" {
		scenarioDir = "docs/scenarios/macro-indicators/primitives"
	} else if *tierFlag == "module" {
		scenarioDir = "docs/scenarios/macro-indicators/module"
	} else if *tierFlag == "all" {
		// Search both; or create "all" scenario list
	}

	// Load scenarios (glob if -scenario=all)
	scenarios, err := loadScenarios(scenarioDir, *scenarioFlag)
	if err != nil {
		logger.Error("failed to load scenarios", slog.Any("err", err))
		os.Exit(1)
	}

	if len(scenarios) == 0 {
		// No scenarios exist yet (pre-P1-D1 phase)
		logger.Info("no scenarios found (expected during scaffold phase)")
		os.Exit(0)
	}

	// Execute scenarios
	passCount, failCount := 0, 0
	for _, scenario := range scenarios {
		result, err := executeScenario(scenario)
		if err != nil || !result {
			logger.Info("FAIL", slog.String("scenario", scenario.Name))
			failCount++
		} else {
			logger.Info("PASS", slog.String("scenario", scenario.Name))
			passCount++
		}
	}

	// Summary
	logger.Info("sandbox complete", slog.Int("pass", passCount), slog.Int("fail", failCount))

	if failCount > 0 {
		os.Exit(1)
	}
	os.Exit(0)
}

// Helper: load scenarios from directory (glob *.json if -scenario=all)
func loadScenarios(dir, pattern string) ([]Scenario, error) {
	// ... implement glob + JSON unmarshaling
	return nil, nil
}

// Helper: execute one scenario
func executeScenario(scenario Scenario) (bool, error) {
	// ... invoke the actual primitive/module function with scenario.Input
	// ... compare output to scenario.Expected
	return true, nil
}

type Scenario struct {
	Name     string      `json:"name"`
	Tier     string      `json:"tier"` // "primitive" or "module"
	Input    interface{} `json:"input"`
	Expected interface{} `json:"expected"`
}
```

**Key points:**

- Use `flag` package for CLI argument parsing
- Return exit 0 on success (all scenarios green), non-zero on failure
- Print human-readable pass/fail per scenario (slog.Info/Error for clarity)
- No live HTTP calls, no environment variable reads for secrets
- Mirror TA pattern verbatim for consistency

---

## Constraints

### L84 — Explicit file staging

```bash
git add apps/macro-indicators/cmd/sandbox/main.go
# NO: git add -A
# NO: git add .
```

### No bypass

- No `--force`
- No `--no-verify` (pre-commit hooks must pass)
- No `--no-gpg-sign`
- No `git push` (local-only work)

### Anchor discipline

Anchor 1776df8e must remain reachable (no retag, no rewrite, no force-push).

---

## Commit Message Template

```
feat(macro-indicators): P1-A3 — cmd/sandbox/main.go sandbox harness

Advances G7 + G12 per pilot-charter.md v2.0.

- apps/macro-indicators/cmd/sandbox/main.go (NEW, ~150–200 lines)
  Sandbox runner: CLI harness for executing scenario JSONs.
  Flags: -tier (primitive|module|all), -module (macro-indicators), -scenario (all|filepath).
  Loads frozen JSON fixtures from docs/scenarios/macro-indicators/{primitives,module}/.
  No live API calls. No env var reads for secrets (FRED_API_KEY explicitly forbidden).
  Pattern: mirrors apps/technical-analysis/cmd/sandbox/main.go (TA pilot anchor 1776df8e).
  AC-1..4 satisfied (see TASK_P1-A3-macro.md).

Pre-scaffold note:
  - Scenarios will be created in P1-D1 (primitive) + P1-D2 (module).
  - Until then, sandbox finds no JSON files (gracefully exits 0, no error).
  - Once scenarios land, sandbox will report PASS/FAIL per scenario.

L84 discipline: explicit per-file staging (git add <path>).
Anchor 1776df8e held.
```

---

## Smoke Checks

After implementation, **before** declaring DONE:

```bash
cd apps/macro-indicators

# Check file exists
test -f cmd/sandbox/main.go && echo "sandbox created ✓"

# Check help / flag documentation
go run ./cmd/sandbox --help 2>&1 | head -10
# Expected: flag usage shown

# Pre-scaffold behavior (no scenarios exist yet)
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
# Expected exit: 0 (gracefully handles no scenarios at this stage)

# Zero env secret reads
grep -c "FRED_API_KEY\|DB_PASSWORD\|SECRET\|TOKEN" cmd/sandbox/main.go
# Expected: 0

# Check compilation
go build ./cmd/sandbox -o bin/sandbox-test && rm bin/sandbox-test
# Expected exit: 0
```

---

## Risk Flags & Forward-Look

### R-1 (HIGH) — Math.random() in scoreIndicator

**Binding on:** P1-B1 AC-6 (fix mandatory)  
**Forward-warning:** At P1-A5 close (openapi.yaml complete), PM will include explicit R-1 reminder in P1-B1 handoff.  
**What it means:** The TS `scoreIndicator()` uses `Math.random()` for tier scoring. Go rewrite (P1-B1) MUST use deterministic tier lookup (pre-computed map). No randomness in primitives.

### R-3 (HIGH) — 4 MCP tools bypass HTTP layer

**Binding on:** Phase 2 P2-B scope expansion  
**Forward-warning:** At Phase 1 close gate, PM will flag R-3 for architect attention.  
**What it means:** The 4 tools (get_macro_snapshot, get_carry_trade_signal, get_yield_spread_signal, get_macro_calendar) currently import macro-indicators domain code directly in mcp-server. Phase 2 P2-B must rewrite these to use HTTP port 5004 instead.

---

## Dependencies

| Task | Relation | Notes |
|------|----------|-------|
| P1-A2 | Blocks | cmd/server/main.go (AC-1..5 PASS, signals complete) |
| P1-A4 | Blocked by | pkg/ DDD scaffold depends on sandbox harness structure |

---

## G12 DoD Gate

**Does NOT apply to P1-A3** (scaffold-only, no scenarios exist yet to run).  
Gate activates P1-B1 onward when first primitive is implemented + scenarios created.

**When G12 becomes binding (P1-B1+):** Before marking task DONE, run both tiers and paste output to handoff:

```bash
go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all
go run ./cmd/sandbox -tier=module -module=macro-indicators -scenario=all
# Both must exit 0 with all scenarios GREEN
```

---

## Next Task

After P1-A3 DONE + QA green:

- **P1-A4** (pkg/ DDD scaffold) unblocked
- PM dispatches P1-A4 handoff to dev-macro-indicators

---

## Open Questions (PM notes)

**OQ-1 — Sandbox binary vs `go run`**

P1-A3 and P1-E2 use `go run ./cmd/sandbox` for execution. If sandbox compile time becomes slow (>5s per invocation), PM may elect to have dev-macro-indicators pre-build a `sandbox` binary at task start:

```bash
go build -o bin/sandbox ./cmd/sandbox/
./bin/sandbox -tier=primitive -module=macro-indicators -scenario=all
```

For now, `go run` is acceptable. Document chosen approach in commit message if optimization is applied.

---

## RETURN Block

**For dev-macro-indicators to complete:**

```
## RETURN — P1-A3 DONE

**Status:** COMPLETE ✓

**Commit SHA:** [SHA from git log -1]

**AC Verification:**
- AC-1 (3 flags: -tier, -module, -scenario): [result]
- AC-2 (scenario path resolution): [result]
- AC-3 (pass/fail + exit codes): [result]
- AC-4 (zero env secret reads): [result]

**Pre-scaffold note:** Scenarios will exist after P1-D1 + P1-D2. Until then, sandbox gracefully finds no files (exit 0).

**Files staged:** cmd/sandbox/main.go
**L84 discipline:** COMPLIANT (explicit per-file staging)
**Anchor 1776df8e:** HELD ✓

**Next:** P1-A4 dispatch ready (pkg/ DDD scaffold). PM will send handoff after QA approval.
```

---

## References

- **Charter:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` v2.0
- **Phase 1 Task Plan:** `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md` §P1-A3
- **TA Pilot Reference:** `apps/technical-analysis/cmd/sandbox/main.go` (anchor 1776df8e pattern)
- **Language Decision:** `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md` §Q2
