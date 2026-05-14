# ARCH_REVIEW_1910 — Rubber-Stamp Review

**Sprint:** 1910-fred-ism+effr-pkg
**Cycle:** c94
**Architect:** architect-agent
**Date:** 2026-05-14
**Verdict:** APPROVED (rubber-stamp) — SD-1 resolved, path chosen, no arch brief needed

---

## SD-1 DECISION — FRED ISM Series Access

**Decision: PATH (a) — FRED REST API with free API key.**

Rationale:
- BA confirmed 25+ IDs fail on public CSV tier (`fredgraph.csv?id=`). This is expected — FRED ISM sub-component series are NOT on the free CSV tier; they require the REST API (`api.stlouisfed.org/fred/series/observations`).
- FRED REST API key is free (https://fred.stlouisfed.org/docs/api/api_key.html), no paid tier required. Maintains source_tier=1. Consistent with existing FRED infrastructure philosophy.
- Alternative source (tradingEconomics.ts) would downgrade to source_tier=2. BA BA-recommended path (a) is correct.
- Provisional series IDs `NAPMNO`, `NAPMEMP`, `NAPMPI`, `NAPMBI` are plausible but developer must confirm via FRED API at build time. If any ID is wrong, developer finds correct ID via FRED API search and documents in commit message (AC-1).

**SD-2 consequence:** `FRED_API_KEY` env var required. Infra change is minimal — one entry in Docker `.env` + `docker-compose.yml` env_file passthrough. PM must note in 1910a description. Developer adds to env config following the Bun.env pattern (`Bun.env.FRED_API_KEY`).

**Fetcher switch:** `fredIsmSubcomponents.ts` uses `api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={KEY}&file_type=json` rather than `fredgraph.csv?id=`. JSON response parsing replaces CSV parsing. Retry + error handling pattern identical to `fredEffrIorb.ts`. `INSERT OR IGNORE` idempotency unchanged.

---

## Brownfield Findings

**Zone:** `apps/mcp-server/`

**Verified paths (1910a):**
- `apps/mcp-server/src/infrastructure/fetchers/fredEffrIorb.ts` — SHIPPED 1879a. Pattern authority: `FRED_BASE_URL`, `fetchWithRetry`, `parseFredCsvAllRows`, `persistRows` — all reusable by analogy. ISM fetcher switches CSV→JSON but retry + DB pattern is identical.
- `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts` — `fetchFredEffrIorb` already wired at line 73. 1910a adds one more call after it. Pattern: `await fetchFredIsmSubcomponents(undefined, db)` with identical null-check warn.
- `apps/mcp-server/src/infrastructure/db/schema.ts` — `fred_series_daily` table confirmed shipped 1879a. `UNIQUE (series, date)` supports monthly ISM rows (`series='ISM_NEW_ORDERS'` etc.) alongside daily EFFR/IORB rows. No schema migration needed.
- `apps/mcp-server/src/interface/mcp/tools/macro/getFedLiquiditySpreadTool.ts` — registered at registry.ts:98+199. Authority pattern for `getIsmSubcomponentsTool.ts`.
- `apps/mcp-server/src/domain/services/macro/fedLiquiditySpread.ts` — authority pattern for `computeIsmRegimeSignal()` pure function.

**Verified paths (1910b):**
- `agentBootstrap.ts` array starts confirmed: `news_scout` line 30, `financial_analyst` line 46, `unified_coordinator` line 224. None contain `get_fed_liquidity_spread`. BA finding correct.
- `financial_analyst` has `get_macro_snapshot` (line 101), `get_investment_clock_phase`, `get_bond_maturity_calendar` — confirmed. `get_fed_liquidity_spread` absent.
- `unified_coordinator` has `get_macro_snapshot` (line 228), `get_bond_maturity_calendar` (line 252) — confirmed. `get_fed_liquidity_spread` absent.
- `news_scout` array (lines 30–44): no macro tools at all. `get_fed_liquidity_spread` absent.
- `get_fed_liquidity_spread` confirmed registered: `registry.ts:98` import + `registry.ts:199` array entry. Tool exists. Package reg is zero-build.

**Reuse patterns:**
- 1910a fetcher: extend `fredEffrIorb.ts` pattern — switch endpoint to REST JSON, keep retry + persistRows logic. Do NOT duplicate the retry helper; extract to shared util or inline with same signature.
- 1910a domain: `computeIsmRegimeSignal()` mirrors `computeFedLiquiditySpread()` — pure fn, zero infra imports, plain number args.
- 1910a cron: piggyback on `macroIndicatorRefreshJob` (daily 06:00 UTC). ISM data is monthly; idempotent inserts handle non-release days as no-ops. No new cron entry.
- 1910b: 3 targeted array inserts (lines 30/46/224 arrays) + 3 package docs + docs/SKILL_MANIFEST.md. Disjoint from any in-flight work — safe for single sequential developer pass.

**Design decisions:**
- SD-1 → PATH (a): FRED REST API + `FRED_API_KEY` env var.
- `fredIsmSubcomponents.ts` endpoint: `https://api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={KEY}&file_type=json`. Parse `observations[].date` + `observations[].value` (skip `"."` values per 1879 pattern).
- Storage: `fred_series_daily` series keys `'ISM_NEW_ORDERS'`, `'ISM_EMPLOYMENT'`, `'ISM_PRICES_PAID'`, `'ISM_BACKLOG'`. BA spec §2.4 confirmed — no schema change.
- `computeIsmRegimeSignal()` thresholds: EXPANDING if `new_orders > 50 && new_orders > prices_paid`; CONTRACTING if `new_orders < 50 && employment < 50`; MIXED otherwise (including any null). DDD audit T5 in test suite guards zero infra imports.

**DDD layer assignments — 1910a (all in `apps/mcp-server`):**
- Infrastructure: `fredIsmSubcomponents.ts` (NEW fetcher), `fetchers/index.ts` (+export)
- Domain: `ismRegimeSignal.ts` (NEW pure fn), `domain/services/macro/index.ts` (+export)
- Interface: `getIsmSubcomponentsTool.ts` (NEW), `tools/macro/index.ts` (+export), `tools/registry.ts` (+import+call), `agentBootstrap.ts` (+3 tool entries)
- Application: `macroIndicatorRefreshJob.ts` (+1 call)

**Risk flags:**
- R1: Developer must confirm FRED API series IDs are valid before first integration test. If any ID returns 404, find correct ID via FRED API `series/search?search_text=ISM+manufacturing` and document in commit. AC-1 gates this.
- R2: `FRED_API_KEY` must NOT be committed to source — only in `.env` (gitignored). PM description should note env-var requirement explicitly.
- R3 (low): FRED REST API rate limit is 120 requests/minute. Daily cron with 4 series = 4 requests/day. No throttle concern.
- R4 (low): FRED may lag ISM publication by 1–2 business days. Daily cron within 24h acceptable for monthly signal per BA §2.7.

**1910b auto-cure gate:**
- BA evidence table (REQ_1910.md §3.2): financial-analyst 3 consecutive cycles (2026-05-11/12/13) + unified-agent (2026-05-14) + news-scout (2026-05-13). Threshold met. 1910b ships unconditionally.

**Sequencing:** 1910b has no code dependency on 1910a. Can ship first or in parallel. PM may dispatch as two independent developer tasks.

**Scan clean:** true

---

## Authority References

- Sprint 1879 BA spec: `docs/specs/1879-effr-iorb-ba-spec.md` — FRED-fetcher pattern, `fred_series_daily` schema, retry + idempotency, cron wiring
- Sprint 1879 shipped fetcher: `apps/mcp-server/src/infrastructure/fetchers/fredEffrIorb.ts`
- Sprint 1879 shipped scheduler hook: `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts` lines 72–81

---

## Verdict

**APPROVED — rubber-stamp. No new arch brief. No block.**

SD-1 resolved: PATH (a). Developer acquires free FRED API key, adds `FRED_API_KEY` env var, implements `fredIsmSubcomponents.ts` against REST JSON endpoint. All other design decisions follow 1879 authority directly.

```
NEXT: pm | break 1910a + 1910b into atomic developer tasks
HANDOFF: docs/handoffs/REQ_1910.md + docs/handoffs/ARCH_REVIEW_1910.md
PIPELINE: continue
```
