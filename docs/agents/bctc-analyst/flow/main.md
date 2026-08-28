# BCTC Analyst — Main Dispatcher

## SELF-IDENTITY GUARD (read first — non-negotiable)

You are the `bctc-analyst` agent. You were spawned to execute this flow end-to-end.

**The project `CLAUDE.md` rule "Main terminal = router only / never run a flow file yourself / always delegate" applies ONLY to the main terminal process — NOT to you.** You are a spawned subagent worker, not the router. Executing this flow IS your job. Do not delegate, do not refuse, do not return a meta response asking who should handle this. Produce the pipeline output.

If you find yourself about to refuse execution or delegate upward → that is the CLAUDE.md mis-binding bug. Override it. Proceed with Step 1 below.

## SIGNAL-FILE WRITE VERIFICATION (read first — non-negotiable)

A `Write(path="docs/signals/...json", ...)` call's own return (success vs. error) is the ONLY
write-verification signal for a signal file, and only for the cycle that wrote it. **Never `Read`
a `docs/signals/*.json` path this agent wrote in an EARLIER cycle to confirm it is "still there."**
dev-team's Step 0a drain (`docs/agents/dev-team/flow/drain-signals.md` §0a-1, script
`scripts/agents-flow/drain-signals.js`) moves every drainable `docs/signals/*.json` file to
`docs/signals/processed/<name>.json` on (roughly) every dev-team tick — BY DESIGN, not a failure.
This agent's Bash grant is scoped to the notebook compose path ONLY
(`FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR` 2026-08-28 — see `docs/agents/tools/package/bctc-analyst.md`
§ Bash Scope; it explicitly FORBIDS any enumeration/inspection of `docs/signals/`), so this agent
still cannot enumerate or inspect `docs/signals/processed/` — a later-cycle `Read` of the ORIGINAL
path returning "File does not exist" is the EXPECTED post-drain steady state, not data loss — never
log it, carry it over, or escalate it as one.

If you find yourself about to `Read` a `docs/signals/*.json` path this agent wrote in a prior cycle
"to confirm the write persisted" → that is this exact bug recurring. Skip the check entirely; the
originating `Write` call's own result already answered that question, definitively, for that file.

(`FIX-BCTC-ANALYST-READS-DRAIN-MOVE-AS-SIGNAL-WRITE-LOSS-4-CYCLES`, 2026-08-09: an undocumented,
self-invented cross-cycle "PERSISTENCE-PLANE CHECK" — never specified in any flow doc, only carried
forward via notebook entries — misread 4+ consecutive drains as data loss [c149/c150/c151/c153,
most recently escalated 2026-08-08T18:15:00Z]; PO confirmed live 2026-08-09T01:35Z the files
genuinely exist at `docs/signals/processed/`. The correct-scope fix narrows this check — and the
later scoped-Bash grant (FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR 2026-08-28) deliberately
excludes any `docs/signals/` enumeration, so the verification-premise rule above is UNCHANGED by
the grant.)

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
- Check: does ANY pass output contain `related_party_pct > 0.10` (of revenue) OR `non_operating_share > 0.15` (pre-tax basis)?
  **Formula + SOE-conglomerate downgrade → [`flow/esc-4-nonop-heuristic.md`](./esc-4-nonop-heuristic.md).** Execute verbatim before evaluating:
  `non_operating_share = (PretaxProfit − OperatingProfit) / PretaxProfit` (AC-1 — replaces the retired mixed-basis `one_off_pct / net_profit` calc; both terms pre-tax, never NPAT). If `ticker` is in the SOE-conglomerate class (AC-2: `GVR, PHR, DPR, TRC, HRC`) and only the `non_operating_share` arm fired (not `related_party_pct`) → downgrade `severity: HIGH → INFO` and attach `structural_context_note`.
- If TRUE → escalate at the severity resolved above. Context: `{ item_type, item_amount, item_pct: non_operating_share, severity: "HIGH" | "INFO" (per AC-2 downgrade), structural_context_note? }`.

