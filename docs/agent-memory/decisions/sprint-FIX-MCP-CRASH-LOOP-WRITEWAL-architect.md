# Decision Journal — Sprint FIX-MCP-CRASH-LOOP-WRITEWAL · architect

**Sprint goal:** Break the mcp-server WAL crash-loop permanently via db/connection-layer checkpoint policy fix
**Agent:** architect
**Started:** 2026-06-14T00:00Z

---

### STEP architect-S1 · architect · 2026-06-14T00:10Z
**task-id:** FIX-MCP-CRASH-LOOP-WRITEWAL
**what-done:** Designed 3-task WAL fix split (BC/A/D) and wrote architecture brief + handoff
**what-considered:**
- Option 1: TRUNCATE only off-hours (existing behavior) — rejected: live-hours FULL mode leaves WAL wedged
- Option 2: RESTART mode — rejected: does not reset WAL file size to zero
- Option 3: increase wal_autocheckpoint — rejected: threshold is already too high (4000 frames = 16 MB); raising it worsens the wedge
- Option 4 (chosen): lower wal_autocheckpoint to 1000 + add `BEGIN IMMEDIATE; COMMIT` before unconditional TRUNCATE every 30 min — forces reader snapshots to expire before TRUNCATE runs
**why-decision:** Passive autocheckpoint is reader-pinned; only TRUNCATE + reader-expiry pattern guarantees WAL drains; 1000-frame threshold makes autocheckpoint trigger 4x more often to slow accumulation between cron fires
**why-change:** no change from plan; root cause confirmed by reading schema.ts:107-110 + checkpoint.ts + startScheduler cron logic
