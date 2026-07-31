# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-technical-analysis

**Sprint goal:** Cowork guaranteed-slot catch-up (this task rode BOUNDED-1 idle-capacity auto-pickup; unrelated to the sprint goal text — resolved per decision-journal SKILL § Resolve Sprint ID, active-entries tail-1).
**Agent:** dev-technical-analysis
**Started:** 2026-07-28T00:00:00Z

---

### STEP dev-technical-analysis-S1 · dev-technical-analysis · 2026-07-28T00:00:00Z
**task-id:** FACTORY-TECHANALYSIS-delete-orphaned-ts-service
**what-done:** Deleted `apps/technical-analysis/src/` (9 TS files) + `__tests__/` (3 test files) + `tsconfig.json`; trimmed `package.json` dead wiring (`module`, `start`, `check`, `test` scripts, `hono` dep); updated 2 code comments + 4 doc pages from "scheduled for deletion" to "deleted 2026-07-28".
**what-considered:**
- Attic to `apps/_attic/` instead of delete — rejected: audit's own recommendation is delete, and both blocking prereqs (Go livepath tests, TA contract reconciliation) are already DONE_VERIFIED, closing the risk that made straight delete premature earlier.
- Keep `package.json` "test"/"check" scripts as no-ops — rejected: empirically `bun test` with 0 test files exits 1 (verified live), which would silently red the DoD's "tests green" gate; removed instead.
**why-decision:** Live grep (repo-wide, filtered for false-positive `../src/` hits from other apps' own `src/`) found the ONLY importers of `apps/technical-analysis/src/` were its own now-deleted `__tests__/`. Dockerfile copies only `cmd/ pkg/ api/`; docker-compose context builds via that Dockerfile. `api/openapi.yaml` + `pkg/application/dtos.go` already carried prior-task comments (FACTORY-TECHANALYSIS-reconcile-ta-contract) independently confirming zero live callers of the TS shape. Premise held — proceeded with delete, not attic.
**why-change:** No deviation from dispatched approach. Additionally removed `hono` dep (sole consumer was deleted `handlers.ts`) and `tsconfig.json` (its entire `include` glob — `src/**/*` + `__tests__/**/*` — was deleted) as direct consequence of the "package.json start/build wiring" cleanup instruction, not scope creep.

**Verification evidence:**
- `go build ./cmd/server` — OK; `go vet ./...` — clean; `go test ./...` — 12/12 packages ok.
- `bash dashboard/build.sh` (G12 gate) — 35/35 scenarios green, headless render-check PASS.
- Dockerfile/docker-compose.yml diff: none (untouched).
- Commit: `099afddd37fdba2625e61fc958c095c03c1ebca4`.

### STEP dev-technical-analysis-S2 · dev-technical-analysis · 2026-07-31T19:54:00Z
**task-id:** FACTORY-TECHANALYSIS-fix-discarded-service-and-port
**what-done:** Deleted `pkg/domain/services.go` (`CalculateTAService` stub, constructed-then-discarded at `main.go:71`, zero other callers repo-wide); added `RouterConfig.Port` threaded from `main.go`'s resolved `PORT` env var; `/health` now `json.Marshal`s a `healthResponse{Status,Service,Port}` struct with the real bound port instead of the hardcoded `"port":5003` literal.
**what-considered:**
- Rewrite `NewRouter(uc, port)` as positional args (audit finding's literal text) — rejected: current signature is already `RouterConfig` (3 live callers: main.go, sandbox, router_test.go); a positional rewrite would break 2 callers the audit text didn't know existed. Added `Port string` field to the existing config struct instead — same effect, zero blast radius.
- Keep a separate `resolvePort(raw string) int` helper — rejected after simplicity-gate Q2 (single call-site helper); inlined the `strconv.Atoi`+fallback into `NewRouter` directly.
- Also delete orphaned `PriceHistoryRepository`/`TAIndicatorCalculator` from `pkg/domain/ports.go` (now zero consumers) — rejected: out of this task's declared file scope (`main.go`/`router.go` only); documented as a follow-up note in `domain-model.md` instead.
**why-decision:** `CalculateTAService` had no caller anywhere in the repo (grep-verified) beyond the one discarded `main.go:71` construction — safe delete, not just a discard-comment removal. JSON port field kept as `int` (not `string`) to match `api/openapi.yaml`'s existing `port: integer` schema — a string would silently change the wire contract.
**why-change:** No deviation from dispatched approach; TDD add — new `TestHealth_ReflectsConfiguredPort` + a port assertion on the existing `TestHealth_Returns200` (previously untested field), both GREEN before commit.

**Verification evidence:**
- `go build ./...` / `go vet ./...` / `golangci-lint run ./...` — clean, 0 issues.
- `go test -count=1 ./...` — 12/12 packages ok (incl. 2 new /health assertions).
- `bash dashboard/build.sh` (G12 gate) — 35/35 scenarios green, headless render-check PASS.
- Commit: `39fbec098`.
