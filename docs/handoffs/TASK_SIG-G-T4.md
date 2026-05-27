# TASK_SIG-G-T4 — D-IMPROVE Proposal-Doc Bridge

Sprint SELF-IMPROVE-GATE · Phase 2 lane-B proven-gate CODE · Task 4 of 6 dev tasks

**Owner:** dev-mcp-server | **Handoff from:** PM (SIG-IMPL-GATE decomposition) | **Date:** 2026-05-27

---

## Task Summary

Extend `selfImproveOrchestratorJob.ts` to write a structured `docs/improvement-proposals/IMP-<YYYYMMDD>-<slug>.md` file in DRAFT form for each finding that survives the cooldown guard, AND append a row to `docs/signals/DASHBOARD.md` with `type=improvement_proposal, status=NEW`. This is the bridge connecting the code substrate (TASK-3) to the flow-governance layer (EDIT-1..5 from Phase 1).

**Files to create/modify:**
1. `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` — Modify: add doc-write step
2. `apps/mcp-server/src/infrastructure/signals/improvementSignalWriter.ts` — NEW file (extracted helper)

**Test file:** `apps/mcp-server/src/__tests__/1948d-improvement-signal-writer.test.ts` — 8 acceptance criteria tests

**Dependencies:** TASK-3 (extends the orchestrator job)

**Blocked by:** TASK-3 must be complete first

**Blocks:** Nothing (TASK-5 is parallel)

---

## DDD Layer

- **Orchestrator (Interface/Scheduler):** The doc-write step is part of the job execution, runs AFTER log+Telegram
- **Writer helper (Infrastructure/Signals):** New file `improvementSignalWriter.ts` handles the file I/O. This is an output adapter (infrastructure layer).

**CRITICAL C-5 ISOLATION:** The doc-write step must be wrapped in `try/catch`. If it throws, the orchestrator logs the error and **continues** — the `improve_check_log` insert and WORK Telegram (steps 7-11 from TASK-3) must complete even if doc-write fails. The doc-write is the add-on; the log+Telegram is the primary pipeline.

---

## Proposal Doc Format (Brief §3 + C-1 Additions)

```markdown
---
id: IMP-20260527-price-confirmation-degraded
created_at: 2026-05-27T09:02:00Z
created_by: system-auditor
status: DRAFT
lane: LANE-B
---

## Weakness

Signal-type `price_confirmation` shows accuracy degradation: 7-day rate 40.0% vs 30-day baseline 55.0% (delta -15pp, significant decline).

## Evidence

- Source: improve_check_log (system-auditor's detect run 2026-05-27T09:02:00Z)
- 7-day window: 40.0% (sample_count: 5)
- 30-day window: 55.0% (sample_count: 10)
- Delta: 15pp (>= 10pp threshold for DEGRADED classification)

## Proposed Change

Verify price signal source freshness; review signal correlation with price tiers.

### Structured Target (C-1 — REQUIRED for agent-father dispatch)

**target_agent:** dev-mcp-server
**target_files:** ["apps/mcp-server/src/scheduler/alerts/"]

## Lane Rationale

LANE-B: Signal accuracy degradation has a hard machine-checkable gate (unit test suite goes red on injected regression). Proof required before any auto-dispatch.

## Success Signal

- Unit test suite for `detectDegradedSignalTypes()` goes RED when threshold is tightened (regression injected)
- Reverting the injection returns suite to GREEN
- Proof recorded in this doc's Gate Proof section

## Rollback

Revert the code changes that fix the degradation (e.g., revert the source-freshness check). Accuracy metric will return to prior state (data-dependent, not instant).
```

---

## Slug Derivation & Dedup Key

