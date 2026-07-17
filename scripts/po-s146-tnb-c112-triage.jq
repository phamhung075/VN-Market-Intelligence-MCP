# po-s146-tnb-c112-triage.jq — single-pass PLAN-ONLY triage of the tnb-audit c112 handoff.
# Three idempotent mutations, all confined to .task_board.backlog[]:
#   M1 ANNOTATE-IN-PLACE  SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING  (tnb_recurrence_c112 — 4th consecutive
#      unhealthy-EOD business day + 2-failure-mode reconciliation; distinct key so c109 tnb_recurrence is NOT clobbered)
#   M2 ANNOTATE-IN-PLACE  FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING       (tnb_intraday_symptom — fold
#      F-INTRADAY-SYNTHESIS-STALE-MULTIFIRE: new first-write-wins symptom of the same date-keyed-collision root + AC refinement)
#   M3 ID-GUARDED MINT    FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE -> backlog[] (PLAN-ONLY, the one genuinely-new finding)
# All guards make re-run a no-op: M1/M2 marker-guarded (has(...)), M3 id-guarded across all lanes.
# Reusable pattern: "triage a supervisor audit handoff plan-only — record a recurrence datum on the umbrella
#   SPIKE (distinct key per cycle, never clobber a prior cycle's), FOLD a new symptom-variant into the existing
#   root row with an AC refinement, mint ONLY the genuinely-new finding as a PLAN-ONLY backlog row; PO does NOT
#   promote or spawn." Run via scripts/orch-apply.sh.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s146-tnb-c112-triage.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def all_ids:
  [ .task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
    .task_board.review[]?, .task_board.done[]?, .task_board.done_verified[]?
    | if type=="object" then .id else . end ];

($now) as $now
| (all_ids) as $ids

# M1 + M2: in-place annotations on existing backlog rows
| .task_board.backlog |= (map(
    if (type=="object" and .id=="SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING") then
      (if has("tnb_recurrence_c112") then . else
        . + { tnb_recurrence_c112: {
          at: $now,
          by: "po-tnb-c112-triage",
          datum: "F-CHEF-EOD-DORMANT-0717 (HIGH) — tnb c112: chef-eod is now 4th CONSECUTIVE business-day unhealthy (07-14 dormant, 07-15 dormant, 07-16 phantom-fire, 07-17 dormant-signature-again), alternating between 2 distinct failure modes. RECONCILIATION (deeper peer-session source, cross-plane): 07-17's stale last_fired (stuck 2026-07-16T08:52:50.457Z) is NOT true non-dispatch — the agent DID claim the publish marker (08:50:19Z) + bootstrap (08:50:24Z), gathered Steps 0-1 (22 tool calls / 144.6k tok), then bailed pre-publish, LEAKING the marker (published:chef-eod:2026-07-17) as a false tombstone. So 07-17 belongs to the FIX-CHEF-MIDFLOW-BAIL-DETERMINISM class (P1, recurring recurrence_count=2, supervised, next_agent=agent-father) + the FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY false-green class, NOT this dispatcher-wide SPIKE. This SPIKE still owns the TRUE non-dispatch mode (07-14/07-15). tnb recommends priority review on escalating recurrence; PO HOLDS priority=high (already) + supervised — do NOT auto-promote (this is the root-cause investigation, not a live same-day fix; the two agent-side modes are already max-escalated on their own P1 rows).",
          source: "docs/handoffs/tnb-audit-latest.md#F-CHEF-EOD-DORMANT-0717"
        } }
      end)
    elif (type=="object" and .id=="FIX-COWORK-SIGNAL-FILENAME-CYCLEID-KEYING") then
      (if has("tnb_intraday_symptom") then . else
        . + { tnb_intraday_symptom: {
          at: $now,
          by: "po-tnb-c112-triage",
          datum: "F-INTRADAY-SYNTHESIS-STALE-MULTIFIRE (MED) — tnb c112, 2026-07-17: NEW symptom variant of THIS root (synthesis file docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json not cycle_id-keyed). unified-agent-synthesis-2026-07-17-intraday.json on disk reflects ONLY the FIRST same-day intraday cycle (cycle_id intraday-2026-07-17T04:13:00Z); the later 14:13Z cycle (VNM/HCM/VNH/BID, 4 clusters) that the notebook cites writing to the SAME filename NEVER LANDED — FIRST-WRITE-WINS, the INVERSE of this row's documented last-write-clobber (chef synthesis run2 clobbered run1). Confirms the same-path collision yields UNDEFINED/inconsistent write semantics across dish types (chef-evening overwrites correctly across its 2-pass day; intraday appears first-write-wins). Creates an audit blind spot for the latest same-day intraday content on any file-proxy audit.",
          ac_refinement: "The cycle_id-keying fix MUST guarantee BOTH same-day intraday cycles land on their own path + stay independently queryable REGARDLESS of write-order semantics. Append AC: any day with 2+ non-silent intraday fires surfaces every non-silent cycle's synthesis on disk (no first-write-wins drop, no last-write-clobber).",
          disposition: "FOLD not re-mint — subsumed by this row's cycle_id-keying fix (scope already lists unified-agent-synthesis-<DATE>-<SLOT>.json + the chef/unified-agent writer).",
          source: "docs/handoffs/tnb-audit-latest.md#F-INTRADAY-SYNTHESIS-STALE-MULTIFIRE"
        } }
      end)
    else . end
  ))

