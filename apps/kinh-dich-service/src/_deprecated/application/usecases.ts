/**
 * Kinh Dich Service — Application Use Cases
 *
 * Orchestrates reading_composer module + repository ports.
 * No direct I/O — only ports.
 *
 * P2-KD-F: Rewired from domain/services.ts computeReading() to
 * reading_composer composeReading() per G5a handoff.
 * QUE_META sourced from domain/hexagram-data.ts (thin data module).
 * P2-KD-G: Added 4 new use cases for history, transitions, backtest, explain.
 */

import { composeReading, type ReadingComposerDependencies } from '../module/reading_composer/index.js';
import { QUE_META } from '../domain/hexagram-data.js';
import type { KinhDichRepositoryPort, PriceScorePort } from '../domain/repositories.js';
import type {
  ReadingRequest,
  ReadingResponse,
  MarketReadingResponse,
  HistoryRequest,
  HistoryResponse,
  TransitionsRequest,
  TransitionsResponse,
  BacktestRequest,
  BacktestResponse,
  ExplainRequest,
  ExplainResponse,
} from './dtos.js';
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

// ─── P2-KD-G: 4 new use cases ─────────────────────────────────────────────────

export class ReadingHistoryUseCase {
  constructor(private readonly repo: KinhDichRepositoryPort) {}

  execute(req: HistoryRequest): HistoryResponse {
    const code = req.stockCode.toUpperCase();
    const days = req.days ?? 30;
    const rows = this.repo.getReadingsHistory(code, days);

    // Most frequent hexagram
    const counts = new Map<number, number>();
    for (const r of rows) {
      counts.set(r.hexagram_number, (counts.get(r.hexagram_number) ?? 0) + 1);
    }
    let mostFrequent = 'N/A';
    if (counts.size > 0) {
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) {
        const meta = QUE_META.find((q) => q.id === top[0]);
        mostFrequent = `Que ${top[0]} ${meta?.name ?? ''} (${top[1]} lan)`;
      }
    }

    return {
      stock: code,
      days,
      total: rows.length,
      readings: rows.map((r) => {
        const meta = QUE_META.find((q) => q.id === r.hexagram_number);
        return {
          timestamp: r.timestamp,
          hexagram: r.hexagram_number,
          name: meta?.name ?? `Que ${r.hexagram_number}`,
          signal: r.trading_signal ?? 'GIU',
          confidence: r.confidence ?? 0,
        };
      }),
      mostFrequent,
    };
  }
}

export class HexagramTransitionsUseCase {
  constructor(private readonly repo: KinhDichRepositoryPort) {}

  execute(req: TransitionsRequest): TransitionsResponse {
    const fromHexagram = req.hexagramNumber;
    const stock = req.stockCode?.toUpperCase() ?? 'VNINDEX';
    const topN = req.topN ?? 10;

    const fromMeta = QUE_META.find((q) => q.id === fromHexagram);
    const transitions = this.repo.getTopTransitions(fromHexagram, stock, topN);

    return {
      hexagram: fromHexagram,
      name: fromMeta?.name ?? `Que ${fromHexagram}`,
      stock,
      transitions: transitions.map((t) => {
        const toMeta = QUE_META.find((q) => q.id === t.to_hexagram);
        return {
          toHexagram: t.to_hexagram,
          name: toMeta?.name ?? `Que ${t.to_hexagram}`,
          probability: t.probability,
          count: t.count,
        };
      }),
    };
  }
}

export class HexagramBacktestUseCase {
  constructor(private readonly repo: KinhDichRepositoryPort) {}

