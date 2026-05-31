> Parent: [./market.md](./market.md)

# Unified Agent — Market: Special Events + Notebook Commit

## Special Event Triggers (6)

| Trigger | Detection |
|---------|-----------|
| Earnings | `get_earnings_calendar()` new entry |
| Policy change | `get_legal_risk_signals()` + news spike |
| Large insider >500M VND | `get_insider_signals()` threshold |
| Supply disruption | `get_supply_chain_exposure()` + BDI spike |
| Sector rotation | `get_sector_rotation()` reversal |
| Kinh Dich shift | `get_kinhdich_reading()` major change |

On trigger: full analysis → recalculate conviction (+0.1 additive boost, cap at 1.0) →
Apply regime multiplier AFTER additive boost: HEADWIND ×0.7 | TAILWIND+EASING ×1.1 | cap final at 1.0
If `docs/analysis-briefs/{TICKER}.md` does not exist → create it first:
```markdown
# {TICKER} — Analysis Ledger {YEAR}
**Exchange**: {exchange}

## [Report Analyzer] Fundamentals & Valuation

## [News Scout] Headlines & Sentiment

## [Market Watcher] Price, Volume, Technicals

## [Unified Agent] Quarterly Syntheses
```
Append:
```
docs/analysis-briefs/{TICKER}.md:
YYYY-MM-DD HH:MM | EVENT: {type} | {1-line} | Conviction: {old} → {new}
```
Shift ≥ 0.3 → WORK:
```
[Unified] CONVICTION SHIFT — {TICKER}
Trigger: {event_type} | Score: {old} → {new} ({direction}) | Action: {brief}
```
Entry/exit → `post_agent_signal(type="conviction_change", ...)`:
```json
{
  "finding_data": {
    "regime": "<TIGHTENING|EASING|NEUTRAL>",
    "sector_regime_fit": "<TAILWIND|HEADWIND|NEUTRAL>",
    "alignment_score": 0.65,
    "fii_type": "<HOT_MONEY|STRUCTURAL|UNKNOWN>"
  }
}
```

## Notebook Commit
Append to `docs/agent-memory/notebooks/unified-agent.md`:
```
### Coordination Cycle (HH:MM–HH:MM)
- Mode: MARKET | System: [health] | Alerts: N | Quality issues: N | Bugs: [list]
- Regime: REGIME | Alignment: ALIGNMENT_SCORE | Headwind exposure: HEADWIND_weight%
```
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/unified-agent.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/unified-agent.md
git commit -m "chore(memory/unified-agent): notebook YYYY-MM-DD"
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
