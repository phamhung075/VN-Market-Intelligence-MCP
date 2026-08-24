# po-triage-20260824T1105Z-mint-snapshot-nominal-key.jq
#
# OWNING FLOW: docs/agents/po/flow/triage-signals.md § Pipeline-A `cowork-fire` row
#   ("Only escalate to a .task_board.backlog[] FIX when the payload itself shows a genuine defect")
# Invoked as: jq -f scripts/po-triage-20260824T1105Z-mint-snapshot-nominal-key.jq \
#               --arg now "<ISO8601Z>" docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# ONE row for a recurring pattern carried by 17 of the 31 cowork-fire envelopes in this tick's
# durable inbox — never one row per fire, per that rule's own dedup discipline.

.task_board.backlog += [{
  id: "FIX-CYCLE-SNAPSHOT-PRODUCER-NAMES-BY-WALLCLOCK-CONSUMER-LOOKS-UP-BY-NOMINAL-TICK",
  type: "FIX",
  title: "cycle_snapshot_promoted has been false on 17 consecutive cowork ticks today: Step 4.7 names the file by wall clock at write (cycle-snapshot-HH:MM.json, offset +1..+6 min) while emitPressureStateTool derives the lookup key from the NOMINAL tick — no file the producer writes is reachable by the consumer, and cycle-snapshot-latest.json is 32.5h stale as a result",
  status: "BACKLOG",
  zone: "multi",
  priority: "P1",
  size: "M",
  owner: "po",
  next_agent: "architect",
  depends: [],
  supervised: false,
  plan_only: false,
  baseline_pass: true,
  created_at: $now,
  created_by: "po (triage-20260824T1050Z, Pipeline-A cowork-fire fold — 17 envelopes, one row)",
  updated_at: $now,
  updated_by: "po",
  dedup_key: "cycle_snapshot:wallclock_name_vs_nominal_lookup",
  files: [
    "docs/agents/cowork-team/flow/tick-snapshot.md",
    "apps/mcp-server/src/interface/mcp/tools/emitPressureStateTool.ts",
    ".claude/skills/cycle-bootstrap/SKILL.md"
  ],
  root_cause: "TWO SIDES OF ONE KEY DISAGREEMENT, both pinned in source by the reporting dispatcher and neither disputed here. PRODUCER: docs/agents/cowork-team/flow/tick-snapshot.md Step 4.7 builds the filename as FILE_TICK=$(date -u +%H:%M) — the wall clock AT WRITE TIME, which is the nominal tick plus preflight drift_min plus in-tick fetch latency. CONSUMER: apps/mcp-server/src/interface/mcp/tools/emitPressureStateTool.ts:398 derives tickHHMM from tick_id (the NOMINAL tick) and looks up cycle-snapshot-<nominal>.json; line 264's !existsSync path returns {promoted:false, stale:false}, which is byte-identical to the 'no snapshot was written at all' result, so a total lookup failure escalates nothing and looks like an ordinary quiet tick. The offset is never zero and is not jitter — it is a structural property of the flow (time from tick start through drain, staleness check, fanout sizing, token claim and two data fetches), so NO wall-clock-named file can ever match a nominal-tick key. A third spelling exists: .claude/skills/cycle-bootstrap/SKILL.md Step -1 says 'round to nearest 5-min slot', which the measurement below shows is unsatisfiable against what the writer actually produces.",
  evidence: "MEASURED BY THE COWORK DISPATCHER ACROSS A FULL TRADING MORNING AND CARRIED IN 17 SEPARATE cowork-fire ENVELOPES in .dev_team_idle_chain.pending_triage_inbox (createdAt 03:32Z through 09:04Z 2026-08-24), folded here as ONE row rather than 17. (1) cycle_snapshot_promoted=false on 17 consecutive ticks; the envelopes number them 7th through 17th consecutive explicitly. (2) FULL CENSUS at the 07:15Z tick: 22 cycle-snapshot files written 02:01-07:17, offsets from their nominal 15-min tick +1..+3, ZERO of 22 on a nominal tick minute and ZERO on any 5-minute grid point; re-measured at 07:30Z as 23/23. Later ticks widened the offset to +4 (07:30), +5 (08:15) and +6 (08:30). (3) cycle-snapshot-latest.json still carries .tick == '00:00' with created_at 2026-08-23T00:07:50Z — 32.5h stale at the 08:30Z measurement. (4) stale_warning remains false throughout, which rules OUT the 4h-gate residue path: the lookup simply never finds a file at the nominal key. (5) A same-day retraction is on record and strengthens rather than weakens the finding: the 08:45Z 'offset is monotonically widening' claim was RETRACTED by its own author at 09:00Z (nominal 09:00 -> file 09:01, +1) — the offset tracks drift_min plus latency, it does not trend. The NAMING defect is unchanged by that retraction.",
  ac: [
    "AC-1 ONE UNAMBIGUOUS KEY, chosen and written down, then used by BOTH sides. The reporting dispatcher's own recommendation is the nominal tick floor(minute/15)*15 taken from the scheduled_utc token the consumer already holds. Whichever key is chosen, the producer's filename and the consumer's lookup must be derived from the SAME expression, and .claude/skills/cycle-bootstrap/SKILL.md Step -1's third spelling ('round to nearest 5-min slot') must be corrected in the same change or explicitly retired — three spellings is the actual defect, picking a fourth would not fix it.",
    "AC-2 SPLIT THE ZONES BEFORE IMPLEMENTING (this is why next_agent is architect and zone is multi). The producer half lives in docs/agents/cowork-team/flow/tick-snapshot.md, which is agent-father's exclusive commit zone; the consumer half lives in apps/mcp-server/, which is dev-mcp-server's. Neither can land the other's half. Say in the split which side owns the canonical key definition.",
    "AC-3 THE MISS MUST NOT BE SILENT. emitPressureStateTool.ts:264 currently returns {promoted:false, stale:false} for 'file not found', indistinguishable from 'no snapshot written'. A lookup miss must be distinguishable in the return and must be visible to the caller — 17 consecutive total failures produced zero escalation, which is the reason this went a full morning unfixed.",
    "AC-4 PRUNE THE PRIOR-DAY RESIDUE IN THE SAME PASS, because it is the hazard the naming defect creates. The dispatcher measured 27-33 cycle-snapshot-HH:MM.json files present with 14-15 of them written 2026-08-23, oldest ~19h past the documented 24h prune boundary. Filenames carry HH:MM with NO date, so a prior-day residue is a same-name collision waiting for today's tick at the same minute. Note the interaction recorded in feedback: when such a residue exists the 4h gate refuses the snapshot and sets stale_warning=true, which forces the NEXT tick onto legacy cadence.",
    "AC-5 VERIFY ON A REAL TICK, not a fixture: show cycle_snapshot_promoted=true and cycle-snapshot-latest.json carrying the current day's tick, on a live cowork fire. A fixture-only pass does not close this."
  ],
  po_not_a_duplicate: "Non-terminal lanes swept for emitPressureStateTool|cycle-snapshot-latest|tick-snapshot|cycle_snapshot_promoted before minting. Four in-flight neighbours inspected and rejected: DESIGN-COWORK-FANOUT-T1-TICK-SNAPSHOT-WON-SLOTS (ready, agent-father) edits the SAME Step 4.7 but is about capturing the won_slots array, not the filename key; DESIGN-COWORK-FANOUT-PRODUCER-CONSUMER-ORDERING (backlog, BLOCKED, pm) is about read-before-write ordering on the signal bus, a different plane; DESIGN-COWORK-FANOUT-T2-CYCLE-BOOTSTRAP-EXTRACTION (ready, agent-father) extracts the bootstrap skill and would TOUCH the third spelling in AC-1, so coordinate with it; ARCH-CRON-THREE-TIME-BASES-UNIFY (backlog, medium, architect) is about timezone bases (UTC vs Asia/Ho_Chi_Minh vs machine-local CEST), not about wall-clock-vs-nominal within one base. No row names either code site."
}]
