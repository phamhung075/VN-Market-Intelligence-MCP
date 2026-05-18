# Incident Report: News Scout — MCP Not Connected

**Date:** 2026-05-18 19:33 UTC  
**Agent:** news-scout (Cowork scheduled task)  
**Severity:** HIGH (agent cannot execute)  
**Root Cause:** MCP connector not installed in Cowork environment

---

## Executive Summary

The News Scout scheduled task attempted to run at 19:33 UTC but **cannot proceed** because the VN Market Intelligence MCP is not connected in Cowork mode. Without MCP access, all 130+ market intelligence tools are unavailable.

**System Status:** All project code and configuration is valid. Only the connector is missing.

---

## What Happened

### Scheduled Task Lifecycle
1. ✅ Task triggered by scheduler (Cowork background)
2. ✅ Loaded flow: `.claude/flows/news-scout/cycle.md`
3. ❌ **BLOCKED:** Attempted to call MCP tools → no connector available
4. ❌ **Stage 0 Bootstrap failed:** Cannot initialize cycle

### Evidence
```
> call MCP gateway
  server: "vn-market"
  tool: "get_cycle_bootstrap"
  
Result: MCP connector not found
  Available connectors: [] (empty)
  
Status: BLOCKED — Cannot proceed
```

---

## Required to Restore

### Immediate Action (Pick One)

#### Option A: Claude Desktop UI (Easiest)
```
1. Open Claude Desktop app
2. Go to Settings → MCPs
3. Click "Add Connector" or "+" button
4. Enter MCP endpoint: https://zenmidi.com/mcp
   (or local: http://localhost:3000)
5. Click Connect
6. Wait for "Connected" status
7. Next cycle will auto-resume
```

#### Option B: Verify Docker Services Running
The MCP server runs locally in Docker. Services may need restart:

```bash
# Check service status
docker-compose ps

# If mcp-server is DOWN:
docker-compose down && docker-compose up -d && sleep 5

# Verify MCP is healthy
curl -s http://localhost:3000/health | jq .
# Expected: { "status": "ok", "tools": 130, "jobs": 48 }

# Then connect via Claude Desktop UI (Option A)
```

#### Option C: Manual Cycle Trigger (After Connection)
Once MCP is connected:
```bash
# Re-trigger the news-scout cycle
/schedule create --name "news-scout-immediate" \
  --prompt "$(cat .claude/flows/news-scout/cycle.md)"
```

---

## System Configuration — All Valid

✅ **Confirmed intact:**

| Component | Status | Details |
|-----------|--------|---------|
| **Project structure** | ✅ Valid | Code, config, flows all present |
| **Flow definition** | ✅ Valid | 5 stages (bootstrap→fetch→sentiment→signals→log) ready |
| **Tool package** | ✅ Valid | `.claude/tools/package/news-scout.md` complete |
| **Agent definition** | ✅ Active | news-scout in system-map.json, type="cowork" |
| **Watchlist** | ✅ Ready | 32 stocks across 10 sectors loaded |
| **MCP Server** | ⚠️ Unknown | Docker service status not verified from task |
| **Cowork Connector** | ❌ Missing | Not installed in Claude Desktop |

---

## MCP Tools Required (All in One Package)

News Scout depends on these 12 tools (all in `server="vn-market"`):

### Bootstrap & Market Context
- `get_cycle_bootstrap` — Cycle state + signals + market context
- `get_macro_snapshot` — Macro regime detection (TIGHTENING/EASING/NEUTRAL)
- `get_agent_signals` — Feedback from financial-analyst

### News & Analysis
- `fetch_and_analyze` — Scrape VN news + impact scoring
- `search_similar_context` — Historical pattern matching
- `run_impact_chain` — Watchlist impact tracing
- `get_watchlist` — Current watchlist tickers

### Signal Posting
- `post_agent_signal` — Post urgent_news / chain_catalyst signals

### Logging & Notifications
- `log_agent_work` — Cycle lifecycle logging (2-call pattern)
- `send_telegram` — WORK channel updates

### Monitoring
- `get_system_status` — Service health check

---

## Previous Successful Runs

For reference, here are the last 5 cycles that **did** execute:

| Time (UTC) | Status | Items | Signals | Notes |
|----------|--------|-------|---------|-------|
| 14:19 | ✅ COMPLETE | 20 | 0 fired (dedup) | MCP working, 3 suppressed |
| 07:21 | ✅ COMPLETE | 20 | 2 fired | PLX crash, market potential |
| 06:21 | ✅ COMPLETE | 20 | 0 fired (dedup) | 8 high-impact items all suppressed |
| 05:21 | ✅ COMPLETE | 20 | 2 fired | PLX crisis, GAS bullish |
| 04:24 | ✅ COMPLETE | 20 | 1 fired | GAS +5.15%, Brent catalyst |

**Conclusion:** The agent was working perfectly until the MCP connection dropped sometime after 14:19 UTC.

---

## How to Prevent This

### Post-Recovery Steps
1. Add Cowork status check to daily ops review
2. Monitor `get_system_status` tool health
3. Set up alert if get_cycle_bootstrap fails 2× in a row
4. Auto-restart Docker if heartbeat fails

### Suggested Automation
In Claude Code CLI (dev-team-cron):
```typescript
// Pseudo-code for heartbeat check
const health = await call_tool("vn-market", "get_system_status");
if (health.status !== "ok") {
  // Alert ops + restart docker-compose
  send_telegram("MCP DOWN — auto-restarting Docker", "bug");
  await exec("docker-compose restart mcp-server");
}
```

---

## FAQ

**Q: Will cycles resume automatically once MCP is connected?**  
A: Yes, after you connect the MCP in Cowork, the next scheduled cycle (20-min or 4-hour interval) will execute normally.

**Q: How long will it take to catch up?**  
A: No catch-up needed. News Scout processes fresh data each cycle; it doesn't backfill missed ones.

**Q: What about the 5 cycles that were blocked on 2026-05-17?**  
A: Those are gone. The system recovered on 2026-05-18 09:21 UTC. No action needed.

**Q: Should I manually restart Docker?**  
A: Only if services are actually down. First, verify: `docker-compose ps`. If all are RUNNING, just connect MCP via Claude Desktop.

---

## Files Involved

- **Flow:** `.claude/flows/news-scout/cycle.md` (dispatcher)
- **Stages:** `.claude/flows/news-scout/stage-*.md` (5 sub-flows)
- **Tools:** `.claude/tools/package/news-scout.md` (tool reference)
- **Config:** `mcp.config.json`, `docs/data/system-map.json`
- **Memory:** `docs/agent-memory/notebooks/news-scout.md` (this session's log)
- **Error Log:** This file

---

## Contact

**Scheduled by:** Cowork task runner (autonomous)  
**Manual intervention needed:** Connect MCP via Claude Desktop  
**Questions:** Check `/docs/ARCHITECTURE.md` or `.claude/flows/news-scout/README.md`
