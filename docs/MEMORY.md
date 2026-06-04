# Unified Agent — Memory Index

## System Status (Last Updated: 2026-05-10 04:47 UTC)

### ✓ MCP Infrastructure RECOVERED (04:47 UTC 2026-05-10)
- **Status**: 🟢 **GREEN** — MCP gateway responsive
- **Recovery time**: 04:47 UTC (automated QA Responder cycle verified gateway connectivity)
- **Previous false alarm**: Marked OFFLINE May 7–10, but infrastructure now operational
- **Root Cause**: Previous status was stale; recovery occurred before verification

### Recent Activity
- Unified Agent working memory → [docs/agent-memory/notebooks/unified-agent.md](docs/agent-memory/notebooks/unified-agent.md)
- Alert Commander working memory → [docs/agent-memory/notebooks/alert-commander.md](docs/agent-memory/notebooks/alert-commander.md)

## Schedule

**Market Cycles (Mon–Fri):** 01:00 | 02:00 | 03:30 | 04:30 | 06:00 | 07:30 | 08:30 UTC  
**Daily Review:** 23:00 UTC  
**Prediction Review:** 01:00 UTC daily  
**Weekly Review:** Sun 23:30 UTC

## Known Issues (As of 02:00 UTC 2026-05-10)

1. **🔴 CRITICAL: MCP Infrastructure Offline (5+ days)** 
   - MCP server (localhost:3000) NOT responding ✗
   - Cloudflare tunnel (zenmidi.com) NOT responding ✗
   - Docker services offline
   - **Impact**: ALL unified agent flows blocked since 2026-05-07
   - **Requires**: Ops team immediate intervention

2. **CRITICAL: Alert Quality** — 1% accuracy (303 alerts, 3 hits) — signal noise 33:1
   - Requires QA review of alert pipeline
   - Issue filed to @po
   - **Status**: Blocked by MCP offline

3. **CRITICAL: Portfolio Concentration** — 100% FPT position, -9.8% loss
   - Despite 32 stocks with STRONG conviction
   - Requires rebalancing plan confirmation
   - **Status**: No new analysis since May 9 (MCP blocked)

4. **MEDIUM: Price Anomaly Detection DISABLED** (Issue #1862j)
   - σ data stuck at 2/30 for 5+ hours
   - Risk: Market opens Mon 02:00 UTC with detection offline
   - Claimed by @po (fallback feedback)

5. **MEDIUM: FII Outflow Risk** — VND carry spread -33bp
   - Monitor FPT/BID/VCB for FII selling pressure
   - **Last Update**: May 9 19:00 UTC

---

**Current Status (08:01 UTC 2026-05-10):**
- 🟢 **Infrastructure ONLINE** — MCP gateway verified responsive (recovered 04:47 UTC)
- Cycle: Prediction Review Recovery (08:01 UTC) — COMPLETE ✅
- Next trigger: Daily Review 23:00 UTC; Weekly verification Sun 23:30 UTC
- Alert queue: Monitoring nominal (0 urgent signals)
- Portfolio: No new risk signals since May 9 (pre-recovery logs may be stale)
- Prediction Markets: 1 active claim (China/Taiwan/GTA VI, ends 2026-07-31); 0 resolved yet
- Recovery Status: see [unified-agent notebook](docs/agent-memory/notebooks/unified-agent.md) ✅
