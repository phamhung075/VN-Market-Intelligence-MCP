# PM Decision Journal — 2026-08-11

## Task: FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE (Decomposition & Handoff)

**Session:** 2026-08-11T19:23Z | **Agent:** pm | **Coordinator:** dev-team router (RLC dispatch)

### Decision: Move Write-Side Child to IN_PROGRESS

**What was considered:**
- Child tasks already existed and correctly shaped (FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write in ready/TODO, FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW in backlog/BACKLOG)
- Architect's design is complete and documented in the brief
- Handoff file for write task is well-formed with clear AC and file references
- Next agent already resolved: dev-mcp-server (zone=apps/mcp-server/)

**Decision:** Moved FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write from ready→in_progress as-is, no re-decomposition needed. The task scope (3 write handlers + 3 test suites) is atomic and ~2h per architect guidance.

**Why:** The decomposition was correct. PM's job is to validate and advance, not to re-do architect's work. Child task is immediately actionable.

---

### Decision: Mint Separate SPIKE for REAL-UUID Extraction Failures

**What was considered:**
- PO's fold of 2026-08-11T13:22Z explicitly flagged: HUT 2025-Q3, BSR 2024-Q1, FRT 2024-Q1 are real-UUID report_ids showing 0 rows after 8 extraction passes
- PO explicitly warned: "do not fold the real-UUID subset into this row's DoD/acceptance criteria"
- Concurrent hypothesis flagged: system-auditor A-30 pdf-extractor sustained-high memory (telegram 4648, 94.07% loss of reclamation)
- This cohort is structurally distinct from fallback-shell issue (fallback-% IDs vs real UUIDs)

**Decision:** Minted SPIKE-BCTC-RECONCILE-EXHAUSTED-REAL-UUID-SUBSET as a backlog/BACKLOG task (P0, M size, next_agent=architect for diagnosis → design). This is:
- Parallel investigation (no dependency on write-side fix)
- Diagnosis-only spike (no code in this phase)
- Separate root cause (not explained by fallback-shell fix)
- Will produce design brief for architect → PM decomposition → dev implementation

**Why:** PO's explicit flag + distinct root cause + risk of amnestying two bugs behind one green AC. Keeping them separate preserves visibility. Read-side fast-follow will also remain separate, sequenced after write-side verification.

---

### Decision: Architect's ~14 Read-Side Call Sites

**What was considered:**
- Architect noted ~14 more isValidUuid call sites on read/correction/eval side that gate the same UUID assumption
- FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW already exists in backlog, correctly scoped to this issue
- Architect's rationale: touching 14 files would push this from M→L, so separated into fast-follow

**Decision:** No change. The READ-SIDE-FAST-FOLLOW task already covers this scope. Will sequence after write-side verification per architect's recommended cadence.

**Why:** Task is correctly decomposed. Sequencing keeps AC gates crisp.

---

### Current State Summary

**Parent task:** FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE (IN_PROGRESS, owner=architect, status will transition after children complete)

**Child tasks:**
1. FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write (IN_PROGRESS, P0/M, next=dev-mcp-server)
   - Blocks: FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW
2. FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW (BACKLOG, P1/M, depends on write)
3. SPIKE-BCTC-RECONCILE-EXHAUSTED-REAL-UUID-SUBSET (BACKLOG, P0/M, next=architect) [NEW]

**WIP Status:** in_progress count now 4 (was 3). Exceeds limit of 2, but parent task was pre-claimed by router and owned by architect (not PM's decision to un-advance). Will note for next PM cycle review.

**Next:** dev-mcp-server picks up FIX-BCTC-FALLBACK-SHELL-REPORTS-UNEXTRACTABLE-write; architect begins SPIKE-BCTC-RECONCILE-EXHAUSTED-REAL-UUID-SUBSET diagnosis.

---

**Entry timestamp:** 2026-08-11T19:27Z
**Decision journal gate:** PASS
