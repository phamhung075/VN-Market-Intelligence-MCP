# po-S50: ARCH-CRON-SCHEDULER-RELIABILITY umbrella decision + accumulated-backlog triage.
# Invoke: jq --arg now "$NOW" -f scripts/po-s50-cron-umbrella-hold-backlog-triage.jq \
#           docs/data/orch/orch-state.json > /tmp/orch.tmp && [ -s /tmp/orch.tmp ] && mv /tmp/orch.tmp docs/data/orch/orch-state.json
# Idempotent: every backlog append is guarded by id-absence across ALL board arrays.
# Scoped mutations only — signal_queue rows flipped in place; no whole-object rewrite.
#
# DECISION 1: umbrella HELD OPEN (not closed) — G1/G2/G3 need LIVE VN-market-day auto-fire,
#   today is Sunday (market closed). Add Monday 2026-06-15 re-verification gate. G4+G5 MET by
#   done_verified children T1/T2/T3. Corrects QA cycle-269 mis-statement (umbrella was NOT closed).
# DECISION 2: triage signal_queue + docs/signals into the sprint with WIP<=2, same-zone serialized.

# helper: id present anywhere on the board?
def id_exists($id):
  [ .task_board | to_entries[] | .value[]? | select(type=="object") | .id ] | index($id) != null;

# ---- DECISION 1: umbrella HOLD-OPEN + Monday G1/G2/G3 re-verification gate ----
(.task_board.in_progress[] | select(.id == "ARCH-CRON-SCHEDULER-RELIABILITY")) |= (
  .status = "IN_PROGRESS"
  | .po_decision = "HOLD-OPEN"
  | .po_decision_at = $now
  | .po_decision_by = "po-S50"
  | .gate_status = "G4(dropped-tick regression test)=MET via T1+T2 done_verified; G5(missed-fire watchdog self-heal+alert)=MET via T3-ARCH-CRON-WATCHDOG done_verified, router RAW-confirmed LIVE (watchdog fires, 3 false 'never ran' alerts eliminated, genuine-stale alerts correct). G1/G2/G3=PENDING-MARKET-DAY (require LIVE auto-fire evidence; 2026-06-14 is Sunday, VN market CLOSED — cannot observe yet)."
  | .reverify_gate = "MARKET-DAY-2026-06-15: (G1) ohlcvDailyAggregatorJob auto-fires Mon — get_pipeline_health 'Aggregator last run' advances to 2026-06-15 with NO manual trigger AND all 16 sectors leave N/A rotation; (G2) vnstockFundamentalsRefresh auto-fires + VCB/ACB/CTG fundamental rows newer than its run, NO manual trigger; (G3) reputationComputeJob fires at 08:30 tick under peer contention (cron_job_runs row present, no miss). QA verifies LIVE raw (pipeline-health payload + cron_job_runs named-volume rows), never badges. On all-PASS -> umbrella -> done_verified + move to done_verified[]. On any miss -> the watchdog (G5, LIVE) must have self-healed/alerted -> capture evidence + spin the residual into a scoped FIX."
  | .po_rationale = "Mechanism-complete != outcome-proven. The umbrella success_metric is explicitly 'Prove the cluster auto-fires DURABLY, not just that one manual run works; ship completion across the whole cluster, not one job.' Closing on mechanism today would repeat the EXACT anti-pattern that spawned this umbrella: the prior per-job recoverMissedExecutions patch (53d00955) was marked done on a MANUAL trigger and RECURRED on reputationComputeJob. Standing /goal = 'ship the outcome not the mechanism'. G4+G5 are MET and LIVE; G1/G2/G3 physically cannot produce evidence on a closed-market Sunday. Rigorous path = hold open one calendar day for the Monday market-day LIVE re-verification. Mechanisms (T2 recover-jitter + T3 watchdog self-heal/alert) are all LIVE NOW, so the risk window is monitored by the watchdog itself."
  | .qa_record_correction = "QA cycle-269 report mis-stated this umbrella as CLOSED. Record corrected: umbrella is IN_PROGRESS, held open on the Monday 2026-06-15 G1/G2/G3 market-day re-verification gate."
)

