---
sprint: RAPID-DATA-LAYER
branch: task/FIX-I-B-mcp-board-details
size: M
zone: apps/mcp-server/
depends_on: []
blocks: []
---

## TLDR

Extend mcp-server to fetch board-details from VPS (appointment_year data), upsert into `vnstock_officers.appointment_year` column, expose via updated `get_company_profile` tool with CEO tenure derivation. Unit tests + replay gate; live-verify waits on FIX-I-A proxy deployment.

## [PM] Planning Context

- **Zone:** apps/mcp-server/ (TypeScript/Bun microservice)
- **Acceptance Criteria:**
  - [ ] `ALTER TABLE vnstock_officers ADD COLUMN appointment_year INTEGER` (idempotent via try/catch, column already exists → skip)
  - [ ] `boardDetailsFetcher.ts` fetches VPS `/proxy/board-details?batch=T1..T10` (chunked 10 tickers, 120s timeout, returns `BoardDetailsResult` with parsed JSON)
  - [ ] `boardDetailsStore.ts` upserts appointment_year via `UPDATE vnstock_officers SET appointment_year=?, fetched_at=? WHERE code=? AND name=?` (idempotent, name-mismatch → count=0, no fabrication)
  - [ ] `boardDetailsJob.ts` orchestrates fetcher + store; loads watchlist from `stock-classification.json`; returns `BoardDetailsJobResult`
  - [ ] `startScheduler.ts` adds cron entry `CRONS.boardDetailsRefresh: "0 21 * * *"` (04:00 VN next day, after AGM 20:00)
  - [ ] `companyProfileTools.ts` extends `OfficerEntry` type: add `appointment_year: number | null` + `ceo_tenure_years: number | null`; tool description updated; tenure derived as `currentYear - appointment_year` (null when appointment_year null)
  - [ ] Unit tests: fetcher shape (null/N/A → appointment_year null), store UPDATE-only (name-mismatch → count=0), tenure derivation (no fabrication on null)
  - [ ] Replay test: seed vnstock_officers, run boardDetailsStore.upsertBoardDetails, query get_company_profile → appointment_year + ceo_tenure_years present and correct
  - [ ] Live-verify (router raw-verify): after FIX-I-A deployment + mcp-server rebuild, call `get_company_profile("FPT")` → verify `officers[0].appointment_year=1988` + `ceo_tenure_years≈38` (2026-1988)

- **Files to read first:**
  - `docs/handoffs/TASK_FIX-I.md` (architect brownfield findings, full data-flow contract)
  - `apps/mcp-server/src/infrastructure/fetchers/agmPlanFetcher.ts` (reference template: VPS fetch pattern, chunking, timeout)
  - `apps/mcp-server/src/infrastructure/db/agmPlanStore.ts` (reference template: store pattern, idempotency)
  - `apps/mcp-server/src/scheduler/financial-reports/agmPlanJob.ts` (reference template: orchestrator pattern)
  - `apps/mcp-server/src/scheduler/startScheduler.ts` (reference template: cron registration)
  - `apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts` (tool to extend)

- **Files to create:**
  - `apps/mcp-server/src/infrastructure/fetchers/boardDetailsFetcher.ts` (~100L, mirror agmPlanFetcher.ts)
  - `apps/mcp-server/src/infrastructure/db/boardDetailsStore.ts` (~50L, UPDATE-only upsert)
  - `apps/mcp-server/src/scheduler/financial-reports/boardDetailsJob.ts` (~60L, mirror agmPlanJob.ts)

