# po-s139: escalate recurring mcp-server memory SAWTOOTH-at-tight-cap — PROMOTE existing FIX + upgrade signal disposition.
#
# Single-pass DUAL-mutation (idempotent, NO new tasks — reuses the already-tracked row):
#   M1 PROMOTE FIX-MCP-MEMORY-CODE-LEAK backlog[] -> ready[] with promotion stamps + next_agent=architect
#      + a PHASE-0 stale-image-first recon directive (per feedback_mcp_server_stale_image_mem_leak_rebuild_fixes:
#      rule out a stale running image / ops rebuild-to-HEAD BEFORE any runtime code-leak hunt).
#      Idempotent: skipped entirely if the id is already in ANY non-backlog lane, or absent from backlog.
#   M2 ANNOTATE-IN-PLACE signal_queue row sau-1783012565 (the A-30 WARN the router deduped to) with a
#      `po_upgrade` marker: disposition corrected to SAWTOOTH-at-tight-cap (60->99.67%@17:16Z, GC reclaimed
#      ~800MiB to 59%@17:20Z per prior-tick RAW, back to 99.62%@17:46Z) — NOT the router's two-point "pinned/
#      no-GC" read (which missed the 17:20Z reclaim). Marker-guarded (has("po_upgrade")|not) -> re-run mutates 0.
#
# Head DELIBERATELY UNTOUCHED (router dispatches from the PO RETURN BATCH, not .head — same as po-s134/s135).
# Conservation: backlog -1, ready +1; in_progress/review/done/done_verified byte-stable; signal row count unchanged.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s139-mcp-mem-cap-churn-promote.jq docs/data/orch/orch-state.json \
#   | bash scripts/orch-apply.sh   (orch-apply does Zod+dup-key+CAS+atomic rename; PUSH HELD — fleet-push timer pushes)

($now) as $now
| ([.task_board.ready, .task_board.in_progress, .task_board.review, .task_board.done, .task_board.done_verified]
    | map((. // []) | .[]? | select(type=="object") | .id)) as $nonbacklog_ids
| (.task_board.backlog | map(select(type=="object" and .id=="FIX-MCP-MEMORY-CODE-LEAK")) | length) as $in_backlog
| if ($nonbacklog_ids | index("FIX-MCP-MEMORY-CODE-LEAK")) then .          # already promoted -> no-op
  elif $in_backlog == 0 then .                                            # absent from backlog -> no-op (guard)
  else
    (.task_board.backlog | map(select(type=="object" and .id=="FIX-MCP-MEMORY-CODE-LEAK"))[0]) as $row
    | .task_board.backlog |= map(select((type=="object" and .id=="FIX-MCP-MEMORY-CODE-LEAK") | not))
    | .task_board.ready += [ $row + {
        status: "READY",
        priority: "high",
        next_agent: "architect",
        promoted_by: "po",
        promoted_at: $now,
        promotion_reason: "RECURRING reliability escalation (A-30: 06-19, 06-20 CRITICAL 99.99%, 07-02). mcp-server memory SAWTOOTHS at the 2GB cap — NOT a monotonic pinned leak: 60.70%->99.67% in ~1h (17:16Z), GC reclaimed ~800MiB to 59% @17:20Z (RAW-probed prior PO tick), then back to 99.62% @17:46Z. Operating at the ragged edge of a TIGHT 2GB cap with ~800MiB working-set churn -> any allocation spike faster than GC = OOM-kill. Plausible ROOT of OPS-MCP-RESTART-CHURN-UNCLEAN-SHUTDOWN (49% unclean restarts, suspected Docker OOM-kill -> in-flight-state corruption: Bun-JIT/lock-orphan/mid-aggregator classes). Reliability = PO #1; free coding slot (WIP 1/2 parked-enricher, head idle).",
        phase0_directive: "ROOT-CAUSE FIRST (architect) — CHEAPEST candidates before any code hunt: (a) verify running mcp-server image == HEAD; many recent mcp-server commits => image likely STALE; per feedback_mcp_server_stale_image_mem_leak_rebuild_fixes a stale image is a KNOWN mem cause, ops rebuild-to-HEAD (user-gated swap) is cheapest. (b) assess whether the 2GB cap is simply too tight for the working set (cap bump vs Docker 8GB host budget — project_host_memory_panic). (c) ONLY if a fresh-from-HEAD image at an adequate cap still slams cap -> heap-profile the allocation hotspot / correlate with specific tool calls. Diagnosis = sawtooth + tight-cap + OOM-churn, NOT a slow monotonic leak."
      } ]
    | .signal_queue.rows |= map(
        if (.id == "sau-1783012565" and (has("po_upgrade") | not)) then
          . + { po_upgrade: {
                  at: $now,
                  disposition: "sawtooth at tight 2GB cap (NOT pinned/no-GC): 60->99.67%@17:16Z, GC reclaimed ~800MiB to 59%@17:20Z (prior-tick RAW), back to 99.62%@17:46Z; ragged-edge OOM-kill risk -> restart churn",
                  escalated_to: "FIX-MCP-MEMORY-CODE-LEAK (promoted backlog->ready, next_agent=architect)"
                } }
        else . end)
  end
