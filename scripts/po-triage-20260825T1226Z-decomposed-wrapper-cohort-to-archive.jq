# PO 2026-08-25T12:26Z — SECONDARY-drain adjudication.
# Moves the 8 pm-decomposition epic wrappers out of .task_board.done[] (a LIVE
# SECONDARY-drain candidate lane) into .task_board.archive[]. Status stays DONE:
# archive[] is exempt from BOTH checkLaneCoherence (LANE_ALLOWED_STATUSES has no
# `archive` key) and checkVerificationGate (its flatLanes list excludes archive),
# so this asserts NO verification that was not performed.
{
  "FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR":
    "children 4/4 TERMINAL: FIX-CHEF-MARKER-KEY-ANCHOR-1/-2/-3/-4 all resolve to task_board.done_verified[] with status DONE_VERIFIED.",
  "FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR":
    "children 2/2 LIVE: TASK-BRANCHGUARD-POSTCHECKOUT-HOOK (task_board.ready[90], TODO, next_agent=developer) + TASK-BRANCHGUARD-ENFORCE-FLIP (task_board.ready[91], TODO, next_agent=developer). Delivery NOT verified here — it is tracked on those two rows. This wrapper was itself SECONDARY-claimed at 2026-08-25T08:15:01Z and dispatched to a PO session that died on the account-level weekly API quota (see the 12:00Z cowork-tick-telemetry envelope: fleet outage 08:26Z->12:00Z); that owed triage is DISCHARGED by this disposition.",
  "FIX-CHEF-PUBLISHED-MARKER-RELEASE":
    "child 1/1 LIVE: TASK-CHEF-MARKER-RELEASE-GATE (task_board.ready[92], TODO, P1, next_agent=developer, zone docs/agents/cowork-team/). Its depends_on FIX-CHEF-MARKER-KEY-ANCHOR-3 is SATISFIED (task_board.done_verified[41], DONE_VERIFIED) so the child is dispatch-eligible today. Adjacent live row FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE (task_board.ready[96], READY, P0) covers the TTL half of the same marker lifecycle and is NOT a duplicate of the release-gate half.",
  "FIX-USDVND-THRESHOLD-SSOT":
    "children 2/2 resolve: TASK-USDVND-TS-STATIC-RETIRE (task_board.done_verified[44], DONE_VERIFIED) + TASK-USDVND-GO-SIGMA-PORT (task_board.ready[87], TODO, next_agent=dev-macro-indicators).",
  "FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES":
    "children 2/2 resolve: TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION (task_board.review[23], REVIEW, next_agent=agent-father) + TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY, which is NOT missing from the hot board by accident — it was QA-APPROVED 2026-08-25T05:30Z and cold-evicted to docs/data/orch/archive/2026-08.json .done_tasks[] with status DONE_VERIFIED. A hot-board-only child probe reports it MISSING; always fall back to the cold archive before calling a child lost.",
  "UC-ASL-P3":
    "children 2/2 LIVE: TASK-ASLP3-DB-CHECKS-SCRIPT (task_board.ready[88], TODO, next_agent=developer) + TASK-ASLP3-MAINMD-FR11-REPOINT (task_board.ready[89], TODO, next_agent=agent-father).",
  "FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-RECIPE-INTERMITTENT":
    "children 2/2 LIVE: TASK-OFFHOURS-SELFCOMMIT-SCRIPT (task_board.ready[85], TODO, next_agent=developer) + TASK-OFFHOURS-SELFCOMMIT-FLOWDOC-REWIRE (task_board.ready[86], TODO, next_agent=agent-father). Fresh corroboration landed in this same tick's inbox — see the fold note on ready[86].",
  "UC-ASL-P5":
    "child 1/1 LIVE: TASK_2007 (task_board.ready[40], READY, next_agent=developer)."
} as $evidence
| ("[po/triage-20260825T1226Z] SECONDARY-DRAIN CLASS DISPOSITION — moved done[] -> archive[], status unchanged (DONE). "
   + "WHY: pm's 2026-08-23T13:38Z decomposition closeout parked 8 epic wrappers in .task_board.done[] with next_agent unset. "
   + "scripts/devteam-review-claim-secondary-drain.jq builds its candidate set as review[](status==REVIEW) UNION done[](status==DONE) "
   + "filtered on effective_next_agent != \"qa\", and resolved_secondary_dispatch_target maps null/absent -> \"po\" — so every one of these 8 "
   + "is a permanent, non-actionable SECONDARY-drain candidate that burns the lane's single pick per tick. "
   + "MEASURED: all THREE of 2026-08-25's picks were this class — 05:10:44Z (FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR), 08:15:01Z "
   + "(FIX-SUBAGENT-BRANCH-CHECKOUT-HIJACKS-SHARED-WORKING-DIR), 12:16:42Z (FIX-CHEF-PUBLISHED-MARKER-RELEASE); 5 more were queued behind them. "
   + "Meanwhile review[] holds 25 rows and not one has ever carried a secondary_claimed_* stamp. "
   + "WHY archive[] AND NOT done_verified[]: orchStateSchema.ts checkVerificationGate hard-rejects any DONE_VERIFIED row lacking "
   + "verification.raw_probe{tool,args,live_value_observed,observed_at}. These wrappers have NOT been delivery-verified — their children are "
   + "mostly still TODO — so flipping them to DONE_VERIFIED would require fabricating a probe. archive[] is outside both LANE_ALLOWED_STATUSES "
   + "and checkVerificationGate's flatLanes, so DONE survives the move intact and no verification is claimed. "
   + "READ THIS AS: decomposition closed, delivery tracked on children[] — exactly what each row's own pm_closeout_note already says. "
   + "NOT re-pickable: the claim script never reads archive[]. Ids stay resolvable (collectAllTaskIds includes archive) so children/depends_on lookups still work. "
   + "SAFETY CHECKED BEFORE THE MOVE: zero rows anywhere on the board carry any of these 8 ids in depends_on, so no dependent can be falsely unblocked. "
   + "ROOT-CAUSE ROWS (already filed, NOT re-minted): FIX-PM-DECOMPOSE-CLOSEOUT-STEP-UNREACHABLE-PAST-RETURN-AND-MINT-OMITS-NEXTAGENT "
   + "(task_board.review[14], P0, next_agent=po) owns the closeout-omits-next_agent half; FIX-PM-3E-CLOSEOUT-SCRIPT-LANE-AGNOSTIC "
   + "(task_board.ready[93]) owns the lane-agnostic closeout script; FIX-DEVTEAM-SECONDARY-DRAIN-CALLER-READBACK-REVIEW-LANE-ONLY "
   + "(task_board.backlog[486]) owns the caller-side readback blindness. || ROW EVIDENCE: ") as $preamble
