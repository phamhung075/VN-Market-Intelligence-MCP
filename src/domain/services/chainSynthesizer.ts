/**
 * Chain Synthesizer — builds causal narratives from agent findings.
 *
 * Pure domain service. No I/O, no infrastructure imports.
 *
 * Receives a list of ChainLinks (findings from different agents within the
 * same 15-min cycle window for the same stock) and synthesizes them into
 * a SynthesizedChain with:
 *   - A conviction score (0.0–1.0)
 *   - An action recommendation (BUY / SELL / HOLD / WATCH)
 *   - A Vietnamese narrative
 *   - Dimension flags (catalyst, fundamental, price, volume, sector)
 *   - Per-agent confidence breakdown
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChainLink {
  id: number;
  agent: string;
  signalType: string;
  stockCode: string | null;
  findingData: Record<string, unknown>;
  depth: number;
  createdAt: string;
}

export interface SynthesizedChain {
  /** ID of the depth=0 (catalyst) link */
  rootId: number;
  stockCode: string;
  /** Number of links in the chain */
  chainLength: number;
  /** Distinct agents that contributed */
  agents: string[];
  /** Overall conviction score in [0, 1] */
  conviction: number;
  action: "BUY" | "SELL" | "HOLD" | "WATCH";
  /** Vietnamese narrative text */
  narrative: string;
  dimensions: {
    hasCatalyst: boolean;
    hasFundamental: boolean;
    hasPriceAction: boolean;
    hasVolumeConfirm: boolean;
    hasSectorContext: boolean;
  };
  confidenceBreakdown: Array<{ agent: string; confidence: number }>;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function safeNum(val: unknown): number {
  if (typeof val === "number" && isFinite(val)) return val;
  return 0;
}

function safeStr(val: unknown): string {
  if (typeof val === "string") return val;
  return "";
}

function safeBool(val: unknown): boolean {
  return val === true;
}

/**
 * Determine the dominant direction from all links.
 * Returns "bullish" | "bearish" | "neutral".
 */
function dominantDirection(links: ChainLink[]): "bullish" | "bearish" | "neutral" {
  let bull = 0;
  let bear = 0;
  for (const link of links) {
    const dir = safeStr(link.findingData["direction"]);
    if (dir === "bullish") bull++;
    else if (dir === "bearish") bear++;
  }
  if (bull > bear) return "bullish";
  if (bear > bull) return "bearish";
  return "neutral";
}

/**
 * Build Vietnamese narrative from chain links.
 */
function buildNarrative(
  stockCode: string,
  action: string,
  conviction: number,
  links: ChainLink[],
): string {
  const pct = Math.round(conviction * 100);
  const actionVi = action === "BUY" ? "MUA" : action === "SELL" ? "BÁN" : action === "WATCH" ? "THEO DÕI" : "GIỮ";

  const sortedLinks = [...links].sort((a, b) => a.depth - b.depth);

  const lines: string[] = [
    `${stockCode} — ${actionVi}: ${pct}% xác tín`,
  ];

  const DEPTH_LABEL: Record<number, string> = {
    0: "Catalyst",
    1: "Cơ bản",
    2: "Giá",
    3: "Tổng hợp",
  };

  for (const link of sortedLinks) {
    const label = DEPTH_LABEL[link.depth] ?? `Lớp ${link.depth}`;
    const summary = safeStr(link.findingData["summary"]) || link.signalType;
    lines.push(`• ${label}: ${summary} (${link.agent})`);
  }

  const agentCount = new Set(links.map(l => l.agent)).size;
  lines.push(`Xác nhận: ${links.length} lớp từ ${agentCount} agent độc lập`);

  return lines.join("\n");
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Synthesizes a causal chain from a list of agent findings.
 *
 * Returns null if fewer than 2 links are provided — a chain cannot be
 * formed from a single finding.
 *
 * @param links - ChainLink[] from the same cycle window and stock
 */
export function synthesizeChain(links: ChainLink[]): SynthesizedChain | null {
  if (links.length < 2) return null;

  // Sort by depth so catalyst (0) comes first
  const sorted = [...links].sort((a, b) => a.depth - b.depth);

  // ── Find stock code ──────────────────────────────────────────────────────
  const stockCode =
    sorted.find(l => l.stockCode !== null && l.stockCode !== "")?.stockCode ?? "";

  // ── Root ID: depth=0 or first link ──────────────────────────────────────
  const rootLink = sorted[0]!;
  const rootId = rootLink.id;

  // ── Conviction calculation ───────────────────────────────────────────────
  // Base: average of all findingData.confidence values
  const confidences = sorted.map(l => safeNum(l.findingData["confidence"]));
  const base =
    confidences.length > 0
      ? confidences.reduce((s, c) => s + c, 0) / confidences.length
      : 0;

  // Bonus: +0.05 per independent agent that confirms direction
  const uniqueAgents = new Set(sorted.map(l => l.agent));
  const confirmedAgents = sorted.filter(l => safeBool(l.findingData["confirms_direction"]));
  const validatedAgents = sorted.filter(l => safeBool(l.findingData["validates"]));
  const independentConfirmers = new Set([
    ...confirmedAgents.map(l => l.agent),
    ...validatedAgents.map(l => l.agent),
  ]);
  const bonus = independentConfirmers.size * 0.05;

  // Penalty: -0.05 for each link with validates=false or confirms_direction=false
  const penaltyLinks = sorted.filter(
    l =>
      l.findingData["validates"] === false ||
      l.findingData["confirms_direction"] === false,
  );
  const penalty = penaltyLinks.length * 0.05;

  const rawConviction = base + bonus - penalty;
  const conviction = Math.min(1, Math.max(0, rawConviction));

  // ── Action determination ─────────────────────────────────────────────────
  const dir = dominantDirection(sorted);
  let action: SynthesizedChain["action"];
  if (conviction >= 0.8 && dir === "bullish") {
    action = "BUY";
  } else if (conviction >= 0.8 && dir === "bearish") {
    action = "SELL";
  } else if (conviction >= 0.6) {
    action = "WATCH";
  } else {
    action = "HOLD";
  }

  // ── Dimension flags ──────────────────────────────────────────────────────
  const signalTypes = new Set(sorted.map(l => l.signalType));
  const hasCatalyst = signalTypes.has("chain_catalyst");
  const hasFundamental = signalTypes.has("fundamental_validation");
  const hasPriceAction = signalTypes.has("price_confirmation");
  const hasVolumeConfirm = sorted.some(l => safeBool(l.findingData["volume_above_average"]));
  const hasSectorContext = signalTypes.has("cross_validate") ||
    sorted.some(l => safeBool(l.findingData["sector_wide"]));

  const dimensions = {
    hasCatalyst,
    hasFundamental,
    hasPriceAction,
    hasVolumeConfirm,
    hasSectorContext,
  };

  // ── Confidence breakdown ─────────────────────────────────────────────────
  const confidenceBreakdown = sorted.map(l => ({
    agent: l.agent,
    confidence: safeNum(l.findingData["confidence"]),
  }));

  // ── Narrative ────────────────────────────────────────────────────────────
  const narrative = buildNarrative(stockCode || "N/A", action, conviction, sorted);

  return {
    rootId,
    stockCode: stockCode || "N/A",
    chainLength: links.length,
    agents: Array.from(uniqueAgents),
    conviction,
    action,
    narrative,
    dimensions,
    confidenceBreakdown,
  };
}
