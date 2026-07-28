# scripts/po-triage-20260728T13-catchup-cluster-and-signal-drain.jq
#
# PO triage pass 2026-07-28T13Z (companion to
# scripts/po-route-20260728T13-cowork-catchup-epic-lanes.jq which handled the
# 10 epic children). Six independent transforms, one atomic write:
#
# (1) MINT FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY -- new,
#     source-verified root cause for the cowork-team flow-defect-report
#     docs/signals/processed/cowork-team-headroom-gauge-uncorroborated-20260728T124035Z.json.
#     Prior-art grep: UC-CDC-P1 covers CALLER-SUPPLIED calendar_status only;
#     the standing memory note explicitly classifies host_headroom_mb as
#     "SERVER-COMPUTED = LIVE" on the evidence that it MOVES. Nothing on the
#     board covers "it computes, but not of this machine and not of this
#     quantity". Mintable.
#
# (2) MINT FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING -- new,
#     measured. dep_status_map() only scans the HOT board's lanes, so any
#     dependency whose row was cold-evicted resolves to "MISSING" and is
#     treated as UNSATISFIED forever. Prior-art grep on cold-evict returned
#     4 rows, all about eviction mechanics, none about the dep-resolution
#     consequence. Mintable.
#
# (3) ROUTE QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL out of the NO-LANE hole into
#     ready[] + inline next_agent, and drop its ONE cold-archived dep (an
#     acute instance of defect (2), hand-repaired the same way UC-CDC-P5 was).
#
# (4) CONSOLIDATION RULING stamped on the 5 rows BA-COWORK-GUARANTEED-SLOT-
#     CATCHUP section 0.8 named as subsumed. Deliberately does NOT route them.
#
# (5) CONVERGE the D4 detector's second facet (pipeline_mismatch) onto the
#     EXISTING FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX row
#     rather than minting a 2nd row for the same detector; P3 -> P2.
#
# (6) DRAIN the 9 NEW signal_queue rows with explicit dispositions.
#
# Usage (ALWAYS from project root, ALWAYS through the gate):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-triage-20260728T13-catchup-cluster-and-signal-drain.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $n

