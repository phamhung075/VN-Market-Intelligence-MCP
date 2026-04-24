# TECH-046: Kinh Dich Engine — Technical Design

status: APPROVED_BY_ARCHITECT
req_ref: REQ-046

---

## Brownfield Impact

### Files created (14 new):
- `src/domain/services/kinhDich/hexagramLibrary.ts` — 64 hexagrams + 8 trigrams (static data)
- `src/domain/services/kinhDich/hexagramResolver.ts` — 6 bits → hexagram lookup
- `src/domain/services/kinhDich/haoEncoder.ts` — market signals → 6 hao with Lao/Thieu
- `src/domain/services/kinhDich/nuclearComputer.ts` — Ho que extraction
- `src/domain/services/kinhDich/transformedComputer.ts` — Bien que from Lao flips
- `src/domain/services/kinhDich/nguHanhClassifier.ts` — Five Elements interaction
- `src/domain/services/kinhDich/kinhDichReading.ts` — orchestrator
- `src/domain/services/kinhDich/kinhDichFormatter.ts` — Vietnamese prose output
- `src/domain/services/kinhDich/markovPredictor.ts` — pure transition probability logic
- `src/domain/services/kinhDich/hexagramBacktester.ts` — accuracy computation
- `src/domain/services/kinhDich/index.ts` — barrel export
- `src/infrastructure/db/hexagramStore.ts` — SQLite CRUD for readings + transitions
- `src/interface/mcp/tools/kinhDichTools.ts` — 6 MCP tools
- `src/scheduler/hexagramBacktestJob.ts` — weekly backtest cron

### Files modified (5 existing):
- `src/infrastructure/db/schema.ts` — 2 new tables
- `src/scheduler/intelligenceCycleJob.ts` — Step A4: compute hexagram per stock
- `src/domain/services/convictionScorer.ts` — add kinhDich 6th dimension
- `src/interface/mcp/server.ts` — register 6 new tools (69 → 75)
- `src/scheduler/jobs.ts` — register backtest cron

### Breaking changes: None

---

## Schema

```sql
CREATE TABLE IF NOT EXISTS kinhdich_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_code TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  hexagram_number INTEGER NOT NULL,
  ho_que_number INTEGER NOT NULL,
  bien_que_number INTEGER NOT NULL,
  hao_states TEXT NOT NULL,
  raw_scores TEXT NOT NULL,
  ngu_hanh_dynamic TEXT,
  trading_signal TEXT,
  confidence REAL,
  action_note TEXT
);
CREATE INDEX idx_kd_readings_code_ts ON kinhdich_readings(stock_code, timestamp);

CREATE TABLE IF NOT EXISTS hexagram_transitions (
  from_hexagram INTEGER NOT NULL,
  to_hexagram INTEGER NOT NULL,
  stock_code TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  total_price_change_5d REAL DEFAULT 0,
  win_count INTEGER DEFAULT 0,
  last_seen TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (from_hexagram, to_hexagram, stock_code)
);
```

---

## Task Breakdown

### Task 280: Hexagram Library + Resolver (pure domain)

Port from Python `que_shared.py` + `rewrite_*.py`:

```typescript
// src/domain/services/kinhDich/hexagramLibrary.ts

export const TRIGRAMS: Record<string, TrigramMeta> = {
  Kien: { chinese: "乾", element: "Kim", image: "Troi", symbol: "☰", lines: [1,1,1] },
  Khon: { chinese: "坤", element: "Tho", image: "Dat", symbol: "☷", lines: [0,0,0] },
  Chan: { chinese: "震", element: "Moc", image: "Sam", symbol: "☳", lines: [1,0,0] },
  Ton:  { chinese: "巽", element: "Moc", image: "Gio", symbol: "☴", lines: [0,1,1] },
  Kham: { chinese: "坎", element: "Thuy", image: "Nuoc", symbol: "☵", lines: [0,1,0] },
  Ly:   { chinese: "離", element: "Hoa", image: "Lua", symbol: "☲", lines: [1,0,1] },
  Can:  { chinese: "艮", element: "Tho", image: "Nui", symbol: "☶", lines: [0,0,1] },
  Doai: { chinese: "兌", element: "Kim", image: "Dam", symbol: "☱", lines: [1,1,0] },
};

export const QUE_META: QueMeta[] = [/* all 64 from que_shared.py QUE_META */];

// Hexagram data: core_meaning, judgment, image, state, lines[6]
export const QUE_DATA: Record<number, QueData> = {/* all 64 from rewrite_*.py */};
```

