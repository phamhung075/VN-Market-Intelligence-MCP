# PM — Notebook

## FEAT-NEWS-DECISION-RESUME DECOMPOSITION · 2026-06-29T162600Z

**INPUT:** BA-FEAT-NEWS-DECISION-RESUME spec complete (docs/handoffs/BA-FEAT-NEWS-DECISION-RESUME.md), architect brownfield design §Dev-hop split with explicit FR grouping (Hop 1: FR-1/2/3, Hop 2: FR-4/5)

**OUTPUT:** 2 atomic tasks (TASK-FEAT-NEWS-DR-HOP1, TASK-FEAT-NEWS-DR-HOP2) with tight coupling + rebuild orchestration, both handoff files created (TASK-FEAT-NEWS-DR-HOP1.md, TASK-FEAT-NEWS-DR-HOP2.md), task_board.ready updated via orch-apply.sh with HOP1 runnable now + HOP2 blocked_on HOP1, decision journal entry recorded.

**Atomization (2 tasks, sequential with rebuild step between):**
1. **TASK-FEAT-NEWS-DR-HOP1 (dev-mcp-server, M):** FR-1 (buildDecisionResume builder + DOMAIN_VN_LABEL + truncateAt120) + FR-2 (ADD COLUMN decision_resume TEXT to rag_analyses) + FR-3 (DTO pick-up in newsSentimentHandler). Status: TODO (runnable now, no deps). Blocks HOP2. Requires mcp-server container rebuild after completion.
2. **TASK-FEAT-NEWS-DR-HOP2 (dev-frontend, S):** FR-4 (SentimentPill remap bullish→green/bearish→red) + FR-5 (decision_resume strip skim-first + impact_summary Collapsible collapse). Status: TODO (blocked by HOP1 + rebuild). Depends_on: TASK-FEAT-NEWS-DR-HOP1.

**Sequencing:**
- Tier-1 (start now): HOP1 only (dev-mcp-server independent work)
- Ops rebuild (after HOP1 DONE): mcp-server container (single-service, not full down&&up)
- Tier-2 (after rebuild verified): HOP2 (dev-frontend consumes live /api/news-sentiment DTO)

**Risk flags propagated from Architect:**
- RISK-3 (MEDIUM): TASK-17 helper insertRow() must extend with optional decision_resume param
- RISK-5 (LOW): Frontend guard on `item.decision_resume != null && length > 0`
- All edge cases (neutral→null, empty keywords, >3 tickers cap, unknown domain, >120 truncation) documented in handoffs with test cases

**Board mutation (atomic via orch-apply.sh):**
- 2 tasks added to task_board.ready with sprint="FEAT-NEWS-DECISION-RESUME"
- HOP1 status=TODO (ready), HOP2 status=TODO (blocked by dependency)
- Dependency: HOP2.depends_on=[HOP1]; HOP1.blocks=[HOP2]
- Validators: passed, no coherence errors

**Handoffs created (2 total):**
- TASK-FEAT-NEWS-DR-HOP1.md (backend builder + DB + DTO; 7 AC)
- TASK-FEAT-NEWS-DR-HOP2.md (frontend pill + card; 5 AC)

**PM decisions:**
1. **Multi-zone split:** Architect design is definitive; zone isolation (mcp-server vs frontend) is sound
2. **Rebuild orchestration:** Single-service rebuild (mcp-server) handled by ops between hops; dev-team Step 3 will dispatch HOP2 only after rebuild verified
3. **Language boundary:** Decision résumé is plain Vietnamese only; DOMAIN_VN_LABEL translation table is authoritative, enforced in builder
4. **No fake data:** Builder derives from real classifier signals (neutralizeNews), no LLM or invention
5. **Backfill policy:** Legacy NULL rows receive no recompute; frontend graceful omit

**Decision journal:** docs/agent-memory/decisions/sprint-FEAT-NEWS-DECISION-RESUME-pm-decomp.md

---

## c323 CROSS-SESSION-MULTI-TEAM-ORCH P1 DECOMPOSITION · 2026-06-28T083000Z

**PARENT:** Architect brief complete (docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md), PO signed off with LOCKED DoD gate, decision journal recorded (docs/agent-memory/decisions/sprint-CROSS-SESSION-MULTI-TEAM-ORCH-po.md)

**INPUT:** PO signoff signal (docs/signals/po-20260628T081903Z.json), architect brief §8 Concrete Follow-On Tasks + §Sequencing Summary + §10 file anchors, sprint-vision entry in sprint_goal with P1.5 additive block (left untouched per instructions)

**OUTPUT:** 9 atomic P1 FRs decomposed into atomic tasks (TASK_1973-1981), all 9 TASK_NNN.md handoff files created, task_board.backlog updated atomically via orch-apply.sh with correct dependency DAG, decision journal entry recorded. **P1.5/P2/P3 FRs explicitly HELD (not decomposed).**

