# scripts/po-signaltriage-20260725T0948-headunpin-snapshot-fold.jq
#
# PO signal triage 2026-07-25T09:48Z — cowork-team rows cwk-20260725T092802-7c2e
# (config_drift, cycle-snapshot frozen 18d) + cwk-20260725T093521-b3d1
# (orch-health-finding, head pinned on P2 since 05:18Z) + coordinator addendum
# (calendar_status weekend-suppression dead).
#
# Operations (all idempotent / no-op if target absent):
#   1. HEAD UNPIN — .head -> idle; FIX-VNINDEX-CACHE-STARTUP-PURGE in_progress[] -> backlog[]
#      (stamps stripped so the row re-enters normal priority selection, not a re-claim loop).
#   2. P0 RE-ROUTE — FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW ready[] -> backlog[]
#      (ready[] is drained only by RLC which is structurally unreachable; backlog[] is
#      drained by BOUNDED-1 every ~30min. P0 outranks the P2 above at priority_rank=0.)
#   3. FOLD row 1 -> UC-SDF-P2 (already names the tickHHMM-vs-FILE_TICK divergence); P2 -> P1.
#   4. SUPERSEDE SPIKE-TICK-SNAPSHOT-DEADCODE-OR-REGRESSED (question now answered by evidence);
#      its load-bearing SEQUENCING GUARD note is carried onto UC-SDF-P2 by op 3.
#   5. FOLD coordinator addendum -> UC-CDC-P1 (calendar_status).
#   6. MINT FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE.
#   7. FOLD chain-ordering starvation evidence + premise correction -> FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION.
#   8. Signal rows 7c2e + b3d1 -> RESOLVED.
#
# Usage (ALWAYS through the orch-apply.sh gate):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-signaltriage-20260725T0948-headunpin-snapshot-fold.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def strip_claim_stamps:
  del(.promoted_at) | del(.promoted_by) | del(.promotion_note)
  | del(.claimed_at) | del(.claimed_by);

