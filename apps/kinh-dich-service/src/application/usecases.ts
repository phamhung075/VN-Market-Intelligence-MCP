/**
 * Kinh Dich Service — Application Use Cases
 *
 * Orchestrates domain services + repository ports.
 * No direct I/O — only ports.
 */

import { computeReading, QUE_META } from '../domain/services.js';
import type { KinhDichRepositoryPort, PriceScorePort } from '../domain/repositories.js';
import type { ReadingRequest, ReadingResponse, MarketReadingResponse } from './dtos.js';
import { InsufficientDataError, HexagramNotFoundError } from '../domain/errors.js';

export class ReadingUseCase {
  constructor(
    private readonly repo: KinhDichRepositoryPort,
    private readonly priceScorePort: PriceScorePort,
  ) {}

  async execute(req: ReadingRequest): Promise<ReadingResponse> {
    const { stockCode, days = 30 } = req;
    const code = stockCode.toUpperCase();

    // Try to compute live reading from price scores first
    const scores = this.priceScorePort.computeScores(code, days);

    if (scores) {
      const markov = this.repo.getMarkovData(0); // 0 = placeholder, no hexagram known yet
      const reading = computeReading(code, scores, markov);
      return {
        stock: code,
        hexagram: reading.queChiNh.number,
        name: reading.queChiNh.name,
        trend: reading.queChiNh.trend,
        signal: reading.queChiNh.tradingSignal,
        confidence: reading.queChiNh.confidence,
        actionNote: reading.actionNote,
        overallReading: reading.overallReading,
        timestamp: reading.timestamp,
      };
    }

    // Fall back to stored reading
    const stored = this.repo.getLatestReading(code);
    if (!stored) {
      throw new HexagramNotFoundError(code);
    }

    // Build a minimal response from stored reading.
    // Use QUE_META to resolve the correct name for stored.hexagram_number — do NOT
    // compute a fresh reading with placeholder scores because the placeholder scores
    // always resolve to the same hexagram (not the stored one), causing the wrong name
    // to appear for every stock.
    const storedMeta = QUE_META.find((q) => q.id === stored.hexagram_number);
    const storedName = storedMeta?.name ?? `Que ${stored.hexagram_number}`;

    const markov = this.repo.getMarkovData(stored.hexagram_number);
    const fallbackScores = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]; // neutral placeholder
    const reading = computeReading(code, fallbackScores, markov);

    return {
      stock: code,
      hexagram: stored.hexagram_number,
      name: storedName,
      trend: reading.queChiNh.trend,
      signal: stored.trading_signal ?? reading.queChiNh.tradingSignal,
      confidence: stored.confidence ?? reading.queChiNh.confidence,
      actionNote: reading.actionNote,
      overallReading: reading.overallReading,
      timestamp: new Date().toISOString(),
    };
  }
}

export class MarketHexagramUseCase {
  constructor(
    private readonly repo: KinhDichRepositoryPort,
    private readonly priceScorePort: PriceScorePort,
  ) {}

  async execute(): Promise<MarketReadingResponse> {
    const code = 'VNINDEX';

    const scores = this.priceScorePort.computeScores(code, 30);
    if (!scores) {
      const stored = this.repo.getLatestReading(code);
      if (!stored) {
        throw new InsufficientDataError(code, 30);
      }
      return {
        hexagram: stored.hexagram_number,
        name: `Que ${stored.hexagram_number}`,
        trend: 'TRUNG TÍNH',
        signal: stored.trading_signal ?? 'GIU',
        confidence: stored.confidence ?? 0.5,
        timestamp: new Date().toISOString(),
      };
    }

    const reading = computeReading(code, scores);
    return {
      hexagram: reading.queChiNh.number,
      name: reading.queChiNh.name,
      trend: reading.queChiNh.trend,
      signal: reading.queChiNh.tradingSignal,
      confidence: reading.queChiNh.confidence,
      timestamp: reading.timestamp,
    };
  }
}
