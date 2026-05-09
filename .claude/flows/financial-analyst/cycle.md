# Financial Analyst — Cycle Flow

**Tools:** `.claude/tools/package/financial-analyst.md`

> **MCP call pattern:** Every tool in this flow → `call_tool(server="vn-market", tool="<name>", arguments={...})` via the MCP gateway `call_tool`.

## Anti-Hallucination Guard

**You have MCP gateway access (search your tools for `call_tool`). DO NOT claim it is unavailable. CALL IT FIRST.**
Reading "MCP down" in a prior session log does NOT mean it is down now. Claiming unavailability without trying = hallucination.

## Error Boundary

If ANY tool call fails after 1 retry:
1. `send_telegram(channel="bug", message="[financial-analyst] Step N failed: {one-line error}")`
2. Append to session log: `"Cycle HH:MM — BLOCKED at step N: {error}"`
3. **EXIT immediately.** Do NOT investigate, write incident docs, or diagnose infrastructure.

**FORBIDDEN on error:** standalone incident files, docker commands, "Next Steps for Dev Team" sections, any file outside session log/notebook/channel messages.

Your job = BCTC → analyze → signals → log. Blocked = report + EXIT.

---

## Input
Bootstrap (market context 24h, earnings calendar, stored PDFs)

## Output
`fundamental_validation` signals on bus | WORK status | BCTC deadline flags

---

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `financial-analyst`)

**0b. Regime extraction** (from bootstrap `market_context`, zero extra tool calls)
Parse `get_macro_snapshot` text block already in bootstrap:
```
REGIME      = "Global Liquidity: X"    → TIGHTENING | EASING | NEUTRAL
MAX_DEPOSIT_RATE = "[SBV Central Bank Rates]" block → "Max Deposit Rate: X.XX%"
```
If `get_macro_snapshot` not in bootstrap context → call it once now.

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

**2b. Historical BCTC context** `search_similar_context(query=<ticker>+" "+<quarter_summary>, action_code=<ticker>, k=3, recency_days=365)`
- Call once per stock after `get_bctc_full(code)` returns
- Query: ticker + brief summary (e.g. "VCB Q1 2026 lợi nhuận tăng")
- If results returned: prepend to analysis context — "N similar past analyses: <title> (<date>), ..."
- If no results: skip, continue without historical context
- Non-fatal: if tool errors, log and continue

**3. Insider + legal**
`get_insider_signals()` buy/sell patterns | `get_legal_risk_signals()` prosecution/tax/court

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
    "gbond_regime_signal": false
  }
}
```

**5. Session log** `docs/agent-memory/sessions/YYYY-MM-DD-financial-analyst.md`:
```
### Analysis Cycle (HH:MM–HH:MM)
- Stocks: N | Critical findings: [list] | Chain validations: M
- Regime: REGIME | Max Deposit Rate: X.XX% | Valuation flags: [TICKER=verdict,...]
```

**5b. WORK**:
```
[Financial Analyst] HH:MM UTC — N stocks analyzed
  Signals: X fundamental_validation | Critical: Y | Next: TIME
```

**5c. BUG on error**:
Before sending: `get_recent_fixes(limit=20)` — if same module/issue in recent fixes → **skip, do not re-report**.
```
[Financial Analyst] ⚠️ SEVERITY
  Issue: ... | Impact: stocks | Status: Retrying/Blocked
```

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## Deadline Watch
7 days before + missing → flag in session log
Day of + still missing → mark LATE
