/**
 * @vn-market/shared-types
 *
 * Inter-service contracts for VN Market Intelligence microservices.
 * Used as the single source of truth for request/response shapes
 * across TypeScript, Python (via JSON schema), and Go (via OpenAPI).
 *
 * Phases 1–3 will add additional types as services are extracted.
 */

// ============= Alert =============
export interface Alert {
  id: string;
  stock: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  createdAt: Date;
}

// ============= Signal =============
export interface Signal {
  stock: string;
  type: 'price_drop' | 'price_surge' | 'news' | 'fundamental';
  confidence: number;    // 0-1
  metadata?: Record<string, unknown>;
}

// ============= PDF Extraction =============
export interface ExtractPDFRequest {
  url: string;
  sourceType: 'bctc' | 'weather' | 'utility_bill';
}

export interface ExtractPDFResponse {
  documentId: string;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  textContent: string;
  ocrConfidence: number;
  status: 'success' | 'failed';
}

// ============= Technical Analysis =============
export interface ComputeTARequest {
  code: string;
  days: number;
}

export interface ComputeTAResponse {
  code: string;
  rsi: number;
  macd: { line: number; signal: number; histogram: number };
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

// ============= RAG Search =============
export interface SearchRequest {
  query: string;
  limit: number;
  decayHalfLifeDays: number;
}

export interface SearchResult {
  analysisId: string;
  content: string;
  similarity: number;    // 0-1
  ageHours: number;
  recencyScore: number;  // after temporal decay
}

// ============= Health =============
export interface ServiceHealth {
  service: string;
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptimeSeconds: number;
}
