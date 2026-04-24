# TECH-044: Radar Dược Phẩm VN — Technical Design

status: APPROVED_BY_ARCHITECT
req_ref: REQ-044

---

## Brownfield Impact

### Files created (4 new):
- `src/infrastructure/fetchers/davPharmacy.ts` — DAV drug approval scraper
- `src/domain/services/pharmaEventMapper.ts` — Pharma event → stock impact
- `src/infrastructure/db/pharmaStore.ts` — Drug approvals + outbreak events store
- `src/interface/mcp/tools/pharmaTools.ts` — get_pharma_signals

### Files modified (5 existing):
- `src/domain/services/signalDetector.ts` — Add `"pharma_event"` to SignalType
- `src/domain/services/cascadeEngine.ts` — Add PHARMA_RULES
- `bctc-schema.ts` — Add `"pharmaceutical"` to DomainType
- `src/application/usecases/pollNews.ts` — Wire outbreak detection
- `src/interface/mcp/server.ts` — Register 1 new tool (63 → 64)

### Breaking changes: None

---

## Task Breakdown

### Task 268: Pharma Event Mapper
**Branch**: `task/268-pharma-event-mapper`
**Layer**: domain/services
**Files**: `src/domain/services/pharmaEventMapper.ts`, `src/__tests__/268-pharma-event.test.ts`

```typescript
export type PharmaEventType =
  | "drug_approval" | "hospital_tender" | "outbreak"
  | "price_regulation" | "fdi_pharma";

export interface PharmaSignal {
  eventType: PharmaEventType;
  severity: Severity;
  affectedStocks: Array<{ code: string; direction: ImpactDirection; reasoning: string }>;
  confidence: number;
  description: string;
}

export function classifyPharmaEvent(text: string, watchlist: WatchlistEntry[]): PharmaSignal | null;
```

**Outbreak patterns** (Vietnamese + English):
```typescript
const OUTBREAK_PATTERNS = [
  /dịch (bệnh|sốt xuất huyết|cúm|tay chân miệng|sởi|COVID)/i,
  /outbreak|epidemic|pandemic/i,
  /tiêm chủng|vaccination campaign/i,
  /WHO.{0,30}(cảnh báo|warning)/i,
];
```

**Manufacturer-to-stock map**:
```typescript
const PHARMA_STOCKS: Record<string, string> = {
  "dược hậu giang": "DHG", "hậu giang": "DHG",
  "imexpharm": "IMP",
  "dược bình định": "DBD", "bidiphar": "DBD",
  "pymepharco": "PME",
  "traphaco": "TRA",
  "dược phẩm OPC": "OPC",
};
```

**Tests**: 18 tests.

---

### Task 269: DAV Pharmacy Fetcher
**Branch**: `task/269-dav-fetcher`
**Layer**: infrastructure/fetchers
**Files**: `src/infrastructure/fetchers/davPharmacy.ts`, `src/infrastructure/db/pharmaStore.ts`, `src/__tests__/269-dav-fetcher.test.ts`

Cheerio HTML scraper targeting `dav.gov.vn`.
- Drug registration announcements
- Drug price ceiling changes
- Circuit breaker + rate limiter
- Never throw → return `[]`

**SQLite table**:
```sql
CREATE TABLE IF NOT EXISTS pharma_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  drug_name TEXT,
  manufacturer TEXT,
  stock_code TEXT,
  approval_date TEXT,
  description TEXT NOT NULL,
  severity TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pharma_code ON pharma_events(stock_code);
CREATE INDEX IF NOT EXISTS idx_pharma_date ON pharma_events(created_at);
```

**Tests**: 10 tests.

---

### Task 270: Signal Integration + Cascade Rules
**Branch**: `task/270-signal-integration-044`

- Extend `SignalType`: `"pharma_event"`
- Add `PHARMA_RULES` to cascadeEngine:
  ```
  outbreak → pharmaceutical (bullish), vaccine_distributor (bullish)
  drug_price_regulation → pharmaceutical (bearish)
  hospital_budget_increase → pharmaceutical (bullish)
  ```
- Add `"pharmaceutical"` to DomainType in `bctc-schema.ts`
- Wire outbreak detection into `pollNews.ts` sentiment pass
- Add monthly DAV check cron

**Tests**: 8 tests.

---

### Task 271: MCP Tool
**Branch**: `task/271-mcp-tool-044`

1 new tool: `get_pharma_signals`
Register in `server.ts`: 63 → 64 tools.

**Tests**: 5 tests.

---

## Dependency Chain

```
268 (pharmaEventMapper — pure, no deps)
269 (davFetcher + store — infra, no deps)
  ↓
270 (signal integration — depends on 268, 269)
  ↓
271 (MCP tool — depends on all above)
```

Tasks 268, 269 can run in parallel.

## Tool Count: 63 → **64 tools**

---

## Final Tool Count Summary (Sprint 039-044)

| Sprint | Start | Added | End |
|--------|-------|-------|-----|
| 036 (current) | 64 | -11 | 53 |
| 039 | 53 | +3 | 56 |
| 040 | 56 | +3 | 59 |
| 041 | 59 | +1 | 60 |
| 042 | 60 | +2 | 62 |
| 043 | 62 | +1 | 63 |
| 044 | 63 | +1 | 64 |
