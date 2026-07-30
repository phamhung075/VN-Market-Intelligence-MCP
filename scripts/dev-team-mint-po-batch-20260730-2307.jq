# dev-team-mint-po-batch-20260730-2307.jq
# Applies po's 6th triage pass today (background agent ad12c0db4daac313f,
# journal docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-po-2.md
# STEP po-S69..S71). po deliberately did not mint FIX-ALERT-COMMANDER-NO-BASH-GRANT-
# NOTEBOOK-UNCOMMITTABLE -- that id already exists in backlog[] (created 2026-07-29,
# stamped this tick by po's own new manual-dispatch-sweep sub-flow). Only the 2
# genuinely new rows are minted here; the pre-existing row is dispatched separately
# via the S4 UNBLOCK pattern (no board mutation needed for that).
#
# RAW-verified by dev-team before applying, not trusted on report alone:
#   - signal_outcomes live DB query: 105 total, 103 resolved, exactly 2 stuck
#     (id 49 stock_code=MACRO, id 74 stock_code=MULTI) -- exact match to po's figures.
#   - signalOutcomeResolutionJob.ts:76-79 WHERE clause has no stock_code exclusion --
#     confirmed by direct read, not a grepped comment.
#   - decision-journal/SKILL.md:62 Cap Check is `[ "$LINES" -gt 600 ]` only, no byte
#     branch anywhere nearby -- confirmed by direct read.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/dev-team-mint-po-batch-20260730-2307.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now
| "dev-team/po-batch-20260730T2307Z" as $src
| ( [ .task_board | (.backlog,.ready,.in_progress,.review,.done,.done_verified,.qa)[]? | .id? ] ) as $existing

# ── (1) MINT FIX-SIGNAL-OUTCOMES-LIVENESS-GUARD-COUNTS-STRUCTURALLY-UNRESOLVABLE-ROWS ──
| "FIX-SIGNAL-OUTCOMES-LIVENESS-GUARD-COUNTS-STRUCTURALLY-UNRESOLVABLE-ROWS" as $id1
| if ($existing | any(. == $id1)) then .
  else
    .task_board.backlog = ([ {
      id: $id1,
      type: "FIX",
      title: "checkStalledResolutionLiveness() counts non-ticker MACRO/MULTI rows that can never resolve -- permanent daily false BUG alert asserting 'price lookup failing' while the resolver is healthy at 103/105",
      status: "BACKLOG",
      priority: "P1",
      size: "S",
      zone: "apps/mcp-server/",
      owner: "po",
      next_agent: "dev-mcp-server",
      supervised: false,
      plan_only: false,
      created_at: $now,
      created_by: $src,
      updated_at: $now,
      source: "po triage 2026-07-30T22:59Z tick (6th pass today)",
      desc: "Report 4222. Measured in the live container by dev-team (docker exec + bun:sqlite readonly on /app/data/market.db), matching po's figures exactly: 105 total, 103 resolved, exactly 2 unresolved rows -- id 49 stock_code=MACRO created 2026-06-06, id 74 stock_code=MULTI created 2026-06-25, both checked_at=null. MACRO/MULTI are not tickers, so no price series exists and checked_at can never advance. signalOutcomeResolutionJob.ts:76-79's WHERE clause (`checked_at IS NULL AND created_at <= datetime('now','-72 hours')`) has no stock_code exclusion, confirmed by direct read (not a grepped comment) -- so stuckCount is permanently >=2 and emits one BUG alert every UTC day forever. NOT a duplicate of FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED (review, next=qa): that fix worked (102 pending -> 2) and its own review_note predicted these exact 2 rows as legitimately unresolvable -- then shipped a guard that alerts on them anyway. Secondary: _lastStalledAlertDate is module-level, so a container restart re-arms the once-per-day alert.",
      files: ["apps/mcp-server/src/scheduler/alerts/signalOutcomeResolutionJob.ts",
              "apps/mcp-server/src/__tests__/FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED.test.ts"],
      deliverable: "AC: guard excludes non-ticker stock_code (MACRO/MULTI or any row with no derivable price series) from the stuck-count query; positive control (a real ticker row stuck >72h) still alerts; test asserts 0 for the 2 live MACRO/MULTI rows.",
      baseline_pass: "9408 pass / 348 fail; guard returns 0 for the 2 live MACRO/MULTI rows; positive control (a real ticker row stuck >72h) still alerts",
      related: ["FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED"]
    } ] + .task_board.backlog)
  end

# ── (2) MINT FIX-DECISION-JOURNAL-SKILL-CAPCHECK-LINE-ONLY-NO-BYTE-ROLLOVER ──────
| "FIX-DECISION-JOURNAL-SKILL-CAPCHECK-LINE-ONLY-NO-BYTE-ROLLOVER" as $id2
| if ($existing | any(. == $id2)) then .
  else
    .task_board.backlog = ([ {
      id: $id2,
      type: "FIX",
      title: "decision-journal SKILL § Cap Check rolls to -2.md on LINES>600 only -- no byte branch, so the 36000B cap has a detector and no writer-side actuator; 10 journals fleet-wide sit in the blind spot, worst 225,553 B / 504 L",
      status: "BACKLOG",
      priority: "P1",
      size: "S",
      zone: "cross-service/",
      owner: "po",
      next_agent: "developer",
      supervised: false,
      plan_only: false,
      created_at: $now,
      created_by: $src,
      updated_at: $now,
      source: "po triage 2026-07-30T22:59Z tick (6th pass today)",
      desc: "Root cause of the recurring context_bloat_breach signal (2 fired 16 min apart this tick). .claude/skills/decision-journal/SKILL.md:62 Cap Check tests only `[ \"$LINES\" -gt 600 ]`, confirmed by direct read (not a grepped comment) -- no byte-based branch exists anywhere in the file. NATURAL EXPERIMENT, not inference (po's own observation, dev-team did not re-derive): in sprint COWORK-GUARANTEED-SLOT-CATCHUP the ONLY journal that rolled to -2.md is po.md -- the ONLY one that crossed the LINE cap (625L). architect 211L/51,945B, dev-mcp-server 312L/79,545B, developer 488L/156,774B all sit under 600 lines, so their rollover never fires while the byte detector fires every cycle. Fleet-wide 10 journals are over 36000B and under 600L. THIRD actuator in a known family, and the only unblocked one: FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES (review) owns notebook-auto-prune.sh; FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR (P1 backlog) owns decision-journal-archive.sh and is blocked behind FIX-SPRINT-REGISTRY-DANGLING-IDS (supervised+plan_only). Derive the byte cap from the same MATCHED_CAP*60 source context-bloat-backstop.sh uses -- do not hardcode 36000 twice. Also handle -2.md itself breaching (no -3 rollover exists today).",
      files: [".claude/skills/decision-journal/SKILL.md"],
      deliverable: "AC: a journal at 300L/80000B rolls to -N.md on next write; a journal at 650L/20000B still rolls (line axis not regressed); one within both caps is untouched.",
      baseline_pass: "a journal at 300L/80000B rolls to -N.md on next write; a journal at 650L/20000B still rolls (line axis not regressed); one within both caps is untouched",
      related: ["FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES", "FIX-DECISION-JOURNAL-BYTECAP-NO-ACTUATOR"]
    } ] + .task_board.backlog)
  end

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = $src
