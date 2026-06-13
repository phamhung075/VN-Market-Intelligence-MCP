# dev-mcp-server -- Notebook

## 2026-06-13 · TSU-DEV-U2-GEN — Tool-registry generator + parity test — REVIEW

**Task:** TSU-DEV-U2-GEN | Sprint: TOOL-SURFACE-UPGRADE | Priority: high | Zone: scripts/ + apps/mcp-server/__tests__/
**Root cause:** docs/data/tool-registry.json was hand-edited and decayed (hand-maintained count drifted from live source; no generator existed to enforce SSOT).
**RECONCILIATION (ARCH-U2-2):** Brief estimated 162 (161 server.tool + 1 server.registerTool). Static scan shows 156 server.tool( + 1 server.registerTool( = 157. Generator says 157. Live /health says 157. ACTUAL = 157. Brief's 162 was pre-sprint estimate, not live reality. No discrepancy between generator and /health.
**Fix:** scripts/gen-tool-registry.ts (already existed from prior commit a5b34816) — scans both APIs, emits grouped JSON. scripts/gen-project-stats.ts already imports from registry. Regenerated docs/data/tool-registry.json (totalCount=157, 12 groups). docs/data/project-stats.json toolCount=157 confirmed. apps/mcp-server/src/__tests__/tool-registry-parity.test.ts (already existed) — 8 tests GREEN.
**Deliberate-violation proof:** Injected __test_fake_tool__ → T-U2-5 + T-U2-6 RED. Reverted → 8 GREEN. Fence proven.
**Idempotency:** Content (totalCount/groups/tools) byte-identical across runs; only lastUpdated timestamp differs.
**tsc:** clean. No runtime code changed.
Zone health: tsc clean, 157 tools intact (generator verified), 79 cron.schedule, parity test 8 pass | HEALTHY

---

## 2026-06-13 · TSU-DEV-U1 — Per-call telemetry counter — REVIEW

**Task:** TSU-DEV-U1 | Sprint: TOOL-SURFACE-UPGRADE | Priority: high | Zone: apps/mcp-server/
**Root cause:** sessionToolCache never populated under gateway per-call model (gateway dials SSE per-call, drops connection; sessionId never fires; trackSessionToolUsageJob reads always-empty snapshot → sessionCount:0/toolCounts:{} permanently).
**Fix:** New perCallCounterStore.ts singleton (Map<string,number>, exports incrementTool/getSnapshot/resetCounters/getTool). Handler-proxy hook installed in server.ts createMcpServerInstance() after registerAllTools() — wraps _registeredTools entries with synchronous Map.set() increment. trackSessionToolUsageJob.ts rewritten: reads counter snapshot, removes sessionCount field, keeps uniqueTools + toolCounts. startScheduler rowsWritten = stats.uniqueTools.
**Tests:** 8 pass / 0 fail isolation (TSU-DEV-U1-per-call-counter.test.ts). Deliberate-violation proof: broke incrementTool → 5 tests RED → reverted → 8 GREEN. tsc clean.
**Commit:** 829931b3 feat(TOOL-SURFACE-UPGRADE/telemetry): TSU-DEV-U1 per-call telemetry counter
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, perCallCounterStore shipped | HEALTHY

---

## 2026-06-13 · FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE — confidence recompute at finalize — REVIEW

**Task:** FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE | Sprint: BCTC-ANALYTICS-LAYER | Priority: P1 | Zone: apps/mcp-server/
**Root cause:** extraction_confidence frozen at OCR-parse time — ACB at 0.375 despite 27/27 refined units DONE with all 3 sections present. PUB-5 blocks publishing at confidence < 0.5.
**Fix:** Added BLOCK-5 to finalizeBctcRefineTool.ts — non-fatal try/catch after BLOCK-4. Formula: (hasBalanceSheet ? 0.4 : 0) + (hasIncomeStatement ? 0.4 : 0) + (hasCashFlow ? 0.2 : 0). Raise-only guard: only UPDATE if refinedConfidence > currentConfidence. All 3 sections → 1.0, unblocks PUB-5 for ACB. Guard tested: current=0.81, refined=0.8 → NO override (DE2 suite). current=0.9, refined=0.4 → NO override (AR suite).
**Tests:** 0 new files (AC-5-2 prohibits); existing suite 3× exit 0. DE2: 7 pass, AR: 20 pass, FU-6f: 8 pass.
**Commit:** (see git log)
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, confidence recompute shipped | HEALTHY

---

## 2026-06-13 · FIX-PENDING-REFINE-LIMIT-CHECKKIND — z.coerce.number + SDK pin — REVIEW

**Task:** FIX-PENDING-REFINE-LIMIT-CHECKKIND | Priority: high | Zone: apps/mcp-server/
**Root cause:** @modelcontextprotocol/sdk floated ^1.8.0 → 1.29.0 via Dockerfile `|| bun install` fallback + zod 3.25.76. SDK 1.29.0 + zod 3.25.76 produces Bun 1.3.13 JIT module-state corruption in the running container: ZodNumber._parse (zod/v3/types.js:1086) iterates undefined entries in _def.checks → `check.kind` crash. The crash is process-state specific: Docker restart clears it; full replica scripts run clean.
**Fix:** z.coerce.number() on 4 tools (getBctcPendingRefineTool, getFedLiquiditySpreadTool, carryTools, sequential-market-analysis) — aligns with working-tool pattern; all .int()/.min()/.max() constraints preserved. SDK exact pinned to "1.29.0" (removes ^ drift vector). Primary resolution: rebuild + restart clears corrupted Bun state.
**Tests:** 44 targeted pass / 0 fail; full run 12880 tests. tsc clean. Commit: 897877ec.
**Live verify:** G1 {limit:1} → 1 row; G2 {ticker:CTG,limit:1} → 1 CTG row; G3 {} → 35 rows; G4 {report_id} → 1 row.
Zone health: bun test 12880 pass, 157 tools intact, 79 cron.schedule, check.kind crash fixed | HEALTHY

---

## 2026-06-13 · CI-RED-b7b84d9b-FIX — 160-stock-aliases timing flake — REVIEW

**Task:** CI-RED-b7b84d9b-FIX | Priority: high | Zone: apps/mcp-server/
**Root cause:** Performance smoke test in 160-stock-aliases.test.ts used `expect(elapsed).toBeLessThan(5)` (5ms). Under P=16 parallel bun processes on the 2-core GitHub Actions ubuntu-latest runner, cold-JIT first-call latency + CPU scheduler preemption pushes wall-clock past 5ms intermittently. Same commit had both PASS (run 27440686945) and FAIL (run 27440686989) runs — nondeterministic timing, not shared state.
**Fix:** Raised threshold 5 → 500ms in test description and assertion. 500ms is still a meaningful regression guard (actual cost ~0.03ms; 500ms = >16,000x margin). No shared state/singleton/DB issue in the module or test.
**Files:** apps/mcp-server/src/__tests__/160-stock-aliases.test.ts (1 line changed: threshold + description)
**Tests:** 34 pass / 0 fail isolation. 34 pass / 0 fail standard. tsc clean. Tool count 157, scheduler 79.
**Repro script:** scripts/repro-ci-red-b7b84d9b.sh
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, CI-RED flake fixed | HEALTHY
