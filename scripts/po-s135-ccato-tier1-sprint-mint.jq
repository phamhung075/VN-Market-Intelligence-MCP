# po-s135-ccato-tier1-sprint-mint.jq
# Single-pass sprint-kickoff MINT for the CCATO narrative-truth gate (Tier-1 ONLY).
# Source: docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md (5e4f75ea).
#
# Mutations (all idempotent, id-guarded across ALL board lanes + sprint_goal.entries):
#   M1  sprint_goal.entries[] += vision entry for sprint NARRATIVE-TRUTH-CCATO-GATE
#       (carries the PO determination: narrative_contradiction needs NO Zod migration —
#        SignalRowSchema.type is z.string().optional() .passthrough() → ZERO apps/mcp-server change).
#   M2  task_board.ready[]    += CCATO-T1-TRUTH-GATE-ENGINE   (LEAD, unblocked, next_agent=developer)
#   M3  task_board.backlog[]  += CCATO-T2-CLAIM-TRUTH-SKILL   (depends T1, next_agent=developer)
#   M4  task_board.backlog[]  += CCATO-T3-FLOW-WIRING-6PT     (depends T2, next_agent=cowork-refactory-expert)
#
# WIP discipline (dev-standards WIP=2): serialized dep chain T1->T2->T3; only T1 is READY.
# Route via: jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" -f scripts/po-s135-ccato-tier1-sprint-mint.jq \
#            docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# orch-apply.sh does Zod + dup-key + CAS + atomic rename. PUSH HELD — fleet-push timer pushes.

def board_ids:
  [ .task_board | (.ready, .backlog, .in_progress, .review, .done, .done_verified)[]?
    | if type=="object" then .id else . end ];

def sprint_ids:
  [ .sprint_goal.entries[]?.sprint_id ];

# ── M1 : sprint_goal vision entry ──────────────────────────────────────────────
( if (sprint_ids | index("NARRATIVE-TRUTH-CCATO-GATE")) then .
  else .sprint_goal.entries += [{
    "sprint_id": "NARRATIVE-TRUTH-CCATO-GATE",
    "status": "active",
    "priority": "high",
    "created_by": "po",
    "origin": "architecture_brief_2026-06-30-narrative-quality-ccato-gate (5e4f75ea)",
    "vision": "Close the CCATO gap: no cowork narrative ships an absence/unavailability claim for a dimension its own authorized tools would populate. Deterministic re-probe: null tool result -> PASS (honest-NULL safe); non-null -> FAIL + block the artifact. The 2026-06-30 fb post (VNM 'khong co du lieu ky thuat' while get_technical_indicators returns RSI ~20.3, + foreign per-ticker 'cong cu chua tra duoc so' while get_foreign_flow returns rows) would not have shipped.",
    "scope_in": "TIER-1 ONLY. (1) docs/data/claim-tool-map.json SSOT: negation_lexicon + 5 dimension->tool routings, NO hardcode in script. (2) scripts/narrative-truth-gate.sh re-probe engine: sentence-scan -> negation match -> dimension keyword -> ticker extract -> LIVE gateway re-probe (mcp gateway call_tool server=vn-market) -> non-null=FAIL exit!=0 / null=PASS exit 0 -> emit narrative_contradiction row to .signal_queue.rows via scripts/orch-apply.sh. (3) .claude/skills/claim-truth-gate/SKILL.md shared SSOT wrapper: invocation contract + self-correct in-cycle protocol (brief S4.6) + time-sensitivity override for real-time agents. (4) Wire pre-write into 6 points: fb-market-poster STEP 4d, CHEF chef.md Step 6.7 Rule AF-3, market-watcher cycle.md Step 4f, alert-commander stage-dispatch-log.md Step 4a-pre, digest-predict daily-predict.md P-5.5, TNB audit-market.md Step 2 backstop. (5) DoD test harness scripts/test-narrative-truth-gate.sh proving a-d RAW.",
    "scope_out": "Tier-2 completeness (per-agent required-citation map) / Tier-3 Vietnamese language+spelling+jargon gate / Tier-4 per-agent calibration scorecard AND the evidenceTools.ts:413 agent_id one-liner — ALL deferred to follow-on sprints (mint separately). ZERO apps/mcp-server change in Tier-1. Money Radar brief (2026-07-01) is a SEPARATE sprint — not in scope.",
    "success_metric": "RAW-demonstrable end-to-end: (a) feed docs/social/fb-post-2026-06-30.md body -> gate detects VNM absence-claim -> re-probes get_technical_indicators(VNM) -> non-null (RSI ~20.3) -> exit!=0 (BLOCKED). (b) foreign per-ticker line FAILs (get_foreign_flow returns per-ticker; VNM net 3d -85,985 shares). (c) NEGATIVE CONTROL: genuine honest-NULL response -> exit 0 (no false-positive on OHLCV-depth-gated indicators). (d) determinism across runs. (e) fb-market-poster STEP 4d wired before STEP 5 write. (f) TNB Step 2 calls the same skill on published dish body.",
    "po_determination_signal_type": "narrative_contradiction needs NO Zod migration. SignalRowSchema (orchStateSchema.ts:175) types the row `type` field as z.string().optional() under .passthrough() — free string, no enum. Tier-1 therefore touches ZERO apps/mcp-server code. RECONCILE-VS-BRIEF: brief S4.5 names the field `signal_type` + a `payload` object; the LIVE schema keys on `type` (+ summary/severity/status/from/to, optional payload_ref). Emit step MUST set live field `type`:\"narrative_contradiction\" (the PO signal-dashboard reads `type`, NOT signal_type) + summary/severity/status:NEW/from:<agent_id>/to:po; structured detail via a payload object (passthrough-allowed) or a payload_ref file.",
    "created_at": $now
  }] end )

