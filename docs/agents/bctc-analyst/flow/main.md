<!-- size-justification: CAP-EXCEEDED ~168L (was 124L) — ESC-3 DATA-COVERAGE-LIMITED guard handler added 2026-06-03 per brief 2026-06-03-esc3-data-coverage-guard.md (agents-architect, commit 2a40d47e). Handler is load-bearing: coverage pre-flight + 30d guard claim + ops signal emit + esc_flags pruning. Cannot extract without losing guard/dispatch contract. FLAG: flow-file cap=120L; exceeds by ~48L due to spec-mandated verbatim handler block. Architecture brief explicitly required verbatim implementation. Raise cap or refactor in follow-up. -->
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
- **Coverage pre-flight:** call `get_cash_flow(ticker, quarters=4)`. Read `quarters_returned` from response.
  - If `quarters_returned < 4`:
    Set `ESC-3_result = DATA-COVERAGE-LIMITED` (distinct — not TRUE, not FALSE).
    Log: `[ESC-3] DATA-COVERAGE-LIMITED: {ticker}/{quarter} — {quarters_returned}/4 quarters available. Multi-period accrual decomposition impossible. Blocking escalation to dev-team.`
    (See DATA-COVERAGE-LIMITED handler in § Escalation Decision below.)
  - If `quarters_returned >= 4`:
    Evaluate divergence_ratio as before. If `divergence_ratio > 0.40` → `ESC-3_result = TRUE`.
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

# --- DATA-COVERAGE-LIMITED handler (runs before normal ESC dispatch) ---
coverage_limited_ids = [esc_id for esc_id in ["ESC-3"] if esc_id_result == "DATA-COVERAGE-LIMITED"]
IF coverage_limited_ids is non-empty:
  For each limited_id in coverage_limited_ids:
    cov_guard_key = "esc-datacov:" + ticker + ":" + quarter + ":" + limited_id
    cov_guard = call_tool(server="vn-market", tool="task_claim", arguments={
      task_id: cov_guard_key, task_kind: "sprint-task",
      owner_agent: "bctc-analyst", ttl_seconds: 2592000   # 30 days
    })
    IF cov_guard.claimed == FALSE:
      LOG: "[ESC-DISPATCH] COVERAGE-GUARD-HELD " + cov_guard_key + " — no re-emit"
      Append to bctc_signal: { "esc3_status": "DATA-COVERAGE-LIMITED", "coverage_guard_key": cov_guard_key, "coverage_guard_held": true }
    ELSE:
      cov_signal_row = {
        "id": "bca-datacov-{ts_compact}", "ts": "<ISO-8601 UTC>",
        "from": "bctc-analyst", "to": "ops",
        "type": "data-coverage-gap",
        "summary": "ESC-3 DATA-COVERAGE-LIMITED: " + ticker + " " + quarter + " — {quarters_returned}/4 quarters available",
        "severity": "LOW", "status": "NEW", "payload_ref": null,
        "payload": {
          "trigger_id": limited_id, "ticker": ticker, "quarter": quarter,
          "quarters_returned": quarters_returned, "quarters_required": 4,
          "root_task": "BCTC-HIST-VPS-BACKFILL",
          "note": "Multi-period accrual decomposition blocked by data coverage, not tool bug. No Opus deep-dive warranted. Re-check when quarters_returned >= 4.",
          "guard_key": cov_guard_key, "guard_ttl_days": 30
        }
      }
      Append cov_signal_row to orch-state.json .signal_queue.rows[] (atomic temp→rename).
      LOG: "[ESC-DISPATCH] DATA-COVERAGE-LIMITED emitted (ops, once per 30d): " + ticker + "/" + quarter + "/" + limited_id
      Append to bctc_signal: { "esc3_status": "DATA-COVERAGE-LIMITED", "coverage_guard_key": cov_guard_key, "quarters_returned": quarters_returned }
  esc_flags_for_dispatch = {id: result for id, result in esc_flags if result not in ["DATA-COVERAGE-LIMITED"]}
  IF all(v != TRUE for v in esc_flags_for_dispatch.values()):
    GOTO no_escalation
# --- end DATA-COVERAGE-LIMITED handler ---

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
    # NOTE FU-BCTC-TOOL-PARAMS: DONE-LIVE-VERIFIED (2026-06-03). quarters param IS honored by get_cash_flow.
    # quarters_returned < quarters_requested = DATA COVERAGE GAP, not tool bug. Guard above handles this.
    Append to bctc_signal: { "escalation_status": "PENDING", "guard_key": guard_key }

ELSE:
  No escalation. Return standard passes output as-is.
```

If multiple ESC flags fire, all logged; only FIRST (lowest ESC number) drives dispatch.
deep-dive-opus.md (model: claude-opus-4) is ONLY spawned by dev-team — never invoked inline here.