# ---- mark the 5 stale BLOCKED duplicate sub-tasks as SUPERSEDED (children T1/T2/T3 shipped them) ----
| (.task_board.backlog[] | select(.id == "TASK-ARCH-CRON-1A"))  |= (.status = "SUPERSEDED" | .superseded_by = "T1-ARCH-CRON-T4-DEDUP-GUARDS" | .superseded_at = $now)
| (.task_board.backlog[] | select(.id == "TASK-ARCH-CRON-1A-TEST")) |= (.status = "SUPERSEDED" | .superseded_by = "T1-ARCH-CRON-T4-DEDUP-GUARDS" | .superseded_at = $now)
| (.task_board.backlog[] | select(.id == "TASK-ARCH-CRON-1B"))  |= (.status = "SUPERSEDED" | .superseded_by = "T2-ARCH-CRON-RECOVER-JITTER" | .superseded_at = $now)
| (.task_board.backlog[] | select(.id == "TASK-ARCH-CRON-1C"))  |= (.status = "SUPERSEDED" | .superseded_by = "T2-ARCH-CRON-RECOVER-JITTER" | .superseded_at = $now)
| (.task_board.backlog[] | select(.id == "TASK-ARCH-CRON-2"))   |= (.status = "SUPERSEDED" | .superseded_by = "T3-ARCH-CRON-WATCHDOG" | .superseded_at = $now)

# ---- DECISION 2A: PRIORITY-1 next dev-mcp-server task — refine-lock TTL-reclaim (RECURRING, unblocks refine pipeline) ----
| (if id_exists("FIX-REFINE-LOCK-TTL-RECLAIM") then . else
    .task_board.ready += [{
      "id": "FIX-REFINE-LOCK-TTL-RECLAIM",
      "type": "FIX",
      "owner": "dev-mcp-server",
      "route": "architect",
      "status": "TODO",
      "size": "S",
      "priority": "P1",
      "recurring": true,
      "recurrence_count": 2,
      "zone": "apps/mcp-server/",
      "wip_rule": "dev-mcp-server zone serialized to ONE in-flight. This is the NEXT dev-mcp-server task (zone now FREE after T3-ARCH-CRON-WATCHDOG). Sequenced ahead of FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (same-zone, queued behind).",
      "title": "refine lock-acquire must TTL-reclaim an EXPIRED lock (generic, all refine slots) — recurring [Lock orphaned by rebuild] class, LET-EXPIRE remedy has FAILED",
      "root_cause": "refine lock-acquire treats present+expired as held: refine-bctc-slot-2 (daily 14:00Z) SKIPPED with 'lock held by pid-1-ts-1781443890325, expires 2026-06-14T02:49:03Z' — expiry was 11h20m IN THE PAST yet acquire was REFUSED. The [Lock orphaned by rebuild] LET-EXPIRE remedy has demonstrably FAILED: expiry passed but the new session still cannot acquire, so every daily refine fire keeps skipping indefinitely. pid-1 = container/cron session orphaned by an mcp-server rebuild.",
      "fix": "lock-acquire must reclaim/overwrite ANY lock whose expiry < now (TTL-based steal), applied GENERICALLY to ALL refine slots/lock keys — NOT a per-instance manual clear. Compare-and-swap on (key, owner, expires_at): if existing.expires_at < now -> steal (overwrite owner+expires), else refuse. Do NOT manually clear from the dispatcher (concurrent-corruption risk if a live session holds an UN-expired lock).",
      "generic_mandate": "Standing /goal: fix on same problem on ALL jobs/slots, never per-instance hardcode. The reclaim path must cover every refine lock key, and any other module sharing this lock primitive should inherit the TTL-steal.",
      "blocks_resume": "refine_bctc_md pipeline: report bdcfa5e0 VCB Q4.2025 hop-nhat stuck 7/26 windows; VCB Q1, HPG Q4, GVR_2026_Q1, HPG_2026_Q1, HVN_2026_Q1 all PENDING behind the wedged lock.",
      "verification_gate": "After fix + rebuild: trigger refine-bctc-slot worker; assert it ACQUIRES the lock past an expired holder (no skip), refine_bctc_md resumes on bdcfa5e0 (windows advance past 7/26), and the lock row shows new owner+expires. QA verifies LIVE on the named-volume DB, not badges. Add a unit/regression test: acquire against an expired-holder row returns granted+steals; acquire against an un-expired holder refuses.",
      "source_signal": "cowork-team-20260614T140924-refine-lock-wedge",
      "files": ["apps/mcp-server/src/**/lock*", "apps/mcp-server/src/**/refine*"],
      "created_at": $now,
      "created_by": "po-S50"
    }]
  end)