# M3: id-guarded mint of the genuinely-new FX-threshold numeric-drift gate row
| if ($ids | index("FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE")) then .
  else .task_board.backlog += [ {
    id: "FIX-CHEF-USDVND-THRESHOLD-NUMERIC-DRIFT-GATE",
    title: "chef dish USD/VND threshold citation drifts across dishes (25,000 / 25,500 / 26,110-vs-25000) — deterministic numeric-literal assertion/gate, not more prose",
    type: "FIX",
    priority: "P3",
    status: "BACKLOG",
    plan_only: true,
    zone: "cross-service/",
    owner: "po",
    next_agent: "ba",
    supervised: true,
    created_at: $now,
    created_by: "po-tnb-c112-triage",
    origin: "docs/handoffs/tnb-audit-latest.md#F-USDVND-THRESHOLD-VALUE-INCONSISTENT",
    note: "PLAN-ONLY (anomaly->BACKLOG bridge, project_anomaly_task_bridge). ROOT CAUSE (tnb c112, root-cause depth): LLM NARRATIVE DRIFT toward a historically-familiar round number ('25,000' = VND's 2023 'vượt mốc 25,000' media milestone), NOT a text-instruction defect — chef.md Step 2/3 instructions are ALREADY textually correct (25,500 / 26,500) and NO hardcoded '25000' constant exists in macro-health-read/SKILL.md (FX is direction-only) or apps/mcp-server/src, so a prose-only fix is REDUNDANT. RECURRING: the '25,000' variant recurs across >=5 dish instances over 3 days (07-13, 07-15, 07-17 x2), not just today — crosses feedback_recurring_bug_escalation (2+). USER-FACING: the wrong FX threshold ships to MARKET output. PREREQUISITE (do this FIRST): reconcile the CANONICAL FX threshold value — the reference docs THEMSELVES disagree (docs/agents/tran-ngoc-bau/... main.md audit table cites 26,500; tnb-methodology-layers.md cites 25,500) — before any gate can assert against it. FIX (per tnb rec): a deterministic numeric-literal assertion/gate on the FX-threshold citation in chef dish output (validate the cited USD/VND threshold == the reconciled SSOT value; flag/correct drift), NOT more prose. OWNER CHAIN: ba spec (resolve canonical value + gate contract) -> architect/agent-father for gate placement (co-candidate: claim-truth-gate-style check in the publish path, or a post-generation output lint). supervised:true — do NOT let BOUNDED-1 idle-auto-launch (needs the reconciliation+spec first). AC: (1) the canonical FX threshold value is reconciled to ONE SSOT across main.md audit table + tnb-methodology-layers.md + chef.md Step 2/3; (2) a deterministic check rejects/flags any dish citing an FX threshold that diverges from that SSOT value; (3) the '25,000' narrative-drift variant no longer publishes to MARKET (RAW-verified on a subsequent dish).",
    verification_gate: "A subsequent chef dish cites the reconciled canonical FX threshold value verbatim AND the deterministic gate flags/corrects an injected off-canon value; done_verified requires the '25,000' drift variant absent from MARKET output across a full audit cycle."
  } ]
  end

# metadata bump
| ._updated_at = $now
| ._updated_by = "po-tnb-c112-triage"