**Slug rule (canonical, deterministic):**
```
slug = {signal_type_kebab}-{detection_class_lower}
id   = IMP-{YYYYMMDD}-{slug}

Examples:
  signal_type='price_confirmation', class='DEGRADED'
    → slug='price-confirmation-degraded'
    → id='IMP-20260527-price-confirmation-degraded'

  signal_type='volume_spike', class='PERSISTENTLY_LOW'
    → slug='volume-spike-persistently-low'
    → id='IMP-20260527-volume-spike-persistently-low'
```

**Dedup key (weakness_identifier):**
```
weakness_identifier = "${signal_type}_${detection_class}"

Examples:
  price_confirmation_DEGRADED
  volume_spike_PERSISTENTLY_LOW
```

**Cooldown check:** Before writing a proposal doc, scan `docs/improvement-proposals/` for an existing file matching the pattern `IMP-*-{signal_type_kebab}-{detection_class_lower}.md`. If a DRAFT or ARCHITECT-REVIEWED file already exists for this weakness_identifier, skip the doc write (log the skip; the `improve_check_log` insert still happens).

---

## FIX_AREA → target_agent Mapping (C-1 Typed Derivation)

```typescript
export const FIX_AREA_TO_AGENT: Record<string, { target_agent: string; area_hint: string }> = {
  'apps/mcp-server/src/scheduler/alerts/': {
    target_agent: 'dev-mcp-server',
    area_hint: 'apps/mcp-server/src/scheduler/alerts/',
  },
  'apps/mcp-server/src/scheduler/news/': {
    target_agent: 'dev-mcp-server',
    area_hint: 'apps/mcp-server/src/scheduler/news/',
  },
  'apps/technical-analysis/': {
    target_agent: 'dev-technical-analysis',
    area_hint: 'apps/technical-analysis/',
  },
  'manual': {
    target_agent: 'UNRESOLVED',
    area_hint: '',
  },
};
```

**Lookup rule:**
- `fix_area` comes from `DEGRADATION_CAUSE_MAP[signal_type].fix_area`
- Look up `fix_area` in `FIX_AREA_TO_AGENT`
- If found: use `target_agent` + `target_files: [area_hint]`
- If not found: fallback to `target_agent: 'UNRESOLVED'`, `target_files: []` (fail-safe)
- `_default` entry has `fix_area: 'manual'` → maps to `UNRESOLVED`/`[]` (C-1 AC-T4-7)

---

## Proposal Writer Functions

```typescript
// apps/mcp-server/src/infrastructure/signals/improvementSignalWriter.ts

import type { DegradationFinding } from '../../domain/services/degradationRules.js';

export interface ImprovementProposalFields {
  id: string;                 // IMP-{YYYYMMDD}-{slug}
  created_at: string;         // ISO-8601 UTC
  created_by: 'system-auditor';
  status: 'DRAFT';
  weakness: string;
  evidence_source: string;    // 'improve_check_log'
  evidence_data: string;      // "7d_rate=..., 30d_rate=..., delta=..."
  proposed_change: string;    // from DEGRADATION_CAUSE_MAP.suggested_fix
  lane: 'LANE-A' | 'LANE-B';
  lane_rationale: string;
  success_signal: string;
  rollback: string;
  target_agent: string;       // From FIX_AREA_TO_AGENT or 'UNRESOLVED'
  target_files: string[];     // [area_hint] or []
}

/**
 * Writes docs/improvement-proposals/{id}.md in DRAFT form.
 * Throws on file-write failure (caller wraps in try/catch, non-fatal per C-5).
 * Does NOT commit — main terminal serializes commits.
 * Creates parent directories if absent.
 */
export async function writeImprovementProposal(
  fields: ImprovementProposalFields,
): Promise<void>;

/**
 * Appends a row to docs/signals/DASHBOARD.md ## po section.
 * Creates file + section if absent. Throws on write failure.
 */
export async function appendDashboardRow(
  id: string,
  createdAt: string,
  summary: string,       // ≤40 chars
  proposalPath: string,
): Promise<void>;
```

---

## Acceptance Criteria

### AC-T4-1: Proposal doc written with C-1 structured fields

