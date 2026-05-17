# Alert Commander — Notebook

**Last updated:** 2026-05-17 11:02 UTC | **Sprint:** c154

## This session

### Alert Cycle (10:02 UTC) — Off-hours, market closed
- Off-hours 2h cycle (Saturday early morning, market CLOSED). Bootstrap succeeded — `get_cycle_bootstrap` returned market_context + system_status + agent_signals (0 pending).
- Signals: agent_bus=0 | price_alerts=0 | legal_risk=0 | crisis=0 | price_anomaly=0
- Open alerts: 4 (all LOW priority news mentions: VIC, VHM, HCM, HVN)
- Fired: 0 | Suppressed: 4 (low-priority news) | MARKET: 0
- ChainCatalyst: 0 | Regime confidence: unable to extract (off-hours, prices stale)
- Market snapshot: VN-Index -0.20% (stale from 2026-05-15 08:59), 33 prices stale (>24h)
- Kinh Dịch: KHÔN (2) = BUY signal (100% confidence)
- Legal: clear | Crisis: clear
- WORK dispatch: status posted (10:02 UTC, off-hours suppression, 0 signals fired)
- log_agent_work id=939
- **Off-hours assessment:** Cycle ran during market closure window and off-hours. No actionable signals. 4 news mentions are routine market commentary (Vingroup sector view, housing policy, aviation carbon costs) — all LOW severity. Kinh Dịch is BUY but price data is stale; cannot validate with fresh market data until next market open (02:00 UTC Monday).
- Tool calls this cycle: 9 (log_agent_work×2, get_cycle_bootstrap, get_legal_risk_signals, get_crisis_early_warning, get_alerts×1, get_market_snapshot, get_agent_signals, send_telegram) → estimated_tokens ~3500
- Next cycle: 12:02 UTC (off-hours 2h cadence)

## Patterns noticed

- **Outage recovery scenario:** When MCP gateway returns after multi-cycle outage, the agent_signals bus is empty (signal TTLs likely expired during outage window). First post-recovery cycle therefore observes no carry-over signals — clean slate. Other agents (market-watcher, news-scout) will need to repopulate the bus before alert-commander has anything actionable.
- **Stale analysis warning:** `system_status` reports last analysis 2026-05-16 20:06 (~13h stale). Downstream agents may emit catch-up burst once they recover — expect possible signal flood on next 2-3 cycles. Apply normal regime thresholds; do not pre-suppress.

## Carry-over (next session)

- **Outage post-mortem pending:** Document 10-cycle outage (2026-05-16 23:02 UTC → 2026-05-17 08:02 UTC) root cause in TNB once dev-team confirms resolution. Sprint c154 advanced during outage per pipeline-state.json.
- **Stale alerts queue:** 58 alerts pending at recovery — review on next cycle whether any are still actionable or should be marked-read as expired.
- **ACB FII pressure:** urgent_news ACB (id=3131, conf=0.50) previously suppressed — below NEUTRAL threshold 0.60. Foreign net sold 116M shares in one month. Watch for verified_chain if selling continues + price drops.
- **FPT persistent surge:** FPT price_anomaly appeared every cycle pre-outage (id=3134→3138→3140). Confidence 0.50, σ approaching 4.0 override floor. If σ ≥ 4.0 AND impact_score ≥ 6 on next signal → override triggers → MARKET alert. Catalyst: US Nasdaq record + FPT 12% US revenue exposure.
- **GAS surge (stale):** GAS +6.97% open session pre-outage (81,800→87,500→84,300). Monitor for σ ≥ 4.0 price_anomaly from market-watcher when fresh data arrives.
- **VCI insider sell:** Fund chaired by Nguyễn Thanh Phượng sold all VCI shares. Monitor for verified_chain escalation — insider event qualifies as always-MARKET if confirmed.
- **PC1 legal news (2026-05-16):** Chairman/CEO arrest reported in news_context (bearish, score 6.0) but `get_legal_risk_signals` returned empty — confirm news-scout has emitted urgent_news/legal_risk signal next cycle. If absent, escalate to BUG (signal extraction gap).
- **CARRY_REGIME=FII_OUTFLOW_RISK:** VND carry spread -0.33% persists. Apply TIGHTENING thresholds; include carry caveat in any MARKET bull alert.
- **BCTC overdue:** 37 stocks overdue Q4-2025 (some 29d+). Watch for regulatory action escalation to legal_risk signal.

### Alert Cycle (11:01 UTC) — Early trigger, MCP blocked
- **Status:** BLOCKED — MCP connector (vn-market) not available in this Cowork session
- **Reason:** Scheduled task triggered by system automation, but MCP integration not configured
- **Required:** Set up MCP connector in Cowork settings → connector URL `https://zenmidi.com/mcp`
- **Impact:** Cycle cannot execute — no bootstrap, no signal matrix, no MARKET/WORK dispatch
- **Next scheduled cycle:** 12:02 UTC (on 2h off-hours cadence) — will attempt again if MCP available
- **Fallback:** Manual intervention required — either:
  1. Configure MCP connector in Cowork Desktop app, or
  2. Run alert-commander from Claude Cowork web interface with MCP pre-configured

### Alert Cycle (20:28 UTC, 2026-05-17) — Scheduled task, MCP unavailable
- **Status:** BLOCKED (AUTOMATED CYCLE) — MCP connector not available in this Claude session
- **Trigger:** Scheduled task auto-run (off-hours 2h cadence after 10:02 UTC)
- **Stage 0 (Bootstrap):** SKIPPED — cannot call get_cycle_bootstrap without MCP
- **No signal evaluation possible** — blocked at Stage 0a (dependency: MCP connector)
- **No Telegram dispatch** — MARKET/WORK channels not updated
- **Log entry:** This cycle was triggered automatically per schedule but could not proceed
- **System note:** Alert Commander requires MCP connector configured in Cowork app. Without it, scheduled cycles will repeatedly fail. Current workaround: manual trigger from Cowork web interface with MCP pre-connected, or configure MCP in desktop app settings