| .task_board.done as $done
| ($done | map(select(.pm_decomposition_complete == true))) as $movers
| ($done | map(select((.pm_decomposition_complete // false) != true))) as $stay
| .task_board.done = $stay
| .task_board.archive = (
    (.task_board.archive // [])
    + ($movers | map(
        . + {
          po_secondary_drain_disposition_20260825T1226Z: ($preamble + ($evidence[.id] // "children[] present, individually unresolved at disposition time")),
          archived_at: $now,
          archived_by: "po/triage-20260825T1226Z",
          updated_at: $now,
          updated_by: "po"
        }
      ))
  )
# --- Stage-1g repair: the ONLY board reference to any of the 8 movers ---
# task_board.review[9] FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE carries a
# STALE blocked_by pointing at the decomposed wrapper FIX-USDVND-THRESHOLD-SSOT.
# pm already re-pointed that row's depends_on to the two CHILDREN on
# 2026-08-23T13:38:01Z and left blocked_by behind. Dropping the wrapper id keeps
# orch-validate Stage 1g at 10 unresolvable-dependency rows instead of 11, and the
# row stays legitimately BLOCKED on FIX-CHEF-L6-GOLD-FALSE-PREDICATE
# (task_board.backlog[182], BACKLOG) plus its own two depends_on children.
| .task_board.review = (
    .task_board.review | map(
      if .id == "FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE"
      then . + {
        blocked_by: ((.blocked_by // []) | map(select(. != "FIX-USDVND-THRESHOLD-SSOT"))),
        po_blockedby_repoint_20260825T1226Z: "[po/triage-20260825T1226Z] Dropped STALE blocked_by \"FIX-USDVND-THRESHOLD-SSOT\": that parent was closed-as-decomposed by pm 2026-08-23T13:38Z and archived to task_board.archive[] by this same write, so it can no longer resolve for orch-validate Stage 1g (its resolver reads the 7 flat lanes + cold archive, NOT hot archive[]). pm had already re-pointed this row's own depends_on to the two children (TASK-USDVND-GO-SIGMA-PORT task_board.ready[87] TODO, TASK-USDVND-TS-STATIC-RETIRE task_board.done_verified[44] DONE_VERIFIED) in that same closeout and simply left blocked_by behind. Row stays BLOCKED — the surviving blocker FIX-CHEF-L6-GOLD-FALSE-PREDICATE (task_board.backlog[182], BACKLOG) resolves, and TASK-USDVND-GO-SIGMA-PORT is still TODO.",
        updated_at: $now,
        updated_by: "po"
      }
      else . end
    )
  )
# --- Stage-1e repair: the wrapper's own reverse edge ---
# FIX-USDVND-THRESHOLD-SSOT carries blocks:["FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE"].
# Stage 1e requires that pairing to be two-sided; since the forward half (blocked_by)
# is dropped above as stale, the reverse half must go with it or the edge dangles.
# The real blocking relationship now lives on the CHILDREN, already named in that
# row's own depends_on. Removing `blocks` here changes nothing dispatchable —
# effective_depends_on in scripts/lib/devteam-eligibility.jq never traverses "blocks".
| .task_board.archive = (
    .task_board.archive | map(
      if .id == "FIX-USDVND-THRESHOLD-SSOT"
      then (del(.blocks) + {
        po_blocks_edge_removed_20260825T1226Z: "[po/triage-20260825T1226Z] Removed blocks:[\"FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE\"] together with that row's matching stale blocked_by entry — one two-sided edge, retired in one write so Stage 1e stays paired and Stage 1g stays at 10 unresolvable rows. Blocking now runs parent->children->target: TASK-USDVND-GO-SIGMA-PORT (task_board.ready[87], TODO) and TASK-USDVND-TS-STATIC-RETIRE (task_board.done_verified[44]) are already in FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE's own depends_on, written there by pm in the same 2026-08-23T13:38Z closeout."
      })
      else . end
    )
  )
