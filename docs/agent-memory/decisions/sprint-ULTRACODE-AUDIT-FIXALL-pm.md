
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


### STEP pm-S1 · pm · 2026-08-23T13:42:14Z
task_id: UC-ASL-P3
**what-considered:** (a) hold undecomposed until its `depends_on` clears — rejected: the dep gate is mechanical (`deps_satisfied()` needs DONE_VERIFIED), so minting dep-carrying children cannot race it; (b) one combined task — rejected, crosses two commit zones; (c) two-owner split per architect brief — chosen.
**why-change:** no change from plan. Architect's brief §2 names the split verbatim (developer: FR-1/FR-3..FR-10 script+test gated on C-04; agent-father: FR-11 main.md repoint gated on the script), mirroring the live C-04/C04-FLOWDOC-REPOINT precedent.
**children minted:** TASK-ASLP3-DB-CHECKS-SCRIPT (depends_on FIX-AUDITOR-C04-PARSEDAT-RECENCY-PREDICATE) → TASK-ASLP3-MAINMD-FR11-REPOINT (depends_on the script).
**parent:** ready[] → done[], children[], pm_decomposition_complete=true.

### STEP pm-S2 · pm · 2026-08-23T13:42:14Z
task_id: UC-ASL-P5
**what-considered:** (a) split FR-1/FR-2 per zone — rejected, the BA spec § Zone instructs pm verbatim NOT to; (b) routing correction to agent-father — ATTEMPTED, then REVERTED as wrong; (c) close as already-decomposed — chosen.
**why-change:** CHANGED FROM PLAN, and the reason matters. I read the row as undecomposed because it carried no `children[]`. It was decomposed 2026-08-11 into TASK_2007 (commit 9ea1bc910, journalled in THIS file above) and TASK_2007 is live in ready[]. Re-routing the parent would have aimed a second implementer at owned work.
**lesson:** a decomposed parent is invisible from the board row alone when `children[]` was never written — check the sprint journal + git log before concluding a row is undecomposed. The missing marker, not the routing, is why it kept returning to pm.
**parent:** ready[] → done[], children=["TASK_2007"].

### STEP pm-S3 · pm · 2026-08-23T13:42:14Z
task_id: UC-CDC-P1
**what-considered:** (a) move out of in_progress[] to backlog/ready — rejected as mechanically impossible; (b) move to done[] — rejected, would falsely assert delivery; (c) leave in place, assessed — chosen.
**why-change:** no change from po_wip_ruling_20260823, but independently re-verified rather than relayed. WP-A children TASK_2008a/b/c are all DONE_VERIFIED in archive/2026-08.json; WP-B is genuinely blocked on UC-SDF-P2 (still backlog/plan_only/next_agent=ba). Read `scripts/orch-row-prose-ceiling-check.mjs` directly: PROSE_CEILING_LANES=['backlog','ready','review'], so any move from unguarded in_progress[] into a guarded lane sets liveBytes=0 and a >12000B row hard-rejects even byte-identical. No legal truth-preserving destination exists until D3 of FIX-ORCH-PROSE-CEILING-BLOCKS-NUMERIC-OCCURRENCE-BUMP-ON-OVER-CEILING-ROWS ships. next_agent=pm is correct, not stale — WP-B needs a pm hop once unblocked.
**WIP impact:** none. status=BLOCKED is excluded from wip_in_progress (devteam-eligibility.jq:115-118).

### STEP pm-S4 · pm · 2026-08-26T19:51:50Z
task_id: UC-MDH-P2
**what-done:** decomposed BA+architect design into 6 per-owner children per the carried B2 ruling and NFR-1/NFR-2 sequencing; parent row closed done[] with children[] written; DECOMPOSITION_COMPLETE=true (all scope now delegated, no residual pm work on this row).
**what-considered:**
- one combined FR-5 task — rejected: 3 files (digest-predict/init.md, market-analyst/init.md, tools/package/digest-predict.md) sit in agent-father's exclusive `docs/agents/` commit_zone per the architect's B2 ruling; a single task would cross owners.
- FR-1 minted parallel/unblocked — rejected: NFR-2 requires re-verifying 0 remaining instructive `append_session_record` hits AFTER FR-5, so FR-1 must `depends_on` both FR-5 halves, not run alongside them.
- FR-3/FR-4/FR-6 split into 3 tasks by FR number — rejected: NFR-1 mandates ONE commit in ONE off-market window; splitting the board rows would misrepresent 3 independently-completable units when they are not.
- chosen: 6 children — `UC-MDH-P2-FR5-DEV` (developer, 7 files) ∥ `UC-MDH-P2-FR5-AGENTFATHER` (agent-father, 3 files) ∥ `UC-MDH-P2-FR2-CATALOG` (developer) ∥ `UC-MDH-P2-FR7-STUBCLEANUP` (developer) both independent-parallel; `UC-MDH-P2-FR1-SKILLDIR-DELETE` (developer, depends_on both FR-5 halves); `UC-MDH-P2-FR346-DEPLOYGATED-BUNDLE` (developer, deploy_gate=user-approved-off-market, independent file set, not gated on siblings).
**why-decision:** encodes the architect's atomic-bundle and B2 ownership rulings as real `depends_on` edges rather than prose, per this row's own dispatch mandate.
**why-change:** no change from the architect's design; this is the direct decomposition of it. B1 (PO, parallel) left unresolved by design — either answer is compatible with the deploy-gated bundle as scoped.
**parent:** in_progress[] → done[], children=[UC-MDH-P2-FR5-DEV, UC-MDH-P2-FR5-AGENTFATHER, UC-MDH-P2-FR2-CATALOG, UC-MDH-P2-FR7-STUBCLEANUP, UC-MDH-P2-FR1-SKILLDIR-DELETE, UC-MDH-P2-FR346-DEPLOYGATED-BUNDLE]. `.head` reset to idle (was pinned to UC-MDH-P2).
