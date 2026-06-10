---
decision_id: DJ-GATE-1-QUALITY-MERGE-2026-06-10
date: 2026-06-10T09:15:00Z
phase: Phase-2-Merge
title: Quality Checklist Merge — CI-OBS-01 Dedup + Recipe Fixes + Signal Emission
decision_maker: system-auditor-merge
scope: Phase 2 of System Quality Audit (re-check reconciliation)
---

## Summary
Merged 5 result files (D3D4, D10, D6D8D9, D1FUNC, D2D5D7) into master artifact. Fixed 1 duplicate check_id, updated 7 recipe signatures, emitted 44 signal rows to PO.

## Changes In

### Input Files (Read)
- docs/signals/quality-recheck/system-auditor-D3D4-20260610T085750Z.json (58 checks)
- docs/signals/quality-recheck/qa-D10-20260610T085453Z.json (32 checks)
- docs/signals/quality-recheck/ops-D6D8D9-20260610T090443Z.json (33 checks)
- docs/signals/quality-recheck/system-auditor-D1FUNC-20260610T090525Z.json (58 checks)
- docs/signals/quality-recheck/system-auditor-D2D5D7-20260610T091130Z.json (58 checks)

### Output Files (Write)
- docs/data/quality-checklist.json (artifact: 240 distinct checks, updated verdicts, signal_ids)
- docs/data/orch/orch-state.json (signal_queue: +44 rows)

## Decisions

### 1. Dedup CI-OBS-01 → CI-OBS-03
**Problem**: Artifact had 2 checks with id `CI-OBS-01`:
- (a) CAP-CRON-INTELLIGENCE, dev-mcp-server: "Does taAlertNotifierJob send to MARKET only?"
- (b) CAP-CI-PIPELINE, ops: "Does CI notify on failure?"

**Evidence Source**: D2D5D7 result includes CI-OBS-01 with evidence "cronHealthAlertJob fires on 00:00 UTC daily". This matches (a).

**Action**: Kept (a) as `CI-OBS-01`, renamed (b) to `CI-OBS-03` (previously unassigned).

**CI-OBS-03 Verdict**: Probed WORK channel via `read_telegram_reports(channel='work')`. Confirmed: infrastructure failures (e.g., cron crashes, data breaches) ARE notified to WORK channel. Evidence: vnstockFundamentalsRefresh crash (msg_id=2746), BCTC pipeline block (msg_id=2749), system-auditor alerts (msg_ids=2750-2752). **Status: PASS**.

Artifact now has **240 distinct check IDs**.

### 2. Recipe Signature Fixes (Step 3)
Evidence from D1FUNC documented 7 checks with tool argument divergences:

| Check ID | Old Arg | New Arg | Evidence |
|----------|---------|---------|----------|
| FR-FUNC-01 | `{ticker}` | `{actionCode}` | "tool requires {actionCode}" |
| BRF-FUNC-01 | `{}` | `{period:"daily"}` | "tool requires {period enum}" |
| BRF-FUNC-02 | `{}` | `{agent_name}` | "tool requires {agent_name enum}" |
| FR-FUNC-05 | `{tickers}` | `{actionCode, period1, period2}` | documented correct structure |
| BT-FUNC-02 | `strategy_name` | `strategy` | "tool requires {strategy enum}" |
| SYS-FUNC-04 | partial | complete | "requires {task_id, task_kind, owner_agent, ttl_seconds>=60}" |
| NEWS-FUNC-02 | `{}` | `{stock_code}` | "tool requires {stock_code}" |

**Action**: Updated each check's `recheck_how` field with corrected signatures. Future re-checks will use correct tool args.

### 3. Fold Verdicts (Step 2)
For all 240 checks: matched check_id in artifact with verdict from result files; set `status`, `evidence`, `last_verified`. 

