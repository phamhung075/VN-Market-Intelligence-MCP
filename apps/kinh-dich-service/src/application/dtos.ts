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