**P1 Atomization (9 tasks, ordered + parallel):**
1. **TASK_1973 (P1-MCP-1, S):** SQL migration — ADD COLUMN owner_client_session TEXT (nullable) in migrateCoordinationTable transaction. FIRST, no deps. Blocks MCP-2 and MCP-3.
2. **TASK_1974 (P1-MCP-2, M):** coordinationStore.ts matching-ladder rebind — claimTask/heartbeatTask/releaseTask/releaseOrphanTask. Gated on MCP-1. Blocks P1-FINAL.
3. **TASK_1975 (P1-MCP-3, M):** coordinationTools.ts Zod schema + param threading. Gated on MCP-1. Blocks P1-FINAL.
4. **TASK_1976 (P1-AF-1, S):** CLAUDE.md step 2.5 PRE-CLAIM gate insertion. Gated on MCP-1. Blocks P1-FINAL. (Can parallel MCP-2/3.)
5. **TASK_1977 (P1-AF-2, M):** dispatch-claim SKILL lift to router scope + canonical task_id namespace per §3.1. Gated on MCP-1. Blocks P1-FINAL. (Can parallel MCP-2/3.)
6. **TASK_1978 (P1-AF-3, S):** leader-lock.md delete self-held-heartbeat anti-pattern + session-id comparison branch. Gated on MCP-1, MCP-2. Blocks P1-FINAL.
7. **TASK_1979 (P1-AF-4, M):** task-lock SKILL rebind authoritative key to owner_client_session. Gated on MCP-1, MCP-2. Blocks P1-FINAL.
8. **TASK_1980 (P1-FINAL, S — LOCKED DoD gate):** Make owner_client_session REQUIRED in all tool schemas + remove owner_agent from all ownership WHERE predicates. Gated on MCP-2/3 + AF-1/2/3/4. Blocks P1-REGRESSION. **PO-mandated, non-negotiable (po-S2): if dropped, same-role multi-team bug silently re-opens.**
9. **TASK_1981 (P1-REGRESSION, L):** Acceptance tests verifying all 8 failure-mode scenarios from brief §7 P1 matrix pass + regression test (two same-role sessions cannot self-heartbeat-claim). Gated on P1-FINAL. Closes P1.

**Sequencing enforcement (dependency DAG in task_board):**
- MCP-1 → MCP-2, MCP-3 (serial: column must exist before matching-ladder change)
- All MCP-2, MCP-3, AF-1..4 → P1-FINAL (parallel: all callers must ship before the REQUIRED flip)
- P1-FINAL → P1-REGRESSION (serial: gates must be live before acceptance testing)

**Parallel wave structure (tier-1 after MCP-1 completes):**
- Tier-1 (parallel): MCP-2 ∥ MCP-3 ∥ AF-1 ∥ AF-2 ∥ AF-3 ∥ AF-4 (6 independent tracks, all depend on MCP-1 only)
- Tier-2 (serial, after all Tier-1 complete): P1-FINAL
- Tier-3 (serial, after P1-FINAL): P1-REGRESSION

**Critical PM decisions:**
1. **P1 scope locked:** Only P1 FRs decomposed. P1.5 (orphan detection + work takeover) is additive and HELD (architect §P1.5 not yet landed in brief; PO pre-approved shape in sprint_goal .p1_5 block; decomposition deferred until architect section lands + PO re-confirms). P2/P3 remain HELD.
2. **P1-FINAL is a point-of-no-return gate:** Marked as "LOCKED DoD gate (PO-mandated, non-negotiable)". If dropped or weakened, the same-role multi-team bug re-opens (two same-role sessions both fall through to role match). Enforced by code review + PO sign-off.
3. **RAW-verify note encoded:** All MCP tasks must RAW-verify against LIVE coordination.db in the Docker named volume (host ./data/coordination.db is a stale decoy — encoded in every MCP task handoff).

**Board mutation (atomic via orch-apply.sh):**
- 9 tasks added to task_board.backlog with sprint="CROSS-SESSION-MULTI-TEAM-ORCH"
- TASK_1973 status=TODO (ready to start), others status=BACKLOG (gated)
- Dependency DAG encoded: depends_on / blocks fields per sequencing summary
- Validators: 74 pre-existing SHG warnings (non-blocking), new tasks validated cleanly

**Decision journal:** docs/agent-memory/decisions/sprint-CROSS-SESSION-MULTI-TEAM-ORCH-pm-decomposition.md (PM-DJ-GATE: P1 scope lock, P1.5/P2/P3 held, atomic FR list, dependency DAG, RAW-verify notes)

**Handoffs created (9 total):**
- TASK_1973-p1-mcp-1-migration-sql.md
- TASK_1974-p1-mcp-2-coordinationstore.md
- TASK_1975-p1-mcp-3-coordinationtools.md
- TASK_1976-p1-af-1-claude-md-step25.md
- TASK_1977-p1-af-2-dispatch-claim-skill.md

## c325 P1 ENUM-DRIFT CORRECTIVE GATE FIX · 2026-06-28T113700Z

**PARENT:** PO step po-S10 identified router pre-claim gate non-functional (step 2.5 task_kind="intent" → -32602). Root cause: deployed coordinationStore.ts CHECK + TS union + Zod enum all have only 4 kinds (cowork-slot, sprint-task, dashboard-row, commit-mutex); 'intent' absent. PO classified as class-level bug (same pattern as TASK_1976/1977 commit-mutex enum-drift).

