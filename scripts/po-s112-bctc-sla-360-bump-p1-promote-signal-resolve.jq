# po-s112-bctc-sla-360-bump-p1-promote-signal-resolve.jq
#
# Single-pass dual-mutation single-signal triage (atomic, idempotent):
#
#   M1 PROMOTE+ESCALATE FIX-BCTC-SLA-THRESHOLD-360 backlog[] -> ready[]:
#      - priority P3 -> P1 (recurrence cost: false-CRITICAL re-fired 06-17/06-19/06-24/06-25,
#        each occurrence burns an auditor scan + a BUG telegram + router triage; the "out-of-
#        season low-harm" rationale that kept it P3 is now outweighed by per-cycle resource burn).
#      - status BACKLOG -> READY, full promotion stamps + next_agent (dev-mcp-server).
#      - SCOPE CORRECTION (router framing "120 vs 360" is OUTDATED): RAW-verify (po-s112) found
#        the system-map.json bctc-discover SLA resolver is ALREADY shipped + correct
#        (mode=earnings-window-dependent, out-of-window=168h). The residual false-CRITICAL has
#        THREE real sub-roots, ALL must be in fix scope:
#          (a) get_sla_status mcp tool still carries the legacy 120min/360min bctc config
#              (apps/mcp-server/.../domain/services/freshnessSlaChecker.ts DEFAULT_SLA_CONFIG)
#              DISTINCT from the auditor's system-map resolver -> the two SLA paths diverge.
#          (b) 168h out-of-window threshold is still too tight for the genuine ~10-week
#              INTER-QUARTER quiet gap (e.g. Apr-14-window-end -> Jul-1-next-window): B-05
#              fired at 199.7h, B-06 at 178h, both > 168h yet pipeline healthy (queue=0,
#              host-up). Off-SEASON (between earnings windows) staleness is BY DESIGN.
#          (c) push-age -> 'host-down'/'vn-bctc-fetch unhealthy' inference is WRONG
#              (feedback_bctc_lastpush_age_misread_as_crash): event-driven push-age is NOT a
#              crash signal; queue=0 + host-up = healthy idle. The B-05/B-06 "VPS unhealthy"
#              conclusion must gate on service-state + queue, not push-age alone.
#      - DoD: BCTC SLA + auditor B-05/B-06 do NOT report CRITICAL/HIGH/unhealthy during a
#        normal off-season inter-quarter quiet period when queue=0 and the host is up.
#
#   M2 RESOLVE the originating signal row router-bctc-sla-esc-20260625-0148:
#      - set dedup_key "bctc-sla-threshold-recur" (was null) so future re-fires of the SAME
#        recommendation dedup against it instead of re-surfacing as NEW.
#      - status NEW -> RESOLVED + a resolution note carrying the decision (bumped P1, promoted
#        ready, scope corrected to 3 sub-roots).
#
# Idempotent: M1 skipped if id already in ANY non-backlog lane; M2 guarded by status==NEW.
# Harness expectations (conservation): backlog -1, ready +1, in_progress/review/done/
# done_verified byte-stable, total unchanged; signal NEW count -1, RESOLVED +1.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s112-bctc-sla-360-bump-p1-promote-signal-resolve.jq \
#      docs/data/orch/orch-state.json > /tmp/orch.tmp \
#     && [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp \
#     && mv /tmp/orch.tmp docs/data/orch/orch-state.json
#   (commit orch-state by EXPLICIT PATH; PUSH HELD — PO out-of-band)

def TASK_ID: "FIX-BCTC-SLA-THRESHOLD-360";
def SIG_ID:  "router-bctc-sla-esc-20260625-0148";

# --- idempotency gate: is the task already promoted (in a non-backlog lane)? ---
def already_promoted:
  ([ .task_board.ready[]?, .task_board.in_progress[]?, .task_board.review[]?,
     .task_board.done[]?, .task_board.done_verified[]? ]
   | map(select(type=="object") | .id) | index(TASK_ID)) != null;

