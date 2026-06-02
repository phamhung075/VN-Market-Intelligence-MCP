# PO Notebook

## c · 2026-06-02T06:20Z — TRIAGE (dev-team) — 2 signals → BATCH(2): SPIKE→architect (BEQ-1) + cowork leader-lock self-lockout SPRINT-S→architect→agent-father

**Inputs:** orch head idle, WIP 0/2 (FRONTEND-CORRECTNESS just closed). 2 pendingSignals[] (both pre-READ by dev-team):
1. spike_request HIGH `po-20260602T045900` (BEQ-1, sprint BCTC-EXTRACT-QUALITY) — my own prior req surfacing back; pin 3 data-layer symptoms each to ONE layer. Asked: architect vs agents-architect?
2. defect_report HIGH `cowork-team-20260602T051848Z` — cowork dispatcher Step 0b leader-lock self-lockout drops guaranteed market dishes.

**RAW-VERIFY (live gateway probe, NOT relaying badges):**
- **Signal 2 root cause CONFIRMED via live `task_claim`.** Probed `cowork-leader-probe-po`: 1st claim → `{claimed:true}`; immediate re-claim SAME owner_agent=cowork-dispatcher, unexpired → **`{claimed:false, current_holder:{owner_agent:"cowork-dispatcher"...}}`**. So `task_claim` is NOT re-entrant for the same owner — renewal is `task_heartbeat` only. Step 0b (main.md L56) treats `claimed!=true` as "held by peer→silent EXIT", but Step 4.6b heartbeats the leader lock to +1800s on every WON tick → for ~2 ticks the SAME dispatcher locks ITSELF out → single-window slots in that shadow silently DROPPED. `current_holder.owner_agent` IS in the payload → reporter's heartbeat-and-proceed fix is mechanically feasible.
- **Impact CONFIRMED:** schedule.json — chef-morning guaranteed=true cron `15 5 * * 1-5` (only matches 05:15 tick). A 05:03Z WON tick heartbeats leader to ~05:34Z → 05:18Z tick self-locked → chef-morning DROPPED 2026-06-02. SYSTEMIC: all 5 guaranteed slots (chef-morning/eod/evening, digest-sunday, tnb-audit) + any single-window slot vulnerable. Published-marker gate (Step 5) prevents double-PUBLISH, NOT this DROP — different layer.
- **Recurring-bug escalation triggered:** `c502b88b` (2026-06-01) already patched 2 cowork-dispatcher defects (Steps 4/7/8); Phase-2 leader-lock born `288e8888`. This is a NEW step (0b) but same dispatcher + leader-lock subsystem churn → per feedback_recurring_bug_escalation → thin ARCHITECT design pass FIRST (must prove heartbeat-and-proceed does NOT reopen the duplicate-SPAWN hole Phase 2 closed — distinct from duplicate-publish), then agent-father implements. NOT straight-to-agent-father.
- **Dedup:** no open backlog/active/signal_queue task on leader/Step0b/cowork-leader. Clean.
- **Signal 1 routing DECIDED = architect (NOT agents-architect).** BEQ-1 is pure BCTC extraction data-layer root-cause (empty refine / zeroed secondary lines / garbage `/docs` scalars) — zero inter-agent comms. agents-architect was my own wrong route; correcting. Zone=multi (apps/pdf-extractor OCR/extract + apps/mcp-server refine+/docs scalars+DB). PLAN-ONLY findings doc, timebox 120m.

**DECISION → BATCH(2):**
1. SPIKE BEQ-1-SPIKE → architect, zone multi, PLAN-ONLY findings doc.
2. SPRINT-S COWORK-LEADER-SELFLOCK → architect (design heartbeat-and-proceed + own-held detection) then agent-father (implement main.md Step 0b). HIGH — drops guaranteed dishes daily.

**Carry-over (deferred, valid):** A-01b (FLEET-HOST-SAFETY T3 TODO) · MCP-SURFACE-GAPS (2 TODO) · FB-GATE-2 + NB-PRUNE-IMPL (confirm shipped) · FU-FIXER-NO-FORCE · FPT-OPUS-DEEPDIVE/ESC-OPUS-DISPATCH-SEAM · BCTC-TABLE-2 + BCTC-CTG-ATTACHMENT-FETCH + FU-BANK-CODECOL · FU-ORCH-HEAD-CAS · FU-SIGNAL-DASHBOARD-CAP · MSG-1/3 · EI-P2-* · CHEF-FLOW-CAP-REFACTOR · RE-CAP-1.
