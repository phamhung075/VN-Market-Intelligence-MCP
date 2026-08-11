---
sprint: ULTRACODE-AUDIT-FIXALL
branch: task/2007-asl-p5-signal-canonicalize
size: S
zone: cross-service/
depends_on: []
blocks: []
---

## TLDR

Implement two signal pipeline fixes from UC-ASL-P5 rescope: (1) differentiate Tier-1 probe `signal_queue` row `type` by check class (microservice_degraded for A-01–A-11/A-20/A-21/A-30, signal_feedback unchanged for A-12–A-19/A-32/A-33); (2) close the dedup-skip unclosed-loop in PO triage (repair_task_request/ci_red/zone_missing_tier3 branches now flip originating signal row from NEW/READ to RESOLVED via orch-apply.sh, never block task creation if row unresolvable).

## [PM] Planning Context

- **Zone:** cross-service/ (multi-file: flow docs, no apps/<service> involved)
- **Acceptance Criteria:**
  - [ ] Verify FR-1 design mapping in `tier1-probe.md` (confirm A-01–A-11, A-20, A-21, A-30 use `microservice_degraded`; A-12–A-19, A-32, A-33 stay `signal_feedback`)
  - [ ] Update tier1-probe.md line 328–343 (shared "Emit per failure" template) with category-type lookup table & conditional literal (not hardcoded single value)
  - [ ] Update tier1-probe.md line 91 (A-20 dedicated call site) to use `microservice_degraded`
  - [ ] Update tier1-probe.md line 227–234 (A-30 clause) to document microservice_degraded classification explicitly
  - [ ] Update tier1-probe.md lines ~306–318 (A-33 dedicated call site) with clarification that it stays signal_feedback (no functional change, documentation only)
  - [ ] Fix triage-signals.md lines 18/22/23 (dedup-skip branches: zone_missing_tier3, repair_task_request, ci_red) to resolve originating signal row ID and flip status NEW/READ→RESOLVED via orch-apply.sh if resolvable; log-and-skip if not
  - [ ] Fix triage-signals.md line 27 (change "SHOULD stamp" to "MUST stamp" for origin_signal_id on newly-minted rows)
  - [ ] Fix triage-signals.md citation from non-existent `"§ CLOSE"` to correct `"## ACK / CLOSE"` anchor in signal-dashboard/SKILL.md
  - [ ] Verify no new script/schema/rebuild needed — FR-1 is 100% flow-doc call-site literals; FR-2 reuses task-archive.md's orch-apply.sh pattern
  - [ ] Run the recommended test fixtures: verify-tier1-category-type-mapping.sh (regression on all 3 call sites) + orch-apply-dedup-skip test (READ→RESOLVED, NEW→no-op, unresolvable→no-op)
  - [ ] Commit with explicit pathspec on the two modified files only

