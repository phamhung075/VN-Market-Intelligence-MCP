# PM Sprint Planning — CROSS-SESSION-MULTI-TEAM-ORCH
**Task ID:** `sprint:CROSS-SESSION-MULTI-TEAM-ORCH-pm`  
**Date:** 2026-06-28T12:50:00Z  
**Agent:** pm  
**Status:** Complete (6 tasks minted, handoffs written)

---

## Decision Summary

Minted TASK_1990..1995 per PO + architect decomposition (CROSS-SESSION-MULTI-TEAM-ORCH sprint):

**P2 — Presence Registry (3 tasks; agent-father + qa)**
- TASK_1990 (P2-AF-1): Dispatcher presence self-registration (docs/agents/ + .claude/skills/ | S)
- TASK_1991 (P2-AF-2): Router roster READ wire (CLAUDE.md + dispatch-claim | S)
- TASK_1992 (P2-QA): Presence registry verification (test 3 harnesses + orphan-signals negative path | M)

**P3 — Fire-Time Leader Election (3 tasks; agents-architect + agent-father + qa)**
- TASK_1993 (P3-ARCH-1): Design addendum (5 items: period-key / dispatcher-layer / SF-1 / lease / OBSERVE-ONLY retirement | M)
- TASK_1994 (P3-AF-1): Implementation (cron election + retire patterns | L)
- TASK_1995 (P3-QA): Verification (parallel fire election + stale-leader reclaim + 5 test harnesses | L)

---

## What I Considered

1. **Task cardinality:** P2 = 3 tasks (presence-register + roster-read + verify), P3 = 3 tasks (design + impl + verify).
   - Option A (2+2): merge presence-register+router-read → rejected (different zones: docs/agents/ vs .claude/skills/); router-read depends on presence-register being live
   - Option B (3+3): each concern as separate task (current choice) → respects zones + depends_on chain
   - Option C (1+1): single mega-tasks per phase → rejected (violates 2h atomic rule; P3-impl is L already)
   - **CHOSEN: 3+3**

2. **Rebuild gates:**
   - P2-MCP foundation ALREADY SHIPPED in TASK_1989 (coordinationStore enum + listHeldTasks query live in HEAD)
   - TASK_1992 QA will gate rebuild: live-probe fields before ops touch; expect ZERO rebuild
   - **CHOSEN: Conditional rebuild only if QA live-probe finds fields missing**

3. **P3 runs in P2 shadow:**
   - TASK_1993 (design) has zero depends; runs in parallel with P2 (no blocking)
   - TASK_1994 depends on [TASK_1993, TASK_1992] (design + presence registry must be QA-verified)
   - Allows P3-ARCH-1 + P2-AF-1 to start immediately; TASK_1994 gated by P2-QA
   - **CHOSEN: P3-ARCH-1 unblocked; P3-AF-1/QA blocked on P2-QA**

4. **Serialization constraint on AF tasks:**
   - TASK_1990, TASK_1991, TASK_1994 all touch docs/agents/ + .claude/skills/
   - Risk: concurrent edit contamination (flow merge + SKILL edit simultaneously)
   - **CHOSEN: Explicit serialization in handoff notes; TASK_1990 → TASK_1991 → TASK_1994 (no parallel AF work)**

5. **Negative-path testing in TASK_1992 + TASK_1995:**
   - TASK_1992: verify reaper IGNORES presence rows (allow-list separation)
   - TASK_1995: grep OBSERVE-ONLY removal + cross-module impact
   - **CHOSEN: Embed negative paths in QA DoD; ensures correctness via verification, not just implementation**

---

## Why This Change

**Root cause:** Cross-session multi-team orchestration (Cowork + Dev-team + Auditor all firing ≤1min windows, same host, same MCP server) revealed two gaps:

1. **Visibility gap:** Dispatcher presence not self-reported → router blind to who's working; no coordination across cron-fired peers
2. **Contention gap:** Static cowork-leader lock does not support sub-daily tick granularity → fire-time election needed

**Solution:** Two-phase:
- **P2:** Presence registry (Session-presence rows + roster read) → router sees all active agents + their current tasks
- **P3:** Fire-time leader election (Atomic per-tick lock + session-aware deferral) → exactly one session dispatches per cron tick

