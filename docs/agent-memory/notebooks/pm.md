# PM — Notebook

## c342 FIX-READYLANE-NO-SEVERITY-EXPEDITE-FIFO-BURIES-INCIDENT-P0 ZONE-SPLIT DECOMPOSITION · 2026-08-14T11:23Z

**MANDATE (from dev-team dispatcher, pipeline-resume dispatch, FIX-READYLANE-NO-SEVERITY-EXPEDITE-FIFO-BURIES-INCIDENT-P0 IN_PROGRESS lane):** Break down architect-designed incident-lane consumer (dedicated throughput mechanism for po_expedited_at rows) into zone-split implementation tasks (scripts/ and docs/agents/dev-team/) per established convention. Parent task is DESIGN (zero production code at architect stage); PM decomposes the design into two atomic implementation rows.

**DESIGN CONTEXT:**
- **Parent Task:** FIX-READYLANE-NO-SEVERITY-EXPEDITE-FIFO-BURIES-INCIDENT-P0 (P0, cross-service/, architect-owned, moved to DONE in this cycle)
- **Architect Brief:** docs/architecture-briefs/2026-08-14-readylane-incident-lane-throughput.md (complete, decision: adjudicated design option (c), rejected comparator-only fixes (a)/(b))
- **Root Problem:** Ready-lane consumer (RLC) selects exactly 1 row per invocation, runs ~1/6 hourly cadence (via Idle-Tick Rotation), causing 68-row eligible queue to starve despite perfect ordering. PO's live measurement (2026-08-13): two severity-expedited rows already rank #1/#2 and are STILL undispatched after 10+ hours — proves ordering fix alone insufficient.
- **Architect Ruling:** Dedicated Incident-Lane Consumer (ILC) — independent budget (`INCIDENT_CAP=2`), batch-claim N rows per invocation, unconditional Session-Gate→Step-1 invocation (not rotation-gated). Reuses QA-Drain's proven throughput pattern (226→56 PRIMARY drain over 8 days on structurally identical starvation). Never a comparator change or new priority tier.
- **Precedent:** QA-Drain 2026-08-06 implementation (brief: 2026-08-06-review-lane-qadrain-throughput-unblock.md) — same independent-budget + batch + unconditional-invocation recipe delivered measured 4x throughput improvement.

**ZONE-SPLIT BREAKDOWN (per brief §5 and established PM convention):**
1. **Scripts & Predicates:** developer zone
   - Add `is_po_expedited` + `incident_wip_in_progress` predicates to devteam-eligibility.jq
   - Create NEW `scripts/devteam-backlog-claim-incident-lane-consumer.jq` (batch claim script)
   - Update RLC header comment with cross-reference (no logic change)
   - Extend devteam-dispatch-gate-satisfiability.sh with ILC fixtures
   - HARD PREREQUISITE for mainflow row (mainflow calls this script file)

2. **Main Flow Integration:** agent-father zone (depends_on: SCRIPTS row)
   - Insert § Incident-Lane Consumer section after Session Gate (content-anchored)
   - Place BEFORE § Review-Lane SECONDARY-Drain (priority ordering: ILC → SECONDARY → QA-Drain)
   - Implement invocation: INCIDENT_WIP guard → batch-claim call → spawn loop → JUMP TO end
   - Update SECONDARY-Drain intro (no other logic changes)
   - Add INCIDENT_CAP to Invariants section

**DECOMPOSITION COMPLETED:**

### FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS (Tier1, ready now)
- **Zone:** scripts/
- **Size:** M
- **Dependencies:** none (blocks: MAINFLOW row)
- **Scope:** Add 2 predicates to devteam-eligibility.jq, create devteam-backlog-claim-incident-lane-consumer.jq (batch claim, priority-then-oldest-expedite-first sort), update RLC header comment, extend satisfiability fixtures
- **Handoff:** docs/handoffs/FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS.md

### FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW (Tier2, after SCRIPTS)
- **Zone:** docs/agents/dev-team/
- **Size:** M
- **Dependencies:** FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS (hard: calls script file not existing until SCRIPTS ships)
- **Scope:** Insert § Incident-Lane Consumer at Session-Gate→Step-1 anchor (unconditional batch-claim invocation, `INCIDENT_CAP=2`); update SECONDARY-Drain intro; add INCIDENT_CAP to Invariants
- **Handoff:** docs/handoffs/FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW.md

**DEPENDENCY TIERS:**
- **Tier 1 (ready now):** FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS (no blockers, developer zone, parallel-dispatchable)
- **Tier 2 (after tier 1):** FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW (depends_on tier1, agent-father zone, must execute after SCRIPTS ships)

**CRITICAL ORDERING NOTE:**
Hard dependency: MAINFLOW's call site `-f scripts/devteam-backlog-claim-incident-lane-consumer.jq` references a file that does not exist at all until SCRIPTS row ships. Unlike QA-Drain's own dependency (which had backward-compatible fallback), no intermediate state is viable here.

**BOARD STATE POST-DECOMPOSITION:**
- Parent task moved: in_progress[] → done[] (marked DONE, closed_at stamped)
- New tasks added: ready[] += 2 (FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS, FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW)
- WIP: -1 (parent removed from in_progress, 2 TODO rows added to ready — no net WIP impact)
- .head updated: idled (active_task_id=FIX-READYLANE-... → null, status=idle per non-closeout reset, Step 4c)
- Validator: PASS (Stage 1g: 16 pre-existing MISSING deps unchanged; no new blockers introduced)

**DECISION RATIONALE:**
- Architect ruled on mechanism (dedicated ILC, not comparator fix); PM decomposes ruling into concrete work
- Each task is single zone, ~2h, clear AC, testable with provided fixtures
- Zone split preserves architectural coherence: scripts/ and docs/agents/ by established routing rule (`po_routing_ruling_20260721`)
- Hard dependency captures the runtime requirement (SCRIPTS creates a file that MAINFLOW calls)
- Tier structure ensures prerequisite lands before dependent (safe sequential dispatch)
- Independent budget (`INCIDENT_CAP=2`) keeps ILC from saturating like a 4th priority tier (design constraint §4b of brief)
- Batch-claim + unconditional invocation (not rotation-gated) directly addresses the 1-per-6-ticks throughput ceiling

**HANDOFF FILES CREATED:**
1. docs/handoffs/FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS.md (AC-1 through AC-6 + design rationale)
2. docs/handoffs/FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW.md (AC-1 through AC-5 + placement rules + design rationale)

**NEXT:**
- Router to dispatch tier1 task (SCRIPTS) to developer specialist (ready now)
- Once tier1 task lands, tier2 task (MAINFLOW) unblocks for agent-father specialist
- Both tasks should land before any other dev-team flow changes that might edit the Session-Gate→Step-1 insertion point
- Live measurement after both tasks ship: expect incident-queue depth to drop over the following week (precedent: QA-Drain delivered 226→56 PRIMARY drain over 8 days on structurally identical mechanism)

---

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).
