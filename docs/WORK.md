
---
## [Developer] 2026-05-18 — Task 1941a: cashFlowTool OCF API-bridge preference fix

`get_cash_flow` now reads `operating_cash_flow` (vnstock API bridge) before `operating_cf` (OCR/PDF). VCB Layer-7 ratio fixed: 1.23e15 → 9,947,260 triệu VND, OCF/NI ratio = 1.15 (passes guard). FPT OCF fixed (4,108,450); ratio still suppressed due to separate NI OCR extraction bug. 17 cashflow tests pass. Docker rebuilt.

---
## [Digest & Predict] 2026-05-05 21:32 UTC — DAILY digest ABORTED (bootstrap unreachable)

**Trigger**: scheduled `vn-digest-writer` (daily 15:30 UTC slot, fired ~6h late at 21:32 UTC).
**Flow**: `.claude/flows/digest-predict/daily.md` step 0 (cycle-bootstrap).
**Status**: STOPPED at step 0 per fail-loud protocol. No digest sent. No predictions emitted. No Telegram traffic on `market` or `bug` channels.

**Blocker — MCP unreachable from scheduler runtime**:
- `https://zenmidi.com/mcp` → DNS resolves to `127.0.0.1`, port 443 connection refused.
- Project `.mcp.json` is `{"mcpServers": {}}` — no servers registered for the gateway.
- Tried `call_tool` against candidate server names {`zenmidi`, `vn-mcp`, `vn-market-intelligence`, `market-intelligence`, `default`, `meta`}: all returned `unknown server`.
- Consequence: `get_cycle_bootstrap`, `get_market_summary`, `send_telegram`, and `submit_feedback` are all unreachable. Cannot even fail-loud to `bug` channel via Telegram.

**Pipeline state**: `docs/pipeline-state.json` was `idle` at run start (last update 2026-05-05 06:30 UTC by `dev-team-cron`). Not modified by this run — no agent chained.

**Notes / reasonable choices made autonomously**:
- Did NOT fabricate Nhân Hòa score, regime signals, VN-Index level, FX/commodity values, Kinh Dịch hexagrams, or chain findings. The flow is built around real market context; synthetic numbers would corrupt the prediction track record and violate `cycle-bootstrap/SKILL.md` ("stale context produces worse signals than silence").
- Did NOT spawn `ops` — interdiction allows it, but no agent-spawn mechanism is wired into a cowork scheduled-task runtime; the dispatch table in `CLAUDE.md` assumes an interactive PO loop. Recording the blocker in WORK.md is the only sink reachable here.
- Did NOT touch `pipeline-state.json` — keeping it `idle` is correct; this run made no progress toward any task.

**Next action required (for next live human/PO cycle)**:
1. Verify `zenmidi.com/mcp` is actually serving from the runtime that hosts the scheduler (not just from a developer workstation).
2. Either populate `.mcp.json` with the correct server entry for the VN MCP, or wire the scheduled-task runtime to the same gateway the interactive cowork session uses.
3. Re-run the daily flow once bootstrap responds; the Mon-prediction window is missed for this week unless the Monday flow ran independently.


- **Fired**: 1 (GAS price_anomaly signal_id=1654 ✓)
- **Pending Schema Fix**: 4 (VIC, FPT chain_catalyst; HPG cross_validate; Gold urgent_news)
- **Watchlist hits**: 8 stocks across 5 sectors
  - **Bullish**: VIC (+6.88% | Pyn Elite fund top holding), FPT (Intel partnership), HPG (leadership call)
  - **Bearish**: GAS (-3.07% | fuel retail margin pressure), Gold sector (fund liquidation cascade)
- **Market context**: VN open (05:50 UTC), 4 alerts pending, real estate + banking strong
- **Next**: Market event trigger or 05:45 UTC cycle continues

---
## [PO] 2026-04-28 — TASK-1380 reclassified

TASK-1380 updated: [DATA] → [BUG]. Root cause confirmed by ops: alert_engine fires change_pct calculations during pre-open window (00:00–02:00 UTC) against an inconsistent reference price. GAS feed is fresh and VPS is healthy — no data loss, no stale feed. Bug logged as log_fix id 193. Fix: suppress change_pct alerts outside VN trading window (02:00–09:00 UTC) or validate reference price matches prior session close before firing. Recurrence check: 0 prior alert_engine pre-open commits — first occurrence, no ARCH REVIEW flag.

---
## [News Scout] 01:37 UTC — 1 signal analyzed
- Fired: 1 (VIC fundamental_validation)
- Suppressed: 2 (FPT earnings, OIL macro — schema validation pending)
- Analysis chains traced: 3 (FPT, VIC, OIL)
- Watchlist impact hits: 8 stocks across 4 sectors
- **Next**: Continue 15-min cycle at market open (02:00 UTC)

---
## [News Scout] 01:36 UTC — 30 items analyzed
  Fired: 2 signals (1 chain_catalyst: "Sell in May" macro warning + 1 urgent_news: BVH earnings)
  Suppressed: 0 | Pending validation: 1 (existing VIC price_drop from market-watcher)
  Regime: NEUTRAL + FII_OUTFLOW_RISK (hot money risk flagged)
  Next: 01:45 UTC (15-min cycle) | Watchlist: 34 tickers monitored

## [Developer] 2026-05-14 — 1916a-vps-part: add GET /proxy/bctc-discover/:ticker to vps-proxy-server.js — deployed to VPS 125.212.251.27:8765, 200+[] with key / 401 without key — branch task/1916a-vps-discover-route commit 1b8f8cd5

## [Developer] 2026-05-22 — 1970-ta-ohlcv: taOhlcvBackfillJob added — daily 01:30 UTC cron, INSERT OR REPLACE heals 1972-era low=0 corrupt rows, TA_MIN_ROWS=35, 10 tests GREEN, tsc clean — apps/mcp-server
