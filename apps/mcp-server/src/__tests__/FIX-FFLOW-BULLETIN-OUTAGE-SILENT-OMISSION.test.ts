/**
 * FIX-FFLOW-BULLETIN-OUTAGE-SILENT-OMISSION — TDD
 *
 * Mirror-image bug of FIX-FOREIGN-FLOW-BULLETIN-UNAVAIL-STRING (task 1783):
 * that fix wired the canonical "Dữ liệu không khả dụng (pipeline tạm dừng)"
 * copy into `formatForeignFlowSection`'s all-zero branch — but the default
 * SQL path (`AND foreign_net_vol <> 0`) can never actually produce that
 * shape (frozen behaviour, see FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN T-1/T-2:
 * an all-zero session AND a genuine DB-outage/error both collapse to
 * `movers = []` before the formatter ever runs), so a true pipeline outage
 * rendered NOTHING — the whole "Khối ngoại" section silently vanished from
 * both evening bulletins.
 *
 * Fix: `formatForeignFlowSectionOrUnavailable` — a thin wrapper used by both
 * bulletin call sites — treats a truly empty `movers` array as "no data" and
 * renders the unavailable line. `formatForeignFlowSection` itself is left
 * untouched (its own all-zero branch stays reachable via the injected
 * `getForeignFlowMoversFn` path — see franceSummaryJob.ts/assembleEveningSummary.ts).
 *
 * BUG-1: movers=[] (outage/error) → unavailable line, not silent omission.
 * BUG-2: franceSummaryJob's own `length > 0` outer guard suppressed the
 *        message even for an explicit empty array — removed for empty-array
 *        input (an `undefined` param, meaning the caller never attempted a
 *        query, still omits — see updated 1516 AC-4).
 * BUG-3 (regression guard): a normal nonempty movers set must render
 *        byte-identically through the wrapper (no behaviour change for the
 *        already-correct path).
 *
 * Layer: tests — exercises the pure formatters only. No DB, no HTTP, no
 * Telegram sends.
 */

import { describe, it, expect } from "bun:test";
import {
  formatForeignFlowSection,
  formatForeignFlowSectionOrUnavailable,
} from "../scheduler/briefings/format/foreignFlowSection.js";
import { formatEveningSummaryLines } from "../scheduler/briefings/eveningSummaryJob.js";
import { formatFranceSummaryVI } from "../scheduler/briefings/franceSummaryJob.js";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";

// ─────────────────────────────────────────────────────────────────────────────
// BUG-1: formatForeignFlowSectionOrUnavailable — empty movers → unavailable line
// ─────────────────────────────────────────────────────────────────────────────

