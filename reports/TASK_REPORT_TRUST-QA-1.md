## Task Report TRUST-QA-1 — BCTC-TRUST-RED Re-Sweep (cycle-159)

changed: [apps/mcp-server/src/__tests__/240-bctc-full.test.ts (fixer: caf6865d — +86/-7 lines, test helpers only)]
tests: see per-suite below | tsc: 19 errors in DWF-routing-policy-fence.test.ts (pre-existing, out-of-scope) | ddd: PASS | security: PASS
verdict: APPROVED

### Authoritative Per-Suite Counts

| Suite | Pass | Fail | Notes |
|---|---|---|---|
| TRUST-RED-sanity-gate.test.ts | 8 | 0 | 6 TR-RED gate cases + 2 edge cases |
| bctcSanityValidator.test.ts | 18 | 0 | Authoritative (prior report of 37 was error) |
| bctcMagnitudeValidator.test.ts | 17 | 0 | Authoritative (prior report of 20 was error) |
| 240-bctc-full.test.ts | 5 | 0 | Fixed by caf6865d (was 1/4 fail) |
| AR-refined-units-idempotency.test.ts | 13 | 0 | Authoritative (prior report of 17 was error) |
| AIT-DEV-1.test.ts (7-tab) | 59 | 0 | Unchanged |
| HCM-DISAMBIG-extraction.test.ts | 19 | 0 | 0-diff from 891dd3f0, fixer untouched |

Full suite: `bun test` exits 0 (confirmed).

### Discrepancy Reconciliation

Prior QA notebook cycle-158 reported bctcSanityValidator=37 and bctcMagnitudeValidator=20. These were reporting errors in the notebook, not hidden tests. Authoritative counts are 18 and 17 respectively (confirmed by grep -c "it(" and live bun test output). No test is not-running. Fixer's report of 18/17 is consistent with the authoritative counts.

AR-refined-units-idempotency similarly: prior reported 17, authoritative is 13.

### HCM-DISAMBIG 0-Diff Confirmation

`git diff 891dd3f0 HEAD -- apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts` = empty output. Fixer commit `caf6865d` touched only `240-bctc-full.test.ts` (confirmed via `git diff --name-only caf6865d~1..caf6865d`). 19 pass / 0 fail confirmed.

### TRUST-RED Gate Still Blocks

Fixer modified test helpers only (makeDb schema, insertFinancialRow return type, new insertTableRow/insertRefinedUnit helpers). No production code files were touched by `caf6865d`. Gate handlers `pushBctcRefinedUnitTool.ts`, `finalizeBctcRefineTool.ts`, `bctcFullTools.ts` are identical to pre-fixer state. All 8 TRUST-RED sanity gate cases pass (including TR-RED-1 through TR-RED-6 which demonstrate the sanity/magnitude/publish guards fire correctly).

### Publish Guard Genuinely Exercised (Not Bypassed)

The 5 tests in 240-bctc-full genuinely invoke `checkPublishability`:
- Tests 1/3/4/5: inject `insertTableRow` (feeds PUB-2 value_current and PUB-3 balance_sheet non-summary row) and `insertRefinedUnit` (feeds PUB-4 DONE unit). makeDb() sets `refine_status DEFAULT 'DONE'` (feeds PUB-1). These tests assert financial section text like "=== BCTC SUMMARY: VCB ===" which is only served when all 4 PUB gates pass.
- Test 2: no financial rows inserted → `latestRow = null` → early return before `checkPublishability`. This was already passing before fixer (no regression).

### TSC Note

`bun tsc --noEmit` reports 19 errors in `DWF-routing-policy-fence.test.ts`. These errors were introduced by commit `8105f8fd` (DYN-WF-FOUNDATION sprint, `lastRule` possibly undefined), which is out-of-scope for BCTC-TRUST-RED. Verified pre-existing at git stash (same errors at `caf6865d~1`). No new tsc errors introduced by `caf6865d`.

### Verdict

APPROVED. Sprint BCTC-TRUST-RED is ready for ops rebuild.

Fixer commit: caf6865d
QA cycle: cycle-159 · 2026-05-30
