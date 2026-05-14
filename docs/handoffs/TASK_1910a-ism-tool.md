---
sprint: 1910
branch: task/1910a-ism-subcomponents
size: M
zone: apps/mcp-server/src/infrastructure/fetchers/ + apps/mcp-server/src/domain/services/macro/ + apps/mcp-server/src/interface/mcp/tools/macro/
depends_on: []
blocks: [1910b-effr-package-reg]
---

## TLDR

Extend FRED ISM Manufacturing PMI sub-component fetching via REST API (architect SD-1 PATH-a decision). New fetcher + domain regime-signal function + MCP tool returning (new_orders, employment, prices_paid, backlog, regime_signal, source_tier=1). Wire into existing `macroIndicatorRefreshJob` daily cron. **User-action blocker: FRED_API_KEY env var required.**

---

## [PM] Planning Context

**Zone:** `apps/mcp-server/src/{infrastructure/fetchers/, domain/services/macro/, interface/mcp/tools/macro/}`

**Acceptance Criteria:**
- [ ] `FRED_API_KEY` env var added to Docker `.env` + `docker-compose.yml` passthrough (user-action: FRED registration required at https://fred.stlouisfed.org/docs/api/api_key.html)
- [ ] New fetcher `fredIsmSubcomponents.ts`: REST API endpoint `api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={KEY}&file_type=json` with 4 series (NAPMNO/NAPMEMP/NAPMPI/NAPMBI)
- [ ] Fetcher uses retry + idempotent `INSERT OR IGNORE` pattern (reuse 1879 authority logic, NOT copy-paste)
- [ ] `computeIsmRegimeSignal()` pure domain function: threshold logic (EXPANDING if new_orders > 50 && new_orders > prices_paid; CONTRACTING if new_orders < 50 && employment < 50; MIXED otherwise)
- [ ] Domain function test coverage: ≥4 fixture cases (EXPANDING / CONTRACTING / MIXED / null-input); zero infra imports (DDD audit required)
- [ ] `getIsmSubcomponentsTool.ts` MCP handler: signature `get_ism_subcomponents()` → JSON envelope with source_tier=1, all 4 sub-indices + regime_signal + fetchedAt + asOf
- [ ] Tool registered in `tool-registry.json` (pointer convention, no hardcoded toolCount)
- [ ] Cron wired into existing `macroIndicatorRefreshJob` (no new cron entry; ISM is monthly but fetches daily idempotently)
- [ ] Added to SKILL_MANIFEST (news_scout, financial_analyst, unified_coordinator) + 3 package docs (news-scout.md / financial-analyst.md / unified-agent.md)
- [ ] Test suite: `1910a-ism-regime-signal.test.ts` (pure domain, 4+ fixtures) + `1910a-ism-subcomponents-fetcher.test.ts` (integration, idempotency check) + `1910a-ism-tool-contract.test.ts` (source_tier invariant)
- [ ] `tsc 0` errors; full test suite green

**Files to read first:**
- `docs/handoffs/REQ_1910.md` § 2.1-2.10 (SD-1 resolved, series IDs, DDD mapping, cron wiring)
- `docs/handoffs/ARCH_REVIEW_1910.md` § SD-1 decision: PATH (a) FRED REST API + free key
- `apps/mcp-server/src/infrastructure/fetchers/fredEffrIorb.ts` (authority pattern: retry, CSV→JSON, persistRows, INSERT OR IGNORE)
- `apps/mcp-server/src/domain/services/macro/fedLiquiditySpread.ts` (authority pattern: pure domain regime signal)
- `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts` lines 72-81 (cron wiring point)

**Files to create:**
- `apps/mcp-server/src/infrastructure/fetchers/fredIsmSubcomponents.ts` (NEW fetcher, JSON REST endpoint)
- `apps/mcp-server/src/domain/services/macro/ismRegimeSignal.ts` (NEW pure domain function)
- `apps/mcp-server/src/interface/mcp/tools/macro/getIsmSubcomponentsTool.ts` (NEW MCP handler)
- `apps/mcp-server/src/__tests__/1910a-ism-regime-signal.test.ts` (pure domain tests)
- `apps/mcp-server/src/__tests__/1910a-ism-subcomponents-fetcher.test.ts` (integration tests)
- `apps/mcp-server/src/__tests__/1910a-ism-tool-contract.test.ts` (interface/contract tests)

**Files to modify:**
- `apps/mcp-server/src/infrastructure/fetchers/index.ts` — +1 export (fredIsmSubcomponents)
- `apps/mcp-server/src/domain/services/macro/index.ts` — +1 export (computeIsmRegimeSignal)
- `apps/mcp-server/src/interface/mcp/tools/macro/index.ts` — +1 export (getIsmSubcomponentsTool)
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — +1 import + +1 registration call
- `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts` line 73 — add `await fetchFredIsmSubcomponents(undefined, db)` after fredEffrIorb call
- `apps/mcp-server/src/interface/mcp/bootstrap/agentBootstrap.ts` lines 30/46/224 — add `"get_ism_subcomponents"` to news_scout + financial_analyst + unified_coordinator arrays
- `docs/SKILL_MANIFEST.md` — +1 row for `get_ism_subcomponents` (3 agents)
- `.claude/tools/package/news-scout.md` — +1 row (US monetary chain section)
- `.claude/tools/package/financial-analyst.md` — +1 row (Macro Intelligence section)
- `.claude/tools/package/unified-agent.md` — +1 row (Pillar 2 COC section)

**Dependencies:**
- Sprint 1879 (SHIPPED): `fred_series_daily` table + `fredEffrIorb.ts` pattern authority
- `macroIndicatorRefreshJob` cron (operational)
- `FRED_API_KEY` env var (user-action, must be configured before deploy)

**Knowledge needed:**
- `docs/policies/dev-standards.md` § DDD: domain layer zero infra imports
- Architect brief `ARCH_REVIEW_1910.md` § design decisions (REST JSON endpoint, series keys, threshold logic, source_tier=1)
- Scheduler pattern from 1879a delivery (cron wiring, `fetchWithRetry`, idempotent insert)

---

## Critical user-action blocker: FRED API key

**Architect decision (SD-1): PATH (a) — FRED REST API with free API key.**

Developer must:
1. Register free FRED API key at https://fred.stlouisfed.org/docs/api/api_key.html (no cost, takes ~2 min)
2. Add `FRED_API_KEY=<key>` to `.env` file (gitignored, NOT committed)
3. Update Docker `docker-compose.yml` to pass `FRED_API_KEY` via env_file or direct env_vars
4. Confirm series IDs at build time via FRED API `/series/search?search_text=ISM+manufacturing` if any ID returns 404
5. Document final series IDs + endpoint in commit message (AC-1)

**Series IDs (provisional, subject to developer API confirmation):**
- `NAPMNO` (new orders)
- `NAPMEMP` (employment)
- `NAPMPI` (prices paid)
- `NAPMBI` (backlog inventory)

---

## Implementation pattern (1879 analogy)

**Fetcher structure:**
```typescript
export async function fetchFredIsmSubcomponents(
  _db: Database | undefined,
  db?: Database
): Promise<void> {
  const database = db || getDb();
  const FRED_API_KEY = Bun.env.FRED_API_KEY;
  if (!FRED_API_KEY) { warn('...'); return; }
  
  for (const seriesId of ['NAPMNO', 'NAPMEMP', 'NAPMPI', 'NAPMBI']) {
    // fetchWithRetry against api.stlouisfed.org endpoint
    // Parse JSON observations[].date + observations[].value
    // Skip "." values (FRED convention for missing data)
    // persistRows(...) with INSERT OR IGNORE idempotency
  }
}
```

**Domain regime signal thresholds:**
- EXPANDING: `new_orders > 50 && new_orders > prices_paid`
- CONTRACTING: `new_orders < 50 && employment < 50`
- MIXED: all other cases + any null data

**Tool output (source_tier=1 invariant):**
```typescript
{
  source_tier: 1,
  new_orders: number | null,
  employment: number | null,
  prices_paid: number | null,
  backlog: number | null,
  fetchedAt: string,  // ISO-8601 of last fetch
  asOf: string,       // YYYY-MM-DD of latest month
  regime_signal: "EXPANDING" | "CONTRACTING" | "MIXED"
}
```

---

## Risk flags (from architect review)

- **R1 (medium):** Confirm FRED API series IDs are valid at build time (AC-1 gates this). If any ID returns 404, use FRED API `/series/search` to find correct ID + document in commit.
- **R2 (medium):** `FRED_API_KEY` must NOT be hardcoded or committed — only in `.env` (gitignored). PM description flags env-var requirement explicitly.
- **R3 (low):** FRED rate limit = 120 req/min. Daily cron with 4 series = 4 req/day. No throttle concern.
- **R4 (low):** FRED may lag ISM publication by 1–2 business days. Daily cron within 24h acceptable for monthly signal (per BA spec).

---

## Sequencing note

1910a is independent codebase (no dependency on 1909). However, shares agentBootstrap.ts + SKILL_MANIFEST.md + package docs with 1910b. PM sequenced 1910a BEFORE 1910b to avoid merge conflicts.
