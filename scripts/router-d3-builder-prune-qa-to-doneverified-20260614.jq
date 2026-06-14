# Router dev-team dispatcher — promote FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY qa-APPROVED -> done_verified (FINAL).
# qa ad9d88d4 returned APPROVED (Task Report commit 5cbb926b). Doc-only fix (no test/rebuild/market — doc-review gate).
# Router RAW-RE-VERIFIED INDEPENDENTLY (not the qa badge, BIDIRECTIONAL — GREEN is verifiable too):
#   COMMIT HYGIENE: git show 5cbb926b --stat = EXACTLY 1 file (docs/agent-memory/sessions/2026-06-14-qa.md +105) — no dirty
#     sweep. The 9-file concurrent dirty tree (bctc-analyst.md, tool-usage-stats.json, coverage-state.json, cowork-schedule.json M
#     + docs/signals + digest-predict session ??) STILL uncommitted/untouched.
#   SOURCE READ (router re-grepped docker.md directly, not the relay): `docker builder prune -f` = 8 occurrences — codified at
#     L39 (FORBIDDEN scoped one-liner), L51 (Docker Commands REBUILD mcp-server), L61 (unconditional declaration), L65/L66 (WHY
#     recurrences 2026-06-07/06-14), L71 (safety), L75 (generic host-wide mandate), L106 (Post-Rebuild Health final step). Heuristic
#     abolished (L68/L109 — no count gate). generic_mandate L74-75 references system-map .host_runtime_set (no hardcoded count).
#     WHY note cites all 3 recurrences (2026-05-27/06-07/06-14) + safety (never touches running containers / named volumes incl
#     market.db / tagged images). qa's 4 independent checks all PASS.
# This write (ONE atomic temp->rename): FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY qa[] -> done_verified[]; status QA->done_verified;
#   next_agent qa->null; records qa_verdict + qa_report + router_final_verdict. head -> idle (task closed). Umbrella
#   ARCH-CRON-SCHEDULER-RELIABILITY stays in_progress (passive Mon-2026-06-15 G1/G2/G3 gate). ARCH-SHIP-WAVE-REAUDIT PARKED in
#   review untouched. ready/in_progress/review otherwise untouched. Concurrent dirty tree untouched.
# GUARD: refuse unless task in qa[] with status QA and next_agent=="qa".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — qa-APPROVED -> router promotes done_verified).
# Usage: jq --arg now "$NOW" -f scripts/router-d3-builder-prune-qa-to-doneverified-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.qa // []) as $q
| ([$q[] | select(type=="object" and .id=="FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY")][0]) as $t
| if $t == null then error("FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY not in qa[] — refuse")
  elif ($t.status != "QA") then error("status != QA (\($t.status)) — refuse")
  elif (($t.next_agent // null) != "qa") then error("next_agent != qa (\($t.next_agent)) — refuse")
  else . end
| .task_board.qa = [$q[] | select((type=="object" and .id=="FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY") | not)]
| .task_board.done_verified = ((.task_board.done_verified // []) + [
    ($t + {
      status: "done_verified",
      next_agent: null,
      qa_approved_at: $now,
      qa_commit: "5cbb926b",
      qa_verdict: "APPROVED (qa ad9d88d4, doc-review gate, Task Report 5cbb926b): 4 independent checks all PASS against raw source reads. (1) `docker builder prune -f` in ALL targeted-rebuild paths unconditional — L39 FORBIDDEN scoped one-liner, L51 Docker Commands REBUILD block, L106 Post-Rebuild Health Verification; heuristic abolished L68/L109 (no count gate). (2) generic_mandate L74-75 host-wide, never per-service, references system-map .project.infrastructure.docker.host_runtime_set (no hardcoded list). (3) WHY note L64-66 cites all 3 recurrences (2026-05-27/06-07/06-14) + L71-72 safety (removes only inactive build cache; never touches running containers, named volumes incl market.db, tagged images). (4) commit hygiene c26e8972 = exactly 2 files (developer.md +14, docker.md +31/-2); no concurrent-agent dirty file swept.",
      qa_report: "docs/agent-memory/sessions/2026-06-14-qa.md (commit 5cbb926b, single file +105)",
      router_final_verified_at: $now,
      router_final_verified_by: "dev-team",
      router_final_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the qa badge, BIDIRECTIONAL). git show 5cbb926b --stat = EXACTLY 1 file (qa Task Report +105) — no dirty sweep; 9-file concurrent dirty tree STILL uncommitted/untouched. Router re-grepped docker.md directly: `docker builder prune -f` = 8 occurrences at L39/L51/L61/L65/L66/L71/L75/L106 (every rebuild path + WHY + safety + generic mandate); no count-heuristic gate remains. generic_mandate L74-75 references system-map .host_runtime_set (no hardcoded count). Closes the host disk-full / Docker-build-cache class DEFINITIVELY (3rd recurrence 2026-06-14) — the >=2-rebuilds/day RULE that lived only in memory since 2026-06-07 is now a codified unconditional flow step, automatic across all host_runtime_set services, not a remembered heuristic. Matches [project-disk-full-lancedb-bloat] DURABLE FIX.",
      done_verified_at: $now
    })
  ])
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: null,
    next_agent: null,
    note: "FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY qa-APPROVED (ad9d88d4, report 5cbb926b, 4/4 checks) + router RAW-final-verified INDEPENDENTLY (git: qa report 1 file / dirty tree untouched; docker.md re-grep = prune at 8 sites L39/L51/L61/L65/L66/L71/L75/L106, generic mandate references system-map host_runtime_set, WHY note 3 recurrences + safety) -> done_verified. Closes the host disk-full / Docker-build-cache recurrence class DEFINITIVELY (3rd time 2026-06-14): the >=2-rebuilds/day rule is now a codified unconditional ops-flow step, not a memory-only heuristic. apps/mcp-server + cross-service zones now FREE. Open: ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15 G1/G2/G3 LIVE gate (no active agent; G1 still open: aggregator stale 06-12). ARCH-SHIP-WAVE-REAUDIT PARKED in review. Weekend-safe PO backlog: CLEAN-CONTEXT-BLOAT-NOTEBOOKS, ROUTE-BCTC-FPT-Q1. head=idle, WIP free. Commit explicit path only."
  }
