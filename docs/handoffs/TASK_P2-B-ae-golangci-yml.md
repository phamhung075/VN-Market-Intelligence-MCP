# TASK_P2-B-ae-golangci-yml.md

**Task ID:** P2-B  
**Pilot:** alert-engine (fleet pilot 5)  
**Phase:** 2  
**Owner:** dev-alert-engine  
**Status:** SEQUENCED  
**Blocked by:** P2-A DONE (alert-engine-pre-ci tag confirmed)  
**Blocks:** P2-C (G4 deliberate-violation proof)  
**Estimated:** 1h  
**AC count:** 5

---

## Context

This is the CONFIG + CI-WIRING task for G4 (architecture fence enforcement). alert-engine is Go,
using depguard via golangci-lint — the same proven path as stock-price, technical-analysis, and
macro-indicators.

**CRITICAL FRAMING:** P2-B creates the `.golangci.yml` config and wires the CI job. A clean lint run
(golangci-lint exit 0) is NOT by itself proof that the fence enforces — that proof comes in the
SEPARATE task P2-C, where QA will deliberately violate Fence-A and confirm the linter catches it
(non-zero exit). A green run on clean source does not prove the fence works. This task delivers the
config; P2-C delivers the proof. Make that explicit in your evidence so you don't conflate the two.

---

## Files to Create / Modify

- `apps/alert-engine/.golangci.yml` — **CREATE** (new file)
- `.github/workflows/ci.yml` — **MODIFY** (add alert-engine-go-lint job; OR document offline proof if CI billing block persists)

---

## Acceptance Criteria (Transcribed Verbatim from Phase-2 Plan §P2-B)

**AC-1:** `apps/alert-engine/.golangci.yml` exists and contains THREE named depguard rules: `fence-a`,
`fence-b`, `fence-c` — matching the spec below. Config is ≤80 lines.

**AC-2:** `cd apps/alert-engine && golangci-lint run` exits 0 on the CURRENT Phase-1 codebase
(no fence violations exist in existing primitives, module, or sandbox — they are already stdlib-only/domain-only).
Evidence pasted to handoff section below.

**AC-3:** `.github/workflows/ci.yml` includes a job named `alert-engine-go-lint` with
`working-directory: apps/alert-engine` — OR offline proof documented if CI billing block persists.
Evidence:
```bash
grep -n "alert-engine-go-lint\|alert-engine" .github/workflows/ci.yml
```
Returns ≥1 match, OR offline-proof paragraph appears in handoff.

**AC-4:** `git log --oneline apps/alert-engine/.golangci.yml` shows ONLY P2-B as the most recent
commit on that file (establishes the freeze anchor path for AC-4c in P2-D).

**AC-5 — G12 DoD gate:**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
Exits 0. Paste output summary to handoff doc (≥11 scenarios PASS).

---

## `.golangci.yml` Spec (Create file at `apps/alert-engine/.golangci.yml`)

```yaml
run:
  timeout: 120s

linters:
  enable:
    - depguard

linters-settings:
  depguard:
    rules:
      fence-a:
        # Fence-A: pkg/primitive/ must not import application, infrastructure,
        # interface, mattn/go-sqlite3, or any Telegram client package.
        files:
          - "**/pkg/primitive/**/*.go"
        deny:
          - pkg: "github.com/vn-market-intelligence/alert-engine/pkg/application"
            desc: "Fence-A: primitive must not import application layer"
          - pkg: "github.com/vn-market-intelligence/alert-engine/pkg/infrastructure"
            desc: "Fence-A: primitive must not import infrastructure layer"
          - pkg: "github.com/vn-market-intelligence/alert-engine/pkg/interface"
            desc: "Fence-A: primitive must not import interface layer"
          - pkg: "github.com/mattn/go-sqlite3"
            desc: "Fence-A: primitive must not import mattn/go-sqlite3 (CGO)"
      fence-b:
        # Fence-B: pkg/module/ must not import infrastructure, mattn/go-sqlite3,
        # or any Telegram client. Domain and primitive imports are allowed.
        files:
          - "**/pkg/module/**/*.go"
        deny:
          - pkg: "github.com/vn-market-intelligence/alert-engine/pkg/infrastructure"
            desc: "Fence-B: module must not import infrastructure layer"
          - pkg: "github.com/mattn/go-sqlite3"
            desc: "Fence-B: module must not import mattn/go-sqlite3 (CGO)"
      fence-c:
        # Fence-C: mattn/go-sqlite3 + TelegramClient (infra) importable ONLY
        # from cmd/server/main.go. All other Go files are barred.
        files:
          - "!**/cmd/server/main.go"
          - "!**/*_test.go"
          - "**/*.go"
        deny:
          - pkg: "github.com/mattn/go-sqlite3"
            desc: "Fence-C: mattn/go-sqlite3 only importable from cmd/server/main.go"
```

