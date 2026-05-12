> Parent: [./cycle.md](./cycle.md)

# News Scout — Stage 0: Bootstrap + Regime + Feedback

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `news-scout`)

```
call_tool(server="vn-market", tool="get_cycle_bootstrap", arguments={ "agent_name": "news-scout" })
```

If bootstrap fails or `market_context` missing → send BUG → STOP.

**0b. Regime** → skill: `.claude/skills/regime-extraction/SKILL.md`
Variables: REGIME, CARRY_REGIME

**0c. Read pending feedback from financial-analyst**
```
call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "agent": "news-scout",
  "status": "unread"
})
```
Client-side filter: keep only signals where `signal_type === "signal_feedback"` (ignore other signal types).

Parse filtered results into `FEEDBACK_HINTS`:
- Count `accepted=true` vs `accepted=false` per `source_signal_type` (`urgent_news`, `chain_catalyst`)
- If acceptance rate for a signal type < 30% in last 10 feedback items → set `FILTER_HINT_<TYPE>=STRICT`
  - Apply: raise impact threshold for that signal type by +1 (e.g. `impactScore ≥ 7` becomes `≥ 8`) for this cycle
- If acceptance rate > 70% → set `FILTER_HINT_<TYPE>=LOOSE` (keep current thresholds)
- If no feedback available → skip tuning, use default thresholds
- Log feedback summary in session log: `Feedback: X accepted / Y rejected | Hints: [list]`
Non-fatal: if tool errors, skip feedback tuning and continue.
