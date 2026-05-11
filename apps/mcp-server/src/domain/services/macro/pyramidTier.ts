/**
 * Task 1880b — Pyramid Tier Classifier (domain pure function)
 *
 * Classifies an asset class string into one of five pyramid tiers:
 *   cash | bonds | equity | alt | speculative
 *
 * Rules:
 *   - Input normalized: lowercase + trim before lookup
 *   - Static Map lookup — no regex, no I/O, no randomness
 *   - Unknown input → { tier: null, reason: "unknown_asset_class" }
 *   - Never throws
 *
 * VN market context: covers HOSE/HNX/UPCOM listed equity plus global
 * asset classes relevant to Vietnamese retail investors.
 *
 * @module domain/services/macro/pyramidTier
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PyramidTier = "cash" | "bonds" | "equity" | "alt" | "speculative";

export interface PyramidTierResult {
  tier: PyramidTier | null;
  reason?: string;
  tier_description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static lookup map (18 entries — arch brief §5)
// ─────────────────────────────────────────────────────────────────────────────

const TIER_MAP: Map<string, PyramidTier> = new Map([
  // cash tier
  ["cash",          "cash"],
  ["money market",  "cash"],
  ["t-bill",        "cash"],

  // bonds tier
  ["government bond", "bonds"],
  ["corporate bond",  "bonds"],
  ["bond",            "bonds"],

  // equity tier
  ["vn equity", "equity"],
  ["equity",    "equity"],
  ["stock",     "equity"],

  // alt tier
  ["reit",           "alt"],
  ["gold",           "alt"],
  ["commodity",      "alt"],
  ["futures",        "alt"],
  ["private equity", "alt"],

  // speculative tier
  ["crypto",       "speculative"],
  ["nft",          "speculative"],
  ["warrant",      "speculative"],
  ["penny stock",  "speculative"],
]);

// ─────────────────────────────────────────────────────────────────────────────
// Tier descriptions (surface in MCP output per arch brief §6)
// ─────────────────────────────────────────────────────────────────────────────

const TIER_DESCRIPTIONS: Record<PyramidTier, string> = {
  cash:        "Highly liquid, capital-preserving instruments — lowest risk",
  bonds:       "Fixed-income securities — moderate risk, predictable yield",
  equity:      "Listed equity — higher risk, higher return potential",
  alt:         "Alternative assets (real assets, commodities) — diversification, moderate-high risk",
  speculative: "High-volatility, high-risk instruments — speculative capital only",
};

// ─────────────────────────────────────────────────────────────────────────────
// Classifier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify an asset class string into a pyramid tier.
 *
 * @param assetClass - Free-text asset class name (case-insensitive, whitespace-trimmed)
 * @returns PyramidTierResult — always returns, never throws
 *
 * @example
 * classifyPyramidTier("VN equity") // → { tier: "equity", tier_description: "..." }
 * classifyPyramidTier("crypto")    // → { tier: "speculative", tier_description: "..." }
 * classifyPyramidTier("unknown")   // → { tier: null, reason: "unknown_asset_class" }
 */
export function classifyPyramidTier(assetClass: string): PyramidTierResult {
  const normalized = assetClass.toLowerCase().trim();
  const tier = TIER_MAP.get(normalized) ?? null;

  if (tier === null) {
    return { tier: null, reason: "unknown_asset_class" };
  }

  return {
    tier,
    tier_description: TIER_DESCRIPTIONS[tier],
  };
}
