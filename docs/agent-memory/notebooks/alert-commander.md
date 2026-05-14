# Alert Commander — Notebook

**Last updated:** 2026-05-14 03:04 UTC | **Sprint:** c84

## This session

Off-hours cycle (01:02 UTC). 3 signals from bus: GAS price_anomaly id=3128 (σ=2.46) and VRE price_anomaly id=3129 (σ=1.83) suppressed — no active price alerts and σ < 4.0 threshold; VCB fundamental_validation id=3125 informational (not in signal matrix). Legal/crisis clear. Regime: NEUTRAL (confirmed from get_macro_snapshot). CARRY_REGIME: FII_OUTFLOW_RISK (spread -0.33%). 0 MARKET alerts fired.

## Patterns noticed

- **GAS/VRE recurrence:** price_anomaly signals for GAS (+6.93%, σ≈2.46) and VRE (-6.91%, σ≈1.83) have recurred across every off-hours cycle since 2026-05-13 09:07. These are stale closing-price signals being re-injected by market-watcher. σ < 4.0 and no active price alerts each cycle — correctly suppressed. Expect same next off-hours cycle until market-watcher resets.
- **REGIME source:** Previous cycles inferred TIGHTENING from signal payload text. get_macro_snapshot now returns correct Global Liquidity label (NEUTRAL). Use get_macro_snapshot as SSOT; ignore regime hints embedded in signal detail text.
- **log_agent_work two-step:** call with `status="running"` → capture `id` → call again with `status="completed"` + `id`. Missing `agent_name` in call causes 422.

## Carry-over (next session)

- **ACB FII pressure:** urgent_news ACB (id=3131, conf=0.50) suppressed — below NEUTRAL threshold 0.60. Foreign net sold 116M shares in one month. Watch for verified_chain if selling continues + price drops.
- **GAS surge:** GAS +6.97% open session (81,800→87,500). Price_surge alert in system but no agent price_anomaly signal received. Monitor for σ ≥ 4.0 price_anomaly from market-watcher next cycle.
- **VCI insider sell:** Fund chaired by Nguyễn Thanh Phượng sold all VCI shares (news_mention alert). Monitor for verified_chain escalation — insider event qualifies as always-MARKET if confirmed.
- **CARRY_REGIME=FII_OUTFLOW_RISK:** VND carry spread -0.33% persists. Apply NEUTRAL thresholds; include carry caveat in any MARKET bull alert.
- **BCTC overdue:** 37 stocks overdue Q4-2025 (some 29d+). Watch for regulatory action escalation to legal_risk signal.

### Alert Cycle (03:03–03:04 UTC) — 2026-05-14
- Signals: 1 (price_anomaly: FPT id=3134 from market-watcher)
- Fired: 0 | Suppressed: 1 | MARKET: 0
- Suppressed: FPT id=3134 (conf 0.50 < TIGHTENING threshold 0.85; σ=1.55 < 4.0; impact=5 < 6 — override failed)
- ChainCatalyst: 0 fired | 0 suppressed | event_types: []
- Regime: TIGHTENING (news-fallback) | Carry: NEUTRAL | Pivot window: false
- Legal: CLEAR | Crisis: CLEAR | Market: OPEN

### Alert Cycle (01:02–01:02 UTC) — 2026-05-14
- Signals: 3 (price_anomaly: GAS id=3128, VRE id=3129 from market-watcher; fundamental_validation: VCB id=3125 from report-analyzer)
- Fired: 0 | Suppressed: 2 | MARKET: 0
- Suppressed: GAS id=3128 (no active price alerts; σ=2.46 < 4.0 — no override) | VRE id=3129 (no active price alerts; σ=1.83 < 4.0 — no override)
- VCB fundamental_validation id=3125: informational only (not in signal matrix)
- ChainCatalyst: 0 fired | 0 suppressed | event_types: []
- Regime: NEUTRAL | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false
- Legal: CLEAR | Crisis: CLEAR | Market: CLOSED (off-hours 2h cycle)
- log_agent_work id=787

### Alert Cycle (02:03–02:03 UTC) — 2026-05-14
- Signals: 1 (urgent_news: ACB id=3131 from news-scout, conf=0.50)
- Fired: 0 | Suppressed: 1 | MARKET: 0
- Suppressed: urgent_news ACB id=3131 (conf=0.50 < NEUTRAL threshold 0.60; no price_anomaly override — no active price alerts for ACB)
- ChainCatalyst: 0 fired | 0 suppressed | event_types: []
- Regime: NEUTRAL | Carry: FII_OUTFLOW_RISK (-0.33%) | Pivot window: false
- Legal: CLEAR | Crisis: CLEAR | Market: OPEN (20-min cycle)
- log_agent_work id=789