# ── M2 : T1 engine -> ready[] (LEAD, unblocked) ────────────────────────────────
| ( if (board_ids | index("CCATO-T1-TRUTH-GATE-ENGINE")) then .
    else .task_board.ready += [{
      "id": "CCATO-T1-TRUTH-GATE-ENGINE",
      "title": "CCATO detection engine: claim-tool-map.json (negation lexicon + 5 dimension->tool routings, NO hardcode) + scripts/narrative-truth-gate.sh (live gateway re-probe, exit!=0 on non-null contradiction, PASS on null, emit narrative_contradiction to signal_queue) + DoD test harness",
      "owner": "developer",
      "next_agent": "developer",
      "status": "READY",
      "zone": "cross-service",
      "type": "FEATURE",
      "size": "M",
      "priority": "high",
      "sprint": "NARRATIVE-TRUTH-CCATO-GATE",
      "depends": [],
      "created_at": $now,
      "files": ["docs/data/claim-tool-map.json", "scripts/narrative-truth-gate.sh", "scripts/test-narrative-truth-gate.sh"],
      "spec_ref": "docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md S4.1-4.4",
      "generic_mandate": "Script reads ALL negation lexicon + dimension->tool routing from docs/data/claim-tool-map.json at runtime — ZERO hardcode of lexicon/tools/tickers in the .sh. Re-probe via mcp gateway call_tool(server=\"vn-market\", tool=<dimension.tool>, arguments={code:ticker}) — NEVER mcp__vn-market__* direct. Every tool name in claim-tool-map.json (get_technical_indicators, get_foreign_flow, get_macro_snapshot, compare_financials, get_market_snapshot) MUST be gateway-verified to resolve before commit — no phantom tool names. Verdict: non-null/non-empty for the negated field => FAIL (exit!=0); null/empty => PASS. Signal emit on FAIL: write .signal_queue.rows[] via scripts/orch-apply.sh using the LIVE SignalRowSchema field `type`:\"narrative_contradiction\" (NOT signal_type) + id/summary/severity/status:NEW/from:<agent_id>/to:po/ts — see sprint_goal.po_determination_signal_type.",
      "acceptance": "scripts/test-narrative-truth-gate.sh RAW-proves all four: (a) fb-post-2026-06-30.md body -> VNM TA absence-claim -> get_technical_indicators(VNM) non-null RSI~20.3 -> exit!=0 naming VNM+indicators; (b) foreign per-ticker line -> get_foreign_flow per-ticker non-null -> exit!=0; (c) honest-NULL response (OHLCV-depth-gated indicator returns null) -> exit 0 (PASS, no false-positive); (d) identical input body -> identical verdict across repeated runs (determinism).",
      "verification_gate": "qa RAW-runs scripts/test-narrative-truth-gate.sh; all 4 assertions green AND a narrative_contradiction row is confirmed appended to .signal_queue.rows on a FAIL path (via orch-apply.sh, no schema reject). PASS-on-null asserted with a stubbed/real null tool response.",
      "note": "Foundation atom of NARRATIVE-TRUTH-CCATO-GATE. No apps/mcp-server change (narrative_contradiction is a free-string `type`). Router live-verified ground truth: VNM RSI~20.3, get_foreign_flow VNM net 3d -85,985 shares."
    }] end )