```typescript
// src/domain/services/kinhDich/hexagramResolver.ts
// Pre-built lookup tables (same as Python kinhdich_engine.py)

const LINES_TO_TRIGRAM: Map<string, string>; // "1,1,1" → "Kien"
const TRIGRAMS_TO_QUE: Map<string, number>;  // "Kien,Kien" → 1

export function resolveHexagram(signals: [number,number,number,number,number,number]): number;
export function getHexLines(upper: string, lower: string): number[];
export function getBienQue(hexLines: number[], linePos: number): number | null;
```

**Tests:** 280-hexagram-library.test.ts
- All 64 hexagrams resolve correctly
- [1,1,1,1,1,1] → Kien(1), [0,0,0,0,0,0] → Khon(2)
- Bien que for each position computed correctly
- QUE_DATA has all 64 entries with required fields

---

### Task 281: Hao Encoder — signals → Lao/Thieu states

```typescript
// src/domain/services/kinhDich/haoEncoder.ts

export type HaoState = 'LAO_DUONG' | 'THIEU_DUONG' | 'THIEU_AM' | 'LAO_AM';

export interface HaoReading {
  position: 1|2|3|4|5|6;
  label: string;
  rawScore: number;      // -1 to +1
  state: HaoState;
  binary: 0 | 1;         // for hexagram lookup
  isChanging: boolean;    // true if Lao
}

// Fixed thresholds (hybrid: switch to adaptive after 90 days)
const LAO_DUONG_THRESHOLD = 0.75;
const THIEU_DUONG_THRESHOLD = 0.10;
const LAO_AM_THRESHOLD = -0.75;

export function classifyHao(score: number): HaoState;
export function encodeHaos(scores: number[]): HaoReading[];
```

Signal score computation (reads from existing DB data):
- Hao 1 (Sentiment): sentimentTrend OLS slope normalized
- Hao 2 (Fundamentals): BCTC conviction from vnstock_financials PE/ROE vs sector
- Hao 3 (Price): price change % vs 20-day MA, normalized
- Hao 4 (Foreign flow): foreign net buy/sell vs average
- Hao 5 (Sector): sector rotation score
- Hao 6 (Macro): composite macro σ-deviation

**Tests:** 281-hao-encoder.test.ts
- Score +0.8 → LAO_DUONG, binary=1, isChanging=true
- Score +0.5 → THIEU_DUONG, binary=1, isChanging=false
- Score -0.3 → THIEU_AM, binary=0, isChanging=false
- Score -0.9 → LAO_AM, binary=0, isChanging=true
- 6 scores encoded correctly

---

### Task 282: Nuclear + Transformed + NguHanh (pure domain)

```typescript
// nuclearComputer.ts
export function computeHoQue(hexLines: number[]): number; // hao 2-3-4 lower, 3-4-5 upper

// transformedComputer.ts
export function computeBienQue(haos: HaoReading[]): number; // flip Lao lines

// nguHanhClassifier.ts
export type NguHanh = 'Kim' | 'Moc' | 'Thuy' | 'Hoa' | 'Tho';
export type NguHanhDynamic = 'TUONG_SINH' | 'TUONG_KHAC' | 'SAME' | 'NEUTRAL';

const GENERATION: Record<NguHanh, NguHanh>; // Moc→Hoa→Tho→Kim→Thuy→Moc
const DESTRUCTION: Record<NguHanh, NguHanh>; // Moc→Tho→Thuy→Hoa→Kim→Moc

export function classifyNguHanh(lowerElement: NguHanh, upperElement: NguHanh): {
  dynamic: NguHanhDynamic;
  score: number; // +0.3 sinh, -0.3 khac, +0.1 same, 0 neutral
  interpretation: string; // Vietnamese
};
```

**Tests:** 282-nuclear-ngu-hanh.test.ts
- Ho que for Kien [1,1,1,1,1,1] = from hao 2-5 = [1,1,1,1] = Kien
- Ho que for Thai [1,1,1,0,0,0] = hao 2-3-4=[1,1,0] + 3-4-5=[1,0,0] = Doai/Chan
- Bien que: 2 Lao lines flip, others stay
- Moc sinh Hoa → TUONG_SINH +0.3
- Moc khac Tho → TUONG_KHAC -0.3
- Kim + Kim → SAME +0.1

---

### Task 283: Markov Transition Store + Backtest Engine

