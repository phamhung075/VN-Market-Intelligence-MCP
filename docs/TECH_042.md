# TECH-042: Rủi Ro Khí Hậu + Monitor Điện Lực — Technical Design

status: APPROVED_BY_ARCHITECT
req_ref: REQ-042

---

## Brownfield Impact

### Files created (7 new):
- `src/infrastructure/fetchers/weatherVn.ts` — NCHMF weather fetcher
- `src/infrastructure/fetchers/hydrologicalData.ts` — Reservoir level data
- `src/domain/services/climateImpactMapper.ts` — Weather → stock impact mapper
- `src/domain/services/energyMarketAnalyzer.ts` — Power grid → stock impact
- `src/domain/services/seasonalRiskCalendar.ts` — Seasonal risk windows
- `src/interface/mcp/tools/climateTools.ts` — get_climate_risk_signals
- `src/interface/mcp/tools/energyTools.ts` — get_energy_grid_signals

### Files modified (5 existing):
- `src/domain/services/signalDetector.ts` — Add `"climate_event"` | `"energy_grid"` to SignalType
- `src/domain/services/cascadeEngine.ts` — Add CLIMATE_RULES
- `src/scheduler/jobs.ts` — Add weatherCheckJob cron
- `src/application/usecases/assembleBriefing.ts` — Add climate section
- `src/interface/mcp/server.ts` — Register 2 new tools (60 → 62)

### Breaking changes: None

---

## Task Breakdown

### Task 257: Weather VN Fetcher
**Branch**: `task/257-weather-vn`
**Layer**: infrastructure/fetchers
**Files**: `src/infrastructure/fetchers/weatherVn.ts`, `src/__tests__/257-weather-vn.test.ts`

```typescript
export type WeatherEventType =
  | "typhoon" | "flood" | "drought" | "heat_wave"
  | "cold_snap" | "el_nino" | "la_nina";

export interface WeatherEvent {
  type: WeatherEventType;
  severity: Severity;
  regions: string[];
  forecastDate: string;
  impactDuration: string;
  description: string;
}

export async function fetchWeatherWarnings(): Promise<WeatherEvent[]>;
```

**Implementation**: Scrape NCHMF (nchmf.gov.vn) for active warnings.
Fallback: extract weather events from existing news sources (CafeF, VnExpress).
El Niño/La Niña: Check NOAA ENSO status (public JSON).
Circuit breaker + rate limiter. Never throw.

**Tests**: 10 tests.

---

### Task 258: Hydrological Data Fetcher
**Branch**: `task/258-hydro-data`
**Layer**: infrastructure/fetchers
**Files**: `src/infrastructure/fetchers/hydrologicalData.ts`, `src/__tests__/258-hydro-data.test.ts`

```typescript
export interface ReservoirLevel {
  name: string;
  currentLevel: number;     // meters
  capacityPct: number;      // 0-100
  trend: "rising" | "falling" | "stable";
  date: string;
}

export async function fetchReservoirLevels(): Promise<ReservoirLevel[]>;
```

**Implementation**: News-based extraction from Vietnamese media reporting on reservoir levels.
Pattern matching: `"mực nước hồ (\\w+) đạt (\\d+)%"`, `"hồ thủy điện (\\w+).*?(\\d+)%"`.
Key reservoirs: Hòa Bình, Sơn La, Lai Châu, Trị An, Ialy.

**Tests**: 8 tests.

---

### Task 259: Climate Impact Mapper
**Branch**: `task/259-climate-impact`
**Layer**: domain/services
**Files**: `src/domain/services/climateImpactMapper.ts`, `src/__tests__/259-climate-impact.test.ts`

```typescript
export interface ClimateSignal {
  eventType: WeatherEventType;
  severity: Severity;
  affectedStocks: Array<{ code: string; direction: ImpactDirection; reasoning: string }>;
  seasonalContext: string;
  confidence: number;
}

export function mapClimateImpact(event: WeatherEvent, watchlist: WatchlistEntry[]): ClimateSignal;
```

**Seasonal risk calendar** (embedded):
```typescript
const SEASONAL_RISKS: Record<string, { risk: string; stocks: string[]; note: string }> = {
  "06-08": { risk: "thiếu điện", stocks: ["IDC","KBC","GEG","REE"], note: "Mùa nắng nóng, nhu cầu điện cao nhất" },
  "09-11": { risk: "bão lũ", stocks: ["MPC","ANV","BVH","PVI","VNM"], note: "Mùa bão chính miền Trung + Bắc" },
  "12-04": { risk: "hạn hán/El Niño", stocks: ["REE","CHP","GEG"], note: "Mùa khô, thủy điện giảm" },
  "01-03": { risk: "rét đậm", stocks: ["DCM","DPM"], note: "Ảnh hưởng vụ Đông Xuân, nhu cầu phân bón" },
};
```

**Tests**: 15 tests.

---

### Task 260: Energy Market Analyzer
**Branch**: `task/260-energy-analyzer`
**Layer**: domain/services
**Files**: `src/domain/services/energyMarketAnalyzer.ts`, `src/__tests__/260-energy-analyzer.test.ts`

```typescript
export interface EnergyData {
  hydroCapacityPct: number;
  thermalDispatchPct: number;
  renewableDispatchPct: number;
  peakDemandGW: number;
  installedCapacityGW: number;
}

export interface EnergySignal {
  type: "power_shortage" | "hydro_deficit" | "renewable_growth" | "thermal_stress";
  severity: Severity;
  affectedStocks: Array<{ code: string; direction: ImpactDirection; reasoning: string }>;
  confidence: number;
}

export function analyzeEnergyMarket(data: EnergyData): EnergySignal[];
```

**Key rules**:
- Reservoir < 40% → hydro_deficit → REE/GEG bullish (alternatives), thủy điện nhỏ bearish
- Peak > 90% installed → power_shortage → IDC/KBC bearish, GEG bullish
- Thermal > 60% → thermal_stress → coal stocks affected
- Renewable dispatch rising → GEG/REE bullish

**Tests**: 12 tests.

---

### Task 261: Signal Integration + Scheduler
**Branch**: `task/261-signal-integration-042`

- Extend `SignalType`: `"climate_event" | "energy_grid"`
- Add `CLIMATE_RULES` to cascadeEngine
- Add `weatherCheckJob` cron: every 6h typhoon season, every 12h off-season
- Wire climate section into morning briefing

**Tests**: 8 tests.

---

### Task 262: MCP Tools (2 tools)
**Branch**: `task/262-mcp-tools-042`

2 new tools: `get_climate_risk_signals`, `get_energy_grid_signals`
Register in `server.ts`: 60 → 62 tools.

**Tests**: 6 tests.

---

## Dependency Chain

```
257 (weatherVn — infra, no deps)
258 (hydrologicalData — infra, no deps)
259 (climateImpactMapper — domain, no deps)
260 (energyMarketAnalyzer — domain, no deps)
  ↓
261 (signal integration — depends on 257-260)
  ↓
262 (MCP tools — depends on all above)
```

Tasks 257, 258, 259, 260 can run in parallel.

## Tool Count: 60 → **62 tools**
