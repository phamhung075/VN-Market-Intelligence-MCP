<!-- size-justification: 60L — ESC-DISPATCH handler extracted from drain-signals.md (brief §3.2/§6) to
     keep drain-signals.md under 120L cap. All 6 handler steps are load-bearing and cannot be split
     further without losing trigger→action traceability. -->

> Parent: [drain-signals.md](./drain-signals.md) — invoked per 0a-3 routing row for type=`esc-deep-dive-request`
> Tree-map: `docs/references/tree-map.md` → `docs/agents/dev-team/flow/drain-signals.md` → this file

# Dev Team — ESC-DISPATCH Handler (drain-esc-dispatch.md)

Called from drain-signals.md 0a-3 when a NEW row with `type=esc-deep-dive-request` is drained.

## Input

Signal row payload (read from `.signal_queue.rows[]`):
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
  # Mark row READ; do NOT release guard_key (Opus not dispatched yet).
  mark signal row status → READ
  EXIT handler

# 3. Spawn bctc-analyst with model=claude-opus-4 to run ONLY deep-dive-opus.md.
try:
  Agent("bctc-analyst",
    model: "claude-opus-4",
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

# 6. Mark esc-deep-dive-request row RESOLVED.
mark signal row status → RESOLVED
LOG: "[ESC-DISPATCH] complete: " + ticker + "/" + quarter + "/" + trigger_id
```

## Error Contract

If Agent spawn errors: log `[ESC-DISPATCH] spawn_error: {error}` to WORK channel; release spawn_key;
do NOT release guard_key (Opus did not run; next cycle may retry after TTL expires).
Never throw. Always mark row at minimum READ before exiting.