**INPUT:** PO decision (po-S10/po-S11: complete 7-kind taxonomy in ONE Migration-3, not piecemeal); router signal dogfooding proof; live enum mismatch verification

**DECISION:**
- **Only path:** ONE atomic Migration-3 in migrateCoordinationTable, with OWN detection guard (!!editing line-180 CHECK alone NO-OPS on live dbs; previous 'commit-mutex' guard already passed)
- MUST recreate task_locks table (SQLite cannot ALTER CHECK in-place); follow Migration 1 precedent (PRAGMA legacy_alter_table pattern)
- Complete 7-kind taxonomy (intent + orphan-signal + session-presence) now, inert CHECK values until callers ship per-phase

**BOARD SURGERY:**
1. **Mint TASK_1989** (FIX-COORD-TASKKIND-ENUM-INTENT-GATE): P1 priority, M size, zone apps/mcp-server/, depends TASK_1980, blocks TASK_1983-1988
2. **Supersede TASK_1982:** status=CANCELLED, status_note="Superseded by TASK_1989 (enum-drift corrective P1 gate fix): full 7-kind schema migration replaces partial orphan-signal+redispatch_count scope"
3. **Re-gate TASK_1983-1988:** all 6 now depend on TASK_1989 (ensures P1 schema lands before P1.5 gate logic; PO: "real intra-P1.5 dependency is the schema")

**Handoff:** TASK_1989-fix-coord-taskkind-enum-intent-gate.md
- Complete acceptance criteria: Migration-3 block with detection guard, all 3 sites widened (CHECK/TS/Zod), redispatch_count column folded in, RAW-verify against live named-volume db
- QA DoD: live integration check (router PRE-CLAIM task_kind="intent" → claimed:true against rebuilt schema; close TASK_1981 store-level-only gap)
- Post-ship: ops REBUILD mcp-server (post-code-change rule), qa regression, architect non-blocking doc-sync

## c324 CROSS-SESSION-MULTI-TEAM-ORCH P1.5 DECOMPOSITION · 2026-06-28T084500Z

**PARENT:** PO released P1.5 decomposition (po-S6..S9 confirmed architect §6.5 against 6 PO acceptance lenses; APPROVED-WITH-HARDENING + 6 LOCKED DoD additions). P1 (TASK_1973-1981) already decomposed, left unchanged per instructions. HOLD P2/P3.

**INPUT:** PO signoff signal (docs/signals/po-20260628T083501Z.json + orch-state.sprint_goal .p1_5 block), architect brief §6.5 Liveness Detection + Orphan Work Takeover, PO decision journal po-S6..S9 with 6 locked DoD clauses and sequencing gate, architect skeleton (§8 Concrete Follow-On Tasks P1.5-MCP-{1,2,3,4} + P1.5-AF-{1,2})

**OUTPUT:** 7 atomic P1.5 FRs decomposed into tasks (TASK_1982-1988), all 7 TASK_NNN.md handoff files created with DoD locks baked verbatim-in-intent, task_board.backlog updated atomically via orch-apply.sh with correct dependency DAG (every P1.5-* blockedBy TASK_1980, AF adoption FRs preferred-blockedBy TASK_1981), decision journal entry recorded. **P2/P3 remain explicitly HELD.**

**P1.5 Atomization (7 tasks, ordered + parallel, all blockedBy TASK_1980 P1-FINAL):**
1. **TASK_1982 (P1.5-MCP-1, S):** SQL migration — ADD COLUMN redispatch_count INTEGER DEFAULT 0; enum-widen task_kind CHECK to add 'orphan-signal'. FIRST in MCP sequence. Blocks MCP-2. Blockers: TASK_1980 (P1-FINAL flip).
2. **TASK_1983 (P1.5-MCP-2, M):** gcExpiredLocks pre-GC emit logic — scan for expired locks (ALLOW-LIST: sprint-task, cowork-slot, cron-tick, dashboard-row only; NOT commit-mutex/intent/cron-fire), emit orphan-signal rows with redispatch_count carry-forward (DoD-P15-3), delete original row in same transaction. Gated on MCP-1. Blocks MCP-3. DoD: carry-forward redispatch_count (P15-3), ALLOW-LIST predicate (P15-4).
3. **TASK_1984 (P1.5-MCP-3, S):** Server-side periodic reaper timer — setInterval(600s) calling gcExpiredLocks(grace=300) in mcp-server startup. Gated on MCP-2. Blocks MCP-4. DoD: try/catch + log+continue on DB-busy, do NOT kill timer on error (P15-5).
4. **TASK_1985 (P1.5-MCP-4, S):** listHeldTasks extension — add optional owner_agent filter param + redispatch_count to output schema. Gated on MCP-3. Blocks AF-1, AF-2. Prerequisite for adopter queries.
5. **TASK_1986 (P1.5-AF-1, M):** Router step 2.5 adoption probe — before dispatching new work, query orphan-signals by role, attempt re-claim for redispatch_count < N_MAX=3, escalate + BUG telegram for >= N_MAX (idempotent). Gated on MCP-4 + TASK_1980 + TASK_1981 (preferred). Router DEFERS tree-hygiene to dev-team (never implements). DoD: P15-1 router-defers, P15-2 read-only marker probe, P15-3 carry-forward, P15-6 honest-bound doc.
6. **TASK_1987 (P1.5-AF-2, M):** Dev-team Step 0a adoption — read orphan-signals for sprint-tasks, claim + tree-hygiene (git status + git checkout -- <file> every uncommitted live-effect edit to last-good) + checkpoint resume from git SHA + board flip via orch-apply.sh. Gated on MCP-4 + TASK_1980 + TASK_1981 (preferred). DoD: P15-1 tree-hygiene-precondition, P15-2 read-only marker probe, P15-3 carry-forward, P15-6 honest-bound doc.
7. **TASK_1988 (P1.5-REGRESSION, L):** Acceptance test suite — 6 DoD compliance tests (P15-1/2/3/4/5/6) + 9 failure-mode scenarios from brief §7 P1.5 matrix. ALL use REAL adoption cycles (not hand-set counters), RAW-verify against live coordination.db. Gated on all MCP + AF tasks.

