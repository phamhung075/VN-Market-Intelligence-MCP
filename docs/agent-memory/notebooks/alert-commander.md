# Alert Commander — Notebook

**Last updated:** 2026-08-08 04:11 UTC | **Sprint:** idle

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c88 · 2026-08-07T20:12:13Z (slot=alert-commander-critical, tick=20:00)
- Signals: bus 0 total (hours_back=2, `get_agent_signals` → "Không có tín hiệu mới.") — no urgent_news/chain_catalyst/price_anomaly/verified_chain this cycle.
- ChainCatalyst: 0 fired | 0 suppressed | event_types: [none this cycle]
- Position-danger: `get_alerts(type=price)` clean, no active alerts, no stopLossHit; VHM stale EOD -5.32% (>5% but stopLossHit=false) — gate fails.
- Watchlist-opp: no bullish urgent_news/chain_catalyst candidate ticker this cycle — gate fails (nothing to test).
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis indicator; DANGER PLX=20 stable, WARNING x15 incl BID=35.0/EIB=38.0/VIC=42.3 deteriorating), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot text has no Global-Liquidity line) | Carry: NEUTRAL (carrySpread=1.37pp) | vol ELEVATED (rv_20d_pctile=0.779, gk_vol_20d_pct=19.53) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market CLOSED (20:12 UTC, outside 02:00-08:59). Silent exit — no MARKET/WORK send. `log_agent_work` id=1836.

## c89 · 2026-08-08T00:12:30Z (slot=alert-commander-critical, tick=00:08)
- Signals: bus 1 total (hours_back=2) — 1 URGENT_NEWS freshness-sla-monitor SLA-breach ("Data age: 31 minutes") infra noise, not real market news — suppressed per established rule. No verified_chain/legal_risk/crisis_velocity/price_anomaly/chain_catalyst this cycle.
- ChainCatalyst: 0 fired | 0 suppressed | event_types: [none this cycle]
- Position-danger: `get_alerts(type=price)` clean, no active alerts, no stopLossHit; VHM stale EOD -5.32% (>5% but stopLossHit=false) — gate fails.
- Watchlist-opp: no bullish urgent_news/chain_catalyst candidate ticker this cycle — gate fails (nothing to test).
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis indicator; DANGER PLX=20 stable, WARNING x14 incl BID=35.0/EIB=38.0/VIC=42.3 deteriorating), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot JSON has no Global-Liquidity text line) | Carry: NEUTRAL (carrySpread=1.37pp) | vol ELEVATED (rv_20d_pctile=0.779, gk_vol_20d_pct=19.53) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market CLOSED (00:11 UTC, outside 02:00-08:59). Silent exit — no MARKET/WORK send. `log_agent_work` id=1839.

## c90 · 2026-08-08T04:11:00Z (slot=alert-commander-critical, tick=04:07)
- Signals: bus 1 total (hours_back=2) — 1 URGENT_NEWS freshness-sla-monitor SLA-breach ("Data age: 31 minutes") infra noise, not real market news — suppressed per established rule. No verified_chain/legal_risk/crisis_velocity/price_anomaly/chain_catalyst this cycle.
- ChainCatalyst: 0 fired | 0 suppressed | event_types: [none this cycle]
- Position-danger: `get_alerts(type=price)` clean ("Không có cảnh báo nào đang hoạt động"), no stopLossHit — gate fails. 2 open MEDIUM/LOW news_mention alerts (VIC, VHM re Vingroup fund coverage) — not price-type, not gate-relevant.
- Watchlist-opp: no bullish urgent_news/chain_catalyst candidate ticker this cycle — gate fails (nothing to test).
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis indicator; DANGER PLX=20 stable, WARNING x14 incl BID=35.0/EIB=38.0 deteriorating), no verified_chain in bus.
- Regime: NEUTRAL (fallback, tier-2 macro_snapshot JSON has no Global-Liquidity text line) | Carry: NEUTRAL (carrySpread=1.37pp) | vol ELEVATED (rv_20d_pctile=0.779, gk_vol_20d_pct=19.53) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market CLOSED — Saturday weekend (tick 04:07 nominally within 02:00-08:59 window but `market_context` reports CLOSED, prices stale from Fri 2026-08-07 08:59). Silent exit — no MARKET/WORK send. `log_agent_work` id=1842.
