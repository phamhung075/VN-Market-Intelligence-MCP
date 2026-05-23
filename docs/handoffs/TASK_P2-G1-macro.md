---
task_id: P2-G1
title: "G1 + G2 + G3 Terminal Joint Verification (QA-only, no code changes)"
owner_agent: qa
goal_linkage:
  - G1 (Primitives ship with scenarios — READY FOR FLIP)
  - G2 (Module composes primitives via ports — READY FOR FLIP)
  - G3 (Microservice has clean composition root — READY FOR FLIP)
pre_conditions:
  - P2-X3 DONE (snapshot endpoint implemented, dev commit 88adeb70, qa GREEN 34fb662d)
  - Anchor 1776df8e held as ancestor
  - All 6 primitives exist in pkg/primitive/
  - Module macro-signals wires all 6 primitives
  - cmd/server/main.go composition root clean
  - All sandbox tiers 20/20 verified
critical_path: true
estimate_hours: 0.5
ac_count: 6
---

# TASK P2-G1 — G1 + G2 + G3 Terminal Joint Verification

**Goal advancement:** Joint terminal verification of G1 (6 primitives + scenarios) + G2 (module wires all 6) + G3 (microservice composition root clean). No code changes — verification only.

**Background:** P2-X1 extracted 5 new primitives (oil, gold, usdvnd, carry, yield). P2-X2 expanded macro-signals module to wire all 6 primitives. P2-X3 implemented real snapshot endpoint handlers. QA performs independent terminal verification that all three goals meet their acceptance criteria before PM flips G1/G2/G3 status to YES in SSOT.

**DDD zone:** `apps/macro-indicators/` (read-only verification — no modifications)

---

## Acceptance Criteria

**AC-1: All 6 Primitives Exist with Scenarios**

All 6 primitive packages must exist in `apps/macro-indicators/pkg/primitive/`:
1. `macro-investment-clock`
2. `macro-oil-impact-classifier`
3. `macro-gold-direction-classifier`
4. `macro-usdvnd-direction-classifier`
5. `macro-carry-trade-signal`
6. `macro-yield-spread-signal`

Each primitive directory must have ≥3 scenario JSON files in `docs/scenarios/macro-indicators/primitives/<primitive-name>/`:
- 1 golden scenario (all inputs valid, expected result)
- 1 edge scenario (boundary conditions, valid but extreme)
- 1 failure scenario (invalid input or error condition)

**Proof:** Run the following commands and paste output showing all primitive directories exist + scenario file count per primitive:

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP && \
for prim in macro-investment-clock macro-oil-impact-classifier macro-gold-direction-classifier macro-usdvnd-direction-classifier macro-carry-trade-signal macro-yield-spread-signal; do
  echo "=== PRIMITIVE: $prim ==="
  ls -la apps/macro-indicators/pkg/primitive/$prim/ || echo "MISSING"
  echo "Scenario files:"
  ls docs/scenarios/macro-indicators/primitives/$prim/ 2>/dev/null | wc -l
done
```

---

**AC-2: Module Fence-B Clean (Module ≠ Import Application/Infrastructure)**

Module `apps/macro-indicators/pkg/module/macro_signals/` must NOT import from `application`, `infrastructure`, or `interface` layers.

**Proof:** Run the following greps and verify exit code = 1 (zero matches):

```bash
echo "=== Fence-B Check: Application/Infrastructure imports ==="
grep -rnE '^\s*"[^"]*(application|infrastructure)' apps/macro-indicators/pkg/module/macro_signals/ && echo "FENCE_B_FAIL_1" || echo "FENCE_B_PASS_1"

