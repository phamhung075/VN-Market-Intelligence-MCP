---
title: "Phase 2 Task Plan (Go) — Technical-Analysis Pilot"
date: "2026-05-23"
author: "po (skeleton) → architect (expanded 2026-05-23) → pm (to atomize)"
status: "EXPANDED — awaiting pm atomization into handoff files"
pilot: "technical-analysis"
phase: "2"
sprint_kickoff: "2026-05-23"
sprint_deadline: "2026-07-03"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
phase1_plan_archived: "docs/architecture-briefs/2026-05-22-refactor/phase-1-task-plan-go.md"
phase1_closure_commit: "9564f6ee"
language: "Go"
fence_linter_choice: "golangci-lint with depguard"
fence_linter_rationale: "Already operational in Go ecosystem; depguard expresses allow/deny import rules per package pattern with YAML config; zero new binary to install; extends the existing go vet + staticcheck chain already used in smoke checks. go-arch-lint offers richer declarative rules but requires a separate binary and its YAML format has a steeper learning curve for a single-service pilot. A custom AST walker gives maximum control but adds maintenance burden (our own code to maintain as the Go service evolves). depguard inside golangci-lint hits the sweet spot: expressive enough for Fence-A/B/C, zero new dependency, integrates into the CI job that already runs bun test (add a parallel go-lint step)."
---

# Phase 2 Task Plan (Go) — Technical-Analysis Pilot

**PO authored skeleton 2026-05-23. Architect expanded 2026-05-23.**
Phase 1 closed with QA verdict PASS (commit `9564f6ee`). Six goals remain: G4, G5, G9, G10, G11, G12.

---

## Fence Linter Decision (P2-A)

**Choice: `golangci-lint` with `depguard` linter.**

Rationale (binding for P2-A implementation):

1. `go-arch-lint` — declarative YAML, strict layer rules. Rejected: requires a separate binary not in the Go toolchain; YAML schema is less portable and not well-known within the team; a single-service pilot does not justify the installation overhead.
2. `golangci-lint` with `depguard` — already canonical in Go ecosystem; depguard expresses deny-list per package path prefix with YAML config (`.golangci.yml`); integrates with the existing `go vet + staticcheck` chain in the dev-technical-analysis smoke checks. **Selected.**
3. Custom AST walker — maximum control, zero third-party dependency. Rejected: every evolution of the service layout (new sub-packages, renamed paths) requires AST rule maintenance. Maintenance burden is not justified for a pilot.

**Config file location:** `apps/technical-analysis/.golangci.yml`

**Three fence rules expressed in depguard YAML (Fence-A, Fence-B, Fence-C):**

```yaml
# apps/technical-analysis/.golangci.yml
run:
  go: "1.22"

linters:
  enable:
    - depguard

linters-settings:
  depguard:
    rules:
      # Fence-A: primitives must not import modules, application, interface, or any apps/* path
      primitive-layer:
        files:
          - "$root/pkg/primitive/**/*.go"
        deny:
          - pkg: "github.com/vn-market-intelligence/technical-analysis/pkg/module"
            desc: "Fence-A: primitive must not import module layer"
          - pkg: "github.com/vn-market-intelligence/technical-analysis/pkg/application"
            desc: "Fence-A: primitive must not import application layer"
          - pkg: "github.com/vn-market-intelligence/technical-analysis/pkg/interface"
            desc: "Fence-A: primitive must not import interface layer"

      # Fence-B: modules must not import application or interface layers
      module-layer:
        files:
          - "$root/pkg/module/**/*.go"
        deny:
          - pkg: "github.com/vn-market-intelligence/technical-analysis/pkg/application"
            desc: "Fence-B: module must not import application layer"
          - pkg: "github.com/vn-market-intelligence/technical-analysis/pkg/interface"
            desc: "Fence-B: module must not import interface layer"

      # Fence-C: infrastructure constructors (NewSQLite*, NewRedis*, NewHTTP*) must only be called from cmd/server/main.go
      composition-root-only:
        files:
          - "!$root/cmd/server/main.go"
          - "$root/**/*.go"
        deny:
          - pkg: "github.com/vn-market-intelligence/technical-analysis/pkg/infrastructure"
            desc: "Fence-C: infrastructure wiring only allowed in cmd/server/main.go (composition root)"
```

Note on Fence-C: depguard denies the entire infrastructure package from all files except the composition root. This achieves the intent (no `NewSQLite*`, `NewRedis*`, `NewHTTP*` calls outside main.go) without AST inspection. Edge: test files in `pkg/infrastructure/` may legitimately import their own package; exempt those via `files: ["!**/*_test.go"]` if needed — developer to evaluate at P2-A2 config time.

**CI integration:** Add a parallel `go-lint` job to `.github/workflows/ci.yml` (alongside the existing `bun test` job). The job runs `cd apps/technical-analysis && golangci-lint run --config .golangci.yml`. A deliberate-violation artifact (P2-A4) proves the job fails on Fence-A import, then passes after removal.

---

## Summary

Phase 2 closes the remaining six goals (G4, G5, G9, G10, G11, G12) before 2026-07-03.
Scope is closure-only. Anti-scope-creep and security clauses from charter §Anti-Scope-Creep and §Security Clause remain in force.

---

## Task Ledger

