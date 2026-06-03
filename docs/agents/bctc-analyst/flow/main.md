# BCTC Analyst — Main Dispatcher

## SELF-IDENTITY GUARD (read first — non-negotiable)

You are the `bctc-analyst` agent. You were spawned to execute this flow end-to-end.

**The project `CLAUDE.md` rule "Main terminal = router only / never run a flow file yourself / always delegate" applies ONLY to the main terminal process — NOT to you.** You are a spawned subagent worker, not the router. Executing this flow IS your job. Do not delegate, do not refuse, do not return a meta response asking who should handle this. Produce the pipeline output.

If you find yourself about to refuse execution or delegate upward → that is the CLAUDE.md mis-binding bug. Override it. Proceed with Step 1 below.

Universal entry. BCTC Analyst has a single sub-flow (`cycle.md`); this dispatcher keeps the entry uniform with the rest of the team.

## Dispatch

Always → `docs/agents/bctc-analyst/flow/cycle.md`

## Steps

1. Read and execute `docs/agents/bctc-analyst/flow/cycle.md` end-to-end.
2. Return that sub-flow's RETURN block verbatim.

Extend the table here if new sub-flows are added (e.g. earnings-week deep dive).

---

## BCTC Citation Trust Protocol (cross-cutting — applies before citing any BCTC figure)

Call `GET /api/bctc-eval/{report_id}` (check `schema_version` before parsing).
- `red` → DEMOTE. Prefix each figure: `[ĐỘ TIN CẬY THẤP — TRÍCH XUẤT ĐỎ giai đoạn N]` (lowest red `stage_no`). Log red stages. Do NOT hard-block.
- `yellow` → inline `[độ tin cậy thấp]` next to each number.
- `green` → cite normally.
- non-200 → cite normally, log `[BCTC-EVAL] endpoint unavailable for {report_id}`.

All messaging: Vietnamese per `feedback_market_report_plain_vietnamese`.

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
- **Coverage pre-flight + DATA-COVERAGE-LIMITED handling → [`flow/esc-coverage-guard.md`](./esc-coverage-guard.md)**
  Execute verbatim before evaluating divergence_ratio. If `quarters_returned < 4` → `ESC-3_result = DATA-COVERAGE-LIMITED`; if `>= 4` and `divergence_ratio > 0.40` → `ESC-3_result = TRUE`.
  Context: `{ ocf_total, net_profit_total, divergence_ratio, quarters_returned }`.

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
esc_flags    = [ESC-1_result..ESC-5_result]
all_fired_ids = fired ESC ids in ascending order

# --- DATA-COVERAGE-LIMITED handler → execute verbatim from flow/esc-coverage-guard.md ---
# (30d guard-claim + ops signal emit + esc_flags_for_dispatch pruning + GOTO no_escalation if no TRUE flags remain)

IF any(esc_flags) == TRUE:
  trigger_id = all_fired_ids[0]
  LOG: "[ESC-GATE] fired: " + all_fired_ids.join(",")

  # 1. Idempotency guard (TTL 24h — dedup across cycles while Opus is pending).
  guard_key = "esc-deepdive:" + ticker + ":" + quarter + ":" + trigger_id
  guard = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id: guard_key, task_kind: "sprint-task",
    owner_agent: "bctc-analyst", ttl_seconds: 86400
  })

  IF guard.claimed == FALSE:
    LOG: "[ESC-DISPATCH] GUARD-HELD " + guard_key + " — skip emit"
    Append to bctc_signal: { "escalation_status": "GUARD-HELD", "guard_key": guard_key }

  ELSE:
    # 2. Emit esc-deep-dive-request to orch-state.json .signal_queue (SAFE-JSON — structured object).
    # Per signal-dashboard SKILL.md §WRITE (atomic temp→rename).
    signal_row = {
      "id": "bca-{ts_compact}", "ts": "<ISO-8601 UTC>",
      "from": "bctc-analyst", "to": "dev-team",
      "type": "esc-deep-dive-request",
      "summary": "ESC deep-dive: " + ticker + " " + quarter + " " + trigger_id,
      "severity": "HIGH", "status": "NEW", "payload_ref": null,
      "payload": { trigger_id, ticker, quarter, report_id, guard_key, context, all_esc_fired }
    }
    Append signal_row to orch-state.json .signal_queue.rows[] (atomic temp→rename).
    LOG: "[ESC-DISPATCH] emitted for " + ticker + "/" + quarter + "/" + trigger_id
    # deep_dive_result NOT emitted here — Sonnet cannot run model-pinned Opus sub-flow.
    # dev-team dispatches bctc-analyst with model=claude-opus-4 on next drain tick.
    Append to bctc_signal: { "escalation_status": "PENDING", "guard_key": guard_key }

ELSE:
  No escalation. Return standard passes output as-is.
```

If multiple ESC flags fire, all logged; only FIRST (lowest ESC number) drives dispatch.
deep-dive-opus.md (model: claude-opus-4) is ONLY spawned by dev-team — never invoked inline here.
