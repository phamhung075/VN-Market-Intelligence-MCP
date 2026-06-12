<!-- size-justification: 184L — thin pointer + Language Mode detection table, smoke checks (Go+TS dual-column), G12 DoD gate, R-CGO gate (Phase-1 once), security/CGO clause, Fence Rules (3 Depguard fences with explicit grep checks), pre-revert tag protocol, references table; all sections are AC-locked per pilot charter and non-separable. -->
# dev-stock-price — Main (Pointer)

**Zone:** `apps/stock-price/`
**Specialist for:** 3-tier price fallback, VPS bridge, price aggregation, HOSE/HNX/UPCOM data

Thin pointer — shared flow for all dev-* zone agents:

→ Run flow: `docs/agents/developer/flow/microservice-main.md`

Substitutions:
- `<service>` = `stock-price`
- `<agent-id>` = `dev-stock-price`
- zone restriction: only `apps/stock-price/` files

---

## Language Mode

Detect language from the task spec before running any step of the shared flow. Do NOT assume a language.

| Signal in task spec | Mode | Primary reference |
|---|---|---|
| Files contain `*.go`, `go.mod`, `cmd/`, `pkg/` | **Go** (active pilot — primary mode) | `docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md` |
| Files contain `*.ts`, `*.tsx`, `bun`, `package.json` | **TS** (legacy scrapers only — no new pilot work in TS) | historical; do not drive new pilot work from it |
| Both or ambiguous | **Go** (default for stock-price pilot — service is natively Go per system-map.json `runtime go1.22+cgo`) | same Go ref above |

**Go is primary for the 6-sprint pilot window (through 2026-07-04).** All Phase 1 and Phase 2 tasks are Go.

When in **Go mode**, load the brownfield inventory before touching code:
→ `docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md` (lazy-load: trigger = Go task assigned)

When in **TS mode**, that mode is for legacy scraper files only. No new TS files for the pilot domain.

---

## Smoke Checks

Run the column matching your Language Mode before every commit. Both columns mandatory for tasks touching language-agnostic files (scenario JSON, dashboard HTML).

| Check | Go mode | TS mode |
|---|---|---|
| Unit tests | `cd apps/stock-price && go test ./...` | `cd apps/stock-price && bun test` |
| Static analysis | `go vet ./...` | `bun tsc --noEmit` |
| Lint / extra | `golangci-lint run` (or offline per architect spec) | — |
| Compile check | `go build ./cmd/...` | — |
| Scenario JSON validity | `find docs/scenarios/stock-price -name '*.json' -exec jq . {} \; > /dev/null` | same |
| Sandbox runner (primitive) | `CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all` | N/A |
| Sandbox runner (module) | `CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all` | N/A |

---

## Pilot Hard Rule (G12 — blocking)

### G12 DoD Gate (mandatory — blocking from Day 0)

**Do not mark task DONE until sandbox dashboard shows all stock-price scenarios green.**

Run both tiers before declaring complete:

```bash
cd apps/stock-price
CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all
```

Both commands must exit 0 with all scenarios GREEN.

If ANY scenario is RED:
- The task is NOT done.
- Fix the failing scenario before re-running.
- Each fix attempt that does not result in all-GREEN = 1 cycle (counted for G10/G11 evidence).

Evidence requirement: paste the sandbox output (pass/fail summary line) into the task handoff doc before writing the RETURN block.

This rule is non-negotiable. It applies to every task cycle in the `stock-price` pilot (Phase 0 through Phase 3).

Reference: `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` §G12

---

## R-CGO Gate (Phase 1 kickoff — run once before first primitive lands)

**Purpose:** Confirm that extracted primitives + module + sandbox compile and run under `CGO_ENABLED=0`. This is the binding correctness gate for the fences. If any extracted unit transitively pulls `mattn/go-sqlite3`, the decomposition is wrong — flag and re-cut before proceeding.

**R-CGO pre-check sequence (run ONCE at Phase 1 kickoff, then document result in Phase 0 brownfield inventory):**

```bash
# Step 1 — Primitive fence CGO-free build
cd apps/stock-price
CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=stock-price -scenario=all
# Exit 0 = R-CGO CLEAR for primitives. Exit != 0 = R-CGO BLOCKED — escalate to architect.

# Step 2 — Module fence CGO-free build
CGO_ENABLED=0 go run ./cmd/sandbox -tier=module -module=stock-price -scenario=all
# Exit 0 = R-CGO CLEAR for module. Exit != 0 = R-CGO BLOCKED — escalate to architect.

# Step 3 — CGO leak grep (must return 0 matches)
grep -rn "mattn/go-sqlite3" apps/stock-price/pkg/primitive apps/stock-price/pkg/module apps/stock-price/cmd/sandbox
# 0 matches = CLEAR. >0 matches = ABORT task, escalate as BLOCKER.
```