| ID | Title | Owner | Goals | Blocks | Blocked by | Est | AC count |
|----|-------|-------|-------|--------|------------|-----|----------|
| **P2-A1** | Author `.golangci.yml` with Fence-A/B/C depguard rules | dev-technical-analysis | G4 | P2-A2 | — | 30m | 6 |
| **P2-A2** | Add `go-lint` CI job to `.github/workflows/ci.yml` | dev-technical-analysis | G4 | P2-A3 | P2-A1 | 20m | 5 |
| **P2-A3** | Verify CI green on clean codebase (no violations) | qa | G4 | P2-A4 | P2-A2 | 15m | 4 |
| **P2-A4** | Deliberate-violation artifact: prove CI red on Fence-A violation, green on revert | qa | G4 | — | P2-A3 | 20m | 5 |
| **P2-B0** | Brownfield inventory scan: all TS TA callers in mcp-server | dev-technical-analysis | G5 | P2-B1 | — | 20m | 4 |
| **P2-B1** | Rewire `technicalIndicatorTools.ts` to HTTP call against TA Go service (port 5003) | dev-technical-analysis | G5 | P2-B2 | P2-B0 | 45m | 6 |
| **P2-B2** | Move `technicalIndicators.ts` domain service to `_deprecated/` folder | dev-technical-analysis | G5 | P2-B3 | P2-B1 | 15m | 4 |
| **P2-B3** | Remove all "TODO: migrate" comments from mcp-server + technical-analysis | dev-technical-analysis | G5 | P2-B4 | P2-B2 | 15m | 3 |
| **P2-B4** | Integration test: TA MCP tool end-to-end via Go service | qa | G5 | — | P2-B3 | 30m | 5 |
| **P2-C** | G9 async user verification gate (PO-owned) | po | G9 | — | — | async | 6 |
| **P2-D0** | Preflight: verify bug-inventory.json has ≥1 technical-analysis candidate for injection | qa | G10 | P2-D1 | — | 10m | 3 |
| **P2-D1** | Design and document bug-injection spec (RSI off-by-one or MACD smoothing) | qa | G10 | P2-D2 | P2-D0, P2-F1 | 20m | 5 |
| **P2-D2** | QA injects bug in single commit; dispatches dev-technical-analysis with dashboard scenario only | qa | G10 | P2-D3 | P2-D1 | 15m | 4 |
| **P2-D3** | dev-technical-analysis fixes bug (≤2 cycles); dashboard goes GREEN | dev-technical-analysis | G10, G12 | — | P2-D2 | 1h | 5 |
| **P2-E1** | QA designs scenario pair A + B (shared input shape, regression canary) | qa | G11 | P2-E2 | P2-F1 | 20m | 5 |
| **P2-E2** | QA injects bug A; dispatches dev-technical-analysis | qa | G11 | P2-E3 | P2-E1 | 15m | 3 |
| **P2-E3** | dev-technical-analysis fixes A (triggers B red); fixes B in same cycle; both GREEN | dev-technical-analysis | G11, G12 | — | P2-E2 | 1h | 6 |
| **P2-F1** | Architect authors flow-rule brief for agent-father | architect | G12 | P2-F2 | — | done | 5 |
| **P2-F2** | agent-father inserts dashboard-green DoD step in dev-technical-analysis flow | agent-father | G12 | P2-D2, P2-E2 | P2-F1 | 30m | 5 |
| **P2-F3** | QA reads flow file, confirms DoD step is present; counts 3-streak tasks | qa | G12 | — | P2-D3, P2-E3 | 10m | 4 |

**Total atomic tasks:** 20 (4 A + 5 B + 1 C + 4 D + 3 E + 3 F)

---

## Sequencing (architect revised)

```
P2-F1 (architect brief — done) → P2-F2 (agent-father flow edit)
   ↓
P2-A1 → P2-A2 → P2-A3 → P2-A4   [G4 fence — parallel with P2-F2]
P2-B0 → P2-B1 → P2-B2 → P2-B3 → P2-B4   [G5 deletion — start after P2-A3 confirms fence green]
P2-D0 → P2-D1 → P2-D2 → P2-D3   [G10 AI-fix — gates on P2-F2 flow edit done]
P2-E1 → P2-E2 → P2-E3            [G11 regression — gates on P2-F2 + P2-D3 pattern stabilization]
P2-C                              [G9 — async PO track, no blocking dependency]
P2-F3                             [G12 streak verification — after P2-D3 + P2-E3]
```

**Revised critical path:** P2-F2 (agent-father) → P2-D1 → P2-D2 → P2-D3 → P2-E1 → P2-E2 → P2-E3 → P2-F3

**Architect order rationale:**
- P2-F2 must land before P2-D2 and P2-E2 dispatches so the flow rule is enforced during the fix work (streak tasks must accrue under the rule, not before it).
- P2-B (deletion) must not start until P2-A3 confirms the fence is green — running deletion without fence protection risks silent cross-layer import re-introduction.
- P2-D and P2-E can run in parallel with P2-A and P2-B on different agents (G10/G11 are independent of G4/G5).

---

## Per-Task Spec

### P2-A1 — Author `.golangci.yml` with Fence-A/B/C depguard rules

**Owner:** dev-technical-analysis
**Goals:** G4 (Architecture fence enforced in CI)
**Files touched:**
- `apps/technical-analysis/.golangci.yml` (NEW)

**AC:**
1. File created at `apps/technical-analysis/.golangci.yml`
2. `run.go: "1.22"` matches the service's `go.mod` go directive
3. Fence-A rule denies `pkg/module`, `pkg/application`, `pkg/interface` imports from any file under `pkg/primitive/`
4. Fence-B rule denies `pkg/application` and `pkg/interface` imports from any file under `pkg/module/`
5. Fence-C rule denies `pkg/infrastructure` imports from all files except `cmd/server/main.go`
6. `cd apps/technical-analysis && golangci-lint run --config .golangci.yml` exits 0 on the current clean codebase (no violations)
7. Config file is valid YAML: `python3 -c "import yaml; yaml.safe_load(open('.golangci.yml'))"` exits 0

**Smoke check:**
```bash
cd apps/technical-analysis && golangci-lint run --config .golangci.yml
```
Must exit 0.

**Atomic commit format:**
```
chore(arch/technical-analysis): P2-A1 — golangci-lint depguard Fence-A/B/C config

Implements G4 per pilot-charter.md. Three fence rules:
  Fence-A: pkg/primitive/* must not import pkg/{module,application,interface}
  Fence-B: pkg/module/* must not import pkg/{application,interface}
  Fence-C: pkg/infrastructure only importable from cmd/server/main.go

Linter choice: golangci-lint + depguard (rationale in phase-2-task-plan-go.md §Fence Linter Decision).

Sprint: <sprint>
Task: P2-A1
AC: .golangci.yml created / Fence-A/B/C rules present / golangci-lint exits 0 on clean codebase / YAML valid
```

**Goal mapping:** G4

---

### P2-A2 — Add `go-lint` CI job to `.github/workflows/ci.yml`

