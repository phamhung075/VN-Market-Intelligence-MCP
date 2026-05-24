---
sprint: P1-AE-B1
branch: task/P1-B1-signal-classifier
size: M
zone: apps/alert-engine/
depends_on: [P1-A]
blocks: [P1-B2]
---

## TLDR

Extract the first primitive `signal-classifier` from existing domain logic (severity→AlertSeverity+channel routing). Build 3 scenario JSONs (golden/edge/failure). Add ZERO-CREDS + Fence-A gate verification. This task marks G12 DoD streak #1.

## [PM] Planning Context

**Owner:** dev-alert-engine

**Blocked by:** P1-A DONE (2026-05-24T052327Z commit `0637c9d3`)

**Charter reference:** `docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md` §P1-B1

**Zone:** apps/alert-engine/

**Acceptance Criteria:**

- [x] AC-1: `pkg/primitive/signal-classifier/classifier.go` exports `ClassifyResult` struct + `Classify(severityStr string) ClassifyResult` function. Channel routing matches `pkg/application/evaluate.go` L126-130 exactly (critical→market, high→market, medium/low→work).
- [x] AC-2: Unit test with `go test`, ≥5 test cases: "high"→ChannelMarket+Valid, "critical"→ChannelMarket+Valid, "low"→ChannelWork+Valid, "medium"→ChannelWork+Valid, "INVALID"→Valid=false.
- [x] AC-3: `cd apps/alert-engine && go test ./pkg/primitive/signal-classifier/` exits 0.
- [x] AC-4 (Fence-A gate): Zero infra/CGO imports in primitive:
  ```bash
  grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|pkg/application\|pkg/interface\|TELEGRAM\|BOT_TOKEN" apps/alert-engine/pkg/primitive/signal-classifier/
  ```
  Must return 0. Paste output (or confirmation of empty).