# ---- DECISION 2A: HIGH — digest-predict ISO-week canonical dedup (recurrence-prevention; already delivered to Telegram) ----
| (if id_exists("FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP") then . else
    .task_board.ready += [{
      "id": "FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP",
      "type": "FIX",
      "owner": "dev-mcp-server",
      "status": "TODO",
      "size": "S",
      "priority": "high",
      "recurring": true,
      "zone": "apps/mcp-server/",
      "wip_rule": "Same zone (apps/mcp-server) as FIX-REFINE-LOCK-TTL-RECLAIM — SEQUENCED behind it (one dev-mcp-server task in-flight at a time). Picked up only after FIX-REFINE-LOCK-TTL-RECLAIM clears in_progress.",
      "title": "digest-predict double-post dedup: single canonical ISO-week source shared by CLI dispatcher + RemoteTrigger, OR key slot-mutex on calendar period date-range not derived week label (recurrence-prevention)",
      "root_cause": "digest-sunday published TWICE for 2026-06-14: RemoteTrigger backstop fired 13:47Z (marker published:digest-sunday:2026-W25) then */15 CLI dispatcher re-fired 13:52Z (marker ...2026-W24, claimed=true). TWO compounding root causes: (A) divergent ISO-week calc — one path computes W25 for Sun 2026-06-14 (off-by-one at the Sunday week-boundary), correct ISO week is W24; the differing week-key DEFEATS publish-marker dedup. (B) RemoteTrigger fires do NOT update cowork-schedule.json .last_fired, so the dispatcher matcher sees stale last_fired (2026-05-31) and re-fires guaranteed slots the backstop already ran. Matches [Guaranteed-slot week-key double-post] lesson.",
      "fix": "Generic, both paths: (A) ONE canonical ISO-week helper (date +%V semantics) shared by every digest-predict publish-gate path — no path may recompute its own week label. (B) EITHER RemoteTrigger writes .last_fired on fire, OR key the slot mutex on the calendar period date-RANGE (period start/end dates) not a derived week-label string, so a one-label divergence cannot defeat dedup. Apply to ALL guaranteed weekly slots, not just digest-sunday.",
      "generic_mandate": "Per [Guaranteed-slot week-key double-post]: dedup must key on the period date-range, not a derived week label, across every guaranteed weekly slot.",
      "note": "Recurrence-PREVENTION only — the 2026-06-14 digest was already delivered to MARKET (twice). No re-post needed; do NOT re-send.",
      "verification_gate": "Unit test: both dispatch paths derive the SAME week-key for Sun 2026-06-14 (must be W24, not W25) AND for adjacent week-boundary Sundays. Integration: simulate RemoteTrigger fire then CLI dispatcher tick within the same period -> exactly ONE publish (marker dedup holds). RemoteTrigger path observed to write last_fired (or mutex keyed on date-range). QA verifies the dedup gate live.",
      "source_signal": "cowork-team-20260614T135826-digest-dup",
      "corroboration": "docs/signals/digest-predict-20260614T134700Z.json — note: that 13:47 'gateway not reachable in subagent' is the per-session init-miss class (False-infra-failure), NOT this bug; the actual double-post is the dedup defect.",
      "files": ["apps/mcp-server/src/**/digest*", "apps/mcp-server/src/**/schedule*", "cowork-schedule.json"],
      "created_at": $now,
      "created_by": "po-S50"
    }]
  end)

