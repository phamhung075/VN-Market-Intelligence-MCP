# Digest & Predict — Monday Prediction Flow (00:30 UTC)

**Tools:** `.claude/tools/package/digest-predict.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
`get_calibration_report()` | watchlist evidence summaries

## Output
Up to 5 prediction claims created | WORK notified | session log

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
All "No evidence" → `send_telegram(channel="work", "Monday prediction skipped: zero evidence.")` → EXIT

**P-3. Evidence** per ticker `get_evidence_summary(stock)`
Skip "No evidence" | parse: `bullish_score`, `bearish_score`, `neutral_score`, likelihood ratios

**P-4. High-conviction** filter: `bullish_score > 0.6` OR `bearish_score > 0.6`
→ `get_bctc_full(stock)` | `get_market_snapshot()`

**P-5. Claims** (max 5) — >5 qualify → rank by `|bullish - bearish|` descending → top 5

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

**P-6. Notebook commit** — append to `docs/agent-memory/notebooks/digest-predict.md`:
```
### Monday Predictions (HH:MM UTC)
- Calibration: [status], delta: [value] | Claims: N | Dampening: [yes/no]
```
**Commit (mutex-guarded)** → skill: `.claude/skills/commit-mutex/SKILL.md`
```bash
# own_paths: [docs/agent-memory/notebooks/digest-predict.md]
# Protocol: task_claim commit-mutex:main (TTL=60s) → git add <own_paths> → verify → git commit → task_release
git add docs/agent-memory/notebooks/digest-predict.md
git commit -m "chore(memory/digest-predict): notebook YYYY-MM-DD"
```

**P-7.** `log_agent_work(summary="Created {N} claims for {TICKERS}. Horizons: {5d:X,10d:Y,20d:Z}. Avg: {avg}. Dampening: {yes/no}.")`

**P-8. WORK**: `send_telegram(channel="work", "[digest-predict] Monday claims: {N}\n- {TICKER}: {claim_text} (p={prob}, {horizon}d)\n...")`
`DAMPENING_ACTIVE` → append "Self-correction: confidence -10%."

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
