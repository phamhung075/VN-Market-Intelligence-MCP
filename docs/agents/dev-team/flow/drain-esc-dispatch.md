<!-- size-justification: 150L — ESC-DISPATCH handler extracted from drain-signals.md (brief §3.2/§6) to
     keep drain-signals.md under 120L cap. All handler steps are load-bearing and cannot be split
     further without losing trigger→action traceability. BGFAN-1 2026-06-07: run_in_background=true added to Agent spawn (+3L).
     FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH 2026-07-02: dual-source (dashboard|file) row handling
     added — bctc-analyst has no Bash and now emits escalations as docs/signals/*.json files; steps 2
     and 6 branch on row.source so file-sourced rows (already archived by drain-signals.js) are not
     double-marked (+21L). FIX-DRAINESC-SEVERITY-RECURRENCE-GATE 2026-07-04: GATE-A severity floor
     (>=HIGH) + GATE-B two-tier known-root DEDUP (board-row-exists Tier 1, signals_processed count
     Tier 2) inserted between Step 2 and Step 3, sharing one TERMINAL-EXIT cleanup sub-step (+61L). -->
<!-- BGFAN-1: spawn uses run_in_background=true per canonical rule → docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate -->

> Parent: [drain-signals.md](./drain-signals.md) — invoked per 0a-3 routing row for type=`esc-deep-dive-request`
> Tree-map: `docs/references/tree-map.md` → `docs/agents/dev-team/flow/drain-signals.md` → this file

# Dev Team — ESC-DISPATCH Handler (drain-esc-dispatch.md)

Called from drain-signals.md 0a-3 when a NEW row with `type=esc-deep-dive-request` is drained.

## Input

Signal row payload — row may originate from EITHER drain path (bctc-analyst has no Bash, so the
file path below is now the canonical one; the queue path remains for other producers):
- `source="dashboard"` — read from orch-state.json `.signal_queue.rows[]` (0a-D)
- `source="file"` — drained from `docs/signals/*.json` (0a-1); already archived to `processed/`
  by `scripts/agents-flow/drain-signals.js` by the time this handler runs.
```json
{ "trigger_id", "ticker", "quarter", "report_id", "guard_key", "context", "all_esc_fired" }
```

## Handler Steps

```
# 1. Read payload fields from signal row.
trigger_id   = row.payload.trigger_id
ticker       = row.payload.ticker
quarter      = row.payload.quarter
report_id    = row.payload.report_id
guard_key    = row.payload.guard_key      # e.g. "esc-deepdive:FPT:Q1-2026:ESC-3"
context      = row.payload.context
all_esc_fired = row.payload.all_esc_fired
severity     = row.severity               # top-level field, sibling of row.payload (main.md:112) — read by GATE-A below

# 2. Mutex-wrap: prevent double-spawn if concurrent cron instance also drains this row.
#    SAFE-JSON: payload as structured object — NEVER interpolate into /bin/sh command line.
spawn_key = "task:on-demand:bctc-analyst-opus:" + ticker + ":" + quarter
spawn_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     spawn_key,
  task_kind:   "sprint-task",
  owner_agent: "dev-team",
  ttl_seconds: 7200,
  payload:     { site: "ESC-DISPATCH", ticker: ticker, quarter: quarter }
})
IF NOT spawn_claim.claimed:
  LOG: "[ESC-DISPATCH] SKIP spawn for " + ticker + "/" + quarter + " — spawn_key held by peer"
  # Mark row READ (dashboard rows only — file rows are already archived); do NOT release guard_key
  # (Opus not dispatched yet).
  IF row.source == "dashboard": mark signal row status → READ
  EXIT handler

# 2a. GATE-A — severity floor (FIX-DRAINESC-SEVERITY-RECURRENCE-GATE, 2026-07-04).
#     Vocabulary: SignalSeverityEnum (orchStateSchema.ts:172) = CRITICAL|HIGH|MED|LOW|INFO.
#     Fallback table below is generic per ESC-*check-type*, NEVER per ticker (AC9 no-hardcode).
SEVERITY_RANK       = { CRITICAL:4, HIGH:3, MED:2, LOW:1, INFO:0 }
ESC_DEFAULT_SEVERITY = { "ESC-1":"CRITICAL", "ESC-2":"HIGH", "ESC-3":"HIGH", "ESC-4":"HIGH", "ESC-5":"MED" }
norm = uppercase(severity ?? "")
effective_severity =
  norm in SEVERITY_RANK ? norm
  : max-by-rank(ESC_DEFAULT_SEVERITY[id] for id in all_esc_fired, default "HIGH")
  # Fallback ONLY when row.severity is missing/unrecognized — NEVER overrides an explicit value, so
  # the shipped ESC-4 AC-2 INFO downgrade (esc-4-nonop-heuristic.md) is always honored, never re-escalated.
IF SEVERITY_RANK[effective_severity] < SEVERITY_RANK["HIGH"]:
  LOG: "[ESC-DISPATCH] SKIP " + ticker + "/" + quarter + "/" + trigger_id + " — below HIGH floor (" + effective_severity + ")"
  GOTO TERMINAL-EXIT   # no Opus spawn

# 2b. GATE-B — known-root DEDUP, two-tier (FIX-DRAINESC-SEVERITY-RECURRENCE-GATE, 2026-07-04).
#     Tier 1 (authoritative, self-healing) — board-row-exists. Read-only jq, --arg bound params
#     ONLY — NEVER raw-interpolate ticker/quarter/guard_key into the jq program text (AC8).
board_hit = run:
  jq --arg rid "REFLOW-${ticker}-${quarter}" --arg tk "$ticker" --arg gk "$guard_key" '
    [ .task_board | to_entries[] | select(.value|type=="array") | .value[]?
      | select((.status // "BACKLOG") as $st
               | (["DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED"] | index($st) | not))
        # ^ TERMINAL_SET, orchStateSchema.ts:58-64 — keep byte-identical; flag drift if that SSOT changes.
      | select((.id == $rid)
               or ((.id // "") | startswith("REFLOW-" + $tk + "-"))
               or ((.related // []) | if type=="array" then any(. == $rid) else false end)
                 # ^ live orch-state.json has >=1 row where .related is a bare string, not an
                 # array (data drift, out of this task's zone) — guard so Tier 1 degrades to
                 # "no match" on that row instead of crashing the whole gate (found via AC3 live-run).
               or (((.title // "") + " " + (.status_note // "") + " " + (.root_cause // "")) | contains($gk)))
    ] | length > 0
  ' docs/data/orch/orch-state.json
IF board_hit:
  LOG: "[ESC-DISPATCH] recurrence known-root (board row open) for " + ticker + "/" + quarter + "/" + trigger_id
  GOTO TERMINAL-EXIT   # no Opus spawn — already tracked

# Tier 2 (bootstrap net, only when Tier 1 found nothing) — signals_processed recurrence count.
recurrence_count = run:
  jq -n --arg t "esc-deep-dive-request" --arg tk "$ticker" --arg q "$quarter" --arg tr "$trigger_id" \
       --argjson ctx "$context" '{type:$t,ticker:$tk,quarter:$q,trigger_id:$tr,context:$ctx}' \
    | node scripts/agents-flow/drain-signals.js --recurrence-count
  # stdout "count=<n>"; parse n. ANY degradation (db missing/locked, bad JSON) → n=0 → fail-open,
  # NEVER blocks the gate (safe direction — never suppress a genuine first finding, AC5).
IF recurrence_count >= 2:
  LOG: "[ESC-DISPATCH] recurrence bootstrap-net (count=" + recurrence_count + ") for " + ticker + "/" + quarter + "/" + trigger_id
  Write(path="docs/signals/reflow-needed-hint-{ts_compact}.json", content={
    "from": "dev-team", "to": "po", "type": "reflow-needed-hint",
    "payload": { ticker, quarter, trigger_id, guard_key, recurrence_count }
  })   # closes the loop generically — PO mints REFLOW-<ticker>-<quarter> next cycle, no ticker hardcode
  GOTO TERMINAL-EXIT   # no Opus spawn
# ELSE (count 0 or 1): GATE-B PASS — proceed to Step 3, Opus spawns (never suppress a first occurrence).

# TERMINAL-EXIT — shared cleanup both gates jump to on FAIL (mirrors Step 4/5/6's release+mark
# pattern below; never falls through to Step 3 — Opus is NOT spawned on this path).
TERMINAL-EXIT:
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: spawn_key })   # free now, not the 7200s TTL
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: guard_key })    # best-effort, graceful on failure
  IF row.source == "dashboard": mark signal row status → RESOLVED
  ELSE: no-op — file-sourced row already archived to docs/signals/processed/ by drain-signals.js
  LOG: "[ESC-DISPATCH] gate-terminal: " + ticker + "/" + quarter + "/" + trigger_id
  EXIT handler

# 3. Spawn bctc-analyst with model=claude-opus-4 to run ONLY deep-dive-opus.md.
try:
  Agent("bctc-analyst",
    model: "claude-opus-4",
    run_in_background: true,   # (background) — BGFAN-1; dispatcher awaits task notification before releasing guard_key
    prompt: "Run ONLY docs/agents/bctc-analyst/flow/deep-dive-opus.md. " +
            "Input: { trigger_id: '" + trigger_id + "', report_id: '" + report_id + "', " +
            "ticker: '" + ticker + "', quarter: '" + quarter + "', " +
            "context: <context object>, all_esc_fired: <all_esc_fired list> }. " +
            "On completion emit a deep_dive_result signal (to:po) per §Output Signal in deep-dive-opus.md."
  )
finally:
  # 4. Release spawn mutex regardless of Opus outcome.
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: spawn_key })

# 5. Release bctc-analyst idempotency guard so next cycle can detect DONE if needed.
#    TTL=86400 is a safety net; explicit release is best-effort (graceful on failure).
call_tool(server="vn-market", tool="task_release", arguments={ task_id: guard_key })

# 6. Mark esc-deep-dive-request row RESOLVED (only meaningful for a live orch-state.json row).
IF row.source == "dashboard": mark signal row status → RESOLVED
ELSE: no-op — file-sourced row (source="file") is already archived to docs/signals/processed/
      by the canonical drain script; there is no live row left to mark.
LOG: "[ESC-DISPATCH] complete: " + ticker + "/" + quarter + "/" + trigger_id
```

## Error Contract

If Agent spawn errors: log `[ESC-DISPATCH] spawn_error: {error}` to WORK channel; release spawn_key;
do NOT release guard_key (Opus did not run; next cycle may retry after TTL expires).
Never throw. Always mark row at minimum READ before exiting.
