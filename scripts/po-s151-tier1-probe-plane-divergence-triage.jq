# scripts/po-s151-tier1-probe-plane-divergence-triage.jq
#
# PO triage 2026-07-29T12:2xZ — Tier-1 probe PLANE DIVERGENCE / recurring failed fix.
#
# FINDING (PO-measured this tick, all read-only):
#   Tier-1 has TWO independent probe artifacts and they have diverged:
#     PLANE A (cron pre-gate)  scripts/agents-flow/auditor-tier1-probe.sh  (872L, live
#       per-container cap-derived scope, ack-ledger, MEM_FLOOR_MIB=40 as of 3b096d4b2)
#     PLANE B (agent verdict)  docs/agents/system-auditor/probe.sh (128L, last touched
#       685285a7c 2026-07-23) + docs/agents/system-auditor/flow/tier1-probe.md:145-181
#       PLANE B is MCP_CONTAINER-scoped only (probe.sh:59 greps 'mcp-server'); greps for
#       rag / MEM_FLOOR / acked / HEADROOM all return 0. Neither artifact references the
#       other. main.md:174 + tier1-probe.md:25 order the AGENT to run PLANE B, so PLANE B
#       is what produces the HEALTHY/anomaly-count the operator actually sees.
#   Every memory fix of the last 4 days landed in PLANE A only.
#
# RECURRENCE (occurrence #3 of ONE false-pass shape — "A-30 PASS / HEALTHY while a
# non-mcp-server capped container sits at 94-99% of its cap"):
#   #1 2026-07-25 08:30Z  A-30 58.63% PASS / HEALTHY, rag-service 94.76->98.46%
#                         (this is the very incident FIX-AUDITOR-TIER1-A30-MEM-SINGLE-
#                          CONTAINER-SCOPE was minted to close)
#   #2 2026-07-28 15:07:54Z  qa reproduced: ALL_GREEN / 0 anomalies, RAW-PROBE carried
#                         'mcp-server MemPerc=78.38%' ONLY, while pdf-extractor 95.44%
#                         and rag-service 95.55% were both over the WARN boundary
#   #3 2026-07-29 12:06Z  A-30 71.40% PASS / HEALTHY, rag-service 98.90%
#   A fix (663fc451b, 2026-07-25) shipped BETWEEN #1 and #2 and did not move the needle,
#   because it landed in PLANE A. Per the standing "recurring 2+ -> block" rule this is
#   an escalation, not another ordinary FIX row.
#
# WHY NO NEW ROW IS MINTED HERE (prior-art scan, PO, this tick, all 12 lanes):
#   - The agent-plane gap is ALREADY OWNED: FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-
#     SCOPE sits in review[] with qa_verdict=CHANGES_REQUESTED (qa_reviewed_at
#     2026-07-28T15:20:59Z) and a remaining-gap spec that names probe.sh:57-71, :74-95
#     and tier1-probe.md:144-178 exactly, routed next_agent=agent-father. Minting a
#     second row would fragment the predicate a FOURTH time — the precise mechanism
#     FIX-A21-PREDBOUND-2 exists to stop.
#   - The stranding mechanism is ALREADY OWNED TOO: dev-team QA-Drain
#     (main.md:723 / scripts/devteam-review-claim-qa-drain.jq) deliberately claims only
#     the PRIMARY set (status==REVIEW AND next_agent=='qa'); the non-qa subset is a
#     documented "not-yet-covered owner-triage class" routed to the PO/architect queue
#     and surfaced by scripts/audits/devteam-review-lane-drain-report.sh. The consumer
#     that never ran is PO Step-1 triage, tracked at P0 by
#     FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION. Both are on the board; neither is
#     re-minted.
#   So this script is three IN-PLACE amendments. No lane moves, no mints.
#
# MUTATIONS (all in-place field edits -> every lane LENGTH is byte-stable):
#   M1 FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE (review[])
#      P1->P0, zone cross-service/ -> docs/agents/ (qa's own routing finding),
#      recurring_bug_count=3, + po_scope_amend_20260729T1222 extending the remaining
#      scope with the three things qa's 07-28 note could not have known.
#   M2 FIX-A21-PREDBOUND-2-TIER1-PROBE-DEDUPE-VIA-SHARED-ACTUATOR (backlog[])
#      priority DELIBERATELY UNCHANGED at P1 + sequence_after the A-30 remainder
#      + po_corroboration_20260729T1222.
#   M3 FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE (backlog[])
#      + po_live_consequence_20260729T1222 — the tautological veto is now on the live
#      path, not a latent one.
#
# Idempotent: every mutation is marker-guarded on its own po_* field -> re-run mutates 0.
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s151-tier1-probe-plane-divergence-triage.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (orch-apply.sh does Zod + dup-key + CAS + atomic rename. Never raw mv/cp/>.)

