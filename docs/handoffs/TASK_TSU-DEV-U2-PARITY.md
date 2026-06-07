---
sprint: TOOL-SURFACE-UPGRADE
branch: task/TSU-U2-parity-final-count
size: S
zone: apps/mcp-server/src/__tests__/
depends_on: ["TSU-DEV-U3", "TSU-DEV-U6"]
blocks: []
---

# U2-PARITY: Registry Parity Test + Final Count Sync

## TLDR

FINAL TASK (runs LAST, after all U3 deregistrations + U6 description updates committed). Re-run generator to settle final tool count post-deregistration. Re-run parity test to verify generator output matches source extraction. Sync `project-stats.json` toolCount to final generator output. Expected final count: 157 (162 initial − 5 deregistered via U3).

---

## [PM] Planning Context

**Sprint:** TOOL-SURFACE-UPGRADE  
**Unit:** U2-PARITY — Final count verification + sync  
**Zone:** `apps/mcp-server/src/__tests__/` + `docs/data/`  
**Priority:** P1 (hard gate)  
**Type:** Test + verification  
**Effort:** ~1h  
**HARD SEQUENCING:** Must run AFTER TSU-DEV-U3 + TSU-DEV-U6 committed (tool count must be final)

### Acceptance Criteria

- [x] AC-U2-P-1: Re-run `bun scripts/gen-tool-registry.ts` after all U3 deregistrations committed
- [x] AC-U2-P-2: Verify generated totalCount = 157 (162 initial − 5 deregistered: read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day)
- [x] AC-U2-P-3: Compare generated count against `/health` toolCount via gateway wrapper; if delta > 0, architect must document the delta in final brief
- [x] AC-U2-P-4: Re-run parity test `bun test tool-registry-parity.test.ts`; all assertions PASS (totalCount match, all registry tools exist in source)
- [x] AC-U2-P-5: Sync `project-stats.json` toolCount field to final generator output (157)
- [x] AC-U2-P-6: Final `docs/data/tool-registry.json` reflects 157 tools, grouped by category, _maintained_by header locked

### Files to Read First

- `docs/data/tool-registry.json` (from TSU-DEV-U2-GEN, should show 162 tools pre-U3)
- `scripts/gen-tool-registry.ts` (generator created in TSU-DEV-U2-GEN)
- `apps/mcp-server/src/__tests__/tool-registry-parity.test.ts` (test created in TSU-DEV-U2-GEN)
- `docs/data/project-stats.json` — toolCount field (currently 162, to be synced to 157)

### Files to Modify

- `docs/data/tool-registry.json` — re-generated (output of gen-tool-registry.ts post-U3)
- `docs/data/project-stats.json` — toolCount field (sync to final generator output)

### Dependencies

- Depends on: TSU-DEV-U3 (deregister 5 tools) + TSU-DEV-U6 (finalize descriptions)
- Hard gate: CANNOT run before U3 commits (would produce stale count, false-green parity test)

### Knowledge Needed

- `docs/policies/dev-standards.md` — commit convention
- `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` § U2: Registry Generator Design (lines 345–363)
- `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` § U2 Parity Test (lines 354–358)

### Related Documentation

- Generator: `docs/handoffs/TASK_TSU-DEV-U2-GEN.md` (implementation of gen-tool-registry.ts + parity test)
- Deregistrations: `docs/handoffs/TASK_TSU-DEV-U3.md` (5 tools removed)
- Risk flag R-U2-1: count race mitigation (U2-PARITY LAST prevents false-green)

---

## Implementation Guidance

### Step 1: Re-run Generator

```bash
cd /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP
bun scripts/gen-tool-registry.ts
```

Expected output:
```
Generated docs/data/tool-registry.json with 157 tools
```

Verify file written with totalCount=157 (not 162 from prior run).

### Step 2: Verify Against /health

Via gateway wrapper call:

```javascript
const result = await call_tool(server="vn-market", tool="...", arguments={...});
// Parse response, check /health endpoint for toolCount
```

Query the mcp-server's `/health` endpoint (if exposed via gateway). If toolCount field exists, compare:
- Generator output: 157
- /health toolCount: should match 157 (if not, delta must be documented by architect)

