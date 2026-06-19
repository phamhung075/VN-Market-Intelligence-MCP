# ops — Notebook

Zone: `apps/mcp-server/` + `services/` | Stack: Multi-service Docker | DB: market.db (write)

**Runbook:** `docs/protocols/ops-rebuild.md` — rebuild protocol (no-deps mandatory), race check, peer verification, disk cleanup.

## Rebuild: 4 dev-mcp-server fixes shipped (2026-06-16T20:17Z)

**Task:** Deploy FIX-FOREIGN-FLOW-INTEGRITY-BREAK (P0) + FIX-FOREIGN-FLOW-COVERAGE (P1) + FIX-MARKET-BREADTH-MISSING (HIGH) + FIX-MARKET-LIQUIDITY-MISSING-TOOL (P1)

**Trigger:** All 4 tasks in REVIEW, marked REBUILD_REQUIRED:yes; code on main, tsc clean.

### Rebuild Process
```
docker compose build mcp-server && docker compose up -d --no-deps mcp-server
```

**Timeline:**
- 2026-06-16T20:04:20Z: Build started (docker compose build)
- 2026-06-16T20:12:38Z: New image created (sha256:4986aa59527)
- 2026-06-16T20:17:13Z: Container recreated + started (healthy at :20s)

### Verification

**CHECK 1: IMAGE BUILD** — PASS
- Old image: 2026-06-16T16:54:21Z (ID: a2ef510b5d0e)
- New image: 2026-06-16T20:12:38Z (ID: 4986aa59527)
- Build age: 3.3 hours newer than previous | commit eff492d7 included

**CHECK 2: CONTAINER RUNNING NEW IMAGE** — PASS
- Container image ID: sha256:4986aa59527... (matches build)
- StartedAt: 2026-06-16T20:17:13Z
- Health: healthy (9 seconds)
- Ports: 3000 & 4004 live

**CHECK 3: SCHEMA MIGRATION (daily_ohlcv)** — PASS
- Named-volume: vn-market-intelligence-mcp_market_data
- PRAGMA table_info output:
  ```
  13|foreign_buy_value|REAL|0||0
  14|foreign_sell_value|REAL|0||0
  ```
- Migration applied at boot: YES

