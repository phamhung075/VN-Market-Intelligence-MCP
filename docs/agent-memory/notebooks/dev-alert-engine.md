# dev-alert-engine — Notebook

Zone: `apps/alert-engine/` | Stack: Go 1.22 (migrated from TS/Bun) | DB: alert_engine.db (write)

**Runbook:** `docs/references/ddd-microservices.md` — DDD layers, fence rules, composition root.

---

## Session: 2026-07-24 (FACTORY-ALERT-delete-deprecated-domain)

**Task:** FACTORY-ALERT-delete-deprecated-domain (P2, FACTORY-MAINTAINABILITY-2026-06 audit) — delete dead `_deprecated` domain package.

**Deadness proven at source (not audit-trusted blind):** `go list ./...` never surfaces `pkg/domain/_deprecated` (Go ignores `_`-prefixed dirs, no build tag needed); zero `.go` files repo-wide import the path; its own files reference `AlertRequest`/`StoredAlert`/`CooldownConfig` types not defined anywhere in that directory (live types live in sibling `pkg/domain/models.go`) — would not even compile if forced into the build. Live successors: `pkg/primitive/cooldown-gate` + `pkg/primitive/dedup-key-builder` (both self-document as the brownfield replacement). Corroborated by 2026-07-04 `FACTORY-ALERT-consolidate-dual-engines` (commit 1c45abb1e) which already rewired `cmd/server/main.go` off any `domain.*` path.

**Fix:** `git rm -r apps/alert-engine/pkg/domain/_deprecated/` (services_v1.go 150L + services_v1_test.go 148L = 298L removed). Updated `docs/architecture/microservice/alert-engine/domain-model.md` (documented file path no longer exists).

**Verify:** go build/vet/test ./... green (identical to pre-delete baseline) + `go test ./pkg/... -count=1` green + golangci-lint 0 issues + sandbox harness 11/11 PASS (`go run ./cmd/sandbox -tier=all -module=alert-engine -scenario=all`).

**Commit:** 314461cbd — refactor(alert-engine): delete dead _deprecated domain package

Zone health: dead-code audit item closed; primitives (cooldown-gate, dedup-key-builder) confirmed sole live implementation; no drift detected.

---

## Session: 2026-06-15 (FIX-ALERT-ENGINE-RSI-SINGLEDIGIT)

**Task:** FIX-ALERT-ENGINE-RSI-SINGLEDIGIT — candle-depth guard for taAlertScanJob.

**Root cause confirmed via recon:** taAlertScanJob (mcp-server/src/scheduler/market-data/taAlertScanJob.ts) passed ALL available closes (as few as 15–30) to the Go TA service. Wilder RSI with a short window produces degenerate values: all-gain windows → RSI=100.0 (DAG, live MARKET msg 752); mostly-loss windows → RSI=7.4/9.8 (VIC/VHM, live MARKET msg 753). The Go alert-engine (apps/alert-engine/) has no RSI computation — it only handles eval/dedup/cooldown.

**Fix:** Added `MIN_CANDLES=35` guard in taAlertScanJob before calling computeFn. Tickers with <35 candles in daily_ohlcv are fail-closed (skip, no alert). 35 = 2.5×period(14), matching the canonical `get_technical_indicators` pending threshold.

**Both consumers fixed:**
- TA-Alert stream (taAlertScanJob): adds MIN_CANDLES guard — no more degenerate alerts
- Morning-briefing echo: already fixed via FIX-RSI-REPORT-FAILCLOSED in assembleBriefing.ts (defaultComputeTa); echoes clean values from taSummary + no longer gets corrupt TA alerts from the table

**Tests:** 8 new ACs (FIX-ALERT-ENGINE-RSI-SINGLEDIGIT.test.ts, all GREEN) + 1307 tests updated with seedMinCandles (22 total GREEN).

**Commit:** c9892200 — fix(alert-engine/rsi): candle-depth guard MIN_CANDLES=35 in taAlertScanJob

**Rebuild required:** mcp-server container (RUNTIME code change in scheduler layer). Named-volume market.db preserved; force-recreate only.

Zone health: taAlertScanJob properly guarded; 22/22 TA tests GREEN; no drift detected.

---

## Session: 2026-06-10 (GFD-4 — Pre-deploy validation gate)

**Task:** GFD-4 sprint GO-FLEET-DEPLOY — pre-deploy production-readiness validation (no feature build).

**Decision:** All 4 DoD items verified from existing code — zero code changes required.

### DoD Evidence

- **DoD-1:** `/health` route registered + live-verified (HTTP 200, `{"status":"ok","service":"alert-engine","port":5006}`)
- **DoD-2:** CGO deps present (`go-sqlite3 v1.14.24`, builder `golang:1.22-alpine` with `gcc musl-dev`, runtime `alpine:3.20`)
- **DoD-3:** `golangci-lint run ./...` → 0 issues; `.golangci.yml` has depguard v2 format (Fence-A/B/C enabled)
- **DoD-4:** `docker-compose.yml` healthcheck: `wget -qO- http://localhost:5006/health`, interval 30s, retries 3, start_period 10s

**Files verified (no changes):** `cmd/server/main.go`, `pkg/interface/http/router.go`, `Dockerfile`, `.golangci.yml`, `go.mod`, `docker-compose.yml`

**Outcome:** GATE PASSED ✓ — ready for deploy. Zero commits required.
