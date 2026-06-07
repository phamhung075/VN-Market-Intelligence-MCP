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
