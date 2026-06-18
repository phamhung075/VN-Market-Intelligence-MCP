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

