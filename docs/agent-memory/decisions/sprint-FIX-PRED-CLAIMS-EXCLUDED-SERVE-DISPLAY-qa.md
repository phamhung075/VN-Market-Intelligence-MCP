---
sprint: FIX-PRED-CLAIMS-EXCLUDED
task-id: FIX-PRED-CLAIMS-EXCLUDED-SERVE-DISPLAY
agent: qa
date: 2026-06-21
---

# Decision Journal — FIX-PRED-CLAIMS-EXCLUDED-SERVE-DISPLAY QA Review

## Entry 1 — Verdict: APPROVED-CODE-LEVEL

**what-considered:**

Backend (apps/mcp-server):
- tsc --noEmit: EXIT 0. No TypeScript errors.
- Per-file isolation (4 files): FIX-PRED-CLAIMS-EXCLUDED-SERVE-DISPLAY.test.ts 20/0 (59 expect); TASK17-PRED+1123-prediction-claim-store+PRED-RESOLVER-GAP-FIX 68/0 (200 expect). All green.
- Full CI suite: 13363 pass / 53 skip / 64 fail. 64 failures are ALL pre-existing disjoint: last-touch commits for all failing test files (102, 083, 1302, 1345a, 1783, 1146, 1518, 1858c, 1892a, 1875c, 1269, 1270, 235, 251, 125, 1193, VPS-proxy, classifyDeviation) confirmed to predate a41e09a9 via `git log --oneline a41e09a9 | grep <hash>`. Zero overlap with changed files (predictionClaimsHandler.ts, predictionClaimStore.ts, FIX-PRED-CLAIMS-EXCLUDED-SERVE-DISPLAY.test.ts). Note: 64 vs prior cycle-310 baseline of 53 — difference attributable to network-timeout flakiness (30 of 64 are 5000ms timeout class). Non-timeout non-prediction fails (VPS/logVpsPush/1875c/1892a/classifyDeviation/1269/1270/1783) are also confirmed pre-existing via last-touch check.
- DDD PASS: interface/predictionClaimsHandler.ts imports only infrastructure/db/predictionClaimStore (interface→infra is PERMITTED direction). predictionClaimStore.ts imports only bun:sqlite type. Zero domain→infrastructure violations.
- Security PASS: no process.env in production files; no hardcoded secrets; all SQL parameterized (? bound params: `WHERE is_excluded = 1`, `AND (is_excluded IS NULL OR is_excluded = 0)`).
- mock-guard: EXIT 0. No fabricated data patterns.
- Logic verification: mapOutcome(is_excluded=1) → "excluded" (line 158, PRECEDES null check at line 159). computeCalibration correctly routes is_excluded===1 to excluded bucket before null check (lines 213-216). getAllClaimsForTracker pending branch: `AND (is_excluded IS NULL OR is_excluded = 0)` (confirmed lines 383-385). Excluded branch: `WHERE is_excluded = 1` (confirmed lines 396-402).
- Tests genuine: all use real in-memory SQLite via initDatabase()/getDb() from schema.js (production DDL path). seedExcludedClaim seeds via insertPredictionClaim+excludeClaim real store functions. No stubs.

Frontend (apps/frontend):
- tsc --noEmit: EXIT 0.
- Per-file test: task17-prediction-claims-loader.test.ts 67/0 green (11 new tests in suites 14b+14c).
- Full vitest suite: 2 fail / 1706 pass. 2 failures are QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx (last touch d7167c0a, confirmed predates baff449a via ancestry-path check). Zero overlap with dashboard.prediction-claims.tsx.
- outcomeLabel("excluded") === "Loại trừ" — confirmed in code (line 301) and test (suite 14b).
- outcomeColorClass("excluded").badge contains "zinc", NOT "slate" (zinc != slate confirmed).
- "Loại trừ" filter tab exists (line 453 in OutcomeFilter filters array).
- calibration.excluded parsed with backward-compat default 0 (lines 141-145 in parsePredictionClaimsDto).

CONTRACT INTEGRATION: ALIGNED.
- Backend ClaimOutcome = "correct"|"wrong"|"pending"|"excluded" (handler.ts:91).
- Frontend PredictionOutcome = "correct"|"wrong"|"pending"|"excluded" (tsx:53).
- Backend CalibrationSummary.excluded: number (handler.ts:119).
- Frontend PredictionCalibration.excluded: number (tsx:62).
- EMPTY_CALIBRATION.excluded = 0 (tsx:116) covers backward-compat when older backend omits the field.

**why-change:** All checks green at code level. Contract perfectly aligned. Tests genuine.

**verdict:** APPROVED-CODE-LEVEL

**deferred-live-gate:** GET /api/prediction-claims after ops rebuilds both mcp-server+frontend containers → ids 1,8,9 outcome "excluded" in JSON + calibration.pending=0 + calibration.excluded=3 + dashboard renders "Loại trừ" not "Đang chờ". REBUILD_REQUIRED: YES (handler+store baked into mcp-server image; frontend Remix build).

**board-action:** NOT moved (router finalizes). Review Record appended to orch-state task row only.
