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

<!-- L-6 (1968c-P01): If cycle-bootstrap Step -1 loaded a tick snapshot (CYCLE_SNAPSHOT set),
     macro_snapshot is already available — skip the direct get_macro_snapshot call.
     Only call get_macro_snapshot if CYCLE_SNAPSHOT was NOT loaded (fallback path). -->

If `CYCLE_SNAPSHOT` IS set: extract `macro_snapshot` from `$CYCLE_SNAPSHOT.macro_snapshot` → use for regime extraction. Log: `[BOOTSTRAP] macro from tick-snapshot — skipping get_macro_snapshot`.
If `CYCLE_SNAPSHOT` is NOT set: call `get_macro_snapshot` directly.

Fallback: if `get_macro_snapshot` fails on first attempt, **retry once** (single retry, no delay). If retry also fails, derive regime hint from news context (dominant sentiment: bearish → TIGHTENING hint, bullish → EASING hint, mixed → NEUTRAL). Log as `REGIME_SOURCE=news-fallback` AND append `[WARN] get_macro_snapshot unavailable after retry — regime is estimated, apply conservative (higher) threshold tier regardless of derived hint`. See skill `regime-extraction/SKILL.md` § Regime Extraction for canonical variable definitions.

**Shape-validation gate (Task 1918a):** After each `get_macro_snapshot` call (initial attempt AND retry), parse the JSON response and check that it contains a `text` field of type string. A missing or non-string `text` field means a wrong-shape payload was returned (e.g. `{"status":"degraded","message":"..."}` system_status bleed). Treat shape mismatch identically to a call failure: route to news-fallback, log `REGIME_SOURCE=news-fallback` + `[WARN] get_macro_snapshot shape mismatch — expected {text:string}, got: {actual_keys}`. Do **not** accept the response and do **not** attempt regime extraction from the malformed payload.

Guard logic reference: `apps/mcp-server/src/interface/mcp/tools/macro/macroSnapshotGuard.ts` → `isMacroSnapshotValidShape(parsedResponse)`

> **Auto-cure note (TNB c53 2026-05-14):** 3-cycle evidence of off-hours news-fallback producing regime inconsistency (c51 10:03 UTC, c52 14:02 UTC, c53 15:04 UTC — all off-hours 2h cycles, news-fallback → TIGHTENING while macro snapshot returns NEUTRAL). Retry-once + conservative-tier warning added to reduce regime drift on tool timeout.

**1. Context** (enriched with market indicators):
```
get_market_context(hours_back=6)
get_alerts(type="price")
call_tool(server="vn-market", tool="get_volatility_indicators", arguments={})
call_tool(server="vn-market", tool="get_vn_liquidity_state", arguments={})
call_tool(server="vn-market", tool="get_foreign_room", arguments={})
```
If market indicators available: extract volatility regime (gk_vol_20d_pct, vol_regime), liquidity state (omo.net_outstanding_bn_vnd with blocked_reason for honest-NULL, interbank_1w.rate_1w_pct), and foreign-room exhaustion (derive from tickers[].utilization.room_utilization_pct — high pct = exhausted). Use to contextualize alert thresholds (e.g., elevated volatility → lower threshold for price alerts; OMO constrained → higher conviction for liquidity-driven alerts). If any tool returns NULL or error: log `[SKIP] <tool_name> unavailable` and proceed with standard alert thresholds.

**2. Legal + Crisis**

<!-- FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK (2026-07-03): bare get_legal_risk_signals() had NO
     lookback bound at the call site — combined with the tool's unbounded-from-this-caller's
     perspective 30-day default and stage-signals.md's unconditional "legal_risk | any → CRITICAL"
     routing, a single event (e.g. PNJ prosecution) re-fired CRITICAL every cycle (15min market /
     4h off-hours) for up to 30 days. `days=1` bounds the QUICK-tier window now (live immediately,
     no deploy needed — `days` already existed on the tool). `hours_back=6` is a forward-compat,
     additive param shipped in the same edit — the CURRENT deployed tool safely ignores unknown
     keys (ONLY `days` takes effect until the ROBUST-tier mcp-server rebuild ships); once deployed,
     `hours_back` takes precedence and tightens the window to the codebase's established 360-min/6h
     legal_risk dedup convention. Neither param silences a genuinely NEW legal_risk event — only
     bounds how long a stale one keeps re-surfacing. -->
`get_legal_risk_signals(days=1, hours_back=6)` hit → mark CRITICAL
`get_crisis_early_warning()` threshold exceeded → mark CRITICAL

> **Clarification (alert-commander, discovered live 2026-07-23T12:10Z):** `get_legal_risk_signals()` returning clean does NOT prove no legal_risk CRITICAL condition exists this cycle — the inter-agent signal bus (`get_agent_signals`) can independently carry a `LEGAL_RISK`-type signal from news-scout ahead of (or instead of) the dedicated detector picking it up. Live instance: DGC id9018 "Khởi tố Tổng Giám đốc" — `get_legal_risk_signals` returned clean while the bus carried the signal, which was correctly treated as CRITICAL per the Step 3 Signal Matrix. Always evaluate the bus-based legal_risk row (Step 3) even when this tool call reports no hits — the two are independent, complementary paths to the same classification, not redundant checks.