**Sequencing enforcement (unbreakable, PO-mandated):**
- EVERY P1.5-* task blockedBy TASK_1980 (P1-FINAL flip) — orphan attribution is unambiguous only once no lock row carries NULL owner_client_session (grounds po-S2)
- PREFERRED: P1.5-AF-1 and P1.5-AF-2 additionally blockedBy TASK_1981 (P1 regression green) — adoption rides on claim semantics being proven
- Within P1.5 MCP sequence: MCP-1 → MCP-2 → MCP-3 → MCP-4 (serial)
- AF tasks (AF-1, AF-2) can parallel each other, both depend on MCP-4
- P1.5-REGRESSION last, depends on all others

**Parallel wave structure (after P1-FINAL complete):**
- Tier-1: MCP-1 (serial, prerequisite)
- Tier-2 (after MCP-1): MCP-2 ∥ MCP-3 ∥ MCP-4 (sequential chain)
  - Actually: MCP-2 (blocks MCP-3) → MCP-3 (blocks MCP-4)
- Tier-3 (after MCP-4): AF-1 ∥ AF-2 (can parallel each other)
- Tier-4 (after AF-1, AF-2): REGRESSION

**DoD Locks Baked (6 PO-locked, per po-S7..S9):**
1. **DoD-P15-1:** Baked into TASK_1987 (P1.5-AF-2) and referenced in TASK_1986 (P1.5-AF-1 DEFERS). Load-bearing: sprint-task adopter MUST git status + git checkout -- <file> every uncommitted live-effect edit to last-good BEFORE resuming; SHA=resume point, tree-hygiene=precondition. Router never reverts (routes, never implements). Scoped to single-host shared-tree topology. (grounds: feedback_dead_worker_uncommitted_live_file_revert)
2. **DoD-P15-2:** Baked into TASK_1986 (router adoption probe) + TASK_1987 (dev-team adoption) + handoff doc §6.5.5. Published-artifact existence probe MUST be read-only task_list_held, NEVER task_heartbeat/claim (create-if-absent masks never-fired publish). (grounds: feedback_guaranteed_slot_week_key_double_post #3)
3. **DoD-P15-3:** Baked into TASK_1983 (reaper emit: carry-forward redispatch_count into payload) + TASK_1986/1987 (adopter reads counter + carries it into re-claim) + TASK_1988 poison test. Adopter MUST propagate redispatch_count from orphan-signal INTO re-claim payload (else counter resets each adoption → N_MAX=3 never reached → guard inert). Escalation idempotent: BUG telegram ONCE on transition to ESCALATED; later adopters skip silently. Test MUST assert counter CHAINS across 3 real adopt→die cycles. (grounds: feedback_recurring_bug_escalation)
4. **DoD-P15-4:** Baked into TASK_1983 (gcExpiredLocks scan predicate). Reaper emits orphan-signals ONLY for kinds with defined resume contract (sprint-task, cowork-slot, cron-tick-with-published-checkpoint, dashboard-row) via ALLOW-LIST — NOT deny-list, which emits un-adoptable signals for commit-mutex/intent:*/cron-fire-claims (no resume row → adopter undefined). New kinds default to NOT-emitting.
5. **DoD-P15-5:** Baked into TASK_1984 (setInterval reaper timer). 600s timer MUST wrap gcExpiredLocks in try/catch + log+continue on transient DB-busy; one uncaught error must NOT kill interval (else all-sessions-dead gap re-opens). Test: inject GC error, assert timer fires next tick. (grounds: feedback_silent_swallow_serial_bugs)
6. **DoD-P15-6:** Baked into TASK_1986 + TASK_1987 handoff docs + adoption SKILL/flow text. §6.5.1 honest-bound line (zero live sessions = zero execution; reaper only makes work ADOPTABLE, never self-heals execution) MUST be carried verbatim into router step-2.5 SKILL + dev-team Step 0a flow + orphan-signal mechanism docs.

**Board mutation (atomic via orch-apply.sh):**
- 7 tasks added to task_board.backlog with sprint="CROSS-SESSION-MULTI-TEAM-ORCH"
- All status=BACKLOG (gated on P1-FINAL flip per sequencing gate)
- Dependency DAG: every P1.5-* blockedBy TASK_1980 (mandatory); AF-1/2 additionally blockedBy TASK_1981 (preferred)
- Within-phase deps: MCP-1 → MCP-2 → MCP-3 → MCP-4; MCP-4 → AF-1 ∥ AF-2 → REGRESSION

**DoD Map (6 locks → assigned FRs):**
- DoD-P15-1 → TASK_1987 (dev-team adopter) + TASK_1986 (router defers)
- DoD-P15-2 → TASK_1986 (router probe) + TASK_1987 (dev-team adoption)
- DoD-P15-3 → TASK_1983 (reaper carry-forward) + TASK_1986/1987 (adopter pass-through) + TASK_1988 (poison test)
- DoD-P15-4 → TASK_1983 (ALLOW-LIST scan predicate)
- DoD-P15-5 → TASK_1984 (try/catch timer) + TASK_1988 (error-inject test)
- DoD-P15-6 → TASK_1986 + TASK_1987 + adoption docs (honest-bound verbatim)

**Critical PM decisions:**
1. **P1.5 scope released:** Architect §6.5 landed + PO confirmed (po-S6..S9). Decomposition now atomic per architect skeleton + 6 locked DoD gates. P2 (presence registry) and P3 (fire-time cron election) remain HELD (gate: P1 done_verified before P2 proceeds; gate: P1+P2 done_verified before P3 proceeds).
2. **Sequencing is unbreakable:** Every P1.5-* task blockedBy TASK_1980 (P1-FINAL flip) per po-S9 sequencing gate — orphan attribution ambiguous until no NULL owner_client_session remains. Preferred: AF adoption FRs additionally blockedBy TASK_1981 (P1 regression proven) since adoption semantics depend on claim being proven.
3. **Honest bound documented:** P1.5 is a best-effort adoptability layer (zero live sessions = zero execution); state explicitly in every doc per DoD-P15-6. Reaper runs in always-on mcp-server (tool server, not agent runtime), so it only marks state adoptable and emits signals — it does NOT execute work.
4. **RAW-verify mandate:** Every task (esp. MCP tasks) must RAW-verify against LIVE coordination.db in Docker named volume (host ./data/ is a stale decoy). Encoded in all handoffs, esp. P1.5-REGRESSION test suite.

**Handoffs created (7 total):**
- TASK_1982-p15-mcp-1-migration-sql.md
- TASK_1983-p15-mcp-2-gc-emit-logic.md
- TASK_1984-p15-mcp-3-periodic-reaper-timer.md
- TASK_1985-p15-mcp-4-listheldtasks-filter.md
- TASK_1986-p15-af-1-router-adoption-probe.md
- TASK_1987-p15-af-2-devteam-adoption.md
- TASK_1988-p15-regression-acceptance-tests.md

**Decision journal:** docs/agent-memory/decisions/sprint-CROSS-SESSION-MULTI-TEAM-ORCH-pm-p15-decomposition.md (PM-DJ-GATE: P1.5 decomposition rationale, DoD lock → FR mapping, sequencing gate enforcement, honest-bound commitment, RAW-verify notes)
- TASK_1978-p1-af-3-leader-lock-delete-anti-pattern.md
- TASK_1979-p1-af-4-task-lock-skill-rebind.md
- TASK_1980-p1-final-required-flip-remove-fallback.md
- TASK_1981-p1-regression-acceptance-tests.md

**Risks & constraints:**
- **Risk-1 (HIGH, locked):** Migration step 5 (P1-FINAL) cannot be dropped. If dropped, the same-role multi-team bug re-opens. Encoded as a PO-locked DoD gate; code review must verify EVERY WHERE clause in ownership decisions.
- **Risk-2 (MEDIUM):** Pre-P1 rows (with NULL owner_client_session) become unreleasable after P1-FINAL. Natural GC via TTL, or manual cleanup if needed (documented in TASK_1980).
- **Risk-3 (MEDIUM):** P1.5 depends on P1 (needs owner_client_session in every lock row to attribute expired locks to specific dead sessions). P1 does not block on P1.5 (independent), but P1.5 cannot ship before P1.
- **Constraint:** All MCP tasks must RAW-verify against LIVE coordination.db (Docker named volume), not host ./data (stale decoy).

**Done-verified gates (for PM to enforce on next cycle):**
- P1 complete: TASK_1981 (acceptance tests) DONE_VERIFIED
- All 8 failure-mode scenarios from brief §7 P1 matrix pass
- Regression test confirms two same-role sessions cannot both proceed
- Code review confirms EVERY ownership WHERE clause keys SOLELY on owner_client_session (no owner_agent ownership logic remains)
- RAW-verify against LIVE coordination.db confirms all tests passed

**Next steps:**
- Dispatch TASK_1973 to dev-mcp-server (SQL migration, FIRST)
- After TASK_1973 DONE, dispatch Tier-1 wave (MCP-2, MCP-3, AF-1/2/3/4) in parallel to respective agents
- After all Tier-1 DONE, dispatch TASK_1980 (P1-FINAL) to dev-mcp-server
- After TASK_1980 DONE, dispatch TASK_1981 (P1-REGRESSION) to qa + dev-mcp-server for acceptance testing
- After TASK_1981 DONE_VERIFIED, mark P1 complete and escalate P1.5/P2/P3 decomposition to architect for §P1.5 landing + PO re-confirmation

---

## c321 BCTC-REFINE-STALL-RETRIGGER TASK ATOMIZATION · 2026-06-27T210000Z

**PARENT:** Architect recon-first complete (docs/architecture-briefs/2026-06-27-bctc-refine-stall-retrigger.md), PO dispatch context with cowork ownership guard, WIP=1 active sprint

**INPUT:** Architect 5-task blueprint (A1 ops + A2 watchdog + B1 vic-probe + B2 discovery-fix + C1 staleness-wiring), orch-state.json board (BCTC-REFINE-STALL-RETRIGGER parent in .head), critical cowork-ownership constraint from memory feedback_router_cowork_defer_to_live_leader

**OUTPUT:** 5 atomic tasks atomized on task_board, all 5 TASK_NNN.md handoff files created (BCTC-REFINE-{A1,A2,B1,B2,C1}.md), orch-state updated atomically via orch-apply.sh, .head set to A1 (next_agent=po), decision journal recorded. WIP=1 constraint enforced (only A1 in active dispatch).

**Atomization rationale:**
- **Track (a) — Refine-Stall:** 47 docs stuck PENDING/PARTIAL. Root: cowork CronCreate not re-armed after session restart 2026-06-07. **A1 (XS ops)** unblocks TODAY via /cron-cowork-team skill (PO must verify no parallel cowork dispatcher — non-delegable to dev-team per memory feedback_router_cowork_defer_to_live_leader).
- **Track (c) — Observability:** 20-day stall went silent (zero watchdog). **A2 (S watchdog)** + **C1 (S wiring)** add server-side staleness detection + cron_job_runs logging. Definitif closes observability gap.
- **Track (b) — VIC Discovery-Gap:** VIC absent from financial_reports (parked as url_not_found after MAX_ENRICH_ATTEMPTS=5). **B1 (XS probe)** confirms hypothesis via RAW SQL query + manual reset. **B2 (S fix)** implements structural fix (re-discovery sweep OR regex patch per B1 findings).
- **Sequencing:** Seq-1 A1 unblocks all; Seq-2 (A2||B1 parallel, disjoint zones/files); Seq-3 (C1 after A2 scaffolds signals, B2 after B1 confirms hypothesis).
- **WIP=1:** .head.active_task_id = BCTC-REFINE-A1, next_agent = po. No parallel dev-team over-dispatch. Router will sequence A2+B1 wave after A1 completion.

**Critical PM decision — Cowork Ownership Guard:**
- A1 routed to `owner: "po"` (NOT dev-team). PO must verify (1) check cron_job_runs for recent refine_bctc_md runs, (2) check WORK channel logs, (3) confirm no parallel session owns cowork dispatcher (double-fire risk), (4) execute /cron-cowork-team skill.
- This guard is CANONICAL per memory. Dev-team router MUST NOT blind-arm cowork crons.

**Handoffs created:**
1. **BCTC-REFINE-A1.md** (PO action, cowork re-arm, AC-1..AC-5: verify ownership + re-arm + enable + wait slot + probe refine_status flipping)
2. **BCTC-REFINE-A2.md** (dev-mcp-server, staleness watchdog job, Check 1 queue depth + Check 2 drain-lapse, alert thresholds, unit tests)
3. **BCTC-REFINE-B1.md** (dev-mcp-server, VIC RAW-probe + manual reset, 1 SQL query, hypothesis confirmation)
4. **BCTC-REFINE-B2.md** (dev-vps-crawls, conditional structural fix per B1 findings: C-1 re-discovery sweep OR C-3 regex fix)
5. **BCTC-REFINE-C1.md** (dev-mcp-server, staleness wiring: wrapRun logging + signal-type extension, depends on A2)

**Board mutation (atomic via orch-apply.sh):**
- Created BCTC-REFINE-STALL-RETRIGGER sprint in active_sprints with 5 tasks (status=TODO)
- .head updated: active_task_id=BCTC-REFINE-A1, next_agent=po, next_action describes cowork verification + re-arm
- Validators PASS (74 pre-existing SHG warnings only, non-blocking)

**Decision journal:** docs/agent-memory/decisions/sprint-BCTC-REFINE-STALL-RETRIGGER-pm-decomposition.md (DJ-GATE-1..6: cowork guard enforcement, architect ratification, board mutation, handoff creation, WIP compliance, risk encoding)

**Risks documented:**
- **Risk-1 (HIGH):** Re-arm alone is band-aid. Without A2+C1 watchdog, future session restart re-stalls silently. A2+C1 are definitif closes.
- **Risk-2 (MEDIUM):** VIC url_not_found is terminal/no-auto-retry. B1 reset is only same-day unblock. B2 structural fix required.
- **Risk-3 (MEDIUM):** A2 Check 2 (drain-lapse detect) requires C1 landed. Interim: use heuristic if C1 delays.
- **Risk-4 (LOW):** 47 docs drain speed ~23 days (2 slots/day). Router can accelerate with manual refine invocations (idempotent).

**Done-verified gates (LIVE probe):**
- **A1:** AC-1..AC-5 checked (verified no cowork conflict, re-armed, enabled, cron_job_runs shows refine, live probe shows refine_status flipping)
- **A2:** AC-1..AC-5 verified (unit tests pass, live rebuild, WORK alert fires on test data)
- **B1:** AC-1..AC-5 verified (probe executed, reset confirmed in DB, enricher re-attempted, findings documented)
- **B2:** AC-1..AC-5 verified per confirmed hypothesis (sweep OR regex tests pass, live deployment verified)
- **C1:** AC-1..AC-5 verified (wrapRun merged + compile clean, unit tests pass, live alert fires on old cron_job_runs)

**Key PM decisions:**
1. Enforced COWORK OWNERSHIP GUARD non-negotiably. A1 routed to PO, not dev-team.
2. Accepted 5-task split as architect wrote it (no renegotiation, all ratified).
3. WIP=1 constraint enforced (only A1 in active dispatch loop).
4. Done-verified gates are LIVE-PROBE, not build-green (raw DB queries, cron_job_runs inspection, live alert verification).
5. Risks documented for visibility (no surprises post-deployment).

**Dispatch readiness:** ✅ BOARD COHERENT (orch-validate PASS). ✅ ALL 5 HANDOFFS CREATED. ✅ .head SET TO A1 (next_agent=po). ✅ PO READY TO EXECUTE A1 AFTER OWNERSHIP VERIFICATION. Router will sequence A2+B1 wave after A1 completion.

---

## c320 FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION TASK ATOMIZATION · 2026-06-23T172813Z

**PARENT:** BA spec finalized + Architect Brownfield Findings ratified (FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION-BA-spec.md § [Architect] Brownfield Findings, 4 RATIFICATIONS resolved)

**INPUT:** Parent task in READY, architect complete with CONF-1..CONF-4 decisions locked, PM init flow

**OUTPUT:** Two atomic subtasks (TASK-CONF-1, TASK-CONF-2) created with explicit sequential dependency. Parent task moved to DECOMPOSED. Board updated atomically. Handoff files generated. Decision journal recorded.

**Atomization rationale:**
- **Zone split:** mcp-server (TASK-CONF-1, backend) + frontend (TASK-CONF-2, frontend) — separate repos, no file conflict
- **Sequential dependency:** Frontend AC-3 (render null as "—") only verifiable after backend deploys null rows to DB. TASK-CONF-2 blocked-by TASK-CONF-1.
- **Architect ratified:** CONF-1 severity-to-int map location (inline in alertStore.ts, DDD-safe), CONF-2 type widening (number|null|undefined, callers safe), CONF-3 cowork path (no FR-6 needed), CONF-4 frontend effort (3 files, separate task). No negotiation.
- **Size accuracy:** TASK-CONF-1 = M (~2h): 5 files + 5 test makeDb() updates + new unit tests. TASK-CONF-2 = S (~1h): 3 files, type + mapper + render guard.

**Task specs created:**
1. **TASK-CONF-1** (dev-mcp-server) — Path A wire (severityToConfidence inline in alertStore.ts, wire both storeAlerts + storeAlertsFromCommander). Path B + C (remove DEFAULT 50, pass null). Path D (read-path ?? null). Test updates (5 makeDb() helpers + new T-1..T-4 unit tests). AC-1..AC-5 live probe (named-vol DB varied values, severity mapping, null-honest). BLOCKS TASK-CONF-2.
2. **TASK-CONF-2** (dev-frontend) — Client mapper null-safe (??null not ??0). Domain type widening (number|null). Render guard null-check. AC-3 live dashboard "—" for null. DEPENDS TASK-CONF-1.

**Board mutation (atomic):**
- **Before:** ready=[FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION, FIX-MACRO-SNAPSHOT-DELTAS-NULL], in_progress=[], backlog=[278]
- **After:** ready=[FIX-MACRO-SNAPSHOT-DELTAS-NULL, TASK-CONF-1], in_progress=[FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION (DECOMPOSED)], backlog=[TASK-CONF-2 (blocked) + 278]

**Handoffs created:**
1. docs/handoffs/TASK-CONF-1.md (backend implementation spec, FR-1..FR-5, test updates, AC-1..AC-5, risk RISK-1..5)
2. docs/handoffs/TASK-CONF-2.md (frontend implementation spec, FR-F-1..FR-F-3, AC-3, risk RISK-F-1..3)

**Decision journal:** docs/agent-memory/decisions/sprint-S2-DATA-HONESTY-conf-task-atomization.md (DJ-GATE-1..6: ratification, board mutation, handoff creation, verification gates, WIP capacity, follow-ons)

**Done_verified gates (LIVE probe, not green build):**
- TASK-CONF-1: AC-1 (named-vol DB ≥2 non-50 values) + AC-2 (API varied confidence) + AC-3 (null-honest) + AC-4 (severity mapping)
- TASK-CONF-2: AC-3 (dashboard "—" for null) — only verifiable after TASK-CONF-1 deployed + DB contains null rows

**WIP state:** Dispatch TASK-CONF-1 immediately (1/2 WIP). TASK-CONF-2 blocked in backlog (unblocks on TASK-CONF-1 done_verified). Max concurrent = 2 lanes, compliant.

**Key PM decisions:**
1. Accepted architect atomization as-written (no renegotiation; CONF-1..CONF-4 all ratified)
2. Blocked TASK-CONF-2 explicitly to enforce sequential deployment (frontend AC requires backend DB state)
3. Set done_verified gates on LIVE probe, not build-green (self-confirming test failure mode lesson applies)
4. Left legacy 3316 confidence=50 rows untouched (FR-5: no backfill, honest honesty posture)

**DISPATCH WAVE SEQUENCING:**
- **NOW (WIP available):** TASK-CONF-1 → dev-mcp-server (1/2 WIP)
- **After TASK-CONF-1 done_verified + rebuild:** TASK-CONF-2 → dev-frontend (2/2 WIP)
- **Both done_verified:** Parent task marked COMPLETE; sprint S2-DATA-HONESTY ready for next phase (if any)

---

## c319 EVENING_SUMMARY QUALITY 5-TASK SPRINT SEQUENCING · 2026-06-21T000000Z

**PARENT:** Architect brief + PO triage: FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE + 4 quality fixes from 2026-06-19 evening cycle review

**INPUT:** 5 raw_verified:true tasks from orch-state backlog (TASK-RSIFIX-1/2, FIX-MACRO-FX-SIGMA, FIX-DIGEST-FOREIGN-FLOW, FIX-DIGEST-BB-ALERT), architect brief docs/architecture-briefs/2026-06-21-digest-rsi-dual-engine-diverge.md, PM init

**OUTPUT:** 5 handoff files + orch-state.json board update (backlog → ready, wave/blocking metadata). Developers ready to dispatch Wave 1.

**Handoffs created:**
1. docs/handoffs/TASK-RSIFIX-1-ta-engine-contract.md (dev-technical-analysis, no rebuild)
2. docs/handoffs/TASK-RSIFIX-2-digest-go-engine-rewire.md (dev-mcp-server, rebuild, blocked_by RSIFIX-1)
3. docs/handoffs/FIX-MACRO-FX-SIGMA-PHANTOM-EXTREME.md (dev-macro-indicators, rebuild)
4. docs/handoffs/FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN.md (dev-mcp-server, rebuild, file conflict with RSIFIX-2)
5. docs/handoffs/FIX-DIGEST-BB-ALERT-LIQUIDITY-FLOOR.md (dev-technical-analysis, rebuild, file conflict with RSIFIX-1)

**Board mutation (atomic):**
- **Before:** ready=N, backlog includes TASK-RSIFIX-1/2 + 3 FIX tasks (all TODO)
- **After:** ready=N+5, backlog -= 5 tasks. All moved tasks status=TODO, with wave/blocked_by/blocks metadata

**DISPATCH WAVE SEQUENCING (WIP=2 max concurrent coding):**

**Wave 1 (READY NOW, parallel, independent zones + files):**
- **dev-technical-analysis:** TASK-RSIFIX-1 (docs only, ~1h, unblocks RSIFIX-2)
- **dev-macro-indicators:** FIX-MACRO-FX-SIGMA-PHANTOM-EXTREME (code fix, ~1.5h, independent)

**Wave 2 (after Wave 1 done_verified; WIP=2):**
- **dev-mcp-server:** TASK-RSIFIX-2 (code fix, ~3h, blocked_by TASK-RSIFIX-1, rebuild)
- **dev-mcp-server:** FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN (code fix, ~1h, rebuild)
- **Conflict:** both edit assembleEveningSummary.ts + eveningSummaryJob.ts → SERIALIZE. Dispatch RSIFIX-2 first, then FOREIGN-FLOW.

**Wave 3 (after Wave 2 WIP clears; P3):**
- **dev-technical-analysis:** FIX-DIGEST-BB-ALERT-LIQUIDITY-FLOOR (code fix, ~1h, rebuild)

**Verification gates (live evening-cycle before done_verified):**
- **RSIFIX-1:** Contract doc exists + verified against Go source (rsi.go)
- **RSIFIX-2:** RSI agreement ≤0.1 between Go + TS digest for ≥3 tickers; <35-candle → null; no synthetic fallback
- **FX-SIGMA:** 0.25% USD/VND move → INFO/WARN not CRITICAL; 0.6% move → CRITICAL/HIGH
- **FOREIGN-FLOW:** No 0.000k padding lines in digest; only nonzero movers rendered
- **BB-ALERT:** Sub-100K-volume tickers emit no BB alert; liquid tickers still do

**Key PM decisions:**
1. Moved RSIFIX-1 as doc-first task to unblock architecture
2. Serialized RSIFIX-2 + FOREIGN-FLOW due to assembleEveningSummary.ts overlap
3. Queued P3 BB-ALERT for Wave 3 (lower urgency)
4. Set blocking_by/blocks metadata explicitly
5. Wave 1 sized for immediate parallel start

**Follow-ons (queued backlog):**
- CLEAN: remove unused computeRSILocal (after RSIFIX-2 done_verified)
- OBSERVABILITY: add RSI divergence detector to system-auditor
- BACKLOG: FIX-FOREIGN-FLOW-COVERAGE (source data gaps, lower priority)

---

## Archive

Cycles c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived. See git history commits 675891163d...5d121989 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).