**Test:** Run orchestrator with one DEGRADED finding for `signal_type='price_confirmation'`. Assert file `docs/improvement-proposals/IMP-{date}-price-confirmation-degraded.md` exists with all required brief §3 fields + C-1 `target_agent` and `target_files` fields with non-empty values.

**Evidence to paste:**
```
Test result: PASS
Finding: price_confirmation, DEGRADED
File created: IMP-20260527-price-confirmation-degraded.md
Fields present:
  - weakness: [text] ✓
  - evidence_source: improve_check_log ✓
  - proposed_change: [text] ✓
  - lane: LANE-B ✓
  - success_signal: [text] ✓
  - rollback: [text] ✓
  - target_agent: dev-mcp-server ✓
  - target_files: ["apps/mcp-server/src/scheduler/alerts/"] ✓
```

---

### AC-T4-2: target_agent is kebab-case

**Test:** Assert the proposal doc's `target_agent` field matches regex `^[a-z][a-z0-9-]+$` (kebab-case, no spaces).

**Evidence to paste:**
```
Test result: PASS
target_agent values found: dev-mcp-server, dev-technical-analysis, UNRESOLVED
All match kebab-case regex: YES
```

---

### AC-T4-3: target_files is valid JSON array

**Test:** Extract `target_files` string from the proposal doc. Assert `JSON.parse()` succeeds and returns an array.

**Evidence to paste:**
```
Test result: PASS
target_files: ["apps/mcp-server/src/scheduler/alerts/"]
JSON.parse() succeeds: YES
Result is array: YES
Array length: 1
```

---

### AC-T4-4: DASHBOARD.md row appended

**Test:** Run orchestrator, creating a proposal. Assert `docs/signals/DASHBOARD.md` has a new row in the `## po` section with format:
```
| {id} | {created_at} | system-auditor | improvement_proposal | {summary} | NEW | {proposal-path} |
```

**Evidence to paste:**
```
Test result: PASS
DASHBOARD.md ## po section updated: YES
New row appended:
| IMP-20260527-price-confirmation-degraded | 2026-05-27T09:02:00Z | system-auditor | improvement_proposal | price_confirmation accuracy degraded (7d=40%, 30d=55%) | NEW | docs/improvement-proposals/IMP-20260527-price-confirmation-degraded.md |
```

---

### AC-T4-5: Cooldown guard prevents duplicate docs

**Test (C-1 cooldown):** Create temp dir with existing `IMP-*-price-confirmation-degraded.md` file. Run orchestrator twice with same finding. Assert only 1 proposal file exists (second run skips doc write).

**Evidence to paste:**
```
Test result: PASS
Run 1: IMP-20260527-price-confirmation-degraded.md created
Run 2: Same finding detected, cooldown check finds existing doc
Run 2: Doc-write skipped (logged as duplicate)
improve_check_log: 2 rows inserted (both attempts logged)
Proposal files: 1 (not 2)
```

---

### AC-T4-6: Doc-write failure is non-fatal (C-5 isolation)

**Test:** Inject `writeProposalFn` that throws an error. Run orchestrator with a finding. Assert `cron_job_runs` still has `status='success'` and WORK Telegram was still sent (log+Telegram not aborted).

**Evidence to paste:**
```
Test result: PASS
writeProposalFn injects throw: "Disk full error"
runSelfImproveOrchestrator() called with injected deps
improve_check_log: 1 row inserted ✓
sendWork: called 1 time ✓
cron_job_runs: status='success' ✓
Error logged: '[selfImproveOrchestrator] doc-write failed: Disk full error' ✓
No exception propagated to process
```

---

### AC-T4-7: _default → UNRESOLVED fallback

**Test:** Create a finding with signal_type='totally_unknown' (maps to `_default` in DEGRADATION_CAUSE_MAP). Run orchestrator. Assert proposal doc contains `target_agent: "UNRESOLVED"` and `target_files: []`. Document must write successfully.