**Owner:** dev-technical-analysis
**Goals:** G4
**Files touched:**
- `.github/workflows/ci.yml` (MODIFY — add parallel `go-lint` job)

**AC:**
1. A new job named `go-lint` added to `.github/workflows/ci.yml`
2. Job uses `ubuntu-latest`, `timeout-minutes: 10`
3. Job installs golangci-lint via the official GitHub Action (`golangci/golangci-lint-action@v6`), pinned to a specific version
4. Job runs `cd apps/technical-analysis && golangci-lint run --config .golangci.yml`
5. Job runs in parallel with (not dependent on) the existing `bun test` job — no `needs:` clause pointing to `test`
6. The job is named `go-lint` in the workflow so GitHub Actions displays it as a required check

**Smoke check:**
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML valid"
```
Plus push to a test branch (dev creates on main per no-branches rule — commit directly) and observe CI results.

**Atomic commit format:**
```
chore(arch/ci): P2-A2 — add go-lint CI job for technical-analysis fence enforcement

Adds parallel golangci-lint job to CI. Runs Fence-A/B/C depguard rules on every push/PR.
Gate: CI fails if any import violates fence rules.

Sprint: <sprint>
Task: P2-A2
AC: go-lint job added / parallel (no needs dependency on bun test) / golangci-lint-action pinned / YAML valid
```

**Goal mapping:** G4

---

### P2-A3 — Verify CI green on clean codebase

**Owner:** qa
**Goals:** G4
**Files touched:** none (verification only)

**AC:**
1. Trigger a push to `main` (or observe the commit from P2-A2) — CI runs both `bun test` and `go-lint` jobs
2. `go-lint` job exits green (exit 0) on the current codebase with no deliberate violations
3. `bun test` job is unaffected (still exits 0)
4. Evidence: CI run URL + screenshot or log excerpt showing `go-lint: passed`

**Smoke check:**
```bash
# Verify CI status via gh
gh run list --limit 5 --json status,conclusion,name
```
Look for `go-lint` with `conclusion: success`.

**Atomic commit format:** No commit for this task — QA records evidence in handoff file.

**Goal mapping:** G4

---

### P2-A4 — Deliberate-violation artifact: prove CI red/green cycle

**Owner:** qa
**Goals:** G4
**Files touched:**
- `apps/technical-analysis/pkg/primitive/rsi/rsi.go` (TEMP MODIFY — add forbidden import, then revert)

**AC:**
1. QA adds a deliberate Fence-A violation: one import of `"github.com/vn-market-intelligence/technical-analysis/pkg/module"` anywhere in `pkg/primitive/rsi/rsi.go`
2. Commit the violation: `test(arch/ci): P2-A4-violation — deliberate Fence-A import for CI red proof`
3. Observe CI run → `go-lint` job exits non-zero (red); `bun test` is unaffected
4. Revert the violation in a second commit: `test(arch/ci): P2-A4-revert — remove deliberate Fence-A import`
5. Observe CI run → `go-lint` job exits 0 (green)
6. Evidence: two CI run URLs (one red, one green) recorded in handoff file

**Smoke check:**
```bash
# After violation commit:
gh run list --limit 2 --json status,conclusion,name,url
# Confirm go-lint = failure on violation commit, success on revert commit
```

**Atomic commit format:**
```
test(arch/ci): P2-A4-violation — deliberate Fence-A import for CI red proof

Adds forbidden import pkg/module inside pkg/primitive/rsi to verify CI fence enforcement.
Will be reverted in next commit.

Sprint: <sprint>
Task: P2-A4
AC: CI go-lint job exits non-zero on this commit
```

**Goal mapping:** G4 (proven by CI red/green cycle)

---

### P2-B0 — Brownfield inventory scan: all TS TA callers in mcp-server

**Owner:** dev-technical-analysis
**Goals:** G5
**Files touched:**
- `docs/architecture-briefs/2026-05-22-refactor/p2-b-caller-inventory.md` (NEW — inventory output)

**Pre-scan findings (architect brownfield, confirmed 2026-05-23):**

Three TS files confirmed as TA code targets:
- `apps/mcp-server/src/domain/services/technicalIndicators.ts` — pure domain service (RSI/MACD/BB/MA math). This is the G5 deletion target.
- `apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts` — MCP tool handler. Imports `computeAllIndicators` from the domain service. This is the rewire target (HTTP call to port 5003).
- `apps/mcp-server/src/__tests__/1302-technical-indicators.test.ts` — test file for the above. Delete or quarantine alongside the domain service.
- `apps/mcp-server/src/infrastructure/microservices/clients.ts` — already has `ta: Bun.env.TA_SERVICE_URL ?? 'http://localhost:5003'` entry. The HTTP client infrastructure is ALREADY IN PLACE. P2-B1 only needs to rewire the tool handler to call the existing client rather than importing the TS domain service.

**AC:**
1. File `docs/architecture-briefs/2026-05-22-refactor/p2-b-caller-inventory.md` created with confirmed list of all TS files touching technical-analysis domain service
2. Each entry: file path, import line, what it calls, rewire plan (HTTP or delete)
3. Run `find apps/mcp-server/src -path "*technical*" -name "*.ts"` — output matches the inventory
4. Run `grep -r "from.*technicalIndicators\|computeAllIndicators" apps/mcp-server/src/ --include="*.ts"` — output matches the inventory

**Smoke check:**
```bash
find apps/mcp-server/src -path "*technical*" -name "*.ts" && grep -r "from.*technicalIndicators\|computeAllIndicators" apps/mcp-server/src/ --include="*.ts"
```
Both must match the inventory exactly (no surprises).

**Atomic commit format:**
```
docs(arch/technical-analysis): P2-B0 — brownfield inventory: TS TA callers in mcp-server

3 files identified: technicalIndicators.ts (delete), technicalIndicatorTools.ts (rewire),
1302-technical-indicators.test.ts (quarantine). HTTP client infrastructure already present
in clients.ts (port 5003). P2-B1 rewire is low-risk.

