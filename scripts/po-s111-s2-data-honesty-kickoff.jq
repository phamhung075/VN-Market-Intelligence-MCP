# po-s111-s2-data-honesty-kickoff.jq
# S2 DATA-HONESTY thread kickoff (real-data-only standing goal).
# Single-pass, idempotent, conservation-guarded board mutation:
#   M1 SPRINT GOAL: append S2 entry to .sprint_goal.entries[] (id-guarded).
#   M2 MINT FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION -> ready[] LEAD
#      (the prior FIX-SIGNAL-CONFIDENCE-DEFAULT-50 was done_verified on a green
#       build but LIVE DB shows 86% of agent_signals + ALL recent verified_decision
#       rows stuck at literal 50 — the dominant producer was never wired; reopen).
#   M3 PROMOTE existing FIX-MACRO-SNAPSHOT-DELTAS-NULL backlog[]->ready[]
#      (RAW-confirmed live this session: oil/gold/usdVnd Delta=null, direction=unknown).
#   M4 SET top-level .head -> dispatch the confidence fix's first agent.
# All mutations id/marker-guarded => re-run mutates 0.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s111-s2-data-honesty-kickoff.jq \
#   docs/data/orch/orch-state.json
#
# Reusable pattern: "open an approved standing-goal thread — author the sprint
# goal, REOPEN a falsely-closed fix proven live by RAW data (not a green build),
# promote a fully-specced sibling backlog task, dispatch the lead via .head".

