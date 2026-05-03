// apps/mcp-server/src/domain/repositories/IHexagramRepository.ts
// Task 1838b — Domain port for hexagram reading and transition data.
// ZERO imports from infrastructure/.

export interface KinhDichReadingRow {
  stockCode: string;
  hexagramNumber: number;
  hoQueNumber: number;
  bienQueNumber: number;
  haoStates: string;
  rawScores: string;
  nguHanhDynamic?: string;
  tradingSignal?: string;
  confidence?: number;
  actionNote?: string;
  source?: 'manual' | 'cycle';
}

export interface TransitionRow {
  fromHexagram: number;
  toHexagram: number;
  count: number;
}

export interface IHexagramRepository {
  storeReading(row: KinhDichReadingRow): void;
  getLatestReading(stockCode: string): KinhDichReadingRow | null;
  recordTransition(stockCode: string, fromHexagram: number, toHexagram: number): void;
  getTopTransitions(stockCode: string, fromHexagram: number, topN: number): TransitionRow[];
  getReadingsForBacktest(stockCode: string): KinhDichReadingRow[];
}
