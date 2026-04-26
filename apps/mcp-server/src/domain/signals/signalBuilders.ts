/**
 * Signal Builders — Task 1295a
 *
 * Fluent API builder classes for type-safe signal construction.
 * Each builder enforces required fields via TypeScript type system
 * and Zod validation on build().
 *
 * Builders:
 *   - ChainCatalystBuilder: 7 required fields (event_type, direction, confidence, affected_stocks, affected_sectors, headline, source)
 *   - PriceConfirmationBuilder: 5 required fields (price_change_pct, volume_ratio, confirms_direction, fully_priced, confidence)
 *   - UrgentNewsBuilder: 3 required fields (headline, source, severity)
 *   - CrossValidateBuilder: 3 required fields (direction, confidence, summary)
 *
 * All builders use Zod schemas from signalTypes.ts for validation.
 */

import {
  ChainCatalystFindingDataSchema,
  PriceConfirmationFindingDataSchema,
  UrgentNewsFindingDataSchema,
  CrossValidateFindingDataSchema,
  type ChainCatalystFindingData,
  type PriceConfirmationFindingData,
  type UrgentNewsFindingData,
  type CrossValidateFindingData,
} from "./signalTypes";

// ── ChainCatalystBuilder ───────────────────────────────────────────────────────

/**
 * Fluent API interface for building ChainCatalyst signals.
 * Requires: event_type, direction, confidence, affected_stocks, affected_sectors, headline, source
 * Optional (Task SIGNAL-PAYLOAD-MISSING-FIELDS): newsSentiment, kinhDichConfidence, agentSignalsMajority
 */
export interface ChainCatalystBuilder {
  setEventType(
    type:
      | "credit_policy"
      | "trade_war"
      | "earnings"
      | "macro"
      | "legal"
      | "crisis"
      | "sector_event"
  ): this;
  setDirection(direction: "bullish" | "bearish" | "neutral"): this;
  setConfidence(confidence: number): this;
  addStock(code: string): this;
  addSector(sector: string): this;
  setHeadline(headline: string): this;
  setSource(source: string): this;
  /** Aggregated news sentiment score [-1.0, 1.0]. Used by Alert Commander 4-AND conviction validation. */
  setNewsSentiment(score: number): this;
  /** Kinh Dich hexagram confidence [0, 100]. Used by Alert Commander 4-AND conviction validation. */
  setKinhDichConfidence(score: number): this;
  /** Majority vote from agent signals: "BUY" | "SELL" | "NEUTRAL". Used by Alert Commander 4-AND conviction validation. */
  setAgentSignalsMajority(majority: "BUY" | "SELL" | "NEUTRAL"): this;
  /** Stock ticker that triggered the originating cascade event (e.g. "VCB"). For cascade enrichment traceability. */
  setCatalystStockCode(code: string): this;
  /** Directional bias of the originating cascade catalyst signal. */
  setCatalystDirection(direction: "bullish" | "bearish" | "neutral"): this;
  /** Hours elapsed from catalyst event to confirmed price move (must be >= 0). */
  setTimeToPriceMove(hours: number): this;
  build(): ChainCatalystFindingData;
}

class ChainCatalystBuilderImpl implements ChainCatalystBuilder {
  // Use Omit to exclude optional fields that need explicit typing under exactOptionalPropertyTypes
  private data: Omit<Partial<ChainCatalystFindingData>, "imfSentiment" | "catalyst_stock_code" | "catalyst_direction" | "time_to_price_move"> & {
    newsSentiment?: number;
    kinhDichConfidence?: number;
    agentSignalsMajority?: "BUY" | "SELL" | "NEUTRAL";
    catalyst_stock_code?: string;
    catalyst_direction?: "bullish" | "bearish" | "neutral";
    time_to_price_move?: number;
  } = {
    affected_stocks: [],
    affected_sectors: [],
  };

  setEventType(
    type:
      | "credit_policy"
      | "trade_war"
      | "earnings"
      | "macro"
      | "legal"
      | "crisis"
      | "sector_event"
  ): this {
    this.data.event_type = type;
    return this;
  }

  setDirection(direction: "bullish" | "bearish" | "neutral"): this {
    this.data.direction = direction;
    return this;
  }

  setConfidence(confidence: number): this {
    this.data.confidence = confidence;
    return this;
  }

  addStock(code: string): this {
    if (this.data.affected_stocks) {
      this.data.affected_stocks.push(code);
    }
    return this;
  }

  addSector(sector: string): this {
    if (this.data.affected_sectors) {
      this.data.affected_sectors.push(sector);
    }
    return this;
  }

  setHeadline(headline: string): this {
    this.data.headline = headline;
    return this;
  }

  setSource(source: string): this {
    this.data.source = source;
    return this;
  }

  setNewsSentiment(score: number): this {
    this.data.newsSentiment = score;
    return this;
  }

  setKinhDichConfidence(score: number): this {
    this.data.kinhDichConfidence = score;
    return this;
  }

  setAgentSignalsMajority(majority: "BUY" | "SELL" | "NEUTRAL"): this {
    this.data.agentSignalsMajority = majority;
    return this;
  }

  setCatalystStockCode(code: string): this {
    this.data.catalyst_stock_code = code;
    return this;
  }

  setCatalystDirection(direction: "bullish" | "bearish" | "neutral"): this {
    this.data.catalyst_direction = direction;
    return this;
  }

