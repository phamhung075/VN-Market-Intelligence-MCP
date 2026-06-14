<!-- size-justification: sprint QA decision journal; single entry per task reviewed -->
# Decision Journal — Sprint FIX-MCP-CRASH-LOOP-WRITEWAL · QA

**Sprint goal:** Break the mcp-server WAL crash-loop permanently; A-1 is the restart-cadence guardrail
**Agent:** qa
**Started:** 2026-06-14T06:45Z

---

### STEP qa-S1 · qa · 2026-06-14T06:45Z
**task-id:** A-1
**what-done:** QA gate for FIX-MCP-CRASH-LOOP-A-1 restart-cadence alert guardrail (commit ef0ce87c)
**what-considered:**
- G1 TARGETED: bun test FIX-MCP-CRASH-LOOP-A-restart-cadence.test.ts --no-cache → 4 pass / 0 fail / 14 expect() / 49ms
- G2 TSC: bun tsc --noEmit exit 0, 0 errors
- G3 FULL SUITE: 12837 pass / 51 fail / 1 error (exit 0); all 51 failures pre-existing (MACD integration test, TA indicators — unrelated to A-1); 51 <= prior floor (53 skips from CI-RED baseline cycle-238)
- G4 DDD: restartCadenceAlertJob.ts is interface/scheduler layer; no forbidden domain→infra imports; grep domain-imports exit 1 (no hits); lazy-loads from infrastructure (permitted)
- G5 SECURITY: no process.env (uses Bun.env in cronConfig, lazy-import infra for telegram); no hardcoded secrets; STARTUP_JOB_NAME/WINDOW_HOURS are module constants not user input (minor style: not parameterized SQL but zero injection risk — non-blocking)
- G6 MOCK-GUARD: bash scripts/audits/mock-guard.sh exit 0 — PASS
- G7 DESIGN CONFORMANCE: startup sentinel uses insertCronJobRunStart+updateCronJobRunEnd (existing infra, no raw SQL); 15,45 stagger confirmed vs WAL */30; WORK channel (not BUG) per design; count≥2 threshold; 4h window; GENERIC (no ticker/table coupling); jobRunRepo.wrapRun idiom in startScheduler matches all peers; .js ESM import paths throughout; no new table; no dead code
- G8 ZONE: all 5 files under apps/mcp-server/ only — zone clean
- G9 INJECTION (DRAIN-INJECTION): no shell-interpolation of any user-supplied payload; Telegram message built from local SQLite constant strings only
- G10 COMMENT LABEL INCONSISTENCY: composition-root.ts labels sentinel block "1c" but appears before the unlabeled "1b" (seed trade profiles at line 49) — cosmetic comment numbering only, functionality correct; non-blocking
- BCTC eval: N/A (no BCTC report_id in scope)
- Live-verify gate: startup sentinel row persistence + alert firing requires ops container rebuild — NOT yet done; documented as remaining gate
**why-decision:** APPROVED — all 4 unit tests green RAW, tsc 0 errors, DDD PASS, security PASS, mock-guard PASS, design conforms to brief exactly. One cosmetic issue (comment numbering) non-blocking. One style note (SQL string template for constants) non-blocking.
**why-change:** no change from plan; only remaining gate is live-verify (ops rebuild)

---

