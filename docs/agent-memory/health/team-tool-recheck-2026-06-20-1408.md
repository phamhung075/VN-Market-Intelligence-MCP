# Team MCP Tool Health Recheck — 2026-06-20T14:08Z

**Run:** 2026-06-20T14:08:42Z (automated scheduled recheck)
**Prior report:** `team-tool-recheck-2026-06-20-1208.md` (2h ago)
**Methodology:** Live probe every depended-on tool via gateway; Step 3b impact grep; Step 3c re-probe every prior finding before carrying forward.

---

## Summary

| Category | Count | vs 12:08Z |
|----------|-------|-----------|
| BUG (re-confirmed active) | 5 | → 0 resolved, 0 new |
| ISSUE (re-confirmed active) | 5 | → 0 resolved, 0 new |
| RESOLVED | 0 | — |
| NON-ISSUE (verified this cycle) | 2 | — |
| IMPROVE (no callers broken) | 3 | — |

All 5 BUGs and 5 ISSUEs from prior report **re-confirmed**. Three data-source BUGs worsening (higher failure counts). BCTC SLA gap +120 min vs 12:08Z.

---

## ACTIVE BUGs — Re-confirmed This Cycle

### BUG-1 — CRITICAL: BCTC VPS pipeline dead (WORSENING)

**Severity:** CRITICAL  
**Status:** WORSENING (+120 min vs 12:08Z)

**Re-probe evidence (14:08Z):**
- `get_sla_status` → `bctc_freshness_minutes: 5363` vs SLA threshold 1776 min → **3× over SLA**
- `get_vps_service_health` → `vn-bctc-fetch: unhealthy | uptime: 3d 20h 2m | response_ms: 0`
- `get_vps_proxy_health` → `bctc: last_push: 2026-06-16T18:02:24Z | status: STALE`
- Prior 12:08Z: bctc_freshness_minutes=5243. Delta: +120 min (continues drifting — no recovery)

**Callers (≥5):** bctc-analyst (flow/main.md), refine_bctc_md (agent), unified-agent (get_bctc_full), system-auditor (SLA check), ops (monitoring)

**Recommended action:** SSH VPS → `systemctl restart vn-bctc-fetch`; check `/var/log/vn-bctc-fetch.log` for crash cause.

---

### BUG-2 — HIGH: HNX & UPCOM all price sources failing (UNCHANGED)

**Severity:** HIGH  
**Status:** UNCHANGED

**Re-probe evidence (14:08Z):**
- `get_system_status` → 10/10 recent errors: `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed`
- `get_pipeline_health` → tickers BDI, DLC, JSH, SIS, VDC → rows=0 (no price data ingested)

**Callers:** market-watcher (get_market_snapshot, get_ticker_intelligence), alert-engine (anomaly detection), intelligenceCycleJob

**Recommended action:** Check HNX/VPS connectivity; verify `hnx-price` scraper service on VPS.

---

### BUG-3 — HIGH: Reuters RSS dead, 179 consecutive failures (WORSENING)

**Severity:** HIGH  
**Status:** WORSENING (was 160 at 12:08Z, +19 failures)

**Re-probe evidence (14:08Z):**
- `get_system_status` → reuters source: `Ngưng | Chưa bao giờ` (stopped, never successfully fetched)
- Consecutive failures: 179 (was 160 at 12:08Z — ~1 failure/cycle, uninterrupted drift)

**Callers:** news-scout (flow/main.md Step 1 news fetch), intelligenceCycleJob

**Recommended action:** Verify Reuters RSS URL validity; check for IP block or feed format change.

---

### BUG-4 — HIGH: TradingEconomics 2 sources dead, 179 failures each (WORSENING)

**Severity:** HIGH  
**Status:** WORSENING (was 160 each at 12:08Z, +19 each)

**Re-probe evidence (14:08Z):**
- `get_system_status` → TradingEconomics sources: 179 consecutive failures each
- `get_macro_snapshot` → `oilDelta: null, goldDelta: null, usdVndDelta: null` (all macro deltas null)

**Callers:** market-watcher (macro risk), news-scout (macro context), unified-agent (CHEF macro layer)

**Recommended action:** Check TradingEconomics API key validity; rate limit or subscription lapse.

---

### BUG-SENTIMENT — HIGH: `get_sentiment_trend({})` broken, unpatched caller (UNCHANGED)

**Severity:** HIGH  
**Status:** UNCHANGED

**Re-probe evidence (14:08Z):**
- Live probe: `mcp__gateway__call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})` → `{"error":"stock_code (or symbol) is required"}`
- Tool requires `stock_code` parameter — calling with empty arguments returns error every time

**Callers (grep confirmed):**
- `docs/agents/fb-market-poster/flow/main.md:118` — calls `get_sentiment_trend` with `arguments={}` (unpatched)

**Recommended action:** Patch `fb-market-poster/flow/main.md:118` to either pass a stock code or iterate over watchlist tickers.

---

## ACTIVE ISSUEs — Re-confirmed This Cycle

### ISSUE-ISM: FRED API key missing (UNCHANGED)

**Re-probe:** `get_ism_subcomponents({})` → `{"status":"no_data","reason":"FRED_API_KEY not configured"}`  
**Callers:** news-scout, unified-agent, bctc-analyst (macro regime signal inputs)  
**Action:** Set `FRED_API_KEY` env var on MCP server.

---

### ISSUE-WTI: Stale WTI price $95.5 (UNCHANGED)

