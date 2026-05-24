/**
 * Kinh Dich Service — Application DTOs
 */

export interface ReadingRequest {
  stockCode: string;
  days?: number;
}

export interface ReadingResponse {
  stock: string;
  hexagram: number;
  name: string;
  trend: string;
  signal: string;
  confidence: number;
  actionNote: string;
  overallReading: string;
  timestamp: string;
}

export interface MarketReadingResponse {
  hexagram: number;
  name: string;
  trend: string;
  signal: string;
  confidence: number;
  timestamp: string;
}

// ─── 4 new endpoint DTOs (P2-KD-G) ────────────────────────────────────────────

export interface HistoryRequest {
  stockCode: string;
  days?: number;
}

export interface HistoryEntryDTO {
  timestamp: string;
  hexagram: number;
  name: string;
  signal: string;
  confidence: number;
}

export interface HistoryResponse {
  stock: string;
  days: number;
  total: number;
  readings: HistoryEntryDTO[];
  mostFrequent: string;
}

export interface TransitionsRequest {
  hexagramNumber: number;
  stockCode?: string;
  topN?: number;
}

export interface TransitionEntryDTO {
  toHexagram: number;
  name: string;
  probability: number;
  count: number;
}

export interface TransitionsResponse {
  hexagram: number;
  name: string;
  stock: string;
  transitions: TransitionEntryDTO[];
}

export interface BacktestRequest {
  stockCode: string;
  days?: number;
}

export interface BacktestResponse {
  stock: string;
  days: number;
  totalReadings: number;
  accuracy: number;
  avgReturn5d: number;
  bestHexagram: { number: number; name: string; winRate: number; count: number } | null;
  worstHexagram: { number: number; name: string; winRate: number; count: number } | null;
}

export interface ExplainRequest {
  hexagramNumber: number;
}

export interface ExplainResponse {
  number: number;
  name: string;
  chinese: string;
  upper: string;
  lower: string;
  coreMeaning: string;
  trend: string;
  tradingContext: string;
}
