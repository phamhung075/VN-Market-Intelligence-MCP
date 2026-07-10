# Board flip: D2.5-BACKLOG-HYGIENE-SCHEMA-BLOCKED-LANE READY -> DONE_VERIFIED
#
# Router independently RAW-verified dev-mcp-server's D2.5 delivery:
# - Read full commit diff (b7d669061) — matches self-report exactly (3-line
#   functional LANE_ALLOWED_STATUSES change + doc-comment update, notebook
#   append; qa/done/done_verified/ready untouched).
# - git status confirms orch-state.json untouched by the sub-agent (deferred
#   to router, as instructed).
# - Independently re-ran `bun scripts/orch-validate.mjs` fresh: 9 coherence
#   warnings, exact same 9 IDs as the D1-residual note (FIX-SCHEMA-DRIFT-P5-
#   SELFHEAL, FIX-BCTC-BANK-SUMMARY-MAPPING, FIX-OHLCV-WRITER-INTEGRITY-
#   CONSTRAINT-SCALE-P0, FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE, FIX-MACRO-
#   THRESHOLD-FXFLOOR-OVERCLAMP, FIX-FOREIGN-FLOW-BULLETIN-UNAVAIL-STRING,
#   FIX-L2-FRESHNESS-DATAASOF-FIELDS, FIX-FB-WEEKEND-DEDUP-GATE, OPS-BCTC-
#   REFINE-REPASS-NONBANK-5T) — matches po's arithmetic (16-7=9) exactly.
# - Independently re-ran `bun test src/infrastructure/__tests__/
#   orchStateSchema.test.ts`: 103 pass / 0 fail / 622 expect() calls,
#   matching self-report exactly.
# - Confirmed notebook docs/agent-memory/notebooks/dev-mcp-server.md: clean
#   prepend (63L total), prior FIX-BCTC-D3C-RECONCILE-JOB entry fully intact
#   below the new entry, zero truncation.
#
# GUARD: refuse unless the row is in ready[] with status READY.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/router-fix-d25-ready-to-done-verified.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| (.task_board.ready // []) as $rd
| ([$rd[] | select(type=="object" and .id=="D2.5-BACKLOG-HYGIENE-SCHEMA-BLOCKED-LANE")][0]) as $t
| if $t == null then error("D2.5-BACKLOG-HYGIENE-SCHEMA-BLOCKED-LANE not in ready[] — refuse")
  elif ($t.status != "READY") then error("D2.5-BACKLOG-HYGIENE-SCHEMA-BLOCKED-LANE status != READY (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    done_verified: true,
    updated_at: $now,
    updated_by: "router",
    commit: "b7d669061",
    router_verdict: "APPROVED",
    router_verified_at: $now,
    router_verified_by: "router",
    router_note: "APPROVED. Independent RAW-verify: read full commit diff (b7d669061), matches self-report exactly. Re-ran bun scripts/orch-validate.mjs fresh: 9 warnings, same 9 IDs as D1-residual note (16-7=9, matches po arithmetic). Re-ran orchStateSchema.test.ts fresh: 103/0/622, unchanged. Notebook prepend clean (63L, prior entry intact). git status confirms orch-state.json untouched by sub-agent as instructed."
  }) as $done
| .task_board.ready = [$rd[] | select(.id != "D2.5-BACKLOG-HYGIENE-SCHEMA-BLOCKED-LANE")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "router"
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "router",
    active_task_id: null,
    next_agent: null
  }