- [x] AC-5 (G12 DoD Gate streak #1 — sandbox green):
  ```bash
  cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
  ```
  Exits 0. All 3 signal-classifier scenarios PASS. Paste output to evidence section below.
- [x] AC-6 (ZERO-CREDS sub-gate-2 scenario grep): Zero credential-shaped fields in scenario JSONs:
  ```bash
  grep -rniE "token|chat_id|bot|secret|api_key|password" \
    docs/scenarios/alert-engine/primitives/signal-classifier-golden.json \
    docs/scenarios/alert-engine/primitives/signal-classifier-edge.json \
    docs/scenarios/alert-engine/primitives/signal-classifier-failure.json
  ```
  Must return 0. Paste output.
- [x] AC-7 (ZERO-CREDS sub-gate-3 CGO build): `cd apps/alert-engine && CGO_ENABLED=0 go build -o ./bin/ae-sandbox ./cmd/sandbox/` exits 0 after adding primitive. No new CGO imports. Paste build output.
- [x] AC-8 (G12 DoD Gate — sandbox all-green before RETURN block): Evidence: AC-5 output pasted below. Sandbox runs all 3 signal-classifier scenarios with pass/fail summary.

**Files to read first:**
- `apps/alert-engine/pkg/domain/models.go` (AlertSeverity type + constants, IsValid method)
- `apps/alert-engine/pkg/application/evaluate.go` L126-130 (inlined channel routing to extract)
- `docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-1-task-plan-go.md` §P1-B1 (full AC spec + djb2 pattern)

**Files to create:**
- `apps/alert-engine/pkg/primitive/signal-classifier/classifier.go` — Classify function + ClassifyResult struct
- `apps/alert-engine/pkg/primitive/signal-classifier/classifier_test.go` — ≥5 test cases
- `docs/scenarios/alert-engine/primitives/signal-classifier-golden.json` — severity="high" → valid+channel="market"
- `docs/scenarios/alert-engine/primitives/signal-classifier-edge.json` — severity="low" → valid+channel="work"
- `docs/scenarios/alert-engine/primitives/signal-classifier-failure.json` — severity="INVALID" → valid=false

**Files to modify:**
- None (P1-A scaffolded sandbox; P1-B1 adds only new primitive package)

**Dependencies:**
- P1-A: cmd/sandbox/main.go scaffold (DONE)
- Blocks P1-B2 (dedup-key-builder primitive)

**Knowledge needed:**
- `docs/policies/dev-standards.md` (DDD layer discipline, fence rules)
- `docs/protocols/fail-loud-protocol.md` (error handling + tracing)
- Charter §ZERO-CREDS Boundary Clause (mandatory alert-engine G7 gate)
- `docs/standards/mcp-tools.md` (scenario JSON structure pattern)

**Hard gates:**
- AC-4 (Fence-A clean: zero infra imports) MUST PASS before dev claims task done.
- AC-6 (ZERO-CREDS scenario JSON) MUST PASS before P1-B2 dispatch.
- AC-5 (sandbox all-green) MUST PASS and evidence pasted before RETURN block.

---

## Evidence Section (to be filled by dev-alert-engine)

### AC-4 (Fence-A grep output)
```
grep_exit=1 (no output — 0 matches)
Command: grep -rn "mattn/go-sqlite3\|pkg/infrastructure\|pkg/application\|pkg/interface\|TELEGRAM\|BOT_TOKEN" apps/alert-engine/pkg/primitive/signal-classifier/
Result: PASS
```

### AC-5 (G12 DoD — Sandbox all-green trace)
```
{"time":"2026-05-24T07:29:35.061377+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-edge.json"}
{"time":"2026-05-24T07:29:35.061588+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-failure.json"}
{"time":"2026-05-24T07:29:35.061652+02:00","level":"INFO","msg":"PASS","scenario":"signal-classifier-golden.json"}
total=3 pass=3 fail=0 status=OK
sandbox_exit=0
Command: cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
Result: PASS (G12 DoD streak #1)
```

### AC-6 (ZERO-CREDS scenario grep output)
```
grep_exit=1 (no output — 0 matches)
Command: grep -rniE "token|chat_id|bot|secret|api_key|password" docs/scenarios/alert-engine/primitives/signal-classifier-*.json
Result: PASS
```

### AC-7 (CGO_ENABLED=0 build output)
```
build_exit=0 (no output — clean build)
Command: cd apps/alert-engine && CGO_ENABLED=0 go build -o ./bin/ae-sandbox ./cmd/sandbox/
Result: PASS
```

---

## Notes for dev-alert-engine

1. **Severity→Channel mapping** (from evaluate.go L126-130):
   - Critical OR High → Market channel
   - Medium OR Low → Work channel
   - Bug channel (infrastructure-side routing only, NOT in primitive)

2. **AlertSeverity type decision**: You may import `pkg/domain` types (Fence-A permits same-service domain imports). If importing keeps the primitive clean, do so. Otherwise, re-declare tiny constants inline. Document the decision in git commit message.

3. **Scenario JSON format**: Follow the pattern in `docs/standards/mcp-tools.md`. Each file: `{"input": {...}, "expected": {...}}`.

4. **Sandbox integration**: P1-A scaffold already runs `cmd/sandbox`. P1-B1 adds the first 3 signal-classifier JSON files to `docs/scenarios/alert-engine/primitives/`. The sandbox loads them automatically via `-tier=primitive -scenario=all`.

5. **G12 DoD Gate**: This is the first of 3 consecutive tasks that must prove sandbox-green-before-RETURN (streak #1). Sandbox run output MUST be pasted into AC-5 evidence section before you write the final RETURN block.

6. **Next task blocked**: P1-B2 (dedup-key-builder) cannot be dispatched until this task completes AND AC-4 + AC-6 gates pass.

---

## Commit Convention

Subject line (from charter §Per-Task Acceptance Criteria):
```
feat(alert-engine): P1-B1 — signal-classifier primitive + 3 scenarios (G1, ZERO-CREDS gate)
```

Commit trailers (from `docs/policies/commit-convention.md`):
```
Task: P1-AE-B1
AC: 1, 2, 3, 4, 5, 6, 7, 8 (list or paste from acceptance criteria above)
G-goal: G1, G7, G12 (track A — Trust Foundation; track B — Sandbox; track C — AI-fixability)
```

---

## QA Verification (P1-G close-gate)

QA will re-run:
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=primitive -module=alert-engine -scenario=all
```

Verify:
- All signal-classifier scenarios pass (golden, edge, failure).
- Sandbox exit code = 0.
- Fence-A grep returns 0 (zero infra imports).
- ZERO-CREDS scenario grep returns 0 (no token/chat_id/etc).

---

**PM note:** P1-B1 is the first primitive of the core-3 band. Completes G1 increment and proves G12 DoD streak #1 (sandbox-green-before-RETURN rule). After this task, dispatch P1-B2 (dedup-key-builder).
