# dev-alert-engine — Notebook

Zone: `apps/alert-engine/` | Stack: Go 1.22 (migrated from TS/Bun) | DB: alert_engine.db (write)

**Runbook:** `docs/references/ddd-microservices.md` — DDD layers, fence rules, composition root.

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

---

## Archive: Earlier Sessions (2026-05-24 through 2026-05-14)

**2026-05-24 (Phase-2 Gate Closure — 8 sessions)**
- P2-M: Single-literal fix (djb2Seed 5382→5381); 1 attempt, all ACs PASS
- P2-I: Dashboard finalization (deprecated-notice + Phase-2 wired state); all ACs PASS
- P2-H: Composition root rewire + OpenAPI contract; 7 ACs PASS
- P2-F: git mv services.go→_deprecated; 7 ACs PASS
- P2-E: alert-engine-pre-delete tag created; Phase-1 anchor preserved
- P2-C: Fence-A deliberate violation proof (inject + revert + verify clean); 4 ACs PASS
- Dashboard category chip relabel: Plain meaning convention applied (commit 099f8819)
- P2-B: .golangci.yml (v2 format, Fence-A/B/C rules) + CI go-lint job; 5 ACs PASS

**2026-05-20:** FIX-alertsource-legal-risk-enum — added `legal_risk` to WRITE_ALERT_VERDICT_SCHEMA enum (commit 09f80233); 5/5 new tests + 5/5 existing PASS

**2026-05-14 (Go Cutover Sprint c108-c110)**
- c108-tick3-fix: DDL ordering bug fixed (3-phase: base / ALTER / outcome index); test #17 confirms pre-migration DB works
- c108-tick2: Go cutover complete — Dockerfile multi-stage, 20 TS files removed, agent .md refreshed (version→2026-05-14)
- c108 post: 1912b BLK-1 + BLK-2 fixed (7 missing source files committed, .gitignore updated)
- c108 QA: CHANGES_REQUESTED → re-submitted after fixes
- 1912b complete: 27/27 go test PASS, off-by-one fixed in evaluate_test.go + services_test.go

All Go implementation complete; infrastructure (SQLite + TelegramClient), application (EvaluateUseCase), and interface (chi router) layers wired. Graceful shutdown (SIGINT/SIGTERM) implemented.

---

**Current state:** Phase-2 gate closure complete. Production-ready. All tests PASS. No active work.
