# Digest & Predict — Daily Prediction Synthesis (17:30 UTC / 00:30 VN)

**Tools:** `docs/agents/tools/package/digest-predict.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
`get_calibration_report()` | watchlist evidence summaries

## Output
Up to 3 prediction claims created | WORK notified | session log

---

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `digest-predict`)

**0b. Regime** → skill: `.claude/skills/regime-extraction/SKILL.md`
Variables: REGIME, DAMPENING_ACTIVE

Parse `get_macro_snapshot` text block in bootstrap:
```
REGIME = "Global Liquidity: X" → TIGHTENING | EASING | NEUTRAL
```
If `get_macro_snapshot` not in bootstrap → call it once now.
`REGIME=TIGHTENING` → `DAMPENING_ACTIVE=true` (regardless of calibration) + append to P-8 WORK: `"Thiên Thời TIGHTENING — xác suất tự động giảm 10%."`
Note: does NOT skip predictions entirely — predictions are still useful in TIGHTENING, but with lower confidence.

**P-0. Self-assessment** `get_calibration_report()`
- "No calibration data" → proceed normally
- "degrading" AND `trend_delta > 0.05` → `DAMPENING_ACTIVE=true`, apply `final_confidence = min(0.95, max(0.05, computed * 0.90))`
- Improving/stable → proceed normally
`log_agent_work(summary="Self-assessment: {status}. Dampening: {yes/no}.")`

**P-1.** `get_watchlist()`

**P-2. Prerequisite** `get_evidence_summary(stock)` for ≥1 ticker
All "No evidence" → `send_telegram(channel="work", message="[digest-predict] Daily prediction skipped: zero evidence.")` → EXIT

**P-3. Market indicators context** (run at start of evidence gathering):
```
call_tool(server="vn-market", tool="get_volatility_indicators", arguments={})
call_tool(server="vn-market", tool="get_breadth_thrust", arguments={})
call_tool(server="vn-market", tool="get_roc_momentum", arguments={})
call_tool(server="vn-market", tool="get_relative_strength", arguments={})
call_tool(server="vn-market", tool="get_52w_proximity", arguments={})
call_tool(server="vn-market", tool="get_insider_sentiment", arguments={})
```
If successful: extract volatility regime (rv_10/20/60d, GK vol), breadth indicators (McClellan/Zweig), momentum indicators (roc, z_score, decile), relative strength metrics (rs, percentile, composite_score), 52-week proximity (pct_from_52w_high, pct_from_52w_low), and insider sentiment (net_sentiment_score). Use to contextualize individual ticker predictions (e.g., if market volatility is elevated or breadth is weakening, adjust confidence; if momentum strong or positioning near 52w-low with rising momentum, increase conviction for recovery thesis; if insider buying concentration correlates with bullish evidence, boost confidence). If any tool returns NULL or error: log `[SKIP] <tool_name> unavailable` and continue with ticker-level evidence only (no market context).

**P-3. Evidence** per ticker `get_evidence_summary(stock)`
Skip "No evidence" | parse: `bullish_score`, `bearish_score`, `neutral_score`, likelihood ratios

**P-4. High-conviction** filter: `bullish_score > 0.6` OR `bearish_score > 0.6`
→ `get_bctc_full(stock)` | `get_market_snapshot()`

If qualify_count == 0:
  `send_telegram(channel="work", message="[digest-predict] Daily prediction NO-OP {DATE}: zero tickers above conviction threshold. No claims created.")`
  EXIT cleanly — this is correct behavior, not an error.

**P-5. Claims** — DAILY CAP = 3 — >3 qualify → rank by `|bullish - bearish|` descending → top 3

Probability: `min(0.95, max(0.05, score * top_likelihood_ratio))`
- `sample_size < 10` → untrusted → `top_likelihood_ratio = 1.0`
- `DAMPENING_ACTIVE` → `final_confidence = min(0.95, max(0.05, computed * 0.90))`

Horizon:
| delta | horizon_days |
|-------|-------------|
| ≥ 0.5 | 5 |
| ≥ 0.3 | 10 |
| < 0.3 | 20 |

`claim_text` Vietnamese full diacritics.
`resolution_criteria` valid JSON:
```json
{"metric":"price_close","operator":">","value":80000,"currency":"VND","description":"..."}
```
`create_prediction_claim(stock, claim_text, probability, horizon_days, resolution_criteria)`

**P-6. Notebook commit** — settled-write invariant (AC-3: compose in memory, one Write only):

Step 1 — Read full `docs/agent-memory/notebooks/digest-predict.md` into memory.
Step 2 — Identify preamble (before first `^## `) and all `^## ` section boundaries.
Step 3 — If ≥ 3 sections: drop oldest `## ` block from in-memory body.
Step 4 — Build new section (≤60L) in memory:
```
### Daily Predictions (HH:MM UTC) YYYY-MM-DD
- Calibration: [status], delta: [value] | Claims: N | Dampening: [yes/no]
```
Append new section to end of in-memory body.
Step 5 — Count in-memory lines. If > 200L: drop next-oldest `## ` block, recount; repeat until ≤200L.
Step 6 — Single settled write:
```
Write(path="docs/agent-memory/notebooks/digest-predict.md", content=<final settled body>)
```

**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/digest-predict.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/digest-predict.md
git commit -m "chore(memory/digest-predict): notebook YYYY-MM-DD"
```

**P-7.** `log_agent_work(summary="Created {N} daily claims for {TICKERS}. Horizons: {5d:X,10d:Y,20d:Z}. Avg: {avg}. Dampening: {yes/no}.")`

**P-8. WORK**: `send_telegram(channel="work", message="[digest-predict] Daily claims {DATE}: {N}\n- {TICKER}: {claim_text} (p={prob}, {horizon}d)\n...")`
`DAMPENING_ACTIVE` → append "Self-correction: confidence -10%."

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