```typescript
// src/infrastructure/db/hexagramStore.ts
export function initHexagramTables(): void;
export function storeReading(reading: KinhDichReadingRow): void;
export function getLatestReading(code: string): KinhDichReadingRow | null;
export function recordTransition(from: number, to: number, code: string, priceChange5d?: number): void;
export function getTransitionProb(from: number, to: number, code: string): number;
export function getTopTransitions(from: number, topN?: number): TransitionRow[];
export function getReadingsForBacktest(code: string, days: number): BacktestRow[];
export function updateWinRate(from: number, to: number, code: string, won: boolean): void;

// src/domain/services/kinhDich/hexagramBacktester.ts
export interface BacktestResult {
  totalReadings: number;
  accuracy: number;          // % correct direction predictions
  avgReturn5d: number;
  bestHexagram: { number: number; name: string; winRate: number };
  worstHexagram: { number: number; name: string; winRate: number };
  bestTransition: { from: number; to: number; winRate: number; count: number };
}
export function computeBacktest(readings: BacktestRow[], prices: PriceRow[]): BacktestResult;
```

**Tests:** 283-markov-backtest.test.ts
- recordTransition increments count
- getTransitionProb returns correct probability
- Backtest with known data returns expected accuracy
- Empty matrix returns 0 probabilities

---

### Task 284: Reading Orchestrator + Formatter

```typescript
// src/domain/services/kinhDich/kinhDichReading.ts
export interface KinhDichReading {
  stockCode: string;
  timestamp: string;
  haos: HaoReading[];
  lowerTrigram: { name: string; element: NguHanh; symbol: string };
  upperTrigram: { name: string; element: NguHanh; symbol: string };
  queChiNh: { number: number; name: string; chinese: string; tradingSignal: string; confidence: number };
  hoQue: { number: number; name: string; chinese: string; theme: string };
  bienQue: { number: number; name: string; chinese: string; theme: string };
  nguHanh: { dynamic: NguHanhDynamic; score: number; interpretation: string };
  changingLines: number[];
  markov: { nextMostLikely: number; probability: number } | null;
  actionNote: string;        // MUA/BAN/GIU + reasoning
  overallReading: string;    // Vietnamese prose
}

export function computeReading(
  stockCode: string,
  scores: number[],        // 6 raw scores
  markovData?: MarkovData,
): KinhDichReading;
```

```typescript
// src/domain/services/kinhDich/kinhDichFormatter.ts
export function formatReading(reading: KinhDichReading): string;
// Vietnamese plain text output:
// === KINH DICH: VCB — Que Thai (11) ===
// Que chinh: Thai (Thuan Loi) | Ho que: ... | Bien que: ...
// 6 Hao: ...
// Ngu Hanh: ...
// KHUYEN NGHI: GIU / GIAM TY TRONG
```

**Tests:** 284-reading-orchestrator.test.ts
- computeReading produces valid KinhDichReading with all fields
- formatReading produces Vietnamese text with correct sections
- Changing lines correctly identified from Lao states

---

### Task 285: MCP Tools + Intelligence Cycle Wiring

6 MCP tools in `src/interface/mcp/tools/kinhDichTools.ts`:
- `get_kinhdich_reading(code)` — full reading
- `get_market_hexagram()` — VN-Index composite
- `get_hexagram_history(code, days?)` — timeline
- `get_transition_probabilities(hexagram_number)` — Markov top-N
- `run_hexagram_backtest(days?)` — accuracy report
- `explain_hexagram(number)` — full Vietnamese explanation

Intelligence cycle Step A4 (after A3b peer sync):
- For each watchlist stock: compute hao scores from DB data
- Call computeReading → store in kinhdich_readings
- Record transition vs previous reading
- Non-fatal, market-hours only

Conviction scorer: add kinhDich 6th dimension (15% weight)

**Tests:** 285-kinhdich-tools.test.ts
- get_kinhdich_reading returns valid formatted output
- explain_hexagram returns hexagram details for 1-64
- Tools registered in server.ts

---

### Task 286: Agent .md + CLAUDE.md + Restart

Update all agent prompts:
- Report Analyzer: "Call `get_kinhdich_reading(code)` — frame BCTC analysis with hexagram context"
- Market Watcher: "Call `get_kinhdich_reading(code)` when stock moves >2% — check if hexagram predicts reversal"
- Alert Commander: "Include hexagram state in CRITICAL alerts"
- Digest Writer: "Daily/weekly digest includes Kinh Dich section per stock"
- Update tool counts in all 9 agent files + README

---

## Dependency Chain

```
280 (hexagram library + resolver — pure static data)
  ├──→ 281 (hao encoder — signal → Lao/Thieu)
  ├──→ 282 (nuclear + transformed + NguHanh — pure computation)
  └──→ 283 (Markov store + backtest engine)
        └──→ 284 (reading orchestrator + formatter)
              └──→ 285 (MCP tools + cycle wiring + conviction)
                    └──→ 286 (agent .md + CLAUDE.md + restart)
```

280 is gating. 281, 282, 283 are parallel after 280.
284 needs 281+282+283. 285 needs 284. 286 is last.
