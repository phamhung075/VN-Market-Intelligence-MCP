# Router dev-team dispatcher — FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY ready -> in_progress (developer IMPL).
# PO (po-s53, commits b7889c3a board + 0c41024a pointer) triaged + promoted to ready[]. Router RAW-RE-VERIFIED INDEPENDENTLY:
#   PO commit b7889c3a --stat = 2 files (orch-state +24, po-s53 script +55); 0c41024a = 1 file (po flow pointer) — explicit-path,
#   NO dirty sweep (8-file concurrent dirty tree still uncommitted). ready[] = FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY READY
#   owner=developer next=null; head=idle; docker.md still CLEAN (impl pending). apps/mcp-server zone free; this is a cross-service
#   flow-doc edit (owner=developer), market-INDEPENDENT (weekend-safe), does NOT touch the apps/mcp-server active slot.
# WIP: passive ARCH-CRON-SCHEDULER-RELIABILITY (Mon-gate, no active agent) does NOT consume the active slot -> one new active OK.
# This write (ONE atomic temp->rename): FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY ready[] -> in_progress[]; status READY->IN_PROGRESS;
#   next_agent -> developer; impl_dispatched_at + impl_dispatch_note. head -> in_progress/active=FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY.
#   ARCH-CRON-SCHEDULER-RELIABILITY (passive) + ARCH-SHIP-WAVE-REAUDIT (PARKED review) untouched. Concurrent dirty tree untouched.
# GUARD: refuse unless task in ready[] with status READY and owner=="developer".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — ready -> zone owner implements).
# Usage: jq --arg now "$NOW" -f scripts/router-d3-builder-prune-ready-to-dev-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.ready // []) as $rd
| ([$rd[] | select(type=="object" and .id=="FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY")][0]) as $t
| if $t == null then error("FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY not in ready[] — refuse")
  elif ($t.status != "READY") then error("status != READY (\($t.status)) — refuse")
  elif (($t.owner // null) != "developer") then error("owner != developer (\($t.owner)) — refuse")
  else . end
| .task_board.ready = [$rd[] | select((type=="object" and .id=="FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY") | not)]
| .task_board.in_progress = ((.task_board.in_progress // []) + [
    ($t + {
      status: "IN_PROGRESS",
      next_agent: "developer",
      impl_dispatched_at: $now,
      impl_dispatched_by: "dev-team",
      impl_dispatch_note: "PO-triaged weekend-safe infra fix (market-independent doc-only). IMPLEMENT per po-s53 spec: edit the rebuild-sequence SSOT docs/agents/ops/flow/docker.md — append `docker builder prune -f` as the MANDATORY FINAL step in BOTH (a) the § Docker Commands REBUILD block and (b) the § Post-Rebuild Health Verification procedure (after `up -d --no-deps`, after health passes, BEFORE qa handoff); make it UNCONDITIONAL (drop the fragile >=2-rebuilds/day heuristic — it never held); update the § FORBIDDEN 'Rebuild after code change' one-liner to end with `&& docker builder prune -f`; add a self-justifying WHY note citing the 3 recurrences (2026-05-27, 2026-06-07, 2026-06-14) + that builder cache is host-wide so ONE step covers all 6 host_runtime_set services (generic_mandate — do NOT scope to mcp-server). VERIFY post-edit: re-read docker.md raw to confirm the prune step appears in all THREE locations + WHY note + no service-specific scoping. Doc-only -> NO rebuild, NO market verification. Commit ONLY docs/agents/ops/flow/docker.md (+ your dev notebook if used) by EXPLICIT PATH — the 8-file concurrent dirty tree (bctc-analyst.md, coverage-state.json, cowork-schedule.json M + 4 docs/signals + digest-predict session ??) must NOT be captured; never git add -A. RETURN: the raw before/after of each of the 3 edited locations."
    })
  ])
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY",
    next_agent: "developer",
    note: "PO promoted FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY (po-s53) + router RAW-re-verified (PO commits explicit-path, dirty tree not swept). Dispatch ready->in_progress (developer): codify `docker builder prune -f` as mandatory final step in docs/agents/ops/flow/docker.md (3 locations, unconditional, generic across all 6 host_runtime_set services) — closes the 3x disk-full recurrence definitively. Doc-only, weekend-safe, no rebuild. -> qa doc-review gate -> done_verified. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15 G1/G2/G3 (G1 still open: aggregator stale 06-12). ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 active. Commit explicit path only."
  }