echo "=== Fence-B Check: Interface imports ==="
grep -rnE '^\s*"[^"]*\/interface(/|")' apps/macro-indicators/pkg/module/macro_signals/ && echo "FENCE_B_FAIL_2" || echo "FENCE_B_PASS_2"
```

**Expected result:** Both greps exit 1 (no matches found).

---

**AC-3: Composition Root No Business Logic**

`apps/macro-indicators/cmd/server/main.go` must contain ONLY DI wiring and server startup, zero domain calculations.

**Proof:** Verify the following grep returns 0 matches (exit code = 1):

```bash
grep -nE "scoreIndicator|buildSnapshot|oilDirection|carryTrade|yieldSpread|computeSignal" apps/macro-indicators/cmd/server/main.go && echo "ROOT_HAS_LOGIC" || echo "ROOT_CLEAN"
```

**Expected result:** Exit 1 (ROOT_CLEAN output).

---

**AC-4: End-to-End Snapshot Path Verification (HTTPCommodityFetcher → BuildMacroSignals → 6 Primitives)**

Verify the snapshot request flows through the full stack:

1. Handler invokes ComputeMacroUseCase.Execute()
2. Execute() calls BuildMacroSignals()
3. BuildMacroSignals() wires all 6 primitives
4. Response includes all 6 signal keys

**Proof (inspect-only, if server-start is impractical):**

Provide grep evidence showing the call chain:

```bash
echo "=== Handler → Execute() ==="
grep -n "useCase.Execute" apps/macro-indicators/pkg/interface/http/handlers_carry.go apps/macro-indicators/pkg/interface/http/handlers_yield.go 2>/dev/null | head -5

echo "=== Execute() → BuildMacroSignals() ==="
grep -n "BuildMacroSignals" apps/macro-indicators/pkg/application/usecases.go | head -5

echo "=== BuildMacroSignals() → 6 Primitives ==="
grep -n "investment-clock\|oil-impact\|gold-direction\|usdvnd-direction\|carry-trade\|yield-spread" apps/macro-indicators/pkg/module/macro_signals/macro_signals.go | wc -l
```

**Alternative (if server can briefly start):**

Start server and invoke `/snapshot`:

```bash
cd apps/macro-indicators && \
go run ./cmd/server &
sleep 1

curl -X POST http://localhost:5004/snapshot -H "Content-Type: application/json" -d '{}' 2>/dev/null | jq '.signals | keys' | head -20

