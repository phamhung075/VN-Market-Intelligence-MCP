# scripts/po-cron-audit-sequencing-20260722.jq
#
# PO triage mint — 2026-07-22 cross-plane cron audit sequencing.
#
# Mints 11 rows (2 TRACKING mirrors for already-dispatched out-of-band agents
# + 9 work rows) into task_board.backlog, and annotates 4 pre-existing rows
# (UC-SDF-P6, UC-CDC-P5, OPS-COWORK-GUARANTEED-SLOT-INSTALL,
# FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP) instead of duplicating them.
#
# IDEMPOTENT: every append is guarded by an id-existence check across all lanes.
#
# LANE/STATUS COHERENCE (orchStateSchema.LANE_ALLOWED_STATUSES):
#   backlog accepts ONLY {BACKLOG, BLOCKED}. TRACKING mirrors use BLOCKED
#   deliberately — the work is LIVE out-of-band, the row must NOT be a
#   dispatch target, and backlog+BLOCKED is the ratified "paused pending an
#   external precondition" terminal classification (architect ruling
#   2026-07-22, FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD). This also keeps the
#   WIP<=2 in_progress budget undistorted (already saturated at 2).
#
# USAGE:
#   jq -f scripts/po-cron-audit-sequencing-20260722.jq \
#      --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# OWNING FLOW: docs/agents/po/flow/main.md (triage -> sprint-kickoff)

