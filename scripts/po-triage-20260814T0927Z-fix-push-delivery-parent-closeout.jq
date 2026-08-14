# po-triage-20260814T0927Z-fix-push-delivery-parent-closeout.jq
# PO sign-off 2026-08-14T09:27Z on the epic-wrapper row FIX-PUSH-DELIVERY-ERROR-RATE-ALERT,
# reached via dev-team Review-Lane SECONDARY-Drain (review[] row, status=REVIEW, next_agent=po,
# branch:null direct-commit — the QA-Drain lane never sweeps it because next_agent != "qa").
#
# DISPOSITION: DONE_VERIFIED (review[] -> done_verified[]).
# Rationale: this parent's ONLY deliverable was decomposition, and it is fully discharged.
#   (a) po_ruling_20260730 resolved the scope/priority ambiguity that had caused 5 consecutive
#       BOUNDED-1 declines (zone=multi already MEANT "architect must split"; P2->P1).
#   (b) architect executed the split (architect_split_note) and minted 2 single-zone children.
#   (c) The children carry 100% of the implementation work; NOTHING is left on this parent.
#       Keeping it open would re-enter it into the SECONDARY-Drain candidate pool every tick —
#       the exact wasted-dispatcher-cycle failure mode po_ruling_20260730 called out.
#
# RATIFICATION (supervised:true row -> docs/agents/po/flow/supervised-goahead.md Step 2 requires
# PO to verify the deliverable AT SOURCE, never on a relayed verdict). Done, 4 load-bearing
# claims from architect_split_note re-derived from source this tick:
#   1. mcp-server has NO /metrics route + zero prom-client  -> CONFIRMED (both greps empty).
#   2. GET /api/vps-proxy-health exists                     -> CONFIRMED apps/mcp-server/src/interface/mcp/server.ts:1023.
#   3. foreign-flow silently excluded from health loop      -> CONFIRMED vpsPushLogStore.ts:97
#      (`const services: VpsService[] = ["prices","news","sbv","bctc"]`) while the VpsService
#      type at line 13 DOES include "foreign-flow". The gap is real and exactly as specced.
#   4. alert-engine purely reactive (no Ticker/cron/Scheduler anywhere) -> CONFIRMED (grep empty);
#      router.go:36-37 registers exactly GET /health + POST /evaluate. And the safety-critical
#      one: classifier.go:51 routes high|critical -> ChannelMarket, so the child's mandate to
#      HARDCODE ChannelWork is correct and necessary (alert-policy.md reserves market for
#      alert-commander stock alerts).
# => Split is source-accurate, not narrated. Ratified.
#
# po_goahead_* stamp: REQUIRED even on close. This row is supervised:true, and dev-team's WF-2
# SUPERVISED-HOLD gate scans done[]/done_verified[] too (FIX-DEVTEAM-PIPELINE-RESUME-TERMINAL-
# LANE-BLIND widened it) — a supervised terminal row with no ^po_goahead key would hard-hold the
# pipeline if .head ever pointed at it. Stamping on the ROW (not .head) per supervised-goahead.md
# Step 3 "row is preferred" = durable audit trail that survives .head being reused.
# supervised/plan_only are deliberately LEFT AS-IS (historical record of po_ruling_20260730's
# intentional flag-setting that routed this to architect via SLS); the stamp neutralizes the hold
# without rewriting why the flags were ever set.
#
# .head is NOT touched: it points at FIX-CI-BUNTEST-ALLZERO-OHLCV-FETCH (a different row), so the
# lane-move-must-reset-head rule does not apply here.
#
# Usage: jq -f scripts/po-triage-20260814T0927Z-fix-push-delivery-parent-closeout.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def NOW: "2026-08-14T09:27:43Z";
def TID: "FIX-PUSH-DELIVERY-ERROR-RATE-ALERT";
def STAMP: "20260814T092743";

