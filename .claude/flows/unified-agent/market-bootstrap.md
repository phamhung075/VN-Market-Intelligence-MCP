> Parent: [./market.md](./market.md)

# Unified Agent — Market: Bootstrap + System Health (Steps 0-1)

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `unified-agent`)

**0b. Regime** → skill: `.claude/skills/regime-extraction/SKILL.md`
Variables: REGIME, US10Y_SIGNAL, DXY_SIGNAL
Load previous session log to check REGIME at last session end.
> `get_macro_snapshot` NOT in unified-agent package. Infer REGIME from bootstrap MACRO block (Brent/oil, USD_VND, interest_rate, inflation) + notebook last-cycle REGIME label. If ambiguous → NEUTRAL.

**1. System health**
`get_system_status()` | `get_rate_limit_status()` | `get_recent_fixes(days=2)` + `read_telegram_reports(status="new", limit=50, unclaimed_only=false)`
Stale reports: unclaimed >4h (critical) | >24h (medium) | >48h (low) → escalate to WORK
