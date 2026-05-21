> Parent: [./cycle.md](./cycle.md)

# News Scout — Stage 0: Bootstrap + Regime + Feedback

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `news-scout`)

```
call_tool(server="vn-market", tool="get_cycle_bootstrap", arguments={ "agent_name": "news-scout" })
```

If bootstrap fails or `market_context` missing → send BUG → STOP.

**0b. Regime**

Call `get_macro_snapshot` directly:
```
call_tool(server="vn-market", tool="get_macro_snapshot", arguments={})
```

**Shape-validation gate:** After the call, apply `isMacroSnapshotValidShape()` from `apps/mcp-server/src/interface/mcp/tools/macro/macroSnapshotGuard.ts`:
- **Valid shape** (`text` field is a non-empty string): set `MACRO_SNAPSHOT_TEXT` to the response → pass to regime-extraction skill below. Set `REGIME_SOURCE=macro_snapshot`.
- **Invalid shape** (missing or non-string `text` field — e.g. `{"status":"degraded","message":"..."}` system_status bleed): route to news-fallback. Log `REGIME_SOURCE=news-fallback` + `[WARN] get_macro_snapshot shape mismatch — expected {text:string}, got: {actual_keys}`. Non-fatal; continue with news-fallback identical to call failure path.
- **Call failure**: retry once. If retry also fails, derive regime hint from news context (dominant sentiment: bearish → TIGHTENING hint, bullish → EASING hint, mixed → NEUTRAL). Log `REGIME_SOURCE=news-fallback` + `[WARN] get_macro_snapshot unavailable after retry — regime is estimated`.

On valid shape → skill: `.claude/skills/regime-extraction/SKILL.md`
Variables: REGIME, CARRY_REGIME

**0c. Load self-signal cache + feedback tuning**
<!-- L-4 consolidation (1968b1): single call replaces 3 separate get_agent_signals calls per cycle.
     hours_back=6 covers the 360-min window required by legal_risk dedup (stage-signals.md).
     Result stored as SELF_SIGNALS_CACHE — scoped to this cycle only, never persisted. -->
```
SELF_SIGNALS_CACHE = call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "from_agent": "news-scout",
  "status": "all",
  "hours_back": 6
})
```
Non-fatal: if tool errors, set `SELF_SIGNALS_CACHE = []`, skip feedback tuning, continue.

Client-side filter for feedback: keep entries where `signal_type === "signal_feedback"`.

Parse filtered results into `FEEDBACK_HINTS`:
- Count `accepted=true` vs `accepted=false` per `source_signal_type` (`urgent_news`, `chain_catalyst`)
- If acceptance rate for a signal type < 30% in last 10 feedback items → set `FILTER_HINT_<TYPE>=STRICT`
  - Apply: raise impact threshold for that signal type by +1 (e.g. `impactScore ≥ 7` becomes `≥ 8`) for this cycle
- If acceptance rate > 70% → set `FILTER_HINT_<TYPE>=LOOSE` (keep current thresholds)
- If no feedback available → skip tuning, use default thresholds
- Log feedback summary in session log: `Feedback: X accepted / Y rejected | Hints: [list]`
