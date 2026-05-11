# kinh-dich-service — Domain Model

## Core Types

### HaoState (I Ching line states)
```typescript
type HaoState = 'LAO_DUONG' | 'THIEU_DUONG' | 'THIEU_AM' | 'LAO_AM'
```

**Classification thresholds (score range [-1, 1]):**
- `> 0.75` → LAO_DUONG (strong yang, changing)
- `>= 0.10` → THIEU_DUONG (weak yang, stable)
- `< -0.75` → LAO_AM (strong yin, changing)
- else → THIEU_AM (weak yin, stable)

### NguHanh (Five Vietnamese Elements)
```typescript
type NguHanh = 'Kim' | 'Moc' | 'Thuy' | 'Hoa' | 'Tho'
type NguHanhDynamic = 'TUONG_SINH' | 'TUONG_KHAC' | 'SAME' | 'NEUTRAL'
```

**Generation cycle:** Moc→Hoa→Tho→Kim→Thuy→Moc
**Destruction cycle:** Moc→Tho→Thuy→Hoa→Kim→Moc

### HaoReading
```typescript
interface HaoReading {
  position: 1|2|3|4|5|6
  label: string
  rawScore: number
  state: HaoState
  binary: 0|1
  isChanging: boolean    // LAO_DUONG or LAO_AM
}
```

### KinhDichReading (complete reading)
```typescript
interface KinhDichReading {
  stockCode: string
  timestamp: string       // ISO
  haos: HaoReading[]      // 6 lines
  lowerTrigram: { name, element: NguHanh, symbol }
  upperTrigram: { name, element: NguHanh, symbol }
  queChiNh: {             // Main hexagram
    number: number        // 1-64
    name: string
    chinese: string
    coreMeaning: string
    trend: string
    tradingSignal: string
    confidence: number    // 0-1
  }
  hoQue: { number, name, chinese, coreMeaning }    // Nuclear hexagram
  bienQue: { number, name, chinese, coreMeaning }  // Transformed hexagram
  nguHanh: NguHanhResult
  changingLines: number[]
  markov: { nextMostLikely, nextName, probability } | null
  actionNote: string
  overallReading: string
}
```

## Embedded Data

### TRIGRAM_LINES (8 trigrams)
Binary patterns: Qian=[1,1,1], Kun=[0,0,0], etc.

### TRIGRAMS (8 with elements + symbols)
e.g., Qian={element:'Kim', symbol:'☰'}, Kun={element:'Tho', symbol:'☷'}

### QUE_META (64 hexagrams)
id 1-64 with name, Chinese char, upper/lower trigrams
e.g., id=1 Can(乾) upper:Qian lower:Qian, id=11 Thai(泰)

### QUE_DATA (64 entries)
coreMeaning, trend status, 6 lines each with outcome/action

## Domain Service Functions
- **File:** `apps/kinh-dich-service/src/domain/services.ts`

| Function | Input | Output |
|----------|-------|--------|
| `classifyHao(score)` | number [-1,1] | HaoState |
| `encodeHaos(scores)` | number[6] | HaoReading[] |
| `haosToSignals(haos)` | HaoReading[] | number[6] (binary) |
| `resolveHexagram(signals)` | number[6] | hexagram ID (1-64) |
| `computeHoQue(signals)` | number[6] | nuclear hexagram ID |
| `computeBienQue(haos)` | HaoReading[] | transformed hexagram ID |
| `classifyNguHanh(lower, upper)` | NguHanh, NguHanh | NguHanhResult |
| `computeReading(stockCode, scores, markov?)` | string, number[6] | KinhDichReading |

### Trading Signal Logic
- Outcome scores: CAT=0.3, HUNG=-0.3, VO CUU=0.0, HOI=-0.15, LAN=-0.2, LE=-0.1
- Trend scores: THUAN LOI=0.5, BAT LOI=-0.5, TRUNG TINH=0.0
- Actions: TIEN→MUA, LUI→BAN, GIU→GIU, CHO→CHO, THAN→THAN TRONG
- Majority vote determines final signal

### Confidence Formula
```
confidence = min(abs(combinedScore)/0.8, 1.0) * 0.7 + markovProbability * 0.3
```

## Repository Ports

### KinhDichRepositoryPort
```typescript
getLatestReading(stockCode: string): KinhDichStoredRow | null
getMarkovData(hexagramNumber: number): MarkovData | null
```

### PriceScorePort
```typescript
computeScores(stockCode: string, days: number): number[] | null
// Returns 6 normalized scores [-1, 1] or null
```
