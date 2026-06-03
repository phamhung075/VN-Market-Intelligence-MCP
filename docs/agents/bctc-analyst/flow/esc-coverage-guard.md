---
agent: bctc-analyst
sub_flow: esc-coverage-guard
version: "2026-06-03"
---

> Parent: [./main.md](./main.md)

# BCTC Analyst — ESC-3 Data-Coverage Guard

Loaded by main.md § ESC-3 coverage pre-flight and § DATA-COVERAGE-LIMITED handler.

---

## Coverage Pre-Flight (ESC-3 only — runs before divergence_ratio eval)

```
call get_cash_flow(ticker, quarters=4). Read quarters_returned from response.

IF quarters_returned < 4:
  Set ESC-3_result = DATA-COVERAGE-LIMITED  # distinct — not TRUE, not FALSE
  LOG: "[ESC-3] DATA-COVERAGE-LIMITED: {ticker}/{quarter} — {quarters_returned}/4 quarters available.
        Multi-period accrual decomposition impossible. Blocking escalation to dev-team."
  → proceed to DATA-COVERAGE-LIMITED handler below; skip divergence_ratio eval.

IF quarters_returned >= 4:
  Evaluate divergence_ratio as normal. If divergence_ratio > 0.40 → ESC-3_result = TRUE.
  Context: { ocf_total, net_profit_total, divergence_ratio, quarters_returned }.
```

---

## DATA-COVERAGE-LIMITED Handler

Runs inside Escalation Decision, before normal ESC dispatch. Triggered when any
esc_id_result == "DATA-COVERAGE-LIMITED" (currently only ESC-3).

```
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
      Append to bctc_signal: { "esc3_status": "DATA-COVERAGE-LIMITED",
        "coverage_guard_key": cov_guard_key, "coverage_guard_held": true }
    ELSE:
      cov_signal_row = {
        "id": "bca-datacov-{ts_compact}", "ts": "<ISO-8601 UTC>",
        "from": "bctc-analyst", "to": "ops",
        "type": "data-coverage-gap",
        "summary": "ESC-3 DATA-COVERAGE-LIMITED: " + ticker + " " + quarter
                   + " — {quarters_returned}/4 quarters available",
        "severity": "LOW", "status": "NEW", "payload_ref": null,
        "payload": {
          "trigger_id": limited_id, "ticker": ticker, "quarter": quarter,
          "quarters_returned": quarters_returned, "quarters_required": 4,
          "root_task": "BCTC-HIST-VPS-BACKFILL",
          "note": "Multi-period accrual decomposition blocked by data coverage, not tool bug.
                   No Opus deep-dive warranted. Re-check when quarters_returned >= 4.",
          "guard_key": cov_guard_key, "guard_ttl_days": 30
        }
      }
      Append cov_signal_row to orch-state.json .signal_queue.rows[] (atomic temp→rename).
      LOG: "[ESC-DISPATCH] DATA-COVERAGE-LIMITED emitted (ops, once per 30d): "
           + ticker + "/" + quarter + "/" + limited_id
      Append to bctc_signal: { "esc3_status": "DATA-COVERAGE-LIMITED",
        "coverage_guard_key": cov_guard_key, "quarters_returned": quarters_returned }
  esc_flags_for_dispatch = {id: result for id, result in esc_flags
                            if result not in ["DATA-COVERAGE-LIMITED"]}
  IF all(v != TRUE for v in esc_flags_for_dispatch.values()):
    GOTO no_escalation
# --- end DATA-COVERAGE-LIMITED handler ---
```

**Stale-NOTE correction:** `quarters_returned < quarters_requested` = DATA COVERAGE GAP, not tool bug.
`get_cash_flow quarters` param IS honored (DONE-LIVE-VERIFIED 2026-06-03). Guard above handles this.
