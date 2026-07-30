# mcp-server — Testing

## Test Inventory (100+ test files)
**Directory:** `apps/mcp-server/src/__tests__/`

### Core Infrastructure
| Test File | Coverage |
|-----------|----------|
| `003-env-config.test.ts` | Environment variable validation |
| `012-lancedb-store.test.ts` | Vector embedding storage |
| `013-rag-retriever.test.ts` | RAG search functionality |
| `155-log-rotation.test.ts` | Log file management |
| `178-price-history.test.ts` | Price time series queries |

### WAL Checkpoint / DB Health
| Test File | Coverage |
|-----------|----------|
| `1329a-wal-hardening.test.ts` | `runWalCheckpoint()` mode param, `backupDatabase()`, shutdown hook settle delay |
| `1329b-wal-sentinel.test.ts` | `walCheckpointAlert()` two-tier thresholds (WARNING/CRITICAL/silent); `checkWalFileSize()` disk-size guard (10 MB, 40 MB, absent) |
| `1447-checkpoint-restart-mode.test.ts` | Restart-mode PRAGMA sequence |
| `1464-checkpoint-frequency.test.ts` | WAL checkpoint cron frequency config |
| `1476-wal-stuck-alert.test.ts` | `walCheckpointAlert()` remaining-frame thresholds; Telegram failure non-fatal |
| `FIX-MCP-CRASH-LOOP-BC-waltruncate.test.ts` | `runForcedTruncateCheckpoint()`: BEGIN IMMEDIATE→TRUNCATE ordering; `:memory:` WAL under 10k-write load; `wal_autocheckpoint`=1000 on fresh connection |
| `FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts` | D-1 guardrail: `checkWalFileSize()` 4th-param `escalateFn` injection; NOT called when WAL ≤ 10 MB; called exactly once when WAL > 10 MB; receives byte count; rejection is non-fatal (7 tests) |
| `FIX-MCP-CRASH-LOOP-A-restart-cadence.test.ts` | `runRestartCadenceAlertJob()`: 8 tests covering deploy-vs-crash discriminator via `mcpServerCleanShutdown` sentinel; 3-deploy false-positive pattern (2026-06-15 exact scenario); 2 crashes + 1 deploy → alert fires; 3 deploys → no alert; no predecessor → conservative no-crash; threshold tests retained (8 tests) |

### REST Endpoint Handlers
| Test File | Coverage |
|-----------|----------|
| `IND-P1-MCP-REST-GAUGES-ENDPOINT.test.ts` | 35 tests: GET /api/indicator-gauges — REG(exports), GEN(generated_at always set), 200(HTTP 200 even on section failures), ISO(Promise.allSettled section isolation — 4 partial-fail + all-fail), NULL(breadth null on error shape; sentiment passthrough; volatility null_reason synthesized), PROJ(foreign_room .market-only, no tickers[]), LIQ(ok:false→null, source_tier from is_estimate, null_reason from blocked_reason). Injectable deps (IndicatorGaugesDeps) — zero real HTTP or DB calls. |
| `TASK-17-P1-2a-macro-regime.test.ts` | GET /api/macro-regime — upstream reshape, failure paths, oil impact→direction normalization |
| `TASK-17-news-sentiment-endpoint.test.ts` | GET /api/news-sentiment — SQLite query, staleness detection, pagination |
| `cronStatusHandler.test.ts` | GET /api/cron-status — 18 tests: AC-1..7 endpoint correctness, AC-8/AC-9 PARITY gate cross-checked against `classifyCronLiveness` for all 26 `WATCHDOG_MANIFEST` jobs (16 orig. → 25 FIX-CRON-WATCHDOG-COVERAGE-2026-07-22 → 26 ALPHA-S2-SUB5-WATCHDOG-STRETCH 2026-07-29), AC-10/AC-11 boundaries, AC-25 no-shared-mutable-state across independent db instances, FR-3.4 503 on unhandled exception. In-memory SQLite, no live server. |
| `cronStatusCompute.test.ts` | `resolveJobNameDb`/`deriveCadenceMs`/`buildLayerARow` — 16 tests: CN-1 all 26 static pairs + normalized fallback + honest no-match, CN-2 EC-2/EC-4 exact cadence values, R1 memoization (compute-count assertion). |
| `cronLivenessClassifier.test.ts` | `classifyCronLiveness` — 12 tests: all 5 branches + exact boundary values (inclusive `<=` at each threshold). |
| `humanScheduleFormatter.test.ts` | `buildHumanSchedule` — 13 tests: every shape in `cronConfig.ts` + NFR-1 honest-passthrough fallback. |
| `layerBCronRegistry.test.ts` | `parseLayerBCrons`/`getLayerBCronRows` — 14 tests: primary/fallback regex, deprecated skip-list, multi-cron numbering, drift-detector WARN, CN-5 memoization, live `.claude/commands/crons/` integration (AC-12). |