- **Files to modify:**
  - `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — add migration: `ALTER TABLE vnstock_officers ADD COLUMN appointment_year INTEGER` (guarded try/catch)
  - `apps/mcp-server/src/scheduler/startScheduler.ts` — add `CRONS.boardDetailsRefresh: "0 21 * * *"` entry + call `runBoardDetailsJob`
  - `apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts` — extend `queryCompanyProfile` to read appointment_year; extend `OfficerEntry` type; add tenure derivation; update description

- **Dependencies:**
  - None initially (unit tests use injected mocks, no live VPS needed)
  - FIX-I-A live-verify gate: set `BOARD_DETAILS_VPS_URL` env var + wait for `/proxy/board-details` route confirmed live on VPS before rebuild

- **Knowledge needed:**
  - `docs/standards/microservice-build-standard.md` (lean build: new feature in existing service)
  - `docs/references/ddd-microservices.md` (layer placement: fetcher→infrastructure, store→infrastructure, job→application, tenure→interface)
  - `docs/protocols/vps-fetcher-pattern.md` (chunking, timeout, error handling)

- **Build standard:** lean (existing service, additive feature)
- **Idempotency:** fetcher is read-only; store UPDATE-only (no INSERT); schema migration uses try/catch; name-mismatch → silent skip + warning log

## Test Strategy

**Unit tests (no mcp-server container, no live VPS):**

1. **boardDetailsFetcher.ts:**
   - Mock VPS response (known JSON shape)
   - Verify output: `BoardDetailsResult` with `status, tickers_ok, tickers_error, data, fetched_at`
   - Test null/N/A FromDate → appointment_year null (never 0, never string)
   - Test missing tickers → tickers_error populated, data[ticker] empty

2. **boardDetailsStore.ts:**
   - In-memory SQLite schema + vnstock_officers seed rows (code, name, own_percent, quantity)
   - Call `upsertBoardDetails(db, rows)` with FIX-I JSON data
   - Verify `UPDATE` changed appointment_year + fetched_at
   - Verify own_percent/quantity UNchanged (no overwrite)
   - Test name-mismatch: row with (code=FPT, name="Unknown Officer") vs scrape row with name="Trương Gia Bình" → no update, count=0, warning logged
   - Verify return count matches number of rows updated

3. **companyProfileTools.ts tenure:**
   - Mock db row: `{code: "FPT", name: "Trương Gia Bình", appointment_year: 1988}`
   - Call tenure derivation inline
   - Verify `ceo_tenure_years = 2026 - 1988 = 38` (use current date, not hardcoded)
   - Test null appointment_year → null ceo_tenure_years (no default, no fabrication)

**Replay test (bounded gate, proves flow):**

1. Seed in-memory SQLite with 5 vnstock_officers rows (FPT, VCB, VNM, HPG, MWG; mixed appointment_year coverage)
2. Create FIX-I JSON: 5 tickers with some appointment_year=2020, some "N/A"
3. Call `boardDetailsStore.upsertBoardDetails(db, rows)` → returns count=X
4. Query `get_company_profile(db, "FPT")` → verify OfficerEntry includes appointment_year + ceo_tenure_years in output
5. Verify output JSON structure matches tool spec

**No live mcp-server or VPS calls in unit/replay** — those are developer-manual + live-verify only.

## Developer Handoff Path

1. Read FIX-G fetcher/store/job implementations (agmPlanFetcher/agmPlanStore/agmPlanJob) as templates
2. Implement boardDetailsFetcher.ts: mirror agmPlanFetcher pattern, set `BOARD_DETAILS_VPS_URL` env default, chunk by 10, 120s timeout
3. Implement boardDetailsStore.ts: UPDATE-only upsert, name-match guard, silent skip on mismatch + warning log
4. Implement boardDetailsJob.ts: mirror agmPlanJob pattern, load watchlist, call fetcher → store, return result
5. Modify schema-financial-reports.ts: add ALTER TABLE migration, guard try/catch
6. Modify startScheduler.ts: add boardDetailsRefresh cron at "0 21 * * *" + call boardDetailsJob
7. Modify companyProfileTools.ts: extend queryCompanyProfile to read appointment_year; extend OfficerEntry type; add tenure formula
8. Run unit tests (in-mem SQLite, mocked VPS): `npm test boardDetailsFetcher boardDetailsStore companyProfileTools` → 0 fail
9. Run replay test: seed + upsert + query → verify output shape
10. Verify tsc0 (no TS errors)
11. Commit code (no rebuild yet — wait for FIX-I-A deployment)
12. Once FIX-I-A deployed and `/proxy/board-details` live: trigger rebuild (via ops/PO dispatch)
13. After rebuild: router raw-verify gate — call `get_company_profile("FPT")` → confirm Trương Gia Bình.appointment_year=1988, ceo_tenure_years≈38

## Architect Notes

**Data flow:**
```
VPS:8765/proxy/board-details?batch=T1..T10
  ↓ (boardDetailsFetcher, chunked 10, 120s)
JSON {status, data:{T1:[...], T2:[...]}, ...}
  ↓ (boardDetailsStore)
UPDATE vnstock_officers SET appointment_year=?, fetched_at=? WHERE code=? AND name=?
  ↓ (idempotent: only UPDATE, no INSERT, name-match guard)
vnstock_officers.appointment_year persisted
  ↓ (companyProfileTools.queryCompanyProfile)
SELECT code, name, appointment_year FROM vnstock_officers WHERE code=?
  ↓ (tenure derivation inline)
OfficerEntry {name, position, appointment_year, ceo_tenure_years}
  ↓ (get_company_profile tool output)
Tool client receives: {officers: [{name, position, ..., appointment_year: 1988, ceo_tenure_years: 38}]}
```

**Table decision:** EXTEND vnstock_officers (do NOT create new table)
- Rationale: vnstock_officers already keyed on (code, name) UNIQUE and is read by companyProfileTools directly
- Single-table avoids name-mismatch orphans (Vietstock diacritics may differ from VCI)
- Nullable column is clean contract: appointment_year=null = N/A or not fetched

**Edge case — Bank B02-TCTD:**
- Banks have same Vietstock board-details structure
- UPDATE logic is generic: code + name match → upsert
- No bank-specific branching needed

**Scan clean:** true
- No new microservice
- No new cross-service HTTP (only mcp-server calls VPS, already pattern for AGM)
- No new domain service (tenure is trivial arithmetic, stays in interface layer)

---

## RETURN

```
TASK_ID: FIX-I-B
TITLE: MCP-server board-details fetcher + store + tool extension
SIZE: M
ZONE: apps/mcp-server/
OWNER_RECOMMENDED: dev-mcp-server
AC_COUNT: 8
DEPENDS_ON: none (unit tests parallel with FIX-I-A)
BLOCKED_BY: FIX-I-A (live-verify waits for /proxy/board-details)
PIPELINE: ready
```