# ---------- (1) + (2) mints ----------
| .task_board.backlog += [
  {
    id: "FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY",
    title: "pressure-state host_headroom_mb is neither the host nor headroom: computeHostHeadroomMb() falls through to Linux `free -m` inside the mcp-server container (measures the Docker VM, not the macOS host), and its macOS branch would return `Pages free` alone (261 MB live) which is ~25x smaller than real available memory — the value gates spawn-fanout Step 5.1 degraded mode at a hardcoded < 1500 floor",
    status: "BACKLOG",
    type: "FIX",
    priority: "P1",
    size: "S",
    zone: "apps/mcp-server/",
    owner: "dev-mcp-server",
    next_agent: "dev-mcp-server",
    created_at: $n,
    created_by: "po/triage-20260728T13",
    origin_signal_id: "cowork-team-headroom-gauge-uncorroborated-20260728T124035Z",
    root_cause: "apps/mcp-server/src/interface/mcp/tools/system/emitPressureStateTool.ts computeHostHeadroomMb() (:126-156) tries macOS `vm_stat` first, then Linux `free -m`, then null. TWO independent defects, both source-verified by PO 2026-07-28T13:2xZ. (A) WRONG MACHINE: the tool runs inside the mcp-server CONTAINER, where vm_stat does not exist, so it always falls through to `free -m` and reports the Docker Linux VM's available memory under a field literally named host_headroom_mb. LIVE PROOF the gauge is not this host: docs/data/pressure-state.json host_headroom_mb=2284 (emitted_at 2026-07-28T13:07:45.974Z) while the macOS host's own vm_stat at 13:2xZ gives Pages free=67387 pages=261 MB and free+inactive+speculative=6427 MB. 2284 matches NEITHER, so the number is measured somewhere else. Corroborates the cowork-team report's 5-sample vm_stat series (6016/6140/6097/5990/6289 MB, flat) against its gauge series (4414 -> 2409 -> 2009 -> 2300, oscillating): the two planes move independently because they are two different machines. (B) WRONG QUANTITY, latent: the macOS branch parses `Pages free` ONLY. On macOS that is a small, violently-oscillating fraction of actually-available memory (261 MB right now, against 6427 MB available). If mcp-server is ever run on the host, or gains vm_stat, this branch returns a value permanently BELOW the 1500 floor and pins the fleet into degraded mode forever. The tool's own description string (:454) writes 'host_headroom_mb (vm_stat/free -m; null if unavailable)' as if the two were interchangeable measures of one machine.",
    deliverable: "1) Decide and NAME what the field measures, then make the name true — either rename to container_vm_headroom_mb (and re-derive the 1500 floor against the Docker VM's 8 GB budget, not the host's), or genuinely measure the host. 2) If macOS host measurement is kept: use free+inactive+speculative (macOS 'available'), never `Pages free` alone. 3) The < 1500 floor is hardcoded in docs/agents/cowork-team/flow/spawn-fanout.md Step 5.1 against a gauge whose units and machine were never established — re-derive it from whatever (1) settles, and put the threshold in cadence-policy.json _fanout per the existing no-hardcode rule rather than in flow prose. 4) Emit a null (the documented unavailable sentinel) rather than a wrong number when the intended machine cannot be measured — spawn-fanout Step 5.1 already guards `is a number`, so null degrades safely to the non-adaptive path.",
    acceptance: "Same-minute two-plane comparison: host_headroom_mb from a live emit_pressure_state call, and the intended machine's own free-memory figure measured directly, agree within 10%. Must be executed on BOTH the container path and (fixture or real) the macOS path — a single-plane green is the exact false-green this row exists to kill. Negative control: with the measurement source unavailable, the field is null and spawn-fanout Step 5.1 takes the non-adaptive branch (not degraded mode). Prose asserting the gauge 'looks right' is not acceptance.",
    note: "PREMISE CORRECTION for whoever reads the standing memory note feedback_pressure_state_caller_supplied_fields_dead_server_computed_live: that note classifies host_headroom_mb as SERVER-COMPUTED = LIVE with the proof 'host_headroom_mb moved 3607->3610 across ticks — the computation runs'. Movement proves the code executes; it does NOT prove it measures the named thing. This row is the corroborate-on-the-other-plane finding that check missed. Distinct from UC-CDC-P1 (calendar_status, CALLER-SUPPLIED, circular) and from FIX-COWORK-CADENCE-DANGLING-POLICY-ID (policy-id domain) — do not fold, they are different fields with different failure modes. The cowork-team reporter flagged a full bun test run (1231 files) as a confounder inside the 12:23->12:37 leg; it does not explain the 4414->2409 leg and is irrelevant to root cause (A), which is machine identity, not load."
  },
  {
    id: "FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING",
    title: "deps_satisfied() treats every cold-evicted dependency as UNSATISFIED forever: dep_status_map scans only the HOT board's lanes, so 34 live rows are permanently un-dispatchable — 29 of the 40 distinct blocking dep-ids are already DONE_VERIFIED in docs/data/orch/archive/",
    status: "BACKLOG",
    type: "FIX",
    priority: "P1",
    size: "M",
    zone: "cross-service/",
    owner: "developer",
    next_agent: "developer",
    created_at: $n,
    created_by: "po/triage-20260728T13",
    root_cause: "scripts/lib/devteam-eligibility.jq dep_status_map builds its id->status map by reducing over ['backlog','ready','in_progress','qa','review','done','done_verified'] of the HOT docs/data/orch/orch-state.json ONLY. deps_satisfied() then documents 'a dep id found in NO lane = UNSATISFIED (conservative-skip)'. That conservative default is correct against a typo and catastrophic against cold eviction: the moment scripts/orch-cold-evict.sh moves a DONE_VERIFIED row to docs/data/orch/archive/YYYY-MM.json, every live row depending on it silently becomes permanently ineligible in BOUNDED-1, SLS and RLC simultaneously (all three call the same predicate). MEASURED LIVE 2026-07-28T13:2xZ: 34 rows across backlog/ready/review carry at least one dep resolving to MISSING; 40 distinct missing dep-ids; 29 of those 40 (72.5%) are present in docs/data/orch/archive/2026-07.json or 2026-06.json with status DONE_VERIFIED — i.e. the blocking work is FINISHED and the block is an artefact. The remaining 11 are genuine unknowns or free-text prose deps (e.g. 'user-escalation-vps-restart', 'vnstock-rate-limit-clear / next-fundamentals-sweep') and are a separate, smaller class. Acute instance hand-repaired this tick: QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL was blocked on FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED, DONE_VERIFIED 2026-07-08, cold-archived.",
    deliverable: "Preferred shape (developer may refine the mechanism, not re-open the choice — leaving designs open is why rows sit): fold cold-archive statuses into dep_status_map in the ONE shared library, so all four pickers inherit it with no forked logic, per scripts/lib/devteam-eligibility.jq's own one-shared-contract principle. Callers already pass --slurpfile detail; add the archive slurp the same way and thread it through. PLUS a referential guard at eviction time so new instances stop being created: scripts/orch-cold-evict.sh must not evict a row that is still named in any live row's effective_depends_on (this mirrors orch-validate's existing ref-integrity stage). Do NOT 'fix' this by rewriting dependents' depends_on at eviction time — that destroys the provenance the dep encodes.",
    acceptance: "A live-data instrument reports ZERO live rows whose effective_depends_on contains an id that is DONE_VERIFIED in cold archive but resolves to MISSING (today: 29 such ids across 34 rows). Negative control, both directions: (a) a dep-id that exists NOWHERE (hot or cold) still resolves UNSATISFIED — do not blanket-satisfy; (b) a dep-id that is cold-archived with a NON-terminal status still resolves UNSATISFIED. Eviction guard proven by attempting to evict a still-referenced row and observing refusal. Extend scripts/audits/devteam-dispatch-gate-satisfiability.sh rather than minting a new instrument, and heed its own recorded lesson: bounded1-supervised-lane-report.sh shipped GREEN while the gate it guarded was dead, because it tested lane RESOLUTION instead of gate FIRING.",
    note: "Prior-art grep before minting (feedback_file_prior_art_check_before_minting_row): FIX-BACKLOG-TERMINAL-ROW-DRIFT-EVICT-BLIND, FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE, FIX-COLDEVICT-WITHIN-FILE-PEER-CONTENT-CAPTURE, FIX-COLDEVICT-DONE-LANE-TRIGGER-ACTION-AXIS-NOOP — all four are about eviction MECHANICS (what moves, when, what it sweeps). None covers the dep-resolution consequence on the rows left behind. Also distinct from FIX-PO-LOSTMINT-RECOVERY-ARCHIVE-SCAN-GUARD (recovery heuristic scanning ready[] only). This row is the systemic form of the acute repair applied to QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL in the same PO write."
  }
]

