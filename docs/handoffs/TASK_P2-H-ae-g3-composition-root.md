---
task_id: "P2-H"
task_title: "G3 — Composition Root Rewire to alert_pipeline Module + OpenAPI Contract"
pilot: "alert-engine"
phase: "2"
charter_ref: "docs/architecture-briefs/2026-05-24-alert-engine-factory/pilot-charter.md"
plan_ref: "docs/architecture-briefs/2026-05-24-alert-engine-factory/phase-2-task-plan-go.md §P2-H"
ssot_ref: "docs/data/pilot-status-alert-engine.json"
owner: "dev-alert-engine"
blocked_by: "P2-G"
blocks: "P2-I"
status: "READY"
sequenced_at: "2026-05-24T073600Z"
sequenced_by: "pm"
---

# TASK P2-H — G3: Composition Root Rewire to `alert_pipeline` Module + OpenAPI Contract

## Context

Phase 2 G3 goal requires the composition root (`cmd/server/main.go`) to be a pure wiring file with NO business logic, NO domain calculations, and full HTTP contract documentation via OpenAPI YAML.

**Current state:** `cmd/server/main.go` is 95 lines and already wires infra ports cleanly. Phase-2 rewires the use case to delegate through the `alert_pipeline` module, so business-logic references to `ComputeFingerprint` / `IsDuplicate` / `ShouldSuppressAlert` are no longer in the application layer (they moved to primitives + module in Phase 1).

**Phase 2 target:** Composition root remains ≤120 lines; wires module as primary orchestrator; infra adapters (`mattn/go-sqlite3`, `TelegramClient`) stay wired at composition root per Fence-C.

## Files Touched

- `apps/alert-engine/cmd/server/main.go` (MODIFY — wire `alert_pipeline` module; confirm port 5006 from env-var, NOT hardcoded; infra impls remain here)
- `apps/alert-engine/api/openapi.yaml` (CREATE — OpenAPI contract for all HTTP endpoints)

---

## Acceptance Criteria

### AC-1 — Zero Domain-Operation References in Composition Root

**Command:**
```bash
grep -c "ComputeFingerprint\|IsDuplicate\|ShouldSuppressAlert\|joinSignalTypes\|isToday\|djb2Hash" \
  apps/alert-engine/cmd/server/main.go
```

**Verdict:** Must return 0. Logic lives in primitives/module, not the composition root.

**Evidence:**
```
[Paste grep result here]
```

---

### AC-2 — `alert_pipeline` Module Wired at Composition Root

**Command:**
```bash
grep -n "alert_pipeline\|alertpipeline\|AlertPipeline" apps/alert-engine/cmd/server/main.go
```

**Verdict:** Must return ≥1 match (the module is instantiated/wired here — with the infra adapters injected as port implementations satisfying `AlertRepositoryPort`, `MutePort`, `TelegramPort`).

**Evidence:**
```
[Paste grep result here]
```

---

### AC-3 — Infra Adapters Still Injected at Composition Root (Fence-C Confirmed)

**Command:**
```bash
grep -n "infrastructure\|SQLite\|mattn\|Telegram" apps/alert-engine/cmd/server/main.go
```

**Verdict:** Must return ≥1 match per infra adapter (CGO SQLite repo + TelegramClient both wired here).

**Evidence:**
```
[Paste grep result here]
```

---

### AC-4 — OpenAPI Contract Exists and Covers Live Endpoints

**Command:**
```bash
test -f apps/alert-engine/api/openapi.yaml && echo FOUND
```

**Verdict:** Echoes FOUND. The YAML must document at minimum:
- `GET /health` → `{ status, service, port }`
- `POST /evaluate` → request: `EvaluateAlertRequest` shape, response: `EvaluateAlertResponse` shape
- Any other live endpoints (mute management, etc. — dev-alert-engine discovers from `pkg/interface/http/router.go`)

**Validation:**
```bash
python3 -c "import sys,yaml; yaml.safe_load(sys.stdin)" < apps/alert-engine/api/openapi.yaml
```
Must exit 0.

**Evidence:**
```
[Paste test result and yaml validation result here]
```

---

### AC-5 — Build + Lint Still Clean

**Command:**
```bash
cd apps/alert-engine && go build ./... && golangci-lint run
```

**Verdict:** Both exit 0.

**Evidence:**
```
[Paste build output (no errors) and lint output (exit 0) here]
```

---

### AC-6 — Composition Root ≤120 Lines

**Command:**
```bash
wc -l apps/alert-engine/cmd/server/main.go
```

**Verdict:** Must return ≤120. If it exceeds 120 lines, extract DI wiring into `cmd/server/wire.go` (pure wiring helper, no business logic).

**Evidence:**
```
[Paste line count here]
```

---

### AC-7 — G12 DoD Gate

**Command:**
```bash
cd apps/alert-engine && CGO_ENABLED=0 go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all
```

**Verdict:** Exits 0. ≥11 scenarios PASS.

**Evidence:**
```
[Paste sandbox output summary here: total scenarios, pass count, fail count, exit code]
```

---

## Commit Subject Pattern

```
feat(alert-engine): P2-H — composition root rewire to alert_pipeline module + OpenAPI contract (G3)
```

---

## G-Goal Posture

**NO goal flips.** G3 advances but does NOT flip to YES in this task. §4.5 SSOT untouched.
- `goalsEarned` stays 0
- `decisionMatrix` all fields stay TBD

---

## Exact File Paths (L84 Explicit Staging)

Stage these files ONLY after all ACs verified PASS:
```
apps/alert-engine/cmd/server/main.go
apps/alert-engine/api/openapi.yaml
[docs/handoffs/TASK_P2-H-ae-g3-composition-root.md if updating this file]
[docs/signals/dev-ae-P2-H-done-<UTC>.json for completion signal]
```

**CRITICAL:** Use explicit `git add <path>` per file. NEVER `git add -A` or `git add .` per L84.

---

## Next Steps After DONE

1. Emit signal: `docs/signals/dev-ae-P2-H-done-<UTC>.json` with AC verdicts + file paths + `next_actor=pm`
2. PM marks P2-H DONE in SSOT, sequences P2-I
3. Dev-alert-engine receives P2-I handoff from PM

---

## Appendix: OpenAPI YAML Structure Template

If discovered endpoints differ from minimum, adapt the template accordingly:

```yaml
openapi: 3.0.0
info:
  title: alert-engine
  version: "1.0.0"
  description: "Alert pipeline microservice (port 5006)"
servers:
  - url: http://localhost:5006
    description: "Local alert-engine server"
paths:
  /health:
    get:
      summary: "Health check"
      responses:
        '200':
          description: "Service health status"
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: "healthy"
                  service:
                    type: string
                    example: "alert-engine"
                  port:
                    type: integer
                    example: 5006
  /evaluate:
    post:
      summary: "Evaluate alert pipeline"
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/EvaluateAlertRequest'
      responses:
        '200':
          description: "Alert evaluation result"
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/EvaluateAlertResponse'
components:
  schemas:
    EvaluateAlertRequest:
      type: object
      required:
        - signal
      properties:
        signal:
          type: object
          description: "Signal data"
    EvaluateAlertResponse:
      type: object
      required:
        - evaluate
      properties:
        evaluate:
          type: object
          description: "Evaluation result"
```

Adjust endpoint paths/schemas based on actual `pkg/interface/http/router.go` implementation.
