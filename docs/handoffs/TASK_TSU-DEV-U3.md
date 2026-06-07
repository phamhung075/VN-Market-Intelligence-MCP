---
sprint: TOOL-SURFACE-UPGRADE
branch: task/TSU-U3-weak-claim-tools
size: L
zone: apps/mcp-server/src/interface/mcp/
depends_on: ["TSU-DEV-U1", "TSU-DEV-U2-GEN"]
blocks: ["TSU-DEV-U2-PARITY"]
---

# U3: 12 Weak-Claim Tools — Deregister & Integrate

## TLDR

Triage 12 tools with zero claims across all 4 usage layers (agents/flows/skills/cron). Execute architect's 5-question verdicts: DEREGISTER 5 tools (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day), INTEGRATE 7 tools (mark_alert_outcome, get_market_foreign_flow, diagnose/reset_foreign_flow_circuit_breaker, get_label_accuracy_report, get_public_contracts, list_flagged_bctc_cells, submit_bctc_correction). Deregistration: remove `server.tool()` blocks + orphaned imports. Integration: update tool descriptions (where needed) and signal cowork-refactory-expert lane for package docs updates.

---

## [PM] Planning Context

**Sprint:** TOOL-SURFACE-UPGRADE  
**Unit:** U3 — 12 weak-claim tool verdicts  
**Zone:** `apps/mcp-server/src/interface/mcp/`  
**Priority:** P2  
**Type:** Maintenance (deregister + integrate)  
**Effort:** ~3h  
**Blocked by:** U1 + U2-GEN (tool count must stabilize for U2-PARITY baseline)

### Acceptance Criteria

#### Deregister Block (5 tools)
- [x] AC-U3-1: `read_bctc_pdf` — remove `server.tool()` block from bctcPdfTools.ts, delete orphaned imports
- [x] AC-U3-2: `backfill_bctc_scalars` — remove tool block, delete orphaned imports
- [x] AC-U3-3: `compute_accruals` — remove tool block, delete orphaned imports
- [x] AC-U3-4: `get_accuracy_context` — remove tool block, delete orphaned imports
- [x] AC-U3-5: `is_trading_day` — remove tool block, delete orphaned imports (note: DWF-PHASE1 not in current scope)

#### Integrate Block (7 tools, description updates only; package wiring deferred to cowork-refactory-expert)
- [x] AC-U3-6: `mark_alert_outcome` — update tool description to clarify post-hoc scoring vs write_alert_verdict at-fire-time (distinct lifecycle); note which package it will wire to (ops/alert-commander)
- [x] AC-U3-7: `get_market_foreign_flow` — update description to clarify market-wide aggregate (SUM from daily_ohlcv) vs get_foreign_flow per-ticker; note package destination
- [x] AC-U3-8: `diagnose_foreign_flow_circuit_breaker` + `reset_foreign_flow_circuit_breaker` — update both descriptions to clarify debug/ops use case; note both tools will pair in ops/debug package
- [x] AC-U3-9: `get_label_accuracy_report` — update description to clarify label-level breakdown vs get_calibration_report calibration curve; note market-analyst accuracy package
- [x] AC-U3-10: `get_public_contracts` — confirm already in tran-ngoc-bau package (architecture-brief verification). No description change needed if description is honest. If flow does not reference it, note that integration may be incomplete.
- [x] AC-U3-11: `list_flagged_bctc_cells` — update description to clarify BCTC debug/inspect use; note bctc-analyst flow pairing
- [x] AC-U3-12: `submit_bctc_correction` — update description to clarify human correction entry point (MCP endpoint for BCTC-HUMAN-CONFIRM sprint); note bctc-analyst flow

#### Cowork-Refactory-Expert Signal
- [x] AC-U3-13: After deregister commits land, send signal row to `docs/data/orch/orch-state.json` `.signal_queue`: type="tool-deregister-signal", summary="U3 TOOL-SURFACE-UPGRADE: 5 tools removed (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day), 7 tools integrate-pending (descriptions updated, wiring deferred to cowork-refactory-expert lane)"

