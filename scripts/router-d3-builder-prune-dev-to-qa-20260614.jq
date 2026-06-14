# Router dev-team dispatcher — advance FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY dev-impl-GREEN -> qa (doc-review gate).
# developer ad2054d9 returned DONE (commit c26e8972, doc-only). Router RAW-RE-VERIFIED INDEPENDENTLY (not the dev badge):
#   COMMIT HYGIENE: git show c26e8972 --stat = EXACTLY 2 files (docs/agents/ops/flow/docker.md +31, developer.md notebook +14).
#     Concurrent dirty tree (bctc-analyst.md, tool-usage-stats.json, coverage-state.json, cowork-schedule.json M + 4 docs/signals
#     + digest-predict session ??) NOT captured.
#   SOURCE READ (router grepped docker.md directly, not the relay): `docker builder prune -f` now codified at ALL rebuild paths —
#     L39 (FORBIDDEN § scoped-pattern one-liner), L51 (Docker Commands § REBUILD mcp-server), L106 (Post-Rebuild Health
#     Verification § mandatory final step), plus L61 unconditional declaration. generic_mandate PRESENT (L74-75: "do NOT scope to
#     mcp-server only … Never add a service condition; always run bare docker builder prune -f") referencing system-map.json
#     .host_runtime_set (no hardcoded count). WHY note cites all 3 recurrences (2026-05-27/06-07/06-14) + safety (never touches
#     running containers / named volumes incl market.db / tagged images). NO service-specific scoping of the prune.
# This write (ONE atomic temp->rename): FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY in_progress[] -> qa[]; status IN_PROGRESS->QA;
#   next_agent developer->qa; records dev_impl_verdict + router_dev_reverify_verdict + qa_instructions. head -> qa/next=qa.
#   ARCH-CRON-SCHEDULER-RELIABILITY (passive Mon-gate) stays in_progress. ARCH-SHIP-WAVE-REAUDIT PARKED. Dirty tree untouched.
# GUARD: refuse unless task in in_progress[] with status IN_PROGRESS and next_agent=="developer".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — dev-green -> qa gate).
# Usage: jq --arg now "$NOW" -f scripts/router-d3-builder-prune-dev-to-qa-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY")][0]) as $t
| if $t == null then error("FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY not in in_progress[] — refuse")
  elif ($t.status != "IN_PROGRESS") then error("status != IN_PROGRESS (\($t.status)) — refuse")
  elif (($t.next_agent // null) != "developer") then error("next_agent != developer (\($t.next_agent)) — refuse")
  else . end
| .task_board.in_progress = [$ip[] | select((type=="object" and .id=="FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY") | not)]
| .task_board.qa = ((.task_board.qa // []) + [
    ($t + {
      status: "QA",
      next_agent: "qa",
      dev_impl_done_at: $now,
      dev_impl_commit: "c26e8972",
      dev_impl_verdict: "DONE (developer ad2054d9, commit c26e8972, doc-only): codified `docker builder prune -f` as mandatory unconditional final step in docs/agents/ops/flow/docker.md at all rebuild paths (FORBIDDEN scoped one-liner, REBUILD mcp-server cmd, Post-Rebuild Health final step) + WHY section (3 recurrences, safety props, generic host-wide mandate referencing system-map host_runtime_set). Dropped the fragile >=2/day heuristic. No rebuild (doc read live by ops at rebuild time).",
      router_dev_reverified_at: $now,
      router_dev_reverify_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the dev badge). git show c26e8972 --stat = exactly 2 files (docker.md +31, developer notebook +14); dirty tree NOT swept. Router grepped docker.md directly: prune at L39/L51/L106 + unconditional decl L61; generic_mandate L74-75 (no mcp-server scoping, references system-map .host_runtime_set, no hardcoded count); WHY note cites 3 recurrences + safety (never touches containers/volumes/market.db/tagged images). Matches spec exactly.",
      qa_instructions: "DOC-REVIEW GATE (doc-only fix — NO test pipeline, NO rebuild, NO market verification). Gate-keeper, write Task Report, do not accept a badge. Re-confirm INDEPENDENTLY by reading docs/agents/ops/flow/docker.md RAW: (1) `docker builder prune -f` appears as a final step in EVERY targeted-rebuild path in the file (the FORBIDDEN-section scoped one-liner, the Docker-Commands REBUILD block, and the Post-Rebuild Health Verification procedure) — grep all occurrences and confirm none is conditional on a rebuild-count heuristic; (2) the generic_mandate is explicit (prune is host-wide, MUST NOT be scoped to mcp-server only, no per-service condition) and references the system-map host_runtime_set SSOT rather than hardcoding the service count; (3) the WHY note documents the 3 recurrences AND the safety property (prune removes only inactive build cache; never touches running containers, named volumes incl market.db, or tagged images) so a future reader does not fear running it; (4) commit c26e8972 captured ONLY docker.md + the developer notebook — confirm no concurrent-agent dirty file (bctc-analyst.md / tool-usage-stats.json / coverage-state.json / cowork-schedule.json / docs/signals / digest-predict session) was swept. On qa-APPROVED -> router RAW-confirms -> promote done_verified. Commit Task Report by EXPLICIT PATH only (docs/agent-memory/sessions/2026-06-14-qa.md); never git add -A.",
      ops_verified: null
    })
  ])
| .head = {
    status: "qa",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY",
    next_agent: "qa",
    note: "FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY dev-impl DONE (developer ad2054d9, commit c26e8972, doc-only) + router RAW-re-verified INDEPENDENTLY (2 files, dirty tree not swept; prune codified at all rebuild paths L39/L51/L106; generic_mandate no mcp-server scoping references system-map host_runtime_set; WHY note 3 recurrences + safety). -> qa DOC-REVIEW gate (no test/rebuild/market — read docker.md raw: prune in every rebuild path unconditional, generic host-wide mandate, safety note, commit hygiene). qa-APPROVED -> done_verified. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15 G1/G2/G3 (G1 open: aggregator stale 06-12). ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 active. Commit explicit path only."
  }
