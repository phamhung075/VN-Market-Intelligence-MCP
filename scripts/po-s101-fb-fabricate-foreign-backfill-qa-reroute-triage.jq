# po-s101 — single-pass FB-fabrication + foreign-backfill mint + QA-reroute triage
#
# Origin 2026-06-17: router handoff from the rejected FB-post session. Three
# confirmed problems triaged in one atomic pass:
#   M1 MINT two FIX tasks for Problem-1 (fb-market-poster fabricates per-ticker
#      data when CHEF EOD is stale): a P1 FLOW fix (agent-father — HARD-REQUIRE
#      live get_market_snapshot per-ticker recap spine + fail-loud honest gap)
#      and a P1 GATE fix (cross-service — data-integrity/plausibility gate:
#      reject >±7% HOSE moves + selloff-vs-same-session-breadth contradiction).
#      Flow fix -> ready[] (leads). Gate fix -> ready[] (sequenced, both small).
#   M2 MINT one P1 backfill/recompute FIX for Problem-2 (residual foreign-flow
#      historical-row contamination 06-14..16 NOT covered by the writer-root
#      FIX-FOREIGN-FLOW-INTEGRITY-BREAK) -> backlog (HELD until the writer fix
#      is QA-signed, so the recompute reads a fixed writer).
#   M3 REROUTE the 3 review[] rows (FIX-FOREIGN-FLOW-INTEGRITY-BREAK,
#      FIX-MARKET-BREADTH-MISSING, FIX-MARKET-LIQUIDITY-MISSING-TOOL) from
#      next_agent=ops-vps-fetch -> next_agent=qa (the carryover QA hop), in-place,
#      annotating each with the QA mandate (vs named-volume DB + CI-RED disjoint
#      + flag residual contamination). Stay in review[] — lane unchanged.
#   M4 ACK the 2 NEW signal_queue rows NEW->READ (both out-of-scope of this
#      handoff: BCTC B-13 staleness already tracked; A-30 host-mem transient WARN).
#
# Idempotent: mints id-guarded across ALL board arrays; reroute guarded by
# current next_agent==ops-vps-fetch; signal-ack guarded by status==NEW.
#
# Harness asserts (in calling shell): CONSERVATION (ready +2, backlog +1,
# review length byte-stable [in-place edits], in_progress/done/done_verified
# byte-stable, total += 3) + reroute-applied (3 rows now next_agent=qa) +
# signal NEW count -2 + IDEMPOTENCY re-run (delta 0).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s101-fb-fabricate-foreign-backfill-qa-reroute-triage.jq \
#      docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> conservation -> rename;
#    commit orch-state by EXPLICIT PATH; PUSH HELD — PO out-of-band.)

