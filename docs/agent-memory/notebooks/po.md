# PO Notebook

## c · 2026-06-06T20:09Z — SPRINT KICKOFF: WORKFLOW-FLUIDITY (operator standing request: fluid, no conflict/deadlock/bottleneck)

**Input:** agents-architect audit brief 2026-06-06-workflow-fluidity-audit.md (13 findings: 3 OK · 3 CONFLICT · 3 DEADLOCK-RISK · 4 BOTTLENECK). F-4 journal lost-write already fixed inside ORCH-TASK-CANON (per-agent paths); F-5 cap sentinel already telegrams+rolls in SKILL — both verified raw, scoped OUT.

**Shape:** WF-1 (agent-father, F-12+F-2 FAIL-LOUD-STOP-RELEASE: task_release + .head idle-reset on ALL developer/qa/fixer STOP paths + dev-team Step 0b BLOCKED check) → WF-2 (dev-mcp-server, F-9+F-3: FU-ORCH-HEAD-CAS promoted from narrative watch_item — NO backlog row existed — + signal_queue fresh-read-compare-retry vs :00 cowork+auditor row drop) → WF-3 (architect SPIKE 2h, F-8 dev-* gateway binding ruling; recurred in ORCH-TASK-CANON F1B mutex-less). BA-WORKFLOW-FLUIDITY in backlog feeds the chain.

**Triage rulings:** F-10 WIP telemetry + F-11 dual-path CRITICAL emit → DEFERRED row WF-DEFER-THROUGHPUT (system-auditor); F-13 c44 parallel proof → DEFERRED row SPIKE-C44-PARALLEL-PROOF. depends[] deliberately empty on WF-1..3 — dispatch-time ordering only, so one BLOCKED task can't strand the deadlock-fix sprint (anti-pattern noted in goal).

**Done this cycle:** sprint_goal entry active + sprint container + 3 backlog rows via jq -f file filter, sentinel + sibling-count verified (goals 15→16, sprints 21→22, backlog 28→31, done 77 intact), atomic mv. Umbrella lock task:WORKFLOW-FLUIDITY claimed (po, 3600s) — gateway reachable. Journal STEP po-S1 at decisions/sprint-WORKFLOW-FLUIDITY-po.md.

**Carry-over (next PO cycle):**
- BA spec returns → review-ba-spec.md: spec must cover class-not-instance (all 3 of developer/qa/fixer STOP paths + fail-loud-protocol.md itself), WF-2 both options to architect (retry-loop vs SQLite signal_queue migration), QA negative proofs (injected STOP → immediately claimable + head idle; interleaved appends → zero lost rows). Reject if developer-only.
- ORCH-TASK-CANON lock release confirm; release task:WORKFLOW-FLUIDITY only at signoff.
- Still open from triage lane: playwright-row closure ~23:37Z proof; FIX-SLA-WEEKEND-AWARE Sunday proof; WATCH-2 refine slot-2; CTG-Q1 OCR watch; MEMORY.md >24.4KB housekeeping.

## c · 2026-06-06T20:33Z — USER BUG TRIAGE: FIX-ORCH-DONE-GRID-COLS (frontend)

**Input:** user bug report — orch dashboard DONE-list rows render Title one-word-per-line (~1000px tall, e.g. AF-ORCH-F1A-F4), others fine. Shipped by ARCH-ORCH-F3.

**Root cause (verified raw in dashboard.orchestration.tsx L619/L647/L660):** F3 div-grid layout makes EACH row its own grid container with `minmax(Npx,auto)` tracks → tracks resolve per-row from content; a long status_note expands the Status track to max-content, crushing the 1fr Title track. Rows never align with header.

**Done this cycle:** filed FIX-ORCH-DONE-GRID-COLS (S, zone apps/frontend/, owner dev-frontend, status TODO) into backlog via jq -f + sentinel-guarded atomic mv (backlog 31→32). Note mandates structural fix (shared non-content-dependent track const for header+rows, break-words / move long notes to accordion sub-row) — NOT a cosmetic wrap patch. AC = live verify on localhost:3001/dashboard/orchestration after frontend container REBUILD. Journal STEP po-S2.

**Carry-over:** when fix lands → live-verify row AF-ORCH-F1A-F4 myself (raw, not badge); confirm rebuild not restart. Backlog hygiene flag: 3 backlog entries have null task_id (WF rows use different key?) — check next triage.
