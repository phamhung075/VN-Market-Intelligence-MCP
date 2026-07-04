# scripts/po-s141-systemic-remake-phase1-promote-mint.jq
# ─────────────────────────────────────────────────────────────────────────────
# SYSTEMIC-REMAKE Phase-1 (containment-now) board kickoff — single atomic pass.
# Origin: USER-GREEN-LIT systemic remake, router-dispatched 2026-07-04.
#   Brief:     docs/architecture-briefs/2026-07-04-systemic-remake.md §1
#   Diagnosis: docs/incidents/2026-07-04-systemic-review-churn-without-convergence.md
#
# THREE mutations, all idempotent, conservation-safe:
#   M1 PROMOTE the 4 already-specced RC-DETECTOR (§1.2) rows backlog[]→ready[]
#      (status=READY; FIX-CONTEXT-BLOAT plan_only:false; owners per brief §1.2).
#      Guard: a promote id no longer in backlog[] is a no-op (re-run promotes 0).
#   M2 MINT 10 atomic Phase-1 tasks transcribed VERBATIM from brief §1.1/§1.2/§1.3
#      (Target + Mechanism + machine-checkable AC in .note; owner per §5).
#      6 unblocked → ready[] (READY); 4 dependent → backlog[] (BACKLOG + depends[]).
#      Guard: any id already present in ANY flat lane is skipped (re-run mints 0).
#   M3 ADD sprint_goal entry SYSTEMIC-REMAKE-P1 (id-guarded) + repoint top-level
#      .head → next_agent=pm (sequence the P1 chain; Phase-2 explicitly USER-GATED).
#
# Lane-status coherence (orchStateSchema LANE_ALLOWED_STATUSES):
#   ready→{READY,TODO}  backlog→{BACKLOG}. Every row below obeys its lane.
# depends[] is the canonical dependency field (task-schema.md); NOT blockedBy.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s141-systemic-remake-phase1-promote-mint.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#   (orch-apply.sh does Zod + dup-key + coherence + ref-integrity + CAS + atomic rename.)
# ─────────────────────────────────────────────────────────────────────────────

(["FIX-CONTEXT-BLOAT-HOOK-SETTLE-READ-DEBOUNCE",
  "FU-AUDITOR-D4-SIGNAL-ID",
  "FIX-SIGNALQUEUE-DUP-ID-GUARD",
  "FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT"]) as $promote_ids

