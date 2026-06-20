# po-s110-fb-gate-prose-hardening-epic-mint.jq
#
# Single-pass EPIC-MINT triage (idempotent): mints the follow-on hardening epic
# AUDIT-FB-GATE-PROSE-HARDENING (6 tasks, one per router-handoff lesson) that
# EXTENDS the already-done FIX-FB-POST-DATA-INTEGRITY-GATE. The done gate catches
# per-ticker number fabrication (Checks A-D); these 6 close the prose/semantic
# defect class that slipped past it every day this week (15-21/6) and was caught
# only by router manual review.
#
# DISPATCH MODEL (WIP=0, ready=0 at mint time):
#   - LEAD task (sector/name validator, the highest-frequency observed defect:
#     06-18 HPG/FPT->"ngân hàng", 06-17 VNM->"Nestlé") -> ready[] as the head of
#     ready[], status=READY, next_agent=developer so the dev-team router can
#     lock-claim+spawn it. PO does NOT spawn.
#   - The remaining 4 gate-check tasks -> backlog[] status=BACKLOG (developer zone).
#   - The calibration-loop task -> backlog[] status=BACKLOG (agent-father +
#     digest-predict zones; flow-doc work, not a gate-check).
#
# Idempotent: every mint id-guarded against ALL board lanes (re-run mints 0).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s110-fb-gate-prose-hardening-epic-mint.jq \
#      docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> conservation -> rename;
#    commit orch-state by EXPLICIT PATH; PUSH HELD — PO out-of-band)

def all_ids:
  [ .task_board | to_entries[] | .value
    | if type=="array" then .[] else empty end
    | if type=="object" then .id else empty end
    | select(. != null) ];

. as $root
| ($root | all_ids) as $existing

