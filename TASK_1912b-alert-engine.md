# TASK_1912b-alert-engine — Go Migration (Phase 2)

**Task ID:** 1912b-alert-engine
**Sprint:** 1912-go-migration-program
**Branch:** `task/1912b-alert-engine`
**Owner:** dev-alert-engine
**Zone:** `apps/alert-engine/`
**Status:** IN PROGRESS

---

## Pointers

**Full AC spec:** `docs/REQ_1912b.md` (16 ACs: AC-1..AC-16)

**Architecture brief:** `docs/architecture-briefs/2026-05-14-go-migration-3-services.md`
  - §3.3 — DDD layer Go map (8 packages: domain/errors/services/ports/sqlite/telegram/config/handlers)
  - §5 P2 — Rationale + rollback (alert_engine.db isolated, schema fwd-compat CREATE TABLE IF NOT EXISTS)
  - §6 — Effort 8h best/14h likely/20h worst
  - §8 R5 — Dedup/cooldown semantic drift mitigation: author Go tests BEFORE impl

**Phase 1 precedent:** `apps/api-gateway/` (Phase 1 SHIPPED c106 — Go cutover complete)
  - DDD folder layout: `cmd/server/main.go` + `pkg/{domain,application,infrastructure,interface/http}/`
  - Dockerfile multi-stage CGO pattern: Lines 1–25 (shows optional CGO flag; alert-engine REQUIRES CGO for mattn/go-sqlite3)

---

## Go Rewrite Scope

**TS source:** `apps/alert-engine/src/` — 1289 LOC across 12 files + tests
  - `domain/`: models, errors, services, repositories (ports)
  - `infrastructure/`: sqlite repos, telegram client, config loader
  - `application/`: evaluate usecase + DTOs
  - `interface/`: Hono handlers

**Go target:** `apps/alert-engine/` (green-field, same path)
  - `cmd/server/main.go` — port 5006, graceful shutdown SIGINT/SIGTERM
  - `pkg/domain/{models,errors,services,ports}.go` — pure logic, no I/O
  - `pkg/infrastructure/{sqlite,telegram,config}.go` — database/sql + net/http
  - `pkg/application/{evaluate,dtos}.go` — use case orchestration
  - `pkg/interface/http/router.go` — POST /evaluate, GET /health

**DB invariant:** `alert_engine.db` is the sole write target. Schema:
  - `alert_engine_records` (AC-11 outcome columns: outcome, outcome_at, outcome_detail)
  - `alert_mutes`
  - Run idempotent DDL CREATE TABLE IF NOT EXISTS at startup

---

## Verify-Call-Site Checklist (BEFORE TDD impl)

**[VERIFY-CALL-SITE] D-1: EvaluateAlertResponse shape mismatch**
  - Read `apps/alert-engine/src/application/dtos.ts` — `EvaluateAlertResponse` internal shape
  - Read `apps/mcp-server/src/infrastructure/microservices/clients.ts` — `AlertEvaluateResponse` consumer shape
  - Confirm which fields clients.ts actually reads at call site (likely `fired` + `reason` only)
  - Port byte-identical JSON in Go handler response (satisfy both DTO + caller contract)

**[VERIFY-CALL-SITE] D-2: Scheduler job call path**
  - Read `apps/mcp-server/src/scheduler/taAlertScanJob.ts` — does it POST to alert-engine or write directly to market.db?
  - Read `apps/mcp-server/src/scheduler/bbAlertScanJob.ts` — same question
  - Read `apps/mcp-server/src/scheduler/alertScanParallelJob.ts` — orchestrator
  - Confirm actual runtime caller path BEFORE scoping integration tests (do not assume all jobs call POST /evaluate)

---

## TDD Invariant (R5 — brief §8 R5)

**Mandatory order:**

1. **Commit Go test stubs first** — all test files with `// TODO: implement` bodies before domain/infra code
   - `pkg/domain/services_test.go` (195L TS → Go table-driven)
   - `pkg/application/evaluate_test.go` (143L TS → Go httptest)
   - `pkg/infrastructure/sqlite_test.go` (175L TS → in-memory SQLite)
   - **All tests MUST compile and FAIL RED before any production code**

2. **Port test fixtures from TS Vitest** — use identical input values
   - cooldownMinutes=30, maxAlertsPerStockPerDay=3, etc.
   - computeFingerprint output must be numerically identical (djb2 algorithm, 8-hex lowercase)
   - shouldSuppressAlert cases: no-suppress / same-signal-cooldown / critical-non-MACRO / critical-MACRO / daily-cap

3. **Green-then-deploy cycle**
   - CI gate: `go test ./...` ≥ baseline coverage + mcp-server Vitest 8804/8804 unchanged
   - Docker image rebuild (`docker build` exits 0, no CGO warnings)
   - Smoke gate: `/health` returns 200, api-gateway shows alert-engine healthy

---

## Commit Rules

**Index-only commits** per `docs/policies/commit-convention.md`

```bash
git add TASK_1912b-alert-engine.md docs/TASKS.md
git commit -m "chore(pm/1912b): dispatch alert-engine Go migration"

# NEVER use: git commit -am, git commit -a, or --amend
# Stage files explicitly by name
```

---

## Handoff Acceptance Criteria

Developer acceptance = BEFORE you start TDD stubs:

1. Verify `docs/REQ_1912b.md` 16 ACs are clear
2. Review brief §3.3 DDD layer map + §8 R5 test-first protocol
3. Confirm D-1 + D-2 call sites read + documented in handoff reply
4. Zone docs (`docs/architecture/microservice/alert-engine/`) created or confirmed up-to-date (per doc-review.md template)
5. Post reply: commit SHA of this handoff, branch name `task/1912b-alert-engine`, ready for TDD stub phase

---

## Post-Implementation Handoff (impl_done → QA)

When all tests pass + build clean + Docker image deployed:
1. Update `docs/TASKS.md` — move 1912b row to Review (status=REVIEW, owner → qa)
2. File caveman ping: send to QA + team via work channel (per dev-api-gateway pattern c99)
3. Include smoke test results (9/9 services healthy, /health 200, response latency <20ms)

---

## Deviations from TS (OK per brief §5 SDD-1)

- Dockerfile: Uses CGO (mattn/go-sqlite3 requires `gcc musl-dev` in build stage)
- Router: May use `chi` or stdlib `net/http` (both acceptable; api-gateway used `chi`)
- Logging: Use `log/slog` JSON handler (structured, not console.log)
- Interfaces: All Go, no change to mcp-server callers

---

**Created:** 2026-05-14 c107
**Status:** Ready for dev-alert-engine TDD stub phase