((.task_board.review // []) | map(select(.id == TID)) | first) as $row
| if $row == null then . else

  # ---------- 1. remove from review[] ----------
    .task_board.review = ((.task_board.review // []) | map(select(.id != TID)))

  # ---------- 2. append to done_verified[] with sign-off + RC-VERIF raw_probe ----------
  | .task_board.done_verified = ((.task_board.done_verified // []) + [
      # next_agent is DELETED, not set to null: TaskSchema (orchStateSchema.ts:175) declares it
      # `z.string().optional()` — nullable is NOT permitted, and a null here is rejected by
      # orch-apply.sh's validator (verified: "expected string, received null", exit 2, live file
      # untouched). Absent = the correct encoding of "no further actor"; leaving the stale "po"
      # value would misrepresent this closed row as still awaiting PO.
      ($row | del(.next_agent))
      + {
          status: "DONE_VERIFIED",
          updated_at: NOW,
          updated_by: "po (epic-wrapper closeout, review-lane secondary-drain)",

          # machine-readable parent->child edge. The children already carry split_from back at
          # this parent, but NOTHING pointed forward: effective_children() (scripts/lib/
          # devteam-eligibility.jq:167 is_epic_wrapper) reads a `children` field that did not
          # exist here, so this row never registered as an epic wrapper to any sweep.
          children: [
            "FIX-PUSH-DELIVERY-METRICS-MCP-SERVER",
            "FIX-PUSH-DELIVERY-ALERT-ENGINE-POLLER"
          ],

          verification: {
            raw_probe: {
              tool: "jq + scripts/lib/devteam-eligibility.jq (is_bounded1_eligible/deps_satisfied/resolved_dispatch_lane) evaluated against live docs/data/orch/orch-state.json + docs/data/orch/archive/backlog-detail.json",
              args: "jq -n --slurpfile board docs/data/orch/orch-state.json --slurpfile detail docs/data/orch/archive/backlog-detail.json 'include \"devteam-eligibility\" {search:\"scripts/lib\"}; ($board[0]) as $B | (detail_items_from($detail)) as $DI | ($B|dep_status_map) as $SM | [ $B.task_board.backlog[] | select(.id|test(\"FIX-PUSH-DELIVERY\")) | {id, BOUNDED1_ELIGIBLE: is_bounded1_eligible($DI;$SM), deps_ok: deps_satisfied($DI;$SM), lane: resolved_dispatch_lane($DI)} ]'",
              live_value_observed: "[{id:FIX-PUSH-DELIVERY-METRICS-MCP-SERVER, BOUNDED1_ELIGIBLE:true, supervised:false, plan_only:false, epic_wrapper:false, deps_ok:true, nondev_na_gate:false, unbacked_prose:false, lane:dev-mcp-server}, {id:FIX-PUSH-DELIVERY-ALERT-ENGINE-POLLER, BOUNDED1_ELIGIBLE:false, supervised:false, plan_only:false, epic_wrapper:false, deps_ok:false, nondev_na_gate:false, unbacked_prose:false, lane:dev-alert-engine}]",
              observed_at: "2026-08-14T09:26:00Z",
              verdict: "SPLIT LANDED AND IS MACHINE-DISPATCHABLE. Child 1 is BOUNDED-1 eligible RIGHT NOW and resolves to lane dev-mcp-server. Child 2 is correctly gated (deps_ok:false) purely by its depends_on the first child, and flips eligible the moment child 1 reaches DONE_VERIFIED — this is the intended sequencing, not a stall. Neither child trips the zero-picker trap architect_split_note reasoned about: supervised/plan_only are null on both, and is_dev_role() matches dev-mcp-server/dev-alert-engine so the NON-DEV-NEXT_AGENT gate does not fire.",
              source_claim_verification: "architect_split_note re-derived at source, not relayed (supervised-goahead.md Step 2): (1) no /metrics route + no prom-client in apps/mcp-server -> both greps empty; (2) GET /api/vps-proxy-health present at apps/mcp-server/src/interface/mcp/server.ts:1023; (3) apps/mcp-server/src/infrastructure/db/vpsPushLogStore.ts:97 hardcodes services=[prices,news,sbv,bctc] EXCLUDING foreign-flow, while the VpsService type at line 13 includes it — gap real; (4) zero Ticker/cron/Scheduler in apps/alert-engine, router.go:36-37 = GET /health + POST /evaluate only, and classifier.go:51 maps high|critical -> ChannelMarket confirming the child's hardcode-ChannelWork mandate is necessary."
            }
          }
        }
      + {
          ("po_goahead_" + STAMP):
            "RATIFIED + CLOSED. Supervised deliverable for this row = the architect split, and it is verified at source (see verification.raw_probe.source_claim_verification — 4/4 load-bearing architect claims re-derived from actual files/line numbers, not accepted on the split note's prose). Stamp is placed on the row even though the row is terminal, because WF-2 SUPERVISED-HOLD scans done_verified[] and this row keeps supervised:true; without a ^po_goahead key it could hard-hold the pipeline if .head ever referenced it.",

          ("po_signoff_" + STAMP):
            "DONE_VERIFIED as an EPIC WRAPPER — decomposition-only scope, fully discharged. The push-delivery DETECTION CAPABILITY itself is NOT yet shipped and is deliberately not claimed here: it lands via the 2 children (FIX-PUSH-DELIVERY-METRICS-MCP-SERVER, then FIX-PUSH-DELIVERY-ALERT-ENGINE-POLLER which depends_on it). Closing this parent removes a row that had nothing actionable left on it from the SECONDARY-Drain candidate pool it was re-entering every tick. Sequencing is machine-enforced by depends_on, verified live this tick (child 2 deps_ok:false until child 1 is DONE_VERIFIED) — no prose-only ordering, so has_unbacked_sequencing_prose does not fire on either child. RESIDUAL RISK (systemic, not this row's): both children sit in backlog[] at P1 and inherit the fleet-wide RLC/BOUNDED-1 throughput limits; the underlying CF-tunnel push-outage detection gap from the 2026-07-04 RCA stays OPEN until child 2 ships. Two outages (2026-07-04, 2026-07-15) with zero detection remain the justification for P1 on both children. ALSO NOTE: the resolver bug flagged in router_dispatch_correction_20260808T0223Z (resolved_dispatch_lane has no zone==multi special-case, so it defaults a multi-zone row to 'developer' instead of 'architect') was only ever row-level patched here and is NOT fixed systemically — it is unrelated to this closeout but still live."
        }
    ])

  # ---------- 3. board metadata ----------
  | .task_board._updated_at = NOW
  | .task_board._updated_by = "po (FIX-PUSH-DELIVERY-ERROR-RATE-ALERT epic-wrapper closeout)"
  | .task_board.last_triaged_at = NOW
  | .task_board.last_triaged_by = "po"
  end
