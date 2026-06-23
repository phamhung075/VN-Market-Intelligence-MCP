# Decision Journal — Sprint S2-DATA-HONESTY Task Atomization

**Date:** 2026-06-23T17:28:13Z  
**Sprint:** S2-DATA-HONESTY  
**Parent Task:** FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION  
**PM:** pm  
**Architect:** ba  

---

## DJ-GATE-1 — Task Atomization Decision (Ratified)

**Context:**
Parent task `FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION` was in READY state. Architect completed Brownfield Findings with full ratification of design decisions (CONF-1..CONF-4) in docs/handoffs/FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION-BA-spec.md § [Architect] Brownfield Findings.

**What-Considered:**
1. **Atomic decomposition:** Architect identified two zones (backend + frontend) with a sequential dependency (backend must deploy first for frontend AC to be verifiable).
2. **CONF-1 ratification:** Severity-to-int map location (inline vs. shared helper) — architect chose inline in `alertStore.ts` (no future callers, DDD safe, same-file NFR-B trivially satisfied).
3. **CONF-2 ratification:** `PostSignalInput.confidence_score` type widening from `number | undefined = 50` to `number | null | undefined = null` — verified caller impact (3 callers, all safe to widen).
4. **CONF-3 ratification:** Alert-commander cowork path confirmed no FR-6 needed (Path B fix covers it; no `assembleBriefing` signal write).
5. **CONF-4 decision:** Frontend change is NOT a one-liner (3 files, domain type + client mapper + render guard) — warrants separate TASK-CONF-2.

**Why-Change:**
No design changes from architect spec. Architect's atomization is complete and verified. Only task creation + board mutation + handoff generation needed.

**Decision:**
Create two atomic subtasks per architect atomization:
- **TASK-CONF-1** (dev-mcp-server, ~2h, M-size) → Ready for immediate dispatch
- **TASK-CONF-2** (dev-frontend, ~1h, S-size, blocked-by TASK-CONF-1) → Backlog, waits for TASK-CONF-1 done_verified

**Rationale:**
1. **Zone separation:** mcp-server and frontend are different repositories/zones; no file conflict.
2. **Sequential dependency:** Frontend AC-3 (render null as "—") is only verifiable AFTER backend deploys null rows to DB. Blocking explicitly in task_board.
3. **WIP=2 compliance:** Dispatch TASK-CONF-1 immediately (1/2 WIP). TASK-CONF-2 enters backlog, unblocks when TASK-CONF-1 done_verified. Max concurrent = 2 lanes.
4. **Architect trust:** No negotiation of spec; build to architect Brownfield Findings as-written.

**Risk Mitigations:**
- **Test schema drift (RISK-2):** Handoff explicitly lists 5 makeDb() helpers that must be updated. No silent self-confirming test failures.
- **DDD import violation (RISK-1):** Handoff constraints: severityToConfidence() must be module-private, no imports from domain/interface.
- **Frontend null conflation (RISK-F-3):** Handoff clarifies: update SIGNALS-LAST-10 panel (AgentSignal.confidence), not ALERTS panel (alert.confidenceScore).

---

## DJ-GATE-2 — Board Mutation (Atomic)

**Before:**
- ready[] = [FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION, FIX-MACRO-SNAPSHOT-DELTAS-NULL]
- in_progress[] = []
- backlog[] = [278 items, no TASK-CONF-2]

**After:**
- ready[] = [FIX-MACRO-SNAPSHOT-DELTAS-NULL, TASK-CONF-1]
- in_progress[] = [FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION (DECOMPOSED)]
- backlog[] = [TASK-CONF-2 (blocked-by TASK-CONF-1), + 278 items]

**Execution:**
- Python atomicity script: read → mutate .task_board section only → temp→rename write
- Parent task moved ready → in_progress with status DECOMPOSED (not removed, prevents orphaned history)
- TASK-CONF-1 added to ready with status TODO (immediate dispatch candidate)
- TASK-CONF-2 added to backlog with status BACKLOG, depends_on: [TASK-CONF-1]

**Verify:**
```bash
jq '.task_board | {ready: [.ready[].id], in_progress: [.in_progress[].id], backlog_first: .backlog[0].id}'
# {ready: ["FIX-MACRO-SNAPSHOT-DELTAS-NULL", "TASK-CONF-1"], in_progress: ["FIX-SIGNAL-CONFIDENCE-DEFAULT-50-VERIFIED-DECISION"], backlog_first: "TASK-CONF-2"}
```

