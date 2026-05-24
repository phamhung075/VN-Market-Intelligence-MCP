/**
 * Kinh Dich Service — Domain Models
 *
 * Pure types. No I/O, no infrastructure imports.
 */

export type HaoState = 'LAO_DUONG' | 'THIEU_DUONG' | 'THIEU_AM' | 'LAO_AM';

export type NguHanh = 'Kim' | 'Moc' | 'Thuy' | 'Hoa' | 'Tho';

export type NguHanhDynamic =
  | 'TUONG_SINH'
  | 'TUONG_KHAC'
  | 'SAME'
  | 'NEUTRAL';

export interface HaoReading {
  position: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  rawScore: number;
  state: HaoState;
  binary: 0 | 1;
  isChanging: boolean;
}

export interface NguHanhResult {
  lower: NguHanh;
  upper: NguHanh;
  dynamic: NguHanhDynamic;
  score: number;
  interpretation: string;
}

export interface MarkovData {
  nextMostLikely: number;
  nextName: string;
  probability: number;
}

export interface KinhDichReading {
  stockCode: string;
  timestamp: string;
  haos: HaoReading[];
  lowerTrigram: { name: string; element: NguHanh; symbol: string };
  upperTrigram: { name: string; element: NguHanh; symbol: string };
  queChiNh: {
    number: number;
    name: string;
    chinese: string;
    coreMeaning: string;
    trend: string;
    tradingSignal: string;
    confidence: number;
  };
  hoQue: { number: number; name: string; chinese: string; coreMeaning: string };
  bienQue: { number: number; name: string; chinese: string; coreMeaning: string };
  nguHanh: NguHanhResult;
  changingLines: number[];
  markov: {
    nextMostLikely: number;
    nextName: string;
    probability: number;
  } | null;
  actionNote: string;
  overallReading: string;
}

/** Stored row shape from kinhdich_readings table */
export interface KinhDichStoredRow {
  hexagram_number: number;
  bien_que_number: number;
  trading_signal: string | null;
  confidence: number | null;
}