def amend_a30_scope($now):
  if (.po_scope_amend_20260729T1222 // null) != null then .
  else
    .priority = "P0"
    | .zone = "docs/agents/"
    | .recurring_bug_count = 3
    | .updated_at = $now
    | .po_scope_amend_20260729T1222 =
        ("PO TRIAGE 2026-07-29T12:22Z — SCOPE AMENDED + ESCALATED P1->P0. qa's 2026-07-28T15:20:59Z CHANGES_REQUESTED remains correct and is NOT superseded: PLANE A (scripts/agents-flow/auditor-tier1-probe.sh) is CLOSED, do NOT re-open or re-fix it. What changes is (i) the priority, (ii) the zone, and (iii) three additions to the remaining scope that qa could not have known on 07-28 because they did not exist yet.\n\n"
       + "ESCALATION BASIS (recurring 2+ -> block). This is occurrence #3 of ONE false-pass shape, with a nominally-shipped fix (663fc451b) sitting between #1 and #2: #1 2026-07-25T08:30Z A-30 58.63% PASS/HEALTHY vs rag 94.76->98.46%; #2 2026-07-28T15:07:54Z ALL_GREEN/0-anomalies, RAW-PROBE carried mcp-server 78.38% ONLY, vs pdf-extractor 95.44% + rag 95.55%; #3 2026-07-29T12:06Z A-30 71.40% PASS/HEALTHY vs rag 98.90%. The 07-25 fix did not fail — it landed in the OTHER PLANE. Detection was never the problem; the fix reached the plane that does not emit the verdict.\n\n"
       + "ZONE CORRECTION: cross-service/ -> docs/agents/. qa already established the routing (docs/agents/*/ = agent definition + its own flow docs -> agent-father, per sprint-FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE-qa.md and the dispatch table). The row's zone field still said cross-service/ from when PLANE A was in scope; that is now stale and would mis-route a zone-detect. owner/next_agent=agent-father were already correct — unchanged.\n\n"
       + "ADDITION 1 — MEM_FLOOR PARITY (did not exist on 07-28). FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY landed in PLANE A at 3b096d4b2 (2026-07-29T12:15Z) adding MEM_FLOOR_MIB=40 + _mem_headroom_mib() + live tracked_by staleness via _task_status_in_orch_state(). Porting only the per-container LOOP to PLANE B reproduces the SAME class of divergence one level down: PLANE B would see rag-service and still pass it, because a percentage-only predicate cannot distinguish 85.01% from 99.44%. The port MUST carry the loop AND the floor AND the ack-staleness rule. PO calibration note is inherited verbatim, do NOT re-derive it: 40 MiB = 2x the ~20 MiB measured rag-service compact()-failure-path optimize() burst (FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP root_cause), NOT a function of cap size.\n\n"
       + "ADDITION 2 — THE ~85% DEEP-PROBE GATE IS ITSELF A BLIND SPOT. probe.sh:86-95 only engages the A-30 multi-probe when the mcp-server baseline is >=85; below that it prints '[A-30] SKIP deep-probe' and tier1-probe.md:159-160 clause 1 maps that straight to 'A-30 PASS, no emit'. So on a widened loop the gate must be evaluated PER CONTAINER, never once against mcp-server. PO measured 2026-07-29T12:20:30Z: mcp-server 82.00% (2.46GiB/3GiB) — 3 points under its own gate, i.e. today even the ONE container PLANE B does watch is being waved through by clause 1.\n\n"
       + "ADDITION 3 — DEDUP IS AN ACCEPTANCE GATE, NOT A NICETY. Once PLANE B can see rag-service, and rag is BELOW-FLOOR (PO measured 4.3MiB free at 12:20:30Z), it will have something to report on EVERY 30-min tick. The row's existing AC(5) (zero per-tick re-emit churn, the FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE regression bar) therefore becomes a HARD gate for this half, not a soft one. Bar: one signal per DISTINCT condition, not one per tick. See also the open FIX-AUDITOR-B12-DOUBLE-INVOKE-EMIT-MARKER-LOSS.\n\n"
       + "WHY THIS IS URGENT RATHER THAN MERELY CORRECT — the loop is MUTE, which is worse than noisy. PO traced the live control flow read-only: PLANE A now returns FAILURE (rag BELOW-FLOOR). On FAILURE the pre-gate never reaches its heartbeat write (auditor-tier1-probe.sh:697 gates _write_heartbeat on an EMPTY failures list), so docs/data/auditor-tier1-last-healthy.json stays frozen at 2026-07-29T11:11:55Z. cron-detect-loop Job 2 therefore spawns system-auditor on BOTH arms — verdict=FAILURE, and separately heartbeat-age>60min once the freeze passes an hour. The spawned auditor runs PLANE B, which cannot see rag, returns HEALTHY / 0 anomalies, correctly skips the notebook under its own ALL_GREEN Append Gate, and correctly does NOT write the tier-1 heartbeat (main.md:827). Net: a self-sustaining ~48x/day spawn with signals_posted=0 | telegram_sent=0 | signal_queue_rows_written=0 | dashboard_rows=0 and zero state change. Verified 2026-07-29T12:06Z: that is exactly what the live cycle returned.\n\n"
       + "PO CAPACITY RULING — DO NOT SUPPRESS, FIX THE PLANE. The developer's close-out on FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY explicitly routed the resulting cron churn to PO as a capacity decision. Ruling: (a) REJECTED — adding rag-service to any floor-exempt list, raising MEM_FLOOR, or re-widening the ACK. That recreates the exact blind suppression the floor row was minted to close, and would be the second time this family is silenced instead of fixed. (b) NOT PO's CALL — raising rag's 768m cap is user-gated infra; it belongs as a corroboration entry on FU-RAG-DEPLOY-MEMORY, never here. (c) ADOPTED — the churn is tolerable precisely BECAUSE it is currently mute; the remedy is to make each spawn produce a real signal (this row) and let the existing dedup bound the rate (ADDITION 3). The FAILURE verdict is correct and must stay red. Standing order: nothing in this family may be closed by making the detector quieter.\n\n"
       + "SEQUENCING: this row runs BEFORE FIX-A21-PREDBOUND-2-TIER1-PROBE-DEDUPE-VIA-SHARED-ACTUATOR. Both are agent-father on docs/agents/system-auditor/flow/tier1-probe.md and would collide on the same file; this one is the live false-negative, that one returns the same value either way until a user-gated deploy.\n\n"
       + "READ-ONLY CONSTRAINTS FOR THE IMPLEMENTER, NON-NEGOTIABLE: rag-service is at ~4 MiB headroom. `docker exec` against it is OFF THE TABLE ENTIRELY — an exec allocates inside its cgroup and that exact move SIGKILLed it at 2026-07-29T10:12Z. Use host-side `docker stats`/`docker inspect` only, or the host bind-mount data/live/lancedb/. No container stop/kill/rm/restart, no compose down/up — user-gated and NOT authorized. Do NOT hand-write docs/data/auditor-tier1-last-healthy.json; if you need a probe run, use the HEARTBEAT_FILE_PATH=<tmp> seam qa already used on 07-28. Note probe.sh:117-118 ALREADY docker-execs pdf-extractor for A-20 — that is pre-existing and out of scope, but do NOT copy the pattern onto rag-service.")
  end;

def amend_a21_predbound($now):
  if (.po_corroboration_20260729T1222 // null) != null then .
  else
    .sequence_after = ["FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE"]
    | .updated_at = $now
    | .po_corroboration_20260729T1222 =
        ("PO RE-ASSESSMENT 2026-07-29T12:22Z — PREDICTION BORNE OUT, PRIORITY DELIBERATELY HELD AT P1.\n\n"
       + "CORROBORATION: this row's po_structural_ruling_20260729T0812 argued that hand-porting, not re-breakage, is the multiplier that spread the A-21 predicate across three artifacts, and refused a third hand-port on that basis. That thesis has now been independently confirmed on a SECOND, unrelated predicate — memory. FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE's memory check exists as two hand-maintained copies (scripts/agents-flow/auditor-tier1-probe.sh _check_mem_creep vs docs/agents/system-auditor/probe.sh:59-95 + flow/tier1-probe.md:145-181) that reference each other nowhere; four days of fixes (663fc451b, 3b096d4b2) landed in one copy while the other, which is the one the AGENT actually runs per flow/main.md:174, stayed at its 2026-07-23 state and produced occurrence #3 of the same false-pass at 2026-07-29T12:06Z. The ruling was right, and its scope is wider than A-21.\n\n"
       + "PRIORITY HELD, NOT RAISED — and this is a judgement, recorded so it can be overturned on evidence rather than re-litigated. Corroboration raises CONFIDENCE in the structural argument; it does not change this row's own live consequence, which is genuinely unchanged: the probe returns crashRestarts:0 today and will return crashRestarts:0 after this row lands, until FIX-A21-PREDBOUND-1 is DEPLOYED behind a user-gated rebuild. Its own verification_gate (a) says so explicitly. Inflating it to P0 would put a row with no present-tense symptom ahead of one with a live mute spawn-loop. If PREDBOUND-1 deploys and A-21 still under-counts, that is a new symptom — re-assess then.\n\n"
       + "SEQUENCED, NOT BLOCKED: sequence_after=[FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE]. depends[] stays DELIBERATELY EMPTY per this row's own note — the two are independent in logic, but both are agent-father and both edit docs/agents/system-auditor/flow/tier1-probe.md, so running them concurrently is a file collision. A-30 goes first (live false-negative, escalated P0 this tick). If agent-father picks this row up while A-30 is in flight, STOP and take A-30 first.\n\n"
       + "SCOPE UNCHANGED. This row stays a DE-DUPLICATION row for the A-21 crash-count predicate. Do NOT widen it to absorb the memory predicate — that belongs to the A-30 row, which already owns those exact files. Two agents de-duplicating the same flow doc from two directions is how this family got three copies in the first place.")
  end;

def amend_vmhwm_veto($now):
  if (.po_live_consequence_20260729T1222 // null) != null then .
  else
    .updated_at = $now
    | .po_live_consequence_20260729T1222 =
        ("PO 2026-07-29T12:22Z — THIS VETO IS NOW ON THE LIVE PATH, not latent. Recorded as a pointer; scope and priority UNCHANGED, no re-mint.\n\n"
       + "tier1-probe.md:168-172 clause 4 downgrades an A-30 ESCALATE to PASS when vmhwm_kb > vmrss_kb. VmHWM is by definition the high-water mark of VmRSS, so VmHWM >= VmRSS always holds and the strict inequality is true for any process whose RSS has ever dipped even 1 kB below its own peak — i.e. effectively always. The clause cannot discriminate, and it is positioned to pre-empt the whole verdict map at :173-177.\n\n"
       + "WHY IT MATTERS TODAY: PO measured mcp-server at 82.00% (2.46GiB/3GiB) at 2026-07-29T12:20:30Z, up from the 71.40% the auditor reported at 12:06Z. probe.sh:87 engages the deep probe at >=85. When mcp-server crosses that boundary the deep probe finally runs — and clause 4 is what it runs into. So the ONE container Tier-1's agent plane does watch is defended first by a threshold that skips the probe and then by a veto that cannot fail. Two points 14 minutes apart is NOT a rate (auditor-tier1-probe.sh:75-77) and no trend is claimed here; the point is only that the veto stops being hypothetical the moment the gate is crossed, whenever that is.\n\n"
       + "RELATION TO FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE (escalated P0 this tick): that row widens WHICH containers reach the A-30 verdict logic. This row fixes whether that logic can return anything but PASS. Widening scope without fixing the veto yields a detector that looks at every container and still cannot escalate. Whoever takes either row should read both. Deliberately NOT folded: they are different predicates in different clauses with different owners (architect here, agent-father there), and folding them would confound the evidence for each — the same reason the 07-25 row held the absolute-headroom predicate out of scope.")
  end;

.task_board.review =
  [ .task_board.review[]
    | if (type == "object" and .id == "FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE")
      then amend_a30_scope($now) else . end ]
| .task_board.backlog =
  [ .task_board.backlog[]
    | if (type == "object" and .id == "FIX-A21-PREDBOUND-2-TIER1-PROBE-DEDUPE-VIA-SHARED-ACTUATOR")
      then amend_a21_predbound($now)
      elif (type == "object" and .id == "FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE")
      then amend_vmhwm_veto($now)
      else . end ]
| ._updated_at = $now
| ._updated_by = "po/triage-20260729T1222-tier1-probe-plane-divergence"
