# AI Team Setup Guide

## Prerequisites
1. MCP server running: `bun run src/index.ts`
2. Telegram configured in `.env` (bot token + chat ID)
3. Claude Cowork / Claude Schedule account

## Quick Start

### Step 1: Start the MCP Server
```bash
cd /path/to/VN-Market-Intelligence-MCP
bun run src/index.ts
```
Verify: `curl http://localhost:3000/health` → `{"status":"ok","toolCount":24}`

### Step 2: Create 6 Agents in Claude Cowork

For each agent, create a new scheduled task with:
- **MCP Server**: `http://localhost:3000/sse`
- **Prompt**: copy from the corresponding file below
- **Schedule**: as specified in each file

| Order | File | Cron (UTC) | Agent Name |
|-------|------|------------|------------|
| 1 | `01-news-scout.md` | `*/15 2-8 * * 1-5` + `0 * * * *` | News Scout |
| 2 | `02-bctc-collector.md` | `0 1,13 * * *` | BCTC Collector |
| 3 | `03-report-analyzer.md` | `0 2,14 * * *` | Report Analyzer |
| 4 | `04-market-watcher.md` | `*/5 2-8 * * 1-5` | Market Watcher |
| 5 | `05-alert-commander.md` | `*/10 * * * 1-5` + `*/30 * * * 0,6` | Alert Commander |
| 6 | `06-digest-writer.md` | `30 15 * * *` + `0 16 * * 0` | Digest Writer |

### Step 3: Verify
After creating all agents, you should see in your Telegram group:
- "✅ System online" at 08:55 Vietnam time (from Alert Commander)
- Price updates during market hours
- Daily digest at 22:30 Vietnam time

## Agent Cooperation Flow

```
07:00 VN  News Scout starts monitoring pre-market news
08:55 VN  Alert Commander sends "System online" to Telegram
09:00 VN  Market Watcher starts 5-min price tracking
09:00-15:30  All agents running at full frequency
15:30 VN  Market closes — Market Watcher slows to 30-min
15:45 VN  Alert Commander sends end-of-day summary
20:00 VN  BCTC Collector checks SSC portal
21:00 VN  Report Analyzer processes any new reports
22:30 VN  Digest Writer compiles and sends daily digest
```

## Telegram Output You'll Receive

On a normal trading day (France time):
```
~03:55  ✅ System online (Alert Commander)
~04:00-10:30  Price alerts if any stock moves significantly
~10:45  📊 Market close summary (Alert Commander)
~15:30  📊 Daily Digest with full analysis (Digest Writer)
```

On weekends:
```
Occasional news alerts if significant global events occur
Sunday ~17:00 CET: 📊 Weekly Digest
```

## Troubleshooting

If an agent isn't working:
1. Check MCP server: `curl http://localhost:3000/health`
2. Use the `get_system_health` tool to check circuit breakers
3. Use `get_error_summary` to see recent errors
4. Use `get_tool_log` with the specific tool name for details
