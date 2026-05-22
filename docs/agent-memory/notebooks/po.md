# PO Notebook

## Last updated: 2026-05-22T04:20:28Z · Cycle: c248 — USER-BUG direct-prompt triage (RSI/MACD/BB live không fetch được)

### c248 trigger
User direct prompt (Vietnamese, non-Telegram): "RSI/MACD/BB live không fetch được trong session phân tích." Bypasses normal channel-audit path — triaged immediately as priority input. Drain = 2× cowork-fire heartbeats (informational, 02:50Z + 03:05Z).

### Triage probe chain (live evidence — not speculation)
1. **docker compose ps** — all 12 containers UP healthy incl. technical-analysis (port 5003, 32h uptime).
2. **TA service direct probe**: `POST http://localhost:5003/ta/indicators {code:"VIC",days:120}` → returned `{rsi:42.4, macd:null, ma5/20, bollingerBands{upper/mid/lower}, trend:"BEARISH"}` in <100ms. Service NOT down.
3. **MCP gateway probe**: `tools/call get_technical_indicators {code:"VIC"}` → returned `"[VIC] Không đủ dữ liệu kỹ thuật — Tìm thấy 22 nến (cần tối thiểu 35 cho MACD). TA: en attente (22/35 bougies)"`. This is the candle-guard from task 1803 (file `apps/mcp-server/src/__tests__/1803-ta-candle-guard.test.ts`).
4. **DB query** on `/app/data/market.db` daily_ohlcv table (the source after task 1850a migration): **ALL 30 watchlist tickers have 22 candles** (VIC/VCB/FPT/HPG/GAS/VHM/VRE/KBC = 22, NVL/KBC/MWG = 21), date range 2026-04-23→05-22 (~22 trading days). MACD needs ≥35.
5. **Notebook grep** (market-watcher / financial-analyst / unified-agent / news-scout): ZERO occurrences of "RSI/MACD/BB fetch fail" symptom. Market-watcher uses sigma-on-price anomalies and never quotes indicator values — silent degradation confirmed.
6. **mcp-server logs** `[ohlcv-probe] backfill complete — fetched=1199250 skipped=0 errors=1` at 03:52Z. But 26min later, daily_ohlcv watchlist counts unchanged at 22. Hypothesis: backfill writes intraday ticks awaiting `ohlcvDailyAggregator` (cron `0 15 * * 1-5`, next fire 22T15:00Z) OR writes to wrong table.

### Decision
**BATCH=NOTHING (queue-as-OPEN-row).** WIP=2/2 full (1960-DAILYDASH OBSERVE + 1965d-JANITOR-PATHFIX DISPATCHED). Cannot dispatch 3rd. Queued **1970-TA-OHLCV-BACKFILL** S-M dev-mcp-server with full AC-1..AC-5 spec in signal payload. Dispatch eligibility = earliest of (a) 1965d ships qa-approved OR (b) DAILYDASH AC-5.2 cron passes 22T16:30Z. Recurring-bug-escalation NOT triggered (only 1 OHLCV commit in 14d). NFR-3 BCTC freeze NOT touched.

### Why USER-BUG even with WIP=2/2
Bug has been silently degrading EVERY analyst cycle for the entire data window (since 2026-04-23 when daily_ohlcv started). User noticed today because they actually checked an analyst-session output. Not a 30-min escalation; queue + wait one WIP cycle is acceptable.

### Actions completed this cycle
- docs/signals/po-c248-cron-0420Z-batch-nothing.json emitted with full triage evidence + queued task spec.
- DASHBOARD header refreshed to c248 narrative; ## po: c248-USER-BUG row prepended with QUEUED-1970 status; c247-BATCH preserved as DISPATCHED.
- Notebook overwrite.
- TASKS.md row NOT inserted yet — will insert at dispatch time (when WIP frees) to avoid orphan-row noise in BLOCKED list.

### Gates standing (unchanged from c247)
- `2026-05-22T16:30Z` — 1960-DAILYDASH AC-5.2 cron-fire gate (releases 1 WIP slot if PASS).
- `2026-05-22T21:00Z` — OBSERVE-1955e DEEP-HOLD unlock → 1967-06 + watchdog-4 actionable.
- `2026-05-23T03:00Z` — tasksMdJanitor cron #2 (verifies 1965d).
- `2026-05-23T07:05Z` — OBSERVE-1957d BCTC 72h cadence.
- `2026-05-23T18:00Z` — 1965c soak ends.
- BCTC NFR-3 freeze (1953-G-FAIL).
- Standing OBSERVE: 1957d, 1955c, 1955e, 1907a-verify, 1941b, 1922g.

### Next dev-team triggers
1. When dev-mcp-server claims 1965d → on qa-approval, immediately dispatch 1970-TA-OHLCV-BACKFILL.
2. `15:00Z` — ohlcvDailyAggregator cron fires (Mon-Fri). Re-probe daily_ohlcv after fire to test hypothesis (1) — if VIC count jumps 22→23 it confirms aggregator only adds today's bar, not history; if no change → hypothesis (2) wrong-table is more likely.
3. `16:30Z` — DAILYDASH AC-5.2 cron-fire gate (releases 2nd WIP slot if PASS).

### Lessons (carry-over)
- **L59 (NEW c248)**: User-prompt bugs need live MCP-gateway probe + DB-row count BEFORE writing root-cause. The user said "fetch failed" — actual cause was "data source has 22 candles, tool's 35-min guard fires". Service-down assumption would have been wrong: technical-analysis container was UP and `/ta/indicators` worked perfectly with `days=120`. The tool path mcp-server uses is local-SQLite, NOT the service.
- **L60 (NEW c248)**: Silent degradation can hide in agents' default fallback behavior. market-watcher uses sigma-on-price ALWAYS in its notebook and never logs a TA-failed error — because the candle-guard returns a soft text message, not a thrown exception. Add a self-check skill that emits a BUG signal when an agent receives "en attente" for ≥80% of watchlist tickers in a single cycle.
- L58: when ≥2 fixes hit same anti-pattern in <24h, do NOT auto-escalate — first grep blast radius. Only escalate when pattern is invisible/spreading. (Still valid — 1970 is a different module path so not a recurring-bug case anyway.)
- L57: dispatcher NOTHING hints are SUGGESTIONS. (Still valid.)
- L56: system-auditor data_stale rows often self-resolve via downstream evidence. (Still valid.)
- L55: cowork-lane drain != dev-team backlog. (Still valid — 2 heartbeats this cycle were informational.)
- L42..L54 retained.
- WIP cap 2/2 STILL reached this cycle (DAILYDASH OBSERVE + 1965d DISPATCHED). No 3rd dispatch.
- BCTC NFR-3 freeze; 1954c next structural unlock.
