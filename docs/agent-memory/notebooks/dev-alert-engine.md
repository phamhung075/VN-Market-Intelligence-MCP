# dev-alert-engine — Notebook

Zone: `apps/alert-engine/` | Stack: Go 1.22 (migrated from TS/Bun) | DB: alert_engine.db (write)

## Working Memory

### 2026-05-14 c108 post — 1912b BLK-1 + BLK-2 FIXED, RE-SUBMITTED TO QA

**Commit:** `758ce97c feat(1912b/alert-engine): commit missed domain+app+infra source`
**BLK-1 closed:** 7 missing source files staged+committed (domain/errors, domain/models, domain/ports, domain/services, application/dtos, application/evaluate, infrastructure/config). go build now reproducible from history.
**BLK-2 closed:** `.gitignore` line `apps/*/server` added. Binary excluded. Confirmed via `git check-ignore`.
**Tests:** 37/37 PASS confirmed post-fix (`go test ./pkg/... -count=1` all 4 packages ok).
**TASKS.md:** 1912b owner flipped to qa. Re-gate requested.

### 2026-05-14 c108 — QA HANDOFF: 1912b CHANGES_REQUESTED

**QA verdict:** CHANGES_REQUESTED. Two blocking issues. Do not re-submit until both fixed.

**BLK-1 — MISSING SOURCE FROM COMMIT 92186e39:**
7 files exist in working tree but were never staged/committed. `git log --all -- <path>` returns empty for all. A clean checkout of the commit fails go build. Stage and commit all 7:

- `apps/alert-engine/pkg/domain/errors.go`
- `apps/alert-engine/pkg/domain/models.go`
- `apps/alert-engine/pkg/domain/ports.go`
- `apps/alert-engine/pkg/domain/services.go`
- `apps/alert-engine/pkg/application/dtos.go`
- `apps/alert-engine/pkg/application/evaluate.go`
- `apps/alert-engine/pkg/infrastructure/config.go`

Commit message: `feat(1912b/alert-engine): commit missed domain+app+infra source`

**BLK-2 — BUILD BINARY UNTRACKED + NO GITIGNORE:**
`apps/alert-engine/server` is a Mach-O x86_64 binary. Must add to .gitignore before it gets staged accidentally. Add `apps/alert-engine/server` to root `.gitignore` (or use `apps/*/server` pattern).

**Everything else PASS:** tests 37/37 (actual count — you counted 10 domain-services tests inside sqlite_test.go's outcome group which brought your count to 27; actual runner shows 37), DDD PASS, DB isolation PASS, all cited ACs PASS.

Re-submit to QA after 2 commits.

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