def all_ids:
  [ .task_board | to_entries[] | select(.value | type == "array")
    | .value[] | .id? // empty ];

def add_row($row):
  . as $doc
  | if (($doc | all_ids) | index($row.id)) then $doc
    else $doc | .task_board.backlog += [$row]
    end;

def annotate($id; $key; $val):
  reduce ["backlog","ready","review","in_progress","done","done_verified","qa","archive"][] as $lane (.;
    if (.task_board[$lane] | type) == "array"
    then .task_board[$lane] |= map(
           if .id == $id then . + { ($key): $val } else . end)
    else . end);

# ── 1. TRACKING mirror — dev-mcp-server (server plane) ───────────────────────
add_row({
  id: "TRACK-CRON-AUDIT-SERVER-PLANE",
  type: "FIX",
  title: "TRACKING MIRROR — mcp-server cron-plane fixes (4 dead Sunday jobs, VPS SSH trigger tools, watchdog 16/85 coverage, 24 bespoke jobs with zero run telemetry, project-stats cronJobCount 2 vs 85)",
  status: "BLOCKED",
  priority: "high",
  zone: "apps/mcp-server/",
  owner: "dev-mcp-server",
  created_at: $ts,
  created_by: "po/cron-audit-sequencing-20260722",
  status_note: "TRACKING ONLY — work is LIVE out-of-band under intent:dev-mcp-server:cron-audit-server-fixes, dispatched by router 2026-07-22 ~15:48Z. This row is a board-visible mirror, NOT a dispatch target. BLOCKED keeps it out of every promote/claim gate (BOUNDED-1 / SLS / RLC) so it cannot be double-dispatched, and keeps the WIP<=2 in_progress budget undistorted. Precondition to unblock: the out-of-band agent returns. Whoever adopts this row MUST first read the agent's actual output — do not re-derive scope from this title.",
  scope: "(1) 4 jobs dead since 2026-06-28: integrityCheckJob, devTeamHeartbeatJob, bondMaturityPollerJob, predictionOutcomeJob — all Sunday-scheduled. (2) VPS SSH trigger tools that never worked (no ssh binary in the container). (3) watchdog covers 16 of 85 jobs. (4) 24 bespoke scheduleCron jobs emit no run telemetry. (5) docs/data/project-stats.json cronJobCount:2 vs 85 actual.",
  known_unknown: "The 24 bespoke scheduleCron jobs emit NO run telemetry, so 'absent from get_cron_health' is EXPECTED for them and is NOT evidence of failure. Nobody currently knows whether they fire. Closing the telemetry gap is a PREREQUISITE to any claim about their health — do not report them clean or broken until telemetry exists.",
  do_not_absorb: "Jobs showing crashed at 2026-07-22T14:52Z (alertDigestJob, imfIndicatorPollerJob, macroIndicatorRefreshJob, weatherCheckJob) are container-restart catch-up-burst ARTIFACTS, not normal-schedule failures. Do NOT treat them as scheduling bugs."
})

# ── 2. TRACKING mirror — ops (VPS plane) ─────────────────────────────────────
| add_row({
  id: "TRACK-CRON-AUDIT-VPS-PLANE",
  type: "FIX",
  title: "TRACKING MIRROR — VPS plane stale sources (prices/sbv/bctc stale 36-62h) + 2 health-measurement bugs + the never-inventoried VPS crontab/systemd plane",
  status: "BLOCKED",
  priority: "high",
  zone: "cross-service/",
  owner: "ops",
  created_at: $ts,
  created_by: "po/cron-audit-sequencing-20260722",
  status_note: "TRACKING ONLY — work is LIVE out-of-band under intent:ops-vps-fetch:vps-plane-stale-sources-audit, dispatched by router 2026-07-22 ~15:48Z. Board-visible mirror, NOT a dispatch target; BLOCKED for the same anti-double-dispatch reason as TRACK-CRON-AUDIT-SERVER-PLANE. Precondition to unblock: the out-of-band agent returns.",
  scope: "prices/sbv/bctc sources stale 36-62h; two health-measurement bugs; the VPS crontab + systemd timer plane which has NEVER been inventoried (it is the 5th scheduling plane and was outside the 4-plane audit).",
  known_unknown: "The VPS plane is UN-INVENTORIED. Until an inventory exists, no statement about VPS scheduling health — green or red — is supportable."
})

# ── 3. HIGH — guaranteed-slot firer truncates its own fan-out ────────────────
| add_row({
  id: "FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION",
  type: "FIX",
  title: "OS-level guaranteed-slot backstop kills its own work: headless claude -p terminates backgrounded subagents at 600s and the firer SIGTERMs the whole invocation at its 1800s bound — any guaranteed slot that fans out to subagents silently truncates",
  status: "BACKLOG",
  priority: "high",
  zone: "cross-service/",
  owner: "ops",
  next_agent: "architect",
  created_at: $ts,
  created_by: "po/cron-audit-sequencing-20260722",
  status_note: "PO SEQUENCE RANK 3. This is the OS-level backstop that exists SPECIFICALLY to survive session death (docs/standards/cron-jobs.md 273-298, closes the 73h 2026-07-04..07-07 outage). It is currently half-dead: it fires, but the work it fires does not finish.",
  evidence_verified_by_po: "docs/agent-memory/sessions/cowork-guaranteed-slot-firer.log:1042-1047 — [2026-07-22T05:28:17Z] slot=chef-morning, 'invoking (bounded 1800s)', then [2026-07-22T05:58:17Z] 'flow exited (slot=chef-morning exit_code=143)'. Exactly 1800s = FIRE_TIMEOUT_SECONDS. Separately, docs/agent-memory/sessions/cowork-guaranteed-slot-firer-error.log carries 3x 'Background tasks still running after 600s; terminating. Set CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 to wait indefinitely.' (last write 2026-07-18T22:27). Verified: CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS is set NOWHERE — not in scripts/agents-flow/cowork-guaranteed-slot-firer.sh and not in the plist EnvironmentVariables (which carries only CLAUDE_BIN, HOME, PATH). launchctl print: 815 runs, last exit 0 — the JOB looks healthy while the WORK is truncated.",
  two_distinct_bounds_do_not_conflate: "(a) INNER 600s — headless claude -p kills backgrounded subagent work (CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS unset). (b) OUTER 1800s — the firer's own _bounded_exec SIGTERMs claude. Today's chef-morning hit (b). The 07-18 errors are (a). Both are real, both are silent, and NEITHER produces a work-incomplete signal: exit_code=143 is written to a log nothing consumes. Fixing only one leaves the slot truncating at the other.",
  acceptance: "A guaranteed slot that fans out to subagents either COMPLETES, or emits a loud, consumed 'work truncated' signal naming the slot and the bound that cut it. launchctl exit 0 must stop being reportable as success for a run that produced no deliverable. Raising the bounds alone is NOT acceptance — an unbounded claude -p under launchd StartInterval is the hung-run starvation the plist header explicitly warns against.",
  folded_sub_item_log_hygiene: "FOLDED (item 7a, LOW, same file/owner): every line in cowork-guaranteed-slot-firer.log is written TWICE — the script tees to LOG_FILE while launchd ALSO redirects stdout to the same path (StandardOutPath). Confirmed at log lines 1042/1043, 1044/1045, 1046/1047. Full claude -p agent narration is also dumped in (118 KB). Pick one writer and drop the narration; whoever opens this log for the truncation fix should close this in the same pass.",
  prior_art_cross_ref: "SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING (backlog) is slots MISSING a tick — a different failure from a slot FIRING and being truncated. Cross-reference, do NOT fold. OPS-COWORK-GUARANTEED-SLOT-INSTALL (review) is the install row and stays open."
})

# ── 4. HIGH — fleet-push launchd EX_CONFIG, silently dead ───────────────────
| add_row({
  id: "FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-DEAD",
  type: "FIX",
  title: "com.vn-market.fleet-push has not executed its script in ~19 days: launchd reports EX_CONFIG (78) across 522 runs and the script body never starts — the push backstop is 100% dark and 100% silent",
  status: "BACKLOG",
  priority: "high",
  zone: "cross-service/",
  owner: "ops",
  created_at: $ts,
  created_by: "po/cron-audit-sequencing-20260722",
  status_note: "PO SEQUENCE RANK 2. PO RULING: this is NOT the reconcile task the audit described. See po_ruling_no_reconcile_needed below BEFORE starting — chasing the log tails will burn a cycle on a premise that resolved weeks ago.",
  po_ruling_no_reconcile_needed: "NO MANUAL RECONCILE IS REQUIRED — the divergence does not exist today. Verified 2026-07-22T15:52Z: `git rev-list --left-right --count origin/main...HEAD` = 0 behind / 1 ahead, so the behind-set is EMPTY. `git cat-file -e` confirms apps/mcp-server/src/__tests__/CONTAM-7-ohlcv-unit-contam-integration.test.ts is present in BOTH HEAD and origin/main — the cited abort trigger is resolved, as is the later 8-file behind-set (alertStore.ts, orchStateSchema.ts, improvementSignalWriter.ts, 5 tests). The merge-conflict aborts (docs/agent-memory/notebooks/tran-ngoc-bau.md, docs/handoffs/tnb-audit-latest.md) require a merge, and with 0 behind there is no merge. Those log lines are HISTORY, not current behavior: fleet-push-error.log last write 2026-06-27, fleet-push.log last write 2026-07-03.",
  real_defect_verified_by_po: "`launchctl print gui/501/com.vn-market.fleet-push` -> state=not running, runs=522, last exit code = 78: EX_CONFIG, run interval 1800s. ZERO bytes written to either log since 2026-07-03. scripts/fleet-worktree-push.sh echoes '[fleet-push] ahead=N threshold=20' as its FIRST statement after setup, so an empty log proves the body never runs. PO ran the identical command by hand: `/bin/bash scripts/fleet-worktree-push.sh` -> printed both lines, RC=0 (below-threshold no-op path, line 187). The script is healthy; the failure is at the launchd spawn/exec layer.",
  ruled_out_by_po: "NOT TCC/Full-Disk-Access on ~/Documents — com.vn-market.cowork-guaranteed-slot-firer writes to the SAME docs/agent-memory/sessions/ directory with 815 runs and exit 0. NOT bash-3.2 incompatibility — `/bin/bash -n` is clean and the script uses zero bash-4 constructs despite its header claiming 'bash 4+ required'. NOT a malformed plist — `plutil -lint` returns OK. NOT any script exit path — the script's only exit codes are 0 and 1; it never returns 78.",
  why_this_matters: "The abort path was at least LOUD: it echoed to stderr, called send_tg bug, and called emit_abort_signal. The current failure emits NOTHING anywhere, because all three of those live INSIDE the script that never runs. A backstop that fails silently is worse than one that aborts loudly. Blast radius is currently bounded only because something else (the router/PO push path) has been keeping the repo at 1 commit ahead.",
  acceptance: "launchctl print shows last exit code 0 AND fleet-push.log receives a fresh dated '[fleet-push] ahead=N threshold=20' line from a launchd-initiated run (not a hand run). Plus: the failure mode must become detectable — see FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN, which should land FIRST."
})

# ── 5. HIGH — launchd health probe is presence-only (false green) ────────────
| add_row({
  id: "FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN",
  type: "FIX",
  title: "auditor tier-1 launchd_agents check asserts presence in `launchctl list` only, never exit status — it returned ALL_GREEN today while com.vn-market.fleet-push sat at EX_CONFIG(78) for 522 consecutive runs",
  status: "BACKLOG",
  priority: "high",
  zone: "cross-service/",
  owner: "developer",
  created_at: $ts,
  created_by: "po/cron-audit-sequencing-20260722 (NEW finding — not in the source audit)",
  status_note: "PO SEQUENCE RANK 1 — SHIP THIS FIRST. It is the smallest change on the list (one bash function) and it is the DETECTOR for FIX-FLEET-PUSH-LAUNCHD-EXCONFIG-SILENT-DEAD and for every future silent launchd death. Shipping the fixes before the detector guarantees the next one is also found by hand-audit.",
  mechanism_verified_by_po: "scripts/agents-flow/auditor-tier1-probe.sh _check_launchd_agents() (~line 236) reads each repo-tracked launchd/*.plist Label and asserts `printf '%s\\n' \"$lc_out\" | grep -q \"$label\"`. `launchctl list` prints PID, STATUS, LABEL — the status column is right there in the captured output and is discarded. PO ran the probe live 2026-07-22T15:55:23Z: verdict ALL_GREEN, 'all 6 checks passed (docker_ps, health_3000, health_3001, disk, mem_creep, launchd_agents)', while `launchctl list` showed `-  78  com.vn-market.fleet-push` in that same instant.",
  not_a_bug_do_not_change: "The socat-bridge exclusion is CORRECT and deliberate, not a hole. com.vn-market.socat-bridge is explicitly allow-listed as obsolete in the function's own $obsolete_labels with a documented reason (RESOLVED 2026-06-06, api-gateway container owns :4000, per OPERATOR-ALERT-SOCAT-FIX.md). PO checked this specifically before minting. Leave it.",
  acceptance: "The check fails when a repo-tracked LaunchAgent is loaded but its last exit status is non-zero, naming the label and the code. Regression test in scripts/agents-flow/auditor-tier1-probe.test.sh (which already mocks launchctl) covering: loaded+0 = pass, loaded+78 = fail, absent = fail, obsolete-allow-listed+absent = pass. This is the generic 'exists != works' gate — same class as FB-LAUNCHD-QA-FIRE-VERIFY-DEDUP.",
  second_order: "Presence-only is also why nothing noticed the 2026-07-03 death. Consider whether a job whose `runs` counter advances while its log mtime does not should also be flagged — that is the shape that catches EX_CONFIG-class spawn failures generically."
})

# ── 6. HIGH — session-cron plane liveness watchdog (item 3, part 2) ──────────
| add_row({
  id: "ARCH-SESSION-CRON-PLANE-LIVENESS-WATCHDOG",
  type: "SPRINT-S",
  title: "Session-scoped CronCreate loops are invisible and unpersisted across 5 CLI sessions — build the launchd-hosted liveness watchdog that turns 'a session died and its whole loop vanished' from silent into a BUG-channel alert",
  status: "BACKLOG",
  priority: "high",
  zone: "cross-service/",
  owner: "ba",
  next_agent: "ba",
  created_at: $ts,
  created_by: "po/cron-audit-sequencing-20260722",
  status_note: "PO SEQUENCE RANK 4 — gated on UC-SDF-P6 (cron-registry.json) landing first; this row is that registry's first consumer. See po_design_ruling below: the design call was made, this row implements one third of it.",
  problem: "CronList in the router session returns 'No scheduled jobs.' Crons live inside 5 separate CLI sessions (dev-team, cowork, system-audit, claude-heler, workflows-fix). No session can see or repair another's crons. When a session dies its whole loop vanishes with zero trace. CronCreate additionally only fires while the REPL is idle, so a session stuck mid-query fires nothing. PO verified there is NO on-disk cron persistence under ~/.claude (no crons dir; ~/.claude/jobs/ holds two stale June background-job state dirs, unrelated).",
  po_design_ruling: "OPTION (a) BROADER LAUNCHD COVERAGE — SCOPED, plus (c) MONITORING. Option (b), a persistence/registry layer for CronCreate, is REJECTED as a new scheduler. Reasoning: (1) building persistence for CronCreate means re-implementing a scheduler we do not own, inside a surface (the CLI REPL) whose contract can change under us; we already own two durable planes (launchd, and the containerized mcp-server node-cron scheduler with 85 jobs) and a third home-grown one is exactly the 'duplicating cron hosts' that UC-CDC-P5 already names as the thing to avoid. (2) launchd is the ONLY plane that survives session death and it demonstrably works (firer: 815 runs). (3) But WHOLESALE migration to launchd is equally wrong — `claude -p` per tick is expensive and, per FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION, structurally truncates fan-out work. So launchd hosts loop RE-ARM and LIVENESS, not every loop. (4) The REPL-idle constraint is unfixable from our side; that is a second independent argument for making session-plane failures VISIBLE rather than trying to make the session plane reliable. (5) Monitoring alone (option c as a terminal answer) is also rejected: without a registry there is nothing to monitor against.",
  three_part_sequence: "PART 1 (registry of record) — FOLDED INTO EXISTING UC-SDF-P6, not re-minted: the 5 session-scoped loops must be DECLARED in a repo file so absence becomes detectable. Not a new scheduler; an inventory. PART 2 (this row) — one launchd-hosted watchdog that reads that registry and alerts when a declared loop has produced no evidence-of-life within its cadence. PART 3 (re-arm automation) — EXISTING UC-CDC-P5, sequenced LAST, only after 1+2: re-arming blind is how you get double-hosted crons.",
  hard_constraint_evidence_of_life: "Evidence-of-life MUST be the loop's own external artifact — its commits, its notebook mtime, its telemetry row — NEVER a self-report or a heartbeat the loop writes about itself. A loop that can assert its own liveness is a loop whose watchdog is self-satisfying (see FIX-AUDITOR-TIER1-FRESHNESS-CHECK-RELOCATE-TO-SENTINEL in ready[], same defect class, already ruled).",
  acceptance: "Kill any one of the 5 sessions and, within one cadence period, a BUG-channel message names the dead loop. Today that event is completely silent."
})

# ── 7. MEDIUM — bounded SPIKE, 8h dead window ───────────────────────────────
| add_row({
  id: "SPIKE-DEAD-WINDOW-20260722-EIGHT-HOUR-SILENCE",
  type: "SPIKE",
  title: "SPIKE (timebox 120min): 8-hour zero-commit window 2026-07-22 06:47Z->14:51Z with all cowork notebooks stopping ~05:30Z and two 12:00Z slots never running — cause UNPROVEN, machine sleep already ruled out",
  status: "BACKLOG",
  priority: "medium",
  zone: "cross-service/",
  owner: "ops",
  mode: "spike",
  timebox: 120,
  created_at: $ts,
  created_by: "po/cron-audit-sequencing-20260722",
  status_note: "PO SEQUENCE: run EARLY, in parallel with rank 1 — the evidence DECAYS. Container logs rotate, load history is not retained, and session transcripts age out. Every day this waits, the answerable version of the question gets smaller.",
  question: "What stopped ALL scheduling planes for ~8 hours on 2026-07-22, and is it the same mechanism as the mcp-server container restart at ~14:52-14:53Z, or did the restart merely end the window?",
  facts: "Zero commits 06:47Z -> 14:51Z. Cowork notebooks all stop ~05:30Z. news-scout-offhours and market-watcher-offhours, both due 12:00Z, never ran. Load average 6.19/6.40/7.23 with 5 Claude sessions + 13 containers. Correlates with the mcp-server container restart ~14:52-14:53Z.",
  already_ruled_out_do_not_redo: "MACHINE SLEEP IS RULED OUT — uptime 10d 20:15, `sleep 0`, no Sleep/Wake entries in `pmset -g log`. Do not spend timebox re-confirming this.",
  hypothesis_not_conclusion: "The load figures are CONSISTENT WITH memory feedback_overparallel_fanout_host_starvation but that is NOT proven and must not be written up as the cause without evidence that distinguishes starvation from the alternatives (gateway/downstream SSE wedge after a restart; a REPL stuck mid-query in every session simultaneously, which would match the CronCreate idle-only constraint; container OOM preceding the restart; a shared lock/mutex held across the window). Note a competing datapoint already on the board: signal_queue sys-20260722T150037 records market_messages count=0 over a 3h window and was triaged as a CONSEQUENCE of an A-30 OOM/restart at 14:51Z — reconcile with that, do not re-litigate it.",
  acceptance: "A findings doc that either NAMES the mechanism with evidence, or states plainly which hypotheses were eliminated and what instrumentation is missing to decide. 'Probably host starvation' is an UNACCEPTABLE output. If the answer is 'we cannot tell', the deliverable is the specific telemetry gap that made it undecidable."
})

# ── 8. MEDIUM — dual-plane double-fire (item 5a) ─────────────────────────────
| add_row({
  id: "FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE",
  type: "FIX",
  title: "Guaranteed slots have TWO independent firing planes with no arbitration — the launchd firer (900s) and the in-session cowork master dispatcher (*/15 CronCreate) both fire the same guaranteed:true slots; only the published-marker task_claim prevents a double post",
  status: "BACKLOG",
  priority: "medium",
  zone: "cross-service/",
  owner: "architect",
  next_agent: "architect",
  created_at: $ts,
  created_by: "po/cron-audit-sequencing-20260722",
  status_note: "PO SEQUENCE RANK 5 — MUST land AFTER FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION. That fix changes whether and how long a firer invocation runs, which directly moves the overlap window. Fixing the collision first is fixing a moving target.",
  observed: "2026-07-22 chef-morning: cowork-schedule.json last_fired=05:24:58Z (dispatcher plane) while the launchd firer invoked the same slot at 05:28:17Z (OS plane). Both planes independently decided the slot was due.",
  why_a_last_line_of_defense_is_not_a_design: "The ONLY thing preventing a double MARKET post is the published-marker task_claim inside the agent flow. That guard is a last line of defense and it has a documented history of failing open: feedback_chef_leaks_published_marker_on_silent_exit, feedback_chef_releases_published_marker_enables_peer_double_publish, feedback_fb_dedup_gate_orphaned_test_lock_false_block. Relying on it as the arbitration mechanism between two schedulers means a single marker bug becomes a duplicate market-facing publication.",
  design_question_for_architect: "Which plane is AUTHORITATIVE, and how does the non-authoritative plane learn to stand down? Candidate shapes: launchd fires ONLY when no live dispatcher session is detected (the plist header already frames launchd as the session-death backstop, docs/standards/cron-jobs.md:298); or both planes claim a shared per-slot-per-window lock BEFORE spawn rather than before publish. PO has NOT pre-selected one.",
  prior_art_distinct_do_not_fold: "This is a THIRD distinct double-fire path and must not be folded into either existing row. FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE is single-session SELF-refire (lock released too early, same session re-elects). FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS is peer/two-path/two-session. THIS one is two different SCHEDULING PLANES (OS-level launchd vs in-REPL CronCreate) that share no lock namespace at all — a namespace merge does not fix it and neither existing fix prevents it."
})

# ── 9. MEDIUM — three time bases (item 5c) + folded minute collision (5b) ────
| add_row({
  id: "ARCH-CRON-THREE-TIME-BASES-UNIFY",
  type: "SPIKE",
  title: "Three time bases coexist in one scheduling system: server jobs mix timezone UTC and Asia/Ho_Chi_Minh, CronCreate fires at MACHINE-LOCAL France time (CEST/CET, DST-sensitive), and the market it serves is fixed UTC+7 — no single place states what any job's real wall-clock is",
  status: "BACKLOG",
  priority: "medium",
  zone: "cross-service/",
  owner: "architect",
  next_agent: "ba",
  created_at: $ts,
  created_by: "po/cron-audit-sequencing-20260722",
  status_note: "PO SEQUENCE RANK 7 — gated on UC-SDF-P6 cron-registry.json. A registry that records each job's declared time base is most of this answer; doing it before the registry means writing the same table twice.",
  problem: "(1) mcp-server scheduler jobs individually declare timezone:'UTC' or timezone:'Asia/Ho_Chi_Minh'. (2) CronCreate jobs fire at machine-local France time (CEST=UTC+2 summer / CET=UTC+1 winter) and therefore SHIFT BY AN HOUR twice a year against the market. (3) Vietnam is fixed UTC+7 with no DST. A job authored as '15:00' has three different meanings depending on which plane it lands on, and nothing declares which.",
  dst_is_the_sharp_edge: "The France planes silently re-time relative to the VN trading session at each DST transition. docs/standards/cron-jobs.md:292 already documents this reasoning for the guaranteed-slot firer (StartInterval chosen over StartCalendarInterval precisely because the latter is DST-sensitive) — the insight exists but is applied in exactly one place. Next transitions to check against: late Oct 2026 (CEST->CET) shifts every session-plane cron one hour LATER relative to UTC/VN.",
  folded_item_5b_minute_collision: "FOLDED (item 5b, LOW): restartCadenceAlert (server plane) and cron-db-data-integrity (terminal/session plane) both sit on `15,45 * * * *`. PO assessment: these run in different processes and share no resource except SQLite, so this is a same-minute COINCIDENCE, not a contention bug — it is folded here rather than minted separately because a cron-registry with declared time bases is what makes cross-plane minute maps computable at all, instead of discoverable only by hand-audit.",
  explicitly_out_of_scope_verified_good: "The auditor :00/:30 vs dev-team :07/:37 vs db-integrity :15/:45 offsets are CORRECT and deliberate. Do NOT 'fix', 'normalize' or 'align' them. Any change that collapses those offsets is a regression."
})

# ── 10. LOW — orphaned unloaded LaunchAgents (item 6, decision baked in) ─────
| add_row({
  id: "CLEAN-LAUNCHAGENTS-ORPHANED-UNLOADED-PLISTS",
  type: "CLEAN",
  title: "Delete two never-loaded plists from ~/Library/LaunchAgents/ — com.vn-market.mcp.plist (points at a script deleted in the Docker migration) and the com.vn-market.socat-bridge.plist symlink (obsolete since 2026-06-06). Load NEITHER.",
  status: "BACKLOG",
  priority: "low",
  zone: "cross-service/",
  owner: "ops",
  created_at: $ts,
  created_by: "po/cron-audit-sequencing-20260722",
  status_note: "PO SEQUENCE RANK 8 (drain lane). PO DECISION IS MADE — this row is execution, not deliberation. Do not re-open the load-or-delete question.",
  po_decision_mcp_plist: "DELETE ~/Library/LaunchAgents/com.vn-market.mcp.plist. NEVER load it. Verified: its ProgramArguments point at launchd/mcp-launch.sh, which DOES NOT EXIST — removed by commit f698e0f8b 'docs(MIGRATION-PHASE3): Remove launchctl references, complete Docker microservices migration'. It is a regular file dated 7 April, NOT a symlink into repo launchd/, so it is outside the plist SSOT entirely and the tier-1 probe cannot see it. It carries RunAtLoad=1 with KeepAlive{Crashed:1}: if anyone ever loaded it, it would crash-loop forever on the missing script, and if the script were ever restored it would race the live mcp-server container for :3000 (container `vn-market-intelligence-mcp-mcp-server-1` currently publishes 0.0.0.0:3000 and 0.0.0.0:4004). No repo copy is needed — the pre-Docker launch path is already in git history.",
  po_decision_socat_bridge: "DELETE the ~/Library/LaunchAgents/com.vn-market.socat-bridge.plist SYMLINK. KEEP the repo file launchd/com.vn-market.socat-bridge.plist as the documented rollback reference. NEVER load it. It is already explicitly allow-listed as obsolete in scripts/agents-flow/auditor-tier1-probe.sh _check_launchd_agents $obsolete_labels, with the reason recorded inline (RESOLVED 2026-06-06 per OPERATOR-ALERT-SOCAT-FIX.md — the api-gateway Docker container owns port :4000; socat was a temporary band-aid). An unloaded symlink dangling in ~/Library/LaunchAgents is pure confusion surface for the next auditor: it looks installed and is not.",
  acceptance: "`ls ~/Library/LaunchAgents/ | grep vn-market` returns exactly the plists that are also in `launchctl list` (docker-cleanup, docker-events, fleet-push, cowork-guaranteed-slot-firer), and launchd/com.vn-market.socat-bridge.plist is still present in the repo with the probe's obsolete allow-list entry untouched."
})

# ── 11. LOW — dev-team notebook write step is dead ──────────────────────────
| add_row({
  id: "FIX-DEVTEAM-NOTEBOOK-WRITE-STEP-DEAD",
  type: "FIX",
  title: "dev-team notebook write step has not executed in a month while the dev-team loop demonstrably runs — docs/agent-memory/notebooks/dev-team.md mtime 2026-06-22, header claims 'Last updated: 2026-06-01', yet po.md/qa.md are fresh today and 'chore(dev-team): tick 06:37' commits landed this morning",
  status: "BACKLOG",
  priority: "low",
  zone: "docs/agents/",
  owner: "agent-father",
  created_at: $ts,
  created_by: "po/cron-audit-sequencing-20260722",
  status_note: "PO SEQUENCE RANK 9 (drain lane). Small, but it is a FLOW-STEP-NEVER-EXECUTES defect, not cosmetic staleness — that class is worth naming.",
  evidence_verified_by_po: "`ls -la docs/agent-memory/notebooks/` — dev-team.md mtime 2026-06-22 03:28 (23204 bytes), po.md mtime 2026-07-22 17:18, qa.md mtime 2026-07-22 16:50. dev-team.md line 3 reads 'Last updated: 2026-06-01'. Meanwhile `git log` shows today's 'chore(dev-team): tick 06:37 — QA-Drain UC-MDH-P1 review->qa, spawn qa verify-committed'. The loop runs; its notebook write does not.",
  why_not_cosmetic: "This is the same class as memory feedback_agent_reported_limitation_may_be_structural_check_the_tool_grant — a flow step that is unexecutable or unreached for ~30 cycles gets silently normalized. Find out WHICH is true here before writing any prose: is the write step absent from the dev-team flow, is it unreachable behind a branch that never fires, or does it lack the tool grant to write? The answer determines the fix and it is cheap to establish.",
  acceptance: "State which of the three causes is real, with the file and line. Then either the notebook receives a dated entry per cycle, or the step is deliberately deleted and the flow says so explicitly — an unexecutable step left in place is the anti-pattern."
})

# ── ANNOTATIONS to pre-existing rows (prior art — NOT re-minted) ─────────────
| annotate("UC-SDF-P6"; "po_scope_expansion_20260722";
    "SCOPE EXPANDED by PO cron-audit triage 2026-07-22. The generated cron-registry.json must ALSO cover the session-scoped CronCreate plane, not only the mcp-server scheduler + launchd planes. Rationale: crons currently live inside 5 separate CLI sessions (dev-team, cowork, system-audit, claude-heler, workflows-fix); CronList in one session cannot see another's, there is NO on-disk persistence under ~/.claude (verified 2026-07-22 — no crons dir; ~/.claude/jobs/ holds two stale June background-job dirs, unrelated), and when a session dies its whole loop vanishes with zero trace. This row is now PART 1 of the three-part ruling recorded in ARCH-SESSION-CRON-PLANE-LIVENESS-WATCHDOG.po_design_ruling, and it GATES both that row (part 2, the watchdog consumes this registry) and ARCH-CRON-THREE-TIME-BASES-UNIFY (which needs each job's declared time base recorded here). The registry is an INVENTORY so that absence becomes detectable — it is explicitly NOT a new scheduler and must not grow into one. Registry entries should also record the declared time base per job (UTC / Asia/Ho_Chi_Minh / machine-local France), since three coexist today.")

| annotate("UC-CDC-P5"; "po_sequencing_20260722";
    "SEQUENCED BY PO 2026-07-22 cron-audit triage: this row is PART 3 of the three-part ruling in ARCH-SESSION-CRON-PLANE-LIVENESS-WATCHDOG.po_design_ruling and must land LAST — after UC-SDF-P6 (registry, part 1) and after the liveness watchdog (part 2). Rationale: automated re-arm without a registry and without liveness detection is re-arming BLIND, which is precisely how you end up with double-hosted crons — the failure this row's own title warns against, and the one now materialized as FIX-GUARANTEED-SLOT-DUAL-PLANE-DOUBLE-FIRE. Scope unchanged; only the ordering constraint is added.")

| annotate("OPS-COWORK-GUARANTEED-SLOT-INSTALL"; "po_note_20260722_live_fire_evidence";
    "PO cron-audit 2026-07-22: FIRE EVIDENCE NOW EXISTS but this row must NOT be closed on it. `launchctl print gui/501/com.vn-market.cowork-guaranteed-slot-firer` = 815 runs, last exit code 0, interval 900s; the firer demonstrably invoked chef-morning at 2026-07-22T05:28:17Z. HOWEVER that invocation was SIGTERMed at 05:58:17Z (exit_code=143, exactly the 1800s bound) — the slot fired and its work was truncated. Acceptance for an install row is a fire that PRODUCES ITS DELIVERABLE, not a fire that starts. Keep open pending FIX-GUARANTEED-SLOT-FIRER-FANOUT-TRUNCATION. Also note the tier-1 probe's launchd check is presence-only (FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN), so 'launchctl list shows entry' in this row's status_note is a weaker verification than it appears.")

| annotate("FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP"; "po_corroboration_20260722_cron_audit";
    "CORROBORATING TELEMETRY from the 2026-07-22 cron audit, added rather than minted as a new row (prior-art check: this row already owns the active reparse corruption and is ACTIVE + SPREADING): bctcReparseJob shows a 58.8% run-success rate in cron_job_runs. The audit flagged that number as a genuine standalone concern; PO judgement is that a ~41% failure rate on the very job this row says is corrupting reports is far more likely the SAME phenomenon than an independent one, and splitting it across two rows would split one root cause across two owners. Whoever works this row should check whether the failing ~41% and the corrupting runs are the same set — if they turn out to be disjoint, THEN mint the separate row with that disjointness as its evidence.")

# ── triage stamp ────────────────────────────────────────────────────────────
| .task_board.last_triaged_at = $ts
| .task_board.last_triaged_by = "po/cron-audit-sequencing-20260722"
