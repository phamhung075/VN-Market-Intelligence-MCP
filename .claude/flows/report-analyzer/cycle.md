# Report Analyzer — Cycle Flow

**Tools:** `.claude/tools/package/report-analyzer.md`

> Event-driven: only runs when new earnings detected.

## Input
Bootstrap | `get_earnings_calendar()` new releases today

## Output
`fundamental_validation` signals | ledger entries in `docs/analysis-briefs/{TICKER}.md` | WORK status

---

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `report-analyzer`)

**1. Earnings detection** `get_earnings_calendar()`
- No new earnings → go to session log only (step 5), STOP further analysis
- New earnings → proceed per ticker

**2. Extract** per ticker:
`get_bctc_full(code)` | `get_sector_comparison(code)` P/E,P/B,ROE vs median | `compare_stocks(...)` peers | `compare_financials(...)` BCTC vs peers
Metrics: Revenue, Net Income, EPS, ROE, Debt/Equity, Operating Margin

**3. Comparison table**:
| Metric | Current Q | vs Prior Q* | vs YoY Same Q† |
|--------|-----------|-------------|----------------|
| Revenue (VND bn) | ... | +/- % | +/- % |
| Net Income (VND bn) | ... | +/- % | +/- % |
| EPS (VND) | ... | +/- % | +/- % |
| ROE (%) | ... | +/- pp | +/- pp |
| Debt/Equity | ... | +/- | +/- |
| Operating Margin (%) | ... | +/- pp | +/- pp |
| P/E (x) | ... | sector median | — |

*\*"vs Prior Q" is secondary — seasonal bias (Q1 always lower than Q4). Do NOT use as primary verdict signal.*
*†"vs YoY Same Q" is the primary comparison — avoids seasonal distortion. Use for beat/miss verdict.*
*If Q1 reported: compare vs Q1 prior year only. "Below Q4" is expected, not a miss.*

**4. Signal + ledger**
`post_agent_signal(type="fundamental_validation", beat_miss="beat|miss|in-line")`
If `docs/analysis-briefs/{TICKER}.md` does not exist → create it first:
```markdown
# {TICKER} — Analysis Ledger {YEAR}
**Sector**: {domain} | **Exchange**: {exchange}

## [Report Analyzer] Fundamentals & Valuation

## [News Scout] Headlines & Sentiment

## [Market Watcher] Price, Volume, Technicals

## [Unified Agent] Quarterly Syntheses
```
Append `docs/analysis-briefs/{TICKER}.md` [Report Analyzer]:
```markdown
### {TICKER} Q{N} {YEAR} — Released YYYY-MM-DD
[table as above]
**Verdict**: Beat / Miss / In-line — {one sentence, max 15 words}
```
Partial data → `N/A` | write fails → BUG channel immediately

**5. Session log** `docs/agent-memory/sessions/YYYY-MM-DD-report-analyzer.md`:
```
### Analysis Cycle (HH:MM–HH:MM)
- Earnings: N tickers | Processed: [list] | Signals: M fundamental_validation
```

**5b. WORK**:
```
[Report Analyzer] HH:MM UTC — N earnings processed
  Beat: X | Miss: Y | In-line: Z | Signals: M | Next: TIME
```

**5c. BUG on error**:
Before sending: `get_recent_fixes(limit=20)` — if same module/issue in recent fixes → **skip, do not re-report**.
```
[Report Analyzer] ⚠️ SEVERITY
  Issue: ... | Impact: stocks | Status: Retrying/Blocked
```
