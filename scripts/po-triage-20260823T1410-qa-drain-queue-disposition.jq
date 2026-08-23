# po-triage-20260823T1410-qa-drain-queue-disposition.jq
#
# PO disposition of the two rows qa handed back as next_agent=po after the
# 2026-08-23 review-lane drain (commit 8199e6023), plus the three follow-ups
# that drain endorsed but never minted.
#
# Owning flow doc: docs/agents/po/flow/main.md (§ Reusable triage scripts —
# ALL board writes pipe through scripts/orch-apply.sh, never a raw rename).
#
# Call:
#   jq -f scripts/po-triage-20260823T1410-qa-drain-queue-disposition.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Mutations (6):
#   M1 review[]      RAG-FTS-BUILD-MEMORY-BOUND        — ruling, still WITHHELD
#   M2 backlog[]     + RAG-FTS-AC2-PEAKMEM-WALLCLOCK-MEASURE (the AC#2 split the
#                      08:20Z drain said "DISPATCH IT" and then never minted)
#   M3 in_progress[] FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58 — children[] back-fill
#                      + ruling refuting qa's two factual premises
#   M4 ready[]       TASK_003 — next_agent/owner generic-developer -> developer
#                      ("generic-developer" is not an agent: no docs/agents/ dir,
#                       absent from the dispatch table -> unspawnable READY row)
#   M5 backlog[]     + FIX-QA-VC-ACTUATOR-NO-REGRESSION-FIXTURES (AC-4/AC-5 of
#                      FIX-QA-VC-LANEMOVE-*, explicitly outside agent-father's zone)
#   M6 backlog[]     + FEAT-COWORK-WRITE-LAST-FIRED-DESTAMP-MODE

"2026-08-23T14:10:00Z" as $NOW
| "po/qa-drain-disposition-20260823T1410Z" as $BY

# ---------------------------------------------------------------- M1
| (.task_board.review[] | select(.id == "RAG-FTS-BUILD-MEMORY-BOUND")) |=
  ( .next_agent = "po"
  | .updated_at = $NOW
  | .updated_by = $BY
  | .related = ["RAG-FTS-AC2-PEAKMEM-WALLCLOCK-MEASURE", "FU-RAG-DEPLOY-MEMORY", "FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED"]
  | del(.po_secondary_drain_20260823T0820Z)
  | .po_ruling_20260823T1410Z = (
      "[po RULING 2026-08-23T14:10Z] qa's HOLD is UPHELD. done_verified STILL WITHHELD; stays review[]; AC#1 time-gate unchanged at 2026-09-20. Supersedes po_secondary_drain_20260823T0820Z (deleted here, superseded not lost — its evidence is in detail_ref .po_secondary_drain_20260823T0818Z).\n\n"
      + "(1) THE 08:20Z DRAIN'S 'AC#2 - DISPATCH IT' WAS NARRATED AND NEVER MINTED. po re-scanned every lane this tick: zero rows carry an AC#2 measurement scope, and this row's own next_agent stayed po. Six hours of prose that actuated nothing. FIXED here by minting RAG-FTS-AC2-PEAKMEM-WALLCLOCK-MEASURE as a real row, not by restating the intent a second time.\n\n"
      + "(2) BUT THAT DRAIN ALSO UNDER-QUALIFIED THE DISPATCH, so the new row ships BLOCKED, not READY. AC#2 requires POST /admin/rebuild-fts on the live container - a deliberate memory stress. TWO sibling rows hold UNCERTIFIED durability windows on that same container right now: FU-RAG-DEPLOY-MEMORY (qa[], next=qa) and FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED (qa[], blocked_by FU-RAG-DEPLOY-MEMORY). Stressing it today contaminates both. This is the same contamination argument po already made on 2026-08-15 (po_timegate_recheck_20260815, detail_ref) and the 08:20Z drain simply did not carry it forward. NOTE for whoever picks the sibling rows up: qa's own certification floor on them is a >=24h window opened after 2026-08-22T12:40Z; at this tick (2026-08-23T14:03Z) that floor has MATURED (+25.4h) - it was ~20h and 'too early' when qa last looked at 08:4xZ. Neither row is certified yet, so the block stands, but it is now liftable rather than waiting on wall-clock.\n\n"
      + "(3) AC TEXT WAS STALE FOR THE THIRD TIME - FIXED AT THE ROOT, NOT RE-PINNED. RAW this tick: docker inspect vn-market-intelligence-mcp-rag-service-1 HostConfig.Memory = 2147483648 = 2 GiB; docker stats = 1.461GiB / 2GiB = 73.03% idle, so ~552MiB headroom (vs ~165MiB on 08-15). AC#1/test_plan said 768m, the 08-15 pass corrected them to 1g, and both were wrong again within 8 days. Re-typing '2g' would guarantee a fourth staleness, so the AC has instead been made CAP-AGNOSTIC in docs/data/orch/archive/backlog-detail.json: it now reads the live ceiling from docker inspect at verification time. That closes the class; the fix requirement (corpus-size-INDEPENDENT memory) is untouched.\n\n"
      + "(4) HARD GUARD CARRIED FORWARD VERBATIM: an AC#2 green is NOT an AC#1 green. This row already produced that exact false green once, certified at a 116-row corpus. Corpus is 32184 rows as of 2026-08-23T08:03Z against a ~56k failure scale."
    )
  | .status_note = "[po 2026-08-23T14:10Z] HELD, not certified - see po_ruling_20260823T1410Z. qa was right to refuse: certifying here would have reproduced this row's own documented false green. AC#2 split out as its own BLOCKED row (RAG-FTS-AC2-PEAKMEM-WALLCLOCK-MEASURE); AC#1 stays time-gated to 2026-09-20; AC cap figure de-hardcoded in detail_ref. Nothing here is dispatchable this tick."
  )

