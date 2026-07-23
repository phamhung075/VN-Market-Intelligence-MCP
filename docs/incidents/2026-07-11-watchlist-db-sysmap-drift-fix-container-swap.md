# Docker Container Swap: WATCHLIST-DB-SYSMAP-DRIFT-FIX (2026-07-11T13:48Z)

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Task**: Execute mcp-server container swap (user-gated lane) — deploy code fix 91ef0ac74 (seedWatchlist.ts SSOT derivation).

**Context**: Code fix already shipped; DB already one-time resynced (33 rows exact SSOT match); image already built (1c5845d64406). Running container still has OLD hardcoded seeder baked in; any restart without swap re-seeds drift. Swap required for durability + live serving freshness.

**Execution**:

1. **Pre-swap state** (13:47Z):
   - Current image: sha256:358ae13be48ea99c14a4434b0e213387d57443254bb6ccbb3052c0bc12068983
   - Uptime: 31 hours
   - Health: healthy

2. **Swap** (13:48Z):
   - Command: `docker compose up -d mcp-server` (single-service, no down, no --force-recreate)
   - Result: Container recreated, image 1c5845d64406 deployed

3. **Post-swap verification**:
   - Image ID: ✓ sha256:1c5845d644062a79973edb058dd85e7121229502d95a36da3c9b7cbf0a0b2ac5 (matches 1c5845d64406 prefix)
   - Health endpoint: ✓ status=ok, uptime=43.2s, toolCount=183
   - get_watchlist: ✓ 33 tickers served (SSOT active set), no VNH/VEA (inactive)/GVR (orphan)
   - Rowcount stable: ✓ re-checked 2× (both 33), no orphan re-insertion post-init

**Status**: ✓ COMPLETE (container healthy, serving verified, telegram sent)

Zone: `apps/mcp-server/` | Code commit: 91ef0ac74 | Image: 1c5845d64406

---