### Files to Read First

- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcPdfTools.ts` — locate `read_bctc_pdf` tool block
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/` — locate backfill_bctc_scalars, compute_accruals
- `apps/mcp-server/src/interface/mcp/tools/` — search for get_accuracy_context, is_trading_day locations
- `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` § U3 Verdicts (lines 365–390) — architect final verdicts per tool

### Files to Modify

**Deregister (5 files):**
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcPdfTools.ts` — remove read_bctc_pdf block + orphaned imports
- Backfill location (TBD by grep) — remove backfill_bctc_scalars block
- Compute location (TBD by grep) — remove compute_accruals block
- Accuracy location (TBD by grep) — remove get_accuracy_context block
- Trading location (TBD by grep) — remove is_trading_day block

**Integrate (7 files with description-only updates):**
- Find mark_alert_outcome tool block → update description
- Find get_market_foreign_flow tool block → update description
- Find diagnose/reset_foreign_flow_circuit_breaker tool blocks → update both descriptions
- Find get_label_accuracy_report tool block → update description
- Find get_public_contracts tool block → verify description (no change if honest)
- Find list_flagged_bctc_cells tool block → update description
- Find submit_bctc_correction tool block → update description

### Dependencies

- Depends on: TSU-DEV-U1 + TSU-DEV-U2-GEN (tool count baseline before U3 changes it)
- Blocks: TSU-DEV-U2-PARITY (parity test must run after final count settled)

### Knowledge Needed

- `docs/policies/dev-standards.md` — commit convention
- `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` § U3 Verdicts (lines 365–390) — architect verdicts per tool
- `docs/agent-memory/notebooks/cowork-refactory-expert.md` (if exists) — understand cowork-refactory-expert lane ownership

### Related Documentation

- Architect verdicts: `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` lines 366–389 (detailed table with 5-question answers per tool)
- Risk flag R-5: cowork-refactory-expert signal required after U3 commit

---

## Implementation Guidance

### Deregister (5 tools)

For each deregister target, locate the `server.tool()` block and remove it entirely:

**Example pattern to remove:**
```typescript
server.tool('read_bctc_pdf', 'Read BCTC PDF document...', {
  // ...parameters
}, async (args) => {
  // ...implementation
});
```

Also remove any imports that were ONLY used by this tool (check for orphaned statements like `import { somePdfParser } from '...'`).

**Deregister order:**
1. read_bctc_pdf (FIRST per NFR-U3-1 — most likely removal, stabilizes count for U2-GEN)
2. backfill_bctc_scalars
3. compute_accruals
4. get_accuracy_context
5. is_trading_day

### Integrate (7 tools)

Update tool description strings to clarify intent and note package destination. Description is the ONLY change (no signature/logic change).

**Mark_alert_outcome:**
```typescript
// Before:
server.tool('mark_alert_outcome', 'Mark alert outcome...',

// After:
server.tool('mark_alert_outcome', 
  'Mark alert outcome (post-hoc scoring). Distinct from write_alert_verdict which fires at alert creation time. ' +
  'Lifecycle: write_alert_verdict (at-fire-time) vs mark_alert_outcome (post-hoc review). Package destination: ops/alert-commander.',
```

**Similar pattern for other 6 tools:** Append clarity on overlap + package destination.

---

## Test Plan

### Unit Tests

1. **T-U3-1:** read_bctc_pdf tool not callable (removed from registry)
2. **T-U3-2:** backfill_bctc_scalars not in registry
3. **T-U3-3:** compute_accruals not in registry
4. **T-U3-4:** get_accuracy_context not in registry
5. **T-U3-5:** is_trading_day not in registry
6. **T-U3-6:** mark_alert_outcome description contains clarity text + package destination
7. **T-U3-7:** get_market_foreign_flow description updated
8. **T-U3-8:** diagnose/reset descriptions updated
9. **T-U3-9:** get_label_accuracy_report description updated
10. **T-U3-10:** list_flagged_bctc_cells description updated
11. **T-U3-11:** submit_bctc_correction description updated

### QA Gate

**QA-U3-1:** Run `list_server_tools("vn-market")` via gateway wrapper. Verify:
- 5 tools NOT present: read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day
- 7 tools present with updated descriptions: mark_alert_outcome, get_market_foreign_flow, diagnose_foreign_flow_circuit_breaker, reset_foreign_flow_circuit_breaker, get_label_accuracy_report, list_flagged_bctc_cells, submit_bctc_correction

**QA-U3-2:** Verify tool descriptions (raw JSON, not badge). No false-removed tools (check for typos in grep).

---

## Risk & Mitigation

**Risk R-U3-1:** Deregister a tool that is actually used (false positive from 4-layer grep). ARCH-U3-1 resolved `is_trading_day` (cowork-match-slots.js on main does NOT call it; DWF-PHASE1 worktree was cited). All 5 deregister candidates verified by architect (no hidden call sites).

**Mitigation:** Trust architect audit (4-layer + internal-call check). Post-deregister, live verification via gateway list_server_tools (AC-QA-U3-1 confirms absence).

**Risk R-U3-2:** Orphaned imports left behind. Solution: grep for each removed tool name in its source file, trace upstream imports, delete unused ones.

**Mitigation:** Careful import audit per removed tool.

**Risk R-U3-3:** Description updates incomplete or misleading. Solution: per AC, each description must clarify lifecycle/overlap + package destination.

**Mitigation:** Architect verdicts are the spec; copy-paste clarity language per table lines 366–389 of spec.

---

## Rebuild Required

**Yes.** After code change (tool deregistration affects server startup), rebuild:
```bash
docker compose build --no-cache mcp-server
docker compose up -d --no-deps --force-recreate mcp-server
```

QA verifies via `list_server_tools("vn-market")` raw call (not badge).

---

## Commit Checklist

- [ ] All 5 deregister blocks removed (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day)
- [ ] Orphaned imports deleted
- [ ] All 7 integrate descriptions updated with clarity + package destination
- [ ] All tests pass (tsc exit 0)
- [ ] Deregister verification via grep confirms tool names absent from source
- [ ] Commit message: `feat(U3): deregister 5 weak-claim tools, integrate 7 with description updates`
- [ ] AC trailer appended per commit-convention.md
- [ ] After commit lands, send signal to cowork-refactory-expert (AC-U3-13)

---

## Post-Commit Signal (cowork-refactory-expert lane)

After this commit lands, PM sends signal row to `docs/data/orch/orch-state.json` `.signal_queue`:

```json
{
  "type": "tool-deregister-signal",
  "from": "pm",
  "to": "cowork-refactory-expert",
  "created_at": "2026-06-07T...",
  "sprint": "TOOL-SURFACE-UPGRADE",
  "summary": "U3 COMPLETE: 5 tools removed (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day), 7 integrate-pending (descriptions updated, wiring deferred to your lane). docs/agents/tools/list/ entries must be deleted for 5 removed; docs/agents/tools/package/*.md must be updated for 7 integrate.",
  "removed_tools": ["read_bctc_pdf", "backfill_bctc_scalars", "compute_accruals", "get_accuracy_context", "is_trading_day"],
  "integrate_pending": ["mark_alert_outcome", "get_market_foreign_flow", "diagnose_foreign_flow_circuit_breaker", "reset_foreign_flow_circuit_breaker", "get_label_accuracy_report", "list_flagged_bctc_cells", "submit_bctc_correction"]
}
```

---

## Related Tasks

- Depends on: TSU-DEV-U1, TSU-DEV-U2-GEN (tool count baseline)
- Blocks: TSU-DEV-U2-PARITY (parity test must run after U3 final count)
- Independent of: TSU-DEV-U4 (separate zone), TSU-DEV-U5 (independent)
- Triggers: cowork-refactory-expert lane signal (post-commit)

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts` — removed `read_bctc_pdf` server.tool() block (~90 lines), removed `readFileSync` orphaned import, updated `list_stored_pdfs` description to reference OCR pipeline
  - `apps/mcp-server/src/interface/mcp/tools/financial-reports/backfillBctcScalarsTool.ts` — replaced server.tool() block with no-op registerBackfillBctcScalarsTool (handler retained)
  - `apps/mcp-server/src/interface/mcp/tools/financial-reports/computeAccrualsTool.ts` — replaced server.tool() block with no-op registerComputeAccrualsTool (handler retained)
  - `apps/mcp-server/src/interface/mcp/tools/news-analysis/getAccuracyContextTool.ts` — replaced server.tool() block with no-op registerGetAccuracyContextTool
  - `apps/mcp-server/src/interface/mcp/tools/system/isTradingDayTool.ts` — replaced server.tool() block with no-op registerIsTradingDayTool (domain function retained)
  - `apps/mcp-server/src/interface/mcp/tools/alerts/alertAccuracy.ts` — mark_alert_outcome description updated: lifecycle clarification + package destination (ops/alert-commander)
  - `apps/mcp-server/src/interface/mcp/tools/market-data/marketWideForeignFlowTool.ts` — get_market_foreign_flow description updated: market-wide aggregate vs per-ticker distinction + source tier + package destination
  - `apps/mcp-server/src/interface/mcp/tools/market-data/foreignFlowTools.ts` — diagnose + reset circuit breaker descriptions updated: ops/debug use case + sibling pairing
  - `apps/mcp-server/src/interface/mcp/tools/macro/calibrationTools.ts` — get_label_accuracy_report description updated: label-level vs calibration curve distinction + package destination
  - `apps/mcp-server/src/interface/mcp/tools/sector/publicInvestmentTools.ts` — get_public_contracts description updated: integration note (already in tran-ngoc-bau package)
  - `apps/mcp-server/src/interface/mcp/tools/financial-reports/listFlaggedBctcCellsTool.ts` — list_flagged_bctc_cells description updated: bctc-analyst/inspect flow pairing
  - `apps/mcp-server/src/interface/mcp/tools/financial-reports/submitBctcCorrectionTool.ts` — submit_bctc_correction description updated: human correction entry point + BCTC-HUMAN-CONFIRM sprint reference
  - `docs/data/tool-registry.json` — regenerated via gen-tool-registry.ts (162→157)
  - `docs/data/project-stats.json` — regenerated via gen-project-stats.ts (toolCount 162→157)
  - `docs/data/orch/orch-state.json` — TSU-DEV-U3 status REVIEW + cowork-refactory-expert signal row appended
- **Tests written:** `apps/mcp-server/src/__tests__/TSU-DEV-U3-weak-claim-tools.test.ts` — 12 assertions, GREEN
- **Type check:** clean (bun tsc --noEmit)
- **bun test TSU-DEV-U3:** 12 pass / 0 fail
- **bun test tool-registry-parity:** 8 pass / 0 fail (T-U2-5 verified: 157 matches source)
- **Full suite:** 0 fail (background exit code 0)
- **Tool count:** 157 tools (162 - 5 deregistered; matches gen-tool-registry.ts output)
- **Scheduler count:** 76 cron.schedule entries (unchanged — baseline 76)
- **Docs updated:** `docs/handoffs/TASK_TSU-DEV-U3.md` — this section | `docs/data/tool-registry.json` | `docs/data/project-stats.json`
- **Graphify:** skipped (no architecture docs impacted — tool surface change only)

**Gate evidence:**
- `bun tsc --noEmit`: exit 0 (no output)
- `bun test TSU-DEV-U3`: 12 pass / 0 fail
- `bun test tool-registry-parity`: 8 pass / 0 fail (T-U2-5: registry 157 matches source 157)
- Tool count (gen-project-stats --dry-run): `"toolCount": 157` (expected 162→157)
- Scheduler count: 76 (unchanged)

**Zone health:** bun test 0 fail, 157 tools (5 deregistered), registry regenerated, scheduler 76 cron.schedule | HEALTHY
