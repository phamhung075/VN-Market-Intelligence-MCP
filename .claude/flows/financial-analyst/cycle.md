# Financial Analyst — Cycle Flow

## Input
Bootstrap (market context 24h, earnings calendar, stored PDFs)

## Output
`fundamental_validation` signals on bus | WORK status | BCTC deadline flags

---

**0. Bootstrap** `get_cycle_bootstrap(agent_name="financial-analyst")`
- Check: `cross_validate`
- `error` → fail-loud, STOP

**1. BCTC status**
`get_earnings_calendar()` | `list_stored_pdfs()` → missing reports for watchlist stocks
New PDF CRITICAL → broadcast signal immediately

**2. Analyze** per watchlist stock `get_watchlist()`:
`get_bctc_full(code)` | `get_sector_comparison(code)` PE/PB/ROE vs median | `get_kinhdich_reading(code)` confirms/contradicts?

**3. Insider + legal**
`get_insider_signals()` buy/sell patterns | `get_legal_risk_signals()` prosecution/tax/court

**4. Chain validation**
`get_open_chain_findings(minutes_back=30)` → BCTC confirm/contradict catalyst?
`post_agent_signal(type="fundamental_validation", ticker=..., validation_result=...)`

**5. Session log** `docs/agent-memory/sessions/YYYY-MM-DD-financial-analyst.md`:
```
### Analysis Cycle (HH:MM–HH:MM)
- Stocks: N | Critical findings: [list] | Chain validations: M
```

**5b. WORK**:
```
[Financial Analyst] HH:MM UTC — N stocks analyzed
  Signals: X fundamental_validation | Critical: Y | Next: TIME
```

**5c. BUG on error**:
```
[Financial Analyst] ⚠️ SEVERITY
  Issue: ... | Impact: stocks | Status: Retrying/Blocked
```

## Deadline Watch
7 days before + missing → flag in session log
Day of + still missing → mark LATE