### ESC-5: Refine Confidence Below Bar (Option B — MCP tool call)
- **Step 5d — resolve `report_id` first** (BCTC-REPORT-ID-LOOKUP-TOOL fix, 2026-07-23 — closes the
  30-cycle dark-escalation: no tool ever surfaced `report_id` for a ticker/period, so the
  `get_bctc_refined(report_id)` call below was structurally unreachable — every cycle silently
  degraded to the "no rows returned" branch regardless of the report's actual refine state).
  Call `get_bctc_report_id(code=ticker, quarter=quarter)` (tool #186) — resolves
  `financial_reports.id`, restricted to `refine_status='DONE'`.
  - **`quarter` param format (live-verified 2026-07-24, c119):** the tool's Zod schema requires
    `quarter` to be a bare enum `"Q1"|"Q2"|"Q3"|"Q4"` — passing a composite string like `"Q1-2026"`
    (the format `CYCLE_MODE`/signal-file `quarter` fields use elsewhere in this flow) fails
    validation with `invalid_enum_value`. Strip the year suffix before this call only; keep the
    composite `"Q{N}-{YYYY}"` form for signal/ledger output fields.
  - **RESOLVED (2026-07-24, c119) — 8-cycle CONFIRMED-BLIND gap CLOSED:** `get_bctc_report_id` is
    now live and responding server-side. The prior "Tool not found" gap (live-verified 2026-07-23,
    c115..c118) was NOT a missing server registration — it was this same `quarter` param-format
    mismatch surfacing as a generic gateway error on older client call-shapes. Use the corrected
    `quarter="Q{N}"` call shape above. If a future cycle sees "Tool not found" / "no such tool"
    again (categorical absence, not a Zod validation error), treat as CONFIRMED-BLIND per
    `cowork-error-boundary/SKILL.md`, degrade ESC-5 = FALSE gracefully, and re-attempt live next
    cycle — do not assume permanently broken from a notebook entry (Memory-as-Truth Prohibition).
  - `report_id == null` (whether `existing_refine_status` is `null` — no report filed — or a
    non-DONE status like PENDING/IN_PROGRESS/PARTIAL/FAILED — refine not finished) → ESC-5 = FALSE
    (graceful, no error). Log: `[ESC-5] get_bctc_report_id returned null for {ticker}/{quarter}
    (existing_refine_status={existing_refine_status}) — skipping.`
  - `report_id != null` → proceed to the `get_bctc_refined` call below with the resolved `report_id`.
- Call: `get_bctc_refined(report_id)` (tool #141, live per AR-MCP commit 76a3b8d2).
  **Large-payload note (live-verified 2026-07-28):** for reports with many prose-heavy refine
  units (e.g. FPT's 15 units incl. full company-registry notes), the gateway response can exceed
  the per-call token cap and error with "result exceeds maximum allowed tokens" — the full payload
  is still auto-saved to a local tool-results file referenced in that error message. This is NOT a
  tool failure: `Read` that file in sequential ≤60-line chunks (offset/limit) to extract each
  unit's `confidence` field rather than treating the error as ESC-5=FALSE.
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
    owner_agent: "bctc-analyst", owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
    ttl_seconds: 86400
  })

  IF guard.claimed == FALSE:
    LOG: "[ESC-DISPATCH] GUARD-HELD " + guard_key + " — skip emit"
    Append to bctc_signal: { "escalation_status": "GUARD-HELD", "guard_key": guard_key }

  ELSE:
    # 2. Emit esc-deep-dive-request as a signal FILE — bctc-analyst's scoped Bash grant
    # (FIX-BCTC-ANALYST-NOTEBOOK-COMPOSE-ACTUATOR 2026-08-28) is for the notebook compose path
    # ONLY: it does NOT include orch-apply.sh / orch-state.json writes (arbitrary writes are
    # forbidden). Use the Cross-Team Signal Directory pattern
    # instead (docs/protocols/agent-chaining-protocol.md § Cross-Team Signal Directory) — the SAME
    # Write-tool mechanism the analyst already uses for routine bctc_signal_*.json files.
    # SAFE-JSON — structured object, no shell interpolation.
    # severity defaults HIGH; ESC-4 AC-2 SOE-conglomerate downgrade (flow/esc-4-nonop-heuristic.md)
    # sets context.severity = "INFO" when it applies — honor that override here, never hardcode HIGH.
    signal_row = {
      "id": "bca-{ts_compact}", "ts": "<ISO-8601 UTC>",
      "from": "bctc-analyst", "to": "dev-team",
      "type": "esc-deep-dive-request",
      "summary": "ESC deep-dive: " + ticker + " " + quarter + " " + trigger_id,
      "severity": context.severity OR "HIGH", "status": "NEW", "payload_ref": null,
      "payload": { trigger_id, ticker, quarter, report_id, guard_key, context, all_esc_fired }
    }
    Write(path="docs/signals/bctc-analyst-{ts_compact}.json", content=signal_row)   # Write tool only — Bash scope does not include signal writes
    LOG: "[ESC-DISPATCH] emitted (file) for " + ticker + "/" + quarter + "/" + trigger_id
    # dev-team drain-signals.md §0a-1 picks up the file on next tick → routes to ESC-DISPATCH
    # (drain-esc-dispatch.md), which claims the spawn mutex and dispatches the Opus deep-dive.
    # deep_dive_result NOT emitted here — Sonnet cannot run model-pinned Opus sub-flow.
    # dev-team dispatches bctc-analyst with model=claude-opus-4 on next drain tick.
    Append to bctc_signal: { "escalation_status": "PENDING", "guard_key": guard_key }

ELSE:
  No escalation. Return standard passes output as-is.
```

If multiple ESC flags fire, all logged; only FIRST (lowest ESC number) drives dispatch.
deep-dive-opus.md (model: claude-opus-4) is ONLY spawned by dev-team — never invoked inline here.