Sprint: <sprint>
Task: P2-B0
AC: inventory doc created / find + grep output matched / 3 files identified
```

**Goal mapping:** G5 (prerequisite brownfield scan)

**Rollback strategy (architect-specified per PO risk flag R-3):** Before any deletion commit in P2-B2, create a tag on the current HEAD: `git tag p2-b-pre-delete`. If rollback is needed, `git revert <delete-commit-hash>` (single atomic commit to revert; no force-push required because we stay on main with no branches).

---

### P2-B1 — Rewire `technicalIndicatorTools.ts` to HTTP call against Go TA service

**Owner:** dev-technical-analysis
**Goals:** G5
**Files touched:**
- `apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts` (MODIFY)

**AC:**
1. The file no longer imports from `../../../../domain/services/technicalIndicators.js`
2. Instead, it calls the existing HTTP client in `apps/mcp-server/src/infrastructure/microservices/clients.ts` (the `ta` entry at port 5003 is already there)
3. The MCP tool `get_technical_indicators` continues to accept the same input schema (symbol, optional period) and returns the same output format visible to Claude
4. HTTP call uses `POST /ta/indicators` matching the Go service's `api/openapi.yaml`
5. Error handling: if the Go service returns non-200 or times out, the tool returns a user-friendly error (not a raw stack trace)
6. Existing test `1302-technical-indicators.test.ts` must be updated to mock the HTTP call (not the domain service import) — tests must still pass: `cd apps/mcp-server && bun test`

**Smoke check:**
```bash
cd apps/mcp-server && bun test && bun tsc --noEmit
```
Both must exit 0.

**Atomic commit format:**
```
feat(technical-analysis): P2-B1 — rewire technicalIndicatorTools.ts → HTTP port 5003

Removes direct import of technicalIndicators.ts domain service.
Tool now calls existing TA HTTP client (clients.ts ta entry).
HTTP endpoint: POST /ta/indicators per api/openapi.yaml.

Sprint: <sprint>
Task: P2-B1
AC: no domain service import / HTTP call to port 5003 / bun test passes / bun tsc passes
```

**Goal mapping:** G5

---

### P2-B2 — Move `technicalIndicators.ts` domain service to `_deprecated/`

**Owner:** dev-technical-analysis
**Goals:** G5
**Files touched:**
- `apps/mcp-server/src/domain/services/technicalIndicators.ts` (MOVE to `apps/mcp-server/src/_deprecated/technicalIndicators.ts`)
- `apps/mcp-server/src/__tests__/1302-technical-indicators.test.ts` (MOVE to `apps/mcp-server/src/_deprecated/1302-technical-indicators.test.ts`)

**AC:**
1. `apps/mcp-server/src/domain/services/technicalIndicators.ts` no longer exists at the original path
2. File moved (not deleted) to `apps/mcp-server/src/_deprecated/technicalIndicators.ts` — preserves git history via rename
3. Test file moved similarly: `1302-technical-indicators.test.ts` → `_deprecated/1302-technical-indicators.test.ts`
4. `bun test` still passes (no broken imports referencing the old path)
5. `find apps/mcp-server/src -path "*technical*" -name "*.ts" -not -path "*_deprecated*"` returns 0 results (only tool handler remains, already rewired)
6. A header comment added to both `_deprecated/` files: `// DEPRECATED: G5 Phase 2. Moved from domain/services/. Delete after G5 verification passes.`

**Smoke check:**
```bash
cd apps/mcp-server && bun test && find apps/mcp-server/src -path "*technical*" -name "*.ts" -not -path "*_deprecated*" | wc -l
# Second command must print 0 (or 1 if technicalIndicatorTools.ts path doesn't contain "technical" — adjust grep as needed)
```

**Atomic commit format:**
```
refactor(technical-analysis): P2-B2 — move technicalIndicators.ts to _deprecated/

G5 Phase 2: quarantine TS domain service + test to _deprecated/.
Original callers already rewired via HTTP (P2-B1).
Preserved in _deprecated/ for git-history reference; will be deleted post-G5-verification.

Sprint: <sprint>
Task: P2-B2
AC: original path empty / _deprecated/ files present / bun test passes / find returns 0 results outside _deprecated
```

**Goal mapping:** G5

---

### P2-B3 — Remove all "TODO: migrate" comments

**Owner:** dev-technical-analysis
**Goals:** G5
**Files touched:** any `.ts` files under `apps/mcp-server/src/` or `apps/technical-analysis/` containing `TODO.*migrat` patterns

**AC:**
1. `grep -r "TODO.*migrat" apps/mcp-server/src/ apps/technical-analysis/ --include="*.ts" --include="*.go"` returns 0 results
2. Removal is comment-only — no logic changes
3. `bun test` still passes
4. `go test ./...` in `apps/technical-analysis/` still passes

**Smoke check:**
```bash
grep -r "TODO.*migrat" apps/mcp-server/src/ apps/technical-analysis/ --include="*.ts" --include="*.go" | wc -l
# Must print 0
cd apps/technical-analysis && go test ./... && cd ../../apps/mcp-server && bun test
```

**Atomic commit format:**
```
chore(technical-analysis): P2-B3 — remove TODO:migrate comments (G5 cleanup)

Clears all TODO:migrate markers from mcp-server + technical-analysis.
Both bun test + go test pass.

Sprint: <sprint>
Task: P2-B3
AC: grep TODO migrate = 0 results / bun test passes / go test passes
```

**Goal mapping:** G5

---

### P2-B4 — Integration test: TA MCP tool end-to-end via Go service

**Owner:** qa
**Goals:** G5
**Files touched:** none (verification only; evidence recorded in handoff)

**AC:**
1. Go TA service is running (`docker compose up technical-analysis -d` or local `go run ./cmd/server/`)
2. MCP tool `get_technical_indicators` called (via Claude or direct JSON-RPC test) → returns RSI/MACD/BB values for a test ticker
3. Response format matches the previous TS-backed response shape (same field names visible to Claude)
4. `find apps/mcp-server/src -path "*technical*" -name "*.ts" -not -path "*_deprecated*"` returns 0 results (G5 charter verification method)
5. `grep -r "TODO.*migrat" apps/mcp-server/src/ apps/technical-analysis/` returns 0 results (G5 charter verification method)

