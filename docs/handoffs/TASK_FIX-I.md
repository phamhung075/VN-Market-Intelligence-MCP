# TASK_FIX-I — Officer Appointment Year / CEO Tenure

**Sprint:** RAPID-DATA-LAYER (last open core item — closes sprint on ship+live-verify)
**PO decision:** year-precision accepted (2026-06-04)
**Source recon:** `docs/vps-sources/officer-start-date/recon.md` (DONE-VERIFIED)
**Pattern:** clone of FIX-G (AGM-plan), same VPS + pull-fetcher + store + tool shape

---

## [Architect] Brownfield Findings

**Zone:** multi — split into 2 per-zone subtasks:
- **Zone A: `vps-scripts/`** — dev-vps-crawls
- **Zone B: `apps/mcp-server/`** — dev-mcp-server

---

### Zone A — dev-vps-crawls: `vps-scripts/`

**What to build:** VPS-side Python scraper + shell driver + systemd unit for
`finance.vietstock.vn/data/boarddetails`.

**Verified paths (mirror FIX-G):**

| FIX-G artifact | FIX-I counterpart |
|---|---|
| `vps-scripts/vietstock-agm-plan.py` | `vps-scripts/vietstock-board-details.py` |
| `vps-scripts/fetch-agm-plan.sh` | `vps-scripts/fetch-board-details.sh` |
| `vps-scripts/fetch-agm-plan-loop.sh` | `vps-scripts/fetch-board-details-loop.sh` |
| `vps-scripts/vn-agm-plan.service` | `vps-scripts/vn-board-details.service` |

**Python scraper contract (`vietstock-board-details.py`):**
- Reuse `vietstock-agm-plan.py` session/CSRF warmup pattern verbatim (same ASP.NET double-submit, same opener/jar/ssl setup).
- GET `https://finance.vietstock.vn/{ticker}/board-of-management.htm` → extract `__RequestVerificationToken` and session cookie.
- POST `code={ticker}&page=1&__RequestVerificationToken={token}` to `https://finance.vietstock.vn/data/boarddetails` (parameter MUST be `code`, NOT `stockCode` — silent 200+empty if wrong).
- Parse term-period groups; for each `Details[]` officer record: extract `Name`, `PositionText`, `FromDate` (strip whitespace → integer year; `"N/A"` variants → null, NEVER fabricate), `ClosedDate`, `YearOfBirth`, `Independence`, `TotalShares`.
- Deduplicate: keep the **latest-term** record per `(ticker, Name, PositionText)` — Vietstock returns historical term groups; we only need current appointments (page=1 is the most recent term; do not paginate history).
- Output JSON (stdout, same shape contract as agm-plan):

```json
{
  "status": "ok",
  "tickers_ok": ["FPT", "VCB"],
  "tickers_error": [],
  "data": {
    "FPT": [
      {
        "name": "Trương Gia Bình",
        "position_text": "CTHĐQT",
        "appointment_year": 1988,
        "closed_date": "2025-12-31T00:00:00",
        "year_of_birth": 1963,
        "independence": 0,
        "total_shares": 12345678
      }
    ]
  },
  "fetched_at": "2026-06-04T10:00:00Z"
}
```

**Shell driver (`fetch-board-details.sh`):** mirror `fetch-agm-plan.sh` exactly:
- `OUT_FILE=/root/data/board-details-latest.json`
- Validation: non-empty + `status==ok` before atomic `mv`.
- Push to `POST /api/push-board-details` (X-API-Key); tolerate 404 gracefully (endpoint ships in Zone B).
- Log to `/var/log/vn-board-details.log` with 10MB rotation.

**Loop driver (`fetch-board-details-loop.sh`):** mirror `fetch-agm-plan-loop.sh`:
- Once-daily at TARGET_HOUR=2 UTC (after AGM plan sweep at 01:00).
- Exponential backoff (5 failures → 1800s, 10 failures → 3600s + Telegram alert).
- Officer data is stable (changes only at AGM or mid-term resignation); daily is sufficient.

**Systemd unit (`vn-board-details.service`):** mirror `vn-agm-plan.service`:
- `ExecStart=/root/fetch-board-details-loop.sh`
- `MemoryMax=256M` (lighter: 33 tickers × 1 page × 2 HTTP calls, no multi-page pagination needed).

