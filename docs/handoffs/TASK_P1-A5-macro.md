---
title: "TASK_P1-A5: api/openapi.yaml — HTTP Contract Spec"
date: "2026-05-23"
pilot: "macro-indicators"
phase: "1"
task_id: "P1-A5"
owner: "dev-macro-indicators"
estimate: "~15 minutes"
ac_count: 4
goals: ["G3"]
depends_on: "P1-A4 (pkg/ DDD scaffold)"
blocks: ["P1-B1 (first primitive macro-investment-clock)"]
status: "READY-FOR-DISPATCH"
phase_plan_ref: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md §P1-A5"
---

# TASK_P1-A5 — `api/openapi.yaml` HTTP Contract Spec

**Task context:** P1-A5 is the fourth task in Phase 1 A-bucket (composition root scaffolding). It creates the HTTP contract specification that governs the microservice's externally-facing endpoints.

**Owner:** dev-macro-indicators (single agent, WIP=1 enforced)

**Estimate:** 15 minutes (scaffold-only, specification file)

**Acceptance Criteria:** 4 (per phase-1-task-plan-go.md §P1-A5)

**Blocks:** P1-B1 (first primitive requires smoke gate confirming build + vet + openapi file existence)

---

## Acceptance Criteria

### AC-1: Valid OpenAPI 3.0 Document

Create `apps/macro-indicators/api/openapi.yaml` as a valid OpenAPI 3.0.x specification.

Verify with Python (installed on all dev systems):
```bash
python3 -c "import yaml; yaml.safe_load(open('apps/macro-indicators/api/openapi.yaml'))" && echo "VALID_YAML" || echo "PARSE_ERROR"
```

Expected: exit 0, "VALID_YAML" printed.

### AC-2: GET /health Endpoint Documented

Document the `/health` endpoint returning a JSON object:
```json
{
  "status": "ok",
  "service": "macro-indicators",
  "port": 5004
}
```

Schema section of GET /health must include field definitions for `status` (string), `service` (string), `port` (integer).

### AC-3: POST /snapshot Endpoint Documented

Document the `/snapshot` endpoint with:
- **Request body:** empty JSON object `{}`
- **Response body:** MacroSnapshotResponse fields:
  - `vnIndex` (number)
  - `oilUsd` (number)
  - `goldUsd` (number)
  - `usdVnd` (number)
  - `signals` (object — structure TBD, Phase 2 extension)
  - `fetchedAt` (string, RFC3339 timestamp)

### AC-4: File Exists and Path is Canonical

Verify file presence:
```bash
test -f apps/macro-indicators/api/openapi.yaml && echo "PASS" || echo "FAIL"
```

Expected: exit 0, "PASS" printed.

---

## Implementation Guidance

**File path:** `apps/macro-indicators/api/openapi.yaml`

**Language/format:** YAML (standard OpenAPI 3.0 syntax)

**Baseline patterns:**

Clone OpenAPI structure from TA pilot if available. Required sections:
- `openapi: 3.0.0`
- `info: { title, version, description }`
- `servers: [ { url, description } ]` (localhost:5004 primary)
- `paths: { /health, /snapshot }`
- `components: { schemas: { MacroSnapshotResponse, ... } }`

**Size estimate:** 80–120 YAML lines (typical for 2-endpoint contract).

**Next smoke gate:** At P1-A5 completion, CI will run:
```bash
cd apps/macro-indicators
go build ./...        # binary builds
go vet ./...          # zero warnings
test -f api/openapi.yaml && echo "openapi: PASS"
grep -c "scoreIndicator\|buildSnapshot\|oilDirection" cmd/server/main.go
# Expected: 0 (no business logic leak)
```

---

## Constraints

**L84 explicit-file staging:** Only 1 file touched.
```bash
git add apps/macro-indicators/api/openapi.yaml
```

No `git add -A` or `git add .`

**No --force, no --no-verify, no --no-gpg-sign**

**Anchor discipline:** Anchor 1776df8e is immutable (TA reference commit). Do not retag, do not rewrite history.

**No git push** (all work local-only; user owns push decision)

---

## Forward Risks & Next-Task Warnings

### R-1 (HIGH) — Math.random() Deterministic Scoring Requirement

**Binding on:** P1-B1 AC-6 (deterministic scoring check in macro-investment-clock primitive)

**Forward warning:** After P1-A5 completes, PM will include explicit R-1 deterministic-scoring reminder in P1-B1 handoff. Dev-macro-indicators must implement `macro-investment-clock` with **deterministic tier lookup** (no Math.random(), no rand.Intn()):

```go
// CORRECT: deterministic tier scoring
const (
  VN_DIRECT = 8      // Fixed score, not 8+random
  REGIONAL = 5       // Fixed score
  US_DOMESTIC = 2    // Fixed score
)
```

AC-6 of P1-B1 includes explicit grep guard:
```bash
grep -c "Math.random\|rand.Intn\|rand.Float" pkg/primitive/macro_investment_clock/*.go
# Must return 0
```

### R-3 (HIGH) — MCP Tool Rewire Phase 2 Scope

**Binding on:** Phase 2 P2-B (4 MCP tools bypass HTTP currently)

**Phase 2 expansion note:** Four MCP tools currently call macro-indicators domain functions via direct imports in mcp-server (apps/mcp-server/src/interface/mcp/tools/macro/):
- `get_macro_snapshot`
- `get_carry_trade_signal`
- `get_yield_spread_signal`
- `get_macro_calendar`