**Smoke check:**
```bash
find apps/mcp-server/src -path "*technical*" -name "*.ts" -not -path "*_deprecated*" | wc -l
grep -r "TODO.*migrat" apps/mcp-server/src/ apps/technical-analysis/ | wc -l
# Both must print 0
```

**Atomic commit format:** No commit for this task — QA records evidence in handoff file only.

**Goal mapping:** G5 (final verification gate)

---

### P2-C — G9 Async user verification gate (PO-owned)

**Owner:** po
**Goals:** G9
**Deliverables (PO-owned, see phase-2-task-plan-go.md §G9 Strategy for full rationale):**
1. Telegram WORK message sent to user: dashboard URL + YES/NO question
2. Signal file `docs/signals/po-{timestamp}.json` dropped (done: see po-20260522T220634Z.json)
3. User reply tracked in `docs/po-decisions/2026-05-23-g9-user-confirmation.md`
4. On YES: `pilot-status.json` `goals[G9].status = "YES"` + `verifiedAt` + `verifiedBy = "po (user verbal async confirmation)"`
5. On NO: triage into dashboard-polish task
6. G9 does NOT block Phase 2 dev work

**Goal mapping:** G9 (PO-owned async track)

---

### P2-D0 — Preflight: verify bug-inventory.json has ≥1 TA candidate

**Owner:** qa
**Goals:** G10
**Files touched:** none (read-only verification)

**Architect finding (verified 2026-05-23):**

`docs/data/bug-inventory.json` EXISTS. It contains two technical-analysis bugs:
- `1970-TA-OHLCV-MISSING` — fixCycles: 1, resolved: true
- `1968d-wave1-anchor-format` — fixCycles: 2, resolved: true

Baseline: `baselineCycleCount: 1.5` (measured TA average from resolved bugs). This REPLACES the charter's system-wide 4-6 cycle estimate with a more accurate TA-specific baseline.

**Critical implication for G10:** The charter states agent must fix in ≤2 cycles vs the 4-6 baseline. With the actual TA baseline at 1.5 cycles, the goal remains ≤2 cycles (same target). The baseline number to record in evidence is **1.5 cycles** (TA-specific), not 4-6 (system-wide).

**AC:**
1. `docs/data/bug-inventory.json` exists and is valid JSON
2. At least one bug has `"module": "technical-analysis"` (currently 2 bugs: 1970, 1968d)
3. `baselineCycleCount` field is present (value: 1.5 for TA-specific bugs)
4. QA records in handoff: "P0-1 complete. bug-inventory.json exists. TA baseline = 1.5 cycles. G10 target = ≤2 cycles."

**Smoke check:**
```bash
jq '.baselineCycleCount, [.bugs[] | select(.module == "technical-analysis")] | length' docs/data/bug-inventory.json
# Must print: 1.5 \n 2 (or higher)
```

**Atomic commit format:** No commit — verification only. Result recorded in handoff.

**Goal mapping:** G10 (preflight gate)

---

### P2-D1 — Design and document bug-injection spec

**Owner:** qa
**Goals:** G10
**Files touched:**
- `docs/architecture-briefs/2026-05-22-refactor/p2-d-bug-injection-spec.md` (NEW)

**Bug injection candidate (architect recommendation):**

Inject an off-by-one in `apps/technical-analysis/pkg/primitive/rsi/rsi.go`: change the Wilder smoothing period from `period` to `period - 1` in the RSI gain/loss averaging calculation. This is a realistic bug (off-by-one in period parameter is a common math mistake), scoped to a single pure function, and is directly detectable by the `rsi-golden.json` scenario (the output RSI values will be wrong for all periods). The sandbox will flip the RSI golden scenario card from GREEN to RED immediately — proving the dashboard IS the signal contract.

Alternatively: RSI Wilder smoothing initial seed — change `WilderEMA[0] = simple mean of first period values` to `WilderEMA[0] = prices[0]` (uses first price as seed instead of mean). This produces wrong RSI values after the first window, detectable by comparing to a reference vector.

QA selects one of these two options in P2-D1 and documents it before injection.

**AC:**
1. `docs/architecture-briefs/2026-05-22-refactor/p2-d-bug-injection-spec.md` created
2. Specifies: which file is modified, which line(s) change, before/after code snippet (redacted — exact code kept out of this doc per architect boundary), expected scenario failure (which scenario JSON card turns RED)
3. Confirms the bug is detectable by dashboard scenario RED (not silently passing with wrong output)
4. Documents the cycle-counting protocol: each agent fix attempt that does NOT flip all RSI scenarios GREEN = 1 cycle
5. Documents baseline: TA-specific `baselineCycleCount = 1.5` (from bug-inventory.json), target ≤ 2 cycles

**Smoke check:**
```bash
# Verify spec file exists and is non-trivial
wc -l docs/architecture-briefs/2026-05-22-refactor/p2-d-bug-injection-spec.md
# Must be > 20 lines
```

**Atomic commit format:**
```
docs(arch/technical-analysis): P2-D1 — bug-injection spec for G10 AI-fixability proof

RSI off-by-one (period vs period-1) or Wilder seed selection. Detectable by rsi-golden.json RED.
Baseline: 1.5 cycles (TA-specific from bug-inventory.json). Target: ≤2 cycles.

Sprint: <sprint>
Task: P2-D1
AC: spec doc created / bug scoped to single primitive / sandbox RED detection confirmed / cycle-counting protocol documented
```

**Goal mapping:** G10

---

### P2-D2 — QA injects bug; dispatches dev-technical-analysis with dashboard scenario only

**Owner:** qa
**Goals:** G10
**Files touched:**
- `apps/technical-analysis/pkg/primitive/rsi/rsi.go` (TEMP MODIFY — bug injection commit)

**AC:**
1. Bug injected in a single atomic commit (identifiable as the injection point in git log)
2. Commit message: `test(technical-analysis): P2-D2-inject — RSI [bug-type] bug for G10 AI-fix proof`
3. After injection: `go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=rsi-all` returns at least one RED result
4. Dashboard card for RSI golden scenario shows RED (confirms sandbox is the signal contract)
5. `dev-technical-analysis` agent dispatched with handoff containing ONLY: the failing dashboard scenario description + the command to run the sandbox. No other context. No code pointer. No hint about the bug location.
6. Dispatch is documented in handoff with timestamp (cycle counter starts here)