**VPS deploy steps (for ops):**
1. Copy `vietstock-board-details.py` → `/root/vietstock-board-details.py`
2. Copy `fetch-board-details.sh` + `fetch-board-details-loop.sh` → `/root/`, chmod +x
3. Copy `vn-board-details.service` → `/etc/systemd/system/`
4. `systemctl daemon-reload && systemctl enable --now vn-board-details.service`
5. Verify: `journalctl -u vn-board-details.service -f` + `ls -la /root/data/board-details-latest.json`
6. Confirm file served at `http://125.212.251.27:8765/proxy/board-details?batch=FPT,VCB` (existing nginx static-file proxy — check if `/proxy/board-details` route needs adding alongside `/proxy/agm-plan`).

**Risk flag — nginx proxy route:** Check whether the existing `:8765` nginx config has a dynamic `/proxy/<filename>` catch-all or only explicit routes for each file. If explicit, add `/proxy/board-details` route mirroring `/proxy/agm-plan`. Dev-vps-crawls must verify.

---

### Zone B — dev-mcp-server: `apps/mcp-server/`

#### Table decision: EXTEND `vnstock_officers` (do NOT create new table)

**Rationale:**
- `vnstock_officers` already has `(code, name)` UNIQUE key and is the source FIX-A reads from — companyProfileTools.ts queries this table directly.
- Adding `appointment_year INTEGER` (nullable) is a schema migration via `ALTER TABLE ... ADD COLUMN` (SQLite safe, no data loss, idempotent via `IF NOT EXISTS` guard pattern).
- A separate `officer_appointments` table would require a JOIN every time `get_company_profile` is called and creates a sync problem: a name mismatch between vnstock (VCI source) and Vietstock board-details scrape could leave orphaned rows. Single-table avoids that.
- The honest-null contract (`appointment_year=null` for N/A entries) maps cleanly onto a nullable integer column.
- Counter-argument considered (separate table): Vietstock board-details has historical term groups (12 pages for VNM) while `vnstock_officers` is current-composition only. Decision: store only the **current-term** appointment year (page=1, most recent term group) — not historical. This aligns with the UNIQUE(code, name) key semantics (one row per current officer).

**Migration:** Add `appointment_year INTEGER` to `vnstock_officers` in `schema-financial-reports.ts` via `ALTER TABLE vnstock_officers ADD COLUMN appointment_year INTEGER` guarded with a try/catch (column already exists = ignore, SQLite standard pattern).

**Verified paths to modify/create:**

| File | Change |
|---|---|
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` | ADD COLUMN migration for `vnstock_officers.appointment_year` (nullable INTEGER) |
| `apps/mcp-server/src/infrastructure/fetchers/boardDetailsFetcher.ts` | NEW — mirror `agmPlanFetcher.ts`; VPS GET `/proxy/board-details?batch=...`; chunked 10; 120s timeout; returns `BoardDetailsResult` |
| `apps/mcp-server/src/infrastructure/db/boardDetailsStore.ts` | NEW — `upsertBoardDetails(db, rows)` doing `UPDATE vnstock_officers SET appointment_year=? WHERE code=? AND name=?`; returns count of updated rows |
| `apps/mcp-server/src/scheduler/financial-reports/boardDetailsJob.ts` | NEW — mirror `agmPlanJob.ts`; loads watchlist; calls fetcher; calls store; returns `BoardDetailsJobResult` |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | ADD cron entry `CRONS.boardDetailsRefresh` at `0 21 * * *` (04:00 VN next day, after AGM at 20:00) |
| `apps/mcp-server/src/interface/mcp/tools/market-data/companyProfileTools.ts` | EXTEND `queryCompanyProfile`: add `appointment_year` to `OfficerRow` DB read; add `appointment_year` + `ceo_tenure_years` to `OfficerEntry` output type; derive tenure; update tool description |

**VPS endpoint URL:** `Bun.env["BOARD_DETAILS_VPS_URL"] ?? "http://125.212.251.27:8765/proxy/board-details"` (same pattern as `AGM_PLAN_VPS_URL`).

**Data flow:**
```
VPS:8765/proxy/board-details?batch=T1..T10
  → boardDetailsFetcher.ts (pull, chunked 10, 120s)
    → boardDetailsStore.ts (UPDATE vnstock_officers SET appointment_year WHERE code+name match)
      → vnstock_officers.appointment_year persisted
        → companyProfileTools.ts queryCompanyProfile() JOIN reads it
          → OfficerEntry.appointment_year + ceo_tenure_years in get_company_profile output
```

**Idempotency:** `UPDATE vnstock_officers SET appointment_year=?, fetched_at=? WHERE code=? AND name=?`. No INSERT — the row already exists (populated by vnstockFundamentalsJob via VCI source). If the name in Vietstock scrape doesn't match any vnstock_officers row → skip silently (log warning, no fabrication). `appointment_year=null` = honest-absence (N/A from Vietstock or no match).

**CEO tenure derivation (in companyProfileTools.ts):**
```typescript
const currentYear = new Date().getFullYear();
const appointment_year: number | null = row.appointment_year ?? null;
const ceo_tenure_years: number | null =
  appointment_year != null ? currentYear - appointment_year : null;
