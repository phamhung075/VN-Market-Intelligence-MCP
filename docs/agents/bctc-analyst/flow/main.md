# BCTC Analyst — Main Dispatcher

Universal entry. BCTC Analyst has a single sub-flow (`cycle.md`); this dispatcher keeps the entry uniform with the rest of the team.

## Dispatch

Always → `docs/agents/bctc-analyst/flow/cycle.md`

## Steps

1. Read and execute `docs/agents/bctc-analyst/flow/cycle.md` end-to-end.
2. Return that sub-flow's RETURN block verbatim.

Extend the table here if new sub-flows are added (e.g. earnings-week deep dive).

---

## BCTC Citation Trust Protocol (cross-cutting — applies before citing any BCTC figure)

Before citing any BCTC figure in analysis or signals, call:
```
GET /api/bctc-eval/{report_id}   ← check schema_version field before parsing
```

Status semantics (consistent across all agent consumers):
- `overall_status = "red"` → DEMOTE citation. Prefix every cited figure with:
  `[ĐỘ TIN CẬY THẤP — TRÍCH XUẤT ĐỎ giai đoạn N]`
  where `giai đoạn N` is the lowest-numbered red stage from `stages[*].stage_no`. Do NOT hard-block analysis — imperfect signal is more honest than silence. Log which stages are red.
- `overall_status = "yellow"` → inline flag next to each cited number:
  `[độ tin cậy thấp]`
- `overall_status = "green"` → cite normally, no flag.

If endpoint unavailable (non-200) → cite normally and log `[BCTC-EVAL] endpoint unavailable for {report_id}`.

Note: All trust protocol messaging uses Vietnamese per `feedback_market_report_plain_vietnamese` policy.

---

## Escalation Gate (Post-Passes — runs AFTER all 6 passes + stage-consolidate.md complete)

Gate is DETERMINISTIC: pure threshold comparisons only. No subjective judgment. No "if you think" heuristics.
Each ESC check is independent. Any single TRUE fires Opus deep-dive. Gate does NOT interrupt passes mid-run.

### ESC-1: Suspected Accounting Manipulation
- Check: does ANY of `pass_1_result` .. `pass_6_result` contain field `accounting_trick` or `revenue_pull_forward`?
- If TRUE → escalate. Context: `{ flagged_pass_id, flagged_section, flagged_rows, trick_type }`.

### ESC-2: Balance Sheet Fails Check
- Extract from `pass_1_result` (balance-sheet): `assets_total`, `liabilities_total`, `equity_total`.
- Compute: `imbalance = |assets_total - (liabilities_total + equity_total)| / assets_total`
- If `imbalance > 0.005` → escalate. Context: `{ assets_total, liabilities_total, equity_total, imbalance }`.

### ESC-3: OCF vs Net-Profit Divergence
- Extract `ocf_total` from `pass_3_result` (cashflow-v1); `net_profit_total` from `pass_2_result` (pl-v1).
- Compute: `divergence_ratio = |ocf_total / net_profit_total - 1|`
- Guard: if `net_profit_total == 0` → skip ESC-3 (undefined ratio, no escalation).
- If `divergence_ratio > 0.40` → escalate. Context: `{ ocf_total, net_profit_total, divergence_ratio }`.

### ESC-4: Unusual Related-Party or One-Off Item
- Check: does ANY pass output contain `related_party_pct > 0.10` (of revenue) OR `one_off_pct > 0.15` (of net profit)?
- If TRUE → escalate. Context: `{ item_type, item_amount, item_pct }`.

### ESC-5: Refine Confidence Below Bar (Option B — MCP tool call)
- Call: `get_bctc_refined(report_id)` (tool #141, live per AR-MCP commit 76a3b8d2).
- If no rows returned → ESC-5 = FALSE (refine not yet run for this report — graceful, no error).
  Log: `[ESC-5] bctc_refined_units empty for {report_id} — skipping.`
- If rows returned: check each unit's `confidence` field.
- If ANY unit has `confidence < 0.50` → escalate.
  Context: `{ low_confidence_unit_ids: [unit_ids where confidence < 0.50], min_confidence }`.

### Escalation Decision

```
esc_flags = [ESC-1_result, ESC-2_result, ESC-3_result, ESC-4_result, ESC-5_result]
IF any(esc_flags) == TRUE:
  Invoke sub-flow: flow/deep-dive-opus.md
  Input: { trigger_id: first TRUE ESC id, report_id, ticker, quarter, context, pass_results }
  Await output: deep_dive_result JSON block
  APPEND deep_dive_result to bctc_signal output (do NOT replace standard pass sections)
ELSE:
  No escalation. Return standard passes output as-is.
```

Note: if multiple ESC flags fire, pass the FIRST triggered ESC id (by ESC number, ascending). Log all fired flags.
Sub-flow: `docs/agents/bctc-analyst/flow/deep-dive-opus.md` (model: claude-opus-4 declared there only).
