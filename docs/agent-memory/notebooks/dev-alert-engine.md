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

## Session: 2026-07-24 (FACTORY-ALERT-router-cleanups)

**Task:** FACTORY-ALERT-router-cleanups (P2, FACTORY-MAINTAINABILITY-2026-06 audit) — 4 small router.go/sqlite.go cleanups.

**Item 3 set-equality proof:** `domain.AlertSeverity.IsValid()` (models.go:16-22) accepts exactly `{low,medium,high,critical}` — identical to the inline `validSeverities` map, no discrepancy. Swapped in; kept the 400 message text byte-identical.

**Item 4 case-sensitivity proof:** old `containsStr`/`findSubstr` used plain `s[i:i+len(sub)]==sub`, no `ToLower` anywhere → confirmed CASE-SENSITIVE, exact match to `strings.Contains` semantics. Direct swap, no fold wrapper needed. Hoisted `outcomeLookbackDays=90`/`defaultPendingLimit=100` to named consts.

**Item 1:** `UseCaseExecutor` interface had zero refs repo-wide beyond its own decl (grepped `apps/alert-engine/**/*.go`) — deleted.

**Item 2 (intentional fix):** `NewRouter(uc, port)` now threads `cfg.Port` through to `handleHealth`; `cmd/server/main.go` passes `cfg.Port` instead of hardcoded `5006`. Added `TestHealth_ReflectsConfiguredPort` (port=6123) as a regression lock proving the port is real, not hardcoded.

**Verify:** go build/vet/test ./... green + golangci-lint 0 issues + sandbox harness 11/11 PASS.

**Doc:** `docs/architecture/microservice/alert-engine/api-reference.md` — noted /health `port` reflects live `cfg.Port`. Graphify `--update` attempted, failed structurally (no LLM API key in shell env) — logged, not silently skipped.

**Commit:** local-only, explicit pathspecs, no push (task constraint).

Zone health: no drift detected; 4/4 items closed with equivalence proofs; behavior unchanged except the intended /health port correction.

---

## Session: 2026-07-28 (FACTORY-ALERT-dedup-window-config)

**Task:** FACTORY-ALERT-dedup-window-config (P1, BOUNDED-1 auto-pickup) — dedup window silently reused `CooldownMinutes` (30) instead of a named `DedupWindowMinutes`.

**Root cause at source:** `pipeline.go:91` (post FACTORY-ALERT-consolidate-dual-engines) called `HasDuplicateFingerprint(fingerprint, p.cfg.CooldownMinutes)` — exactly the residual risk the task flagged once the two engines collapsed into one.

**Default confirmed, not invented:** live `mcp.config.json` `alertQuality.dedupWindowMinutes: 60` (also `config.ts` `numVal(aq, "dedupWindowMinutes", 60)`) — matches the pre-consolidation Go history (`GetRecentAlerts(stock, 60)` for dedup, separate from `cfg.CooldownMinutes=30`).

**Fix:** Added `domain.CooldownConfig.DedupWindowMinutes` (default 60), wired into the dedup call + reason string (`fmt.Sprintf("duplicate: fingerprint seen within %dmin", ...)`). TDD: RED (mockRepo captures `withinMinutes`; new domain test pins default=60) failed to compile pre-fix, GREEN after.

**Verify:** go build/vet/test ./pkg/... green (60 top-level, 70 incl. subtests) + golangci-lint 0 issues + sandbox 11/11 PASS.

**Docs:** domain-model.md, usecases.md, api-reference.md, testing.md updated (doc-review).

**Commit:** 43f4e3add — fix(alert-engine): named DedupWindowMinutes, no longer reuses CooldownMinutes

Zone health: dedup-window config defect closed; no other `CooldownMinutes`-reuse sites found in `pipeline.go`.
