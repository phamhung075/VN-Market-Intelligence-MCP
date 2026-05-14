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
Fallback: if `get_macro_snapshot` fails on first attempt, **retry once** (single retry, no delay). If retry also fails, derive regime hint from news context (dominant sentiment: bearish → TIGHTENING hint, bullish → EASING hint, mixed → NEUTRAL). Log as `REGIME_SOURCE=news-fallback` AND append `[WARN] get_macro_snapshot unavailable after retry — regime is estimated, apply conservative (higher) threshold tier regardless of derived hint`. See skill `regime-extraction/SKILL.md` § Regime Extraction for canonical variable definitions.

> **Auto-cure note (TNB c53 2026-05-14):** 3-cycle evidence of off-hours news-fallback producing regime inconsistency (c51 10:03 UTC, c52 14:02 UTC, c53 15:04 UTC — all off-hours 2h cycles, news-fallback → TIGHTENING while macro snapshot returns NEUTRAL). Retry-once + conservative-tier warning added to reduce regime drift on tool timeout.

**1. Context**
`get_market_context(hours_back=6)` | `get_alerts(type="price")`

**2. Legal + Crisis**
`get_legal_risk_signals()` hit → mark CRITICAL
`get_crisis_early_warning()` threshold exceeded → mark CRITICAL
