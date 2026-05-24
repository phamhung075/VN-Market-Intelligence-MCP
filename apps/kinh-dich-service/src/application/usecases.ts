/**
 * Kinh Dich Service — Application Use Cases
 *
 * Orchestrates reading_composer module + repository ports.
 * No direct I/O — only ports.
 *
 * P2-KD-F: Rewired from domain/services.ts computeReading() to
 * reading_composer composeReading() per G5a handoff.
 * QUE_META sourced from domain/hexagram-data.ts (thin data module).
 */

import { composeReading, type ReadingComposerDependencies } from '../module/reading_composer/index.js';
import { QUE_META } from '../domain/hexagram-data.js';
import type { KinhDichRepositoryPort, PriceScorePort } from '../domain/repositories.js';
import type { ReadingRequest, ReadingResponse, MarketReadingResponse } from './dtos.js';
import { InsufficientDataError, HexagramNotFoundError } from '../domain/errors.js';

export class ReadingUseCase {
  constructor(
    private readonly repo: KinhDichRepositoryPort,
    private readonly priceScorePort: PriceScorePort,
    private readonly composerDeps: ReadingComposerDependencies,
  ) {}

  async execute(req: ReadingRequest): Promise<ReadingResponse> {
    const { stockCode, days = 30 } = req;
    const code = stockCode.toUpperCase();

    // Try to compute live reading from price scores first
    const scores = this.priceScorePort.computeScores(code, days);

    if (scores) {
      const reading = await composeReading(code, scores, this.composerDeps);
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

    const fallbackScores = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]; // neutral placeholder
    const reading = await composeReading(code, fallbackScores, this.composerDeps);

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
    private readonly composerDeps: ReadingComposerDependencies,
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

    const reading = await composeReading(code, scores, this.composerDeps);
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
