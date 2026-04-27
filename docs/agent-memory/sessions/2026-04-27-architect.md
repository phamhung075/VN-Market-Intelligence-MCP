---
agents: architect
trigger: design, sprint-start
---

# Architect Session — 2026-04-27

## Sprint 1352 — Scheduler Test Coverage Phase 2

### Brownfield Audit

Searched `apps/mcp-server/src/__tests__/` for all 5 scheduler job names. Extensive existing coverage found, but all tests target use-case and domain layers. The scheduler wrapper functions themselves are untested in all 5 cases.

| Job | Existing tests | Gap |
|-----|----------------|-----|
| macroIndicatorRefreshJob | 239a (10 cases), 239c (8 cases) | Job function never called; telegramCallback, recordJobMetrics finally, error path untested |
| marketScanJob | 103 (10 cases), 1076 (7 cases), 1420 (2 cases) | runMarketScan() never called; isRunning guard and isTradingSession skip path untested |
| sscCheckerJob | 104 (9 cases), FIX-1281 (8 cases) | runSscCheck() never called; isRunning concurrency guard untested |
| foreignFlowFetcherJob | 1290a (8 cases) | runForeignFlowFetcherJob() never called; fallbackActivated flag, cbState reading, cron wrapper untested |
| freshnessSlaMonitorJob | 234 (12 cases) | runFreshnessSlaMonitor() orchestration never called end-to-end; querySignalAges DB query untested |

### Tasks Created

- **TASK_1352a**: macroIndicatorRefreshJob wrapper (4 cases) + marketScanJob concurrency guard (3 cases) = 7 tests
- **TASK_1352b**: foreignFlowFetcherJob wrapper (5 cases)
- **TASK_1352c**: freshnessSlaMonitorJob end-to-end (5 cases) + sscCheckerJob concurrency guard (1 case) = 6 tests

Total: 18 new test cases across 3 new test files.

### Risk Flags
- `foreignFlowFetcherJob` does dynamic `import("circuitBreakerRegistry")` twice — potential side effects in tests.
- `querySignalAges` uses 5-table UNION ALL — must use `initDatabase()` in tests.
- `macroIndicatorRefreshJob` uses module-level imports not injectable via parameters — requires `mock.module()` in Bun.

---


## Sprint 1344 — Fix 9 Pre-existing Test Failures

### Task: design-1344

**Status:** DONE

**Decisions made:**
- Group C: selected Option C-Option-1 (update test assertions to match current state, not reverse-engineer stale docs)
- All 3 groups confirmed file-disjoint — parallel dispatch approved
- `project-stats.json` update scoped into 1344c (field-level: currentSprint + sprintGoal only)

**Files designed (create):**
- `apps/mcp-server/docs/agent-memory/manifests/ops.md`
- `apps/mcp-server/docs/agent-memory/issues/WAL-checkpoint.md`
- `apps/mcp-server/docs/agent-memory/issues/` (mkdir)
- `apps/mcp-server/docs/agent-memory/patterns/` (mkdir)

**Files designed (edit):**
- `apps/mcp-server/src/interface/mcp/tools/system/agentMemoryUpdateTools.ts` — add `mkdirSync` + `dirname` imports; insert `mkdirSync(dirname(filePath), { recursive: true })` before `writeFileSync` in `update_memory_file` handler
- `.claude/agents/developer.md` — add `## Step 0-b: Handle Bootstrap Errors` section
- `.claude/agents/ops.md` — add `## Step 0-b: Handle Bootstrap Errors` section
- `.claude/agents/qa.md` — add `## Step 0-b: Handle Bootstrap Errors` section
- `apps/mcp-server/src/__tests__/1338-sprint-goal-retrospective.test.ts` — update 3 stale assertions
- `docs/data/project-stats.json` — currentSprint 1343 → 1344, sprintGoal updated

**Risks logged:** RISK-1 (low, test filesystem isolation), RISK-2 (low, project-stats.json PM/dev coordination), RISK-3 (none, DDD clean)

**Handoff:** docs/handoffs/TASK_1344-arch.md

---

## Sprint 1345 — News + Analysis Pipeline Hardening

### Task: ARCH-1345

**Status:** DONE

**Root causes confirmed from codebase:**

- 1345a: `fetch-reuters.sh` + `fetch-tradingeconomics.sh` exist in `vps-scripts/` but
  no systemd `.service` files — scripts never auto-start on VPS. `vpsProxyWatchdogJob.ts`
  reads `MAX(created_at) FROM rag_analyses` with no source filter — cannot detect
  Reuters/TE staleness independently of VN news.
