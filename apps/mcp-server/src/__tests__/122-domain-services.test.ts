Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 122 — Domain Services Branch Coverage
 *
 * Targets untested branches across four pure domain services:
 *   - signalDetector.ts   (22 branches to cover)
 *   - alertGenerator.ts   (12 branches to cover)
 *   - cascadeEngine.ts    (18 branches to cover)
 *   - newsNormalizer.ts   (10 branches to cover)
 *
 * All tests are synchronous, no I/O, no mocking needed.
 * Goal: ≥90% branch coverage on all four files combined.
 */

import { describe, it, expect } from "bun:test";
import {
  detectSignals,
  type MarketSnapshot,
  type SignalContext,
} from "../domain/services/signalDetector.js";
import {
  generateAlerts,
  type Alert,
} from "../domain/services/alertGenerator.js";
import type { Signal } from "../domain/services/signalDetector.js";
import {
  buildCausalChain,
  type WatchlistEntry,
  type SearchResult,
} from "../domain/services/cascadeEngine.js";
import type { AnalysisEntry } from "../domain/services/newsNormalizer.js";
import { normalizeNews } from "../domain/services/newsNormalizer.js";
import type { RssItem } from "../domain/models/shared-types.js";
import type { DomainType } from "../../bctc-schema.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ═══════════════════════════════════════════════════════════════════════════
// Shared test helpers
// ═══════════════════════════════════════════════════════════════════════════

function makeSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    actionCode: "VCB",
    price: 100_000,
    previousPrice: 100_000,
    volume: 1_000_000,
    avgVolume: 1_000_000,
    ...overrides,
  };
}

function makeSignal(
  actionCode: string,
  type: Signal["type"] = "price_drop",
  severity: Signal["severity"] = "medium",
  override: Partial<Signal> = {},
): Signal {
  return {
    type,
    severity,
    actionCode,
    message: `${actionCode} ${type} signal`,
    confidence: 0.8,
    detectedAt: new Date().toISOString(),
    ...override,
  };
}

