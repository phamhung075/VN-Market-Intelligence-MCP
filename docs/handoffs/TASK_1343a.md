# Task 1343a — Watchlist Restore + Q4 2025 Backfill

**Sprint:** 1343 — BCTC PDF Pipeline Recovery

**Owner:** Developer

**Status:** Ready for implementation

**Size:** S (1–1.5h)

---

## Problem Statement

Post-microservices migration (Sprint 1327+), the watchlist DB was reset. Current state:
- Only 2 tickers in `watchlist` table: FPT, VCB
- Expected: 30 tickers (from Sprint 054 expansion, documented in MEMORY.md)
- Missing: 28 tickers + Q4/2025 financial data

The value-investor analysis system (Sprint 1336) requires full watchlist coverage to function.

---

## Solution Design

**1a. Restore 30-ticker watchlist**

Source: User's watchlist in MEMORY.md (10 sectors, 30 tickers):
- Oil & Gas: GAS, GVR
- Banking: VCB, BID, EIB, MBB, ACB, CTG, VPB
- Real Estate: VRE, VIC, D2D
- Steel: HSG, NKG
- Aviation: HVN, ACV
- Tech: FPT, SiS
- Securities: VCI, VDC, SSI, HCM
- Pharma: VHM, DAG
- Utilities: POW, PPC, JSH
- Agriculture: BDI, DLC

**Action:**
1. Use `add_to_watchlist` tool (src/interface/mcp/tools/system/watchlist.ts) to insert 30 tickers
2. Set default alert thresholds: `dropPct=-3, risePct=5, impactScore=5`
3. Verify count: `SELECT COUNT(*) FROM watchlist` should return 30

**1b. Backfill Q4 2025 BCTC data**

After watchlist is restored, queue all 30 tickers in `bctc_vps_queue` for Q4/2025 fetch:

```sql
INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
SELECT ticker, 2025, 'Q4', 'pending', 0
FROM watchlist
WHERE ticker NOT IN (
  SELECT DISTINCT action_code FROM financial_reports WHERE period_year=2025 AND period_quarter='Q4'
)
```

---

## Acceptance Criteria

- [ ] `watchlist` table has exactly 30 rows post-insertion
- [ ] All 30 tickers have name, sector, exchange filled
- [ ] Alert thresholds set uniformly (dropPct=-3, risePct=5, impactScore=5)
- [ ] `bctc_vps_queue` has ~28 pending Q4/2025 entries (FPT, VCB may already exist)
- [ ] Unit test added: `src/__tests__/1343a-watchlist-restore.test.ts` covers:
  - Insert 30 tickers
  - Verify COUNT(*) = 30
  - Verify bctc_vps_queue enqueue for missing Q4 reports

**Test baseline:** +1 test file (+10–15 assertions)

---

## Technical Notes

- No schema changes needed (watchlist table exists from Sprint 082)
- Use existing `add_to_watchlist(ticker, name, sector, exchange)` RPC tool
- Default thresholds match user's original config (from Sprint 054 memory)
- Q4 backfill uses SQL UNIQUE constraint to avoid duplicates

---

## Blockers

None. Ready to code.

---

## Next Task

→ 1343b (RED tests for HOSE PDF discovery fix)
