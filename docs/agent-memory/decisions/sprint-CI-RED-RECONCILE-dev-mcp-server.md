# Decision Journal — Sprint CI-RED-RECONCILE · dev-mcp-server

**Sprint goal:** Unblock CI red state on main — two targeted test fixes in apps/mcp-server/
**Agent:** dev-mcp-server
**Started:** 2026-06-08T17:30:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-08T17:35:00Z
**task-id:** FIX-MCP-TOOL-COUNT-DRIFT
**what-done:** Diagnosed count drift as case (b) — intentional deregistration of `read_bctc_pdf` in TSU-DEV-U3; assertion floor 16→15
**what-considered:**
- (a) restore read_bctc_pdf registration — rejected: TSU-DEV-U3 explicitly deregistered it (superseded by OCR/PEK pipeline); restoring = reverting intentional design
- (b) lower assertion floor from 16 to 15 and update comment — chosen: correct since deregistration was intentional and named in commit message
**why-decision:** git show 50772c2a confirms read_bctc_pdf deregistered with documented rationale; floor 16 is stale by exactly 1
**why-change:** no change from plan

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-08T17:50:00Z
**task-id:** FIX-MCP-CI-NETWORK-GUARD
**what-done:** Diagnosed 1146 as date-stale tests (2026-03-* outside 90-day window); 1335 as rag_analyses schema mismatch (data_env column absent from test fixture)
**what-considered:**
- For 1146: change hardcoded dates to relative computed dates — chosen; future-proof, no manual drift
- For 1335: add data_env + body_text columns to setupTestDb() fixture — chosen; minimal delta, matches schema-news.ts migration
- CI network guard (skip-in-CI) for 025/028/1487 — not needed; these pass locally with mocks and failure pattern is different from what PO diagnosed
**why-decision:** Root-cause analysis shows 1146 is time-drift not network; 1335 is fixture/schema mismatch not network; both fail identically in CI and locally confirming non-network root cause
**why-change:** scope narrowed from network-guard to test-fixture/date fixes; result is same (CI green)

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-08T18:00:00Z
**task-id:** FIX-MCP-CI-NETWORK-GUARD
**what-done:** 1335 followup — discovered pollNews ragInsert HTTP + dynamic imports take 2-5s; Bun 5s default not overridden by bunfig.toml timeout=30000 in Bun 1.3.13
**what-considered:**
- Fix bunfig.toml — rejected: timeout=30000 NOT applied by Bun 1.3.13 (5000ms default persists)
- Add it(..., 15_000) explicit timeout + inject ragInsert/teChromiumNews/newsapi mocks — chosen
**why-decision:** Pattern from 137-fix-alert-pipeline.test.ts (CYCLE_TIMEOUT=30_000); consistent with existing codebase; root cause = ragIndex HTTP (no rag-service in CI) + module loading overhead
**why-change:** initial fix insufficient; timeout root cause discovered through runtime tracing

---

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-06-08T10:00:00Z (DJ-GATE-1)
**task-id:** B1-MOCK-MODULE-EXPERIMENT
**sprint:** CI-RED-RECONCILE
**epic:** CI-BUN-TEST-MULTI-CLASS-FIX

**experiment-design:** Falsifiable test of brief #2 (cascade hypothesis) vs brief #1 (no-cascade, 3-class hypothesis).
- Change: Added `afterAll(() => { mock.restore(); })` to `1862c-transport-session-eviction.test.ts`. Both `mock.module()` calls retained at module scope (required: transport.js top-level await import runs before beforeAll; moving mocks inside beforeAll would break the SUT import). `afterAll` tears down the mocked mcp.js from the process module cache after 1862c's tests complete.
- Change ONLY: single `afterAll` hook in the one file. No other files touched.

