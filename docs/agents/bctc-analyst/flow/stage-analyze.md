<!-- size-justification: 120L — merged routine + release pipelines + E1 trick-pass loop + E3 cache. Cannot split: routine/release share BCTC fetch/EY/forensic/chain-validation; E1 passes are sequential per-ticker; splitting loses pipeline continuity across mode branches. -->
> Parent: [./cycle.md](./cycle.md)

# BCTC Analyst — Stage 1-4: Analyze + Validate

## Routine Mode (all watchlist tickers)

**1. BCTC status**
`get_earnings_calendar()` | `list_stored_pdfs()` → missing reports for watchlist stocks
New PDF CRITICAL → broadcast signal immediately

**2. Analyze** per ROUTINE_TICKERS `get_watchlist()`:
`get_bctc_full(code)` | `get_sector_comparison(code)` PE/PB/ROE vs median | `get_kinhdich_reading(code)` confirms/contradicts?

After `get_bctc_full(code)` returns stock PE:
- Compute `EARNING_YIELD = 1 / PE`
- `EY_SPREAD = EARNING_YIELD - MAX_DEPOSIT_RATE`
- Classify: `>3%` → CHEAP | `1–3%` → FAIR | `0–1%` → EXPENSIVE | `<0%` → AVOID
- Rate-sensitive sector (realty | construction | consumer_finance) + `REGIME=TIGHTENING` → `rate_sensitive_headwind=true`
- `valuation_verdict=AVOID` → do NOT post bullish signal
- `REGIME=TIGHTENING` + `valuation_verdict=EXPENSIVE` → do NOT post bullish signal

G-Bond regime check (Pillar 5.2):
- `get_bond_maturity_calendar()` → if G-Bond 10Y yield available: `GBOND_SPREAD = EARNING_YIELD - gbond_10y_yield`
  - `GBOND_SPREAD < 0` → `gbond_regime_signal=true`, log: "G-Bond ưu thế hơn equity"
  - Downgrade FAIR → EXPENSIVE when `gbond_regime_signal=true`
- Not available → log data gap, skip

**2c. Layer 7 — Forensic NI vs OCF** (tnb-methodology.md §Layer-7)
`get_cash_flow(ticker, quarters=8)` → OCF array. Apply divergence check per financial-analyst pattern.

**2b. Historical BCTC context** `search_similar_context(query=<ticker>+" "+<quarter_summary>, k=3, recency_days=365)`

**3. Insider + legal**
`get_insider_signals()` | `get_legal_risk_signals()`

**3b. Layer 8 — Investment Clock + Pyramid tier** (tnb-methodology.md §Layer-8)
`get_investment_clock_phase()` | `get_pyramid_tier("equity")`

**4. Chain validation**
`get_open_chain_findings(minutes_back=30)` → BCTC confirm/contradict catalyst?
`post_agent_signal(type="fundamental_validation", ticker=..., validation_result=...)`

**4b. Signal feedback → news-scout** (per financial-analyst pattern — accepted/rejected per chain finding)

---

## Release Mode (RELEASE_TICKERS only — processed first in mixed cycles)

**R1. Extract** per RELEASE_TICKER:
`get_bctc_full(code)` | `get_sector_comparison(code)` P/E, P/B, ROE vs median | `compare_stocks(...)` peers | `compare_financials(...)` BCTC vs peers

**R2. BCTC eval fetch** — call `GET /api/bctc-eval/{report_id}` for each ticker. Store `overall_status` + `stages[*]`.
If unavailable → `eval_status = "unknown"`.

**R3. Comparison table** (primary = YoY Same Q, secondary = vs Prior Q):

| Metric | Current Q | vs Prior Q* | vs YoY Same Q† |
|--------|-----------|-------------|----------------|
| Revenue (VND bn) | ... | +/- % | +/- % |
| Net Income (VND bn) | ... | +/- % | +/- % |
| EPS (VND) | ... | +/- % | +/- % |
| ROE (%) | ... | +/- pp | +/- pp |
| Debt/Equity | ... | +/- | +/- |
| Operating Margin (%) | ... | +/- pp | +/- pp |
| P/E (x) | ... | sector median | — |

*\*"vs Prior Q" secondary — seasonal bias. Do NOT use as primary verdict.*
*†"vs YoY Same Q" is primary. If Q1 reported: compare vs Q1 prior year only.*

**R4. Signal + ledger**
`post_agent_signal(type="fundamental_validation", beat_miss="beat|miss|in-line")`

Compute `net_profit_delta_pct` (YoY). Set `beat_miss` verdict from YoY comparison.

Emit signal file: `docs/signals/bctc_signal_{TICKER}_{YYYYMMDD}_release.json` including all business-context fields.

Ledger write (release mode ONLY):
- If `docs/analysis-briefs/{TICKER}.md` does not exist → create from `docs/references/analysis-ledger-template.md`
- Append:
```markdown
### {TICKER} Q{N} {YEAR} — Released YYYY-MM-DD
[comparison table as R3 above]
**Verdict**: Beat / Miss / In-line — {one sentence, max 15 words}
BCTC-EVAL: {TICKER} Q{N}-{YEAR} = 🟢/🟡/🔴/⬜ ({detail})
```
Eval pill format: 🟢 all-green | 🟡 stage N yellow | 🔴 stage N red | ⬜ unavailable

Routine mode → NO ledger write. Signal bus only.

---

## E1+E3 — Multi-Pass Trick Detection (per ticker, after routine/release steps above)

Run AFTER standard analysis steps (2–4b or R1–R4) for each TICKER.

```
For each TICKER, QUARTER:
  [E3] hash = SHA-256(value_current fields by row_order + raw OCR text)
  [E3] HIT: data/bctc-analysis-cache/{TICKER}/{QUARTER}/{hash}.json exists?
       → log "[E3 CACHE HIT] {TICKER}/{QUARTER}/{hash_prefix_8} — {N} passes skipped — cached {HH:MM}h ago"
       → re-emit signal + new timestamp; SKIP passes.
  [E3] MISS: log "[E3 CACHE MISS] {TICKER}/{QUARTER} — running full pass."
  [E2] If now_utc crosses 02:00 UTC mid-run: finish current pass; defer rest; notebook: status=partial
  [E1] Sequential passes:
    stage-pass-balance-sheet.md → pass_1_result
    stage-pass-pl.md → pass_2_result
    stage-pass-cashflow.md → pass_3_result
    stage-pass-rpt.md → pass_4_result
    stage-pass-footnote.md → pass_5_result
    stage-pass-segment.md → pass_6_result
    stage-consolidate.md (all pass results) → trick_summary, trick_confidence
  [E3] Write/replace cache: data/bctc-analysis-cache/{TICKER}/{QUARTER}/{hash}.json
  Merge trick_summary + trick_confidence + trick_pass_versions into bctc_signal output.
```

**E4 Block Rule:** `confidence_score` missing → skip NULL value_current rows as proxy. `statement_section` missing for income/cashflow → log WARNING + skip pass. Footnote linkage missing → use page_anchor. Dev-pdf-extractor sprint required (OQ-4 signal sent). See stage-pass files for per-pass fallback.