# ---- DECISION 2B: P2 — baseRateComputationJob ~20 days stale (genuine watchdog-surfaced defect) ----
| (if id_exists("FIX-BASE-RATE-COMPUTATION-CRON-DEAD") then . else
    .task_board.backlog += [{
      "id": "FIX-BASE-RATE-COMPUTATION-CRON-DEAD",
      "type": "FIX",
      "owner": "dev-mcp-server",
      "status": "TODO",
      "size": "S",
      "priority": "P2",
      "zone": "apps/mcp-server/",
      "title": "baseRateComputationJob ~20 days stale — genuinely broken weekly job (CORRECT watchdog alert from T3 LIVE run, now actionable)",
      "root_cause": "T3-ARCH-CRON-WATCHDOG LIVE run flagged baseRateComputationJob last_run ~20 days stale — a GENUINE stale-job alert (not a false 'never ran'). Real weekly-job defect, root cause TBD (cron registration, crash, or schedule). Spin out as a scoped fix; same recover-jitter/dedup machinery from T1/T2 may already apply once the registration/crash root is found.",
      "verification_gate": "Identify why baseRateComputationJob stopped firing ~20 days ago; fix root; verify it auto-fires on its weekly cadence (cron_job_runs row, no manual trigger) and recomputes base rates live. QA verifies LIVE raw.",
      "source": "T3-ARCH-CRON-WATCHDOG LIVE run (router RAW-confirmed genuine-stale alert)",
      "note": "WIP<=2: NOT queued ahead of the two HIGH/P1 dev-mcp-server tasks; stays in backlog until the refine-lock + digest-dedup pair clears.",
      "created_at": $now,
      "created_by": "po-S50"
    }]
  end)

# ---- DECISION 2B: weekday-aware watchdog threshold (route to architect, non-blocking) ----
| (if id_exists("ARCH-WATCHDOG-WEEKDAY-AWARE-THRESHOLD") then . else
    .task_board.backlog += [{
      "id": "ARCH-WATCHDOG-WEEKDAY-AWARE-THRESHOLD",
      "type": "SPRINT-S",
      "owner": "architect",
      "route": "architect",
      "status": "TODO",
      "size": "S",
      "priority": "P2",
      "zone": "apps/mcp-server/",
      "title": "weekday-aware watchdog threshold for weekday-only jobs (morningBriefingJob / eveningSummaryJob / franceSummaryJob) — eliminate weekend false-stale",
      "root_cause": "T3-ARCH-CRON-WATCHDOG flags morningBriefingJob/eveningSummaryJob/franceSummaryJob as stale over weekends, but those are weekday-only jobs — the weekend gap is EXPECTED, not a defect. The watchdog last_run-age threshold must be weekday-aware so it does not false-alarm on the legitimate weekend gap. architect TODO already annotated in WATCHDOG_MANIFEST source.",
      "fix": "architect designs a weekday-aware (or cadence-pattern-aware) threshold so weekday-only jobs are not flagged stale across the weekend — generic across ALL weekday-only scheduled jobs, driven by each job's declared cadence in the manifest, not a per-job hardcode.",
      "note": "Non-blocking, architect-bound. WIP<=2: does NOT consume a dev-mcp-server in-flight slot (design stage).",
      "source": "T3-ARCH-CRON-WATCHDOG WATCHDOG_MANIFEST architect-TODO annotation",
      "created_at": $now,
      "created_by": "po-S50"
    }]
  end)

