# Handoff: FIX-A — get_company_profile MCP tool

**Task ID:** FIX-A  
**Sprint:** RAPID-DATA-LAYER  
**Priority:** P1 (unblocks SKILL-4 ownership + SKILL-5 CEO name)  
**Zone:** dev-mcp-server  
**Owner:** dev-mcp-server  
**Depends:** None  
**WIP Count:** 1 of 2 (parallel with FIX-D, FIX-H)  
**Estimated Duration:** 2–2.5h  
**Acceptance Criteria:**
1. New MCP tool `get_company_profile` callable via gateway
2. Returns structured JSON (not text) with fields:
   - `code` (ticker)
   - `top_shareholders` (array, sorted by own_percent DESC, limit 10):
     - `name`
     - `quantity`
     - `own_percent`
   - `officers` (array, currently available fields):
     - `name`
     - `position`
     - `own_percent`
     - `quantity`
   - `foreign_holding_ratio_aggregate` (from vnstock_trading_stats.current_holding_ratio)
   - `fetched_at` (timestamp)
3. Handles missing data gracefully (null arrays if table empty, not error)
4. Unit tests cover: (a) happy path (FPT 10 shareholders + officers), (b) missing shareholders, (c) missing officers, (d) null foreign ratio
5. Live-verified: `get_company_profile(code=FPT)` returns structured JSON with ≥5 shareholders

---

## Implementation Notes

**Source Tables:**
- `vnstock_shareholders`: columns `code, name, quantity, own_percent` (from syncVnstockData)
- `vnstock_officers`: columns `code, name, position, own_percent, quantity` (from syncVnstockData)
- `vnstock_trading_stats`: column `current_holding_ratio` (aggregate foreign %)
- All three already populated; zero schema changes needed

**Tool File Location:**
- Pattern: `apps/mcp-server/src/interface/mcp/tools/market-data/<tool>.ts`
- New tool: `apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts` (~120L)

**Steps:**
1. Create `companyProfileTools.ts`:
   - Import Db, logger, z (schema)
   - Define schema: `companyProfileInput` = { code: string }
   - Define output interface with fields above
   - Implement `getCompanyProfile()`:
     - Query vnstock_shareholders: `SELECT name, quantity, own_percent FROM vnstock_shareholders WHERE code=? ORDER BY own_percent DESC LIMIT 10`
     - Query vnstock_officers: same structure
     - Query vnstock_trading_stats: `SELECT current_holding_ratio FROM vnstock_trading_stats WHERE code=?`
     - Return structured object (null arrays if empty, no error)
   - Export tool definition

2. Register tool in `server.ts`:
   - Add `server.tool("get_company_profile", ...)` in the tools block
   - Wiring: pass Db instance, logger

3. Tests:
   - `apps/mcp-server/src/__tests__/tools/get-company-profile.test.ts`
   - T1: FPT happy path (shareholders + officers + foreign %)
   - T2: missing shareholders (officers only)
   - T3: missing officers (shareholders only)
   - T4: null foreign_holding_ratio (degrade gracefully)
   - Use live DB if available, else mock

4. Rebuild + live-verify:
   - ops: rebuild mcp-server container
   - qa: call `get_company_profile(FPT)` via gateway, inspect JSON structure

---

## Context

SKILL-4 (ownership-governance-screen) reads this tool to assess:
- Ownership concentration (top 10 holders)
- Foreign institutional presence (aggregate %)
- Insider holdings (separate tool `get_insider_transactions`)

SKILL-5 (management-track-record) reads `name` + `position` from officers to identify CEO for tenure lookup (further work via FIX-I).

**Risk Notes:**
- `vnstock_officers` has no `start_date` column yet → CEO tenure will remain PARTIAL until FIX-I (officer history extension)
- Data staleness: vnstock sync TTL=24h → tool will lag intraday announcements (risk-2 in brief)

---

## Blockers / Escalations

None identified. All source tables already exist and are populated.

**Live-verify must confirm:**
- Tool registered (appears in list_server_tools)
- No tsc errors
- DB queries complete without timeout
- Null graceful degrade (no 500 on missing data)

---

## Related Docs

- Brief: docs/architecture-briefs/2026-06-04-rapid-analysis-data-layer-gaps.md (§6 FIX-A, §3 SKILL-4)
- Schema: apps/mcp-server/src/infrastructure/database/schema-financial-reports.ts (vnstock_shareholders L345, vnstock_officers L330)
- Cron: apps/mcp-server/src/scheduler/syncVnstockData.ts (fetch + populate logic)

---

## [Developer] — dev-mcp-server

**Status:** DONE — LIVE-VERIFIED  
**Commit:** 7a44a291 (feat(rapid-phase2/FIX-A): new get_company_profile MCP tool)  
**Registry entry:** registry.ts L116 — `registerCompanyProfileTools` (#150)  
**Tests:** `src/__tests__/RAPID-A-get-company-profile-tool.test.ts` — 8 pass, 0 fail  
**TSC:** clean (bun tsc --noEmit)

**Live verification 2026-06-04 via HTTP MCP:**
- `get_company_profile(FPT)` returned 10 shareholders (top by own_percent DESC), 17 officers, free_float_approx=68.23%, data_as_of populated
- Largest holder: Trương Gia Bình 6.89% — raw numeric values confirmed
- foreign_holding_ratio: null (honest — no trading_stats row for FPT in current DB)
- No errors, no empty fallback triggered

**AC coverage:**
1. Tool callable ✓
2. Structured JSON with all required fields ✓
3. Missing data graceful (null arrays / null ratios) ✓
4. Unit tests: happy path + missing shareholders + missing officers + null foreign ratio ✓
5. Live ≥5 shareholders ✓ (10 returned)

**Status for QA:** REVIEW — ops must confirm container rebuilt after 7a44a291 (mcp /health shows toolCount=159 which includes #150)