### Market Data
| Test File | Coverage |
|-----------|----------|
| `1292-hose-staleness.test.ts` | Price freshness SLA |
| `1283-foreign-flow-diagnostics.test.ts` | 4-tier fallback validation |
| `1289c-fetcher-validator-integration.test.ts` | Fetcher output schema compliance |
| `FIX-1274-price-push-startup.test.ts` | VPS push handling at startup |
| `1397c-vn-index-refresh.test.ts` | VN-Index polling |
| `FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0.test.ts` | 8 tests: flat vol=0 O=H=L=C seed bars rejected (TC-1 primary regression, TC-2 thousand-scale, TC-3 full-VND, TC-4 all-zero); real candle written (TC-5 safety); historical real candle written (TC-6); mixed batch — flat seeds rejected, real + halt-day candles written (TC-7); boot-sequence combined purge+backfill (TC-8). Uses injectable `fetchFn` — zero network calls. |
| `daily-foreign-flow-schema.test.ts` | TASK_2000/SUBTASK-DAILY-FF-1: `daily_foreign_flow` table exists with all 9 columns, PK(code,date) rejects dup insert, `ON CONFLICT` upsert works, index exists, unconditional insert succeeds with zero matching `daily_ohlcv` row (R-1 structural proof); `daily_ohlcv_with_flow` view exists, selects cleanly on empty data, exposes legacy column names, COALESCE prefers new table then falls back to legacy `daily_ohlcv.foreign_*`; `daily_ohlcv` itself unchanged (same column set, PK intact, `initDatabase()` idempotent). 15 tests, in-memory DB. |
| `daily-foreign-flow-backfill.test.ts` | TASK_2001/SUBTASK-DAILY-FF-2: `backfillDailyForeignFlow()` idempotency (T-5 — run twice, 2nd run no-op, no dup/error), correctness (all 8 columns + PK copied identically from `daily_ohlcv`), rows with both `foreign_buy_vol`/`foreign_sell_vol` NULL skipped, additive-only (pre-existing `daily_foreign_flow` row never overwritten via `INSERT OR IGNORE` PK conflict), wired into boot sequence (`initDatabase()` backfills without a direct call), performance checkpoint (3000 rows < 5s). 6 tests, in-memory DB. |
| `daily-foreign-flow-table.test.ts` | TASK_2002/SUBTASK-DAILY-FF-3 (writer cutover): `writeForeignFlowToOhlcv()` unconditional upsert — T-1 (zero `daily_ohlcv` rows, `changes=1`, correct row in `daily_foreign_flow` — R-1 elimination proof), T-2 (existing `daily_ohlcv` row, `daily_ohlcv.foreign_*` UNTOUCHED), T-4 (regression proof — `daily_ohlcv` gets zero rows, no close=0 stub), T-5 (interaction with TASK_2001's backfill — fresh writer row survives a subsequent backfill run untouched), generic-across-codes (`changes` never 0), ON CONFLICT update-in-place path, empty-input no-op. 8 tests, real schema via `initDatabase()`/`:memory:`. |
| Class-A read-site tests (`MSG-1-market-foreign-flow`, `1134-get-foreign-flow-tool`, `1518-get-foreign-flow-ohlcv-source`, `1133-foreign-flow-alert-job`, `1517-foreign-flow-alert-ohlcv-source`, `1503-ohlcv-foreign-flow`, `1516-france-summary-foreign-flow`, `FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN`, `FIX-EVIDENCE-PIPELINE-STARVED`) | TASK_2003/SUBTASK-DAILY-FF-4: 9 files' bespoke `:memory:` fixtures predated `daily_ohlcv_with_flow` and lacked one or more of `updated_at`/`data_env`/`foreign_buy_value`/`foreign_sell_value` — a view query needs the FULL underlying SELECT to resolve even for a partial column list, so any gap throws `no such table/column`. Fixed by having each fixture call the real `initMarketDataTables()` + `migrateForeignFlowColumns()` (from `schema-market-data.ts`/`schema.ts`) after its ad-hoc `CREATE TABLE daily_ohlcv`, instead of duplicating view DDL — reuses production schema, no drift risk. `1503-ohlcv-foreign-flow.test.ts` is the one exception: it explicitly avoids importing production schema (file header rationale), so it got a local `addForeignFlowCompatView()` helper mirroring the view DDL inline instead, consistent with its own pre-existing `addDailyForeignFlowTable()` pattern. 162 tests across the 19-file foreign-flow sweep, 0 fail. |
| `TASK-2004-daily-ff-class-b-probes.test.ts` | TASK_2004/SUBTASK-DAILY-FF-5 (Class-B probe migration): proves the decoupling contract for all 4 migrated probes (`freshnessSlaMonitorJob.querySignalAges`, `slaStatusTools` `get_sla_status` tool, `vpsProxyWatchdogJob.readLatestForeignFlowTimestamp`, `vpsHealthPoller.checkServiceFreshness`) — a fresh `daily_foreign_flow` write reads fresh even when `daily_ohlcv` has no row at all; a stale/empty `daily_foreign_flow` reads stale/unreachable/not-seeded even when `daily_ohlcv` has a fresh row (proves the OHLCV pipeline can no longer mask a dead foreign-flow writer). 9 tests, in-memory DB. Fallout fixed in-place: 2 static-source contract-lock tests + 4 seed-based behavior tests across `FIX-PDF-VOLUME-SBV-TABLE.test.ts`, `FIX-HEALTH-MONITOR.test.ts`, `FIX-VPS-HEALTH-FRESHN.test.ts` that asserted/seeded the legacy `daily_ohlcv` contract for the foreign_flow signal. |
| `FIX-CONVICTION-HISTORY-EOD-BACKFILL.test.ts` | 10 tests: AC-1 `scanMarket` Step 5c writes `conviction_history` even on a zero-signal cycle (root-cause regression guard); AC-2a/2b same-day `agent_feedback` observability signal fires only when every conviction upsert fails; AC-3/3b `checkConvictionHistoryGap` finds + backfills a `daily_ohlcv`-covered gap day from OHLCV alone and is idempotent on re-run; AC-3c a confirmed-but-unbackfillable gap day (no prior-day baseline) reports `action:"none"` without ever fabricating data or spamming `agent_feedback`; AC-4 sparse/partial dates below the watchlist-size floor are never flagged; AC-5 today's VN date is never flagged; AC-6 `dataAuditJob.runDailyChecks` composes the new D-NEW3 check. In-memory DB, no live fetch. |
| `P0-2-foreign-room-suite.test.ts` | 43 tests, in-memory DB. AC-1..AC-11 (P0-2-FOREIGN-ROOM-SUITE original suite): per-ticker utilization/velocity/flags, ROOM_FULL/ROOM_REOPEN event detection + idempotency, market-wide cap-weighted saturation, `foreign_outflow_z_5d` gauge, `get_foreign_room` tool error contract. AC-12/AC-12b (FIX-GET-FOREIGN-ROOM-TOOL-RESULT-TOKEN-BUDGET, 2026-07-29): `summarizeForeignRoomTickers` unit coverage — no-op when `topN>=total`, effective limit always `min(topN, total)` (never a hardcoded universe-size ceiling), ROOM_LOCKED/FULL_ROOM_SELL-flagged tickers ranked ahead of higher-cap unflagged ones, `|depletion_velocity_5d|` descending tie-break ("top-N by |net|"), rollup counts computed over the FULL universe not just the returned slice, `omitted_codes` sorted+exact. End-to-end tool-level: default `top_n=10`, caller override, `more_available`/`fetch_more` presence/absence, single-`code` lookups never trimmed, and a 120-ticker synthetic universe's serialized JSON stays well under a 25k-token-equivalent budget (pre-fix would have been ~84k+ chars for `tickers[]` alone). |

### Signal & Alert
| Test File | Coverage |
|-----------|----------|
| `1349b-cb-logging.test.ts` | Circuit breaker state transitions |
| `1394-alert-digest-diacritics.test.ts` | Vietnamese diacritics in alerts |
| `1551-pipeline-watchdog-market-alert.test.ts` | Alert pipeline supervision |
| `1875c-record-signal-outcome-routing.test.ts` | Dispatch regression guard: record_signal_outcome returns signal-outcome shape (not climate), handler distinct from get_climate_risk_signals, alert_commander skill resolves correctly |
| `CCATO-MCP-T1-DOMAIN-ENGINE.test.ts` | 28 tests. Unit coverage of `claimCandidateScanner`/`verdictClassifier`/`quarterResolver` (dedup rule, requires_ticker fallback, marker classification, quarter-boundary rollover). Plus the architecture brief §5.1 hard AC: side-by-side fixture parity — spins up a local `Bun.serve` MCP-gateway stub (fixed non-null response, forces every candidate to FAIL so `claim_text` is recoverable from stdout), spawns the REAL unmodified `scripts/narrative-truth-gate.sh` against the REAL `docs/social/fb-post-2026-06-30.md` + `docs/data/claim-tool-map.json`, and asserts an IDENTICAL candidate set against the new TS scanner. `NTG_SKIP_SIGNAL_EMIT=1` — no orch-state.json write, no jq dependency. |

### BCTC & Financial Reports
| Test File | Coverage |
|-----------|----------|
| `1181-financial-reports-persist.test.ts` | BCTC parser + DB storage |
| `1412-diacritics-wave3.test.ts` | Vietnamese text parsing |
| `1434-morning-briefing-commodity-values.test.ts` | Commodity data in briefings |

### vnstock Bridge
| Test File | Coverage |
|-----------|----------|
| `fix-fundamentals-refresh-cron-dead.test.ts` | 12 tests: `isRateLimitResponse` rejects box-drawing banner (TC-1 to TC-5), `stripAnsiAndDetectJunk` rejects ℹ️ prefix (TC-6 to TC-9), `SUPPRESS_BANNER`/`RESTORE_STDOUT` constant format guards (TC-10 to TC-12) |

### Analysis & Backtesting
| Test File | Coverage |
|-----------|----------|
| `247-cascade-metrics.test.ts` | Signal cascade measurement |
| `253-supply-chain.test.ts` | Supply chain disruption detection |
| `165-prediction-cascade-mapper.test.ts` | Prediction impact chains |
| `1202-fpt-hpg-backfill.test.ts` | Historical price reconstruction |

### Integration
| Test File | Coverage |
|-----------|----------|
| `1284-schema-bun-env.test.ts` | SQLite + Bun environment |
| `082-tool-watchlist.test.ts` | MCP tool input validation |
| `230-bootstrap-verify.test.ts` | Cycle initialization |
| `1838b-repository-adapters.test.ts` | Repository pattern compliance |

## Test Patterns
- **Mocking:** HttpClient injection, in-memory DB, time injection
- **Fixtures:** Pre-seeded watchlists, sample BCTC PDFs, news articles
- **Assertions:** Zod schema validation, error boundary testing, staleness detection

## Run Commands
```bash
cd apps/mcp-server && bun test                    # all tests
cd apps/mcp-server && bun test src/__tests__/NNN  # specific task tests
cd apps/mcp-server && bun tsc --noEmit            # type check
```
