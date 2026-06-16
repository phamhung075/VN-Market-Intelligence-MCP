# po-s90: TRIAGE — chef-evening 2026-06-16 manual×cloud double-post (router-RAW-verified).
#
# Root-cause (CONFIRMED, not refuted): the published-marker gate (chef.md Step 0.5) IS
# co-located in chef.md and IS generic (derives slot=<slot_id> from prompt; key
# published:<slot_id>:<VN-date GMT+7>; both 06-16 cloud@19:47 + dispatcher@19:57 derive the
# SAME key published:chef-evening:2026-06-17 — NO date drift). The defect is NOT a missing
# claim-by-design and NOT key-date drift. The defect is that Step 0.5 line 80
# (`if PUBLISH_CLAIM.claimed != true: EXIT`) is FAIL-OPEN: it only handles a clean
# {claimed:false} RETURN. When task_claim THROWS / TIMES OUT / returns an error object with no
# `.claimed` field (exactly what happens in a headless cloud RemoteTrigger session under
# gateway lag — router reproduced the task_claim timeout live this tick), the gate does NOT
# block, and the chef "degraded-dish floor / a dish beats no dish / no third path between SENT
# and FAILED" mandate pushes the cloud chef to PUBLISH UNGUARDED (id 779 @19:47, no marker
# claim). The dispatcher chef then finds the marker free (it was), claims it @19:56:43, and
# posts the duplicate (id 780 @19:57). LIVE PROOF: probing the marker shows
# owner_agent=unified-agent claimed_at=1781639803 (19:56:43Z) = the LATER dispatcher post;
# the earlier cloud post left no claim.
#
# DECISION: FOLD into the existing ARCH-HEADLESS-GATEWAY-COWORK-NOPOST design task (same root
# family = cloud-RemoteTrigger gateway behavior on cowork slots; same owner agents-architect;
# already GENERIC across all gateway-dependent cowork slots, high, Monday-gated). That task
# today covers only the OPPOSITE polarity (cloud gateway ABSENT -> silent no-post). This tick
# proves the SECOND polarity: cloud gateway PRESENT for send_telegram but the marker gate
# fails OPEN -> double-post. NO new task minted (dedup) — fold a recurrence_evidence block +
# a fail_closed acceptance criterion. Generic: fail-CLOSED on ANY claim error, no per-slot
# allowlist, no date-literal, every publishing cowork slot.
#
# Idempotent: guarded by `.failopen_folded == true`. Re-run mutates 0.
# Scoped to the single backlog row + task_board _updated_*. No whole-object rewrite.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s90-chef-evening-doublepost-failopen-fold.jq docs/data/orch/orch-state.json