**Design anchors:**
- P2-MCP foundation: already deployed (TASK_1989); no new MCP code task
- Serialization: AF zone collision avoidance explicit in depends_on chain
- Verification-first: QA gate on each phase before proceeding (no blind deploy)

---

## Handoff Files Written

- `docs/handoffs/TASK_1990.md` — Presence self-registration SKILL + flow edits
- `docs/handoffs/TASK_1991.md` — Roster READ into router + dispatch-claim integration
- `docs/handoffs/TASK_1992.md` — P2 QA: 3 test harnesses + orphan-signals + rebuild gate
- `docs/handoffs/TASK_1993.md` — P3 design: 5-item addendum (period-key, layer, SF-1, lease, retirement)
- `docs/handoffs/TASK_1994.md` — P3 impl: fire-time election + OBSERVE-ONLY retirement (serialized AF)
- `docs/handoffs/TASK_1995.md` — P3 QA: 5 test harnesses + negative path + baseline-diff

---

## Orch-State Update

Added to `.task_board.active_sprints[0].tasks[]`:
- 6 new tasks (TASK_1990..1995)
- All status: TODO
- P2 depends: TASK_1990 → TASK_1991 → TASK_1992 (linear)
- P3 depends: TASK_1993 (unblocked) | TASK_1994 (blocks on [TASK_1993, TASK_1992]) | TASK_1995 (blocks on TASK_1994)
- Zones: docs/agents/ | .claude/skills/ | docs/architecture-briefs/ | docs/protocols/ (no cross-zone contamination)

---

## Wave 1 Readiness Check

**UNBLOCKED for immediate dispatch:**
- ✓ TASK_1990 (P2-AF-1) — zero depends
- ✓ TASK_1993 (P3-ARCH-1) — zero depends

**BLOCKED pending upstream:**
- TASK_1991 (blocks on TASK_1990 live)
- TASK_1992 (blocks on TASK_1990 + TASK_1991 live)
- TASK_1994 (blocks on TASK_1993 + TASK_1992 live)
- TASK_1995 (blocks on TASK_1994 live)

---

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| P2-MCP fields not deployed | TASK_1992 live-probe gates rebuild; expect PASS (already in HEAD) |
| AF zone collision (TASK_1990+1991+1994 concurrent edits) | Handoff enforces serialization; PM will verify depends chain respected |
| Fire-time period-key collision | TASK_1993 design must specify tick-boundary uniqueness; TASK_1995 tests period-key dedup |
| Stale-leader orphan work | TASK_1994 must verify ZERO task assignments before deferral; TASK_1995 harness confirms |
| OBSERVE-ONLY code residue | TASK_1995 negative path: grep for "OBSERVE-ONLY" in 3+ zones; expect ZERO matches |

---

## Next Steps

1. **Immediate (Wave 1):** Spawn TASK_1990 (agent-father) + TASK_1993 (agents-architect) — parallel start
2. **After Wave 1:** TASK_1990 → TASK_1991 (same agent, serial AF work)
3. **After TASK_1991:** TASK_1992 spawned to QA
4. **After TASK_1992 DONE_VERIFIED:** TASK_1994 spawned (P3-AF-1 now unblocked + TASK_1993 complete)
5. **After TASK_1994:** TASK_1995 spawned to QA

---

## Appendix: Decomposition Rationale

**Why 3+3 and not fewer tasks?**

| Aspect | Reason |
|--------|--------|
| Presence-register ≠ Router-read | Different zones (docs/agents/ vs CLAUDE.md); depends_on order (register must live before read) |
| Router-read ≠ QA-verify | Different agent (AF vs QA); QA is gate, not implementation |
| Design ≠ Impl for P3 | Architect owns design; AF owns runtime docs; test-then-implement ensures correctness before large AF changes |
| Impl ≠ QA-verify | AF implementation + QA verification are separate concerns; QA gates before merge |
| P2 ≠ P3 | Different risks: P2 is baseline (presence), P3 is enhancement (election); P3 design can run in P2 shadow |

---

**DECISION RECORD COMPLETE**  
Handoffs ready; tasks minted; orch-state updated; Wave 1 dispatched pending agent capacity.