```
Only computed for officers; exposed on every `OfficerEntry` (not just CEO) so the consumer can filter by position. Never fabricate when `appointment_year=null`.

**Output contract extension for `get_company_profile`:**
```typescript
export interface OfficerEntry {
  name: string;
  position: string;
  own_percent: number | null;
  quantity: number | null;
  appointment_year: number | null;   // NEW — null = N/A or not fetched
  ceo_tenure_years: number | null;   // NEW — null when appointment_year null
}
```

**Push endpoint** `POST /api/push-board-details` (X-API-Key, same as push-agm-plan pattern): VPS shell script pushes the JSON blob; mcp-server handler calls `boardDetailsJob` logic. This is optional (VPS also does file-drop to `/root/data/board-details-latest.json`); the pull path is primary.

**Bank/edge handling:**
- `appointment_year=null` stored for any officer with `FromDate="N/A"` variants (trim+check).
- If Vietstock returns 200+empty body (wrong `stockCode` param — recon note 1): treat as error, do not wipe existing rows.
- Banks have same Vietstock board-details structure — no bank-specific branching needed.

**DDD layer placement:**
- `boardDetailsFetcher.ts` → `infrastructure/fetchers/` (I/O adapter, no domain logic)
- `boardDetailsStore.ts` → `infrastructure/db/` (persistence adapter)
- `boardDetailsJob.ts` → `scheduler/financial-reports/` (application service, orchestrates fetch+store)
- tenure derivation formula → stays inline in `companyProfileTools.ts` (interface layer, trivial arithmetic, no domain service warranted for `currentYear - year`)

**Test strategy (lean BUILD-STANDARD — existing service, new feature):**
- Unit (sandbox, in-memory SQLite, injected fetch mock):
  - `boardDetailsFetcher.ts`: mock VPS response → correct `BoardDetailsResult` shape; null/N/A FromDate → appointment_year null; missing rows → empty result not null.
  - `boardDetailsStore.ts`: upsert sets appointment_year; name mismatch → no row updated (count=0); null appointment_year stored as NULL not 0.
  - `companyProfileTools.ts` extended: officer with appointment_year=2021 → ceo_tenure_years = currentYear-2021; appointment_year=null → ceo_tenure_years=null (no fabrication).
- Replay test (lean gate): seed `vnstock_officers` with known rows, run `boardDetailsStore.upsertBoardDetails` with FIX-I data, query `get_company_profile` → verify `appointment_year` and `ceo_tenure_years` present.
- Live-verify (router raw-verify gate): after deploy, call `get_company_profile("FPT")` → confirm `Trương Gia Bình.appointment_year=1988` + `ceo_tenure_years=38` (approx 2026-1988). Do NOT trust green test badge alone (per router-verify-raw-not-badges lesson).

**Scan clean:** true — no cross-service HTTP, no new domain service, no new microservice.

---

## Design Decision Record

**Why not a separate `officer_appointments` table?**
The Vietstock scrape provides current-term appointment year for the same set of officers already in `vnstock_officers` (same people, same tickers). A JOIN on a separate table risks name-mismatch orphans (Vietstock uses Vietnamese diacritics, VCI may normalize differently). A nullable column on the existing table is safer, simpler, and keeps `get_company_profile` as a single-table read (plus trading_stats). The downside — losing historical term data — is acceptable: historical board compositions are not in the current product spec.

**Why UPDATE not INSERT OR REPLACE for boardDetailsStore?**
`vnstock_officers` is owned by `syncVnstockData` (VCI source). `INSERT OR REPLACE` would reset `own_percent`/`quantity` (set by VCI) to NULL on conflict. UPDATE is additive: only `appointment_year` is patched, everything else preserved.

---

## BUILD-STANDARD

```
BUILD-STANDARD: lean
BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
NOTE: apps/mcp-server/ already exists; FIX-I is a new feature (new fetcher+store+job, extend existing tool).
      dev-mcp-server drives end-to-end; no full relay required.
```

---

## RETURN

```
DONE: Technical design complete, brownfield findings written to docs/handoffs/TASK_FIX-I.md
ZONE: multi
  - Zone A: vps-scripts/        → dev-vps-crawls
  - Zone B: apps/mcp-server/    → dev-mcp-server
NEXT: pm | break into per-zone atomic tasks, create developer handoffs
HANDOFF: docs/handoffs/TASK_FIX-I.md
PIPELINE: continue
```
