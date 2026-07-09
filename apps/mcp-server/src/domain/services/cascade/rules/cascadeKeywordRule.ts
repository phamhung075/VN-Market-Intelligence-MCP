/**
 * CascadeKeywordRule — shared rule-record shape
 *
 * Extracted from cascadeEngine.ts (FACTORY-DOMAIN-split-cascade-engine, Step 1).
 * Used by LEGAL_RISK_RULES, POLICY_RULES, INSIDER_DUMP_RULES, MSCI_INCLUSION_RULES,
 * MSCI_WATCHLIST_RULES, MSCI_EXCLUSION_RULES, AGRICULTURE_WEATHER_RULES — kept as a
 * standalone type file (not duplicated per-table) since it is shared by 6 rule tables.
 *
 * Layer: domain/services
 */

/** Simplified cascade rule for legal risk and policy events. */
export interface CascadeKeywordRule {
  /** Machine-readable rule identifier */
  key: string;
  /** Vietnamese keyword that triggers this rule */
  keyword: string;
  /** Affected sector (DomainType as string) */
  sector: string;
  /** Optional: Impact type for weather cascades (rainfall, drought, storm, cold_snap) */
  impactType?: string;
}

