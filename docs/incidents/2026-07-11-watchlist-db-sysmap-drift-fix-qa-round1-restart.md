# Restart-Only Remediation: WATCHLIST-DB-SYSMAP-DRIFT-FIX QA Round 1 (2026-07-11T14:06-14:07Z)

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Task**: technical-analysis service restart to re-read corrected watchlist DB (41→33 rows)

**Context**: mcp-server already swapped + verified; DB resynced 41→33; technical-analysis (Go, port 5003) reads WATCHLIST_TICKERS env on startup (unset), falls back to DB table → stale state persists until restart.

**Execution**:
1. `docker compose restart technical-analysis` (single service ONLY) → Container restarted
2. Startup log verification: `resolved from DB watchlist table, count:33` ✓ (old logs showed count=41)
3. Post-restart serving verify:
   - `/ta/roc-momentum`: 33 unique tickers ✓
   - `/ta/money-flow-oscillators`: 33 unique tickers ✓
   - Stale entries (BDI,DLC,GVR,JSH,SIS,VDC,VEA,VNH): 0 present in both endpoints ✓

**Status**: ✓ COMPLETE (restart gate-passed, serving verified, telegram sent)
**Next**: QA round 2 verification

Zone: `apps/technical-analysis/` | Service: Go/port:5003 | Transport: docker-compose single-service restart
