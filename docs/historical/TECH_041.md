# TECH-041: Chuỗi Cung Ứng Động — Technical Design

status: APPROVED_BY_ARCHITECT
req_ref: REQ-041

---

## Brownfield Impact

### Files created (5 new):
- `src/infrastructure/fetchers/shippingIndex.ts` — Shipping index fetcher
- `src/domain/services/supplyChainAnalyzer.ts` — Shipping index → stock impact
- `src/domain/services/supplyChainEventDetector.ts` — Disruption event detector
- `src/infrastructure/db/supplyChainStore.ts` — Supply chain events store
- `src/interface/mcp/tools/supplyChainTools.ts` — get_supply_chain_exposure

### Files modified (5 existing):
- `src/domain/services/signalDetector.ts` — Add `"supply_chain"` to SignalType
- `src/domain/services/cascadeEngine.ts` — Add SUPPLY_CHAIN_RULES
- `src/domain/services/tradeRelationships.ts` — Add dynamic update method
- `src/infrastructure/db/tradeStore.ts` — Add timestamped exposure updates
- `src/interface/mcp/server.ts` — Register 1 new tool (59 → 60)

### Breaking changes: None

---

## Task Breakdown

### Task 252: Shipping Index Fetcher
**Branch**: `task/252-shipping-index`
**Layer**: infrastructure/fetchers
**Files**: `src/infrastructure/fetchers/shippingIndex.ts`, `src/__tests__/252-shipping-index.test.ts`

```typescript
export interface ShippingIndex {
  name: string;            // "BDI" | "FBX_ASIA_US" | "SCFI"
  value: number;
  change: number;
  changePct: number;
  date: string;
}

export async function fetchShippingIndices(): Promise<ShippingIndex[]>;
```

**Implementation**: Piggyback on existing Yahoo Finance fetcher pattern.
BDI available as `^BDI` on Yahoo Finance. FBX from Trading Economics.
Store in existing `tracked_indicators` table via `commodityTracker.ts` pattern.

**Tests**: 8 tests.

---

### Task 253: Supply Chain Analyzer
**Branch**: `task/253-supply-chain-analyzer`
**Layer**: domain/services
**Files**: `src/domain/services/supplyChainAnalyzer.ts`, `src/__tests__/253-supply-chain.test.ts`

```typescript
export interface SupplyChainSignal {
  index: string;
  deviation: MacroDeviation;
  affectedStocks: Array<{ code: string; direction: ImpactDirection; reasoning: string }>;
  severity: Severity;
  confidence: number;
}

export function analyzeSupplyChainImpact(
  indices: ShippingIndex[],
  stats: MacroStats[],
  watchlist: WatchlistEntry[]
): SupplyChainSignal[];
```

**Stock exposure map** (uses existing `tradeRelationships.ts` data):
```typescript
const SHIPPING_EXPOSURE = {
  HPG: { sensitivity: "high", direction: "inverse", reason: "Nhập phế liệu thép" },
  GMD: { sensitivity: "high", direction: "direct", reason: "Doanh thu logistics" },
  VNM: { sensitivity: "medium", direction: "inverse", reason: "Xuất sữa" },
  GVR: { sensitivity: "medium", direction: "inverse", reason: "Xuất cao su" },
  DGC: { sensitivity: "medium", direction: "inverse", reason: "Xuất hóa chất" },
  FPT: { sensitivity: "low", direction: "neutral", reason: "Digital, ít phụ thuộc vận tải" },
};
```

Uses σ-based thresholds from existing `macroThresholds.ts`.
**Tests**: 15 tests.

---

### Task 254: Supply Chain Event Detector
**Branch**: `task/254-supply-chain-events`
**Layer**: domain/services
**Files**: `src/domain/services/supplyChainEventDetector.ts`, `src/__tests__/254-supply-chain-events.test.ts`

```typescript
export type SupplyChainEventType =
  | "port_congestion" | "dock_strike" | "canal_blockage"
  | "container_shortage" | "force_majeure" | "route_disruption";

export interface SupplyChainEvent {
  eventType: SupplyChainEventType;
  severity: Severity;
  affectedRoutes: string[];
  affectedStocks: string[];
  confidence: number;
  description: string;
}

export function detectSupplyChainEvent(text: string, watchlistCodes: string[]): SupplyChainEvent | null;
```

**Vietnamese + English patterns** (12 patterns):
```typescript
const SC_PATTERNS = [
  { pattern: /tắc nghẽn cảng|port congestion/i, type: "port_congestion", severity: "high" },
  { pattern: /đình công.{0,20}cảng|dock strike/i, type: "dock_strike", severity: "high" },
  { pattern: /kênh (Suez|Panama)|Suez Canal|Panama Canal/i, type: "canal_blockage", severity: "critical" },
  { pattern: /thiếu container|container shortage/i, type: "container_shortage", severity: "medium" },
  { pattern: /force majeure/i, type: "force_majeure", severity: "high" },
  { pattern: /gián đoạn.{0,20}cung ứng|supply chain disruption/i, type: "route_disruption", severity: "high" },
];
```

**Tests**: 12 tests.

---

### Task 255: Signal Integration + Dynamic Trade Update
**Branch**: `task/255-signal-integration-041`
**Layer**: domain + application + infrastructure

- Extend `SignalType`: `"supply_chain"`
- Add `SUPPLY_CHAIN_RULES` to cascadeEngine
- Wire shipping index fetch into Step A2 (parallel with existing macro fetch)
- Wire supply chain event detection into `pollNews.ts`
- Add `updateExposureFromBctc()` to `tradeRelationships.ts`

**Tests**: 8 tests.

---

### Task 256: MCP Tool
**Branch**: `task/256-mcp-tool-041`
**Layer**: interface/mcp/tools

1 new tool: `get_supply_chain_exposure`
Register in `server.ts`: 59 → 60 tools.

**Tests**: 5 tests.

---

## Dependency Chain

```
252 (shippingIndex — infra, no deps)
253 (supplyChainAnalyzer — domain, no deps)
254 (supplyChainEventDetector — domain, no deps)
  ↓
255 (signal integration — depends on 252, 253, 254)
  ↓
256 (MCP tool — depends on all above)
```

Tasks 252, 253, 254 can run in parallel.

## Tool Count: 59 → **60 tools**