describe("FFLOW-OUTAGE BUG-1 — outage/empty renders the unavailable line, not silence", () => {
  it("returns a non-empty result for movers=[] (unlike the raw formatter)", () => {
    const lines = formatForeignFlowSectionOrUnavailable([]);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join("\n")).toContain("Dữ liệu không khả dụng");
  });

  it("still contains the section label 'Khối ngoại'", () => {
    const lines = formatForeignFlowSectionOrUnavailable([]);
    expect(lines.join("\n")).toContain("Khối ngoại");
  });

  it("documents the frozen pure-formatter contract: formatForeignFlowSection([]) still returns [] (1783/ZERO-PAD-TOPN T-6)", () => {
    // formatForeignFlowSection itself is NOT changed by this fix — only the
    // wrapper used at production call sites is. Kept green on purpose so
    // getForeignFlowMoversFn callers that inject raw rows are unaffected.
    expect(formatForeignFlowSection([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-1 (evening bulletin path) — formatEveningSummaryLines
// ─────────────────────────────────────────────────────────────────────────────

function makeEveningSummary(overrides: Partial<EveningSummary> = {}): EveningSummary {
  return {
    date: "2026-08-06",
    topAlerts: [],
    topStories: [],
    watchlistMovers: [],
    predictionSignals: [],
    predictionDiag: { stored: 0 },
    taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
    taSummary: [],
    newsCount: 0,
    generatedAt: "2026-08-06T22:30:00Z",
    foreignFlowMovers: [],
    ...overrides,
  } as EveningSummary;
}

describe("FFLOW-OUTAGE BUG-1 — eveningSummaryJob renders unavailable line on empty movers", () => {
  it("formatEveningSummaryLines includes the unavailable line when foreignFlowMovers=[]", () => {
    const lines = formatEveningSummaryLines(makeEveningSummary({ foreignFlowMovers: [] }));
    expect(lines.join("\n")).toContain("Dữ liệu không khả dụng");
  });

  it("formatEveningSummaryLines includes the unavailable line when foreignFlowMovers is missing entirely (pre-1503 summaries)", () => {
    const summary = makeEveningSummary();
    delete (summary as { foreignFlowMovers?: unknown }).foreignFlowMovers;
    const lines = formatEveningSummaryLines(summary);
    expect(lines.join("\n")).toContain("Dữ liệu không khả dụng");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-2 (france bulletin path) — formatFranceSummaryVI outer guard removed
// ─────────────────────────────────────────────────────────────────────────────

describe("FFLOW-OUTAGE BUG-2 — franceSummaryJob no longer suppresses the message on empty movers", () => {
  it("renders the unavailable line when foreignFlowMovers is an explicit empty array", () => {
    const msg = formatFranceSummaryVI("06/08/2026", [], [], [], null, null, null, []);
    expect(msg).toContain("Khối ngoại");
    expect(msg).toContain("Dữ liệu không khả dụng");
  });

  it("still omits the section entirely when foreignFlowMovers param is not supplied at all", () => {
    // `undefined` means the caller never attempted a foreign-flow query —
    // distinct from "queried and got nothing". Preserves every other
    // formatFranceSummaryVI test in the suite that never passes this arg.
    const msg = formatFranceSummaryVI("06/08/2026", [], [], [], null, null, null);
    expect(msg).not.toContain("Khối ngoại");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-3 (regression guard): normal nonempty set renders byte-identically
// ─────────────────────────────────────────────────────────────────────────────

describe("FFLOW-OUTAGE BUG-3 — normal nonempty data is byte-unchanged through the wrapper", () => {
  const movers = [
    { code: "VCB", foreignNetVol: 500000, foreignBuyVol: 600000, foreignSellVol: 100000 },
    { code: "HPG", foreignNetVol: -300000, foreignBuyVol: 50000, foreignSellVol: 350000 },
  ];

  it("formatForeignFlowSectionOrUnavailable(movers) === formatForeignFlowSection(movers) for nonempty input", () => {
    expect(formatForeignFlowSectionOrUnavailable(movers)).toEqual(
      formatForeignFlowSection(movers),
    );
  });

  it("does not regress the frozen all-zero-but-nonempty shape (still the 1783 unavailable message, via passthrough)", () => {
    const allZero = [
      { code: "ACB", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
      { code: "BID", foreignNetVol: 0, foreignBuyVol: 0, foreignSellVol: 0 },
    ];
    expect(formatForeignFlowSectionOrUnavailable(allZero)).toEqual(
      formatForeignFlowSection(allZero),
    );
    expect(formatForeignFlowSectionOrUnavailable(allZero).join("\n")).toContain(
      "Dữ liệu không khả dụng",
    );
  });

  it("formatEveningSummaryLines renders the real data unchanged for nonempty movers", () => {
    const lines = formatEveningSummaryLines(makeEveningSummary({ foreignFlowMovers: movers }));
    const text = lines.join("\n");
    expect(text).toContain("VCB");
    expect(text).toContain("HPG");
    expect(text).not.toContain("Dữ liệu không khả dụng");
  });

  it("formatFranceSummaryVI renders the real data unchanged for nonempty movers", () => {
    const msg = formatFranceSummaryVI("06/08/2026", [], [], [], null, null, null, movers);
    expect(msg).toContain("VCB");
    expect(msg).toContain("HPG");
    expect(msg).not.toContain("Dữ liệu không khả dụng");
  });
});
