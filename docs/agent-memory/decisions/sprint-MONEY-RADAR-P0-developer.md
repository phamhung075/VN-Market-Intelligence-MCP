# Decision Journal — Sprint MONEY-RADAR-P0 · developer

**Sprint goal:** Money Radar composite scoring + TA endpoint correctness (money-flow-oscillators, roc-momentum) on a correct watchlist universe.
**Agent:** developer
**Started:** 2026-07-11T10:55:00Z

---

### STEP developer-S1 · developer · 2026-07-11T10:57:00Z
**task-id:** WATCHLIST-DB-SYSMAP-DRIFT-FIX
**what-done:** Zone-checked task, found all touched files under apps/mcp-server/, routed to dev-mcp-server instead of implementing (Step 0 zone_dispatch); flipped board ready→in_progress; appended root-cause pre-analysis to handoff.
**what-considered:**
- Implement myself (handoff said zone:cross-service) — rejected, grep confirms seedWatchlist.ts/schema.ts/SqliteWatchlistRepository.ts/watchlistReadStore.ts all live in apps/mcp-server/, a matched specialist zone.
- One-time DB resync only vs also fixing seedWatchlist.ts's hardcoded WATCHLIST_SEED — chose "also fix seeder": schema.ts:202 runs seedWatchlist() unconditionally every non-test init, so a pure resync self-reverts on next restart.
- VNH: keep with corrected sector vs remove as orphan — chose remove, VNH absent from system-map.json entirely; TLDR/AC-2 group it with VEA under the 18-row orphan bucket.
**why-decision:** system-map.json is project SSOT (never hardcode ticker lists); seeder must derive from it to prevent re-drift. Zone rule is non-negotiable (never code inside a matched dev-* zone).
**why-change:** handoff's `zone: cross-service` was inaccurate — corrected to apps/mcp-server/ after grep-verifying every candidate file's actual location.