pkill -f "go run ./cmd/server"
```

Expected JSON keys in `signals` field: `["investment-clock", "oil", "gold", "usdvnd", "carry", "yield"]` (exact key names may vary per implementation but all 6 present).

---

**AC-5: Sandbox All-Tier 20/20 Green (Re-verified at HEAD)**

QA independently runs the sandbox test and confirms all 20 tests (3 primitive + 2 module + 5 all-tier + 6 new primitives + 4 module+microservice) pass.

**Proof:** Run and paste last 5 lines:

```bash
cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all 2>&1 | tail -5
```

**Expected result:**
- Line 4: `total=20 pass=20 fail=0 status=OK`
- Line 5: Exit code 0

---

**AC-6: Joint G1 + G2 + G3 Terminal Summary Table**

Create a verification summary showing evidence for all three goals:

| Goal | Criterion | Evidence File | Grep Command | Exit Code | Status |
|------|-----------|---|---|---|---|
| **G1** | 6 primitives exist | `apps/macro-indicators/pkg/primitive/` | `ls -d apps/macro-indicators/pkg/primitive/macro-*` | 0 | PASS |
| **G1** | Each ≥3 scenarios | `docs/scenarios/macro-indicators/primitives/` | `find docs/scenarios/macro-indicators/primitives -type f -name "*.json" \| wc -l` | 0 (file count ≥18) | PASS |
| **G2** | Module imports 6 primitives | `macro_signals.go` | `grep -c "macro_investment_clock\|macro_oil\|macro_gold\|macro_usdvnd\|macro_carry\|macro_yield" macro_signals.go` | 0 (count ≥6) | PASS |
| **G2** | Fence-B clean (exit 1) | `pkg/module/macro_signals/` | `grep -rE '(application\|infrastructure)' pkg/module/macro_signals/` | 1 | PASS |
| **G3** | Composition root clean | `cmd/server/main.go` | `grep -E "scoreIndicator\|buildSnapshot" cmd/server/main.go` | 1 | PASS |
| **G3** | Handlers → Execute() → BuildMacroSignals | `router.go + usecases.go` | `grep "useCase.Execute\|BuildMacroSignals" *.go` | 0 (matches ≥1) | PASS |
| **JOINT** | Anchor held | `1776df8e` | `git merge-base --is-ancestor 1776df8e HEAD` | 0 | PASS |
| **JOINT** | R-1 deterministic | `pkg/` | `grep -rE "math/rand\|rand\.Intn" apps/macro-indicators/pkg/` | 1 | PASS |
| **JOINT** | Sandbox 20/20 | `./cmd/sandbox -tier=all` | Last line: `total=20 pass=20 fail=0 status=OK` | 0 | PASS |

**Proof:** Paste actual output from running each grep + sandbox command above.

---

## Hard Gates (QA must verify all before PASS)

1. **Anchor held:** `git merge-base --is-ancestor 1776df8e HEAD && echo 0` (must return 0)
2. **R-1 clean:** `grep -rE "math/rand|rand\.Intn|rand\.Float|time\.Now.*Seed" apps/macro-indicators/pkg/` must exit 1 (zero matches)
3. **Fence-B (module) clean:** Both greps must exit 1 (exit 1 × 2)
4. **Fence-C (pkg) clean:** `grep -rnE '^\s*"[^"]*/infrastructure' apps/macro-indicators/pkg/` must exit 1
5. **build + vet + lint all exit 0:** `cd apps/macro-indicators && go build ./... && go vet ./... && golangci-lint run`
6. **Sandbox 20/20:** `cd apps/macro-indicators && go run ./cmd/sandbox -tier=all -module=macro-indicators -scenario=all` must exit 0 with `total=20 pass=20 fail=0 status=OK`

---

## Out-of-Scope (QA must NOT modify)

- Any source code under `apps/macro-indicators/` (read-only verification only)
- `docs/data/pilot-status-macro-indicators.json` (PM-owned SSOT)
- `docs/handoffs/` (PM-owned)
- Charter or architecture briefs
- Other applications (`apps/technical-analysis/`, `apps/mcp-server/src/`)

---

## Acceptance Evidence to Record

In the completion signal, provide:

1. AC-1 output: 6 primitive directories listed + scenario file counts per primitive
2. AC-2 output: Both Fence-B greps exit 1 (PASS_1 + PASS_2)
3. AC-3 output: Grep for business logic exit 1 (ROOT_CLEAN)
4. AC-4 output: Call chain evidence or curl snapshot output with 6 signal keys visible
5. AC-5 output: Last 5 lines of sandbox output showing `total=20 pass=20 fail=0 status=OK`
6. AC-6 output: Summary table with all 9 verification rows + grep/exit-code evidence
7. All hard gate results: anchor, R-1, Fence-B, Fence-C, build/vet/lint, sandbox

---

## Signal Output (QA Responsibility)

**On PASS:** Create signal file `docs/signals/qa-p2-g1-macro-GREEN-<UTC>.json`

**Required fields:**
```json
{
  "task_id": "P2-G1",
  "cycle": "c282-cycle-49",
  "verdict": "GREEN",
  "timestamp_utc": "<ISO8601>",
  "qa_agent": "qa",
  "qa_method": "independent code inspection + all hard gates re-run at HEAD",
  "ac_results": {
    "ac1": { "verdict": "PASS", "evidence": "<6 primitives + scenario count>" },
    "ac2": { "verdict": "PASS", "evidence": "<both Fence-B greps exit 1>" },
    "ac3": { "verdict": "PASS", "evidence": "<grep exit 1 ROOT_CLEAN>" },
    "ac4": { "verdict": "PASS", "evidence": "<call chain or curl snapshot>" },
    "ac5": { "verdict": "PASS", "evidence": "<last 5 sandbox lines>" },
    "ac6": { "verdict": "PASS", "evidence": "<summary table rows 1-9>" }
  },
  "hard_gates": {
    "anchor_held": { "verdict": "PASS", "exit_code": 0 },
    "r1_clean": { "verdict": "PASS", "exit_code": 1 },
    "fence_b_app": { "verdict": "PASS", "exit_code": 1 },
    "fence_b_iface": { "verdict": "PASS", "exit_code": 1 },
    "fence_c_pkg": { "verdict": "PASS", "exit_code": 1 },
    "build_exit": 0,
    "vet_exit": 0,
    "lint_exit": 0,
    "sandbox_exit": 0,
    "sandbox_total": 20,
    "sandbox_pass": 20,
    "sandbox_fail": 0
  },
  "g1_terminal_ready": true,
  "g2_terminal_ready": true,
  "g3_terminal_ready": true,
  "joint_g123_recommendation": "All 3 goals READY FOR FLIP. PM may flip G1/G2/G3 status to YES in SSOT atomic with cycle-49 commit.",
  "notes": "QA verified: 6 primitives, ≥18 scenarios, module wires all 6 via ports (Fence-B clean), composition root zero business logic, end-to-end snapshot chain verified, sandbox 20/20 at HEAD, anchor held, all hard gates PASS."
}
```

**On FAIL:** Create signal file `docs/signals/qa-p2-g1-macro-RED-<UTC>.json` with specific failed AC/gate.

---

## Commit (QA)

**Commit subject:**
```
chore(qa): P2-G1 macro-indicators joint G1+G2+G3 terminal — GREEN
```

**Files to stage explicitly (L84):**
- `docs/signals/qa-p2-g1-macro-GREEN-<UTC>.json`

**NO `git add -A`, NO `git add .`, NO `--force`, NO `--no-verify`, NO `--no-gpg-sign`, NO `git push`.**

---

## Reference Documents

- Charter: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md` §G1/G2/G3
- Phase 2 task plan: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-2-task-plan-go.md` §P2-X1/P2-X2/P2-X3
- P2-X1 handoff: `docs/handoffs/TASK_P2-X1-macro.md`
- P2-X2 handoff: `docs/handoffs/TASK_P2-X2-macro.md`
- P2-X3 handoff: `docs/handoffs/TASK_P2-X3-macro.md`
- P2-X3 dev signal: `docs/signals/dev-macro-indicators-p2-x3-done-20260523T142421Z.json`
- P2-X3 qa signal: `docs/signals/qa-p2-x3-macro-GREEN-20260523T162900Z.json`
- SSOT: `docs/data/pilot-status-macro-indicators.json` (PM to update post-QA PASS)

---

## Next Task (Unblocked by This)

After P2-G1 PASS signal lands and PM cycles-49 atomic close commits:

**P2-F1:** G8 Honest-Red Proof (QA-owned, no code changes) — 30m estimate
- Blocked by: P2-G1 PASS
- Owner: qa
- Verify dashboard shows red for corrupted scenarios + green for golden scenarios

---

## Charter Reference

**Goal G1 (Primitives ship with scenarios):** 5-7 macro primitives extracted to Go, each with ≥3 scenario JSON files. All scenarios pass. Verification method: Run `cd apps/macro-indicators && go run ./cmd/sandbox -tier=primitive -module=macro-indicators -scenario=all`. All scenario files execute without error. QA counts scenario files: minimum 3 per primitive × 5 primitives = 15 files.

**Goal G2 (Module composes primitives via ports):** `apps/macro-indicators/pkg/module/macro_signals/` imports primitives via interface, never reaches into other modules. Verification method: `grep -rn "from.*pkg/module/" apps/macro-indicators/pkg/module/macro_signals/` must return 0 results. Module-level sandbox passes.

**Goal G3 (Microservice has clean composition root):** `apps/macro-indicators/cmd/server/main.go` wires module + adapters. No business logic in composition root. Verification method: Read `cmd/server/main.go` — must contain only: import statements, interface wiring (DI bindings), and server startup. `grep -rn "scoreIndicator|buildSnapshot|oilDirection" apps/macro-indicators/cmd/server/main.go` must return 0.
