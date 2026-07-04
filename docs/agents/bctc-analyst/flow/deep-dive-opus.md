---
agent:
  model: claude-opus-4
  id: bctc-analyst
  sub_flow: deep-dive-opus
---

> Parent: [./main.md](./main.md) | Tools: `docs/agents/tools/package/bctc-analyst.md`

# BCTC Analyst — Opus Deep-Dive Sub-Flow

**Model:** claude-opus-4 (ONLY this sub-flow uses Opus — never in main.md or cycle.md)

## Input

```json
{ "trigger_id": "ESC-1|ESC-2|ESC-3|ESC-4|ESC-5", "report_id": "...", "ticker": "...",
  "quarter": "...", "context": {}, "pass_results": [] }
```

## Output Contract (append to analysis result — NEVER replace passes)

Emit to session state key `deep_dive_result`; caller appends to bctc_signal output.
```json
{
  "escalation_trigger": "ESC-1|ESC-2|ESC-3|ESC-4|ESC-5",
  "trigger_value":      "<number|string>",
  "threshold":          "<number|string>",
  "deep_dive_verdict":  "<1-3 paragraphs Vietnamese + English>",
  "confidence":         0.0,
  "recommended_action": "flag_for_human_review|hold|buy|sell"
}
```

---

## ESC-1 — Suspected Accounting Manipulation

**Context:** `flagged_pass_id`, `flagged_section`, `flagged_rows[]`, `trick_type`.

1. `get_bctc_full(code)` — re-read flagged statement section.
2. `search_similar_context(query=ticker+" "+flagged_section, k=3)` — cross-reference footnotes.
3. Determine: confirmed (mechanism + evidence) | refuted (false positive).
4. `trigger_value = trick_type`, `threshold = "any_flag"`.
5. Action: confirmed high-severity → `flag_for_human_review`; refuted/low → `hold`.

## ESC-2 — Balance Sheet Fails Check

**Context:** `assets_total`, `liabilities_total`, `equity_total`, `imbalance` (decimal).

1. Re-read balance sheet line items via `get_bctc_full(code)`.
2. Identify source: minority interest omission? rounding? OCR error? Propose correction.
3. `trigger_value = imbalance`, `threshold = 0.005`.
4. Action: OCR/rounding → `hold`; genuine discrepancy → `flag_for_human_review`.

## ESC-3 — OCF vs Net-Profit Divergence

**Context:** `ocf_total`, `net_profit_total`, `divergence_ratio` (decimal).

1. `get_cash_flow(ticker, quarters=8)` — full cash flow history.
   If `quarters_returned < 4`: log `[ESC-3 OPUS] DATA-COVERAGE-LIMITED — {quarters_returned} quarters`.
   Set `deep_dive_verdict = "DATA-COVERAGE-LIMITED: {quarters_returned}/4 quarters available. Deferred until BCTC-HIST-VPS-BACKFILL."`, `confidence = 0.0`, `recommended_action = "data_coverage_gap"`.
   Do NOT call `task_release` (allow 86400s TTL). SKIP steps 2–5 → Output Contract + Output Signal.
2. If `quarters_returned >= 4`: decompose accrual drivers: working capital changes (AR, inventory, AP), D&A, deferred items.
3. Assess earnings quality: high accrual → low quality; cash-generative → high quality.
4. `trigger_value = divergence_ratio`, `threshold = 0.40`.
5. Action: OCF > profit (quality) → `buy|hold`; profit > cash (accrual concern) → `flag_for_human_review|hold`.

## ESC-4 — Unusual Related-Party or One-Off Item

**Context:** `item_type` (`related_party|one_off`), `item_amount`, `item_pct` (`one_off` type: this
is `non_operating_share`, pre-tax basis — formula + SOE-conglomerate exception →
[`flow/esc-4-nonop-heuristic.md`](./esc-4-nonop-heuristic.md)).

1. Re-read note disclosures via `get_bctc_full(code)`.
2. Classify: recurring vs one-off; arms-length vs related-party risk.
3. Compute adjusted earnings = net_profit minus one-off impact.
4. `trigger_value = item_pct`, `threshold = 0.10 (related_party) | 0.15 (one_off)`.
5. **SOE-conglomerate check (`one_off` type only):** if `ticker` in `{GVR, PHR, DPR, TRC, HRC}` and
   granular non-operating line items are still unavailable (footnote/segment passes not yet
   returned) → `recommended_action = "hold"`, cite `structural_context_note` in the verdict,
   `confidence <= 0.5` (data gap, not a confirmed finding). Do NOT recommend
   `flag_for_human_review` for this class on the aggregate ratio alone.
6. Action (non-SOE-class, or granular data available): related-party unresolved →
   `flag_for_human_review`; one-off stripped, core healthy → `hold`.

## ESC-5 — Refine Confidence Below Bar

**Context:** `low_confidence_unit_ids[]`, `min_confidence`.

1. For each unit_id: `get_bctc_page_text(report_id, page_number)`.
2. If image available: `get_bctc_page_image(report_id, pages=[page_number])`.
3. Re-examine: resolve value from raw OCR + image or confirm uncertainty.
4. `trigger_value = min_confidence`, `threshold = 0.50`.
5. Action: correctable → `hold` (note corrected values); unresolvable → `flag_for_human_review`.

---

## Error Handling

- Tool call fails → log `[DEEP-DIVE-OPUS] tool_error: {tool} {error}` + `confidence=0.0` + `recommended_action=flag_for_human_review`.
- Unknown trigger_id → log BUG + return `{ "escalation_trigger": "UNKNOWN", "confidence": 0.0, "recommended_action": "flag_for_human_review" }`.
- Never throw. Always emit the output contract block.

---

## Output Signal (mandatory — emit after completing ANY ESC handler, including error path)

After producing `deep_dive_result` session block, write it as a signal FILE — this sub-flow runs
under the bctc-analyst tool package (NO Bash — cannot run orch-apply.sh or write orch-state.json
directly). Use the Cross-Team Signal Directory pattern instead
(docs/protocols/agent-chaining-protocol.md § Cross-Team Signal Directory):
`Write(path="docs/signals/bctc-analyst-{ts_compact}.json", content=<shape below>)`. Shape:

```
id: "bca-ddres-{ts_compact}", ts: <ISO-8601 UTC>, from: "bctc-analyst", to: "po",
type: "deep_dive_result", summary: "Deep dive: {ticker} {quarter} {trigger_id} → {recommended_action}",
severity: "HIGH", status: "NEW", payload_ref: null,
payload: { ticker, quarter, trigger_id,
           escalation_trigger, trigger_value, threshold,
           deep_dive_verdict, confidence, recommended_action }
```

PO receives on next drain tick → routes to market-watcher / alert-commander / human.

Then release the idempotency guard (best-effort; dev-team dispatcher also releases; TTL=86400s safety net):
```
call_tool(server="vn-market", tool="task_release", arguments={
  task_id: "esc-deepdive:" + ticker + ":" + quarter + ":" + trigger_id,
  owner_client_session: $CLAUDE_CODE_SESSION_ID   // REQUIRED — P1-FINAL (TASK_1980)
})
```