**baseline-measurement:**
- Command: `cd apps/mcp-server && bun test 2>&1 | tail -40`
- Raw output: `11091 pass / 35 skip / 443 fail / 12 errors / 33998 expect() calls / Ran 11569 tests across 1039 files. [328.91s]`
- **BASELINE FAIL COUNT: 443** (note: brief #2 assumed 639; local baseline differs from CI baseline — Bun OOM crash in 2 of 3 baseline attempts prevented summary printing; this baseline was from the run that completed successfully)

**post-fix-measurement:**
- Command: `cd apps/mcp-server && bun test 2>&1 | tail -30` (coverage=false in bunfig to avoid OOM crash masking summary)
- Raw output: `11091 pass / 35 skip / 443 fail / 12 errors / 34000 expect() calls / Ran 11569 tests across 1039 files. [282.38s]`
- **POST-FIX FAIL COUNT: 443**

**delta:** 443 - 443 = **0** (null result)

**verdict:** NULL — brief #1 no-cascade framing HOLDS locally.
- The `mock.module("mcp.js", ...)` process-level contamination did NOT produce a measurable cascade on macOS Bun v1.3.13. Local file execution order and/or module cache behavior differs from brief #2's assumption.
- Two alternative explanations for delta=0:
  1. Bun macOS v1.3.13 isolates module cache differently than the Linux/CI build where brief #2's evidence was produced
  2. The ~269 cascade failures ARE present in baseline 443, but after fix those same tests fail for B2 (stale rag_analyses DDL) instead — net count unchanged
- The `afterAll(mock.restore())` change is correct hygiene regardless: it documents intent, prevents CI regressions if Bun behavior changes, and matches the pattern in 1303h-extractor-guards.test.ts.
- The DWF-is-trading-day.test.ts canary was verified: still RED (unchanged), as required.

**what-considered:**
- Moving mock.module() into beforeAll — rejected: transport.js top-level await import runs at module evaluation time before beforeAll; mocking sse.js after import = real SSEServerTransport loaded, breaking SUT
- Adding only afterAll(mock.restore()) — chosen: minimal change, correct semantics
- Touching any other test file — rejected per task spec
- Editing bunfig.toml for measurement only — done (coverage=false during measurement, restored after)

**why-change:** none from plan (applied correct fix as specified)

---

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-06-08T00:00:00Z (DJ-GATE-1)
**task-id:** FIX-CI-COVERAGE-OOM-CRASH
**what-done:** Added `--coverage=false` to `bun test` invocation in `.github/workflows/ci.yml` Run-tests step (line 45); added inline comment documenting rationale.
**what-considered:**
- Remove `coverage = true` from `apps/mcp-server/bunfig.toml` — rejected: destroys local-dev coverage workflow; the flag was added for a reason and local runs don't OOM
- Run `bun test --coverage` in a separate non-gating step — rejected: over-engineering; OOM only reliably repro on CI runner; separate step still risks crashing the job
- Add `--coverage=false` to the gating `bun test` only — chosen: one-character override at CI invocation point; local bunfig.toml unchanged; surgical minimal change
**why-decision:** Coverage-table generation consumes unbounded memory at summary-print time; CI runner OOMs AFTER all tests complete, so the crash is a post-run artifact, not a test failure. Suppressing it at CI invocation preserves the test result signal while eliminating the OOM crash that has silenced CI failure counts for 200 runs.
**why-change:** no change from PO-authored spec; change is exactly as specified

---

### STEP dev-mcp-server-S6 · dev-mcp-server · 2026-06-09T00:00:00Z (DJ-GATE-1)
**task-id:** FIX-SCHEMA-DRIFT-P1
**what-done:** Added `data_env TEXT` to 63 inline rag_analyses DDLs in test files; added try/catch fallback guard in pollNews.ts::tryInsertEntry for data_env absence (fredApi.ts pattern).
**what-considered:**
- Inject `initNewsTables(db)` into each test setup — rejected: brief §0 / §2b explicitly forbid; causes E1/E3 collisions in Contract B files; exact mechanism of the reverted 9454baad batch
- Add data_env column to each inline DDL (Contract B cure) + production fallback guard — chosen: brief §3 Phase 1 spec; additive-only, no collision risk
**why-decision:** Two-fixture contract: Contract B tests own their inline DDL; adding one missing column is correct per §2a. Fallback guard in pollNews.ts decouples production INSERT from test DDL exhaustively (fredApi.ts precedent already in codebase).
**why-change:** 63 files modified (brief estimates 64; FIX-1282-1285-schema-migrations.test.ts excluded — uses initDatabase(), no inline DDL despite filename match). No Phase 2/3 work performed.
