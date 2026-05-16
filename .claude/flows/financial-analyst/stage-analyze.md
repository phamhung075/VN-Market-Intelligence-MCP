<!-- size-justification: 125L — single coherent analysis pipeline (BCTC + EY spread + Layer 7/8 + chain validation + signal feedback); splitting mid-pipeline would break step continuity. -->
> Parent: [./cycle.md](./cycle.md)

# Financial Analyst — Stage 1-4: Analyze + Validate

**1. BCTC status**
`get_earnings_calendar()` | `list_stored_pdfs()` → missing reports for watchlist stocks
New PDF CRITICAL → broadcast signal immediately

**2. Analyze** per watchlist stock `get_watchlist()`:
`get_bctc_full(code)` | `get_sector_comparison(code)` PE/PB/ROE vs median | `get_kinhdich_reading(code)` confirms/contradicts?

After `get_bctc_full(code)` returns stock PE (individual stock ratio, not sector median):
- Compute `EARNING_YIELD = 1 / PE`
- `EY_SPREAD = EARNING_YIELD - MAX_DEPOSIT_RATE`
- Classify:
  - `EY_SPREAD > 3%` → CHEAP
  - `1% ≤ EY_SPREAD ≤ 3%` → FAIR
  - `0% ≤ EY_SPREAD < 1%` → EXPENSIVE
  - `EY_SPREAD < 0%` → AVOID
- Rate-sensitive sector (realty | construction | consumer_finance) + `REGIME=TIGHTENING` → `rate_sensitive_headwind=true`
- `valuation_verdict=AVOID` → do NOT post bullish signal (any regime — bonds/deposits beat equity)
- `REGIME=TIGHTENING` + `valuation_verdict=EXPENSIVE` → do NOT post bullish signal

G-Bond regime change check (Pillar 5.2):
- `get_bond_maturity_calendar()` → if G-Bond 10Y yield available: compute `GBOND_SPREAD = EARNING_YIELD - gbond_10y_yield`
  - `GBOND_SPREAD < 0` (G-Bond yield > Earning Yield) → set `gbond_regime_signal=true`, log: "G-Bond ưu thế hơn equity — nguy cơ chuyển chế độ"
  - Downgrade FAIR verdict → EXPENSIVE when `gbond_regime_signal=true`
- If G-Bond yield not available → log data gap in session log, skip check

**2c. Layer 7 — Forensic NI vs OCF** (tnb-methodology.md §Layer-7)
`get_cash_flow(ticker, quarters=8)` → OCF array per quarter

IF empty/no data → log: "Layer 7: no cash flow data for {ticker} — Layer 7 skipped" → continue (non-fatal)

IF data returned BUT flagged as extraction_error OR anomalous (e.g. OCF=142M alongside NI in billions, or OCF/NI ratio > 50x or < 0.01x) → treat as unreliable, do NOT silently skip the gate. Instead apply manual accrual fallback:
- Compute `accrual_ratio = (NI - OCF) / abs(NI)` using best available NI from get_bctc_full
- If `abs(accrual_ratio) > 0.30` → set `earnings_quality_warn=true`, log: "Layer 7 fallback: OCF anomalous (extraction_error), accrual_ratio={value} — earnings quality WARN"
- If `abs(accrual_ratio) <= 0.30` → set `earnings_quality_warn=false`, log: "Layer 7 fallback: OCF anomalous but accrual within bounds"
- Never log "Layer 7 skipped" when NI data is available — the forensic gate must always be passed or explicitly failed with a recorded reason

IF data returned — compute per quarter: `accrual = NI - OCF`
- `divergence_flag = |OCF - NI| / |NI| > 0.30 AND OCF < NI for ≥2 consecutive quarters`
- IF divergence_flag → append to verdict: "earnings quality WARN: NI>OCF divergence ≥2 consecutive qtrs" → `earnings_quality_warn=true`
- ELSE → append to verdict: "Layer 7: no persistent accrual divergence detected" → `earnings_quality_warn=false`

Log: "Layer 7: {ticker} accrual check done — flag={divergence_flag}"

**2b. Historical BCTC context** `search_similar_context(query=<ticker>+" "+<quarter_summary>, action_code=<ticker>, k=3, recency_days=365)`
- Call once per stock after `get_bctc_full(code)` returns
- Query: ticker + brief summary (e.g. "VCB Q1 2026 lợi nhuận tăng")
- If results returned: prepend to analysis context — "N similar past analyses: <title> (<date>), ..."
- If no results: skip, continue without historical context
- Non-fatal: if tool errors, log and continue

**3. Insider + legal**
`get_insider_signals()` buy/sell patterns | `get_legal_risk_signals()` prosecution/tax/court

**3b. Layer 8 — Investment Clock + Pyramid tier** (tnb-methodology.md §Layer-8)
`get_investment_clock_phase()` → phase
`get_pyramid_tier("equity")` → tier

IF phase == "insufficient_data": phase_display = "insufficient_data" (no crash — continue)

Render header (prepend to verdict output + include in signal finding_data):
  "📍 Cycle: {phase} | Tier: {tier}"

Log: "Layer 8: phase={phase} tier={tier}"

**4. Chain validation**
`get_open_chain_findings(minutes_back=30)` → BCTC confirm/contradict catalyst?
`post_agent_signal(type="fundamental_validation", ticker=..., validation_result=...)`:
```json
{
  "finding_data": {
    "ey_spread": 0.028,
    "valuation_verdict": "<CHEAP|FAIR|EXPENSIVE|AVOID>",
    "regime": "<TIGHTENING|EASING|NEUTRAL>",
    "rate_sensitive_headwind": false,
    "gbond_regime_signal": false,
    "cycle_phase": "<phase|insufficient_data>",
    "pyramid_tier": "equity",
    "earnings_quality_warn": false
  }
}
```

**4b. Signal feedback → news-scout**
For each `chain_catalyst` or `urgent_news` signal from `news-scout` processed in step 4:
- If impact-chain validated (BCTC confirms catalyst, `valuation_verdict` ≠ AVOID):
```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "financial-analyst",
  "to_agent": "news-scout",
  "signal_type": "signal_feedback",
  "stock_code": "<TICKER>",
  "payload": {
    "original_signal_id": "<signal_id from chain finding>",
    "accepted": true,
    "reason": "impact-chain validated: EY_SPREAD=<value>, verdict=<verdict>"
  },
  "ttl_minutes": 60,
  "chain_depth": 0,
  "finding_data": {
    "source_signal_type": "<urgent_news|chain_catalyst>",
    "accepted": true,
    "validation_detail": "BCTC confirms catalyst — ey_spread=<value>"
  }
})
```
- If rejected (BCTC contradicts, `valuation_verdict`=AVOID, or chain finding null):
```
call_tool(server="vn-market", tool="post_agent_signal", arguments={
  "from_agent": "financial-analyst",
  "to_agent": "news-scout",
  "signal_type": "signal_feedback",
  "stock_code": "<TICKER>",
  "payload": {
    "original_signal_id": "<signal_id from chain finding>",
    "accepted": false,
    "reason": "impact-chain failed: <detail e.g. 'BCTC contradicts — declining ROE', 'valuation=AVOID', 'no chain finding'>"
  },
  "ttl_minutes": 60,
  "chain_depth": 0,
  "finding_data": {
    "source_signal_type": "<urgent_news|chain_catalyst>",
    "accepted": false,
    "validation_detail": "<rejection reason>"
  }
})
```
Non-fatal: if `post_agent_signal` errors for feedback, log and continue.