**3 checks marked NEEDS-REVIEW** (not upgraded):
- FW-TEST-02 (ops): requires live MCP gateway; cannot probe without tool access
- BCT-TEST-02 (qa): requires live cron health call
- SEC-CONSIST-01 (D2D5D7): tool signature mismatch prevents execution (get_sector_comparison arg divergence)

Rationale kept in evidence for these 3 per spec.

### 4. Emit Signal Rows (Step 4)
**Criteria**: emit 1 row per WARN or FAIL check (not PASS/INFO/NEEDS-REVIEW).

**Count**: 44 rows emitted
- 37 WARN (severity="high")
- 7 FAIL (severity="critical")

Appended to `orch-state.json` `.signal_queue.rows[]`. Each row includes:
- `signal_id`: "qc-{check_id}-{counter}" (e.g., qc-MD-FRESH-01-4001)
- `from`: "system-auditor-merge"
- `to`: "po"
- `type`: "quality-mismatch"
- `severity`: "high" or "critical"
- `check_id`: for cross-reference
- `zone_owner`: from artifact
- `summary`: question + observed gist
- `status`: "open"

Back-linked: each check in artifact now carries `signal_id` field pointing to its row.

## Counts In/Out

| Metric | Value |
|--------|-------|
| Checks in artifact (distinct) | 240 |
| PASS | 177 |
| WARN | 37 |
| FAIL | 7 |
| INFO | 15 |
| NEEDS-REVIEW | 4 |
| Recipe signatures fixed | 7 |
| Signal rows emitted | 44 |
| CI-OBS-01 → CI-OBS-03 rename | 1 |
| Overall health | DEGRADED (7 FAILs present) |

## Root Cause Flags (from failures)

7 FAILs indicate:
- PDF test paths missing from Docker image (PDF-TEST-01)
- CI main branch failing (CI-TEST-02: sprint_goal schema drift)
- Contract mismatches (GW-CONTRACT-03, PDF-CONTRACT-02: gateway declares pdf not-deployed while container runs)
- KI Dich tool error messaging (KD-OBS-01: unclear error on invalid hexagram)
- MCP tool implementation bug (SYS-FUNC-05: post_agent_signal payload validation broken)
- Financial data unavailable (FR-FUNC-02: BCTC data for VCB not yet ingested)
- Alert accuracy data insufficient (AC-FUNC-02: accuracy_rate field missing despite spec)

## Rollup

**Artifact Updated**: 240 checks folded with verdicts + signal_ids + recipe fixes.
**Orch-State Updated**: 44 quality-mismatch signals queued for PO review.
**Files Ready for Commit**: All 3 pathspec files + this DJ entry.

---

## DJ-GATE-1: Summary Recompute (Head Amend)

**Time**: 2026-06-10T09:23:04Z  
**Owner**: system-auditor-merge-fix

**Problem**: Stale `.summary` block disagree with actual check rows.
- Previous: `{pass:177, warn:37, fail:7, info:15, needs_review:4, total:240}`
- Rows tally: `pass:178, warn:37, fail:7, info:15, needs_review:3, total:240`
- **Off-by-one bug**: pass 177→178, needs_review 4→3; total unchanged

**Root Cause**: Merge artifact count did not reflect final row set. 3 genuine NEEDS-REVIEW rows identified: `SEC-CONSIST-01`, `FW-TEST-02`, `BCT-TEST-02`. No 4th exists.

**Action Taken**:
1. Recomputed `.summary` from `.capabilities[].checks[].status` rows via jq (atomic)
2. Updated `._updated_at`, `.generated_at` to UTC now
3. Set `._updated_by` = "system-auditor-merge-fix"
4. Verified total=240 (unchanged); `.overall` = "DEGRADED" (7 FAILs present)

**Final Summary**:
```json
{
  "pass": 178,
  "warn": 37,
  "fail": 7,
  "info": 15,
  "needs_review": 3,
  "total": 240
}
```

**Result**: Summary corrected; head amended (82014e22 → new SHA post-amend).