**Evidence to paste:**
```
Test result: PASS
Finding: totally_unknown (uses _default DEGRADATION_CAUSE_MAP entry)
Proposal doc created: IMP-20260527-totally-unknown-degraded.md
target_agent: UNRESOLVED ✓
target_files: [] ✓
Document writes without error: YES
```

---

### AC-T4-8: DASHBOARD row appended (not prepended)

**Test:** Write existing DASHBOARD.md with 1 row. Run `appendDashboardRow()`. Assert the new row appears AFTER the existing row in file.

**Evidence to paste:**
```
Test result: PASS
DASHBOARD.md before:
| [existing-id] | ... | ... | improvement_proposal | ... | ... | ... |

DASHBOARD.md after:
| [existing-id] | ... | ... | improvement_proposal | ... | ... | ... |
| IMP-20260527-new-finding | ... | ... | improvement_proposal | ... | NEW | docs/improvement-proposals/... |

New row is after existing row: YES
```

---

## Implementation Notes

1. **Lane classification at emit time (inside orchestrator before calling writeImprovementProposal):**
   - DEGRADED or PERSISTENTLY_LOW → lane='LANE-B' (hard gate: unit test)
   - COVERAGE_GAP → lane='LANE-A' (flow/config change, no code gate)

2. **C-5 isolation pattern:**
   ```typescript
   // Inside runSelfImproveOrchestrator after step 11 (Telegram sent):
   for (const finding of survivingFindings) {
     try {
       await deps.writeProposalFn?.(finding, runDate);
     } catch (err) {
       logger.error('[selfImproveOrchestrator] doc-write failed:', err.message);
       // Continue — do NOT rethrow, do NOT break loop
     }
   }
   ```

3. **Mkdir-if-absent:** In `writeImprovementProposal()`, create parent directories if absent:
   ```typescript
   const dir = new URL('.', proposalUrl).pathname;
   await Bun.file(dir).mkdir({ recursive: true });
   ```

4. **DASHBOARD.md section creation:** If `## po` section does not exist, create it. If file does not exist, create file with header.

5. **No commits:** The proposal doc write is a file-system side effect. Do NOT stage or commit inside the orchestrator; main terminal handles commits.

6. **Directory creation:** `docs/improvement-proposals/` must be created if absent (R-4 from blueprint).

---

## Files Touched

| File | Change | Lines |
|---|---|---|
| `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts` | Modify: add doc-write step | +30 lines |
| `apps/mcp-server/src/infrastructure/signals/improvementSignalWriter.ts` | NEW | ~200 lines |
| `apps/mcp-server/src/__tests__/1948d-improvement-signal-writer.test.ts` | NEW | ~250 lines (8 test suites) |

---

## Submission Checklist

- [ ] `improvementSignalWriter.ts` created with `writeImprovementProposal()` + `appendDashboardRow()`
- [ ] Orchestrator modified: doc-write step added AFTER log+Telegram, wrapped in try/catch
- [ ] Test file created with 8 ACs passing
- [ ] AC-T4-1 through AC-T4-8 all PASS in `bun test`
- [ ] C-1 typed `FIX_AREA_TO_AGENT` mapping verified (no prose parsing)
- [ ] C-5 isolation verified: doc-write failure does NOT abort log+Telegram
- [ ] Slug derivation: `{signal_type_kebab}-{detection_class_lower}` validated
- [ ] Cooldown check: existing DRAFT/ARCHITECT-REVIEWED doc prevents duplicate writes
- [ ] `docs/improvement-proposals/` and `docs/signals/` created if absent
- [ ] No commits inside writer; main terminal handles commits
- [ ] All files UNSTAGED (NOT staged with `git add`)
- [ ] No new branches created (all on `main`)

---

## Next Task

After this task is complete and verified PASS, the next task is **TASK-5 (SIG-G-T5)**: Per-path kill-switch (C-4). TASK-5 is parallel to TASK-4 (both extend TASK-3).