**Smoke check (post-injection, before dispatch):**
```bash
cd apps/technical-analysis && go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=rsi-all
# Must show at least one scenario status: RED
```

**Atomic commit format:**
```
test(technical-analysis): P2-D2-inject — RSI [bug-type] bug for G10 AI-fix proof

Deliberate bug injected for G10 measurement. Dashboard RSI golden card = RED.
Agent dispatched with scenario-only context. Cycle counting begins.

Sprint: <sprint>
Task: P2-D2
AC: bug committed / sandbox returns RED / dashboard card RED / agent dispatched with scenario-only context
```

**Goal mapping:** G10

---

### P2-D3 — dev-technical-analysis fixes bug (≤2 cycles); dashboard GREEN

**Owner:** dev-technical-analysis
**Goals:** G10, G12
**Files touched:**
- `apps/technical-analysis/pkg/primitive/rsi/rsi.go` (MODIFY — fix)

**AC:**
1. Agent receives handoff with ONLY the failing dashboard scenario
2. Agent identifies bug from dashboard RED signal + sandbox output + source code inspection
3. Fix applied in ≤2 commits (each fix attempt = 1 cycle; success = dashboard GREEN, failure = 1 cycle consumed)
4. After fix: `go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all` → ALL 30 scenarios GREEN
5. G12 DoD enforced: agent does NOT mark task DONE until sandbox runs all scenarios and dashboard shows GREEN
6. Git log evidence: between injection commit (P2-D2) and final green commit = ≤2 commits by dev-technical-analysis

**Smoke check:**
```bash
cd apps/technical-analysis && go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all && go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all
# Both must exit 0 with all GREEN
```

**Atomic commit format (each fix attempt):**
```
fix(technical-analysis): P2-D3 — RSI [fix description] — G10 cycle [N] of ≤2

[What was wrong, what was fixed]

Sprint: <sprint>
Task: P2-D3
AC: sandbox all-scenarios GREEN / dashboard green confirmed / G12 DoD check run before this commit
```