- 1345b: `ExtractedContent` has `ocr_confidence` but no `confidence_financial`.
  `ExtractPDFService.process_pdf()` has OCR quality gate only, no accounting identity
  validation. VNM assets < equity and VEA margin > 100% pass undetected.
- 1345c: `mcp.config.json predictionMarkets.enabled` is already `true` (Mode A ruled
  out). Mode B confirmed: `fetchPolymarkets()` fails → stale cached snapshot reused →
  `fetched_at` never updated. No staleness check before `detectPredictionSignals()`.
- 1345d: `notifyTelegramAlert()` routes to BUG channel by design (Alert Commander rule,
  line 553 of telegram.ts). Market-wide MARKET channel summary was simply never
  implemented — not a misroute, a missing feature.

**Key architectural decisions:**

- 1345d fix is additive pre-pass only: detect `>= 2 alerts with 'market-wide cascade'`
  in signal messages, send ONE `sendTelegramMarket` summary. No change to per-stock BUG routing.
- 1345b new function `validate_financial_figures()` is pure (no I/O) → correct in
  `apps/pdf-extractor/domain/services.py`.
- 1345a fallback chain lives in `pollNews.ts` (application layer) — newsapi.ts fetcher
  in infrastructure. Fallback activates when `rag_analyses WHERE source='reuters'` is
  empty for > 90 min, not when the scheduled stub returns [].
- All 4 tasks file-disjoint → full parallel dispatch approved.

**Blocker:** BLOCKER-1345a-1 — NewsAPI key availability. PM must confirm with user
before 1345a developer starts implementing newsapi.ts. MarketWatch RSS is the no-key
fallback path.

**Handoff:** docs/handoffs/ARCH-1345.md

---

## Sprint 1346 — Alert Quality Fixes + Infrastructure Reliability

### Task: ARCH-1346

**Status:** DONE

**Root causes confirmed from codebase:**

- 1320 (volume spike 5.909090): `scanMarket.ts::getAvgVolumeSync` (lines 103–128) does NOT exclude the current UTC date from the rolling window. `server.ts` push-prices path already does this correctly (lines 677–686). Fix: mirror the `MAX(volume) GROUP BY date WHERE date < today` query.
- 1311 (MSN suffix NER): `stripSourceAttributionSuffix` already exists and is correct at `stockAliases.ts:815`. Missing wiring: `pollNews.ts` and `cascadeExecutor.ts` do not call it before `detectStocksInText`. Fix: add the call before ticker detection.
- 1321 (VIX lỗ 63% BULLISH): Standalone `"lỗ"` (loss) is NOT in `VN_BEARISH`. Only compound forms `"thua lỗ"` and `"khoản lỗ"` exist. Also: NFC vs NFD Unicode normalization mismatch may prevent matching when RSS delivers NFD strings. Fix: add `"lỗ"` + `"lợi nhuận âm"` to VN_BEARISH, add `.normalize("NFC")` at `sentimentClassifier.ts:514`.
- 1322 (Vietjet alias): `"vietjet"` IS in VJC aliases. Missing: `"viet jet"` (two-word form). Fix: add `"viet jet"` to VJC aliases.
- 1316 (PDF CB race): CB is wired correctly. Bug is concurrent `Promise.all()` in `bctcQueueEnricherJob.ts` — all 5 calls start before any failure resolves, so `_consecutiveFailures` increments don't gate subsequent calls. Fix: serialize fetches or CB-gate per-item.
- 1317 (feedback retry): `sendTelegramBug` is wrapped in `try { } catch { /* best-effort */ }` with no retry. Fix: 1-retry with 2s delay.
- 1313 (unknown stock code): `postSignal` already normalizes `"unknown"` → NULL (task 1334, line 277). `runChainSynthesis` already guards `if (!f.stockCode) continue`. Residual: old DB rows with `stock_code='unknown'` + `getChainFindings` SQL has no `IS NOT NULL` filter.

**Key architectural decisions:**

- 1346c and 1346d are fully file-disjoint → parallel dispatch approved (3 developers)
- Dev A: Bug 1320 + 1321 + 1322 (domain/services + scanMarket)
- Dev B: Bug 1311 + 1317 + 1313 (pollNews wiring + feedbackTools + agentSignalStore)
- Dev C: Bug 1316 (infra CB + bctcQueueEnricherJob)
- No schema changes required for any bug
- Sentiment fix uses `.normalize("NFC")` — must verify no test regression on NFD fixture strings

**Handoff:** docs/handoffs/ARCH-1346.md
