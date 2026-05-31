# Task Report: TSH-1 — Deregister get_market_hexagram
date: 2026-05-31
sprint: TOOL-SURFACE-HYGIENE
outcome: CHANGES_REQUESTED

## Test Results
- 298-macro-score-fix.test.ts: 11 pass / 0 fail (computeMacroIndicatorScore retained — PASS)
- 285-kinhdich-tools.test.ts: 19 pass / **9 fail** (7 pre-existing + 2 NEW from missing test update)
- 251-mcp-tools.test.ts: 13 pass / 0 fail
- 087-server-wiring.test.ts: 10 pass / 0 fail
- Full suite: OOM crash (pre-existing host memory limitation, not introduced by TSH-1)
- TypeScript: 0 errors (bun tsc --noEmit clean)

## DDD Compliance: PASS
Modified file is interface layer (interface/mcp/tools/kinhdich/kinhDichTools.ts).
Infrastructure imports are permitted in interface layer. No domain layer violations.

## Security: PASS
No process.env, no hardcoded credentials, no new surface area.

## Container Verification
- Container: vn-market-intelligence-mcp-mcp-server-1, started 2026-05-31T10:49Z (after commit c29f36cf)
- GET /health: {"status":"ok","toolCount":154} — correct (155 pre-TSH-1 baseline − 1 = 154)
- get_market_hexagram: ABSENT from deployed kinhDichTools.ts (verified via docker exec grep)
- 5 sibling kinhdich tools: PRESENT (get_kinhdich_reading, get_hexagram_history,
  get_transition_probabilities, run_hexagram_backtest, explain_hexagram — confirmed via grep)

## /health toolCount Finding

**Finding: toolCount=154 is CORRECT (NOT a stale literal).**

The `/health` toolCount is computed dynamically at server startup from a probe McpServer instance
(apps/mcp-server/src/interface/mcp/server.ts:204-208):

```typescript
const probeServer = createMcpServerInstance();
const registeredToolsMap = (probeServer as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
const toolCount = Object.keys(registeredToolsMap ?? {}).length;
```

SDK 1.29.0 confirms `_registeredTools` is the real field (mcp.js:19: `this._registeredTools = {}`).
Total source registrations: 153 `server.tool()` + 1 `server.registerTool()` = 154.
Pre-TSH-1 baseline was 155 (confirmed from notebook cycle-162: toolCount=155 at 2026-05-31T01:10Z).
155 − 1 deregistered = 154. The live health count IS accurate.

The router's claim of "was 154 → should be 153" used incorrect baseline (thought pre-TSH-1 = 154).
Actual baseline was 155. Post-TSH-1 = 154 is correct.

**RECOMMENDATION: No fix needed for /health toolCount.** The metric is live and accurate.
The note about "stale literal" is a false alarm. The /health endpoint correctly reflects
the live registered tool count. NOT in scope for TSH-5 project-stats reconcile either.

**Separate finding — registry.ts comment stale**: Line 172 says "6 Kinh Dich tools" but
is now 5. Non-blocking cosmetic; recommend a 1-line comment fix in TSH-5 cleanup pass.

## Issues Found

### Blocking
- **apps/mcp-server/src/__tests__/285-kinhdich-tools.test.ts:83-85** — `registers get_market_hexagram`
  test expects `tools["get_market_hexagram"]` to be defined. Tool was deregistered (TSH-1).
  Test must be removed or updated to assert ABSENCE.

- **apps/mcp-server/src/__tests__/285-kinhdich-tools.test.ts:103-115** — `registers exactly 6 new tools`
  test includes `get_market_hexagram` in kinhDichToolNames array and asserts it's defined.
  Must be updated: remove `get_market_hexagram` from array, change description to "exactly 5 new tools".

### Non-Blocking (pre-existing, NOT introduced by TSH-1)
- 285-kinhdich-tools.test.ts: 7 explain_hexagram failures — kinh-dich-service returns 501
  "Not implemented - pending B-bucket primitive wiring". Pre-existing since P2-KD-G (2026-05-24).
- Full bun test OOM crash — pre-existing host memory limitation.
- registry.ts:172 comment says "6 Kinh Dich tools" — stale cosmetic comment (should be "5").

## Merge Status
CHANGES_REQUESTED — 2 blocking issues in 285-kinhdich-tools.test.ts must be fixed before merge.