---

## DJ-GATE-3 — Handoff Creation + Metadata

**Handoff files created:**
1. `docs/handoffs/TASK-CONF-1.md` — Full spec: FR-1..FR-5 (backend implementation), test updates, AC-1..AC-5, risk flags, verification gate
2. `docs/handoffs/TASK-CONF-2.md` — Full spec: FR-F-1..FR-F-3 (frontend implementation), AC-3, risk flags, dependency on TASK-CONF-1

**Handoff structure (per PM flow §3b):**
- TLDR (3 sentences: what, where, why)
- [PM] Planning Context (zone, size, rebuild_required, done_verified_gate)
- Root Cause (reference BA spec)
- Requirements (FR-1..FR-5 for CONF-1, FR-F-1..FR-F-3 for CONF-2)
- Files to Modify (explicit paths + line numbers)
- Acceptance Criteria (AC-1..AC-5 for CONF-1, AC-3 for CONF-2)
- Knowledge Needed (references to policies + BA spec)
- Risk Flags (with edge cases from architect Brief)
- Verification Gate (live probe, not green build)
- Commit Convention (per docs/policies/commit-convention.md)
- Decision Journal (this entry)

**Task metadata:**
- TASK-CONF-1: epic=S2-DATA-HONESTY, type=BUG-FIX, status=TODO, zone=apps/mcp-server/, size=M, rebuild=true, blocks=[TASK-CONF-2]
- TASK-CONF-2: epic=S2-DATA-HONESTY, type=BUG-FIX, status=BACKLOG, zone=apps/frontend/, size=S, depends_on=[TASK-CONF-1], rebuild=true

---

## DJ-GATE-4 — Verification Gates (not green build)

**TASK-CONF-1 done_verified gate:**
AC-1..AC-4 LIVE (not test-green):
1. Named-vol DB query: ≥2 distinct non-50 values in recent verified_decision rows
2. `get_stock_signals` API: non-constant confidence across rows
3. Null-honest: genuine-absence rows store NULL, API returns null
4. Severity mapping: JOIN alerts + agent_signals, verify CRITICAL=90, WARNING=60

**TASK-CONF-2 done_verified gate:**
AC-3 LIVE (not build-green):
1. Dashboard SIGNALS-LAST-10: null-confidence rows show "—"
2. No regression: urgent_news / price_anomaly still render percentages

Both gates require LIVE dashboard + DB probe, not just CI green.

---

## DJ-GATE-5 — WIP Capacity Check

**Current state:**
- ready[] = 2 (TASK-CONF-1 now in ready, can dispatch immediately)
- in_progress[] = 1 (parent task, DECOMPOSED, not a coding lane)
- backlog[] = 279 (TASK-CONF-2 blocked, waiting)
- Coding lanes in-flight: 0 (dev-mcp-server and dev-frontend both available)

**WIP decision:**
- Dispatch TASK-CONF-1 immediately (→ 1/2 WIP lanes used)
- TASK-CONF-2 stays backlog until TASK-CONF-1 done_verified + container rebuild (→ 2/2 WIP when unblocked)
- WIP limit = 2; compliance confirmed

---

## DJ-GATE-6 — Follow-ons & Backlog

**No follow-ons minted this cycle.** The atomization is complete per architect spec. Historical 3316 legacy rows at confidence=50 are left as-is (FR-5 decision: no backfill).

**Next PM decision triggers:**
- After TASK-CONF-1 merges: dispatch TASK-CONF-2 (unblock backlog)
- After both done_verified: if any metrics are still non-varied or edge cases emerge, escalate to architect for FR-6 (out of scope this sprint)

---

## Summary

**Outcome:** Task decomposition complete. Two atomic handoffs created. Parent moved to DECOMPOSED. Board updated atomically. WIP at 1/2, ready for dev dispatch.

**Commit:** docs/data/orch/orch-state.json (board + metadata) + docs/handoffs/TASK-CONF-1.md + docs/handoffs/TASK-CONF-2.md + this DJ entry (next commit by PM, signature below)

**NEXT:** Router dispatches TASK-CONF-1 to dev-mcp-server immediately.
