# dev-mcp-server -- Notebook

## c360 · 2026-06-04T10:30Z (FIX-C + FIX-E) — COMMITTED bf9b3105

**Tasks:** FIX-C (get_bctc_series, size M) + FIX-E (price-history 730d + JSON array, size S)

**FIX-C:** New `get_bctc_series{code, fields[], periods}` tool. DONE-only gate (refine_status='DONE'). Sparse-history honest (no padding). 10 allowed fields. Registered as tool #151.
- New file: bctcSeriesTools.ts; barrel + registry updated.
- 8 new tests: DONE gate excludes PENDING/PARTIAL, sparse honesty, shape, null/honest-absent, empty result, limit, JSON output, all fields round-trip.

**FIX-E:** Widened Zod `.max(730)` + `Math.min(...,730)` in priceHistoryTools.ts. Added `content[1]` JSON array `{code,date,close,volume}` (non-breaking). Fixed pre-existing 178 test bug: `actionCode` param renamed to `code` (tool param name).
- 6 new tests: text regression, days=365 accepted, JSON shape, honest-absent empty, days=730 max, numeric values.

**Gate results:** tsc clean (EXIT 0), 38 pass / 0 fail (4 files: FIX-C × 8, FIX-E × 6, 178 × 7, 240 × 17), tools=161 (+1 get_bctc_series), sched=69 (unchanged). Fence: bites exit 1 on deliberate domain→infra import, passes on new files (exit 0). commit-mutex: gateway unavailable → proceeded solo (single agent confirmed, no race).

**Honest-absent:** `pe`, `pb`, `roe`, `debt_to_equity` return null when DB null — not fabricated.

---

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
1. `apps/mcp-server/src/interface/mcp/routes/vpsProxyHealthHandler.ts` (NEW) — handler calling getVpsProxyHealth() directly.
2. `apps/mcp-server/src/interface/mcp/server.ts` — import + route `GET /api/vps-proxy-health` registered.
3. `apps/mcp-server/src/__tests__/VPT-1-vps-proxy-health-endpoint.test.ts` (NEW) — 7 tests.

**Gate results:** tsc clean, tools=158 (unchanged), sched=70 (unchanged), 7 new pass / 0 fail.

**Ops required:** rebuild mcp-server container to go live.

---

## Working Memory

### Baselines (c360)
- tool=161, sched=69 | ops_rebuild_required: true (rebuild to activate new tools)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