# ── M3 : T2 skill -> backlog[] (depends T1) ────────────────────────────────────
| ( if (board_ids | index("CCATO-T2-CLAIM-TRUTH-SKILL")) then .
    else .task_board.backlog += [{
      "id": "CCATO-T2-CLAIM-TRUTH-SKILL",
      "title": "Shared SSOT skill .claude/skills/claim-truth-gate/SKILL.md wrapping narrative-truth-gate.sh: invocation contract (post_body/agent_id/cache) + self-correct in-cycle protocol (brief S4.6) + time-sensitivity override for real-time agents + PASS-on-null honest-NULL note",
      "owner": "developer",
      "next_agent": "developer",
      "status": "BACKLOG",
      "zone": ".claude/skills/",
      "type": "FEATURE",
      "size": "S",
      "priority": "high",
      "sprint": "NARRATIVE-TRUTH-CCATO-GATE",
      "depends": ["CCATO-T1-TRUTH-GATE-ENGINE"],
      "created_at": $now,
      "files": [".claude/skills/claim-truth-gate/SKILL.md"],
      "spec_ref": "docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md S4 + S4.6 + S5",
      "generic_mandate": "ONE SSOT skill every cowork agent AND TNB invoke so in-flow and backstop logic never drift. Documents: inputs (post_body, agent_id, optional working-memory cache); the exit-code contract (0=all PASS, !=0=>=1 FAIL); the self-correct in-cycle protocol (re-call mapped tool -> rewrite offending sentence with real values -> re-run gate -> PASS=>continue / 2nd-FAIL=>per-field honest gap per main.md:176 + emit signal regardless); and the EXPLICIT time-sensitivity override (market-watcher/alert-commander: persistent FAIL that cannot self-correct MUST still emit the signal and PROCEED with the honest-gap version rather than block a real-time alert).",
      "acceptance": "Skill exists, references scripts/narrative-truth-gate.sh as the single engine, documents self-correct S4.6 + time-sensitivity override, and is the sole artifact the 6 wiring points (T3) invoke.",
      "verification_gate": "qa confirms the skill is the single invocation surface (no duplicated re-probe logic) and its documented contract matches the shipped narrative-truth-gate.sh exit-code + signal behavior."
    }] end )

# ── M4 : T3 flow wiring -> backlog[] (depends T2) ──────────────────────────────
| ( if (board_ids | index("CCATO-T3-FLOW-WIRING-6PT")) then .
    else .task_board.backlog += [{
      "id": "CCATO-T3-FLOW-WIRING-6PT",
      "title": "Wire the shared claim-truth-gate skill as the last pre-write gate into 6 flows: fb-market-poster STEP 4d, CHEF chef.md Step 6.7 Rule AF-3, market-watcher cycle.md Step 4f, alert-commander stage-dispatch-log.md Step 4a-pre, digest-predict daily-predict.md P-5.5, TNB audit-market.md Step 2 backstop",
      "owner": "cowork-refactory-expert",
      "next_agent": "cowork-refactory-expert",
      "status": "BACKLOG",
      "zone": "docs/agents/",
      "type": "FEATURE",
      "size": "M",
      "priority": "high",
      "sprint": "NARRATIVE-TRUTH-CCATO-GATE",
      "depends": ["CCATO-T2-CLAIM-TRUTH-SKILL"],
      "created_at": $now,
      "files": ["docs/agents/fb-market-poster/flow/main.md", "docs/agents/unified-agent/flow/chef.md", "docs/agents/market-watcher/flow/cycle.md", "docs/agents/alert-commander/flow/stage-dispatch-log.md", "docs/agents/digest-predict/flow/daily-predict.md", "docs/agents/tran-ngoc-bau/flow/audit-market.md"],
      "spec_ref": "docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md S5.1-5.6",
      "generic_mandate": "Insertion is ALWAYS the last gate step before the narrative is written to a file or sent to a channel. All 6 invoke the identical .claude/skills/claim-truth-gate/SKILL.md (no drift). Real-time flows (market-watcher, alert-commander) carry the time-sensitivity override (proceed-with-honest-gap on persistent FAIL). Exact insertion anchors per brief S5.1-5.6.",
      "acceptance": "DoD (e): fb-market-poster STEP 4d present before STEP 5 write — the 2026-06-30 post would NOT have shipped with either CCATO instance. DoD (f): TNB audit-market.md Step 2 calls the same claim-truth-gate skill on the published dish body and flags MISMATCH via the existing TNB emit path (post_agent_signal + BUG-channel + signal_queue row to:po).",
      "verification_gate": "qa confirms all 6 anchors present + each references the shared skill; fb STEP 4d + TNB Step 2 explicitly re-verified against DoD (e)/(f)."
    }] end )

# ── metadata bump ──────────────────────────────────────────────────────────────
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s135-ccato-tier1-sprint-mint"
| .sprint_goal._updated_at = $now
| .sprint_goal._updated_by = "po-s135-ccato-tier1-sprint-mint"
