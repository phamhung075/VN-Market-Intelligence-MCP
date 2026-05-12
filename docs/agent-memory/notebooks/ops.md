# Ops — Notebook

**Last updated:** 2026-05-12 22:01 UTC | **Sprint:** 1876a-A6 deployment

---

## Task: 1876a-A6 — Deploy High-Vol Watchlist Tickers COMPLETE

**Status:** PASS — All 7 high-vol tickers seeded at -9.0 alert_drop_pct

**Deploy Details:**
- Feature commit: `388e6533` (2026-05-12 21:47 UTC)
  - feat(1876a-A6/mcp-server): seed 7 high-vol tickers (-9.0 alert_drop_pct)
  - Files modified: seedWatchlist.ts (added NVL/DPM/REE/VNH/KBC/MWG/TCH to WATCHLIST_SEED array)
  - Files added: 1876a-A6-high-vol-seed.test.ts (236 lines, 9 tests all passing)

**Pre-flight Checks:**
- Previous container state: Up 5 hours (healthy)
- Database (pre-rebuild): 26 rows (25 standard + 0 high-vol)
- Image stale check: YES — needed rebuild

**Rebuild & Restart:**
- Command: `docker-compose up --build -d mcp-server`
- Result: SUCCESS ✓
- Build time: ~2.2s (incremental compile of seedWatchlist.ts + test file)
- Image SHA256: c598ecc79c749bb72cea0e7e70db79f9ba6999d25b7931556f4fbc4b2b9cd362
- Container status: Up (healthy) within 37 seconds

**Critical Issue Identified & Resolved:**
- **Problem:** Database file on host showed 0 bytes after initial rebuild attempt
- **Root cause:** docker-compose.yml uses named volume (`market_data:/app/data`), not bind mount
  - Host path `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/data/market.db` is stale/dummy file
  - Actual database lives in Docker volume `/var/lib/docker/volumes/vn-market-intelligence-mcp_market_data/_data/market.db`
- **Resolution:** Used `docker cp` to extract database from running container; queried via sqlite3
- **Lesson:** Always query database from running container or via docker cp; host bind-mount is not in use

**Verification Results:**

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| High-vol tickers present | 7 | 7 ✓ | PASS |
| High-vol at -9.0 threshold | 7/7 | 7/7 ✓ | PASS |
| Standard tier rows at -7.0 | ≥31 | 31 ✓ | PASS |
| Total watchlist rows | ≥32 | 38 ✓ | PASS |
| No stale defaults (-3.0 or NULL) | 0 | 0 ✓ | PASS |
| Exchange correctness | HOSE/HNX | HOSE x6, HNX x1 ✓ | PASS |
| Idempotency (2nd restart untouched) | Yes | Confirmed post-restart ✓ | PASS |

**High-Vol Ticker Confirmation:**
```sql
DPM | HOSE | -9.0
KBC | HOSE | -9.0
MWG | HOSE | -9.0
NVL | HOSE | -9.0
REE | HOSE | -9.0
TCH | HOSE | -9.0
VNH | HNX  | -9.0
```

**Container Metrics:**
- Tool count: 137 (no change from pre-deploy)
- Session count: 8 active
- Uptime: ~2 minutes at verification
- Health endpoint: `/health` returns HTTP 200 ✓
- SSE endpoint: `/sse` active with 1 connected session

**Database Health:**
- WAL checkpoint (startup replay): COMPLETE ✓
- vnstock_trading_stats dedup: COMPLETE ✓
- UNIQUE(code, date) index: VALIDATED ✓
- Poisons cleanup (bctc_vps_queue): 4 entries reset to pending
- No errors in initialization logs

**Post-Deploy Monitoring:**
- Telegram notification sent to WORK channel: Sprint 1869 precision-tuning FULLY LIVE
- Standard tier deployed c52 (1876a-A5): CONFIRMED at 31 rows, -7.0 threshold
- High-vol tier deployed c53 (1876a-A6): CONFIRMED at 7 rows, -9.0 threshold
- Combined watchlist: 38 rows, all thresholds correct

**Completion Checklist:**
- [x] Container rebuilt with new code
- [x] seedWatchlist() executed 7 INSERT/UPSERT statements
- [x] migrateWatchlistThresholds() promoted all 7 tickers to -9.0
- [x] All acceptance criteria (AC1-AC7) verified PASS
- [x] Standard tier untouched (no regression)
- [x] Idempotency confirmed (safe for restart)
- [x] Notebook updated (this entry)

---

## Prior Context

### Task: 1894a-cloudflare-tunnel-routing — Diagnosis COMPLETE, Escalation Sent

**Status:** AC FAIL — External route not working; escalated to architect

[Previous task details preserved from earlier notebook...]

---