# ---------------------------------------------------------------- M2
| .task_board.backlog += [{
    id: "RAG-FTS-AC2-PEAKMEM-WALLCLOCK-MEASURE",
    type: "FIX",
    size: "S",
    priority: "P1",
    status: "BLOCKED",
    zone: "apps/rag-service/",
    owner: "ops",
    next_agent: "ops",
    sprint: "FLOW-PRICE-ALPHA-LOOP",
    parent_task_id: "RAG-FTS-BUILD-MEMORY-BOUND",
    blocked_by: ["FU-RAG-DEPLOY-MEMORY"],
    created_at: $NOW,
    created_by: $BY,
    updated_at: $NOW,
    updated_by: $BY,
    baseline_pass: true,
    title: "Measure + report the peak memory and wall-clock of ONE live POST /admin/rebuild-fts on rag-service at the current corpus (AC#2 of RAG-FTS-BUILD-MEMORY-BOUND, split out so it stops waiting on AC#1's 2026-09-20 corpus time-gate)",
    note: (
      "SPLIT OUT OF RAG-FTS-BUILD-MEMORY-BOUND by po 2026-08-23T14:10Z. That parent row bundles two ACs with completely different gating: AC#1 (no-OOM at ~56k rows) cannot be answered until the corpus grows and is time-gated to 2026-09-20; AC#2 (report the rebuild's peak-mem + wall-clock) is answerable at ANY corpus size and its NUMBER is what ALPHA-S2-RAG-FTS-REBUILD-CRON needs to retune its deadline. Bundled, AC#2 inherited a month-long wait it never needed.\n\n"
      + "WHY THIS IS BLOCKED AND NOT READY: the measurement IS a deliberate memory stress of the live rag-service container, and two sibling rows currently hold UNCERTIFIED durability windows on that exact container - FU-RAG-DEPLOY-MEMORY (qa[]) and FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED (qa[], itself blocked_by FU-RAG-DEPLOY-MEMORY). Running a rebuild now would contaminate both and could re-void a window that has already been voided twice. UNBLOCK CONDITION, machine-checkable: FU-RAG-DEPLOY-MEMORY reaches DONE_VERIFIED. qa's certification floor on it (a >=24h clean window opened after 2026-08-22T12:40Z) MATURED at ~2026-08-23T12:40Z, so this is a near-term unblock, not a wall-clock hold.\n\n"
      + "LIVE BASELINE, RAW-measured by po 2026-08-23T14:03Z (do not re-derive from the parent's stale prose): container vn-market-intelligence-mcp-rag-service-1, uptime 8d, HostConfig.Memory=2147483648 (2 GiB - NOT the 768m or 1g that the parent's AC text has claimed at various points), idle usage 1.461GiB = 73.03%, headroom ~552MiB. Corpus 32184 rows @ 2026-08-23T08:03Z.\n\n"
      + "ACCEPTANCE:\n"
      + "  1. ONE POST /admin/rebuild-fts against the live container returns {status:ok}, with a docker-stats trace sampled at <=5s intervals for the full duration.\n"
      + "  2. Report BOTH numbers explicitly: peak memory in MiB AND as a percentage of the ceiling read live at run time via `docker inspect <container> --format '{{.HostConfig.Memory}}'` - never against a hardcoded cap figure, which is how the parent's AC went stale three times.\n"
      + "  3. Report wall-clock elapsed, and record the corpus row count (GET :5002/embed/health index_size) at the moment of the run - a peak-mem number is meaningless without the corpus size it was measured at.\n"
      + "  4. Hand the pair to ALPHA-S2-RAG-FTS-REBUILD-CRON for its deadline retune.\n"
      + "  5. State in the report, verbatim, that this result does NOT satisfy the parent's AC#1: AC#1 names ~56k rows and this run is at ~32k. The parent has already produced one false green from exactly this conflation (certified at 116 rows).\n\n"
      + "OUT OF SCOPE: raising the memory cap (FU-RAG-DEPLOY-MEMORY), the lance-core OOM root cause (FIX-RAG-LANCECORE-OOM-PERSISTS-AFTER-THREADPIN-DEPLOYED), disk amplification (FIX-RAG-COMPACTION-DISK-AMPLIFICATION). Measure and report only - if the rebuild OOMs, that is a finding to escalate, not a mandate to mitigate."
    )
  }]

