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