# --- M1: pull the task out of backlog, escalate + stamp, push onto ready ---
def promoted_task($now):
  (.task_board.backlog[] | select(type=="object" and .id==TASK_ID))
  | .priority = "P1"
  | .status = "READY"
  | .next_agent = "dev-mcp-server"
  | .zone = "apps/mcp-server/"
  | .blocking = false
  | .size = "S"
  | .files = ["apps/mcp-server/src/domain/services/freshnessSlaChecker.ts",
              "docs/data/system-map.json",
              "docs/agents/system-auditor/flow/main.md"]
  | .title = "BCTC SLA false-CRITICAL off-season — recurring noise (P1): align mcp get_sla_status with the 168h resolver, widen inter-quarter quiet-gap threshold, and stop push-age->host-down inference"
  | .desc = ("RECURRING false-CRITICAL (B-05/B-06 bctc-discover). RAW-verify (po-s112 2026-06-25): "
    + "router framing '120 vs 360' is OUTDATED — the system-map.json bctc-discover SLA resolver is "
    + "ALREADY shipped+correct (mode=earnings-window-dependent, out-of-window=168h). THREE real sub-roots, "
    + "all in scope: (a) get_sla_status mcp tool still carries the legacy bctc 120min/360min config in "
    + "DEFAULT_SLA_CONFIG (freshnessSlaChecker.ts), DISTINCT from the auditor's system-map resolver — the "
    + "two SLA paths diverge; align get_sla_status to the same earnings-window resolver (or 168h out-of-window). "
    + "(b) 168h out-of-window is still too tight for the genuine ~10-week INTER-QUARTER quiet gap "
    + "(Apr-window-end->Jul-window-start): B-05 fired 199.7h, B-06 178h, both >168h yet pipeline healthy "
    + "(queue=0, host-up) — off-season staleness is BY DESIGN; widen out-of-window threshold to cover the full "
    + "inter-quarter gap (or gate staleness on time-since-expected-window-end, not wall-clock). "
    + "(c) push-age->'vn-bctc-fetch unhealthy'/host-down inference is WRONG "
    + "(feedback_bctc_lastpush_age_misread_as_crash): event-driven push-age is NOT a crash signal; the "
    + "B-05/B-06 'VPS unhealthy' verdict must gate on service-state + queue (queue=0 + host-up = healthy idle), "
    + "NOT push-age alone. DISTINCT from FIX-BCTC-SLA-FRESHNESS-EXCLUDE-TERMINAL (which rows count) and "
    + "FIX-BCTC-QUEUE-MAXAGE-GATE (drops >30d-no-filing tickers). DoD: BCTC SLA + auditor B-05/B-06 do NOT "
    + "report CRITICAL/HIGH/unhealthy during a normal off-season inter-quarter quiet period when queue=0 and "
    + "the host is up; RAW-confirm via get_sla_status + a live auditor B-05/B-06 dry-run on today (06-25, "
    + "off-window). config + check-logic fix.")
  | .priority_bumped = {from:"P3", to:"P1", by:"po-s112", at:$now,
                        rationale:"false-CRITICAL recurred 06-17/06-19/06-24/06-25; per-occurrence auditor+telegram+router burn now outweighs off-season low-harm"}
  | .promoted_at = $now
  | .promoted_by = "po-s112"
  | .scope_corrected = {by:"po-s112", at:$now,
                        note:"router '120 vs 360' framing outdated; system-map resolver already shipped; 3 real sub-roots: (a) mcp get_sla_status legacy 120/360 path diverges from resolver, (b) 168h too tight for inter-quarter gap, (c) push-age!=host-down"};

# --- apply M1 ---
def apply_M1($now):
  if already_promoted then .
  else
    (promoted_task($now)) as $t
    | .task_board.backlog |= map(select((type=="object" and .id==TASK_ID)|not))
    | .task_board.ready = ((.task_board.ready // []) + [$t])
  end;

# --- M2: dedup_key + resolve the signal row ---
def apply_M2($now):
  .signal_queue.rows |= map(
    if (.id==SIG_ID and .status=="NEW") then
      .dedup_key = "bctc-sla-threshold-recur"
      | .status = "RESOLVED"
      | .resolved_at = $now
      | .resolved_by = "po-s112"
      | .resolution = ("BUMPED FIX-BCTC-SLA-THRESHOLD-360 P3->P1 + PROMOTED backlog->ready (next_agent=dev-mcp-server). "
        + "Recurrence RAW-verified (06-17/06-19/06-24/06-25, auto-deduped INFO but each spawns auditor+telegram+router cost). "
        + "Scope corrected: router '120 vs 360' framing outdated — system-map SLA resolver already shipped; 3 real sub-roots "
        + "(mcp get_sla_status legacy path diverges, 168h too tight for inter-quarter gap, push-age!=host-down). "
        + "dedup_key set so future re-fires of this recommendation dedup not re-surface.")
    else . end
  );

# --- pipeline ---
. as $root
| apply_M1($now)
| apply_M2($now)
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s112"