# ---------------------------------------------------------------- M3
| (.task_board.in_progress[] | select(.id == "FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58")) |=
  ( .children = ["TASK_001-WATCHLIST-WRITE-THROUGH-INFRA", "TASK_002-WATCHLIST-DIVERGENCE-AUDIT-CRON", "TASK_003-DOMAIN-MODEL-WATCHLIST-COUNT-FIX"]
  | .next_agent = "po"
  | .updated_at = $NOW
  | .updated_by = $BY
  | .po_ruling_20260823T1410Z = (
      "[po RULING 2026-08-23T14:10Z] qa returned this as 'NOT VERIFIABLE'. The REFUSAL was correct - this is not qa work - but BOTH factual premises qa attached to it are wrong, and po is recording that rather than inheriting them.\n\n"
      + "PREMISE 1 REFUTED - 'the defect is still live (system-map .project.watchlist is still 34 entries against the 58-ticker runtime roster, re-measured this cycle)'. There is no 58-ticker runtime roster. po measured BOTH planes this tick, 2026-08-23T14:0xZ: mcp__gateway__call_tool(server=vn-market, tool=get_watchlist) returns 34 tickers; jq '[.project.watchlist[].ticker]' docs/data/system-map.json returns 34; the two sets are IDENTICAL, zero diff in either direction. qa appears to have re-measured only the file and taken '58' from this row's TITLE, which the row's own po_rescope_note (2026-08-22, gateway-verified) and architect_review_note (2026-08-14, docker exec + bun:sqlite) already refuted independently. This tick is the fourth confirmation by the third method. AC-1 as written (SET EQUALITY, deliberately not the number 58) is SATISFIED TODAY.\n\n"
      + "PREMISE 2 REFUTED - 'it sits in in_progress[] consuming a WIP slot'. It does not. scripts/lib/devteam-eligibility.jq:115-118 defines wip_in_progress as in_progress[] rows whose status is NEITHER terminal NOR BLOCKED; this row is BLOCKED, so it is excluded by construction. Measured live: wip_in_progress = 1 (only FIX-COWORK-PUBLISHED-MARKER-TTL-28H-EXCEEDS-24H-DAILY-CADENCE, which is genuinely IN_PROGRESS). UC-CDC-P1 is excluded the same way. There is no WIP pressure to relieve here, so the 'close it or move it' urgency does not apply.\n\n"
      + "NO LANE MOVE - and this is a guard interaction, not inertia. Moving this row to backlog[] hard-rejects: scripts/orch-row-prose-ceiling-check.mjs:105 scopes PROSE_CEILING_LANES to [backlog, ready, review] only, so an in_progress[] source row is invisible to the live-side lookup (liveBytes=0), and this row's ~17.9kB of prose lands as net-new growth past the 12000B ceiling. It stays in place until FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS (D3, ready[]) ships. BLOCKED status alone already delivers the outcome a move would have bought.\n\n"
      + "WHAT WAS ACTUALLY ACTIONABLE, AND IS NOW DONE: qa's SECONDARY finding was the real one. children[] was absent despite a completed decomposition - back-filled in this same write with the three child ids, so effective_children sweeps see the relationship from the parent side. Partial mitigation already existed and qa did not mention it: all three children carry parent_task_id=FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58, so the child->parent edge was never lost, only the parent->child one.\n\n"
      + "WHY THE PARENT IS NOT CLOSED even though AC-1 passes today: AC-3 is the negative control - 'add a ticker to the runtime watchlist, then demonstrate the divergence is CAUGHT'. Nothing catches it today. add_to_watchlist still writes SQLite with zero write-back to system-map.json, and there is no audit. Today's zero-diff is a coincidence of a 2026-07-31 bulk reseed, not a mechanism. Closing on AC-1 alone would ratify exactly the drift that SPIKE_1946 already cost one missed crisis detection. The parent stays open until TASK_001 (write-through) and TASK_002 (divergence audit) land.\n\n"
      + "SIDE FINDING FROM THE PRIOR RULING, NOW CLOSED: the three TASK_00x handoff specs were untracked in git. They were committed at fe7e4c790 and are in HEAD. No action needed.\n\n"
      + "SIDE FINDING FIXED IN THIS SAME WRITE: TASK_003 carried owner/next_agent='generic-developer'. No such agent exists - no docs/agents/generic-developer/ directory, absent from .claude/skills/dispatch/SKILL.md, one single occurrence on the entire board. A READY row pointing at a non-existent agent is unspawnable. Corrected to 'developer'."
    )
  | .status_note = "[po 2026-08-23T14:10Z] Stays BLOCKED in in_progress[], next_agent=po, awaiting its three children (now linked in children[]). qa's refusal to verify was correct; qa's two supporting claims - defect-still-live and WIP-slot-consumed - were both measured false this tick and are refuted field-by-field in po_ruling_20260823T1410Z. Do NOT re-present this to qa until TASK_001 and TASK_002 are DONE_VERIFIED; at that point the parent needs AC-1..AC-4 sign-off, and AC-3 (the negative control) is the one that decides it."
  )

