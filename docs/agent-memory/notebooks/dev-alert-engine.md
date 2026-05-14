# dev-alert-engine — Notebook

Zone: `apps/alert-engine/` | Stack: Go 1.22 (migrated from TS/Bun) | DB: alert_engine.db (write)

## Working Memory

### 2026-05-14 — Task 1912b complete (Go migration Phase 2)

**Status:** IMPL READY — 27/27 go test PASS, go vet clean, go mod tidy clean
**Handoff:** QA

**Bug fixed:**
- `TestEvaluateUseCase_DoesNotFireWhenMuted` FAIL: off-by-one in manual substring loop
  (`i+5 < len` strict LT missed "muted" at end of string "VCB is muted").
  Fixed by replacing manual loop with `strings.Contains` in evaluate_test.go, services_test.go.

**Files created:**
- `apps/alert-engine/pkg/infrastructure/sqlite.go` — SQLiteAlertRepository + SQLiteMuteRepository + ReadPendingOutcomeAlerts + WriteAlertOutcome + InitAlertTables + OpenAlertDB
- `apps/alert-engine/pkg/infrastructure/telegram.go` — TelegramClient (net/http, silent-skip AC-13)
- `apps/alert-engine/pkg/infrastructure/sqlite_test.go` — 16 integration tests (in-memory SQLite)
- `apps/alert-engine/pkg/interface/http/router.go` — chi router, GET /health + POST /evaluate
- `apps/alert-engine/pkg/interface/http/router_test.go` — 8 httptest tests
- `apps/alert-engine/cmd/server/main.go` — wiring: config→DB→repos→usecase→router→server, SIGINT/SIGTERM graceful shutdown

**Files modified:**
- `apps/alert-engine/pkg/application/evaluate_test.go` — strings import + off-by-one fix
- `apps/alert-engine/pkg/domain/services_test.go` — strings import + off-by-one fix
- `apps/alert-engine/Dockerfile` — replaced TS/Bun image with Go 1.22-alpine CGO multi-stage
- `docs/TASKS.md` — 1912b moved to Review (owner → qa)

**Key decisions:**
- Dockerfile replaces TS Dockerfile in-place (no Dockerfile.go rename) — cutover sprint will swap compose image tag
- `DisallowUnknownFields()` on JSON decoder enforces clean API contract
- chi router retained (go.mod already had it; mirrors api-gateway pattern)
- Outcome columns added inline in InitAlertTables DDL + idempotent ALTER TABLE fallback for existing DBs

**Test counts:** domain 10, application 3, infrastructure 16, interface/http 8 = 27 total

**Blockers:** None

---

### 2026-05-06 — Task 1847d-B complete

**Branch:** task/1847d-B-alert-outcome-scorer
**Commit:** c52815a2

**Files created:**
- `apps/mcp-server/src/domain/services/alertOutcomeScorer.ts` — pure domain fns
- `apps/mcp-server/src/__tests__/1847d-alert-outcome-scorer.test.ts` — 14 tests

**Files modified:**
- `apps/mcp-server/src/domain/services/index.ts` — selective barrel export (avoids PricePoint collision)

**Key decisions:**
- ARCH/handoff say `apps/mcp-server/` not `apps/alert-engine/` — followed docs as authoritative
- composite: any signals.length > 1 including pure price-signal combos (TEST-5 drives this)
- PricePoint not exported via barrel (collision with volatilityCalculator + performanceAttribution)

**Tests:** 14/14 pass | tsc: clean
**Blocks:** 1847d-C (job uses classifyAlertType + scoreAlertOutcome)
