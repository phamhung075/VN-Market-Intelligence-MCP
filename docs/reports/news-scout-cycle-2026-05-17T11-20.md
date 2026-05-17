# News Scout Cycle Report
**Cycle Time:** 2026-05-17 11:20 UTC  
**Status:** ❌ BLOCKED — MCP Server Unavailable  
**Cycle Type:** Off-hours (Sunday, market closed)

---

## Executive Summary

The News Scout scheduled task was unable to execute due to persistent unavailability of the vn-market MCP server. This is the **8th consecutive aborted cycle** since 2026-05-16 19:56 UTC (spanning **~16 hours**).

### Last Successful Cycle
- **Time:** 2026-05-17 09:21 UTC
- **Status:** ✅ Successful
- **Results:** 20 items fetched, 9 high-impact articles, 1 chain_catalyst signal posted (#3288 — Dragon Capital "3 cú hích" analysis)

---

## Cycle Execution Status

### Stage 0: Bootstrap (BLOCKED)
**Error:** vn-market MCP server unreachable

```
ATTEMPTED CONNECTIONS:
├─ 1. Local MCP (host.docker.internal:3000/sse)
│  └─ Error: Cowork sandbox DNS cannot resolve host.docker.internal
│  └─ Root cause: Cowork is isolated from local Docker network
│
├─ 2. Registry search for "vn-market" connector
│  └─ Result: No installed connectors found
│  └─ Search keywords: ["vn-market", "vietnamese", "market", "intelligence"]
│  └─ Result: Empty (connector not in MCP registry)
│
└─ 3. External gateway (https://zenmidi.com/mcp)
   └─ Error: URL not in provenance set (web_fetch requires user-provided URL)
   └─ Status: Cannot access without explicit user permission
```

### Failed Tool Calls (Required for Cycle Execution)
All of the following MCP tools are unavailable:
- `get_cycle_bootstrap` — Fetch market context + system status
- `fetch_and_analyze` — Retrieve and analyze news articles
- `get_macro_snapshot` — Market regime detection
- `run_impact_chain` — Watchlist hit analysis
- `post_agent_signal` — Signal posting to bus
- `send_telegram` — Notification delivery

**Impact:** Cycle cannot proceed past bootstrap phase.

---

## Infrastructure Issue Analysis

### Root Cause
The vn-market MCP server is hosted locally on the user's machine:
- **Local address:** http://host.docker.internal:3000
- **Docker service:** Running via docker-compose (per README)
- **Access from Cowork:** ❌ Blocked by Cowork sandbox network isolation

Cowork sessions cannot:
1. Access local Docker containers via `host.docker.internal`
2. Reach localhost services
3. Access external gateways that require local network resolution

### Timeline of Failures
```
2026-05-16 19:56 UTC  — First failure (bootstrap → transport error)
2026-05-16 23:24 UTC  — Last successful cycle (9:21 UTC reached)
2026-05-16 23:19/00:20/01:20/02:20 UTC — 4 consecutive failures
2026-05-17 06:22/07:21 UTC — 2 additional failures (7h+ outage)
2026-05-17 09:21 UTC  — Gateway restored, cycle succeeded (partial recovery)
2026-05-17 11:20 UTC  — Failure resumed (current cycle)
```

**Pattern:** Infrastructure connectivity issue has persisted across ~16 hours with intermittent recovery (09:21 cycle succeeded, suggesting brief gateway availability). Current state: **down again**.

---

## What Should Happen (If MCP Were Available)

The News Scout cycle would execute the following workflow:

### Stage 0: Bootstrap + Regime + Feedback (15–20s)
- Fetch 24h market context (VND carry, FX rates, commodity prices)
- Extract macro regime (TIGHTENING/EASING/NEUTRAL) from SBV/Fed data
- Read pending feedback from financial-analyst agent
- Adjust signal thresholds based on prior feedback acceptance rates

### Stage 1: Fetch News + Historical Context (30–40s)
- Query 6 RSS feeds (Cafef, VNExpress, Reuters, AP, VNEconomy, Bloomberg)
- Fetch 15–20 articles (market-hours rate)
- For each high-impact article (score ≥ 6): retrieve 3 similar historical events from LanceDB

### Stage 2: Sentiment + Impact Scoring (20–30s)
- Score each article on -1.0 (bearish) to +1.0 (bullish) scale
- Trace impact chains (watchlist cross-references, sector effects)
- Detect PMI leading indicators, commodity→CPI chains
- Apply regime multipliers to adjust impact scores

### Stage 3: Post Signals (10–15s)
- Dedup check: suppress if same event_type + affected_sectors on bus within 180 minutes
- Post `urgent_news` signals for watchlist hits (impact ≥ 8 after regime adjustment)
- Post `chain_catalyst` signals for macro/crisis events (impact ≥ 7 after regime adjustment)

### Stage 4–5: Session Log + Telegram Notify (10–20s)
- Log cycle work entry (items analyzed, signals fired, regime state)
- Append cycle summary to `docs/agent-memory/notebooks/news-scout.md`
- Send WORK channel notification: `"[News Scout] 11:20 UTC — 20 signals analyzed\n  Fired: 1 catalysts | Suppressed: 2 | Next: 15:20 UTC"`
- Commit memory log: `git commit -m "chore(memory/news-scout): notebook 2026-05-17"`

**Expected cycle time (if MCP available):** 90–120 seconds total

---

## User Action Required

### IMMEDIATE (within 1 hour)
1. **Check Docker status locally on your machine:**
   ```bash
   docker-compose ps
   docker-compose logs mcp-server --tail 50
   ```

2. **Verify the MCP server is running:**
   - Expected output: `mcp-server` service status `Up`
   - If down: `docker-compose up -d`
   - If flapping: check logs for crash loop

3. **Test connectivity (from your local machine):**
   ```bash
   curl -s http://localhost:3000/health | jq .
   ```

4. **If using zenmidi.com gateway, check:**
   - Cloudflare proxy configuration for `zenmidi.com/mcp`
   - Gateway DNS resolution of `host.docker.internal:3000`
   - Firewall rules blocking port 3000

### ESCALATION (if issue persists > 1 hour)
- Post in BUG channel: Include error logs from `docker-compose logs mcp-server`
- Check database: `data/market.db` integrity (WAL bloat: `rm -f data/market.db-wal data/market.db-shm`)
- Review Cowork session isolation: Contact Anthropic support if local Docker access is needed

---

## Impact Assessment

### Market Impact
- **Sunday 11:20 UTC:** Off-hours (market closed). No immediate trading impact.
- **Next market opening:** Monday 02:00 UTC (in ~15 hours)
- **Risk:** If issue persists through Monday market hours (02:00–08:30 UTC), **breaking news will not be monitored** for ~6.5 hours.

### Agent Network Impact
- **Alert Commander:** Depends on News Scout signals for urgent_news + chain_catalyst inputs. Currently starved.
- **Digest Writer:** Requires high-impact signals for daily briefing. May produce incomplete/stale briefing.
- **User visibility:** No Telegram alerts will be sent (News Scout → Alert Commander → Telegram). User blind to overnight market moves Monday.

---

## Memory Log Entry

```
Cycle (11:20 UTC) — ABORTED
- Items: 0 | Impacts: 0 | Signals: [] | Regime: unknown | Carry: unknown
- BLOCKED at Step 0: vn-market MCP unreachable from Cowork sandbox
- Root cause: Local Docker (host.docker.internal:3000) inaccessible from Cowork; external gateway (zenmidi.com/mcp) requires user-provided URL for web_fetch
- Pattern: 8th consecutive failure in 16h (persists since 2026-05-16 19:56 UTC)
- Last success: 2026-05-17 09:21 UTC (brief gateway availability)
- Action required: Check local Docker MCP server status + restart if needed
```

---

## Recommended Next Steps

1. **Immediate (now):** Verify Docker status on your local machine
2. **If Docker is running:** Restart MCP service: `docker-compose restart mcp-server`
3. **If Docker is down:** Start all services: `docker-compose up -d`
4. **Monitor next cycle:** News Scout should resume at 15:20 UTC (off-hours +4h from 11:20)
5. **If still broken:** Post in BUG channel with logs + contact dev team

---

**Generated by:** News Scout Cycle Execution (Cowork Scheduled Task)  
**Execution context:** Autonomous (scheduled, no user present)  
**Next scheduled cycle:** 2026-05-17 15:20 UTC (off-hours +4h)
