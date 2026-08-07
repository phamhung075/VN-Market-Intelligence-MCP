# Alert Commander — Notebook

**Last updated:** 2026-08-07 07:26 UTC | **Sprint:** idle

**Role:** Event-only alert dispatch (position-danger / watchlist-opportunity / CRITICAL-always) | **Cadence:** `*/15min` market hours (02:00–08:30 UTC) + 4h critical sweep | **Contract:** APPEND class, one `## c<NNN>` section per cycle per `.claude/skills/notebook-write/SKILL.md` AC-6.

> **Structural reset (FIX-ALERT-COMMANDER-NOTEBOOK-SINGLE-BLOB-UNPRUNABLE, 2026-07-29):** prior history archived → `docs/agent-memory/notebooks/archive/alert-commander-archive-20260729.md`. One top-level `## c<NNN> · <ISO-timestamp>` section per cycle now.

## c76 · 2026-08-07T06:56:36Z (slot=alert-commander-market, tick=06:55)
- Signals: bus 0 total (`get_agent_signals` explicit + `get_cycle_bootstrap` `agent_signals[]` both empty — "Không có tín hiệu mới") | 0 chain_catalyst/urgent_news/price_anomaly/verified_chain/legal_risk/crisis_velocity | Fired: 0 | Suppressed: 0 | MARKET: 0
- No exact-tick cycle-snapshot file (freshest `cycle-snapshot-06:15.json` 39min stale, >7min cap) — fell through to direct `get_cycle_bootstrap`/`get_macro_snapshot`/`get_agent_signals` calls per Step -1 fallback path.
- Position-danger: `get_alerts(type=price)` clean, no active alerts, no stopLossHit; max singleDayDrop VHM -4.02% (<5%) — gate fails.
- Watchlist-opp: fresh `get_kinhdich_reading` VNM(GIU 38%)/PLX(GIU 38%)/BSR(MUA 38%)/BID(GIU 38%) — all <<70% NEUTRAL threshold despite VNM+4.58%/PLX+6.97%/BSR+4.99%/BID+3.30% intraday — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis indicator; reputation DANGER PLX=20 stable, WARNING x14 incl VHM=49.7 improving), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot text has no Global-Liquidity line) | Carry: UNKNOWN→treated NEUTRAL (DSI-INV-1) | vol ELEVATED (rv_20d_pctile=0.779, gk_vol_20d_pct=19.5) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1772.48 (+7.70/+0.44%). Silent exit — no MARKET/WORK send. `log_agent_work` id=1817.

## c77 · 2026-08-07T07:09:15Z (slot=alert-commander-market, tick=07:08 off-cron)
- Signals: bus 0 total (`get_agent_signals` explicit + `get_cycle_bootstrap` `agent_signals[]` both empty — "Không có tín hiệu mới") | 0 chain_catalyst/urgent_news/price_anomaly/verified_chain/legal_risk/crisis_velocity | Fired: 0 | Suppressed: 0 | MARKET: 0
- No exact-tick cycle-snapshot file (freshest `cycle-snapshot-latest.json` tick=06:15, created 06:19:36Z, >7min stale) — fell through to direct `get_cycle_bootstrap`/`get_macro_snapshot`/`get_agent_signals` calls per Step -1 fallback path.
- Position-danger: `get_alerts(type=price)` clean, no active alerts, no stopLossHit; max singleDayDrop VHM -4.15% (<5%) — gate fails.
- Watchlist-opp: fresh `get_kinhdich_reading` VNM(GIU 38%)/BSR(MUA 38%)/PLX(GIU 38%)/BID(GIU 38%)/DPM(BAN 100%, wrong direction) — none clear kinhDichConfidence≥70 with BUY signal simultaneously — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis indicator; reputation DANGER PLX=20 stable, WARNING x15 incl BID=35.0 deteriorating), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot text has no Global-Liquidity line; carry.regime=UNKNOWN explicit) | Carry: UNKNOWN→treated NEUTRAL (DSI-INV-1) | vol ELEVATED (rv_20d_pctile=0.779, gk_vol_20d_pct=19.5) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1771.29 (+0.37%), breadth 155↑/133↓. Silent exit — no MARKET/WORK send. `log_agent_work` id=1818.

## c78 · 2026-08-07T07:26:11Z (slot=alert-commander-market, tick=07:25)
- Signals: bus 1 total (`get_agent_signals` explicit + `get_cycle_bootstrap` `agent_signals[]` agree) — 1 `verified_decision` (10445 VNM, non-consumed, low-conf 60, alert-engine news_mention carryover) | 0 chain_catalyst/urgent_news/price_anomaly/verified_chain/legal_risk/crisis_velocity — no Step 3b/3c input this cycle.
- No exact-tick cycle-snapshot file (freshest `cycle-snapshot-latest.json` tick=06:15, created 06:19:36Z, >7min stale) — fell through to direct `get_cycle_bootstrap`/`get_macro_snapshot`/`get_agent_signals` calls per Step -1 fallback path.
- Position-danger: `get_alerts(type=price)` clean, no active alerts, no stopLossHit; max singleDayDrop VHM -4.54% (<5%) — gate fails.
- Watchlist-opp: fresh `get_kinhdich_reading` VNM(GIU 38%)/PLX(GIU 38%)/BSR(MUA 38%)/BID(GIU 38%) — all <<70% NEUTRAL threshold despite PLX+6.68%/BSR+4.39%/VNM+5.08%/BID+3.30% intraday — gate fails.
- CRITICAL-always: `get_legal_risk_signals(days=1,hours_back=6)` clean, `get_crisis_early_warning` clean (no crisis indicator; reputation DANGER PLX=20 stable, WARNING x15 incl BID=35.0 deteriorating), no verified_chain in bus.
- Regime: NEUTRAL (fallback, macro_snapshot text has no Global-Liquidity line; carry.regime=UNKNOWN explicit) | Carry: UNKNOWN→treated NEUTRAL (DSI-INV-1) | vol ELEVATED (rv_20d_pctile=0.779, gk_vol_20d_pct=19.5) | Pivot window: false (pivotWindowWarning=null, next Sept 2026). Market OPEN, VN-Index 1768.29 (+0.2%). Silent exit — no MARKET/WORK send. `log_agent_work` id=1819.