# --- ids present anywhere on the board? ---
def has_id($id):
  [ .task_board | (.. | objects | .id? // empty) ] | index($id) != null;

# --- the new task objects ---
def t_flow:
  {
    id: "FIX-FB-POSTER-FABRICATES-STALE-EOD",
    title: "fb-market-poster fabricates per-ticker data when CHEF EOD is stale",
    status: "READY",
    type: "FIX",
    priority: "P1",
    zone: "agent",
    next_agent: "agent-father",
    size: "S",
    blocking: false,
    origin: "router-handoff 2026-06-17 — two rejected FB drafts invented a real-estate selloff (VIC -6.6/VHM -8.5/VRE -9.4%); VRE/VHM exceed HOSE +/-7% daily limit = physically impossible = pure hallucination. Live truth: VIC -1.03/VHM -1.10/VRE -1.75%, balanced breadth 168up/129dn 0-floor.",
    root_cause: "When CHEF EOD synthesis is blocked/stale, fb-market-poster flow falls back to stale CHEF morning (05:16Z) data and FILLS GAPS WITH FABRICATION instead of fetching live or writing honest gaps — even though get_market_snapshot/get_market_breadth/get_foreign_flow are live & clean.",
    fix_spec: "fb-market-poster flow (via agent-father, agent-md-factory) MUST HARD-REQUIRE a live get_market_snapshot(codes=[watchlist movers]) per-ticker fetch for the recap spine — NOT the CHEF shortcut — and FAIL-LOUD to an honest gap when a number cannot be fetched live. Never synthesize a per-ticker move from stale CHEF synthesis.",
    generic_mandate: "Applies to EVERY per-ticker number in the recap spine, not just real-estate; honest-gap path must be exercised, not prose-filled.",
    verification_gate: "RAW: with CHEF EOD deliberately stale, the next fb-poster draft either quotes live get_market_snapshot per-ticker numbers (matching the tool) OR writes an explicit honest gap — and NEVER emits a fabricated/out-of-band per-ticker move.",
    memory_ref: "feedback_fb_poster_fabricates_when_data_thin",
    created: $now, created_by: "po", source: "router-handoff-2026-06-17-fb-session"
  };

def t_gate:
  {
    id: "FIX-FB-POST-DATA-INTEGRITY-GATE",
    title: "FB-post data-integrity / plausibility gate (jargon-gate is necessary-not-sufficient)",
    status: "READY",
    type: "FIX",
    priority: "P1",
    zone: "cross-service",
    next_agent: "developer",
    size: "S",
    blocking: false,
    sequence_after: "FIX-FB-POSTER-FABRICATES-STALE-EOD",
    origin: "router-handoff 2026-06-17 — fb-jargon-gate PASSed both fabricated drafts; it checks jargon only, never data integrity/hallucination.",
    fix_spec: "Add a router/agent-side plausibility gate (reusable script in scripts/, pointer in fb-market-poster flow + dev-standards Script Persistence): REJECT any per-ticker move beyond +/-7% on HOSE (above the daily price limit = impossible); REJECT any mover claim contradicting same-session breadth (e.g. 'selloff' narrative vs 0-floor / net-positive advancers). Gate runs BEFORE relay; exits non-zero on violation.",
    generic_mandate: "Gate is generic across ALL tickers and ALL FB drafts, not a one-off VIC/VHM/VRE patch. Must FAIL-LOUD (non-zero exit on BLOCK — avoid the known fb-jargon-gate exit-0-on-block trap, see feedback_fb_poster_gate_false_green).",
    verification_gate: "RAW: feed the gate the two rejected 06-17 drafts -> BLOCK (non-zero); feed the live-verified clean draft -> PASS. Inject a +8% HOSE move and a selloff-vs-net-positive-breadth claim -> both BLOCK.",
    memory_ref: "feedback_fb_poster_fabricates_when_data_thin, feedback_fb_poster_gate_false_green",
    created: $now, created_by: "po", source: "router-handoff-2026-06-17-fb-session"
  };

def t_backfill:
  {
    id: "FIX-FOREIGN-FLOW-BACKFILL-CONTAM-0614-0616",
    title: "Backfill/recompute contaminated foreign-flow rows 06-14..16 (residue not covered by writer-root fix)",
    status: "HELD",
    type: "FIX",
    priority: "P1",
    zone: "apps/mcp-server/",
    next_agent: "dev-mcp-server",
    size: "S",
    blocking: false,
    depends: ["FIX-FOREIGN-FLOW-INTEGRITY-BREAK"],
    hold_reason: "Recompute must read a FIXED writer — held until FIX-FOREIGN-FLOW-INTEGRITY-BREAK is QA-signed (done_verified), else backfill re-contaminates.",
    origin: "router-handoff 2026-06-17 — the P0 foreign-flow integrity fix (ddc36452/570ebedb/b24a0b6a/eff492d7) stops NEW clobbering but did NOT backfill already-contaminated rows. Live get_foreign_flow(VIC) still shows 06-14..16 at cumulative scale (217-239M net vol, holding 2.82-3.11%) while 06-17 is correct (-1.15M, room 347M).",
    fix_spec: "Backfill/recompute the contaminated 06-14..16 foreign-flow window (Net-Vol-daily, Holding Ratio, Room) for affected codes to the corrected daily-not-cumulative semantics, or NULL/is_estimate-flag where no real source exists. Recompute-on-read preferred over destructive backfill where feasible (see feedback_derived_column_fix_needs_reflow).",
    generic_mandate: "All codes in the contaminated window, not just VIC; verify the regime boundary (~06-12/06-13) is the only break and 06-17 stays correct.",
    verification_gate: "RAW: get_foreign_flow(VIC) + 2 more codes show 06-14..16 at plausible DAILY scale (continuous with 06-17 -1.15M, not 217-239M cumulative), holding ratio either real-sourced or NULL/is_estimate-flagged; no overnight regime discontinuity remains.",
    memory_ref: "feedback_derived_column_fix_needs_reflow, feedback_nonzero_values_need_plausibility_check",
    created: $now, created_by: "po", source: "router-handoff-2026-06-17-fb-session"
  };

# QA reroute note
def qa_note:
  "ROUTER-HANDOFF 2026-06-17: rerouted next_agent ops-vps-fetch->qa (carryover QA hop). QA: verify LIVE vs named-volume market.db (real varied data, not constant); confirm the standing CI-RED set (~63 fails) is DISJOINT from this fix's changed files (regression-vs-weather, see feedback_ci_red_can_be_flaky); flag residual foreign-flow contamination 06-14..16 -> tracked in FIX-FOREIGN-FLOW-BACKFILL-CONTAM-0614-0616.";

# === apply ===
.task_board.ready = (
  .task_board.ready
  + (if has_id("FIX-FB-POSTER-FABRICATES-STALE-EOD") then [] else [t_flow] end)
  + (if has_id("FIX-FB-POST-DATA-INTEGRITY-GATE")     then [] else [t_gate] end)
)
| .task_board.backlog = (
    .task_board.backlog
    + (if has_id("FIX-FOREIGN-FLOW-BACKFILL-CONTAM-0614-0616") then [] else [t_backfill] end)
  )
# M3 reroute the 3 review rows ops-vps-fetch -> qa, in place
| .task_board.review = (
    .task_board.review | map(
      if ((.id // "") | test("^(FIX-FOREIGN-FLOW-INTEGRITY-BREAK|FIX-MARKET-BREADTH-MISSING|FIX-MARKET-LIQUIDITY-MISSING-TOOL)$"))
         and (.next_agent == "ops-vps-fetch")
      then .next_agent = "qa" | .qa_reroute_note = qa_note | .updated_at = $now
      else . end
    )
  )
# M4 ack the 2 NEW signals NEW->READ
| (.signal_queue.rows) |= (
    map(
      if ((.id // "") | test("^(sau-2026-06-17T10-32-50Z-B13|sau-a30-202606171045)$")) and (.status == "NEW")
      then .status = "READ"
           | .po_disposition = "out-of-scope of FB-session handoff: B-13 BCTC staleness already tracked; A-30 host-mem transient WARN (no action)."
           | .read_at = $now
      else . end
    )
  )
| .meta.updated_at = $now
| .meta.updated_by = "po"
