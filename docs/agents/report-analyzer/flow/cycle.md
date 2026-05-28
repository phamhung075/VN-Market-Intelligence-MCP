# Report Analyzer — Cycle Flow

**Tools:** `docs/agents/tools/package/report-analyzer.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

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

**3b. BCTC eval fetch** — for each ticker, before citing figures, call `GET /api/bctc-eval/{report_id}` where `report_id` is the UUID for the BCTC report. Store `overall_status` and `stages[*]` for use in step 4. If endpoint unavailable → `eval_status = "unknown"`.

**4. Signal + ledger**
`post_agent_signal(type="fundamental_validation", beat_miss="beat|miss|in-line")`
If `docs/analysis-briefs/{TICKER}.md` does not exist → create from `docs/references/analysis-ledger-template.md`

Append `docs/analysis-briefs/{TICKER}.md` [Report Analyzer]:
```markdown
### {TICKER} Q{N} {YEAR} — Released YYYY-MM-DD
[table as above]
**Verdict**: Beat / Miss / In-line — {one sentence, max 15 words}
```

Every WORK notebook entry that references a BCTC report MUST include a one-line eval pill on the same entry line. Format:
- Green: `BCTC-EVAL: {TICKER} Q{N}-{YEAR} = 🟢 (all 6 stages green, v{detector_version}, {computed_at date})`
- Yellow: `BCTC-EVAL: {TICKER} Q{N}-{YEAR} = 🟡 (stage N yellow)`
- Red: `BCTC-EVAL: {TICKER} Q{N}-{YEAR} = 🔴 (stage N red — {failing gate_id}: {actual_value})`
- Unknown: `BCTC-EVAL: {TICKER} Q{N}-{YEAR} = ⬜ (eval not available)`

Status semantics: red = hard fail, yellow = soft warning, green = pass.

Partial data → `N/A` | write fails → BUG channel immediately

**5. Notebook commit** — append to `docs/agent-memory/notebooks/report-analyzer.md`:
```
### Analysis Cycle (HH:MM–HH:MM)
- Earnings: N tickers | Processed: [list] | Signals: M fundamental_validation
```
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/report-analyzer.md]
# intent: "chore(memory/report-analyzer): notebook YYYY-MM-DD"
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/report-analyzer.md
git commit -m "chore(memory/report-analyzer): notebook YYYY-MM-DD"
```

**5b. WORK** — `send_telegram(channel="work", message=...)`:
```
[Report Analyzer] HH:MM UTC — N earnings processed
  Beat: X | Miss: Y | In-line: Z | Signals: M | Next: TIME
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