def has_id($id): any(.task_board[] | select(type=="array") | .[]?; (.id? // "") == $id);

# ---- the reopened confidence fix (dominant verified_decision producer) ----
($now) as $now
| .task_board.ready as $ready_in

# M2: mint the verified-decision confidence fix into ready[] (lead) if absent
| (if has_id("FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION") then .
   else
     .task_board.ready = ([{
       "id": "FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION",
       "epic": "S2-DATA-HONESTY",
       "type": "FIX",
       "status": "READY",
       "priority": "P1",
       "blocking": false,
       "zone": "apps/mcp-server/",
       "dev_agent": "dev-mcp-server",
       "route_to": "dev-mcp-server",
       "owner": "dev-mcp-server",
       "next_agent": "ba",
       "title": "verified_decision signals still served at literal confidence 50 — dominant producer never wired (reopens FIX-SIGNAL-CONFIDENCE-DEFAULT-50)",
       "desc": "RAW-VERIFIED LIVE 2026-06-23 against named-vol /app/data/market.db (bun:sqlite): agent_signals confidence_score dist = 3316/3874 (86%) at literal 50; EVERY recent verified_decision row (the dashboard SIGNALS-LAST-10 dominant type) = 50, incl. today 2026-06-23T16:32Z. Other producers (news 86/88/90, scanMarket 70s) DO write real varied values, but the dominant verified_decision path does not. The prior FIX-SIGNAL-CONFIDENCE-DEFAULT-50 (done_verified) only wired confidence when finding_data.confidence is present (agentSignalTools.ts:302-307); the verified_decision producer supplies no finding_data.confidence, so postSignal falls through to the COLUMN DEFAULT 50 (agentSignalStore.ts:341 + schema-news.ts:104 ALTER ... DEFAULT 50). The comment at agentSignalTools.ts:300 claims default-50 is 'honest: no fake value' — but a constant 50 reads on the dashboard as a real confidence, which IS a fabricated metric. ROOT: the verified_decision emit path (assembleBriefing / verified-decision producer) computes a real conviction (convictionScorer.computeConviction → 0..1) but never threads it into the agent_signals row. FIX (dev-mcp-server): wire the verified_decision producer's already-computed conviction (0..1) → confidence_score (round*100, clamp 0..100) on the postSignal/PostSignalInput path; where a producer genuinely has NO confidence, store NULL (and the read-fallback must serve an explicit 'n/a', NOT 50 — change stockSignalsHandler.ts:224 `?? 50` → null/explicit-unknown so the absence is honest, not masked). NO fake/constant served value. Read-fallback `?? 50` at stockSignalsHandler.ts:224 is currently dead (DB null=0) but must be hardened so a future NULL is shown as unknown not 50.",
       "root_cause": "verified_decision producer never threads its computed conviction into the agent_signals.confidence_score column; row falls to COLUMN DEFAULT 50 (agentSignalStore.ts:341, schema-news.ts:104). Prior fix only covered finding_data.confidence-carrying producers.",
       "generic_mandate": "No served metric is a hardcoded/default constant where a real value was computed (no_fake_data_real_fetch). Every signal producer threads its real confidence; genuine-absence → explicit unknown/NULL, never a plausible-looking constant.",
       "verification_gate": "RAW (the real bar, not green build): after rebuild, live get_macro/get-signals + named-vol market.db query shows recent verified_decision rows carry VARIED real confidence_score (NOT a constant 50); dashboard SIGNALS-LAST-10 shows non-constant confidence across rows/sources; any genuine-absence row serves explicit unknown, never 50. done_verified WITHHELD until this live varied-data probe passes.",
       "rebuild_required": true,
       "files": [
         "apps/mcp-server/src/interface/mcp/tools/news-analysis/agentSignalTools.ts",
         "apps/mcp-server/src/infrastructure/db/agentSignalStore.ts",
         "apps/mcp-server/src/interface/mcp/routes/stockSignalsHandler.ts",
         "apps/mcp-server/src/application/usecases/assembleBriefing.ts"
       ],
       "reopens": "FIX-SIGNAL-CONFIDENCE-DEFAULT-50",
       "reopen_reason": "parent done_verified on green build + finding_data-carrying producers, but LIVE DB proves the dominant verified_decision producer still serves literal 50 (plausibility-check gap — non_zero_values_need_plausibility_check / no_fake_data_real_fetch).",
       "source": "po-s111 S2 kickoff RAW-probe (live named-vol DB + get_macro_snapshot)",
       "created_at": $now,
       "created_by": "po-s111",
       "promoted_at": $now,
       "promoted_by": "po-s111"
     }] + $ready_in)
   end)

# M3: promote FIX-MACRO-SNAPSHOT-DELTAS-NULL backlog[]->ready[] if still in backlog
| (.task_board.backlog | map(select(.id? == "FIX-MACRO-SNAPSHOT-DELTAS-NULL"))) as $macro
| (if ($macro | length) > 0
     and (any(.task_board.ready[]?; .id? == "FIX-MACRO-SNAPSHOT-DELTAS-NULL") | not)
   then
     .task_board.ready += [ $macro[0]
       + { "status": "READY", "next_agent": "ba",
           "promoted_from": "backlog", "promoted_at": $now, "promoted_by": "po-s111",
           "promotion_note": "S2 DATA-HONESTY thread (po-s111). RAW-CONFIRMED LIVE 2026-06-23T17:25Z: get_macro_snapshot oilUsdDelta/goldUsdDelta/usdVndDelta=null, direction=unknown; vnIndexDelta=11.13 up. Still reproduces exactly as specced.",
           "epic": "S2-DATA-HONESTY" } ]
     | .task_board.backlog |= map(select(.id? != "FIX-MACRO-SNAPSHOT-DELTAS-NULL"))
   else . end)

# M1: append S2 sprint goal entry (id-guarded)
| (if (.sprint_goal.entries // []) | any(.sprint_id == "S2-DATA-HONESTY") then .
   else
     .sprint_goal.entries = ((.sprint_goal.entries // []) + [{
       "sprint_id": "S2-DATA-HONESTY",
       "status": "active",
       "vision": "Every served metric is a real fetched/computed value — no hardcoded, default, or placeholder constant masquerades as a live reading.",
       "scope_in": "(1) verified_decision signal confidence — wire real conviction, kill literal-50 default; (2) macro oil/gold/usdVnd deltas — persist prev-session, compute signed delta+direction.",
       "scope_out": "convictionScorer 0.5 neutral-fallbacks (legitimate missing-input semantics, NOT a mask — DROPPED); BCTC source_confidence=1.0 (correct for human-confirmed corrections — DROPPED); the broad 94-task FACTORY maintainability epic.",
       "success_metric": "LIVE VARIED real values verified against the named-vol DB / live tool (NOT a green build): verified_decision confidence non-constant; oil/gold/usdVnd carry signed delta+direction.",
       "created_at": $now
     }])
   end)

# M4: point .head at the lead confidence fix's first agent (only if head idle OR
# stale-pointing at a task not actually in in_progress[])
| (.task_board.in_progress // []) as $ip
| ((.head.active_task_id) as $hid
   | if ($hid == null) or (any($ip[]?; .id? == $hid) | not)
     then .head = {
       "active_task_id": "FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION",
       "status": "in_progress",
       "next_agent": "ba",
       "dispatched_at": $now,
       "dispatched_by": "po-s111",
       "note": "S2 DATA-HONESTY lead. ba->architect->pm->dev-mcp-server->qa. Macro-delta fix (dev-macro-indicators) queued in ready[] behind it."
     }
     else . end)