# ---------------------------------------------------------------- M4
| (.task_board.ready[] | select(.id == "TASK_003-DOMAIN-MODEL-WATCHLIST-COUNT-FIX")) |=
  ( .owner = "developer"
  | .next_agent = "developer"
  | .updated_at = $NOW
  | .updated_by = $BY
  )

# ---------------------------------------------------------------- M5
| .task_board.backlog += [{
    id: "FIX-QA-VC-ACTUATOR-NO-REGRESSION-FIXTURES",
    type: "FIX",
    size: "S",
    priority: "P1",
    status: "BLOCKED",
    zone: "cross-service/",
    owner: "developer",
    next_agent: "developer",
    sprint: "COWORK-RELIABILITY",
    blocked_by: ["FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR"],
    created_at: $NOW,
    created_by: $BY,
    updated_at: $NOW,
    updated_by: $BY,
    baseline_pass: true,
    title: "Regression verifier + fixtures for qa's vc-approved / vc-changes orch-apply actuators (AC-4 + AC-5 of FIX-QA-VC-LANEMOVE-*, orphaned because scripts/ is outside agent-father's commit_zone)",
    note: (
      "MINTED by po 2026-08-23T14:10Z. This is AC-4 (regression verifier) + AC-5 (fixtures) of FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR. agents-architect explicitly carved them out of that row because docs/agents/agent-father/init.md excludes scripts/ from agent-father's commit_zone - the same split agent-father already made on the FIX-PO-BATCH-MINT-NO-WRITE-ACTUATOR precedent (commit 3ce726a6e). Without an owning row that half evaporates, exactly as the AC#2 half of RAG-FTS-BUILD-MEMORY-BOUND did.\n\n"
      + "THE ARGUMENT FOR BUILDING IT, which is stronger than 'more test coverage': qa found TWO blockers in the actuator patch during pre-ship review. A fixture that feeds the actuator's own output to scripts/orch-validate.mjs and asserts exit 0 would have caught BOTH before ship. That is not a hypothetical - it is a measured hit rate of 2/2 on the one change this guard would have covered.\n\n"
      + "SCOPE: the two verdict paths at docs/agents/qa/flow/main.md :189 (vc-approved, qa[] -> done_verified[]) and :198 (vc-changes, qa[] -> review[] + redispatch_count += 1 + route to row owner).\n\n"
      + "ACCEPTANCE:\n"
      + "  1. Fixtures: a minimal orch-state document per verdict path, small enough to read in one screen, committed under scripts/ (or scripts/fixtures/) - NOT /tmp.\n"
      + "  2. The verifier applies each actuator's jq to its fixture and asserts the RESULT passes scripts/orch-validate.mjs (exit 0). That single assertion is what would have caught both of qa's blockers.\n"
      + "  3. Assert the actual state transition, not just validity: vc-approved must land the row in done_verified[] and remove it from qa[]; vc-changes must land it in review[] with redispatch_count incremented by exactly 1 and next_agent set to the row's owner.\n"
      + "  4. NEGATIVE CONTROL, mandatory: deliberately break one actuator (e.g. drop the qa[] removal so the row exists in two lanes) and demonstrate the verifier goes RED. A verifier never observed failing is not evidence of anything - see feedback_janitor_false_green_verify.\n"
      + "  5. Opt-IN scope only. Do NOT wire this as a fleet-wide gate off one validated file (feedback_fleetwide_gate_validated_on_one_file_optout_allowlist).\n"
      + "  6. Register the script in its owning flow doc per docs/policies/dev-standards.md § Script Persistence.\n\n"
      + "BLOCKED ON: FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR - the actuator has to exist before a fixture can assert on its output. agent-father is landing it now (review[], next_agent=agent-father).\n\n"
      + "KNOWN INTERACTION, flag not scope: the vc-changes qa[] -> review[] move targets a PROSE_CEILING_LANES-guarded lane from an unguarded one, so any over-ceiling qa row can hard-reject on that specific transition until FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS (D3, ready[]) ships. A fixture SHOULD cover this case, but do not re-design D3 here."
    )
  }]