**Re-probe:** `get_system_status` → `wti_crude_usd: 95.5`  
**Reality check:** Brent crude ~$80.59 (June 2026) — $14.91 spread is physically impossible (WTI historically trades at a discount to Brent).  
**Callers:** unified-agent macro layer, news-scout commodity context  
**Action:** Fix TradingEconomics WTI source (same root as BUG-4).

---

### ISSUE-DJIA: Stale DJIA 23,750 (UNCHANGED)

**Re-probe:** `get_system_status` → `dow_jones: 23750`  
**Reality check:** Actual DJIA June 2026 ~42,000+. Value matches pre-COVID 2019/2020 seed data.  
**Callers:** unified-agent macro layer, news-scout  
**Action:** Requires working TradingEconomics or alternate DJIA data source.

---

### ISSUE-SBV-PARSE: SBV HTML parse failing (UNCHANGED)

**Re-probe:**  
- `get_system_status` → recurring `storeSbvSnapshot REJECTED — zero-value` errors  
- `get_vn_liquidity_state({})` → `source: "sbv_rates DB fallback (HTML parse failed)"`, `is_estimate: true`  
**Callers:** intelligenceCycleJob, sbvRatesRefreshJob, market-watcher  
**Action:** SBV website likely changed HTML structure; update CSS selectors in scraper.

---

### ISSUE-LIQUIDITY: All VN liquidity metrics null (UNCHANGED)

**Re-probe:** `get_vn_liquidity_state({})` →  
```
sjc_price_mn_vnd: 0
usd_vnd_buy: 0
usd_vnd_sell: 0
cny_vnd_rate: 0
omo_outstanding_bn_vnd: null
interbank_overnight_rate: null
```
**Root cause:** 100% packet loss to `dttktt.sbv.gov.vn` from VPS (same root as ISSUE-SBV-PARSE).  
**Callers:** system-auditor, market-watcher  
**Action:** Same as ISSUE-SBV-PARSE — fix SBV scraper or use alternate SBV data endpoint.

---

## NON-ISSUEs Verified This Cycle

| Finding | Probe | Verdict |
|---------|-------|---------|
| `get_agent_signals` requires `agent` in inbox mode | All flow callers use `from_agent: null` (all-producers mode) — 0 callers use unguarded inbox call | NON-ISSUE |
| `task_claim` min `ttl_seconds: 60` undocumented | Grep: all flow callers use ≥60s (min: 120s in pm/flow/main.md) — no callers below threshold | NON-ISSUE |

---

## IMPROVE (No Callers Broken)

| Finding | Impact |
|---------|--------|
| `get_bctc_refined` returns `{"error":"no refined units found"}` for empty state — should be `{"units":[]}` | bctc-analyst flow handles gracefully; purely cosmetic |
| `emit_pressure_state` accepts arbitrary `state` strings despite docs saying `normal\|high\|critical` only | No known caller sends invalid values; schema tolerance is harmless |
| `task_claim.md` docs omit minimum `ttl_seconds: 60` constraint | All callers use ≥60s; doc gap only — no runtime impact |

---

## RESOLVED — None This Cycle

No prior findings resolved between 12:08Z and 14:08Z.

---

## Tool Probe Coverage

| Tool | Probe Result | Status |
|------|-------------|--------|
| `get_cycle_bootstrap` | OK (agent_name="market-watcher") | ✅ |
| `get_system_status` | OK — confirms BUG-2/3/4, ISSUE-WTI/DJIA/SBV | ✅ |
| `get_rate_limit_status` | OK | ✅ |
| `get_market_context` | OK | ✅ |
| `get_market_snapshot` | OK (VN-Index data present) | ✅ |
| `get_macro_snapshot` | OK — confirms BUG-4 (null deltas) | ✅ |
| `get_sla_status` | OK — confirms BUG-1 (5363 min) | ✅ |
| `get_pipeline_health` | OK — confirms BUG-2 (rows=0) | ✅ |
| `get_vps_proxy_health` | OK — confirms BUG-1 (STALE) | ✅ |
| `get_vps_service_health` | OK — confirms BUG-1 (unhealthy) | ✅ |
| `get_ism_subcomponents` | FAIL → ISSUE-ISM | ⚠️ |
| `get_sentiment_trend` (empty args) | FAIL → BUG-SENTIMENT | 🔴 |
| `get_vn_liquidity_state` | FAIL → ISSUE-LIQUIDITY | ⚠️ |
| `get_watchlist` | OK (41 tickers) | ✅ |
| `get_positions` | OK | ✅ |
| `get_price_history` (VCB/30d) | OK | ✅ |
| `get_technical_indicators` (VCB) | OK | ✅ |
| `get_insider_signals` | OK | ✅ |
| `get_legal_risk_signals` | OK | ✅ |
| `get_crisis_early_warning` | OK | ✅ |
| `get_fed_liquidity_spread` | OK | ✅ |
| `get_agent_signals` (from_agent:null) | OK | ✅ |
| `task_claim` (ttl_seconds:60) | OK | ✅ |
| `emit_pressure_state` | OK | ✅ |
| `get_bctc_refined` (no units) | OK (graceful error) | ✅ |
| `get_bctc_full` (VCB) | OK | ✅ |
| `get_earnings_calendar` | OK | ✅ |
| `get_prediction_markets` | OK | ✅ |
| `get_sector_rotation` | OK | ✅ |
| `log_agent_work` schema | OK | ✅ |
| `send_telegram` schema | OK (message param confirmed) | ✅ |