# ── idempotency: every id already living in a flat lane ──────────────────────
| ([ (.task_board.backlog // [])[],
     (.task_board.ready // [])[],
     (.task_board.in_progress // [])[],
     (.task_board.review // [])[],
     (.task_board.qa // [])[],
     (.task_board.done // [])[],
     (.task_board.done_verified // [])[] ]
   | map(select(type=="object") | .id)) as $all_ids

# ── M2a: 6 UNBLOCKED atomic tasks → ready[] (status READY) ───────────────────
| ([
    {
      "id": "P1-IDLE-DEVTEAM-PREFLIGHT-SCRIPT",
      "title": "RC-IDLE-LOOPS §1.1: dev-team-tick-preflight.sh Step-5 idle-check + RUN-IDLE verdict (+ test case)",
      "owner": "developer",
      "status": "READY",
      "type": "FIX",
      "priority": "high",
      "size": "M",
      "zone": "cross-service/",
      "sprint": "SYSTEMIC-REMAKE-P1",
      "brief_ref": "docs/architecture-briefs/2026-07-04-systemic-remake.md §1.1",
      "created_at": $now,
      "created_by": "po-s141-systemic-remake-phase1",
      "note": "Target: scripts/agents-flow/dev-team-tick-preflight.sh. Mechanism: Add a Step 5 idle-check AFTER the fire-election win (RUN path only), reusing the EXACT fields drain-signals.md's MANDATORY PERSIST GUARD already reads (ls docs/signals/*.json | wc -l; signals.db mtime; jq count of signal_queue.rows[] status==NEW on orch-state; task_board.active_sprints emptiness) — evaluate them BEFORE Step 0a. All-empty -> new verdict RUN-IDLE. Do NOT invent a mechanism: port cowork _step8_silent_release (cowork-tick-preflight.sh L74-113) predicate shape verbatim. AC(§1.1#1, machine-checkable): new dev-team-tick-preflight.test.sh case with active_sprints=[], docs/signals/ empty, signal_queue NEW=0 -> mocked call trace contains ZERO calls that would touch drain-signals.md, verdict=RUN-IDLE."
    },
    {
      "id": "P1-IDLE-AUDITOR-TIER23-SCRIPT",
      "title": "RC-IDLE-LOOPS §1.1: auditor-tier1-probe.sh generalize to --tier=2|3 pre-spawn ALL_GREEN+fresh-heartbeat gate",
      "owner": "developer",
      "status": "READY",
      "type": "FIX",
      "priority": "high",
      "size": "M",
      "zone": "cross-service/",
      "sprint": "SYSTEMIC-REMAKE-P1",
      "brief_ref": "docs/architecture-briefs/2026-07-04-systemic-remake.md §1.1",
      "created_at": $now,
      "created_by": "po-s141-systemic-remake-phase1",
      "note": "Target: scripts/agents-flow/auditor-tier1-probe.sh. Mechanism: Generalize to accept --tier=2|3 implementing the SAME ALL_GREEN+fresh-heartbeat pre-spawn check Tier-1 already has, run BEFORE the cron even spawns the subagent (not just before commit). AC(§1.1#2, machine-checkable): auditor-tier1-probe.sh --tier=2 invoked twice with no underlying DB/heartbeat delta between calls -> second call returns SKIP-SPAWN, zero subagent launch, zero commit."
    },
    {
      "id": "P1-IDLE-AUDITOR-NOTEBOOK-GATE",
      "title": "RC-IDLE-LOOPS §1.1: system-auditor/flow/main.md — gate notebook append on >=1 new finding/signal/state-change",
      "owner": "agent-father",
      "status": "READY",
      "type": "FIX",
      "priority": "med",
      "size": "S",
      "zone": "docs/agents/system-auditor/",
      "sprint": "SYSTEMIC-REMAKE-P1",
      "brief_ref": "docs/architecture-briefs/2026-07-04-systemic-remake.md §1.1",
      "created_at": $now,
      "created_by": "po-s141-systemic-remake-phase1",
      "note": "Target: docs/agents/system-auditor/flow/main.md L74-76 + L685-716 (AC-3 settled-write). Mechanism: Gate the notebook append itself on 'did this cycle produce >=1 new finding/signal/state-change' — a genuinely ALL_GREEN cycle must emit ZERO notebook diff, so scripts/auditor-notebook-commit.sh's existing SKIP no-staged-changes (L196-197, today's only working no-op) finally has something to trigger on. Thin flow-doc gate only. Sprint-level empirical AC(§1.1#3): chore(memory/system-auditor) + chore(signals):drain commit count/day trends down on ticks where orch-state task_board sampled empty."
    },
    {
      "id": "P1-DETECTOR-CLOSURE-TRIAGE-SIGNALS",
      "title": "RC-DETECTOR §1.2: po/flow/triage-signals.md — stamp origin_signal_id on FIX tasks minted from a signal",
      "owner": "agent-father",
      "status": "READY",
      "type": "FIX",
      "priority": "high",
      "size": "S",
      "zone": "docs/agents/po/",
      "sprint": "SYSTEMIC-REMAKE-P1",
      "brief_ref": "docs/architecture-briefs/2026-07-04-systemic-remake.md §1.2",
      "created_at": $now,
      "created_by": "po-s141-systemic-remake-phase1",
      "note": "Target: docs/agents/po/flow/triage-signals.md (repair_task_request row). Mechanism: When PO creates a .task_board.backlog[] FIX task FROM a signal, record the originating signal's id on the new task (new origin_signal_id field) — wires two already-specced mechanisms together instead of inventing new state. PRODUCER half of the READ->RESOLVED signal-closure (F5-CLOSURE-11PCT-READ-GRAVEYARD). Consumer half = P1-DETECTOR-CLOSURE-TASK-ARCHIVE."
    },
    {
      "id": "P1-DRIFT-QUARANTINE-FREEZE-FLAG",
      "title": "RC-DRIFT §1.3: project-stats.json — quarantine zero-reader recurringBugEscalationFlag/escalationReason",
      "owner": "agent-father",
      "status": "READY",
      "type": "FIX",
      "priority": "med",
      "size": "XS",
      "zone": "docs/data/",
      "sprint": "SYSTEMIC-REMAKE-P1",
      "brief_ref": "docs/architecture-briefs/2026-07-04-systemic-remake.md §1.3",
      "created_at": $now,
      "created_by": "po-s141-systemic-remake-phase1",
      "note": "Target: docs/data/project-stats.json recurringBugEscalationFlag/escalationReason. Mechanism: QUARANTINE ONLY this phase — add _maintained_by:'DEPRECATED — see RC-CONVERGE machine-owned freeze flag (Phase 2)' so nothing new starts trusting a field grep-proven to have zero readers. Comment-only edit. Full redesign is RC-CONVERGE (§2.1, Phase-2, USER-GATED) — do NOT redesign here. AC(machine-checkable): grep for the field shows the _maintained_by DEPRECATED marker present; no new reader added."
    },
    {
      "id": "P1-DRIFT-NARRATIVE-NUMBER-POINTER",
      "title": "RC-DRIFT §1.3: replace hardcoded tool/cron counts with SSOT pointer in CLAUDE.md / mcp-tools.md / ARCHITECTURE.md",
      "owner": "claude-manager-helper",
      "status": "READY",
      "type": "FIX",
      "priority": "high",
      "size": "S",
      "zone": "docs/ + CLAUDE.md",
      "sprint": "SYSTEMIC-REMAKE-P1",
      "brief_ref": "docs/architecture-briefs/2026-07-04-systemic-remake.md §1.3",
      "created_at": $now,
      "created_by": "po-s141-systemic-remake-phase1",
      "note": "Target: CLAUDE.md, docs/standards/mcp-tools.md, docs/ARCHITECTURE.md prose. Mechanism: Replace hardcoded numbers (the 146/161/166/183 four-way tool-count drift + hardcoded cron counts) with a POINTER to the generated SSOT docs/data/tool-registry.json — no number left to go stale. AC(§1.3#1, machine-checkable): grep -c for the hardcoded tool-count strings across CLAUDE.md + docs/standards/mcp-tools.md == 0 after fix. LAND BEFORE P1-DRIFT-PARITY-TEST-EXTEND so the extended parity test stays green."
    }
  ] | map(select(.id as $i | ($all_ids | index($i)) | not))) as $ready_mints

# ── M2b: 4 DEPENDENT atomic tasks → backlog[] (status BACKLOG + depends[]) ────
| ([
    {
      "id": "P1-IDLE-DEVTEAM-FLOW-BRANCH",
      "title": "RC-IDLE-LOOPS §1.1: dev-team/flow/main.md Step 0-PREFLIGHT — add RUN-IDLE branch -> JUMP to end (skip drain-signals)",
      "owner": "agent-father",
      "status": "BACKLOG",
      "type": "FIX",
      "priority": "high",
      "size": "S",
      "zone": "docs/agents/dev-team/",
      "sprint": "SYSTEMIC-REMAKE-P1",
      "brief_ref": "docs/architecture-briefs/2026-07-04-systemic-remake.md §1.1",
      "depends": ["P1-IDLE-DEVTEAM-PREFLIGHT-SCRIPT"],
      "created_at": $now,
      "created_by": "po-s141-systemic-remake-phase1",
      "status_note": "HELD on depends P1-IDLE-DEVTEAM-PREFLIGHT-SCRIPT (branch consumes the RUN-IDLE verdict the script emits). Promote backlog->ready once the dep is DONE_VERIFIED.",
      "note": "Target: docs/agents/dev-team/flow/main.md Step 0-PREFLIGHT verdict table. Mechanism: Add a RUN-IDLE branch -> JUMP straight to end (skip Step 0a drain-signals entirely — mirrors cowork silent-release: emit last state, release locks, ZERO commit). THIN JUMP-TO branch only, no logic in the flow doc."
    },
    {
      "id": "P1-IDLE-AUDITOR-CRON-WIRING",
      "title": "RC-IDLE-LOOPS §1.1: cron-detect-loop SKILL Job-3(Tier-2)/Job-4(Tier-3) — wire probe --tier=N as pre-gate",
      "owner": "agent-father",
      "status": "BACKLOG",
      "type": "FIX",
      "priority": "high",
      "size": "S",
      "zone": ".claude/skills/cron-detect-loop/",
      "sprint": "SYSTEMIC-REMAKE-P1",
      "brief_ref": "docs/architecture-briefs/2026-07-04-systemic-remake.md §1.1",
      "depends": ["P1-IDLE-AUDITOR-TIER23-SCRIPT"],
      "created_at": $now,
      "created_by": "po-s141-systemic-remake-phase1",
      "status_note": "HELD on depends P1-IDLE-AUDITOR-TIER23-SCRIPT (wiring calls the --tier=N flag that task adds). Promote backlog->ready once the dep is DONE_VERIFIED.",
      "note": "Target: .claude/skills/cron-detect-loop/SKILL.md Job 3 (Tier-2 '0 */4') + Job 4 (Tier-3 '0 2'). Mechanism: Wire `bash scripts/agents-flow/auditor-tier1-probe.sh --tier=2` (and --tier=3) as a pre-gate, EXACTLY mirroring how Job 2 already wires Tier-1. Prompt-text wiring only."
    },
    {
      "id": "P1-DETECTOR-CLOSURE-TASK-ARCHIVE",
      "title": "RC-DETECTOR §1.2: pm/flow/task-archive.md — on DONE_VERIFIED w/ origin_signal_id, flip signal_queue row READ->RESOLVED",
      "owner": "agent-father",
      "status": "BACKLOG",
      "type": "FIX",
      "priority": "high",
      "size": "S",
      "zone": "docs/agents/pm/",
      "sprint": "SYSTEMIC-REMAKE-P1",
      "brief_ref": "docs/architecture-briefs/2026-07-04-systemic-remake.md §1.2",
      "depends": ["P1-DETECTOR-CLOSURE-TRIAGE-SIGNALS"],
      "created_at": $now,
      "created_by": "po-s141-systemic-remake-phase1",
      "status_note": "HELD on depends P1-DETECTOR-CLOSURE-TRIAGE-SIGNALS (consumer needs the origin_signal_id field the producer stamps). Promote backlog->ready once the dep is DONE_VERIFIED.",
      "note": "Target: docs/agents/pm/flow/task-archive.md. Mechanism: On a task reaching DONE_VERIFIED, if it carries origin_signal_id, flip that signal_queue row READ->RESOLVED via the already-specced CLOSE protocol (.claude/skills/signal-dashboard/SKILL.md §CLOSE). CONSUMER half of the closure. AC(§1.2#2, machine-checkable): a synthetic task carrying origin_signal_id reaches DONE_VERIFIED -> the referenced signal_queue row flips to RESOLVED in the SAME commit (no manual step)."
    },
    {
      "id": "P1-DRIFT-PARITY-TEST-EXTEND",
      "title": "RC-DRIFT §1.3: extend tool-registry-parity.test.ts to key narrative docs + wire gen-project-stats/gen-tool-registry cadence",
      "owner": "developer",
      "status": "BACKLOG",
      "type": "FIX",
      "priority": "high",
      "size": "M",
      "zone": "cross-service/",
      "sprint": "SYSTEMIC-REMAKE-P1",
      "brief_ref": "docs/architecture-briefs/2026-07-04-systemic-remake.md §1.3",
      "depends": ["P1-DRIFT-NARRATIVE-NUMBER-POINTER"],
      "created_at": $now,
      "created_by": "po-s141-systemic-remake-phase1",
      "status_note": "HELD on depends P1-DRIFT-NARRATIVE-NUMBER-POINTER (test must run AFTER hardcoded numbers become pointers, else it red-fails on current prose). Promote backlog->ready once the dep is DONE_VERIFIED.",
      "note": "Targets: (a) existing tool-registry-parity.test.ts — extend to ALSO grep CLAUDE.md, docs/standards/mcp-tools.md, docs/ARCHITECTURE.md for hardcoded tool/cron counts and FAIL if they diverge from generated SSOT docs/data/tool-registry.json (this is the exact gap the finding names: no CI check keys these copies). (b) scripts/gen-project-stats.ts / scripts/gen-tool-registry.ts — wire into a cadence (CI on push to main, OR fold into an existing frequent cron with a `git diff --quiet` short-circuit so a no-op regen produces zero commit). (c) brief §1.3 row4: project-stats.json lastSuccessfulCycle/currentSprint — verify zero readers (mirror the recurringBugEscalationFlag grep) then delete or replace with a computed value. AC(§1.3#2): inject a deliberately wrong count into a throwaway copy of a narrative doc -> test exits non-zero. AC(§1.3#3): cronJobCount matches the cron.schedule() call-site count within one regen cycle (generator post-write validation gen-project-stats.ts L235-239)."
    }
  ] | map(select(.id as $i | ($all_ids | index($i)) | not))) as $backlog_mints

# ── M1: promoted rows (pull from backlog[], transform, will be re-homed to ready[]) ──
| ([ (.task_board.backlog // [])[]
     | select(type=="object" and (.id as $i | $promote_ids | index($i)))
     | .status = "READY"
     | .promoted_at = $now
     | .promoted_by = "po-s141-systemic-remake-phase1"
     | .promote_phase = "P1-RC-DETECTOR"
     | .promote_ref = "docs/architecture-briefs/2026-07-04-systemic-remake.md §1.2"
     | (if   .id == "FIX-CONTEXT-BLOAT-HOOK-SETTLE-READ-DEBOUNCE" then (.plan_only = false | .owner = "developer")
        elif .id == "FU-AUDITOR-D4-SIGNAL-ID"                     then (.owner = "developer")
        elif .id == "FIX-SIGNALQUEUE-DUP-ID-GUARD"                then (.owner = "developer")
        elif .id == "FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT"  then (.owner = "agent-father" | .po_owner_note = "brief §1.2 promote; fix is a docs/agents/system-auditor/flow/main.md two-layer-freshness edit (co-fix with B-11) -> agent-father, NOT ba. dod[] already carries machine-checkable ACs.")
        else . end)
   ]) as $promoted_rows

# ── apply M1 + M2 to the two lanes (conservation-safe) ───────────────────────
| .task_board.backlog = ((.task_board.backlog // [])
     | map(select((type=="object" and (.id as $i | $promote_ids | index($i))) | not)))
     + $backlog_mints
| .task_board.ready = ((.task_board.ready // []) + $promoted_rows + $ready_mints)

# ── M3: sprint_goal entry (id-guarded) ───────────────────────────────────────
| .sprint_goal.entries = ((.sprint_goal.entries // [])
     | if (map(.sprint_id) | index("SYSTEMIC-REMAKE-P1"))
       then .
       else . + [{
         "sprint_id": "SYSTEMIC-REMAKE-P1",
         "status": "active",
         "priority": "high",
         "created_by": "po-s141-systemic-remake-phase1",
         "created_at": $now,
         "origin": "USER-GREEN-LIT systemic remake (owner-approved; Phase-2 router-gated). Router-dispatched 2026-07-04. Brief docs/architecture-briefs/2026-07-04-systemic-remake.md §1; diagnosis docs/incidents/2026-07-04-systemic-review-churn-without-convergence.md.",
         "vision": "Phase-1 containment-now: port the proven cowork LOOP-07 no-work gate into the dev-team + auditor engines (RC-IDLE-LOOPS), drain the parked detector fixes + wire the READ->RESOLVED signal closure (RC-DETECTOR), and stop narrative docs from lying about live tool/cron counts (RC-DRIFT). A clean git log is the instrument that lets Phase-2 be measured.",
         "scope_in": "RC-IDLE-LOOPS §1.1 (dev-team+auditor idle gates), RC-DETECTOR §1.2 (4 promoted detector fixes + READ->RESOLVED closure wiring), RC-DRIFT §1.3 (quarantine zero-reader freeze flag + parity-test extension + narrative number->pointer). Bounded, no redesign, ships on main today.",
         "scope_out": "Phase-2 STRUCTURAL — RC-VERIF+RC-CONVERGE (orch-apply completion gate + DEGRADED enum + recurring-bug re-arm), RC-ORCHMONO (hot/cold split), RC-GITSTATE (gitignore migration), RC-CEREMONY. USER-GATED: router gates with the owner before ANY write-path/verification change lands.",
         "success_metric": "All Phase-1 machine-checkable ACs (§1.1 #1-3, §1.2 #1-3, §1.3 #1-3) pass; chore-commit noise trends down on empty-board ticks (a clean git log = the Phase-2 instrument)."
       }]
       end)

# ── M3: repoint top-level .head → pm to sequence the P1 chain ─────────────────
| .head = {
    "status": "in_progress",
    "active_task_id": "P1-IDLE-DEVTEAM-PREFLIGHT-SCRIPT",
    "next_agent": "pm",
    "next_action": "SYSTEMIC-REMAKE-P1 (containment-now): pm — sequence the 10 minted P1-* atomic tasks + the 4 promoted RC-DETECTOR rows (FIX-CONTEXT-BLOAT-HOOK-SETTLE-READ-DEBOUNCE / FU-AUDITOR-D4-SIGNAL-ID / FIX-SIGNALQUEUE-DUP-ID-GUARD / FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT) into the dev chain: honor depends[] (4 dependents held in backlog[]), WIP=2, create handoff docs, confirm code owners. Owners already set per brief §5 (developer / agent-father / claude-manager-helper). STOP AT PHASE-1 ONLY — RC-VERIF/RC-CONVERGE/RC-ORCHMONO/RC-GITSTATE/RC-CEREMONY (Phase-2 structural) are USER-GATED; router gates them with the owner before any write-path/verification change lands.",
    "updated_at": $now,
    "updated_by": "po-s141-systemic-remake-phase1",
    "note": "Phase-1 board created by po (brief 2026-07-04-systemic-remake.md §1). 4 promoted -> ready[]; 10 minted (6 ready[], 4 backlog[]-held-on-depends). Phase-2 NOT started."
  }

# ── metadata bump (known keys only; root is .strict()) ───────────────────────
| ._updated_at = $now
| ._updated_by = "po-s141-systemic-remake-phase1"
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s141-systemic-remake-phase1"