**Decision:**
- All exit 0 + grep = 0 matches → R-CGO CLEAR, continue Phase 1.
- Any exit != 0 OR grep > 0 matches → R-CGO BLOCKED. Do NOT proceed. Re-cut the decomposition so I/O does not leak into the fence. Escalate to architect.

**This check is documented in this flow but is a pre-task validation, NOT a per-commit check.** It runs once at Phase 1 kickoff. Subsequent per-commit fence checks use the Fence Rules section below.

Reference: `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` §CGO Boundary Clause

---

## Security Rule (§Security / CGO Clause — blocking)

**Sandbox process MUST have zero DB credentials, zero external API keys, AND zero CGO at all times.**

Before declaring any sandbox-related task DONE, verify:

```bash
env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"
# Must return empty when running inside the sandbox process context
```

**stock-price-specific CGO gate:** sandbox binary builds and runs under `CGO_ENABLED=0`. Sandbox runs against scenario JSON fixtures, NOT live VnDirect APIs and NOT a real SQLite DB.

If any credential OR `mattn/go-sqlite3` import appears in the sandbox/primitive/module path, the task is blocked — it does not pass.

Reference: `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` §Security / CGO Clause

---

## Fence Rules (Depguard — G4 pre-check before every commit to Go files)

Three architectural fences must hold on every commit touching Go files in `apps/stock-price/`:

- **Fence-A:** `pkg/primitive/*/` MUST NOT import anything from `pkg/application/`, `pkg/interface/`, `pkg/module/`, `pkg/infrastructure/`, or `mattn/go-sqlite3`. Primitives are **stdlib-only**.
  - Check: `grep -rn "application\|interface\|module\|infrastructure\|mattn/go-sqlite3" apps/stock-price/pkg/primitive/` returns 0.

- **Fence-B:** `pkg/module/*/` MUST NOT import anything from `pkg/infrastructure/` or `mattn/go-sqlite3`. Module composes via ports (interfaces) only.
  - Check: `grep -rn "infrastructure\|mattn/go-sqlite3" apps/stock-price/pkg/module/` returns 0.

- **Fence-C:** `mattn/go-sqlite3` and direct infrastructure importers are allowed ONLY in `cmd/server/main.go` (composition root). Exclusions: `*_test.go`.
  - Check: `grep -rn "mattn/go-sqlite3\|pkg/infrastructure" apps/stock-price/pkg/domain/ apps/stock-price/pkg/application/ apps/stock-price/pkg/primitive/ apps/stock-price/pkg/module/ apps/stock-price/pkg/interface/` returns 0.

Fence violations = task not done. Fix and re-run.

**Golangci-lint depguard enforcement:** `apps/stock-price/.golangci.yml` contains the depguard rules for all three fences (G4 deliverable). Run `cd apps/stock-price && golangci-lint run` to check.

Reference: `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` §G4

---

## Pre-Revert Tag Protocol

Before mutation sequences that risk requiring a revert:

| Pre-step | Tag to create | Before |
|---|---|---|
| Before G4 CI job activation in `.github/workflows/ci.yml` | `stock-price-pre-ci` | P2-A CI commit |
| Before `git mv` to `_deprecated/` (G5) | `stock-price-pre-delete` | P2-B deletion commit |
| Before bug injection commit (G10) | `stock-price-pre-inject` | P2-D bug injection commit |

Create with: `git tag stock-price-pre-<name> HEAD` — NO `--force`, NO push. No retag. Frozen anchor.

**Note:** Do NOT create these tags during Phase 0 work. Tags are placed at the commit IMMEDIATELY BEFORE the mutation/violation/injection step in their respective Phase tasks.

Reference: `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` §L5

---

## References

| Document | Status | Purpose |
|---|---|---|
| `docs/architecture-briefs/2026-05-23-stock-price-factory/p0-brownfield-inventory.md` | **PRIMARY** | Brownfield scan: primitives selected, DDD assessment, R-CGO feasibility |
| `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-1-task-plan-go.md` | **Active** | Go task ledger Phase 1 with per-task AC |
| `docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md` | **Binding** | G1-G12 goals + CGO boundary clause + constraints + security clause |
| `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md` | **Binding** | §Q2 verdict: Go is the implementation language for all Go microservice fractals |
| `docs/data/pilot-status-stock-price.json` | **Live SSOT** | Goal tracking — PO reads/writes; dev-stock-price does not write |

---

For spike tasks (`mode: "spike"`): `docs/agents/developer/flow/feature-spike.md`.

Service docs: `docs/architecture/microservice/stock-price/`. Agent definition: `.claude/agents/dev-stock-price.md`.
