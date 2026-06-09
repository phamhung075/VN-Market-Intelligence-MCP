# CI-629 Failure Taxonomy — FU-CI-PROFILE-629

**Date:** 2026-06-09  
**Author:** Architect  
**CI run:** 27177364641 · job 80229060413 · sha e442cf11  
**Scope:** apps/mcp-server/ bun test suite  
**Baseline:** 615 native fails + 14 native errors = 629 total  
**Method:** Native summary tally (authoritative) + CI log (`/tmp/ci-629-full.txt`, 64,683 lines) profiled with timestamp-boundary Python analysis. Marker counts (`(fail)` string occurrences) treated as secondary only.

---

## Cluster Table (ranked attack order)

| Rank | Cluster | Root Cause | Native Fails | Native Errors | Total | Est. Fix Cost | Files Affected |
|------|---------|-----------|-------------|--------------|-------|--------------|---------------|
| 1 | **MCP-SDK mock contamination** | `1862c-transport-session-eviction.test.ts` at CI execution position #316 calls `mock.module("@modelcontextprotocol/sdk/server/mcp.js")` with a `MockMcpServer` that has only `connect()` — no `.tool()` or `.registerTool()`. Bun's global ESM cache propagates this mock to every subsequent test file. After position #316, any test that calls `server.tool()` or `server.registerTool()` on a real MCP server instance gets `TypeError: server.tool is not a function`. `afterAll(() => mock.restore())` does NOT fully unload ESM-cached modules in the same bun process. | ~343 | 12 | ~355 | **LOW** — rewrite 1862c to mock only the `connect` method (e.g. `vi.spyOn` / constructor override) rather than replacing the entire module, OR wrap in a `--filter` isolation that forces a new process | 69+ test files post-position-316 |
| 2 | **ENOENT broken symlink** | `apps/mcp-server/data` is tracked as a git symlink (mode 120000) pointing to `../../data` (repo root `/data/`, which is git-ignored via `/data/` in `.gitignore`). In CI the symlink target does not exist. `setup.ts` `mkdirSync(DATA_ROOT, { recursive: true })` silently swallows the resulting ENOENT in its catch block. Any test that resolves a path inside `data/` (e.g. `join(process.cwd(), "data", "__test-briefings-125__")`) gets `ENOENT: no such file or directory`. | ~91 | 0 | ~91 | **LOW** — add `mkdir -p apps/mcp-server/data/...` step in CI `.github/workflows/ci.yml` before `bun test`, OR replace the symlink with a real directory in the repo, OR fix `setup.ts` catch block to re-throw non-EEXIST errors | 7 test files (incl. 125-test-e2e-briefing.test.ts) |
| 3 | **ASSERTION / LOGIC** | Heterogeneous class: (a) sbv.js module mock contamination — `123-integration-mcp.test.ts` (position #30) and `083-tool-analysis.test.ts` (position #231) both `mock.module("../infrastructure/fetchers/sbv.js", ...)` without restoring; `028-sbv-rates.test.ts` (position #221) then receives the mocked implementation instead of the real `fetchSbvRates`, causing null returns and 10 assertion failures; (b) format/parser assertion failures where test expectations diverge from current code output; (c) test files that belong to completed RED-phase specs whose implementation has since drifted; (d) various minor test-local issues. Passes locally (confirms CI-only contamination for the sbv sub-class). | ~159 | 0 | ~159 | **HIGH** — requires per-file triage; sbv contamination fix is LOW (add `afterAll(() => mock.restore())` to 123-integration-mcp and 083-tool-analysis), but remaining ~149 need individual diagnosis | ~58 files |
| 4 | **UNDEFINED-FN (unimplemented)** | `1168-market-message-digest.test.ts` imports `getMarketMessageDigest` which does not exist in the codebase. Every test in the file throws `TypeError: getMarketMessageDigest is not a function`. This is a RED-phase test written before the implementation. | ~21 | 0 | ~21 | **MEDIUM** — implement `getMarketMessageDigest`, OR mark the test file as pending if the feature is not yet in scope | 1 file |
| 5 | **DEAD-MODULE** | Two `_deprecated/` test files import `../infrastructure/fetchers/reuters.js` which has been deleted from the codebase. Bun throws `Cannot find module` at file evaluation time, producing 2 native errors (one per file). | 0 | 2 | 2 | **LOW** — delete the two `_deprecated/` test files (they are deprecated by name) | 2 files |
| 6 | **Schema-drift** (PARKED) | `no such table` errors appearing as noise in error blocks across multiple test files, traced to singleton `_db` pollution after 7 test files call `closeDb()` without calling `initDatabase()`. Touched across 6 spikes (P4-P8). Residual pure native fails: ~4; remaining schema noise is embedded inside Cluster 1/3 counts. | ~4 | 0 | ~4 | **EXHAUSTED** — 6 spike iterations (P4–P8) without net improvement; do not re-litigate without a new mechanism | 7 close-no-init files |

**Reconciliation:** 343 + 91 + 159 + 21 + 4 ≈ 618 native fails (≤ 615 within ±3 margin from cluster boundary overlap); 12 + 2 = 14 native errors. Total ≈ 629. ✓

---

## Ranked Attack Order

1. **Cluster 1 — MCP-SDK mock contamination** (355 total, single file, LOW cost)
2. **Cluster 2 — ENOENT broken symlink** (91 total, CI workflow + symlink, LOW cost)
3. **Cluster 5 — DEAD-MODULE** (2 errors, delete 2 deprecated test files, LOW cost)
4. **Cluster 3 — ASSERTION/LOGIC sbv sub-class** (~10 fails, add mock.restore() to 2 files, LOW cost)
5. **Cluster 4 — UNDEFINED-FN** (21 fails, implement or pending-gate, MEDIUM cost)
6. **Cluster 3 — ASSERTION/LOGIC remainder** (~149 fails, per-file triage, HIGH cost)
7. **Cluster 6 — Schema-drift** (PARKED — do not re-open without new mechanism)

---

## Recommendation: Attack Cluster 1 First

Cluster 1 (MCP-SDK mock contamination) accounts for approximately **355 of the 629 failures** (56 %) from a **single root-cause file**: `apps/mcp-server/src/__tests__/1862c-transport-session-eviction.test.ts`. The fix is bounded: rewrite the mock in that one file so it does not replace the entire `@modelcontextprotocol/sdk/server/mcp.js` module. Specifically, the `MockMcpServer` must expose `.tool()` and `.registerTool()` as no-op mocks alongside `connect()`, or the mock must be scoped to the transport layer only rather than the McpServer class. This change carries zero production-code risk (test file only), unblocks 69+ downstream files that are fully correct, and eliminates the 12 `server.registerTool is not a function` unhandled-rejection errors in one pass. Attacking Cluster 2 (symlink ENOENT, CI workflow config) immediately after adds another ~91 failures for effectively zero code change. Together, Clusters 1 + 2 + 5 represent 448 failures that can be eliminated with LOW-cost, bounded, non-production changes — dropping the suite from 629 to approximately 181 native fails before any ASSERTION/LOGIC or UNDEFINED-FN triage begins.

---

## Evidence Sources

- CI log `/tmp/ci-629-full.txt` (64,683 lines, job 80229060413)
- P7 gate signal `docs/signals/ci-p7-gate-result-3572444a-20260609T0335Z.json`
- P8 gate signal `docs/signals/ci-p8-gate-result-6295cb32-20260609T0410Z.json`
- `apps/mcp-server/src/__tests__/1862c-transport-session-eviction.test.ts` — mock.module call confirmed
- `apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js` — `.tool()` line 657, `.registerTool()` line 699 (version 1.29.0)
- `apps/mcp-server/src/__tests__/setup.ts` — silent ENOENT swallow confirmed
- `git ls-files --stage apps/mcp-server/data` → mode 120000 (symlink) → target `../../data` (git-ignored)
- Local spot-runs (3 files only, within safe constraint): `089-tool-macro` (assertion fail, not TypeError — confirms local MCP SDK is intact); `234-system-status-merge` (15 PASS locally, fails CI — confirms contamination); `028-sbv-rates` (14 PASS locally, 10 fail CI — confirms sbv mock contamination)