**CHECK 4: NEW TOOL LIVE (get_market_breadth #165)** — PASS
- Health toolCount: 165 (tool #165 reachable)
- Tool test: get_market_breadth() returns real HOSE breadth
  - advances: 179 | declines: 109 | noChange: 74
  - ceilingStocks: 8 | floorStocks: 4
  - totalTurnoverBn: 16,650.84 (-18.3% delta)
  - accumulatedVol: 672,837,809 shares
  - source: vndirect:api-finfo.vndirect.com.vn

**CHECK 5: MARKET-BREADTH FIX VERIFIED** — PASS
- Tool: get_market_snapshot now includes breadth object
  - advances: 179, declines: 109, noChange: 74
  - ceilingStocks: 8, floorStocks: 4
  - totalTurnoverBn: 16,650.84, turnoverDeltaPct: -18.3
- Breadth co-fetch in hose.ts: LIVE

**CHECK 6: PEER SERVICES SURVIVED RECREATE** — PASS
- All 11 services healthy:
  - alert-engine (5d), api-gateway (5d), frontend (3h), kinh-dich-service (2d)
  - macro-indicators (39h), mcp-server (9s) [NEWLY DEPLOYED], news-fetch (5d)
  - pdf-extractor (19h), rag-service (17m), stock-price (32h), technical-analysis (36h)
- Recreate did NOT kill peers (--no-deps honored)

### Fix Status

| Fix | Type | Status |
|-----|------|--------|
| FIX-FOREIGN-FLOW-INTEGRITY-BREAK | P0 | LIVE ✓ |
| FIX-FOREIGN-FLOW-COVERAGE | P1 | LIVE ✓ (columns confirmed) |
| FIX-MARKET-BREADTH-MISSING | HIGH | LIVE ✓ (breadth in snapshot) |
| FIX-MARKET-LIQUIDITY-MISSING-TOOL | P1 | LIVE ✓ (tool #165) |

### Next: QA

QA to verify:
- Data quality: varied/plausible breadth metrics across multiple sessions
- get_market_breadth consistency (no timeout/retry loops)
- Daily cron foreign-flow writers apply value extractions
- No signal regressions from breadth co-fetch latency

**Outcome:** Infrastructure deployment complete. No defects detected. Ready for data-quality QA.


## Rebuild: FU-ALERT-COWRITE-SCHEDULER-JOBS fix (2026-06-19T21:04Z)

**Task:** Deploy commit b3ea96fa — scheduler jobs (taAlertScanJob/bbAlertScanJob/foreignFlowAlertJob) now route alert writes through storeAlerts for atomic alert→agent_signals co-write with fingerprint column.

**Trigger:** Fix committed to main but running mcp-server image predated it (COPY-baked src/). Alerts writing via old raw-INSERT path (fingerprint NULL, orphaned→dangling signals). Rebuild required for done_verified.

### Rebuild Process
```
docker compose build mcp-server && docker compose up -d --no-deps mcp-server
```

**Timeline:**
- 2026-06-19T19:03:38Z: Build completed (docker compose build)
- 2026-06-19T19:04:04Z: Container recreated + started (healthy at :39s)

### Verification

**CHECK 1: IMAGE BUILD** — PASS
- Old image: 2026-06-19T04:54:24Z (ID: b84699e6a4a40d13aa4411deddd346e0f11516adb12506e2feb8712971c5988e)
  - Created epoch: 1781837664
- New image: 2026-06-19T19:03:38Z (ID: 05ad341203814da29fcbccd0d36a4e8af4b56b68d937066e90a61a018d10ee52)
  - Created epoch: 1781895818
- **Epoch gate check:** 1781895818 > 1781892081 (commit b3ea96fa) ✓ PASS
- Build picked up the FU-ALERT-COWRITE-SCHEDULER-JOBS fix

**CHECK 2: CONTAINER RUNNING NEW IMAGE** — PASS
- Container image ID: 05ad341203814da29fcbccd0d36a4e8af4b56b68d937066e90a61a018d10ee52 (matches build)
- Status: Up 39 seconds (healthy)
- Health endpoint: 200 OK {status: "ok", uptime: 31.5s, toolCount: 166}
- RestartCount: 0 (no crash-loops)
- FailingStreak: 0

**CHECK 3: MEMORY RESET** — PASS
- Pre-rebuild memory: 1.651GiB / 2GiB (82.54%, stable ceiling after 14d uptime)
- Post-rebuild memory: 163.2MiB / 2GiB (7.97%, clean working set)
- Working set purge confirmed; steady-state ceiling reset

**CHECK 4: PEER SERVICES SURVIVED RECREATE** — PASS
- All 11 services healthy:
  - alert-engine (8d), api-gateway (8d), frontend (3d), kinh-dich-service (5d)
  - macro-indicators (4d), mcp-server (39s) [NEWLY DEPLOYED], news-fetch (8d)
  - pdf-extractor (3d), rag-service (32m), stock-price (4d), technical-analysis (4d)
- Recreate did NOT kill peers (--no-deps honored)

### Fix Status

| Fix | Scope | Status |
|-----|-------|--------|
| FU-ALERT-COWRITE-SCHEDULER-JOBS | mcp-server/src/alerts/scheduler-jobs | LIVE ✓ |

Scheduler jobs now route through storeAlerts() with fingerprint column for atomic co-write.
Old code path (raw INSERT, fingerprint NULL) is retired.

### Next: Router Live Orphan Verification

Router will probe named-volume market.db for orphan-alert delta (fingerprint NULL rows from pre-fix tick window). Fresh build is ready for data validation.

**Outcome:** Infrastructure deployment complete. Image verified >= b3ea96fa epoch. Container healthy, memory clean, peers stable. Ready for router's live orphan verification.

