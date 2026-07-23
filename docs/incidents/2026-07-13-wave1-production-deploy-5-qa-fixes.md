# Wave-1 Production Deploy: 5 QA-verified fixes (2026-07-13T16:04:43Z)

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Status:** ✓ DEPLOYED and VERIFIED
**Build:** `docker compose up -d --build mcp-server`
**Bundled Fixes:**
  - 599f4aee0: backfill done-count
  - 1bbc8cead: startup candle guard
  - 252f8ffd1: bootstrap execSync projectRoot
  - 727648e6a: bctc news-chain fallback-id orphan
  - 8f6dae658: VCB dead-row guard

**Pre-Deploy State:** mcp-server running (healthy, RestartCount=0), recovered from P0 SQLite corruption 40min prior

| Metric | Before | After | Status |
|--------|--------|-------|--------|
| Image SHA | sha256:1c5845d6... | sha256:ffc7c01e... | ✓ Changed |
| Container State | running | running | ✓ Healthy |
| RestartCount | 0 | 0 | ✓ No crash |
| Watchlist Tickers | 33 | 33 | ✓ Serving |
| Market Snapshot | fresh | 2026-07-13T16:04:43Z | ✓ Current |

**Stability Watch:** 3+ min continuous status checks post-deploy — no restarts, clean logs (no SQLITE_CORRUPT).

**Serving Verification:**
- `get_watchlist()`: 33/33 tickers returned (DBC, DPM, KDC, MSN, SAB, VNM, VJC, BID, EIB, SHB, VCB, DGC, HUT, DAG, BSR, PLX, DIG, DXG, KBC, KDH, NVL, PDR, VHM, VIC, VRE, FRT, SSI, VCI, VIX, VND, HPG, FPT, GEX)
- `get_market_snapshot()`: VN-Index 1,800.54 -1.52%, breadth 50↑/263↓/48→, HOSE turnover 21,803B (+28.2%), fetchedAt=2026-07-13T16:04:43Z ✓

**Next Step:** router will route review[]→done_verified lane flips to po (per ops standing protocol — ops does not touch orch-state.json).

Zone: mcp-server image rebuild + container lifecycle | Deploy duration: ~180s wall-clock

---
