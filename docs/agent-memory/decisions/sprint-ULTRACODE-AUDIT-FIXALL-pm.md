
## TASK_2007 — Tier-1 Signal Type Canonicalization + Dedup-Skip RESOLVED-Closure (UC-ASL-P5 decompose)

**Date:** 2026-08-11T16:45:00Z
**Agent:** pm (Project Manager)
**Status:** PLANNED

### Decision Summary

Decomposed UC-ASL-P5 (architect_design_complete=true, supervised/deploy_gate already cleared) into single atomic task TASK_2007 per architect recommendation:
- **Zone:** cross-service/ (multi-file: tier1-probe.md + triage-signals.md, both flow docs, no apps/<service> split warranted)
- **Size:** S (compact literal edits + regex prose fix, no code/schema)
- **Dependencies:** none (no upstream blocks)

### Scope Summary

**FR-1 (tier1-probe.md category-type differentiation):**
- Insert lookup table above line 335 EMIT SEQUENCE naming check-class→literal mapping
- `microservice_degraded` ← A-01–A-11, A-20, A-21, A-30
- `signal_feedback` (unchanged) ← A-12–A-19, A-32, A-33 (transport probes = probe-layer facts, not confirmed service degradation)
- Change line 337's hardcoded `--category-type "signal_feedback"` to conditional placeholder
- Swap line 91 (A-20) to `microservice_degraded`
- Clarify A-30 clause (line 227–234) documents microservice_degraded explicitly
- Clarify A-33 stays signal_feedback (documentation only, no functional change)

**FR-2 (triage-signals.md dedup-skip RESOLVED-closure):**
- Lines 18/22/23: dedup-skip branches now resolve originating signal row id and flip READ→RESOLVED via orch-apply.sh
- If row unresolvable (pure file-bus origin), log-and-skip (never block task creation/dedup logging)
- Guard on `status=="READ"` only (never `NEW`) — invariant: resolvable rows structurally guaranteed READ by drain-signals.md
- Line 27: "SHOULD stamp" → "MUST stamp" for origin_signal_id
- Citation fix: `§ CLOSE` (non-existent) → `## ACK / CLOSE` (real section in signal-dashboard/SKILL.md:78)

### Design Verification (from architect brownfield findings)

✓ Q-A12-A19-boundary: **RESOLVED** to `signal_feedback` (BA's default, architect ratifies)
  Rationale: A-12–A-19 transport probes are facts, not verdicts; separate debounce logic (3-cycle threshold) before emit—unlike A-01–A-11/A-21/A-30 with independent confirming logic. Routing behavior unchanged: both rules treat single WARN identically on all services except mcp-server.

✓ Q-status-guard: **RESOLVED** to `status=="READ"` only (never accept `NEW`)
  Verified: rows resolvable at dedup-skip time are structurally guaranteed READ by drain-signals.md's combined append+flip write in the SAME atomic orch-apply.sh call. Flagged forward: invariant depends on that combined write staying combined; fixture must include explicit NEW negative-control to catch future regressions.

✓ Q-emit-script-signature: **RESOLVED** — no script change needed
  `emit-audit-signal.sh` already passes `--category-type` verbatim per-call; FR-1 is 100% flow-doc call-site literal edits.

### Test Strategy (per architect)

1. **FR-1 static regression:** `scripts/audits/verify-tier1-category-type-mapping.sh`
   - Grep named line ranges (328–343, 91, 227–234, 306–318)
   - Assert each literal matches ratified table
   - Exit 0 = PASS, exit 1 = MISMATCH
   - Catches future doc drift without live Tier-1 fire per check class

2. **FR-2 dedup-skip fixture:** throwaway test
   - (a) Resolvable + status=READ → RESOLVED ✓
   - (b) Resolvable + status=NEW → explicit no-op (Design Decision invariant) ✓
   - (c) Unresolvable id → no-op, task-creation proceeds ✓

### Risk Assessment

- **FR-1: LOW** — single shared template serving 4 check classes, prose-only, no compiler backstop; mitigated by static regression script
- **FR-2: LOW-MEDIUM** — durable-drain combined-write invariant critical; mitigated by negative-control fixture (NEW→no-op explicit)
- **No DDD violations, no security/memory/perf concerns** — pure prose-level flow-doc work, zero code/schema surface

### Handoff

- **TASK_2007.md:** docs/handoffs/TASK_2007-asl-p5-signal-canonicalize.md
- **Handoff created:** 2026-08-11T16:45:00Z
- **Task added to ready array:** status=READY, priority=P1, size=S
- **WIP status:** currently 2 in_progress (at limit); this task queued as READY (will enter in_progress when developer picks up)

### What-Considered

Only decomposition path: UC-ASL-P5 rescope (architect-approved) → single FR-1/FR-2 task (no zone split warranted) → READY status (no dependencies).

### Why-Change

No change from plan. Architect (via brownfield findings) explicitly recommended keeping both FRs in one task and cleared all gates (supervised/deploy_gate→false/null). Straight decomposition follow-through.

