# Sprint 1950-T2 QA Report

**Task:** 1950-T2 — TNB audit gains chef pipeline cycle-coverage check
**Date:** 2026-05-18
**Outcome:** CHANGES_REQUESTED
**Round:** 1
**QA:** qa agent | commit: ad68cf5c (feat) + 1283c602 (chore/notebook)

---

## Pipeline

- bun test / tsc: N/A — flow-doc + agent-md only patch; no TypeScript source changed
- DDD scan: N/A — Markdown flow docs, no import boundaries
- Security scan: N/A — no source code, no process.env, no secrets
- Scope creep: PASS — only 4 expected files in diff (audit-chef-coverage.md, main.md, tran-ngoc-bau.md, TASKS.md)

---

## Non-Negotiable Matrix

| NN | Description | Result | Evidence |
|---|---|---|---|
| NN-1 | Phase 0.5 fires AFTER Bootstrap, BEFORE any layer-walk | PASS | main.md dispatch table: Bootstrap row first, Phase 0.5 row second (before Phase 1-2 layer-walk) |
| NN-2 | START↔CLOSE pairing by cycle_id | PASS | audit-chef-coverage.md Step 0.5a: "For each cycle_id in Set A: Look up matching cycle_id in Set B" |
| NN-3a | Rule 1 (counts low): BUG with exact format `[tnb-audit] chef-coverage-low \| starts=N closes=M expected≥3` | PASS | audit-chef-coverage.md:53-55 — format matches spec exactly |
| NN-3b | Rule 2 (STUCK): BUG per stuck cycle with `[tnb-audit] chef-stuck \| cycle_id=... \| dish=... \| last_seen=START \| slot=...` | PASS | audit-chef-coverage.md:58-62 — format matches spec exactly, one BUG per cycle_id |
| NN-3c | Rule 3 (FAILED): NO new BUG — enumerate in Step 7 WORK row only | PASS | audit-chef-coverage.md:65-69 — "Do NOT raise new BUG"; Step F enumeration deferred to Step 7 WORK audit row |
| NN-4 | Threshold ≥3 references cron-jobs.md Chef Cook Schedule, not hardcoded | PASS | audit-chef-coverage.md:49 cites "see `docs/standards/cron-jobs.md` Chef Cook Schedule"; header at line 5 names same ref; cron-jobs.md Chef Cook Schedule lists Morning + EOD + Evening as guaranteed (3 slots, verified) |
| NN-5 | Error boundary: WORK read fails → BUG + pipeline_degraded + CONTINUE (no EXIT) | PASS | audit-chef-coverage.md Error boundary section: BUG sent, pipeline_degraded=true set, "Proceed to Phase 1 layer-walk audit (do not EXIT)" |
| NN-6 | File size: every touched file ≤200L | PASS | audit-chef-coverage.md=94L, main.md=44L, tran-ngoc-bau.md=142L — all within limit |
| NN-7 | SSOT/DRY: no duplicate logic that could drift from cron-jobs.md | PASS | threshold derivation points to cron-jobs.md; no hardcoded count appears in code |
| NN-8 | pipeline_degraded flag surfaces in Step 7 WORK audit row when set | **FAIL** | audit-chef-coverage.md:82 states "the Step 7 WORK audit row must include the coverage summary prominently" — but auto-cure-and-handoff.md Step 7 WORK template has NO conditional on pipeline_degraded. The flag is declared and set but never consumed. Step 7 template will emit the same output whether pipeline_degraded=true or false. |

---

## Acceptance Criteria Matrix

These map to the T2 non-negotiables (REQ_1950.md §T2 section does not exist as a formal block; ACs derived from spawn context and sub-flow spec):

| AC | Description | Result | Evidence |
|---|---|---|---|
| AC-T2-1 | Phase 0.5 runs after Bootstrap, before layer-walk | PASS | main.md dispatch table ordering confirmed |
| AC-T2-2 | START↔CLOSE paired by cycle_id per T1 format `chef-{dish_type}-{YYYYMMDDTHHmmZ}` | PASS | Step 0.5a pairs by cycle_id; format established by T1 (f4688989) |
| AC-T2-3 | Rule 1 BUG format matches spec | PASS | Exact match confirmed |
| AC-T2-4 | Rule 2 BUG format matches spec, one per stuck cycle | PASS | Exact match confirmed |
| AC-T2-5 | Rule 3: FAILED → WORK enumeration only, no new BUG | PASS | Explicit "Do NOT raise new BUG" instruction |
| AC-T2-6 | Threshold ≥3 referenced from cron-jobs.md, not hardcoded | PASS | Prose reference + header citation in file |
| AC-T2-7 | Error boundary: survive WORK channel outage, set pipeline_degraded, CONTINUE | PASS | Error boundary section correct |
| AC-T2-8 | pipeline_degraded flag changes Step 7 output | **FAIL** | See NN-8 above — auto-cure-and-handoff.md Step 7 template is static; no pipeline_degraded conditional exists |