---

## CI Job Spec (Add to `.github/workflows/ci.yml` if file exists)

```yaml
alert-engine-go-lint:
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: apps/alert-engine
  steps:
    - uses: actions/checkout@v4
    - uses: golangci/golangci-lint-action@v6
      with:
        version: latest
        working-directory: apps/alert-engine
```

If CI billing block prevents workflow changes, offline proof (golangci-lint run locally) is the equivalent.

---

## Evidence — AC-1 through AC-5

### AC-1: Config file exists with three named rules

[TO BE FILLED BY DEV: paste output of]
```bash
cat apps/alert-engine/.golangci.yml | head -30
```
[Also run: `wc -l apps/alert-engine/.golangci.yml` to confirm ≤80 lines]

---

### AC-2: golangci-lint exits 0 on Phase-1 codebase (CONFIG PROOF, NOT FENCE-PROOF)

[TO BE FILLED BY DEV: paste full output of]
```bash
cd apps/alert-engine && golangci-lint run
```
[Must exit 0. This proves the config is syntactically valid and the CURRENT Phase-1 code is clean.
This is NOT proof that the fence ENFORCES — that proof comes in P2-C (deliberate violation test).]

---

### AC-3: CI job wired OR offline proof documented

[TO BE FILLED BY DEV: either]
- Paste output of `grep -n "alert-engine-go-lint\|alert-engine" .github/workflows/ci.yml`
- OR document "Offline proof: golangci-lint run locally on every P2 task validates fence per AC-2 equivalent"

---

### AC-4: Freeze anchor established

[TO BE FILLED BY DEV: paste output of]
```bash
git log --oneline apps/alert-engine/.golangci.yml
```
[First line must show P2-B commit. This is the freeze anchor for P2-D AC-4c re-confirmation.]

---

### AC-5: G12 DoD gate — sandbox all-green

[TO BE FILLED BY DEV: paste output of]
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```
[Must exit 0 with ≥11 scenarios PASS (9 primitives + 2 module). Baseline from Phase 1 must not regress.]

---

## Commit Subject Pattern

```
feat(alert-engine): P2-B — .golangci.yml Fence-A/B/C + CI go-lint job (G4 partial)
```

---

## G-Goal Posture

**NO goal flips.** G4 advances but does NOT flip to YES in this task. Per charter §4.5, only PO
flips goals at 12/12 terminal Phase-3 atomic close. `goalsEarned` stays 0. `decisionMatrix` stays
all-TBD.

---

## Notes for Dev

- This task is CONFIG + CI infrastructure only. No production code changes.
- The `.golangci.yml` config creation is mandatory. It establishes the three Fence rules.
- A clean lint run (golangci-lint exit 0) proves the config is valid and the codebase is compliant.
  It is NOT proof that the fence will catch a violation. That proof is P2-C (inject + verify non-zero).
- Save time: use `golangci-lint run` with the config in place to confirm AC-2 and AC-4 in parallel.
- If `.github/workflows/ci.yml` does not exist or CI billing is blocked, offline proof is acceptable:
  document that golangci-lint will be run locally before each commit.

---

## Next Task After DONE

**P2-C** (dev-alert-engine + qa): G4 deliberate-violation proof. QA will inject a Fence-A violation
and confirm the linter exits non-zero + catches it + reverts clean.

---

## Task Dispatch Signal

Signal file: `docs/signals/pm-alert-engine-P2-B-ready-<UTC>.json`  
Content: `{ task: "P2-B", status: "SEQUENCED", owner: "dev-alert-engine", ac_list: [AC-1, AC-2, AC-3, AC-4, AC-5], next_actor: "dev-alert-engine", next_phase: "config + CI wiring", blocks: "P2-C" }`

---
