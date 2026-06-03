# dev-mcp-server -- Notebook

## c359 · 2026-06-03T20:15Z (FU-EI-P2-COV-1 + COV-2) — COMMITTED 5c498c2e

**Task:** FU-EI-P2-COV-1 + FU-EI-P2-COV-2 — env-check test coverage gaps (test-only, no runtime change, no ops rebuild needed).

**COV-1 (runEnvCheck 0% → covered):** 5 tests: R1 no-op when vars present, R2 warn called on missing (honest-green pin: inverted condition → 0 calls → assertion fails), R3 message includes var name, R4 no-throw on missing token (degraded-mode early-return path), R5 meta.missingVars array complete.

**COV-2 (APP_ENV=testing untested → covered):** 4 tests: T1 isProductionEnv("testing")→false (pins DEV_ENV_VALUES.has("testing")), T2 testing+prodDB→error, T3 testing+devDB→null, T4 currentDataEnv returns "testing".

**envCheck.ts coverage:** funcs 88.89%→100%, lines 66.67%→83.56%. Remaining uncovered: lines 174/176-186 (fetch try/catch inside token+workId guard — live network, not testable without real creds, correctly guarded by R4).

**Gate results:** 11 new tests pass / 0 fail; 48 total across 3 env-check files; tsc EXIT 0. test-only commit, no ops rebuild needed.

---

## c358 · 2026-06-03T19:30Z (VPT-1) — COMMITTED d67448ad

**Task:** VPT-1 — Add GET /api/vps-proxy-health HTTP endpoint so /dashboard/vps renders UP/STALE/DOWN truthfully.

**Root cause (operator-confirmed):** /dashboard/vps checked api-gateway microservice /health/{news,stock} (NOT deployed). Real VPS health lives in vpsPushLogStore.getVpsProxyHealth() (MCP tool plane). Dashboard cannot call MCP tools — needs HTTP endpoint.

**Changes:**
1. `apps/mcp-server/src/interface/mcp/routes/vpsProxyHealthHandler.ts` (NEW) — handler calling getVpsProxyHealth() directly; computeStale() mirrors EXPECTED_INTERVALS from vpsProxyTools.ts; coerces SQLite SUM null→0 for errors_24h.
2. `apps/mcp-server/src/interface/mcp/server.ts` — import + route `GET /api/vps-proxy-health` registered before FE-REROUTE block.
3. `apps/mcp-server/src/__tests__/VPT-1-vps-proxy-health-endpoint.test.ts` (NEW) — 7 tests: shape, fresh/stale/error/recent_pushes/fetchedAt/25h-stale.

**Key fix:** `new Date(lastPushAt + "Z")` → `new Date(lastPushAt)` — ISO timestamps already end with Z; appending a second Z gives NaN.

**Gate results:** tsc clean, tools=158 (unchanged), sched=70 (unchanged), 7 new pass / 0 fail. Pre-existing suite failures all pre-date this task.

**Ops required:** rebuild mcp-server container to go live.

---

## c357 · 2026-06-03T17:13Z (FU-DE-321-VAY-GUARD) — COMMITTED bc1d7e55

**Task:** FU-DE-321-VAY-GUARD — Add /vay/i label guard to VAS code 321 primary in aggregateScalars.

**Root cause:** Code 321 period-flips: FPT 2025Q4 code 321 = "Dự phòng phải trả ngắn hạn" (1,014 tỷ, NOT vay); code 319 = "Vay và nợ thuê tài chính ngắn hạn" (19,169 tỷ, correct). Aggregator wrote 1,014 instead of 19,169. Report_id=e71f845d.

**Changes (bctcScalarAggregator.ts only):**
1. All three code-321 lookups (general/balance_sheet/broad) now pass `/vay/i` labelHint (strict). Non-vay 321 → null → 319-vay fallback fires.
2. Symmetric `/vay/i` guard on all three code-339 long_term_debt lookups.
3. JSDoc updated (VAS-CODE-TABLE, ScalarAggregate field comments).

**Tests (FU-DE-321-vay-guard.test.ts):** 8 tests: DV-VAY-1 (period-flip FPT-2025Q4 pattern RED→GREEN), DV-VAY-2..3 (321-vay stays, 321-non-vay+no-319=null), DV-VAY-4..5 (339 symmetry), DV-VAY-6..8 (regression FIX-DE-1 FPT/VNM/bank). All 8 pass. FIX-DE-1+FU-6+FU-6d+BEQ-3 regression: 31/31. tsc clean.

**IS-NOT-live yet:** ops must rebuild + run `backfill_bctc_scalars(force_reflow, report_id=e71f845d)` to flow fix into FPT 2025Q4.

---

## Working Memory

### Baselines (c352)
- tool=158, sched=70 | ops_rebuild_required: true (LF-OVERLAY live routes need image rebuild)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