(.task_board.backlog[] | select(.id == "ARCH-HEADLESS-GATEWAY-COWORK-NOPOST")) |= (
  if (.failopen_folded == true) then .
  else
    .failopen_folded = true
    | .priority = "high"
    | .recurrence_evidence = [
        ((.recurrence_evidence // [])[]),
        {
          "at": $now,
          "by": "po-s90",
          "incident": "chef-evening 2026-06-16 manual×cloud DOUBLE-POST to MARKET (irreversible)",
          "raw_verified": "router read get_unreviewed_market_messages + live task_claim probe",
          "msg_ids": [779, 780],
          "cloud_path": "id 779 @2026-06-16T19:47:01Z (cloud RemoteTrigger trig_013z chef-evening) — posted WITHOUT claiming the published marker",
          "dispatcher_path": "id 780 @2026-06-16T19:57:31Z (cowork dispatcher-spawned unified-agent a4ca12f2) — claimed published:chef-evening:2026-06-17 @19:56:43Z then posted the dup",
          "marker_probe": "published:chef-evening:2026-06-17 held by owner_agent=unified-agent claimed_at=1781639803 (19:56:43Z) = the LATER post; cloud (earlier) post left NO claim",
          "key_drift_ruled_out": "both 19:47Z & 19:57Z = 02:47 & 02:57 VN on 2026-06-17 -> SAME key published:chef-evening:2026-06-17; no date drift",
          "polarity": "SECOND polarity vs this task's original digest-W24 finding — there the cloud gateway was ABSENT (silent no-post); here the cloud gateway was PRESENT for send_telegram but the Step 0.5 marker gate FAILED OPEN on a task_claim error/timeout -> unguarded publish",
          "root_cause": "chef.md Step 0.5 line ~80 `if PUBLISH_CLAIM.claimed != true: EXIT` is FAIL-OPEN: handles only a clean {claimed:false} RETURN, not a task_claim THROW/TIMEOUT/error-object (no .claimed field). Headless cloud session under gateway lag hits the timeout, has no fail-closed instruction, and the chef degraded-dish-floor / 'no third path between SENT and FAILED' culture pushes it to publish unguarded.",
          "noise_marked": "MARKET msg id 780 marked noise via batch_review_market_messages (queue kept honest); id 779 retained",
          "memory_class": ["feedback_gatherer_manual_cloud_doublefire", "feedback_graceful_degrade_needs_bounded_fetch", "feedback_false_infra_failure_corroboration_gate", "feedback_guaranteed_slot_week_key_double_post"]
        }
      ]
    | .fail_closed_ac = "AC-FAILCLOSED (GENERIC, all publishing cowork slots — chef.md Step 0.5 + spawn-fanout.md marker contract): the published-marker claim is a SAFETY GATE on an irreversible MARKET publish, so it MUST FAIL CLOSED. (1) Bound the task_claim call with a deadline < gateway timeout and a single retry. (2) Treat ANY of {tool throws, timeout/deadline exceeded, result missing a boolean `.claimed`, transport/gateway error} EXACTLY like claimed=false -> BLOCK the publish: do NOT call send_telegram(market); emit a distinct telemetry reason (e.g. reason=marker-unreadable-failclosed) so a genuinely-blocked publish is observable on WORK; record BLOCKED_DUP/BLOCKED_UNREADABLE in the notebook. (3) The chef 'degraded-dish floor / no third path between SENT and FAILED' mandate MUST carve out an explicit exception: a marker that cannot be confirmed-free is NOT a degradable supplementary source — it is a hard publish-block. NO per-slot allowlist, NO date-literal, NO hardcode; generic across morning/eod/evening/intraday + digest-sunday + tnb-audit + any future publishing slot. Verification: simulate task_claim timeout/error on the cloud path -> chef does NOT post + emits the fail-closed telemetry; non-regression: clean {claimed:true} still posts, clean {claimed:false} still silent-blocks."
    | .status_note = (.status_note + " || FOLD 2026-06-16 (po-s90): + SECOND polarity = MARKER GATE FAILS OPEN. chef-evening double-posted to MARKET (id 779 cloud-unguarded + id 780 dispatcher) — same VN-date key, no drift; cloud path posted without claiming the marker because Step 0.5 only handles a clean {claimed:false} return, not a task_claim timeout/throw in a headless cloud session (router reproduced the timeout live). Add AC-FAILCLOSED (see .fail_closed_ac): the dedup gate MUST fail CLOSED on any unreadable/errored claim — generic across all publishing cowork slots, no allowlist/date-literal. Route: agents-architect contract review (irreversible MARKET double-publish safety) -> agent-father flow edit via agent-md-factory. Files: docs/agents/unified-agent/flow/chef.md (Step 0.5) + docs/agents/cowork-team/flow/spawn-fanout.md. Recurring-bug-escalation: kin of FU-CHEF-MARKER-INFLOW (marker-in-flow, shipped), FIX-CHEF-INTRADAY-MARKER-CADENCE (key granularity, done), FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (done).")
    | .updated_at = $now
    | .updated_by = "po-s90"
  end
)
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s90"