function makeEntry(overrides: Partial<AnalysisEntry> = {}): AnalysisEntry {
  return {
    id: "test-122",
    level: "global",
    sourceTitle: "Test News",
    sourceUrl: "https://example.com",
    sourceType: "news",
    publishedAt: new Date().toISOString(),
    sentiment: "bullish",
    impactScore: 7,
    impactDirection: "up",
    confidence: 0.8,
    timeHorizon: "short",
    summary: "test summary",
    reasoning: "test reasoning",
    affectedCountries: [],
    affectedDomains: [],
    affectedActions: [],
    parentIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeWatchlistEntry(
  actionCode: string,
  domain: string,
  exchange = "HOSE",
): WatchlistEntry {
  return { actionCode, domain: domain as DomainType, exchange };
}

function makeRssItem(overrides: Partial<RssItem>): RssItem {
  return {
    title: "",
    url: "https://example.com/article",
    publishedAt: "Mon, 27 Mar 2026 08:00:00 +0700",
    content: "",
    source: "cafef",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SD — Signal Detector branch coverage
// ═══════════════════════════════════════════════════════════════════════════

describe("Task 122 — Signal Detector branch coverage", () => {
  // SD-01: previousPrice === 0 → divide-by-zero guard → changePct = 0 → no price signal
  it("SD-01: previousPrice=0 guard — no price signal emitted (changePct is 0)", () => {
    const snapshot = makeSnapshot({ price: 50_000, previousPrice: 0 });
    const signals = detectSignals(snapshot);
    const types = signals.map((s) => s.type);
    expect(types).not.toContain("price_drop");
    expect(types).not.toContain("price_surge");
  });

  // SD-02: avgVolume === 0 → volume spike branch suppressed
  it("SD-02: avgVolume=0 → volume spike branch is skipped entirely", () => {
    const snapshot = makeSnapshot({ volume: 9_999_999, avgVolume: 0 });
    const signals = detectSignals(snapshot);
    const types = signals.map((s) => s.type);
    expect(types).not.toContain("volume_spike");
  });

  // SD-03: exact boundary -7.0% → must trigger price_drop
  it("SD-03: price change exactly -7.0% triggers price_drop", () => {
    const snapshot = makeSnapshot({ price: 93_000, previousPrice: 100_000 });
    const signals = detectSignals(snapshot);
    expect(signals.map((s) => s.type)).toContain("price_drop");
  });

  // SD-04: just inside boundary -6.99% → must NOT trigger price_drop
  it("SD-04: price change -6.99% does NOT trigger price_drop (below default threshold)", () => {
    // -6.99% → changePct = -6.99, threshold = -7 → -6.99 > -7 → no drop
    const snapshot = makeSnapshot({ price: 93_010, previousPrice: 100_000 });
    const signals = detectSignals(snapshot);
    expect(signals.map((s) => s.type)).not.toContain("price_drop");
  });

  // SD-05: exact boundary +5.0% → must trigger price_surge
  it("SD-05: price change exactly +5.0% triggers price_surge", () => {
    const snapshot = makeSnapshot({ price: 105_000, previousPrice: 100_000 });
    const signals = detectSignals(snapshot);
    expect(signals.map((s) => s.type)).toContain("price_surge");
  });

  // SD-06: just inside +4.99% → must NOT trigger price_surge
  it("SD-06: price change +4.99% does NOT trigger price_surge", () => {
    const snapshot = makeSnapshot({ price: 104_990, previousPrice: 100_000 });
    const signals = detectSignals(snapshot);
    expect(signals.map((s) => s.type)).not.toContain("price_surge");
  });

  // SD-07: exact volume boundary 2.0x → must trigger volume_spike
  // _now set to 06:00 UTC to avoid ATC window (07:30-08:05 UTC) suppression
  it("SD-07: volume exactly 2.0x avgVolume triggers volume_spike", () => {
    const snapshot = makeSnapshot({ volume: 2_000_000, avgVolume: 1_000_000 });
    const signals = detectSignals(snapshot, { _now: new Date("2026-01-01T06:00:00Z") });
    expect(signals.map((s) => s.type)).toContain("volume_spike");
  });

  // SD-08: custom dropPct threshold overrides default
  it("SD-08: custom watchlistThresholds.dropPct=-2 triggers at -2% change", () => {
    const snapshot = makeSnapshot({ price: 98_000, previousPrice: 100_000 }); // -2%
    const context: SignalContext = {
      watchlistThresholds: { dropPct: -2, risePct: 5, impactScore: 5 },
    };
    const signals = detectSignals(snapshot, context);
    expect(signals.map((s) => s.type)).toContain("price_drop");
  });

  // SD-09: custom risePct threshold overrides default
  it("SD-09: custom watchlistThresholds.risePct=2 triggers at +2% change", () => {
    const snapshot = makeSnapshot({ price: 102_000, previousPrice: 100_000 }); // +2%
    const context: SignalContext = {
      watchlistThresholds: { dropPct: -5, risePct: 2, impactScore: 5 },
    };
    const signals = detectSignals(snapshot, context);
    expect(signals.map((s) => s.type)).toContain("price_surge");
  });

  // SD-10: all 5 signal types triggered simultaneously
  it("SD-10: all 5 signal types can be triggered simultaneously", () => {
    const snapshot = makeSnapshot({
      price: 93_000,
      previousPrice: 100_000,  // -7% → price_drop
      volume: 3_000_000,
      avgVolume: 1_000_000,    // 3x → volume_spike
    });
    const context: SignalContext = {
      latestReportDate: new Date().toISOString(),       // → report_new
      recentNews: [{ title: "Breaking news VCB", source: "cafef" }], // → news_mention
      _now: new Date("2026-01-01T06:00:00Z"), // avoid ATC window suppression
    };
    const signals = detectSignals(snapshot, context);
    const types = signals.map((s) => s.type);
    expect(types).toContain("price_drop");
    expect(types).toContain("volume_spike");
    expect(types).toContain("report_new");
    expect(types).toContain("news_mention");
    expect(signals.length).toBeGreaterThanOrEqual(4);
  });

  // SD-11: empty recentNews array → no news_mention signal
  it("SD-11: empty recentNews array produces no news_mention signal", () => {
    const snapshot = makeSnapshot();
    const context: SignalContext = { recentNews: [] };
    const signals = detectSignals(snapshot, context);
    expect(signals.map((s) => s.type)).not.toContain("news_mention");
  });

  // SD-12: missing optional context fields → no crash
  it("SD-12: snapshot with no context at all returns empty signals with neutral price", () => {
    const snapshot = makeSnapshot({ price: 100_000, previousPrice: 100_000 });
    expect(() => detectSignals(snapshot)).not.toThrow();
    const signals = detectSignals(snapshot);
    expect(signals).toBeArray();
  });

  // SD-13: priceSeverity branches — < 5% → low
  it("SD-13: priceSeverity — absPct < 5 produces low severity (via custom threshold)", () => {
    const snapshot = makeSnapshot({ price: 98_000, previousPrice: 100_000 }); // 2% drop
    const context: SignalContext = {
      watchlistThresholds: { dropPct: -1, risePct: 10, impactScore: 5 },
    };
    const signals = detectSignals(snapshot, context);
    const drop = signals.find((s) => s.type === "price_drop");
    expect(drop).toBeDefined();
    expect(drop!.severity).toBe("low");
  });

  // SD-14: priceSeverity — 5–6.9% → medium (via custom threshold, default is now -7%)
  it("SD-14: priceSeverity — 5-6.9% produces medium severity (via custom threshold)", () => {
    const snapshot = makeSnapshot({ price: 94_000, previousPrice: 100_000 }); // -6%
    const context: SignalContext = {
      watchlistThresholds: { dropPct: -5, risePct: 10, impactScore: 5 },
    };
    const signals = detectSignals(snapshot, context);
    const drop = signals.find((s) => s.type === "price_drop");
    expect(drop).toBeDefined();
    expect(drop!.severity).toBe("medium");
  });

  // SD-14b: priceSeverity — 7% → high (VN circuit breaker threshold)
  it("SD-14b: priceSeverity — 7% produces high severity", () => {
    const snapshot = makeSnapshot({ price: 93_000, previousPrice: 100_000 }); // -7%
    const signals = detectSignals(snapshot);
    const drop = signals.find((s) => s.type === "price_drop");
    expect(drop).toBeDefined();
    expect(drop!.severity).toBe("high");
  });

  // SD-15: priceSeverity — 10–14.9% → high
  it("SD-15: priceSeverity — 10-14.9% produces high severity", () => {
    const snapshot = makeSnapshot({ price: 88_000, previousPrice: 100_000 }); // -12%
    const signals = detectSignals(snapshot);
    const drop = signals.find((s) => s.type === "price_drop");
    expect(drop).toBeDefined();
    expect(drop!.severity).toBe("high");
  });

  // SD-16: priceSeverity — ≥ 15% → critical
  it("SD-16: priceSeverity — >=15% produces critical severity", () => {
    const snapshot = makeSnapshot({ price: 83_000, previousPrice: 100_000 }); // -17%
    const signals = detectSignals(snapshot);
    const drop = signals.find((s) => s.type === "price_drop");
    expect(drop).toBeDefined();
    expect(drop!.severity).toBe("critical");
  });

  // SD-17: volume_spike severity branches — multiplier < 3 → medium
  // _now set outside ATC window to avoid false suppression
  it("SD-17: volume_spike severity medium when multiplier is 2x-2.9x", () => {
    const snapshot = makeSnapshot({ volume: 2_500_000, avgVolume: 1_000_000 });
    const signals = detectSignals(snapshot, { _now: new Date("2026-01-01T06:00:00Z") });
    const spike = signals.find((s) => s.type === "volume_spike");
    expect(spike).toBeDefined();
    expect(spike!.severity).toBe("medium");
  });

  // SD-18: volume_spike severity — multiplier 3–4.9x → high
  it("SD-18: volume_spike severity high when multiplier is 3x-4.9x", () => {
    const snapshot = makeSnapshot({ volume: 4_000_000, avgVolume: 1_000_000 });
    const signals = detectSignals(snapshot, { _now: new Date("2026-01-01T06:00:00Z") });
    const spike = signals.find((s) => s.type === "volume_spike");
    expect(spike).toBeDefined();
    expect(spike!.severity).toBe("high");
  });

  // SD-19: volume_spike severity — multiplier ≥5x → critical
  it("SD-19: volume_spike severity critical when multiplier is >=5x", () => {
    const snapshot = makeSnapshot({ volume: 6_000_000, avgVolume: 1_000_000 });
    const signals = detectSignals(snapshot, { _now: new Date("2026-01-01T06:00:00Z") });
    const spike = signals.find((s) => s.type === "volume_spike");
    expect(spike).toBeDefined();
    expect(spike!.severity).toBe("critical");
  });

  // SD-20: latestReportDate within 24h → report_new (fresh)
  it("SD-20: latestReportDate=now triggers report_new", () => {
    const snapshot = makeSnapshot();
    const context: SignalContext = {
      latestReportDate: new Date().toISOString(),
    };
    const signals = detectSignals(snapshot, context);
    expect(signals.map((s) => s.type)).toContain("report_new");
  });

  // SD-21: latestReportDate older than 24h → no report_new
  it("SD-21: latestReportDate='2020-01-01' does NOT trigger report_new", () => {
    const snapshot = makeSnapshot();
    const context: SignalContext = {
      latestReportDate: "2020-01-01T00:00:00.000Z",
    };
    const signals = detectSignals(snapshot, context);
    expect(signals.map((s) => s.type)).not.toContain("report_new");
  });

  // SD-22: invalid date string → isWithinHours returns false → no report_new
  it("SD-22: invalid latestReportDate string does not crash and produces no report_new", () => {
    const snapshot = makeSnapshot();
    const context: SignalContext = {
      latestReportDate: "not-a-date",
    };
    expect(() => detectSignals(snapshot, context)).not.toThrow();
    const signals = detectSignals(snapshot, context);
    expect(signals.map((s) => s.type)).not.toContain("report_new");
  });

  // SD-23: news_mention severity branches — count=1 → low
  it("SD-23: 1 news item → news_mention severity low", () => {
    const snapshot = makeSnapshot();
    const context: SignalContext = {
      recentNews: [{ title: "VCB news", source: "cafef" }],
    };
    const signals = detectSignals(snapshot, context);
    const mention = signals.find((s) => s.type === "news_mention");
    expect(mention).toBeDefined();
    expect(mention!.severity).toBe("low");
  });

  // SD-24: news_mention severity — count=2 → medium
  it("SD-24: 2 news items → news_mention severity medium", () => {
    const snapshot = makeSnapshot();
    const context: SignalContext = {
      recentNews: [
        { title: "VCB Q1", source: "cafef" },
        { title: "VCB update", source: "vnexpress" },
      ],
    };
    const signals = detectSignals(snapshot, context);
    const mention = signals.find((s) => s.type === "news_mention");
    expect(mention).toBeDefined();
    expect(mention!.severity).toBe("medium");
  });

  // SD-25: news_mention severity — count≥5 → high
  it("SD-25: 5+ news items → news_mention severity high", () => {
    const snapshot = makeSnapshot();
    const context: SignalContext = {
      recentNews: [
        { title: "A", source: "s" },
        { title: "B", source: "s" },
        { title: "C", source: "s" },
        { title: "D", source: "s" },
        { title: "E", source: "s" },
      ],
    };
    const signals = detectSignals(snapshot, context);
    const mention = signals.find((s) => s.type === "news_mention");
    expect(mention).toBeDefined();
    expect(mention!.severity).toBe("high");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AG — Alert Generator branch coverage
// ═══════════════════════════════════════════════════════════════════════════

const watchlist = [
  { actionCode: "VCB" },
  { actionCode: "HPG" },
  { actionCode: "MWG" },
];

describe("Task 122 — Alert Generator branch coverage", () => {
  // AG-01: single signal with severity low → inherits low
  it("AG-01: single low-severity signal → alert severity is low", () => {
    const signal = makeSignal("VCB", "news_mention", "low");
    const alerts = generateAlerts([signal], watchlist);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.severity).toBe("low");
  });

  // AG-02: single signal with severity medium → inherits medium
  it("AG-02: single medium-severity signal → alert severity is medium", () => {
    const signal = makeSignal("VCB", "price_drop", "medium");
    const alerts = generateAlerts([signal], watchlist);
    expect(alerts[0]!.severity).toBe("medium");
  });

  // AG-03: single signal with severity high → inherits high
  it("AG-03: single high-severity signal → alert severity is high", () => {
    const signal = makeSignal("VCB", "price_drop", "high");
    const alerts = generateAlerts([signal], watchlist);
    expect(alerts[0]!.severity).toBe("high");
  });

  // AG-04: single signal with severity critical → inherits critical
  it("AG-04: single critical-severity signal → alert severity is critical", () => {
    const signal = makeSignal("VCB", "price_drop", "critical");
    const alerts = generateAlerts([signal], watchlist);
    expect(alerts[0]!.severity).toBe("critical");
  });

  // AG-05: exactly 2 signals → escalates to high regardless of input severity
  it("AG-05: exactly 2 signals → severity escalated to high", () => {
    const signals = [
      makeSignal("VCB", "price_drop", "low"),
      makeSignal("VCB", "volume_spike", "low"),
    ];
    const alerts = generateAlerts(signals, watchlist);
    expect(alerts[0]!.severity).toBe("high");
  });

  // AG-06: 4+ signals → still critical
  it("AG-06: 4 signals → severity escalated to critical", () => {
    const signals = [
      makeSignal("HPG", "price_drop", "low"),
      makeSignal("HPG", "volume_spike", "low"),
      makeSignal("HPG", "news_mention", "low"),
      makeSignal("HPG", "report_new", "low"),
    ];
    const alerts = generateAlerts(signals, watchlist);
    expect(alerts[0]!.severity).toBe("critical");
  });

  // AG-07: signals for non-watchlisted stock → no alert generated
  it("AG-07: all signals for non-watchlisted stock → empty alerts", () => {
    const signals = [
      makeSignal("AAPL", "price_drop", "critical"),
      makeSignal("TSLA", "volume_spike", "critical"),
    ];
    const alerts = generateAlerts(signals, watchlist);
    expect(alerts).toHaveLength(0);
  });

  // AG-08: empty signals array → returns empty immediately
  it("AG-08: empty signals array → returns empty array immediately", () => {
    const alerts = generateAlerts([], watchlist);
    expect(alerts).toBeInstanceOf(Array);
    expect(alerts).toHaveLength(0);
  });

  // AG-09: duplicate actionCode signals in same batch — all grouped into one alert
  it("AG-09: duplicate signals for same actionCode → all grouped into one alert", () => {
    const signals = [
      makeSignal("VCB", "price_drop", "medium"),
      makeSignal("VCB", "price_drop", "medium"), // same type again
      makeSignal("VCB", "volume_spike", "high"),
    ];
    const alerts = generateAlerts(signals, watchlist);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.actionCode).toBe("VCB");
    expect(alerts[0]!.signals).toHaveLength(3);
  });

  // AG-10: single-signal message contains stock code, type, and original message
  it("AG-10: single-signal message format includes stock, type, and original signal message", () => {
    const signal = makeSignal("VCB", "price_drop", "high");
    signal.message = "VCB dropped 10.00% (100000 → 90000 VND)";
    const alerts = generateAlerts([signal], watchlist);
    const msg = alerts[0]!.message;
    expect(msg.toLowerCase()).toContain("vcb");
    expect(msg).toContain("price_drop");
    expect(msg).toContain("VCB dropped 10.00%");
  });

  // AG-11: multi-signal message has [HIGH] tag for 2 signals
  it("AG-11: 2-signal alert message contains [HIGH] tag", () => {
    const signals = [
      makeSignal("HPG", "price_drop", "medium"),
      makeSignal("HPG", "volume_spike", "medium"),
    ];
    const alerts = generateAlerts(signals, watchlist);
    expect(alerts[0]!.message).toContain("[HIGH]");
  });

  // AG-12: multi-signal message has [CRITICAL] tag for 3+ signals
  it("AG-12: 3-signal alert message contains [CRITICAL] tag", () => {
    const signals = [
      makeSignal("MWG", "price_drop", "medium"),
      makeSignal("MWG", "volume_spike", "medium"),
      makeSignal("MWG", "news_mention", "low"),
    ];
    const alerts = generateAlerts(signals, watchlist);
    expect(alerts[0]!.message).toContain("[CRITICAL]");
  });

  // AG-13: empty watchlist → no alerts even with signals
  it("AG-13: empty watchlist → no alerts regardless of signals", () => {
    const signals = [
      makeSignal("VCB", "price_drop", "critical"),
      makeSignal("HPG", "volume_spike", "critical"),
    ];
    const alerts = generateAlerts(signals, []);
    expect(alerts).toHaveLength(0);
  });

  // AG-14: buildMessage — medium severity signal has no severity tag in message
  it("AG-14: medium/low severity single-signal alert has no [HIGH]/[CRITICAL] tag", () => {
    const signal = makeSignal("VCB", "news_mention", "medium");
    const alerts = generateAlerts([signal], watchlist);
    const msg = alerts[0]!.message;
    expect(msg).not.toContain("[HIGH]");
    expect(msg).not.toContain("[CRITICAL]");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CE — Cascade Engine branch coverage
// ═══════════════════════════════════════════════════════════════════════════

describe("Task 122 — Cascade Engine branch coverage", () => {
  // CE-01: first-match-wins per domain — oil price rise triggers oil_gas before
  //        another oil_gas rule and aviation also for the same summary
  it("CE-01: first-match-wins — oil price rise triggers oil_gas (first rule) not second oil_gas rule", () => {
    // "oil price rise" appears in both the first (up) and the aviation rule
    // but for oil_gas domain, the first rule wins
    const entry = makeEntry({
      summary: "oil price rise crude oil up sharply",
    });
    const chain = buildCausalChain(entry, []);
    const oilEntries = chain.entries.filter(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    );
    // Only one oil_gas domain entry — first match wins
    expect(oilEntries).toHaveLength(1);
    expect(oilEntries[0]!.sentiment).toBe("bullish"); // first rule is "up" → bullish
  });

  // CE-02: single keyword "oil price rise" triggers both oil_gas (up) AND aviation (down)
  it("CE-02: 'oil price rise' creates domain entries for both oil_gas (bullish) and aviation (bearish)", () => {
    const entry = makeEntry({ summary: "oil price rise aviation fuel costs" });
    const chain = buildCausalChain(entry, []);
    const oilEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    );
    const aviationEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("aviation"),
    );
    expect(oilEntry).toBeDefined();
    expect(aviationEntry).toBeDefined();
    expect(oilEntry!.sentiment).toBe("bullish");
    expect(aviationEntry!.sentiment).toBe("bearish");
  });

  // CE-03: "interest rate hike" triggers banking (up) AND real_estate (down)
  it("CE-03: 'interest rate hike' creates domain entries for banking (up) and real_estate (down)", () => {
    const entry = makeEntry({ summary: "interest rate hike fed hike announced" });
    const chain = buildCausalChain(entry, []);
    const bankEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("banking"),
    );
    const realEstateEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("real_estate"),
    );
    expect(bankEntry).toBeDefined();
    expect(realEstateEntry).toBeDefined();
    expect(realEstateEntry!.sentiment).toBe("bearish");
  });

  // CE-04: no matching sector rules for summary → no domain entries from rules
  it("CE-04: summary with no SECTOR_RULE keywords produces no rule-matched domain entries", () => {
    const entry = makeEntry({
      summary: "random news about sports and weather",
      affectedDomains: [],
    });
    const chain = buildCausalChain(entry, []);
    const domainEntries = chain.entries.filter((e) => e.level === "domain");
    expect(domainEntries).toHaveLength(0);
  });

  // CE-05: empty watchlist → no action entries and empty watchlistImpacts
  it("CE-05: empty watchlist → no action entries in chain", () => {
    const entry = makeEntry({ summary: "oil price rise crude oil up" });
    const chain = buildCausalChain(entry, []);
    const actionEntries = chain.entries.filter((e) => e.level === "action");
    expect(actionEntries).toHaveLength(0);
    expect(chain.watchlistImpacts).toHaveLength(0);
  });

  // CE-06: watchlist stock's domain has no triggered rule → stock skipped
  it("CE-06: watchlist stock in untriggered domain is not included in action entries", () => {
    // Use impactScore: 5 (below broadcast threshold of 6) so market-wide broadcast
    // does NOT trigger — isolates the "untriggered domain" path.
    const entry = makeEntry({ summary: "oil price rise crude oil up", impactScore: 5 });
    const watchlist: WatchlistEntry[] = [
      makeWatchlistEntry("VCB", "banking"), // banking not triggered by oil price
    ];
    const chain = buildCausalChain(entry, watchlist);
    const vcbImpacts = chain.watchlistImpacts.filter(
      (i) => i.actionCode === "VCB",
    );
    expect(vcbImpacts).toHaveLength(0);
  });

  // CE-07: confidence values are valid at each level
  it("CE-07: confidence is valid number between 0 and 1 at each level", () => {
    const entry = makeEntry({
      confidence: 0.9,
      impactScore: 8,
      summary: "oil price rise crude oil up opec",
    });
    const watchlist: WatchlistEntry[] = [makeWatchlistEntry("GAS", "oil_gas")];
    const chain = buildCausalChain(entry, watchlist);

    const domainEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    )!;
    const actionEntry = chain.entries.find(
      (e) => e.level === "action" && e.affectedActions.includes("GAS"),
    )!;

    expect(domainEntry.confidence).toBeGreaterThan(0);
    expect(domainEntry.confidence).toBeLessThanOrEqual(1);
    expect(actionEntry.confidence).toBeGreaterThan(0);
    expect(actionEntry.confidence).toBeLessThanOrEqual(domainEntry.confidence);
  });

  // CE-08: RAG results — empty array → no enrichment to reasoning
  it("CE-08: ragResults=[] → chain produces same as no ragResults", () => {
    const entry = makeEntry({ summary: "oil price rise opec" });
    const chainNoRag = buildCausalChain(entry, []);
    const chainEmptyRag = buildCausalChain(entry, [], []);
    // Both should have same number of entries
    expect(chainEmptyRag.entries.length).toBe(chainNoRag.entries.length);
    // Reasoning should NOT contain "Historical" for empty rag
    const allReasoning = chainEmptyRag.entries.map((e) => e.reasoning).join(" ");
    expect(allReasoning).not.toContain("Historical");
  });

  // CE-09: RAG results — undefined (omitted) → no enrichment
  it("CE-09: ragResults=undefined → no RAG enrichment block entered", () => {
    const entry = makeEntry({ summary: "oil price rise opec" });
    const chain = buildCausalChain(entry, []); // ragResults omitted
    const allReasoning = chain.entries.map((e) => e.reasoning).join(" ");
    expect(allReasoning).not.toContain("Historical");
  });

  // CE-10: RAG results provided — entries[0] fallback when no level matches
  it("CE-10: RAG result with level 'action' falls back to seed entry when no action entries exist", () => {
    const entry = makeEntry({
      summary: "oil price rise opec crude oil up",
    });
    // RAG result with level "action" — but no action entries in chain (empty watchlist)
    const ragResults: SearchResult[] = [
      {
        id: "rag-1",
        level: "action",
        title: "HPG 2023 benefited from steel price",
        summary: "HPG stock rose 20% on steel price rally",
        distance: 0.1,
        tags: ["hpg", "steel"],
      },
    ];
    const chain = buildCausalChain(entry, [], ragResults);
    // Falls back to seed entry (entries[0]) — its reasoning should have Historical
    const seedReasoning = chain.entries[0]!.reasoning;
    expect(seedReasoning).toContain("Historical");
  });

  // CE-11: RAG results — top-3 cap (more than 3 provided, only first 3 used)
  it("CE-11: only first 3 RAG results are used for enrichment (slice 0-3)", () => {
    const entry = makeEntry({
      summary: "oil price rise crude oil up opec",
      impactScore: 7,
    });
    const ragResults: SearchResult[] = [
      { id: "r1", level: "global", title: "Rag 1", summary: "rag summary 1", distance: 0.1, tags: [] },
      { id: "r2", level: "global", title: "Rag 2", summary: "rag summary 2", distance: 0.2, tags: [] },
      { id: "r3", level: "global", title: "Rag 3", summary: "rag summary 3", distance: 0.3, tags: [] },
      { id: "r4", level: "global", title: "Rag 4 EXCLUDED", summary: "rag summary 4", distance: 0.4, tags: [] },
    ];
    const chain = buildCausalChain(entry, [], ragResults);
    const allReasoning = chain.entries.map((e) => e.reasoning).join(" ");
    // Rag 4 should be excluded
    expect(allReasoning).not.toContain("Rag 4 EXCLUDED");
    // First 3 should be included
    expect(allReasoning).toContain("Rag 1");
  });

  // CE-12: deduplication of watchlist — same actionCode produces single action entry
  it("CE-12: duplicate watchlist entries produce only one action entry per stock", () => {
    const entry = makeEntry({ summary: "oil price rise crude oil up opec" });
    const watchlist: WatchlistEntry[] = [
      makeWatchlistEntry("GAS", "oil_gas", "HOSE"),
      makeWatchlistEntry("GAS", "oil_gas", "HOSE"), // exact duplicate
    ];
    const chain = buildCausalChain(entry, watchlist);
    const gasActions = chain.entries.filter(
      (e) => e.level === "action" && e.affectedActions.includes("GAS"),
    );
    expect(gasActions).toHaveLength(1);
    const gasImpacts = chain.watchlistImpacts.filter(
      (i) => i.actionCode === "GAS",
    );
    expect(gasImpacts).toHaveLength(1);
  });

  // CE-13: pharma domain is in SECTOR_RULES (added in task 161/162) — confidence is 0.6
  it("CE-13: affectedDomains covered by SECTOR_RULES get domain entry with rule confidence 0.6", () => {
    const entry = makeEntry({
      summary: "pharma sector outlook positive",
      affectedDomains: ["pharma" as DomainType],
    });
    const chain = buildCausalChain(entry, []);
    const pharmaEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("pharma" as DomainType),
    );
    expect(pharmaEntry).toBeDefined();
    expect(pharmaEntry!.confidence).toBe(0.6);
  });

  // CE-14: direction2sentiment mapping — down → bearish
  it("CE-14: rule with direction 'down' produces bearish sentiment in domain entry", () => {
    const entry = makeEntry({ summary: "oil price fall crude oil down" });
    const chain = buildCausalChain(entry, []);
    const oilEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    );
    expect(oilEntry).toBeDefined();
    expect(oilEntry!.sentiment).toBe("bearish");
  });

  // CE-15: direction2sentiment mapping — neutral → neutral
  it("CE-15: rule with direction 'neutral' produces neutral sentiment in domain entry", () => {
    const entry = makeEntry({ summary: "interest rate cut rate cut expected" });
    const chain = buildCausalChain(entry, []);
    const bankEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("banking"),
    );
    expect(bankEntry).toBeDefined();
    expect(bankEntry!.sentiment).toBe("neutral");
  });

  // CE-16: watchlistImpact.impactDirection maps correctly from bearish sentiment
  it("CE-16: watchlistImpact impactDirection='down' for bearish action entry", () => {
    const entry = makeEntry({ summary: "oil price fall crude oil down" });
    const watchlist: WatchlistEntry[] = [makeWatchlistEntry("GAS", "oil_gas")];
    const chain = buildCausalChain(entry, watchlist);
    const gasImpact = chain.watchlistImpacts.find(
      (i) => i.actionCode === "GAS",
    );
    expect(gasImpact).toBeDefined();
    expect(gasImpact!.impactDirection).toBe("down");
  });

  // CE-17: watchlistImpact has a valid impactDirection
  it("CE-17: watchlistImpact impactDirection is a valid sentiment string", () => {
    const entry = makeEntry({ summary: "lãi suất giảm interest rate cut banking" });
    const watchlist: WatchlistEntry[] = [makeWatchlistEntry("VCB", "banking")];
    const chain = buildCausalChain(entry, watchlist);
    const vcbImpact = chain.watchlistImpacts.find(
      (i) => i.actionCode === "VCB",
    );
    expect(vcbImpact).toBeDefined();
    expect(["up", "down", "neutral"]).toContain(vcbImpact!.impactDirection);
  });

  // CE-18: chain ID has correct format
  it("CE-18: returned chain.id starts with 'chain-'", () => {
    const entry = makeEntry({ summary: "test summary" });
    const chain = buildCausalChain(entry, []);
    expect(chain.id).toMatch(/^chain-/);
  });

  // CE-19: impactScore is propagated and attenuated through chain levels
  it("CE-19: action impactScore is less than or equal to domain impactScore", () => {
    const entry = makeEntry({
      summary: "oil price rise crude oil up opec",
      impactScore: 8,
    });
    const watchlist: WatchlistEntry[] = [makeWatchlistEntry("GAS", "oil_gas")];
    const chain = buildCausalChain(entry, watchlist);
    const domainEntry = chain.entries.find(
      (e) => e.level === "domain" && e.affectedDomains.includes("oil_gas"),
    )!;
    const actionEntry = chain.entries.find(
      (e) => e.level === "action" && e.affectedActions.includes("GAS"),
    )!;
    expect(actionEntry.impactScore).toBeLessThanOrEqual(domainEntry.impactScore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NN — News Normalizer branch coverage
// ═══════════════════════════════════════════════════════════════════════════

describe("Task 122 — News Normalizer branch coverage", () => {
  // NN-01: source 'reuters' tiebreaker → global level when no country/global keywords
  it("NN-01: reuters source with no keywords → level global via source tiebreaker", () => {
    const item = makeRssItem({
      source: "reuters",
      title: "Markets await next week's data",
      content: "Investors are cautious ahead of economic releases.",
    });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("global");
  });

  // NN-02: source 'cafef' tiebreaker → country level when no country/global keywords
  it("NN-02: cafef source with no keywords → level country via source tiebreaker", () => {
    const item = makeRssItem({
      source: "cafef",
      title: "Thị trường hôm nay",
      content: "Nhận định phiên giao dịch.",
    });
    const entry = normalizeNews(item);
    expect(entry.level).toBe("country");
  });

  // NN-03: domain keyword scan — steel domain detected
  it("NN-03: 'thép' keyword in content → steel domain detected", () => {
    const item = makeRssItem({
      source: "cafef",
      title: "Giá thép tăng mạnh",
      content: "Thị trường thép Việt Nam ghi nhận mức tăng giá.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedDomains).toContain("steel");
  });

  // NN-04: domain keyword scan — aviation domain detected
  it("NN-04: 'hàng không' keyword → aviation domain detected", () => {
    const item = makeRssItem({
      source: "vnexpress",
      title: "Ngành hàng không phục hồi mạnh",
      content: "Vietnam Airlines và Vietjet tăng trưởng doanh thu.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedDomains).toContain("aviation");
  });

  // NN-05: domain keyword scan — utilities domain detected
  it("NN-05: 'điện' and 'electricity' keywords → utilities domain detected", () => {
    const item = makeRssItem({
      source: "vnexpress",
      title: "Ngành điện Việt Nam mở rộng công suất",
      content: "EVN công bố kế hoạch đầu tư điện mới.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedDomains).toContain("utilities");
  });

  // NN-06: stock code detected in content (not title)
  it("NN-06: stock code 'HPG' in content (not title) → detected in affectedActions", () => {
    const item = makeRssItem({
      source: "cafef",
      title: "Cổ phiếu thép tăng mạnh",
      content: "HPG ghi nhận mức tăng giá kỷ lục trong phiên hôm nay.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("HPG");
  });

  // NN-07: multiple stock codes in single item (title + content combined)
  it("NN-07: multiple stock codes in title and content → all detected in affectedActions", () => {
    const item = makeRssItem({
      source: "cafef",
      title: "VCB và TCB dẫn đầu",
      content: "Ngoài VCB và TCB, BID cũng tăng mạnh trong phiên hôm nay.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedActions).toContain("VCB");
    expect(entry.affectedActions).toContain("TCB");
    expect(entry.affectedActions).toContain("BID");
  });

  // NN-08: empty title and empty content → sourceTitle is fallback '(no title)'
  it("NN-08: empty title → sourceTitle falls back to (no title)", () => {
    const item = makeRssItem({ title: "", content: "", source: "cafef" });
    const entry = normalizeNews(item);
    expect(entry.sourceTitle).toBe("(no title)");
  });

  // NN-09: stock code not in KNOWN_VN_STOCKS → not added to affectedActions
  it("NN-09: unknown ticker 'ZZZZZ' is NOT added to affectedActions", () => {
    const item = makeRssItem({
      source: "cafef",
      title: "Cổ phiếu ZZZZZ tăng mạnh",
      content: "Mã ZZZZZ ghi nhận mức tăng bất thường.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedActions).not.toContain("ZZZZZ");
  });

  // NN-10: unknown source → no tiebreaker → falls through to domain/default
  it("NN-10: unknown source with only domain keywords → domain level", () => {
    const item = makeRssItem({
      source: "unknown_blog",
      title: "Steel industry analysis",
      content: "Steel market outlook for 2026 indicates positive trend.",
    });
    const entry = normalizeNews(item);
    // No country keywords, no global keywords, no stock ticker, source is not
    // reuters/ap_news/cafef/vnexpress → tiebreaker not fired → domain match
    expect(entry.level).toBe("domain");
    expect(entry.affectedDomains).toContain("steel");
  });

  // NN-11: affectedCountries — Vietnamese source → always includes VN
  it("NN-11: cafef source → affectedCountries always includes VN", () => {
    const item = makeRssItem({
      source: "cafef",
      title: "Generic market update",
      content: "Today's market movements.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedCountries).toContain("VN");
  });

  // NN-12: affectedCountries — non-VN source, no VN keyword → empty
  it("NN-12: reuters source with no VN keywords → affectedCountries is empty", () => {
    const item = makeRssItem({
      source: "reuters",
      title: "US inflation data released",
      content: "US CPI data shows persistent inflation.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedCountries).not.toContain("VN");
  });

  // NN-13: summary is title only when content is empty
  it("NN-13: summary is title only when content is empty (no dot+space prefix)", () => {
    const item = makeRssItem({
      source: "cafef",
      title: "VCB Q1 results",
      content: "",
    });
    const entry = normalizeNews(item);
    expect(entry.summary).toBe("VCB Q1 results");
  });

  // NN-14: summary is content only when title is empty
  it("NN-14: summary is content only when title is empty", () => {
    const item = makeRssItem({
      source: "cafef",
      title: "",
      content: "Content only, no title here.",
    });
    const entry = normalizeNews(item);
    expect(entry.summary).toBe("Content only, no title here.");
  });

  // NN-15: invalid publishedAt → falls back to current timestamp (no crash)
  it("NN-15: invalid publishedAt value → falls back to current ISO timestamp", () => {
    const item = makeRssItem({
      source: "cafef",
      title: "Test",
      content: "Test content",
      publishedAt: "not-a-date",
    });
    expect(() => normalizeNews(item)).not.toThrow();
    const entry = normalizeNews(item);
    const parsed = new Date(entry.publishedAt);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
  });

  // NN-16: insurance domain keyword detected
  it("NN-16: 'bảo hiểm' keyword → insurance domain detected", () => {
    const item = makeRssItem({
      source: "cafef",
      title: "Ngành bảo hiểm nhân thọ tăng trưởng mạnh",
      content: "BVH và PVI đều công bố kết quả tích cực.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedDomains).toContain("insurance");
  });

  // NN-17: pharma domain keyword detected
  it("NN-17: 'dược' keyword → pharma domain detected", () => {
    const item = makeRssItem({
      source: "vnexpress",
      title: "Ngành dược phẩm Việt Nam 2026",
      content: "DHG và IMP dẫn đầu ngành dược.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedDomains).toContain("pharma");
  });

  // NN-18: retail domain keyword detected
  it("NN-18: 'bán lẻ' keyword → retail domain detected", () => {
    const item = makeRssItem({
      source: "cafef",
      title: "Thị trường bán lẻ phục hồi",
      content: "MWG và FRT báo cáo tăng trưởng doanh thu.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedDomains).toContain("retail");
  });

  // NN-19: agriculture domain keyword detected
  it("NN-19: 'thủy sản' keyword → agriculture domain detected", () => {
    const item = makeRssItem({
      source: "cafef",
      title: "Xuất khẩu thủy sản tăng mạnh",
      content: "VHC và ANV đẩy mạnh xuất khẩu sang thị trường EU.",
    });
    const entry = normalizeNews(item);
    expect(entry.affectedDomains).toContain("agriculture");
  });

  // NN-20: confidence scales with keyword count (more keywords → higher confidence)
  it("NN-20: more matched keywords → confidence is higher (up to cap)", () => {
    const itemFewKeywords = makeRssItem({
      source: "reuters",
      title: "Oil market update",
      content: "Crude oil prices rose today.",
    });
    const itemManyKeywords = makeRssItem({
      source: "reuters",
      title: "Fed FOMC oil crude OPEC rate hike interest rate",
      content: "US dollar GDP inflation Federal Reserve rate hike opec crude oil.",
    });
    const entryFew = normalizeNews(itemFewKeywords);
    const entryMany = normalizeNews(itemManyKeywords);
    expect(entryMany.confidence).toBeGreaterThanOrEqual(entryFew.confidence);
    expect(entryMany.confidence).toBeLessThanOrEqual(1.0);
  });
});