# ---- DECISION 2C: 3x context-bloat (route code-janitor/claude-manager-helper) ----
| (if id_exists("CLEAN-CONTEXT-BLOAT-NOTEBOOKS-20260614") then . else
    .task_board.backlog += [{
      "id": "CLEAN-CONTEXT-BLOAT-NOTEBOOKS-20260614",
      "type": "CLEAN",
      "owner": "code-janitor",
      "route": "code-janitor",
      "status": "TODO",
      "size": "S",
      "priority": "P3",
      "zone": "cross-service/",
      "title": "context-bloat: trim 3 over-cap notebooks (dev-mcp-server.md, qa.md, dev-technical-analysis.md) to SSOT cap",
      "fix": "Trim each over-cap notebook to its SSOT line cap via the notebook-write OVERWRITE discipline (preserve Carry-over). Generic janitor pass, not per-file hardcode.",
      "source_signals": [
        "docs/signals/context-bloat-docs-agent-memory-notebooks-dev-mcp-server-md-2026-06-14T140400Z.json",
        "docs/signals/context-bloat-docs-agent-memory-notebooks-qa-md-2026-06-14T110305Z.json",
        "docs/signals/context-bloat-docs-agent-memory-notebooks-dev-technical-analysis-md-2026-06-14T075904Z.json"
      ],
      "note": "Non-blocking housekeeping. WIP<=2 unaffected (janitor zone, not dev-mcp-server impl slot).",
      "created_at": $now,
      "created_by": "po-S50"
    }]
  end)

# ---- DECISION 2C: bctc_signal_FPT routine -> bctc-analyst/cowork (routine, ALL_PASS) ----
| (if id_exists("ROUTE-BCTC-FPT-Q1-2026-ROUTINE") then . else
    .task_board.backlog += [{
      "id": "ROUTE-BCTC-FPT-Q1-2026-ROUTINE",
      "type": "FIX",
      "owner": "bctc-analyst",
      "route": "cowork",
      "status": "TODO",
      "size": "XS",
      "priority": "P3",
      "zone": "cross-service/",
      "title": "FPT Q1-2026 routine BCTC signal -> bctc-analyst/cowork (ALL_PASS, routine, no escalation)",
      "note": "Routine routing only — esc_flags=ALL_PASS, esc_3=DATA-COV-LIM-GUARD-HELD, no beat/miss. Hand to bctc-analyst/cowork for normal digest consumption. Non-blocking.",
      "source_signal": "docs/signals/bctc_signal_FPT_20260614_routine.json (signal_id 6017, cycle c050)",
      "created_at": $now,
      "created_by": "po-S50"
    }]
  end)

# ---- DECISION 2C: CLOSE already-resolved signals (workflow-coherence IMPLEMENTED; cron-overlap RESOLVED by live SF-1) ----
# These are recorded as triaged-closed via the signal_queue + a board note; the docs/signals/ files
# are stale and should be moved to processed/ by the caller (router) post-commit. Documented here:
| .task_board._closed_signals_20260614 = {
    "_by": "po-S50",
    "_at": $now,
    "closed": [
      {"signal": "docs/signals/workflow-protocol-coherence-audit-20260614T141952Z.json", "reason": "ALREADY IMPLEMENTED — all 6 COHERENCE-GAP tasks status=IMPLEMENTED, result=RESOLVED (commit 85935da3). No work to queue.", "disposition": "move-to-processed"},
      {"signal": "docs/signals/dev-team-tool-contract-cron-overlap-20260614T121816Z.json", "reason": "ALREADY RESOLVED by the LIVE SF-1 single-flight guard (F2-A) + gateway-call-contract.md (F1) now in dev-team flow. This brief is the source that DELIVERED SF-1; no residual work.", "disposition": "move-to-processed"}
    ]
  }

# ---- flip the two NEW signal_queue rows -> RESOLVED with disposition ----
| (.signal_queue.rows[] | select(.id == "cowork-team-20260614T140924-refine-lock-wedge")) |= (
    .status = "RESOLVED" | .disposition = "TRIAGED -> FIX-REFINE-LOCK-TTL-RECLAIM (P1, dev-mcp-server, ready[], NEXT in-flight)" )
| (.signal_queue.rows[] | select(.id == "cowork-team-20260614T135826-digest-dup")) |= (
    .status = "RESOLVED" | .disposition = "TRIAGED -> FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (high, dev-mcp-server, ready[], sequenced behind refine-lock)" )

# ---- stamp board ----
| .task_board._updated_at = $now
| .task_board._updated_by = "po-S50"