Phase 2 P2-B spec MUST explicitly include mcp-server tool handler rewire — NOT just apps/macro-indicators/ git mv. When apps/macro-indicators moves to Go service at port 5004, all 4 tools must HTTP-route to that service instead of direct domain imports.

This is noted for architect attention at Phase 1 close gate (when Phase 2 task plan expands).

---

## Smoke Gate (End of A-Bucket)

Before marking P1-A5 DONE, run:

```bash
cd apps/macro-indicators
go build ./...        # No compile errors
go vet ./...          # No warnings
test -f api/openapi.yaml && echo "openapi: PASS"
grep -c "scoreIndicator\|buildSnapshot\|oilDirection" cmd/server/main.go
# Expected: 0 (no business logic in composition root)
```

All four checks must PASS before RETURN block.

---

## Commit Message Template

```
feat(macro-indicators): P1-A5 — api/openapi.yaml HTTP contract

Advances G3 (Microservice has clean composition root) per pilot-charter.md v2.0.

- apps/macro-indicators/api/openapi.yaml (NEW — OpenAPI 3.0 spec)

Endpoints:
- GET /health → {status, service, port}
- POST /snapshot → {vnIndex, oilUsd, goldUsd, usdVnd, signals, fetchedAt}

AC-1..AC-4 PASS (valid YAML, both endpoints documented, file exists).

Smoke gate end-of-A-bucket: go build ✓, go vet ✓, openapi.yaml ✓, 
grep scoreIndicator/buildSnapshot/oilDirection = 0 ✓
```

---

## Dependencies & Unblocking

**Blocked by:** P1-A4 (pkg/ DDD scaffold must compile before openapi.yaml can be validated in smoke gate)

**Unblocks:** P1-B1 (first primitive; smoke gate at P1-A5 close ensures build environment is clean)

---

## G12 DoD Gate Rule

**This task does NOT trigger G12 DoD Gate.**

G12 gate (sandbox must be green before task DONE) activates from P1-B1 onward (first primitive).

P1-A5 is scaffold-only specification file — no sandbox execution required.

---

## RETURN Block Template

When P1-A5 is DONE, dev-macro-indicators signs off:

```
## RETURN: P1-A5 COMPLETE

### AC Results
- AC-1: Valid OpenAPI 3.0 ✓ (python3 yaml.safe_load passes)
- AC-2: GET /health documented ✓ (status, service, port fields present)
- AC-3: POST /snapshot documented ✓ (vnIndex, oilUsd, goldUsd, usdVnd, signals, fetchedAt fields present)
- AC-4: File exists at canonical path ✓ (test -f returns 0)

### Smoke Gate Results
- go build ./... : [PASS/FAIL]
- go vet ./... : [PASS/FAIL]
- api/openapi.yaml exists : PASS
- grep scoreIndicator/buildSnapshot/oilDirection = 0 : PASS

### Commits
- [COMMIT_SHA_1] P1-A5 implementation

### Deviations
[List any deviations or notes. None expected for specification-only task.]

### Next Task Unblocked
P1-B1 (first primitive: macro-investment-clock). Ready for dispatch after QA approval.

### R-1 Forward Warning
R-1 (deterministic scoring) is live in P1-B1 AC-6. Explicit grep guard for Math.random/rand.Intn/rand.Float must return 0.
```

---

## Knowledge & References

**Phase 1 Task Plan:**
- File: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md`
- Section: §P1-A5

**Pilot Charter:**
- File: `docs/architecture-briefs/2026-05-23-macro-indicators-factory/pilot-charter.md`
- Reference: G3 definition, L84 constraint

**TA Pilot Reference (Anchor 1776df8e):**
- Pattern: TA's `apps/technical-analysis/api/openapi.yaml` (if available for structural cloning)

**Depguard Fence Docs:**
- Reference: docs/standards/mcp-tools.md (imports hygiene — informational only, not binding on this task)

---

## Notes for Dev-Macro-Indicators

1. **P1-A5 is the final A-bucket task** — after DONE + QA approval, P1-B1 (first primitive) becomes immediately unblocked.

2. **Smoke gate runs automatically at end** — all 4 checks must pass. If any fail, do not sign off. Fix and retry in same cycle (no new cycle created unless external blocker).

3. **R-1 forward warning is critical** — P1-B1 AC-6 includes explicit deterministic scoring check. Start thinking about Go tier lookup logic now.

4. **Open questions from phase plan:**
   - **OQ-5:** chi version pin at v5.2.1 — confirmed at anchor 1776df8e. Use same version.
   - **No new OQ for P1-A5** — specification file is straightforward.

---

## Signals & Handoff Lifecycle

**Dispatch signal:** `docs/signals/pm-dispatch-dev-macro-p1-a5-<UTC>.json` (created by PM)

**Completion signal format:** `docs/signals/dev-macro-p1-a5-done-<UTC>.json`

**QA signal format:** `docs/signals/qa-macro-p1-a5-green-<UTC>.json`

Upon DONE + QA GREEN, PM closes P1-A5 in SSOT and dispatches P1-B1.

---

**Author:** PM (cycle-34, 2026-05-23T10:43:27Z)
**Phase 1 Task Plan Reference:** PHASE0-D5 (doc location)
**Pilot Status SSOT:** docs/data/pilot-status-macro-indicators.json (updated on close)
