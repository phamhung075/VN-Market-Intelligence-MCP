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

### Market Data
| Test File | Coverage |
|-----------|----------|
| `1292-hose-staleness.test.ts` | Price freshness SLA |
| `1283-foreign-flow-diagnostics.test.ts` | 4-tier fallback validation |
| `1289c-fetcher-validator-integration.test.ts` | Fetcher output schema compliance |
| `FIX-1274-price-push-startup.test.ts` | VPS push handling at startup |
| `1397c-vn-index-refresh.test.ts` | VN-Index polling |

### Signal & Alert
| Test File | Coverage |
|-----------|----------|
| `1349b-cb-logging.test.ts` | Circuit breaker state transitions |
| `1394-alert-digest-diacritics.test.ts` | Vietnamese diacritics in alerts |
| `1551-pipeline-watchdog-market-alert.test.ts` | Alert pipeline supervision |
| `1875c-record-signal-outcome-routing.test.ts` | Dispatch regression guard: record_signal_outcome returns signal-outcome shape (not climate), handler distinct from get_climate_risk_signals, alert_commander skill resolves correctly |

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