- **Files to read first:**
  - `docs/handoffs/UC-ASL-P5-BA-spec.md` (full spec, including architect's brownfield findings + 3 design decisions)
  - `docs/agents/system-auditor/flow/tier1-probe.md` lines 328–343, 91, 227–234, 306–318 (all category-type call sites)
  - `docs/agents/po/flow/triage-signals.md` lines 18/22/23/27 (dedup-skip branches + origin_signal_id note)
  - `docs/agents/pm/flow/task-archive.md` lines 118–134 (proven orch-apply.sh-gated RESOLVED-flip pattern to reuse for FR-2)

- **Files to modify:**
  - `docs/agents/system-auditor/flow/tier1-probe.md` (FR-1 category-type differentiation)
  - `docs/agents/po/flow/triage-signals.md` (FR-2 dedup-skip RESOLVED-closure)

- **Files to create:**
  - `scripts/audits/verify-tier1-category-type-mapping.sh` (static regression script: grep tier1-probe.md named lines, assert literals match design table)

- **Dependencies:** none (no upstream task blocks this)

- **Knowledge needed:**
  - `docs/policies/dev-standards.md` (script persistence, commit convention)
  - `docs/handoffs/UC-ASL-P5-BA-spec.md` § [Architect] Brownfield Findings (design decisions 1–3, verified paths, reuse patterns, test strategy, risk flags)
  - `docs/agents/pm/flow/task-archive.md` § lines 118–134 (orch-apply.sh + Zod/CAS-guarded write contract)
  - `.claude/skills/signal-dashboard/SKILL.md` (signal status ACK/CLOSE contract: NEW→READ=ACK, READ→RESOLVED=CLOSE)

- **Notes:**
  - **No code change needed:** `scripts/emit-audit-signal.sh` already passes `--category-type` through verbatim per-call; FR-1 is flow-doc-only literal edits
  - **Test fixture requirement:** architect recommended two verification scripts (tier1 static regression + dedup-skip fixture with READ/NEW/unresolvable controls); build these inline with AC
  - **Risk:** LOW (FR-1) — blast radius = one shared template serving 4 check classes, prose-only; mitigated by regression script. LOW-MEDIUM (FR-2) — residual risk is durable-drain combined-write invariant; mitigated by negative-control fixture (NEW→no-op explicit)

---

## Design Summary

### FR-1: Category-Type Differentiation
Insert a lookup table immediately above tier1-probe.md:335 EMIT SEQUENCE naming which check-class maps which literal:
- `microservice_degraded` ← A-01–A-11 (Container Status), A-20 (PDF), A-21 (Restart Count), A-30 (Memory Reclamation)
- `signal_feedback` ← A-12–A-19 (Health Endpoints: transport-probe facts, not confirmed service degradation), A-32 (Disk: host-level, not per-service), A-33 (Hook Liveness: enforcement mechanism, not running-service fact)

Then change line 337's hardcoded `--category-type "signal_feedback"` to a placeholder filled per table. Rationale: Tier-1 is the only audit tier emitting ONE hardcoded category-type across ~7 check classes; Tier-2/3 differentiate. This closes the observability precision gap (PO routing rule `microservice_degraded` never reachable from Tier-1 today) without changing behavior (A-12–A-19 routing behavior identical under both single-WARN rules).

### FR-2: Dedup-Skip RESOLVED-Closure
Three dedup-skip branches contain dead prose ("mark signal DONE, skip"). The ONLY systematic RESOLVED-flip mechanism (pm/task-archive.md) fires only on done_verified rows with origin_signal_id — structurally cannot cover a dedup-skip disposition. Fix: on each branch, resolve originating row id via existing rule (payload.id if signal JSON carries one; else drained signal_queue.rows[].id from drain-signals.md §0a-D), then flip READ→RESOLVED via orch-apply.sh if resolvable, no-op if not. Guard on `status=="READ"` only (never `NEW`) — invariant: rows resolvable at dedup-skip time are always already READ by drain-signals.md's combined append+flip write. Also fix line 27 "SHOULD" → "MUST" stamp and citation `§ CLOSE` → `## ACK / CLOSE`.

---

## Test Strategy (per architect recommendation)

1. **FR-1 static regression:** `scripts/audits/verify-tier1-category-type-mapping.sh`
   - Grep tier1-probe.md named line ranges
   - Assert each `--category-type` literal matches the ratified table
   - Catches future doc drift without needing live Tier-1 fire per check class
   - Exit 0 = PASS, exit 1 = MISMATCH

2. **FR-2 dedup-skip fixture:** throwaway test (never modify live signal_queue)
   - (a) Resolvable + status=READ → flips to RESOLVED ✓
   - (b) Resolvable + status=NEW → explicit no-op (Design Decision invariant) ✓
   - (c) Unresolvable id → no-op, task-creation/dedup-skip logging proceeds unblocked ✓

---

## RETURN

TASK: 2007 — Tier-1 Signal Type Canonicalization + Dedup-Skip RESOLVED-Closure
ZONE: cross-service/ (flow-doc only, no apps/<service>)
SIZE: S (decomposed as single task per architect, no zone split warranted)
DEPENDS: none
NEXT: developer (generic, not dev-<service> specialist)
HANDOFF: docs/handoffs/TASK_2007-asl-p5-signal-canonicalize.md