# ── Task specs ────────────────────────────────────────────────────────────────
| {
    lead: {
      id: "FIX-FB-GATE-SECTOR-NAME-VALIDATOR",
      title: "fb-gate Check-E: sector/company-name validator keyed on system-map.json",
      type: "FIX",
      status: "READY",
      priority: "P2",
      epic: "AUDIT-FB-GATE-PROSE-HARDENING",
      lesson: "L1 (06-18 HPG/FPT mislabeled ngân hàng; 06-17 VNM called Nestlé)",
      zone: "cross-service/",
      dev_agent: "developer",
      next_agent: "developer",
      files: ["scripts/fb-data-integrity-gate.sh", "docs/data/system-map.json (read-only SSOT)", "docs/agents/fb-market-poster/flow/main.md (STEP 4b pointer)"],
      desc: "For EVERY ticker mentioned in the post, load its canonical sector + company name from docs/data/system-map.json (SSOT — never hardcode). BLOCK when an adjacent sector word in the prose contradicts the SSOT sector (e.g. HPG/'thép' tagged 'ngân hàng', FPT/'công nghệ' tagged 'ngân hàng'), and BLOCK known company-name mismatches (VNM=Vinamilk, not Nestlé). Add as Check-E in the gate; thresholds/SSOT-key list live only in the gate header.",
      generic_mandate: "Validator iterates the FULL watchlist from system-map.json — never a hardcoded ticker subset; new tickers/sectors inherit the check automatically.",
      verification_gate: "Inject a post body with HPG labeled 'ngân hàng' AND one with VNM='Nestlé' -> gate exits non-zero (BLOCK) on both; a correct sector/name post exits 0.",
      size: "S",
      rebuild_required: false
    },
    checks: [
      {
        id: "FIX-FB-GATE-POINT-PCT-MATH",
        title: "fb-gate Check-F: point-change vs percent math consistency",
        type: "FIX",
        status: "BACKLOG",
        priority: "P2",
        epic: "AUDIT-FB-GATE-PROSE-HARDENING",
        lesson: "L2 (06-19 'giảm 0,32 điểm (−0,32%)' — should be ≈ −5,9 điểm)",
        zone: "cross-service/",
        dev_agent: "developer",
        files: ["scripts/fb-data-integrity-gate.sh"],
        desc: "Gate check that |stated_point_change − pct × prev_close| is within tolerance. prev_close from the live snapshot / get_price_history. Parse both the point delta ('giảm X điểm') and the % from the post; BLOCK when they are internally inconsistent beyond a pp/points tolerance defined in the gate header.",
        generic_mandate: "Applies to VN-Index and any index/level the post states with BOTH a point delta and a %.",
        verification_gate: "Inject '−0,32 điểm (−0,32%)' at a ~1800 prev_close -> BLOCK; inject a consistent '−5,9 điểm (−0,32%)' -> pass.",
        size: "S",
        rebuild_required: false
      },
      {
        id: "FIX-FB-GATE-STALE-MACRO-GUARD",
        title: "fb-gate Check-G: reject stale macro/FX presented as current + unverified comparison levels",
        type: "FIX",
        status: "BACKLOG",
        priority: "P2",
        epic: "AUDIT-FB-GATE-PROSE-HARDENING",
        lesson: "L3 (06-19 USD/VND '26.103' carried stale; 06-21 unverified '25.500' prior level)",
        zone: "cross-service/",
        dev_agent: "developer",
        files: ["scripts/fb-data-integrity-gate.sh", "docs/agents/fb-market-poster/flow/main.md (STEP 1b macro fetch)"],
        desc: "Any macro figure (USD/VND, gold, Brent, Fed rate, bond yield) in the post MUST be fetched live THIS cycle or written as an honest gap. Gate/flow rejects stale-as-current (figure present but no live fetch this cycle) and rejects unverified comparison levels ('vẫn ở mức X', 'từ mức Y'). Pair with a flow-side change so the poster passes a per-figure fetched-this-cycle provenance marker the gate can verify.",
        generic_mandate: "Covers every macro/FX class, not just USD/VND; provenance check is per-figure, generic.",
        verification_gate: "Inject a USD/VND figure with no live-fetch provenance -> BLOCK; inject an honest-gap phrasing -> pass; inject a figure fetched this cycle -> pass.",
        size: "M",
        rebuild_required: false
      },
      {
        id: "FIX-FB-GATE-BREADTH-PCT-INTERNAL",
        title: "fb-gate Check-H: internal breadth-% vs cited-counts consistency",
        type: "FIX",
        status: "BACKLOG",
        priority: "P2",
        epic: "AUDIT-FB-GATE-PROSE-HARDENING",
        lesson: "L4 (06-19 'độ rộng khoảng 40%' while citing 25% = 81 of ~350)",
        zone: "cross-service/",
        dev_agent: "developer",
        files: ["scripts/fb-data-integrity-gate.sh"],
        desc: "Gate check that any stated advancer/decliner breadth % matches the cited counts within tolerance: |stated_pct − (advancers / total)| <= tol. Parse both the headline breadth % and any 'N của ~M' counts in the post; BLOCK on internal inconsistency.",
        generic_mandate: "Generic over any breadth phrasing (advancers/decliners/floor/ceiling counts vs %).",
        verification_gate: "Inject 'độ rộng ~40%' + '81 của ~350' -> BLOCK (real ~23%); inject matching pct+counts -> pass.",
        size: "S",
        rebuild_required: false
      },
      {
        id: "FIX-FB-GATE-WEEKLY-FRAME-MODE",
        title: "fb-gate weekly/temporal-frame mode: compare weekly posts vs weekly close series; scope Check-C to claim period",
        type: "FIX",
        status: "BACKLOG",
        priority: "P2",
        epic: "AUDIT-FB-GATE-PROSE-HARDENING",
        lesson: "L5 (06-21 weekly +1,84% w/w FALSE-BLOCKED vs latest daily −0,32%; Check-C false-flagged correct last-week 'bán tháo')",
        zone: "cross-service/",
        dev_agent: "developer",
        files: ["scripts/fb-data-integrity-gate.sh", "docs/agents/fb-market-poster/flow/main.md", "docs/agents/digest-predict/flow/weekly.md (weekly post caller)"],
        desc: "Add a weekly/frame-aware mode to the gate (flag/arg, e.g. --frame=weekly). In weekly mode, compare stated index moves against the WEEKLY close series via get_price_history (NOT the latest daily snapshot), and SCOPE Check-C's selloff-language check to the PERIOD the claim references (so 'bán tháo' describing last week's real crash is not flagged against this week's mild daily). Until shipped, weekly posts require manual router override — document that in the gate header + poster/weekly flow.",
        generic_mandate: "Frame mode generic to any period (daily/weekly/monthly); period is an explicit input, not inferred from today's date alone.",
        verification_gate: "Run the 06-21 weekly post body in weekly mode -> exits 0 (no false-block); same body in daily mode still blocks; Check-C scoped to last-week period does not flag a correct historical-crash sentence.",
        size: "M",
        rebuild_required: false
      }
    ],
    calibration: {
      id: "FIX-FB-PREDICTION-CALIBRATION-LOOP",
      title: "Auto prediction-calibration loop: poster logs forward calls; digest-predict weekly auto-scores hit/miss into a ledger",
      type: "FIX",
      status: "BACKLOG",
      priority: "P2",
      epic: "AUDIT-FB-GATE-PROSE-HARDENING",
      lesson: "L6 (no auto-scoring; this week manual scorecard 16/6 HIT, 17/6 PARTIAL MISS, 18/6 HIT)",
      zone: "agent",
      dev_agent: "agent-father",
      next_agent: "agent-father",
      files: ["docs/agents/fb-market-poster/flow/main.md (log each forward call)", "docs/agents/digest-predict/flow/weekly.md (Sunday calibration step — already owns weekly calibration, line ~49-52)", "calibration ledger (new — path per architect/agent-father design)"],
      desc: "Wire the daily FB poster to LOG each forward call (the explicit next-session prediction it makes) into a calibration ledger. Add a calibration step to digest-predict weekly (which already owns Sunday calibration) that auto-scores each logged forward call hit/miss/partial against the actual outcome and writes it to the ledger, feeding it back. NOTE: this is flow/agent-definition work (agent-father owns agent .md edits per the agent-md factory rule) touching TWO agents — route via agent-father with digest-predict as the calibration-owner; an architect brief may be warranted given the cross-agent ledger contract.",
      generic_mandate: "Ledger schema generic over any forward-call type (index direction, per-ticker conviction, range); scoring is data-driven, not hardcoded to specific tickers.",
      verification_gate: "After one daily post + one weekly run on real data, the ledger contains the day's forward call AND a hit/miss/partial verdict scored from the actual close; weekly digest surfaces the rolling accuracy.",
      size: "M",
      rebuild_required: false
    }
  } as $spec