**Expected outcome:** /health ≈ 157 (within 0 delta tolerance). If delta > 0, document which tools are dynamic-registered not caught by static grep.

### Step 3: Re-run Parity Test

```bash
bun test tool-registry-parity.test.ts
```

Expected output: all tests PASS (6 assertions + anti-false-green).

### Step 4: Sync project-stats.json

Update `project-stats.json` toolCount field:

```json
{
  "toolCount": 157,
  // ... rest of project-stats ...
}
```

Alternatively, if gen-project-stats.ts was updated to import registry count (per TSU-DEV-U2-GEN), re-run:

```bash
bun scripts/gen-project-stats.ts
```

This should automatically sync toolCount to 157.

### Step 5: Verify Final State

Check all SSOT files:
- `docs/data/tool-registry.json` — totalCount: 157
- `docs/data/project-stats.json` — toolCount: 157
- `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` — footnote: "FINAL COUNT VERIFIED: 157 tools (162 initial − 5 deregistered per U3)"

---

## Test Plan

### Unit/Integration Tests

1. **T-U2-P-1:** Parity test passes (registry totalCount = source extraction count)
2. **T-U2-P-2:** Every registry tool exists in source
3. **T-U2-P-3:** Anti-false-green: deliberate violation in registry → test FAILS, revert → test PASSES

### QA Gate

**QA-U2-P-1:** Verify final state:
- `tool-registry.json` totalCount = 157
- `project-stats.json` toolCount = 157
- /health (if available) toolCount ≈ 157
- Parity test all PASS
- No deregister false-positives (5 tools actually gone from runtime list)

**QA-U2-P-2:** Delta audit (if /health ≠ generator output):
- List any tools in /health not in registry (dynamic-registered outside tools/**/*.ts)
- Document in final architect brief § Risk Flags

---

## Risk & Mitigation

**Risk R-U2-P-1:** U3 deregister task failed or rolled back. Result: count does not drop to 157. Mitigation: verify U3 committed successfully (git log shows deregister commits), re-run gen if needed.

**Risk R-U2-P-2:** /health toolCount ≠ generator output (dynamic registrations exist outside tools/**/*.ts). Mitigation: architect audit per ARCH-U2-2. Document delta as known limitation this sprint (future: improve generator to scan server.ts directly).

**Risk R-U2-P-3:** Parity test fails (generator and test source extraction diverge). Mitigation: debug both regex patterns, ensure they match exactly.

---

## Rebuild Required

**No new rebuild needed.** U3 rebuild already executed. This task is verification only (no code change, no new logic).

---

## Commit Checklist

- [ ] Re-run generator: `bun scripts/gen-tool-registry.ts` (output: 157 tools)
- [ ] Re-run parity test: all PASS
- [ ] project-stats.json toolCount synced to 157
- [ ] Final registry.json with _maintained_by header locked
- [ ] Verify /health toolCount ≈ 157 (or document delta)
- [ ] Commit message: `chore(U2-PARITY): final count verification — 157 tools after U3 deregistrations`
- [ ] AC trailer appended per commit-convention.md (note: count-settle gate closed)

---

## Hard Gate: Cannot Proceed Before U3 Commits

This task MUST run AFTER:
1. TSU-DEV-U3 commit lands (5 tools deregistered, count drops 162 → 157)
2. TSU-DEV-U6 commit lands (descriptions finalized, no further tool changes)

If either task rolls back or fails, U2-PARITY must NOT run (would create stale parity test with wrong expected count).

---

## Post-Commit Actions (PM)

After U2-PARITY commits successfully:
1. Update sprint narrative in orch-state.json: "TOOL-SURFACE-UPGRADE COMPLETE — final count 157, parity verified"
2. Update head.status → idle (sprint ready for closure)
3. Update head.next_agent → po (sprint closure review)
4. Archive signal: tool-deregister-signal (sent during U3, now acknowledged via U2-PARITY close)

---

## Related Tasks

- Depends on: TSU-DEV-U3 (deregister 5), TSU-DEV-U6 (finalize descriptions)
- Blocks: None (terminal task)
- Triggers: Sprint closure review (po)
