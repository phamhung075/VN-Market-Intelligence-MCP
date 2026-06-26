# po-s120 — single-task PLAN-ONLY MINT (idempotent): append FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY
# to .task_board.backlog[] iff the id is absent from EVERY board lane.
#
# DEFECT (RAW-verified 2026-06-26 from cowork-dispatcher signals 00:19Z + 00:22Z; confirmed in
# docs/agents/cowork-team/flow/last-fired.md Step 5b): last_fired is bumped for WON_SLOTS =
# "successful spawns" (AC-P1-7-1: "last_fired written after successful spawn"). A spawn is
# run_in_background (fire-and-forget) — "won" = the spawn handle returned, NOT delivery proof
# (notebook mtime advance / marker). A spawn that dispatches then DIES before writing its
# notebook still bumps last_fired -> the matcher (cowork-match-slots.js, reads last_fired) sees
# the cadence satisfied and never re-offers the slot -> the genuine miss is MASKED. Observed:
# news-scout-offhours 00:00 fire bumped last_fired 00:02:36Z but produced no c108 notebook cycle
# (siblings bctc/market-watcher DID deliver -> gateway was up -> the spawn died before delivery).
# Same class as the prior bctc-analyst-slot-3 master-cron gap. RECURRING correctness defect.
#
# DISTINCT FROM FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER (done_verified 30b9a7f8): that was a
# stale-base read-modify-write CLOBBERING OTHER slots' stamps (monotonic-guard fix). THIS is a
# SINGLE slot's last_fired bumped on dispatch-success when its own delivery never happened — no
# monotonic guard catches it (the bumped value IS forward-moving, just unbacked by delivery).
#
# PLAN-ONLY: status BACKLOG, NOT promoted to ready (WIP stays 0). Idempotent: re-run mints 0.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s120-cowork-lastfired-decouple-delivery-mint.jq docs/data/orch/orch-state.json
# (atomic temp -> [ -s ] -> jq empty -> rename; commit orch-state by EXPLICIT PATH)

def ID: "FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY";

def present_in_board:
  [ .task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
    .task_board.review[]?, .task_board.qa[]?, .task_board.done[]?, .task_board.done_verified[]? ]
  | map(select(type=="object") | .id) | any(. == ID);

if present_in_board then .
else
  .task_board.backlog += [{
    "id": ID,
    "type": "FIX",
    "severity": "MEDIUM",
    "priority": "medium",
    "size": "M",
    "status": "BACKLOG",
    "title": "cowork last_fired is bumped on spawn DISPATCH-success, not delivery proof -> a spawn that dies before writing its notebook still satisfies the cadence gate -> genuine slot misses are MASKED (matcher never re-offers)",
    "description": "RAW-verified 2026-06-26 from cowork-dispatcher signals (00:19Z cowork_spawn_completion + 00:22Z blind-correction) and confirmed in docs/agents/cowork-team/flow/last-fired.md Step 5b: last_fired updates for WON_SLOTS where 'won' = the run_in_background spawn handle returned (AC-P1-7-1 'last_fired written after successful spawn'), NOT delivery confirmation (notebook mtime advance / marker file). A backgrounded spawn that dispatches then dies before delivering still bumps last_fired; cowork-match-slots.js then reads the bumped stamp, sees the 4h cadence satisfied, and never re-offers the slot -> the miss is invisible. OBSERVED: news-scout-offhours 00:00 master-cron fire bumped last_fired 00:02:36Z but produced NO c108 notebook cycle (latest real c108 @ 06-25T16:04Z; both 20:00 and 00:00 slots un-run), while sibling bctc-analyst-slot-4 + market-watcher-offhours DID deliver real cycles -> gateway was up -> the news-scout spawn died before delivery. Same masking class as the prior bctc-analyst-slot-3 master-cron gap. The dispatcher only caught it via an ad-hoc marker-safe recovery spawn (which then turned out blind) — there is no SYSTEMIC delivery-confirmation gate.",
    "owner": "po",
    "next_agent": "architect",
    "zone": "multi",
    "files": [
      "docs/agents/cowork-team/flow/last-fired.md",
      "docs/agents/cowork-team/flow/main.md",
      "scripts/agents-flow/cowork-match-slots.js"
    ],
    "fix_spec": "ARCHITECT confirm zone split + design first (do NOT pre-commit to an approach). The hard constraint: spawns are run_in_background (fire-and-forget) so the dispatcher CANNOT synchronously await delivery within one tick. Candidate designs to evaluate: (A) DEFERRED-CONFIRM ledger — on spawn, record a pending_delivery{slot_id, dispatched_at, expected_artifact} marker and DO NOT bump last_fired; on a SUBSEQUENT tick, bump last_fired only if the slot's delivery artifact (notebook mtime > dispatched_at, or a per-slot delivery marker) advanced, else re-offer the slot (bounded retry budget to avoid thrash). (B) POST-SPAWN short delivery poll before the Step 5b write (bounded, < tick budget). (C) artifact-driven cadence — derive 'last delivered' from the slot's real delivery artifact mtime rather than a dispatch-stamped field, making last_fired advisory. Architect picks; BA decomposes into dev-ready fix_spec+files. cowork-schedule.json is _maintained_by agent-father via architect brief ONLY (never direct edit) — flow-doc + matcher changes route to dev-mcp-server / agent-father per the split.",
    "generic_mandate": "Cadence suppression MUST be gated on DELIVERY PROOF, not dispatch success, for ALL fire-and-forget cowork slots (not just news-scout) — a slot whose spawn dispatched but never delivered must remain due. Applies to every */4h + guaranteed slot in cowork-schedule.json. No hardcoded slot lists — derive from the schedule.",
    "verification_gate": "Simulate a slot whose spawn DISPATCHES successfully but produces NO delivery artifact (no notebook mtime advance / no marker) within the delivery window -> last_fired is NOT advanced (or the slot is re-offered next tick) AND the matcher re-offers it on the next cron period; a slot that DOES deliver advances last_fired exactly once and is correctly suppressed. Both behaviors covered by cowork-match-slots.test.js (or its successor). Confirm no re-fire thrash on a slow-but-eventually-delivering spawn (bounded retry).",
    "baseline_pass": true,
    "rebuild_required": false,
    "depends": [],
    "distinct_from": "FIX-COWORK-SCHEDULE-STALE-BASE-CLOBBER (done_verified 30b9a7f8) was a stale-base read-modify-write clobbering OTHER slots' stamps, fixed by a monotonic forward-only guard. THIS defect is a SINGLE slot's last_fired advanced on dispatch-success when its OWN delivery never occurred — the monotonic guard does NOT catch it (the bumped value is genuinely forward-moving, just unbacked by delivery).",
    "source": "PO file-channel triage of cowork-dispatcher signals cowork-team-2026-06-26T00:19Z.json (cowork_spawn_completion, KNOWN-DEFECT corroborated) + cowork-team-2026-06-26T00-22Z-blind-correction.json. RAW-verified against docs/agents/cowork-team/flow/last-fired.md Step 5b. PLAN-ONLY, NOT promoted to ready (WIP=0). Recurring correctness defect (2nd observed instance after bctc-analyst-slot-3).",
    "created_at": $now,
    "created_by": "po-s120"
  }]
  | .task_board._updated_at = $now
  | .task_board._updated_by = "po-s120"
end
