# Router closeout: ESC4-HEURISTIC-FIX-TAXBASIS-SOE in_progress[] -> done_verified[].
# agent-father (a42e8913, router-dispatched, dev-team tick 23:37Z) completed 2026-07-04T00:14Z + router RAW-verified.
#
# RAW-verify evidence (commit 5f0979bd9, 6 files, 127+/7-, router-verified):
#   - UUID-clean: git show 5f0979bd9 | grep '^+' | grep -c '<session-uuid>' == 0.
#   - AC-1 MET: docs/agents/bctc-analyst/flow/esc-4-nonop-heuristic.md L31 formula
#     non_operating_share = (PretaxProfit - OperatingProfit) / PretaxProfit -- both pre-tax, explicit "never NPAT".
#     Root cause documented (GVR false 23.5% [mixed after-tax denom] -> true 35.0% of PBT).
#   - AC-2 MET: SOE-conglomerate class {GVR,PHR,DPR,TRC,HRC} HIGH->INFO downgrade on non-op arm only
#     (related_party_pct unaffected); still escalates at INFO (no silent suppress).
#   - End-to-end: main.md gate (severity = context.severity OR "HIGH", no hardcode) + stage-pass-pl.md T2
#     + deep-dive-opus.md Opus handler all reference/honor the fix.
#   - Line caps: 81/128/62/132 (all < 200-line cap).
#   - INV-GATEWAY-1: agent-father had no gateway binding -> committed directly (explicit paths, no commit-mutex,
#     no push; 8 commits ahead of origin, fleet-push owns push). Verified no foreign paths staged.
# AC ("AC-1 formula documented + AC-2 class documented in bctc-analyst heuristic doc") INDEPENDENTLY MET.
#
# Also emits ONE signal_queue row (to=po) for the out-of-scope follow-up agent-father flagged (dev-team zone):
#   drain-esc-dispatch.md dispatches the Opus deep-dive REGARDLESS of severity -> post-fix, INFO-severity ESC-4
#   fires still trigger an expensive Opus spawn (now correctly labeled non-HIGH). PO to DEDUP-first then triage.
#
# Guard: error if ESC4 not in in_progress[]; error if already in done_verified[]. Type-guard elements.
# Usage: NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg now "$NOW" -f scripts/router-close-esc4-taxbasis-soe-verified-20260704T0016.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(type=="object" and .id=="ESC4-HEURISTIC-FIX-TAXBASIS-SOE"))[0]) as $t
| if $t == null then error("ESC4-HEURISTIC-FIX-TAXBASIS-SOE not in in_progress[] -- refuse to close out")
  elif ((.task_board.done_verified | map(select(type=="object" and .id=="ESC4-HEURISTIC-FIX-TAXBASIS-SOE")) | length) > 0) then error("already in done_verified[] -- refuse dup")
  else . end
| .task_board.done_verified += [
    ($t + {
      status: "DONE_VERIFIED",
      done_verified: true,
      verified_by: "router",
      verified_at: $now,
      verifying_agent: "agent-father",
      commit_sha: "5f0979bd9",
      deliverables: [
        "docs/agents/bctc-analyst/flow/esc-4-nonop-heuristic.md@5f0979bd9",
        "docs/agents/bctc-analyst/flow/main.md@5f0979bd9",
        "docs/agents/bctc-analyst/flow/stage-pass-pl.md@5f0979bd9",
        "docs/agents/bctc-analyst/flow/deep-dive-opus.md@5f0979bd9"
      ],
      verify_note: "[router 2026-07-04T00:16Z] agent-father (a42e8913) done + router RAW-verified. AC-1 MET: non_operating_share=(PretaxProfit-OperatingProfit)/PretaxProfit (both pre-tax, never NPAT; retires mixed-basis calc that false-HIGH'd GVR 23.5% vs true 35.0% PBT). AC-2 MET: SOE-conglomerate class {GVR,PHR,DPR,TRC,HRC} HIGH->INFO on non-op arm only (related_party_pct unaffected), still escalates at INFO. End-to-end at 3 call sites (main.md gate severity=context.severity OR HIGH no-hardcode + stage-pass-pl T2 + deep-dive-opus handler). Line caps 81/128/62/132<200. Commit 5f0979bd9 UUID-clean (0 on added lines). INV-GATEWAY-1: agent-father gateway-less -> direct explicit-path commit, no mutex, NO push (8 ahead, fleet-push owns). Follow-up (dev-team zone) emitted to signal_queue: drain-esc-dispatch.md un-gated Opus spawn on INFO severity."
    })
  ]
| .task_board.in_progress |= map(select(type != "object" or .id != "ESC4-HEURISTIC-FIX-TAXBASIS-SOE"))
| .signal_queue.rows += [
    {
      id: "router-esc4-fu-drainesc-severity-gate-20260704T0016Z",
      ts: $now,
      from: "router",
      to: "po",
      type: "repair_task_request",
      summary: "drain-esc-dispatch.md spawns Opus deep-dive regardless of ESC severity; post-ESC4-fix INFO-severity ESC-4 fires still trigger expensive Opus spawn. Gate Opus spawn on severity floor (>=HIGH). Flagged by agent-father (out of bctc-analyst zone). DEDUP-first before minting backlog.",
      severity: "MEDIUM",
      status: "NEW",
      payload_ref: null,
      source_task: "ESC4-HEURISTIC-FIX-TAXBASIS-SOE"
    }
  ]
| .head += {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    next_action: "dev-team tick 23:37Z CLOSED: ESC4-HEURISTIC-FIX-TAXBASIS-SOE done_verified (agent-father 5f0979bd9; AC-1 pretax formula + AC-2 SOE-conglomerate HIGH->INFO both RAW-verified; UUID-clean). WIP=0. review[]=3 parked: ARCH-SHIP-WAVE-REAUDIT (deferred) + 2 W5 rows (BLOCKED, deploy_gate -- need explicit USER authorization to deploy live mcp-server + reingest CTG 96e36139; auto-mode classifier denied ops spawn). Follow-up drain-esc-dispatch severity-gate emitted to signal_queue for PO. Cowork tick 00:00Z fanned out 4 off-hours agents (bg).",
    updated_at: $now,
    updated_by: "router",
    note: "00:16Z: ESC4 in_progress->done_verified (agent-father RAW-verified, AC met). WIP=0 idle. W5 deploy still user-gated."
  }
