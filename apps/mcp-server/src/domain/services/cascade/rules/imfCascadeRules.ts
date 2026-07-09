/**
 * IMF_CASCADE_RULES — IMF sentiment-score cascade rule table
 *
 * size-justification: ~115L — 11 sentiment-threshold rules (Task 1296b),
 * each a self-contained literal object (id/name/threshold/operator/sectors/
 * impact/reasoning/examples). Fire when imfSentiment.sentiment crosses the
 * threshold AND imfSentiment.confidence >= IMF_CONFIDENCE_MIN. Exported for
 * use in chainSynthesizer and tests. Extracted from cascadeEngine.ts
 * (FACTORY-DOMAIN-split-cascade-engine, Step 1) — pure data move, no
 * behavior change. Consumed via the cascade/rules barrel.
 *
 * Layer: domain/services
 */

export interface ImfCascadeRule {
  id: string;
  name: string;
  /** Sentiment threshold (signal must exceed this to fire) */
  sentimentThreshold: number;
  /** ">" for bullish rules, "<" for bearish rules */
  operator: ">" | "<";
  /** Sector names affected */
  targetSectors: string[];
  /** Signed impact delta for conviction scoring */
  impact: number;
  reasoning: string;
  /** Example stocks for this rule */
  examples: string[];
}

export const IMF_CASCADE_RULES: ImfCascadeRule[] = [
  {
    id: "imf_rule_01",
    name: "IMF Global Growth ↑ → Banking NIM Expansion",
    sentimentThreshold: 0.5,
    operator: ">",
    targetSectors: ["banking"],
    impact: 0.45,
    reasoning: "Higher global growth → ↑ credit demand, ↑ NIM, ↓ defaults",
    examples: ["VCB", "BID", "MBB", "HDB"],
  },
  {
    id: "imf_rule_02",
    name: "IMF Global Growth ↓ → Real Estate Contraction",
    sentimentThreshold: -0.5,
    operator: "<",
    targetSectors: ["real_estate"],
    impact: -0.35,
    reasoning: "Lower growth → ↓ investment appetite, financing stress, 2Q lag",
    examples: ["VRE", "NVL", "DXG"],
  },
  {
    id: "imf_rule_03",
    name: "IMF Advanced Economy Growth ↑ → VN Export Boom",
    sentimentThreshold: 0.3,
    operator: ">",
    targetSectors: ["export", "manufacturing"],
    impact: 0.35,
    reasoning: "US/EU growth → ↑ demand for VN textiles, electronics, components",
    examples: ["FPT", "ELC", "VCG", "SAB"],
  },
  {
    id: "imf_rule_04",
    name: "IMF USD Strength ↑ → Agriculture Export Competitiveness ↑",
    sentimentThreshold: 0.3,
    operator: ">",
    targetSectors: ["agriculture"],
    impact: 0.10,
    reasoning: "USD strength → VND weakness → ↑ export revenue (in USD terms)",
    examples: ["BVF", "DHG", "MSN", "HAG"],
  },
  {
    id: "imf_rule_05",
    name: "IMF Inflation ↑ → Banking NIM Compression",
    sentimentThreshold: -0.4,
    operator: "<",
    targetSectors: ["banking"],
    impact: -0.08,
    reasoning: "↑ inflation → real lending rates ↓ → NIM pressure (mitigated by SBV policy)",
    examples: ["VCB", "BID", "HDB"],
  },
  {
    id: "imf_rule_06",
    name: "IMF EM Capital Flight ↑ → Real Estate Capital Outflow",
    sentimentThreshold: -0.6,
    operator: "<",
    targetSectors: ["real_estate"],
    impact: -0.25,
    reasoning: "EM debt crisis → ↓↓ FDI, property market stress (rare, severe)",
    examples: ["VRE", "NVL", "DXG"],
  },
  {
    id: "imf_rule_07",
    name: "IMF VN Fiscal Risk ↑ → Banking Credit Tightening",
    sentimentThreshold: -0.4,
    operator: "<",
    targetSectors: ["banking"],
    impact: -0.12,
    reasoning: "↑ VN debt → ↑ sovereign risk → ↑ bond yield, credit contraction",
    examples: ["VCB", "BID", "PSI"],
  },
  {
    id: "imf_rule_08",
    name: "IMF Oil Price ↑ → Energy Sector Outperformance",
    sentimentThreshold: 0.4,
    operator: ">",
    targetSectors: ["energy", "oil_gas"],
    impact: 0.14,
    reasoning: "↑ oil forecast → ↑ revenue for GAS, PVD, PVOil",
    examples: ["GAS", "PVD", "POW"],
  },
  {
    id: "imf_rule_09",
    name: "IMF FDI Outlook ↑ → Tech/Industrials Rally",
    sentimentThreshold: 0.3,
    operator: ">",
    targetSectors: ["tech", "manufacturing"],
    impact: 0.11,
    reasoning: "↑ IMF FDI confidence → ↑ foreign investment inflows, supply chain relocation to VN",
    examples: ["FPT", "ELC", "VCG", "LPB"],
  },
  {
    id: "imf_rule_10",
    name: "IMF ASEAN Growth ↑ → VN Retail/Tourism Rally",
    sentimentThreshold: 0.2,
    operator: ">",
    targetSectors: ["retail", "tourism"],
    impact: 0.09,
    reasoning: "↑ ASEAN growth → ↑ regional demand, tourism recovery (spillover effect)",
    examples: ["MWG", "VJC", "VIC", "HVN"],
  },
  {
    id: "imf_rule_11",
    name: "IMF Capital Account Stress ↑ → FX Derivatives Demand",
    sentimentThreshold: -0.3,
    operator: "<",
    targetSectors: ["banking"],
    impact: 0.08,
    reasoning: "↑ capital account pressure → ↑ currency hedging demand, derivatives trading volume",
    examples: ["VCB", "BID", "HDB", "CTS"],
  },
];