# ---------- (3) route the cluster's DoD gate out of the NO-LANE hole ----------
| (.task_board.backlog | map(select((.id // "") == "QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL"))) as $qarow
| .task_board.backlog = (.task_board.backlog | map(select((.id // "") != "QA-COWORK-SLOT-SESSION-DOWN-SURVIVAL")))
| .task_board.ready = (.task_board.ready + ($qarow | map(. + {
    status: "READY",
    owner: "qa",
    next_agent: "qa",
    depends_on: ["OPS-COWORK-GUARANTEED-SLOT-INSTALL"],
    updated_by: "po/triage-20260728T13",
    po_routing_20260728: "PO 2026-07-28T13Z. Was backlog[] with a detail-resolved non-dev next_agent (qa) — the documented NO-LANE hole (zone-routing.md Step A2): BOUNDED-1 gates it via is_non_dev_next_agent_unrouted, SLS needs supervised AND plan_only (both null here), RLC never reads backlog[]. Moved to ready[] with status READY and the next_agent/owner promoted INLINE, which is the only lane (RLC) that dispatches a non-dev handler.",
    po_dep_repair_20260728: "DEP REPAIR, acute instance of FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING (minted this same write). Its backlog-detail `depends` was [OPS-COWORK-GUARANTEED-SLOT-INSTALL, FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED]. The second is DONE_VERIFIED (2026-07-08T05:22:59Z, by qa) but lives in docs/data/orch/archive/2026-07.json, which dep_status_map does not scan — so it resolved MISSING and blocked this row PERMANENTLY. Dropped it by installing an INLINE depends_on (inline wins over detail in effective_depends_on, same repair shape as UC-CDC-P5 2026-07-23). The row stays legitimately held on OPS-COWORK-GUARANTEED-SLOT-INSTALL, which is still REVIEW — see the consolidation ruling on that row."
  })))

# ---------- (4) consolidation ruling on the 5 subsumed rows ----------
| .task_board.backlog = (.task_board.backlog | map(
    if ((.id // "") | test("^(SPIKE-DEAD-WINDOW-20260722-EIGHT-HOUR-SILENCE|SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING|FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION|FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE|FIX-COWORK-LASTFIRED-DECOUPLE-FROM-DELIVERY)$"))
    then . + {
      subsumed_by: "BA-COWORK-GUARANTEED-SLOT-CATCHUP",
      po_consolidation_ruling_20260728: "PO RULING 2026-07-28T13Z: CONSOLIDATION HAPPENS AFTER ROUTING, NOT BEFORE — and it is a CLOSEOUT act, not a prerequisite. Three reasons. (1) It is already bound as acceptance, not as a gate: docs/handoffs/TASK-COWORK-CATCHUP-10.md AC-9 is 'All 6 consolidated rows closed together (5 fixed rows + umbrella task)', i.e. the consolidation is the epic's exit criterion. Doing it first would be closing rows whose fix has not shipped. (2) It buys zero throughput: all 5 of these rows are ALREADY inert — verified by executing scripts/lib/devteam-eligibility.jq against live data, is_bounded1_eligible=false on all 5 (4 carry a non-dev effective next_agent pm/architect; SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING is supervised without plan_only, so SLS's doubly-gated select misses it too). Consolidating them changes nothing that can move; routing the epic changes the only thing that can. (3) BA section 0.8 already assigns the owner-reconciliation to architect/PM at close time, and notes the 5 owner fields are stale relative to where the fix actually lands. WHAT THIS FIELD IS FOR: they are currently inert BY ACCIDENT (the NO-LANE hole), not by design. This stamp makes the subsumption explicit so a later triage pass that 'helpfully' routes one of them does not spawn duplicate work against files TASK-COWORK-CATCHUP-1..9 are already rewriting. Do NOT route these until the epic closes; then close all 6 together per AC-9.",
      updated_by: "po/triage-20260728T13"
    }
    else . end))

# ---------- (5) converge the D4 detector's 2nd facet, no new row ----------
| .task_board.backlog = (.task_board.backlog | map(
    if ((.id // "") == "FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX")
    then . + {
      priority: "P2",
      po_second_facet_20260728: "SECOND FACET FOLDED IN (converge, no new row — the detector is one root cause with two emissions). The row as written covers the `not_found` emission (held lock has no board row). The SAME detector also emits a `pipeline_mismatch` row for the same lock: 'orch-state/lock mismatch: active=<head.active_task_id> held=data-quality-anomaly:DGC:Q1-2026'. That comparison is a CATEGORY ERROR, not a stale whitelist: it compares .head.active_task_id (the dev-team dispatch head, a dev task) against a long-TTL sprint-task escalation lock owned by a DIFFERENT agent (bctc-analyst) in a DIFFERENT plane. Those two are never required to be equal, so the predicate mismatches on every tick for the entire 7-day TTL regardless of system state — a whitelist entry alone will NOT silence it unless the pipeline_mismatch path consults the same exclusion. Both emissions must be fixed together or the FP count only halves. EVIDENCE: the identical pair fired on 2026-07-27 AND 2026-07-28 with nothing changing in between (4 signal_queue rows, ids sau-d4-data-quality-anomaly-dgc-q1-2026-{not_found,pipeline_mismatch}-2026072{7,8}), on top of the 2026-07-25 pair that minted this row. PRIORITY P3 -> P2: not damage, but a confirmed 2-per-day recurring false positive into PO's inbox that has now survived 3 consecutive days and 6 signal rows; at P3 it sits behind 42 rows and keeps emitting. The lock itself is LIVE and LEGIT (expires 2026-07-30T15:15:40Z) — the standing DO NOT RELEASE instruction in .note is unchanged.",
      updated_by: "po/triage-20260728T13"
    }
    else . end))

# ---------- (6) signal drain with explicit dispositions ----------
| .signal_queue.rows = (.signal_queue.rows | map(
    if ((.id // "") == "rag-mem-ceiling-pinned-20260728T122201") then
      . + {status: "RESOLVED", po_disposition_20260728: "RESOLVED, no mint. Author (router) retracted it at 13:14:31Z on re-measurement: the container restarted 2026-07-28T12:21:47Z, 14s BEFORE the signal was written, RestartCount 14->15, memory 766.5 -> 678.3 MiB. The '2.9d continuous uptime proves the crash-restart relief has stopped' inference was reading a mid-cycle sample as a ceased mechanism. Independently corroborated on the other plane by sibling signal sys-20260728T131227-5964 ('88.32% after restart'). Condition is the already-acknowledged slow-growth-to-ceiling sawtooth tracked by RAG-FTS-BUILD-MEMORY-BOUND (review/next=po); its ACK premise has NOT changed and is not being revisited. Standing caveat recorded, not actioned: a service that climbs to its cap and restarts every ~3 days is a leak with a crude relief valve, not a steady state — which is what that row already covers."}
    elif ((.id // "") == "sys-20260728T120919-7e1e") then
      . + {status: "RESOLVED", po_disposition_20260728: "RESOLVED, no mint. 99.10% sample at 12:09Z is the pre-restart peak of the same ~3-day sawtooth; the container restarted at 12:21:47Z, 12 minutes later. Same tracked home: RAG-FTS-BUILD-MEMORY-BOUND (review/next=po)."}
    elif ((.id // "") == "sys-20260728T131227-5964") then
      . + {status: "RESOLVED", po_disposition_20260728: "RESOLVED, no mint. 88.32% post-restart is the expected floor of the sawtooth, and is the independent second-plane corroboration of the 12:21:47Z restart. Same tracked home: RAG-FTS-BUILD-MEMORY-BOUND. This row is the reason the HIGH sibling was retractable — keep it, it is the negative control."}
    elif ((.id // "") | test("^sys-20260728T(124939-50a8|131219-3fca)$")) then
      . + {status: "RESOLVED", po_disposition_20260728: "RESOLVED, no mint, MONITOR with a named re-escalation threshold (not a silent file-and-forget). pdf-extractor 85.54% of 2.5 GiB (2.138 GiB), health=healthy, RestartCount=2, and byte-identical across 4 router samples over 94s plus a second signal 23 minutes later — a stable plateau UNDER cap is not a defect, and minting on it would be the auditor-memory-FP class (feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn). RE-ESCALATE, and mint then, if ANY of: crosses 95% of cap, OOMKilled=true, or RestartCount climbs. SEPARATELY: the tier-1 auditor's 2026-07-28T12:49Z cycle asserted IN PROSE ONLY (never signalled) '458 PDF extraction jobs stuck in processing, 0 completed in 24h'. PO could not reach the live DB either, but the '0 completed in 24h' half is REFUTED on two independent planes: list_stored_pdfs shows files dated 2026-07-28 (today) and get_sla_status reports bctc age 235 min against a 19552 min SLA. Treat 458 as UNSUBSTANTIATED; if anyone re-raises it, it needs a live jobs-table count, not a prose repeat."}
    elif ((.id // "") | test("^sau-d4-data-quality-anomaly-dgc-q1-2026-.*-2026072[78]$")) then
      . + {status: "RESOLVED", po_disposition_20260728: "RESOLVED, no mint — DETECTOR NOISE with a tracked home. All 4 rows (2 facets x 2 days) belong to FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-ANOMALY-PREFIX (backlog, dev-mcp-server, minted 2026-07-25 from the identical 07-25 pair, origin_signal_id sau-d4-...-not_found-20260725), which PO augmented in this same write with the pipeline_mismatch facet and raised P3 -> P2. NOT a DGC data problem: the lock data-quality-anomaly:DGC:Q1-2026 is a live, legitimate 7-day bctc-analyst escalation claim expiring 2026-07-30T15:15:40Z, and a held lock without a board row is documented-legitimate (feedback_esc3_held_lock_no_board_row_is_legit). DO NOT RELEASE THE LOCK. Route future instances at the auditor's D4 check, never at DGC."}
    else . end))
| .signal_queue._updated_at = $n
| .signal_queue._updated_by = "po/triage-20260728T13"
| .signal_queue.last_triaged_at = $n
| .signal_queue.last_triaged_by = "po/triage-20260728T13"
| .task_board._updated_at = $n
| .task_board._updated_by = "po (triage 20260728T13 — 2 mints, DoD-gate route, consolidation ruling, D4 converge, 9-signal drain)"
| ._updated_at = $n
| ._updated_by = "po/triage-20260728T13"