  execute(req: BacktestRequest): BacktestResponse {
    const code = req.stockCode.toUpperCase();
    const days = req.days ?? 30;
    const readings = this.repo.getReadingsHistory(code, days);
    const prices = this.repo.getPriceHistory(code, days);

    if (readings.length === 0) {
      return {
        stock: code,
        days,
        totalReadings: 0,
        accuracy: 0,
        avgReturn5d: 0,
        bestHexagram: null,
        worstHexagram: null,
      };
    }

    // Simple accuracy: BUY → next price up, SELL → next price down
    let correct = 0;
    let directional = 0;
    let totalReturn = 0;
    let returnCount = 0;
    const hexWinMap = new Map<number, { wins: number; total: number }>();

    for (const r of readings) {
      const signal = (r.trading_signal ?? '').toUpperCase();
      if (!signal.includes('MUA') && !signal.includes('BAN')) continue;

      // Find price at timestamp + 5d
      const rTime = new Date(r.timestamp).getTime();
      const entryPrice = findNearestPrice(prices, rTime);
      const exitPrice = findNearestPrice(prices, rTime + 5 * 24 * 60 * 60 * 1000);

      if (entryPrice === null || exitPrice === null || entryPrice === 0) continue;

      const ret = (exitPrice - entryPrice) / entryPrice;
      totalReturn += ret;
      returnCount++;

      const isBuy = signal.includes('MUA');
      const priceUp = ret > 0;
      const isCorrect = isBuy ? priceUp : !priceUp;

      if (isCorrect) correct++;
      directional++;

      const entry = hexWinMap.get(r.hexagram_number) ?? { wins: 0, total: 0 };
      entry.total++;
      if (isCorrect) entry.wins++;
      hexWinMap.set(r.hexagram_number, entry);
    }

    // Best/worst hexagrams by win rate (min 2 samples)
    let bestHexagram: BacktestResponse['bestHexagram'] = null;
    let worstHexagram: BacktestResponse['worstHexagram'] = null;

    for (const [hexNum, stats] of hexWinMap) {
      if (stats.total < 2) continue;
      const winRate = stats.wins / stats.total;
      const meta = QUE_META.find((q) => q.id === hexNum);
      const name = meta?.name ?? `Que ${hexNum}`;

      if (!bestHexagram || winRate > bestHexagram.winRate) {
        bestHexagram = { number: hexNum, name, winRate, count: stats.total };
      }
      if (!worstHexagram || winRate < worstHexagram.winRate) {
        worstHexagram = { number: hexNum, name, winRate, count: stats.total };
      }
    }

    return {
      stock: code,
      days,
      totalReadings: readings.length,
      accuracy: directional > 0 ? correct / directional : 0,
      avgReturn5d: returnCount > 0 ? totalReturn / returnCount : 0,
      bestHexagram,
      worstHexagram,
    };
  }
}

function findNearestPrice(prices: Array<{ price: number; timestamp: string }>, targetMs: number): number | null {
  if (prices.length === 0) return null;
  let nearest: { price: number; timestamp: string } | null = null;
  let minDiff = Infinity;
  for (const p of prices) {
    const diff = Math.abs(new Date(p.timestamp).getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = p;
    }
  }
  return nearest?.price ?? null;
}

export class HexagramExplainUseCase {
  execute(req: ExplainRequest): ExplainResponse {
    const { hexagramNumber } = req;
    const meta = QUE_META.find((q) => q.id === hexagramNumber);
    if (!meta) {
      throw new HexagramNotFoundError(String(hexagramNumber));
    }

    // Derive trading context from basic hexagram positioning
    // Even hexagrams tend toward stability (GIU), odd toward change (MUA/BAN)
    // This is a lightweight interpretation; full QUE_DATA lives in mcp-server
    const isYang = hexagramNumber % 2 === 1;
    const tradingContext = isYang
      ? 'Nhận định giao dịch: Dương quẻ — xu hướng tích cực, xem xét MUA'
      : 'Nhận định giao dịch: Âm quẻ — xu hướng thận trọng, GIỮ hoặc BÁN';

    return {
      number: hexagramNumber,
      name: meta.name,
      chinese: meta.chinese,
      upper: meta.upper,
      lower: meta.lower,
      coreMeaning: `Quẻ ${hexagramNumber} — ${meta.name} (${meta.chinese}): Thượng quán ${meta.upper}, Hạ quán ${meta.lower}`,
      trend: isYang ? 'THUẬN LỢI' : 'CẦN THẬN TRỌNG',
      tradingContext,
    };
  }
}