# ---------------------------------------------------------------- M6
| .task_board.backlog += [{
    id: "FEAT-COWORK-WRITE-LAST-FIRED-DESTAMP-MODE",
    type: "FIX",
    size: "XS",
    priority: "P2",
    status: "BACKLOG",
    zone: "cross-service/",
    owner: "developer",
    next_agent: "developer",
    sprint: "COWORK-RELIABILITY",
    created_at: $NOW,
    created_by: $BY,
    updated_at: $NOW,
    updated_by: $BY,
    baseline_pass: true,
    title: "Add a --destamp <slot_id> <prior_value> mode to scripts/agents-flow/cowork-write-last-fired.js so rolling a slot's last_fired BACK stops being a hand-edit of docs/data/cowork-schedule.json",
    note: (
      "MINTED by po 2026-08-23T14:10Z, endorsed by qa in the 2026-08-23 review-lane drain and not minted there (scripts/ is outside agent-father's commit_zone).\n\n"
      + "TODAY: the script is forward-only by contract. Its header states 'Monotonic forward-only: a slot last_fired never decreases (sibling-fresher-stamp guard)' and it reads slot ids off process.argv.slice(2) with no flags at all. That guard is correct for the Step 5b hot path it was written for. But reverting a bad stamp - which happens whenever a dispatcher fires against a slot it should not have, or a test/dry-run leaks a real stamp - therefore has NO tool, and is done by hand-editing docs/data/cowork-schedule.json each time.\n\n"
      + "WHY THAT MATTERS RATHER THAN BEING MERELY TEDIOUS: the script's own header documents two production corruptions caused by hand-rolled inline implementations of this exact write, both silent (a jq needle-binding bug that clobbered sibling slots, and a zsh word-splitting bug that wrote an unchanged file and reported write-OK). Hand-editing the schedule to roll a stamp back is the same hazard on the same file, just in the other direction, and it is currently the only available method.\n\n"
      + "ACCEPTANCE:\n"
      + "  1. New mode: `node scripts/agents-flow/cowork-write-last-fired.js --destamp <slot_id> <prior_value>`. Exactly one slot per invocation - no multi-slot destamp, because a batched rollback is precisely the shape of the jq needle-binding corruption the header warns about.\n"
      + "  2. <prior_value> must be ISO8601 UTC matching the existing FIRED_AT regex, or a literal `null` to clear the stamp entirely.\n"
      + "  3. The forward-only monotonic guard is BYPASSED for --destamp and for nothing else. Default argv-only invocation keeps its current behaviour byte-for-byte.\n"
      + "  4. Refuse loudly (exit 2, the script's existing caller-error code) on: unknown slot_id, missing <prior_value>, a value that is neither valid ISO8601 nor null, or --destamp combined with positional slot ids.\n"
      + "  5. Same atomic tmp+rename write path and same JSON stdout envelope {ok, error, fired_at, updated} as the forward path - do not add a second write implementation.\n"
      + "  6. A destamp is a corrective action, so it must be visible: print the prior value it overwrote to stdout, not just the new one.\n"
      + "  7. Update the owning flow doc docs/agents/cowork-team/flow/last-fired.md with the new mode and an explicit note that it is for corrections only, never for the Step 5b hot path.\n"
      + "  8. Test both directions, including the guard: a forward stamp on a slot with a fresher sibling stamp must still be refused AFTER this change."
    )
  }]