  setTimeToPriceMove(hours: number): this {
    this.data.time_to_price_move = hours;
    return this;
  }

  build(): ChainCatalystFindingData {
    return ChainCatalystFindingDataSchema.parse(this.data);
  }
}

export function createChainCatalystBuilder(): ChainCatalystBuilder {
  return new ChainCatalystBuilderImpl();
}

// ── PriceConfirmationBuilder ───────────────────────────────────────────────────

/**
 * Fluent API interface for building PriceConfirmation signals.
 * Requires: price_change_pct, volume_ratio, confirms_direction, fully_priced, confidence
 */
export interface PriceConfirmationBuilder {
  setPriceChangePct(pct: number): this;
  setVolumeRatio(ratio: number): this;
  setConfirmsDirection(confirms: boolean): this;
  setFullyPriced(fully_priced: boolean): this;
  setConfidence(confidence: number): this;
  setCatalystStockCode(code: string): this;
  setCatalystDirection(direction: "BUY" | "SELL" | "NEUTRAL"): this;
  setTimeToPriceMove(hours: number): this;
  build(): PriceConfirmationFindingData;
}

class PriceConfirmationBuilderImpl implements PriceConfirmationBuilder {
  private data: Partial<PriceConfirmationFindingData> = {};

  setPriceChangePct(pct: number): this {
    this.data.price_change_pct = pct;
    return this;
  }

  setVolumeRatio(ratio: number): this {
    this.data.volume_ratio = ratio;
    return this;
  }

  setConfirmsDirection(confirms: boolean): this {
    this.data.confirms_direction = confirms;
    return this;
  }

  setFullyPriced(fully_priced: boolean): this {
    this.data.fully_priced = fully_priced;
    return this;
  }

  setConfidence(confidence: number): this {
    this.data.confidence = confidence;
    return this;
  }

  setCatalystStockCode(code: string): this {
    this.data.catalyst_stock_code = code;
    return this;
  }

  setCatalystDirection(direction: "BUY" | "SELL" | "NEUTRAL"): this {
    this.data.catalyst_direction = direction;
    return this;
  }

  setTimeToPriceMove(hours: number): this {
    this.data.time_to_price_move = hours;
    return this;
  }

  build(): PriceConfirmationFindingData {
    return PriceConfirmationFindingDataSchema.parse(this.data) as PriceConfirmationFindingData;
  }
}

export function createPriceConfirmationBuilder(): PriceConfirmationBuilder {
  return new PriceConfirmationBuilderImpl();
}

// ── UrgentNewsBuilder ──────────────────────────────────────────────────────────

/**
 * Fluent API interface for building UrgentNews signals.
 * Requires: headline, source, severity
 */
export interface UrgentNewsBuilder {
  setHeadline(headline: string): this;
  setSource(source: string): this;
  setSeverity(severity: "low" | "medium" | "high" | "critical"): this;
  setCatalystStockCode(code: string): this;
  setCatalystDirection(direction: "bullish" | "bearish" | "neutral"): this;
  setTimeToPriceMove(hours: number): this;
  build(): UrgentNewsFindingData;
}

class UrgentNewsBuilderImpl implements UrgentNewsBuilder {
  private data: Omit<Partial<UrgentNewsFindingData>, "catalyst_stock_code" | "catalyst_direction" | "time_to_price_move"> & {
    catalyst_stock_code?: string;
    catalyst_direction?: "bullish" | "bearish" | "neutral";
    time_to_price_move?: number;
  } = {};

  setHeadline(headline: string): this {
    this.data.headline = headline;
    return this;
  }

  setSource(source: string): this {
    this.data.source = source;
    return this;
  }

  setSeverity(severity: "low" | "medium" | "high" | "critical"): this {
    this.data.severity = severity;
    return this;
  }

  setCatalystStockCode(code: string): this {
    this.data.catalyst_stock_code = code;
    return this;
  }

  setCatalystDirection(direction: "bullish" | "bearish" | "neutral"): this {
    this.data.catalyst_direction = direction;
    return this;
  }

  setTimeToPriceMove(hours: number): this {
    this.data.time_to_price_move = hours;
    return this;
  }

  build(): UrgentNewsFindingData {
    return UrgentNewsFindingDataSchema.parse(this.data) as UrgentNewsFindingData;
  }
}

export function createUrgentNewsBuilder(): UrgentNewsBuilder {
  return new UrgentNewsBuilderImpl();
}

// ── CrossValidateBuilder ───────────────────────────────────────────────────────

/**
 * Fluent API interface for building CrossValidate signals.
 * Requires: direction, confidence, summary
 */
export interface CrossValidateBuilder {
  setDirection(direction: "bullish" | "bearish" | "neutral"): this;
  setConfidence(confidence: number): this;
  setSummary(summary: string): this;
  build(): CrossValidateFindingData;
}

class CrossValidateBuilderImpl implements CrossValidateBuilder {
  private data: Partial<CrossValidateFindingData> = {};

  setDirection(direction: "bullish" | "bearish" | "neutral"): this {
    this.data.direction = direction;
    return this;
  }

  setConfidence(confidence: number): this {
    this.data.confidence = confidence;
    return this;
  }

  setSummary(summary: string): this {
    this.data.summary = summary;
    return this;
  }

  build(): CrossValidateFindingData {
    return CrossValidateFindingDataSchema.parse(this.data);
  }
}

export function createCrossValidateBuilder(): CrossValidateBuilder {
  return new CrossValidateBuilderImpl();
}