**Goal mapping:** G10 (proof: ≤2 cycles), G12 (streak task #2)

---

### P2-E1 — QA designs scenario pair A + B (regression canary)

**Owner:** qa
**Goals:** G11
**Files touched:**
- `docs/architecture-briefs/2026-05-22-refactor/p2-e-regression-scenario-spec.md` (NEW)

**Scenario design (architect guidance):**

Scenario A (primary): RSI period off-by-one bug (same injection pattern as P2-D, or a new variant). Scenario B (regression canary): Moving Average scenario that shares the `prices []float64` input shape. The link: if the RSI fix inadvertently changes how the MA dispatcher handles its smoothing constant (shared `calculateEMA` helper), the MA golden scenario will flip RED. This is a realistic cross-primitive regression because both RSI Wilder smoothing and MACD signal line smoothing call the same EMA helper.

QA may choose a different pairing — the key constraint is: the natural fix for A must have a plausible code path that could break B (otherwise the regression alarm never fires and G11 is unprovable).

**AC:**
1. Spec file created: describes scenario A (primary primitive, exact failure mode) and scenario B (canary primitive, exact input shape link to A)
2. Explains WHY the natural fix for A could break B (shared code path / shared constant / shared helper)
3. Both A and B already have scenario JSON files (from Phase 1 P1-D1 suite) — if not, new scenarios added
4. QA has a test plan: inject bug A, dispatch agent, observe whether B flips RED during the fix

**Smoke check:**
```bash
wc -l docs/architecture-briefs/2026-05-22-refactor/p2-e-regression-scenario-spec.md
# Must be > 20 lines (non-trivial spec)
```

**Atomic commit format:**
```
docs(arch/technical-analysis): P2-E1 — regression scenario pair spec for G11

Scenario A: [primitive A + failure mode]. Scenario B: [primitive B + canary link].
Shared code path: [describe link]. Injection plan documented.

Sprint: <sprint>
Task: P2-E1
AC: spec created / A + B described / shared code path explained / scenario JSONs confirmed present
```

**Goal mapping:** G11

---

### P2-E2 — QA injects bug A; dispatches dev-technical-analysis

**Owner:** qa
**Goals:** G11
**Files touched:**
- Primitive A source file (TEMP MODIFY — bug injection commit)

**AC:**
1. Bug A injected in atomic commit (same convention as P2-D2)
2. Sandbox run confirms scenario A = RED, scenario B = GREEN (regression not yet triggered — the fix will trigger it)
3. `dev-technical-analysis` dispatched with: failing scenario A description only + sandbox command. No B scenario mentioned. This simulates a real bug report where the regression is unknown until the fix lands.
4. Dispatch timestamp recorded (cycle counting begins for G11)

**Smoke check:**
```bash
cd apps/technical-analysis && go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all
# Scenario A = RED; scenario B = GREEN (pre-fix state)
```

**Atomic commit format:**
```
test(technical-analysis): P2-E2-inject — [primitive A] bug for G11 regression alarm proof

Bug A injected. Scenario A = RED. Scenario B = GREEN (canary not yet triggered).
Agent dispatched with scenario A context only.

Sprint: <sprint>
Task: P2-E2
AC: bug committed / scenario A RED / scenario B GREEN / agent dispatched with A-only context
```

**Goal mapping:** G11

---

### P2-E3 — dev-technical-analysis fixes A (triggers B red); fixes B in same cycle; both GREEN

**Owner:** dev-technical-analysis
**Goals:** G11, G12
**Files touched:**
- Primitive A source file (MODIFY — fix A)
- Primitive B source file (MODIFY — fix B, if regression triggered)

**AC:**
1. Agent fixes scenario A → runs sandbox → scenario A GREEN, scenario B RED (regression triggered)
2. G12 DoD rule prevents agent from marking task DONE while B is RED
3. Agent fixes scenario B in the same task cycle (without being explicitly told about B — the dashboard RED is the signal)
4. Final sandbox run: ALL 30 scenarios GREEN (A + B + all others)
5. Evidence: git log shows two commits in the same task: "fix A" then "fix B" (or a combined fix if the root cause is shared); both committed before DONE is declared
6. QA records: "at least 1 observed case of B flipping RED mid-fix, and agent addressing it before closing the task"

**Smoke check:**
```bash
cd apps/technical-analysis && go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all && go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all
# Both must exit 0 with all GREEN
```

**Atomic commit format (fix A):**
```
fix(technical-analysis): P2-E3a — fix [primitive A bug] — G11 regression alarm proof

Fix for scenario A. Running sandbox after this commit to check for regressions.

Sprint: <sprint>
Task: P2-E3
AC: scenario A GREEN / G12 sandbox check run / observed scenario B RED (regression triggered)
```

**Atomic commit format (fix B, same task):**
```
fix(technical-analysis): P2-E3b — fix [primitive B regression] triggered by P2-E3a fix

G11: regression alarm observed. B flipped RED during fix of A. Fixed B before declaring DONE.
All 30 scenarios GREEN. G12 DoD satisfied.

Sprint: <sprint>
Task: P2-E3
AC: scenario B GREEN / all 30 scenarios GREEN / G11 observed case recorded / G12 DoD enforced
```

**Goal mapping:** G11 (proven by 1 observed regression case), G12 (streak task #3)

---

### P2-F1 — Architect authors flow-rule brief for agent-father

**Owner:** architect
**Goals:** G12
**Status:** COMPLETE — see `docs/architecture-briefs/2026-05-22-refactor/p2-f-flow-rule-brief.md`

The flow-rule brief is the separate deliverable authored alongside this task plan expansion. It specifies the exact insertion point in `dev-technical-analysis/main.md`, the exact language of the DoD step, and the verification protocol for agent-father.

**Goal mapping:** G12

---

### P2-F2 — agent-father inserts dashboard-green DoD step in dev-technical-analysis flow

**Owner:** agent-father
**Goals:** G12
**Files touched:**
- `.claude/flows/dev-technical-analysis/main.md` (MODIFY — insert DoD step per flow-rule brief)

**AC:**
1. Flow file contains an explicit step (verbatim or near-verbatim from the brief): "Do not mark task DONE until sandbox dashboard shows all TA scenarios green"
2. Step is inserted before the RETURN/DONE block (not after) — enforced pre-close, not post-close
3. Step includes the exact sandbox command: `cd apps/technical-analysis && go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all && go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all`
4. Step requires: if ANY scenario is RED → task is NOT done; re-cycle until green
5. Step requires: sandbox output (pass/fail summary) appended to the task's handoff doc as evidence
6. agent-md-factory conventions respected (per `feedback_agent_md_factory.md` — SSOT, DRY, no duplication)

**Smoke check:**
```bash
grep -c "Do not mark task DONE\|sandbox dashboard\|all TA scenarios green" .claude/flows/dev-technical-analysis/main.md
# Must print ≥ 1
```

**Atomic commit format:**
```
feat(agents/dev-technical-analysis): P2-F2 — insert dashboard-green DoD step per G12 flow rule

Adds mandatory sandbox check before DONE. Agent must run all-scenario sandbox, verify GREEN,
append evidence to handoff before marking task complete. Per architect brief p2-f-flow-rule-brief.md.

Sprint: <sprint>
Task: P2-F2
AC: DoD step present / before RETURN block / includes exact sandbox command / RED = not done
```

**Goal mapping:** G12

---

### P2-F3 — QA reads flow file; confirms DoD step; counts 3-streak tasks

**Owner:** qa
**Goals:** G12
**Files touched:** none (verification only — evidence in handoff)

**AC:**
1. QA reads `.claude/flows/dev-technical-analysis/main.md` — confirms DoD step is present as specified in P2-F2
2. QA tracks 3 consecutive dev-technical-analysis task completions:
   - Task #1: QA-P1-closure-verification (2026-05-22) — already logged in pilot-status.json g12Streak
   - Task #2: P2-D3 (AI-fix for G10) — qualifies if sandbox evidence in handoff + flow step followed
   - Task #3: P2-E3 (regression fix for G11) — qualifies if sandbox evidence in handoff + flow step followed
3. For each of tasks #2 and #3: git log shows a sandbox-green commit before the DONE declaration
4. `pilot-status.json` `goals[G12].g12Streak.tasks` array updated with entries for tasks #2 and #3
5. `pilot-status.json` `goals[G12].status` updated to `"YES"` when 3 tasks confirmed

**Smoke check:**
```bash
jq '.goals[] | select(.id == "G12") | .g12Streak' docs/data/pilot-status.json
# Must show completed: 3, tasks: [{...}, {...}, {...}]
```

**Atomic commit format:**
```
chore(pilot): P2-F3 — G12 3-task streak confirmed; update pilot-status.json G12=YES

Tasks: QA-P1-closure, P2-D3, P2-E3. All three show sandbox-green evidence before DONE.
Flow rule verified present in dev-technical-analysis/main.md.

Sprint: <sprint>
Task: P2-F3
AC: flow file DoD step confirmed / 3-streak tasks logged / G12 = YES in pilot-status.json
```

**Goal mapping:** G12 (final confirmation)

---

## Sequencing Diagram (revised by architect)

```
Day 1
  P2-F1 (architect brief — shipped with this plan)
  P2-D0 (QA preflight — 10 min, can start immediately)
  P2-C  (PO async — starts immediately, no blocking)

Day 1-2
  P2-F2 (agent-father — 30 min; unblocks P2-D2 + P2-E2)
  P2-A1 (dev-ta — 30 min; parallel with P2-F2)
  P2-B0 (dev-ta — 20 min; parallel with P2-A1; pre-scan already done by architect)

Day 2-3
  P2-A2 (dev-ta — 20 min; after P2-A1)
  P2-B1 (dev-ta — 45 min; after P2-B0)

Day 3
  P2-A3 (qa — 15 min; after P2-A2 CI run)
  P2-B2 (dev-ta — 15 min; after P2-B1)
  P2-D1 (qa — 20 min; after P2-F2 + P2-D0)

Day 3-4
  P2-A4 (qa — 20 min; after P2-A3)
  P2-B3 (dev-ta — 15 min; after P2-B2)
  P2-D2 (qa — 15 min; after P2-D1)

Day 4-5
  P2-B4 (qa — 30 min; after P2-B3)
  P2-D3 (dev-ta — 1h; after P2-D2) ← G12 streak task #2
  P2-E1 (qa — 20 min; after P2-F2 + P2-D3 pattern visible)

Day 5-6
  P2-E2 (qa — 15 min; after P2-E1)
  P2-E3 (dev-ta — 1h; after P2-E2) ← G12 streak task #3

Day 6-7
  P2-F3 (qa — 10 min; after P2-D3 + P2-E3)
  G9 closes when user replies (async, PO-owned)
```

**Critical path:** P2-F2 → P2-D1 → P2-D2 → P2-D3 → P2-E1 → P2-E2 → P2-E3 → P2-F3 ≈ 3-4 days wall-clock

---

## P0-1 Bug-Inventory Status (verified by architect)

**Status: EXISTS — no P2-D0 creation work needed.**

`docs/data/bug-inventory.json` exists (created 2026-05-22T19:28:05Z). Contains 2 technical-analysis bugs. `baselineCycleCount` = 1.5 (TA-specific measured average). P2-D0 is a verification task only (10 min). No system-auditor preflight task required.

**Updated baseline for G10 evidence:** Agent must fix in ≤2 cycles vs TA baseline of 1.5 cycles (not the charter's 4-6 system-wide estimate — we have better data now).

---

## Go Smoke-Check Standard (all Go tasks)

All tasks touching Go source must pass before commit:

```bash
cd apps/technical-analysis
go test ./...          # all unit + integration tests green
go vet ./...           # zero warnings
golangci-lint run --config .golangci.yml   # zero fence violations (after P2-A1)
go build ./cmd/...     # binary compiles
go run ./cmd/sandbox -tier=primitive -module=technical-analysis -scenario=all
go run ./cmd/sandbox -tier=module -module=technical-analysis -scenario=all
# Both sandbox runs: all scenarios GREEN (G12 DoD)
```

---

## Goal Mapping

| Goal | Phase 2 task(s) | Outcome |
|---|---|---|
| G4 | P2-A1 → P2-A4 | golangci-lint fence config + CI job + deliberate-violation CI red/green proof |
| G5 | P2-B0 → P2-B4 | Old TS TA code quarantined in `_deprecated/`; all callers HTTP-routed to port 5003; find + grep = 0 results |
| G9 | P2-C (PO async) | User verbal YES recorded with timestamp; pilot-status.json G9 = YES |
| G10 | P2-D0 → P2-D3 | Bug injected in RSI primitive; dev-ta agent fixes in ≤2 cycles; all 30 scenarios GREEN |
| G11 | P2-E1 → P2-E3 | 1 observed case of scenario B flipping RED mid-fix; agent fixes B before declaring DONE |
| G12 | P2-F1 → P2-F3 | Flow rule inserted; 3-task streak confirmed (QA-P1 closure + P2-D3 + P2-E3) |

---

## Risks & Mitigations (updated by architect)

| Risk | Status | Mitigation |
|---|---|---|
| **R-1**: P0-1 bug-inventory.json missing | RESOLVED | File exists. TA baseline = 1.5 cycles. P2-D0 is 10-min verification only. |
| **R-2**: Go fence linter choice | RESOLVED | golangci-lint + depguard selected. Config spec in §Fence Linter Decision. |
| **R-3**: Deleting old TS TA code may break unknown callers | MITIGATED | P2-B0 brownfield scan + architect pre-scan confirms 3 files only. Tag `p2-b-pre-delete` before any deletion commit. HTTP client already wired in clients.ts. |
| **R-4**: Flow rule changes go via agent-father | ENCODED | P2-F1 (brief) → P2-F2 (agent-father implements). Architect never touches flow file directly. |
| **R-5**: User async-reply on G9 may take days | ACKNOWLEDGED | Phase 2 dev work decoupled. Decision matrix waits for G9 or uses charter §2-YES re-scope after >2 weeks. |
| **R-6**: G10 cycle count may exceed 2 | ACKNOWLEDGED | Acceptable. Triggers decision-matrix 2-YES re-scope branch. Not Phase 2 failure. |
| **R-7 (new)**: Fence-C depguard may block legitimate infrastructure imports in test files | MITIGATED | Add `"!**/*_test.go"` exclusion in Fence-C files list if needed. Developer evaluates at P2-A1. |
| **R-8 (new)**: Regression pair (P2-E) may not naturally trigger B → no G11 evidence | MITIGATED | Architect specified RSI/EMA shared helper as the coupling mechanism. If fix for A does not break B, QA redesigns P2-E1 before P2-E2 injection. Do not inject until canary coupling is confirmed. |

---

## What PM Owes After Architect Hands Off

1. Per-task handoff files `docs/handoffs/TASK_P2-A1.md` through `docs/handoffs/TASK_P2-F3.md` (20 files, copy AC + files-touched + smoke-check + commit format from Per-Task Spec above)
2. Update `docs/TASKS.md` Backlog with all Phase 2 tasks in priority order
3. Set `pilot-status.json.phase2.firstTaskReady` field
4. Notify main terminal that Phase 2 is READY-FOR-DISPATCH with first task: P2-F2 (agent-father) and P2-A1 (dev-technical-analysis) as parallel starters

---

## Sunk-Cost Note

None. Phase 2 builds entirely on Phase 1 Go service. No revert, no rework.

---

## Architect Sign-Off

**Architect expansion:** report-analyzer @ 2026-05-23
**Fence linter:** golangci-lint + depguard (choice locked — see §Fence Linter Decision)
**P0-1 status:** EXISTS — bug-inventory.json present, TA baseline 1.5 cycles
**P2-F brief:** `docs/architecture-briefs/2026-05-22-refactor/p2-f-flow-rule-brief.md` (authored alongside this plan)
**Next agent:** pm (create handoff files + update TASKS.md)
**First dev tasks to dispatch (parallel):** P2-F2 (agent-father) + P2-A1 (dev-technical-analysis)