# ── Build mint lists (id-guarded) ─────────────────────────────────────────────
| ([ $spec.lead ] | map(select(.id as $i | ($existing | index($i)) == null))) as $ready_mints
| ((($spec.checks) + [$spec.calibration]) | map(select(.id as $i | ($existing | index($i)) == null))) as $backlog_mints

# stamp common fields
| ($ready_mints   | map(. + {minted_at: $now, minted_by: "po-s110", promoted_at: $now})) as $ready_mints
| ($backlog_mints | map(. + {minted_at: $now, minted_by: "po-s110"})) as $backlog_mints

| ($root.task_board.ready   | length) as $pre_ready
| ($root.task_board.backlog | length) as $pre_backlog

| .task_board.ready   = ($root.task_board.ready   + $ready_mints)
| .task_board.backlog = ($root.task_board.backlog + $backlog_mints)

# ── Conservation guard ────────────────────────────────────────────────────────
| if (.task_board.ready | length)   != ($pre_ready   + ($ready_mints   | length))
  then error("CONSERVATION FAIL ready") else . end
| if (.task_board.backlog | length) != ($pre_backlog + ($backlog_mints | length))
  then error("CONSERVATION FAIL backlog") else . end

| .task_board.updated_at = $now
| .task_board.updated_by = "po-s110"