---

## Blocking Issues

### BLOCK-1: pipeline_degraded flag not consumed in Step 7 WORK template

**File:** `.claude/flows/tran-ngoc-bau/auto-cure-and-handoff.md`
**Line:** 15-25 (Step 7 template block)

`audit-chef-coverage.md:82` says:
> "If `guaranteed_ok=false`, tag this audit cycle as `pipeline_degraded=true` — the Step 7 WORK audit row must include the coverage summary prominently."

The Step 7 WORK message template in `auto-cure-and-handoff.md` is:
```
[Tran Ngoc Bau] Quality Audit HH:MM UTC
MARKET messages: N checked | M issues
Agent sessions: N reviewed | M methodology gaps
...
```

There is no conditional block, no `pipeline_degraded` variable referenced, and no coverage summary field. An agent running this flow will set `pipeline_degraded=true` internally but the Step 7 WORK message will look identical to a healthy run.

**Fix required:** Add a conditional to Step 7 in `auto-cure-and-handoff.md`. Suggested minimal fix:

```
[Tran Ngoc Bau] Quality Audit HH:MM UTC
{IF pipeline_degraded=true: PIPELINE DEGRADED — chef-coverage: starts={start_count} closes={close_count} stuck={stuck_count}}
MARKET messages: N checked | M issues
...
```

---

## Non-Blocking Observations

### NB-1: REQ_1950.md has no §T2 section

`docs/handoffs/REQ_1950.md` is a T1-only document. §8 "Out of Scope" explicitly defers T2 to a future doc. No `TASK_1950-T2.md` handoff file exists. Traceability gap: T2 ACs live only in the spawn context / agent-father notebook. Recommend: add §T2 acceptance criteria block to REQ_1950.md or create `docs/handoffs/TASK_1950-T2.md` on next touch.

### NB-2: convergence= wire format vs convergence_detected schema (inherited from T1)

This was deferred in the 1950-T1 QA report. The T2 sub-flow does not parse the `convergence` field from SENT lines (it only extracts `dish_type`, `slot_utc`, `cycle_id`) — so this discrepancy has no impact on T2 logic. No new issue introduced here. Still pending REQ owner (ba) reconciliation.

### NB-3: guaranteed_ok=false includes stuck_count > 0 but stuck cycles already trigger individual BUGs

In Step 0.5c, `guaranteed_ok=false` if stuck_count > 0. This is correct and will set `pipeline_degraded=true`. The individual stuck-cycle BUGs (Rule 2) are already emitted at that point. No double-alerting issue — the pipeline_degraded flag is supplementary context for Step 7 (once the blocking issue is fixed).

---

## Merge Status

CHANGES_REQUESTED — do not merge until BLOCK-1 is resolved.

The fix scope is small: one conditional block added to `auto-cure-and-handoff.md` Step 7 template. All other non-negotiables pass. This is a round-1 fixer task.

---

## [QA] Review Record

- Round: 1
- Issues: 1 blocking (BLOCK-1), 3 non-blocking (NB-1 doc gap, NB-2 inherited deferred, NB-3 informational)
- Reviewed: ad68cf5c + 1283c602
- QA agent: qa | 2026-05-18

---

## [Fixer] Fix Record

- **Issues fixed:** BLOCK-1 — pipeline_degraded flag now consumed by Step 7 WORK template
- **File:** `.claude/flows/tran-ngoc-bau/auto-cure-and-handoff.md` (Line 18)
- **Change:** Added conditional `{IF pipeline_degraded=true: PIPELINE DEGRADED — chef-coverage: starts={start_count} closes={close_count} stuck={stuck_count}}` to Step 7 WORK message template
- **Verification:** File size 95 lines (within 200L limit); no TypeScript compilation needed; template syntax matches existing conditional pattern
- **Signal:** `docs/signals/fixer-2026-05-18T17-22-31Z-1950-T2-fix.json`
- **Commit:** `d307d294` — fix(flows/tran-ngoc-bau): pipeline_degraded surfaces in step 7 work row [1950-T2]
