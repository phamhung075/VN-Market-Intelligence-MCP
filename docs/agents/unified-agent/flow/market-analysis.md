> Parent: [./market.md](./market.md)

# Unified Agent — Market: Intelligence + Portfolio + Domain (Steps 2-5)

**2. Market intelligence**
`get_market_context(hours_back=24)` | `get_prediction_markets()` | `get_legal_risk_signals()` | `get_crisis_early_warning()`
> `get_sentiment_trend()` requires `stock_code` param — NOT portfolio-wide. Skip here; call per-ticker only on event trigger.
> `get_insider_signals()` requires `code` + `outstandingShares` — NOT a portfolio sweep. Skip step 4 portfolio scan; call per-ticker on event trigger only.

**3. Portfolio**
`get_positions()` | `get_portfolio_conviction()` | `get_portfolio_risk()` VaR 95% | `get_rebalancing_signals()` | `get_target_allocation()`

After `get_rebalancing_signals()`, apply sector regime fit:
```
TIGHTENING tailwind: utilities | healthcare | consumer_staples | export_manufacturing | tech_export
TIGHTENING headwind: realty | construction | consumer_finance | banking_growth
EASING: swap the two lists
```
Per BUY signal: sector in HEADWIND → downgrade conviction × 0.7, set `regime_headwind=true`
Per BUY signal: sector in TAILWIND + `REGIME=EASING` → boost conviction × 1.1, set `regime_tailwind=true`

Compute `ALIGNMENT_SCORE = TAILWIND_weight / total_portfolio_weight`
If `ALIGNMENT_SCORE < 0.5` AND `REGIME=TIGHTENING`:
→ post WORK: `"Portfolio misaligned với Thiên Thời: {HEADWIND_weight:.0%} trong headwind sectors"`

**4. Domain**
`get_supply_chain_exposure()` | `get_climate_risk_signals()` | `get_energy_grid_signals()` | `get_insider_signals()`

FII capital type classification (Pillar 2 — Tốt Gỗ vs Tốt Nước Sơn):
From `get_foreign_flow()` data + CARRY_REGIME + hot_money_risk signals from news-scout:
- `HOT_MONEY` profile: FII inflow spike correlates with carry spread widening + concentrated in large-cap liquid stocks + `CARRY_REGIME=HOT_MONEY_INFLOW`
  → flag: `fii_type=HOT_MONEY` — post WORK: "⚠️ Dòng FII hiện tại có dấu hiệu tiền nóng — rủi ro đảo chiều cao nếu carry thu hẹp"
- `STRUCTURAL` profile: steady inflow + correlates with BCTC beat/positive fundamentals + not carry-driven
  → flag: `fii_type=STRUCTURAL` — stable signal, no special warning
- Default if unclear → `fii_type=UNKNOWN`

**4b. Pillar coverage check** (TNB Layer 4 — `docs/standards/tnb-methodology.md`)

Every conviction shift, BUY/SELL/HOLD recommendation, or rebalancing call must reference ≥3 of 4 pillars `{M2, COC, EPS, POL}`. Cite the source tool for each:

| Pillar | What | Source tool / signal |
|---|---|---|
| **M2** (Lượng tiền) | Money supply, credit growth, OMO net injection | bootstrap MACRO block, `get_macro_snapshot` (if available), SBV data in regime |
| **COC** (Chi phí vốn) | Fed Funds, SBV refinancing, VND carry spread, US10Y | bootstrap MACRO block, CARRY_REGIME, regime extraction |
| **EPS** (Triển vọng lợi nhuận) | EPS growth, sector margin trend, ROE | `get_portfolio_conviction`, BCTC pipeline (`compare_financials` per ticker) |
| **POL** (Chính sách) | Tax/regulatory/monetary directives | `get_legal_risk_signals`, `get_crisis_early_warning`, congbao feed |

Score each output (notebook line, WORK message, conviction_change signal payload):
- count pillars actually cited (not just available — must appear in the reasoning)
- if `pillar_count < 3` → log `[Methodology] pillar_count=N/4 — missing: [list]` and append warning to WORK heartbeat

In every `post_agent_signal(type="conviction_change", ...)` payload, include:
```json
"finding_data": {
  ...
  "pillars_cited": ["M2", "COC", "EPS"]  // ≥3 of 4 — list which pillars informed the decision
}
```

In every notebook cycle entry, append a one-line pillar tally:
```
- Pillars: M2=✓ (M2 +12% yoy) COC=✓ (carry -33bp) EPS=✓ (FPT EPS yoy +4%) POL=✗ → 3/4
```

**5. Quality**
`get_alert_accuracy()` precision < 60% = bug | `get_signal_effectiveness()` chains vs standalone | `get_unreviewed_market_messages(limit=10)` spam audit
> `get_unreviewed_market_messages` with limit=50 routinely exceeds 89k chars. Use limit=10 to stay within token budget.

Check if REGIME changed since last session log → if changed:
- Log `REGIME_TRANSITION` event to WORK: `"[Unified] REGIME_TRANSITION: {old} → {new} (HH:MM UTC)"`

**6. WORK** — `send_telegram(channel="work", message=...)`:
Issues → `submit_feedback(agent="unified-agent", ...)`
Clean:
```
unified-agent loop clean (HH:MM UTC): all green.
```