# ── 1. HEAD UNPIN ────────────────────────────────────────────────────────────
( [ (.task_board.in_progress // [])[]
    | select(.id == "FIX-VNINDEX-CACHE-STARTUP-PURGE") ] ) as $stalled
| ( if ($stalled | length) > 0 then
      .task_board.backlog = ((.task_board.backlog // []) + [
        ($stalled[0] | strip_claim_stamps | . + {
          status: "BACKLOG",
          updated_at: $now,
          updated_by: "po/signal-triage-20260725T0948",
          po_stall_note_20260725: ("HEAD-UNPIN 2026-07-25T09:48Z. This row was BOUNDED-1-claimed 2026-07-25T05:18:14Z and pinned .head at status=in_progress for 4h25m with ZERO progress: no commit references the task id, no working-tree change under apps/mcp-server/, no dev-mcp-server notebook entry, and task_list_held shows NO lock on task:FIX-VNINDEX-CACHE-STARTUP-PURGE (so Pipeline Resume was never blocked by a peer holder — it was free to re-spawn every tick and produced nothing). Prior BOUNDED-1 cadence was one claim+closeout every ~30min (7 claims 02:17Z-05:18Z), so this is a silent spawn/agent failure, not slow work. Because docs/agents/dev-team/flow/main.md L491 only auto-resets a pinned head at >=24h, ALL FOUR dispatch lanes (BOUNDED-1/SLS/RLC/QA-Drain, all gated on head-idle at L492) were dead until 2026-07-26T05:18Z. Row returned to backlog[] UNMODIFIED in scope/priority — the defect it describes is still real and unfixed. If a future BOUNDED-1 pick of this row stalls the head a SECOND time, do NOT simply re-unpin: that makes it a reproducible per-row dispatch failure and it must be escalated as such. Systemic fix tracked at FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE.")
        })
      ])
      | .task_board.in_progress = [ (.task_board.in_progress // [])[]
          | select(.id != "FIX-VNINDEX-CACHE-STARTUP-PURGE") ]
      | .head = {
          status: "idle",
          active_task_id: null,
          next_agent: "router",
          next_action: "Head unpinned by PO 2026-07-25T09:48Z after a 4h25m zero-progress pin on P2 FIX-VNINDEX-CACHE-STARTUP-PURGE (claimed 05:18:14Z, no lock held, no commits, no notebook entry). Fall through to BOUNDED-1 -> SLS -> RLC -> QA-Drain; top-ranked backlog row is now P0 FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW (priority_rank=0).",
          updated_at: $now,
          updated_by: "po/signal-triage-20260725T0948 (head unpin)"
        }
    else . end )

# ── 2. P0 RE-ROUTE: ready[] -> backlog[] ─────────────────────────────────────
| ( [ (.task_board.ready // [])[]
      | select(.id == "FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW") ] ) as $p0
| ( if ($p0 | length) > 0 then
      .task_board.backlog = ((.task_board.backlog // []) + [
        ($p0[0] | . + {
          status: "BACKLOG",
          updated_at: $now,
          updated_by: "po/signal-triage-20260725T0948",
          po_reroute_20260725T0948: ("LANE RE-ROUTE ready[] -> backlog[], priority P0 UNCHANGED. Not a demotion. Rationale: ready[] is drained ONLY by the Ready-Lane Consumer, which sits 3rd in the head-idle fall-through chain (BOUNDED-1 -> SLS -> RLC -> QA-Drain) and is reached only when BOUNDED-1 dispatches nothing. With 390 rows in backlog[] BOUNDED-1 finds an eligible row essentially every idle tick, so RLC has effectively never run — corroborated live: qa[] is EMPTY while 73 review[] rows carry next_agent=qa. This row sat READY and undispatched since 2026-07-21 across three independent detections for exactly that reason. backlog[] is the one lane demonstrably draining (7 BOUNDED-1 claims between 02:17Z and 05:18Z today). Gate check done before the move: status=BACKLOG, supervised=false, depends=[], next_agent=dev-mcp-server (matches the dev-role pattern), no children, no detail entry (all detail-keyed gates default to not-gated), no po_sequencing_* key -> passes every BOUNDED-1 gate, and at priority_rank=0 it outranks every other eligible backlog row. Deliberately did NOT hand-stamp promoted_by='dev-team (bounded-1 auto-pickup)' to force the claim script: that marker's documented contract is 'stamped by the promote script, never a pre-existing human/PO/router-placed ready[] row', and faking provenance would corrupt the very signal the next incident needs. Structural fix for the lane starvation itself: FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION.")
        })
      ])
      | .task_board.ready = [ (.task_board.ready // [])[]
          | select(.id != "FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW") ]
    else . end )

# ── 3. FOLD row 1 -> UC-SDF-P2 (+ raise P2 -> P1) ────────────────────────────
| .task_board.backlog = [ (.task_board.backlog // [])[]
    | if .id == "UC-SDF-P2" then
        . + {
          priority: "P1",
          updated_at: $now,
          updated_by: "po/signal-triage-20260725T0948",
          po_corroboration_20260725T0948: ("THIRD independent detection — folded, no new row minted (signal cwk-20260725T092802-7c2e, cowork-team). Priority P2 -> P1: the DIAGNOSE half of this row is now COMPLETE, it is a pure FIX with a fully source-verified root cause, and the dead-adaptive-layer blast radius is confirmed downstream. Detection history: (1) 2026-07-15 signal cow-20260715T195340 deduped here; (2) 2026-07-21 memory feedback_cycle_snapshot_promote_conservative_default_refuses_every_input; (3) 2026-07-25 this signal. VERIFIED AT SOURCE by PO this tick, not relayed: emitPressureStateTool.ts L359-362 derives tickHHMM from the NOMINAL tick_id (always :00/:15/:30/:45); L232 looks up docs/data/cycle-snapshot-<that HH:MM>.json; but docs/agents/cowork-team/flow/tick-snapshot.md Step 4.7 names the file by FIRE time (FILE_TICK=$(date -u +%H:%M)). All six on-disk snapshots sit at nominal+8..11min (00:10, 08:10, 09:08, 20:09, 20:26, 21:09) — none on a nominal boundary, so existsSync fails every tick and L233 returns {promoted:false, stale:false}. Because stale is ALSO false, stale_warning never fires: the failure is completely silent, which is why it survived 18 days (cycle-snapshot-latest.json content tick '19:45', created_at 2026-07-07T19:47:26Z). This is a producer/consumer filename-contract mismatch that NEVER worked — not a race and not a regression of FU-TICK-SNAPSHOT-EMIT-DARK's bash-fence defect. SECOND independent failure mode still applies and must be fixed too (from the 07-21 memory): even on a name match, the on-grid file is the dispatcher's OWN Step 4.7 tick-snapshot, which carries none of fetchedAt/created_at/macro_snapshot.fetchedAt, so the freshness gate treats it as Infinity-stale and refuses. Fixing only the filename leaves the promoter still refusing. DOWNSTREAM CONFIRMED DEAD: docs/data/pressure-state.json currently has regime_status:null, volatility_level:null, cycle_snapshot_promoted:null. FIX DIRECTION IS AN OPEN DESIGN CALL, deliberately NOT decided by PO (rename in Step 4.7 vs glob/most-recent lookup) — route to architect with the sequencing guard below. ABSORBED FROM SPIKE-TICK-SNAPSHOT-DEADCODE-OR-REGRESSED (now CANCELLED/superseded, its question answered by the above): SEQUENCING GUARD — DO NOT land cycle-snapshot key-unification / residue-file prune ALONE. Pruning the ~110 gitignored cycle-snapshot-<HH:MM>.json residue files flips every cowork tick to stale_warning=false -> adaptive fleet-wide, which activates the 240-min dangling-policy gate and degrades the alert-commander-market path 16x (15min -> 240min). Per handoff docs/handoffs/2026-07-16-cycle-snapshot-promotion-dark-9-days-adaptive-cadence-never-runs.md the coupling is 3-way + a 4th unit, and must land as ONE change set: (1) unify the snapshot key + put a date in it; (2) author the missing cadence-policy rows (alert-commander-market 15min + alert-commander-critical 240min + gatherer open/half_day tiers); (3) WIRE calendar_status to the vnTradingCalendar oracle (isVnTradingDay) — see UC-CDC-P1, which now carries live weekend-suppression impact evidence; (4) restore a writer for regime_status/volatility_level (dropped in the 2026-06-05 refactor) + a test that fails when the reader's source field has no writer. Couples with UC-CDC-P1 and FIX-COWORK-CADENCE-DANGLING-POLICY-ID.")
        }

# ── 5. FOLD coordinator addendum -> UC-CDC-P1 ───────────────────────────────
      elif .id == "UC-CDC-P1" then
        . + {
          updated_at: $now,
          updated_by: "po/signal-triage-20260725T0948",
          po_impact_evidence_20260725T0948: ("IMPACT EVIDENCE FOLDED IN — no new row minted. This raises the row from 'a field carries a junk literal' to 'a documented suppression gate never fires, with recurring weekend spawn cost'. PREMISE CORRECTION: this row's own title says 'break the circular unknown', but the live literal is NOT 'unknown' — docs/data/pressure-state.json currently carries calendar_status:'closed' (tick_id 2026-07-25T09:15:00Z). 'closed' is out-of-domain: docs/agents/cowork-team/flow/pressure-read.md Step 4.3 L69 suppresses only on the literal set [\"holiday\",\"weekend\"], and L89 enumerates the recognized no-suppression domain as open/half_day/unknown. 'closed' matches neither list, so it falls through to the conservative no-suppression branch (AC-P1-4-2) — an unrecognized value is silently treated as safe. MEASURED CONSEQUENCE on Saturday 2026-07-25: docs/data/cowork-schedule.json has 23 slots (8 guaranteed / 15 non-guaranteed); five fired today, all non-guaranteed, zero guaranteed — bctc-analyst-slot-4 (bctc-offmarket, 00:11:31Z) and refine-bctc-slot-1 (bctc-offmarket, 09:09:16Z) are legitimately exempt per OQ-P1-3, but news-scout-offhours, market-watcher-offhours and alert-commander-critical (all 08:11:05Z, policies gatherer-standard/gatherer-standard/alert-commander-critical) SHOULD have been suppressed by Step 4.3's 'all other non-guaranteed slots: suppress on holiday OR weekend' rule. Three agent spawns per weekend tick that the design says should not happen. ISOLATION NOT YET DONE — do not overclaim: two paths produce this same outcome and it is unknown which applied at 08:11:05Z — (a) adaptive mode reading the unrecognized 'closed' literal, or (b) PRESSURE_MODE downgraded to 'legacy', in which case Steps 4.3-4.5 are skipped wholesale and no calendar suppression runs at all regardless of the literal. Both end in no-suppression. The 08:11Z tick's mode is recoverable from that tick's telemetry in docs/signals/ if the isolation is wanted before implementation. MECHANISM VERIFIED AT SOURCE this tick (self-recycling loop, no producer of truth anywhere): emitPressureStateTool.ts L387 writes calendar_status: args.calendar_status ?? 'unknown' — purely caller-supplied, never server-computed; its zod schema at L459-461 is z.string().optional() with NO enum gate, so any string validates while the describe() text merely documents the intended domain; and scripts/agents-flow/cowork-tick-preflight.sh L83 READS calendar_status back out of pressure-state.json and L95-97 writes that same value straight back in via emit_pressure_state. The file is its own source. SCOPE ADDITION beyond wiring vnTradingCalendar as the producer: (i) enum-gate calendar_status at the tool boundary so an out-of-domain literal is rejected at write time rather than persisted forever, and (ii) make pressure-read.md Step 4.3 FAIL LOUD on a value outside its known domain instead of silently taking the no-suppression branch — otherwise the next bad literal is equally invisible. Same defect shape as the fail-safe-that-refuses-every-input in UC-SDF-P2: the conservative branch became the only branch.")
        }

# ── 7. FOLD starvation evidence + premise correction ────────────────────────
      elif .id == "FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION" then
        . + {
          updated_at: $now,
          updated_by: "po/signal-triage-20260725T0948",
          po_evidence_20260725T0948: ("LIVE EVIDENCE + PREMISE CORRECTION (folded from signal cwk-20260725T093521-b3d1's starvation leg; no new row minted — same defect class, same zone, same architect owner). PREMISE CORRECTION: this row's title asserts 'with review[] holding qa-eligible rows the QA-Drain fires every idle tick'. The live board REFUTES that — qa[] is EMPTY (0 rows) while review[] holds 105 rows, 73 of them carrying next_agent=qa, some stamped explicitly 'branch:null for QA-Drain'. QA-Drain has effectively never fired. The lane that actually wins the head-idle chain is BOUNDED-1, which is FIRST in it and draws from a 390-row backlog[], so it finds an eligible row on essentially every idle tick and JUMPs to execute — leaving SLS, RLC and QA-Drain unreachable behind it. Measured cadence 2026-07-25: seven BOUNDED-1 claim commits between 02:17Z and 05:18Z, one every ~30min (8e062bbd6, 4ba46273b, 941c3b829, 525a82e14, a87975d9d, a44ac38aa, 9f2ae6865), against ZERO RLC or QA-Drain dispatches in the same window. CONSEQUENCE: ready[] (45 rows, 18 of them P0) and review[] (105 rows) are both structurally undrainable while backlog[] is non-empty. Concrete cost: P0 FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW sat READY and undispatched from 2026-07-21 through 2026-07-25 across three independent correct detections, purely because nothing consumes ready[]; PO has re-routed that one row to backlog[] this tick as an ACUTE workaround, which does not fix the lane. So the fairness fix must cover lane ORDERING/starvation between the four dispatch lanes, not only the Step-1 PO-triage preemption this row was originally minted for. Note the chain-ordering defect is CHRONIC and independent of the ACUTE head-pin outage recorded in FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE — the P0s were already starving for 4 days before today's pin.")
        }
      else . end ]

# ── 6. MINT the head-pin threshold row ──────────────────────────────────────
| .task_board.backlog = ((.task_board.backlog // []) + [
    {
      id: "FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE",
      type: "FIX",
      title: "dev-team head-pin auto-reset is 24h while the tick cadence is ~30min — ONE silently-failed spawn takes all four dispatch lanes offline for up to 24h",
      status: "BACKLOG",
      priority: "P1",
      size: "S",
      zone: "docs/agents/dev-team/flow/",
      owner: "architect",
      next_agent: "architect",
      supervised: true,
      plan_only: true,
      depends: [],
      created_at: $now,
      created_by: "po/signal-triage-20260725T0948",
      origin_signal_id: "cwk-20260725T093521-b3d1",
      mechanism: "docs/agents/dev-team/flow/main.md L492 gates the ENTIRE dispatch chain (BOUNDED-1 -> SLS -> RLC -> QA-Drain) on head.status being idle/done/missing/v1. L491 is the only self-heal: 'head.status == in_progress AND head.updated_at >= 24h -> stale crash, reset to idle'. Between those two lines, any head that pins without progressing takes every dispatch lane offline until the 24h timer expires. The Pipeline Resume path at L470-489 does re-spawn head.next_agent each tick, but it stamps nothing on .head, so a spawn that dies before writing anything leaves updated_at frozen and the resume silently repeats — burning one spawn per tick with no forward progress and no alert.",
      instance: "2026-07-25T05:18:14Z BOUNDED-1 claimed P2 FIX-VNINDEX-CACHE-STARTUP-PURGE and pinned the head. At 09:48Z (4h25m later) PO verified: no commit references the task id; no working-tree change under apps/mcp-server/; no dev-mcp-server notebook entry (its last three 2026-07-25 entries are all pre-05:18Z work from session 4ae45b71); and task_list_held returned 14 locks with NO lock on task:FIX-VNINDEX-CACHE-STARTUP-PURGE — so Pipeline Resume was never blocked by a peer holder and was free to re-spawn every tick. Prior BOUNDED-1 cadence was one claim+closeout every ~30min (7 claims 02:17Z-05:18Z), i.e. a healthy task closes in ~13-30min; the 24h threshold is roughly 48x the observed p100. Blast radius during the pin: 18 P0 rows in ready[], 73 qa-eligible rows in review[], 390 backlog rows — none dispatchable. Auto-reset would not have fired until 2026-07-26T05:18Z. PO unpinned by hand at 09:48Z.",
      why_p1: "Single point of failure with a ~24h outage window on the whole dev pipeline, triggered by any one silent spawn failure, with no alert on the way in. The hand-unpin PO performed this tick is not a fix and does not survive the next occurrence.",
      acceptance: "(1) A head pinned in_progress with no .head movement AND no commit referencing active_task_id for a bounded interval proportionate to the observed tick cadence (NOT 24h) is detected and reset; PO does not ratify a specific number — architect picks it from the measured cadence and states the basis. (2) Detection emits a BUG-channel signal naming the pinned task id and the pin duration, so a silent spawn failure becomes loud rather than being inferred 4h later from a missing commit. (3) Pipeline Resume records evidence of each re-spawn attempt (e.g. an attempt counter or last_resume_at on .head) so a repeated no-op resume is distinguishable from a task that is genuinely still running — the current state is indistinguishable from the outside, which is why this went unnoticed. (4) Repeated resume of the SAME active_task_id past a small attempt bound stops re-spawning and escalates instead of burning one spawn per tick.",
      scope_out: "Do NOT fix by raising WIP or by removing the head gate — the WIP<=1 BOUNDED-1 bound is user-gated (2026-07-04) and out of scope. Do NOT diagnose why dev-mcp-server specifically produced nothing on FIX-VNINDEX-CACHE-STARTUP-PURGE; that row is back in backlog[] and, if it stalls the head a second time, becomes a separate reproducible per-row dispatch failure.",
      related_not_duplicate: "FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION (chain ORDERING / lane starvation — chronic, independent, the P0 rows were already starving 4 days before this pin) and ARCH-SESSION-CRON-PLANE-LIVENESS-WATCHDOG (session-scoped CronCreate loop liveness — a different plane; this row is about board-head liveness and would fire even with the cron plane perfectly healthy).",
      prior_art_note: "PO grep-checked the board before minting for STARV/DRAIN/STALE-CRASH/HEAD-PIN/WATCHDOG/LIVENESS/DISPATCH-GATE: the two nearest rows are named above and are both distinct. No existing row covers the 24h-threshold-vs-tick-cadence mismatch or the unobservable Pipeline-Resume respawn."
    }
  ])

# ── 4. SUPERSEDE the answered SPIKE: backlog[] -> archive[] (CANCELLED) ─────
#    Lane coherence (orch-apply Stage 1b): CANCELLED is not permitted in
#    backlog[] (BACKLOG|BLOCKED only) — terminal rows live in archive[].
| ( [ (.task_board.backlog // [])[]
      | select(.id == "SPIKE-TICK-SNAPSHOT-DEADCODE-OR-REGRESSED") ] ) as $spike
| ( if ($spike | length) > 0 then
      .task_board.archive = ((.task_board.archive // []) + [
        ($spike[0] + {
          status: "CANCELLED",
          status_note: "SUPERSEDED by UC-SDF-P2",
          updated_at: $now,
          updated_by: "po/signal-triage-20260725T0948",
          po_supersede_20260725T0948: "Question ANSWERED by source-verified evidence, so this exploratory row is closed rather than re-picked. The spike asked: 'genuinely inert dead-code (remove) OR silently regressed (re-fix)?' Answer: NEITHER framing — the promotion path is a producer/consumer filename-contract mismatch that never matched once (consumer looks up the NOMINAL tick HH:MM at emitPressureStateTool.ts L232/L359-362; producer names the file by FIRE time at tick-snapshot.md Step 4.7), compounded by a second gate that refuses the on-grid file for missing timestamps. So: re-fix, and the fix row is UC-SDF-P2 (raised to P1, diagnosis complete). Its load-bearing SEQUENCING GUARD note has been copied verbatim onto UC-SDF-P2 — it is NOT lost by this closure. Closed to stop a fourth agent burning an exploratory cycle re-deriving a root cause now established three times (07-15, 07-21, 07-25)."
        })
      ])
      | .task_board.backlog = [ (.task_board.backlog // [])[]
          | select(.id != "SPIKE-TICK-SNAPSHOT-DEADCODE-OR-REGRESSED") ]
    else . end )

# ── 8. Resolve the two consumed signal rows ─────────────────────────────────
| .signal_queue.rows = [ (.signal_queue.rows // [])[]
    | if (.id == "cwk-20260725T092802-7c2e" or .id == "cwk-20260725T093521-b3d1")
      then . + { status: "RESOLVED" } else . end ]

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po/signal-triage-20260725T0948"
