# Decision Journal — Sprint TOOL-SURFACE-UPGRADE · qa

**Sprint goal:** Registry generated not hand-rotted; parity test catches drift; telemetry, weak-claim verdicts, delta sweep, foreign-flow ingest repair.
**Agent:** qa
**Started:** 2026-06-07T08:30:00Z

---

### STEP qa-S1 · qa · 2026-06-07T08:30:00Z
**task-id:** TSU-DEV-U2-GEN
**what-done:** QA gate for registry generator + parity test (scripts/gen-tool-registry.ts, tool-registry-parity.test.ts, regenerated tool-registry.json, project-stats.json toolCount, gen-project-stats.ts registry-SSOT chaining).
**what-considered:**
- bun test: 8/8 pass (reproduced independently, not relayed from developer badge).
- tsc --noEmit: exit 0 clean.
- Anti-false-green: injected __test_fake_tool__ into alerts group — T-U2-5 (totalCount mismatch 163 vs 162) + T-U2-6 (missing tool name) both FAIL; reverted → 8/8 pass. Fence is real.
- DDD scan: scripts/ + __tests__/ only import node built-ins — zero domain/infra/app imports. PASS.
- Security: no process.env (only process.argv for --dry-run flag), no secrets, no SQL. PASS.
- Generator dry-run: totalCount=162, 12 groups, idempotent output matches committed registry.
- AC-U2-1..9 all verified against committed code. Sequencing note honored: TSU-DEV-U2-PARITY (final count after U3 deregistrations) is a separate downstream task.
**why-decision:** All checks green including independently reproduced anti-false-green injection. No arch concern (pure scripts + test file, no new MCP tool, no cross-service HTTP). APPROVED.
**why-change:** no change from plan.

### STEP qa-S3 · qa · 2026-06-07T12:00:00Z
**task-id:** TSU-DEV-U5
**what-done:** QA gate for foreign flow null holding ratio — DSI compliance gate for fabricated holding_ratio field (VPS API does not return this field; all stored values are ?? 0 fabricated zeros).
**what-considered:**
- bun test TSU-DEV-U5-*.test.ts: 10/10 pass (reproduced independently). 16 expect() calls.
- tsc --noEmit: exit 0 clean (0 errors).
- DDD scan: foreignFlowAnalyzer.ts (domain/services) has zero imports from infrastructure or application. PASS.
- Security scan: no process.env in any of the 3 modified files. No secrets/tokens/passwords. PASS.
- mock-guard.sh exit 0: no fabricated-data patterns in production source.
- No bare catch: both catch blocks typed (err) with err instanceof Error guard.
- Tool description at foreignFlowTools.ts:138-147 does NOT mention "holding ratio change" — AC-U5-3 PASS.
- DSI edge-case analysis (handoff request): heuristic `history.every(r => r.holdingRatio === 0)` is correct. VPS API bgapidatafeed never returns the field — vnstockStore stores ?? 0 for ALL tickers. A genuinely 0% foreign-ownership ticker would also be treated as fabricated (false-null, not false-real). This is the correct conservative DSI posture: displaying 0.00% as real data would be the violation; treating it as unavailable is safe and honest.
- Reasoning string gate: `!isHoldingRatioFabricated && Math.abs(holdingRatioChange5d) > 0.005` at line 154 correctly suppresses the "foreign ownership up/down X% over 5d" append when fabricated. String is honest.
- Commits: c21cec46 (implementation) + 43894aaf (memory). Both on main (branch: task/TSU-U5-foreign-flow-null-ratio was merged).
- AC-U5-1..U5-7: all verified against committed code. T-U5-1..T-U5-8 present in test file.
- Live-verify deferral: sprint-final rebuild per handoff policy. Mark code-approved.
- Concurrency: U3 worker may be active — no contention (separate tool zones, no shared files).
**why-decision:** All code-gate checks green. DSI heuristic is honest and correct for the known architectural constraint (VPS API never provides the field). No arch concern (no new MCP tool, no new domain service, modification is gate logic only). APPROVED (code gate), live-verify pending sprint-final rebuild.
**why-change:** no change from plan.

### STEP qa-S2 · qa · 2026-06-07T08:50:00Z
**task-id:** TSU-DEV-U4
**what-done:** QA gate for direction+delta sweep — Go test suite + go vet + live endpoint + gateway passthrough + additive-only + DDD + security all verified.
**what-considered:**
- go test -count=1 ./...: 12/12 packages pass (application, infrastructure, interface/http, module, 5 primitives). go vet: 0 errors.
- Live POST :5004/snapshot: vnIndexDelta=7.35, vnIndexDirection="up", oil/gold/usdVnd delta=null direction="unknown". Fields present and correct per ops handoff claim.
- Gateway passthrough: MCP JSON-RPC :3000 via Accept: application/json,text/event-stream → same 8 fields present in served payload. TS tool is thin proxy — confirmed passthrough, not a transform layer.
- Additive-only: git diff shows dtos.go = additions only (8 new fields, no renames or removals). AC-U4-7 PASS.
- DDD: domain/ports.go imports only context+time — no infrastructure/application imports. Fence-A clean.
- Security: no hardcoded secrets, no process.env in modified Go files. PASS.
- T-U4-1..T-U4-7 all present in usecases_test.go. Contract test updated with FetchPrevSessionVnIndex stub on both fake adapters.
- mcp-server: Up 2 minutes (healthy), RestartCount=0. "Up 21 seconds" ops note = normal restart from rebuild — not crash-loop.
**why-decision:** All gates green. additive-only confirmed. Gateway passthrough confirmed end-to-end. No arch concern (Go-only change, no new MCP tool, no new domain service). APPROVED.
**why-change:** no change from plan.
