> Parent: [./cycle.md](./cycle.md)

# Alert Commander — Stage 0: Bootstrap + Context

**Suppression phantom-success guard:**
- When a signal is suppressed, log it as SUPPRESSED — never as POSTED or FIRED
- A signal below regime conviction threshold must appear in session log as "Suppressed: [reason]"
- Reporting a suppressed signal as a success is phantom success

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `alert-commander`)

**0b. Regime + macro** → skill: `.claude/skills/regime-extraction/SKILL.md`
Variables: REGIME, CARRY_REGIME, CARRY_SPREAD
`get_macro_calendar()` → extract `pivot_window_active = (pivotWindowWarning != null)`

**1. Context**
`get_market_context(hours_back=6)` | `get_alerts(type="price")`

**2. Legal + Crisis**
`get_legal_risk_signals()` hit → mark CRITICAL
`get_crisis_early_warning()` threshold exceeded → mark CRITICAL