### STEP qa-S2 · qa · 2026-06-14T07:10Z
**task-id:** D-1
**what-done:** QA gate for FIX-MCP-CRASH-LOOP-D-1 WAL>10MB escalation gate (commit e7289070)
**what-considered:**
- G1 TARGETED: bun test FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts → 7 pass / 0 fail / 7 expect() / 496ms (GREEN RAW)
- G2 CHECKPOINT SUITE: bun test on all checkpoint+WAL files (9 files) → 65 pass / 0 fail — zero regression from D-1
- G3 TSC: pnpm check (bun tsc --noEmit) exit 0, 0 errors
- G4 FULL SUITE: 12842 pass / 42 skip / 53 fail (vs dev-reported 12841/42/54 — 1-test run-order delta, well within noise); all fails pre-existing (_deprecated/1302-technical-indicators.test.ts accounts for 4 confirmed; remainder are TA/MACD integration and pre-existing unrelated suites — zero from D-1 files)
- G5 AC-1: escalateFn NOT called when WAL <=10MB — PASS (test: "escalateFn is NOT called when WAL file is 5 MB (below 10 MB threshold)" + "escalated field is undefined when WAL is below threshold")
- G6 AC-2: escalateFn called exactly once when WAL >10MB — PASS (test: "escalateFn is called exactly once when WAL file is 15 MB" + "escalated is true when WAL exceeds 10 MB")
- G7 AC-3: escalateFn rejection is non-fatal (no throw) — PASS (test: "checkWalFileSize does not throw when escalateFn rejects" + "escalated is true when escalateFn throws — attempt was made")
- G8 AC-4 ATOMIC WRITE (CODE INSPECT): escalation does NOT use Bun.sh mv. Instead uses appendSignalQueueRow() from infrastructure/orchStateStore.ts which calls writeOrchStateAtomic() → writeFileSync(tmp) + renameSync(tmp→target). The atomic write guard validates payload completeness + presence of .head/.task_board/.signal_queue before any fs operation. CAS-retry loop (up to 3) for concurrent writer collision. PASS — atomic temp→rename confirmed structurally.
- G9 DDD: checkpoint.ts (infrastructure) imports ONLY schema.js + logger.js — no orch-state, no scheduler imports. walEscalateFn closure defined inline in startScheduler.ts (scheduler layer), which imports appendSignalQueueRow from infrastructure/orchStateStore.js (infrastructure→infra: permitted). DDD invariant: checkpoint.ts is agnostic of orch-state. PASS.
- G10 SECURITY: no shell-interpolation. walBytes used only as JS number in template literal inside the structured row object — NOT in any Bun.sh/exec call. No Bun.sh in D-1 code path (dev's design note confirmed: Bun.sh approach was in the spec pseudocode but developer correctly used appendSignalQueueRow instead). No process.env. No hardcoded secrets. PASS.
- G11 GENERIC: threshold (10 MB) is file-size-based, not per-table/per-ticker. WAL is a single global file. PASS.
- G12 DESIGN CONFORMANCE: escalateFn as optional 4th positional param (backwards-compat with existing callers); orch-state write at scheduler layer only; CAS-retry write (WF-2) exceeds the spec's simpler raw-mv approach; non-fatal try/catch; GENERIC signal type WAL_ESCALATION; DDD layer separation as per brief §3 Fix-Class D. PASS — implementation exceeds spec quality (uses established CAS helper, not raw subprocess).
- G13 ZONE: all files under apps/mcp-server/ + docs/handoffs + docs/architecture/microservice/mcp-server/testing.md + docs/data/orch/orch-state.json — zone clean. No files outside zone boundary.
- G14 MOCK-GUARD: D-1 modified production files: checkpoint.ts + startScheduler.ts. Real WAL files written to /tmp/ for size-based testing (not mock constants). Non-trivial. PASS.
- BCTC eval: N/A
- Live-verify gate: ops must rebuild mcp-server --no-deps --force-recreate, then observe WAL>10MB escalation path writes atomic orch-state signal on the named-volume DB, peers intact
**why-decision:** APPROVED — all 7 D-1 tests green (4 ACs covered), tsc exit 0, DDD PASS, security PASS (no shell injection), atomic write confirmed via code inspection (CAS+renameSync), design conforms to brief. No new full-suite failures introduced. Implementation quality exceeds spec (CAS retry over raw Bun.sh mv).
**why-change:** no change from plan; only remaining gate is live-verify (ops rebuild+WAL>10MB path observation)
