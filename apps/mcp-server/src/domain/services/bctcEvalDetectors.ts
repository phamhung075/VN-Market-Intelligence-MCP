/**
 * bctcEvalDetectors.ts — Stage 4-6 BCTC eval detector PURE functions
 *
 * DDD: domain layer — NO DB imports, NO HTTP, NO side effects.
 * Input rows in → EvalStageResult out.
 *
 * Stage 4: TABLE_RECONSTRUCT — label/code coverage, dups, blank-label rows
 * Stage 5: MARKDOWN_RENDER   — roundtrip row match ratio + value drift
 * Stage 6: STRUCTURED_EXTRACT — golden row match, balance_pass as signal only
 *
 * Thresholds: injected as parameter (read from docs/data/bctc-eval-thresholds.json
 * at startup, never hardcoded here).
 *
 * schema_version: "1", detector_version: "v1"
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BctcTableRow {
  code: string | null;
  label: string | null;
  value_current: number | null;
  value_prior: number | null;
  row_order: number;
  /**
   * statement_section: the section this row belongs to
   * (e.g. "balance_sheet", "income_statement", "cash_flow").
   * Used by Stage-4 to distinguish cross-section dups (valid for VN parent-company
   * reports) from same-section dups (genuine OCR artifacts → RED).
   * Optional / nullable: rows without section info are treated conservatively
   * as same-section (fallback → RED if dup).
   */
  statement_section?: string | null;
}

export interface BctcMdTablesRecord {
  md_tables_json: string; // JSON array of markdown pipe-table strings
  table_count: number;
  page_count: number;
}

export interface FinancialReportRecord {
  balance_pass: number | null; // 0 or 1 (SQLite integer)
  net_revenue: number | null;
  net_profit: number | null;
  gross_profit: number | null;
  parsed_at: string;
}

export interface GateFailure {
  gate_id: string;
  threshold: number | string;
  actual: number | string;
  provenance: string;
}

export type EvalStatus = "green" | "yellow" | "red";

export interface EvalStageResult {
  status: EvalStatus;
  metrics_json: Record<string, unknown>;
  gate_failures_json: GateFailure[];
  golden_diff_json: Record<string, unknown>;
}

// Re-export for convenience (used by application layer)
export type { EvalStageResult as BctcEvalStageResult };

export interface Stage4Thresholds {
  label_coverage_min: number;
  code_coverage_min: number;
  exact_dup_max: number;
  value_blank_label_max: number;
}

export interface Stage5Thresholds {
  roundtrip_row_match_min: number;
  roundtrip_value_drift_max: number;
}

export interface Stage6Thresholds {
  golden_row_match_min: number;
  balance_pass_is_signal_only: boolean;
  qoq_outlier_threshold: number;
}

export interface BctcEvalThresholds {
  "4_TABLE_RECONSTRUCT": Stage4Thresholds;
  "5_MARKDOWN_RENDER": Stage5Thresholds;
  "6_STRUCTURED_EXTRACT": Stage6Thresholds;
}

// ─── Stage 4: TABLE_RECONSTRUCT ──────────────────────────────────────────────

/**
 * evalStage4TableReconstruct — pure function, no DB imports.
 *
 * Metrics:
 *   label_coverage: fraction of rows with non-null, non-empty label
 *   code_coverage:  fraction of rows with non-null, non-empty code
 *   exact_dup_count: duplicate (label, value_current) pairs
 *   value_blank_label_count: rows where value_current is set but label is null/empty
 *   total_rows: total row count
 *
 * Hard gates (→ red):
 *   label_coverage < label_coverage_min
 *   code_coverage  < code_coverage_min
 *   exact_dup_count > exact_dup_max
 *   value_blank_label_count > value_blank_label_max
 */
export function evalStage4TableReconstruct(
  rows: BctcTableRow[],
  thresholds: Stage4Thresholds,
): EvalStageResult {
  const totalRows = rows.length;
  const gateFailures: GateFailure[] = [];

  if (totalRows === 0) {
    return {
      status: "yellow",
      metrics_json: {
        label_coverage: 0,
        code_coverage: 0,
        exact_dup_count: 0,
        cross_section_dup_count: 0,
        value_blank_label_count: 0,
        total_rows: 0,
      },
      gate_failures_json: [],
      golden_diff_json: {},
    };
  }

  // label_coverage: rows with non-null, non-empty label
  const labelledRows = rows.filter(
    (r) => r.label !== null && r.label.trim() !== "",
  ).length;
  const labelCoverage = labelledRows / totalRows;

  // code_coverage: rows with non-null, non-empty code
  const codedRows = rows.filter(
    (r) => r.code !== null && r.code.trim() !== "",
  ).length;
  const codeCoverage = codedRows / totalRows;

  // dup detection: separate same-section dups (RED) from cross-section dups (YELLOW warning).
  //
  // Algorithm:
  //   For each (label, value_current) pair, collect the set of statement_section values
  //   that contain it. Rows with null/undefined section are grouped under the sentinel
  //   "__unknown__" — treated conservatively as same-section if there is more than one
  //   occurrence (can't prove cross-section validity without section info).
  //
  //   same-section dup: a (label, value_current) key appears 2+ times in the SAME section
  //                     (or under "__unknown__" where any 2+ occurrences are conservative RED).
  //   cross-section dup: a (label, value_current) key appears in 2+ DIFFERENT known sections,
  //                      with NO same-section repetition within any individual section.
  //                      Semantically valid for VN parent-company (báo cáo riêng) reports.
  //
  // exactDupCount      → same-section dups → hard RED gate (unchanged behaviour).
  // crossSectionDupCount → cross-section only dups → YELLOW warning (no red gate).

  // Map: labelValKey → Map<section, count>
  const sectionCountMap = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = `${r.label ?? ""}::${r.value_current ?? ""}`;
    const section =
      r.statement_section !== null &&
      r.statement_section !== undefined &&
      r.statement_section.trim() !== ""
        ? r.statement_section.trim()
        : "__unknown__";
    if (!sectionCountMap.has(key)) sectionCountMap.set(key, new Map());
    const sMap = sectionCountMap.get(key)!;
    sMap.set(section, (sMap.get(section) ?? 0) + 1);
  }

  let exactDupCount = 0;        // same-section dups (→ RED)
  let crossSectionDupCount = 0; // cross-section only dups (→ YELLOW warning)

  for (const sMap of sectionCountMap.values()) {
    // Check for same-section repetition (count > 1 within any single section bucket)
    const hasSameSectionDup = Array.from(sMap.values()).some((c) => c > 1);
    if (hasSameSectionDup) {
      exactDupCount++;
      continue;
    }
    // No same-section dup. Check if it spans multiple sections → cross-section.
    const distinctSections = sMap.size;
    if (distinctSections > 1) {
      // All distinct sections must be KNOWN (not __unknown__) for cross-section to be valid.
      // If any occurrence is __unknown__, treat conservatively as same-section.
      const hasUnknownSection = sMap.has("__unknown__");
      if (hasUnknownSection) {
        exactDupCount++;
      } else {
        crossSectionDupCount++;
      }
    }
  }

  // value_blank_label_count: has a value but label is null/empty
  const valueBlankLabelCount = rows.filter(
    (r) =>
      r.value_current !== null &&
      (r.label === null || r.label.trim() === ""),
  ).length;

  // Gate checks
  if (labelCoverage < thresholds.label_coverage_min) {
    gateFailures.push({
      gate_id: "label_coverage",
      threshold: thresholds.label_coverage_min,
      actual: Math.round(labelCoverage * 1000) / 1000,
      provenance: "bctc_table_rows.label",
    });
  }
  if (codeCoverage < thresholds.code_coverage_min) {
    gateFailures.push({
      gate_id: "code_coverage",
      threshold: thresholds.code_coverage_min,
      actual: Math.round(codeCoverage * 1000) / 1000,
      provenance: "bctc_table_rows.code",
    });
  }
  if (exactDupCount > thresholds.exact_dup_max) {
    gateFailures.push({
      gate_id: "exact_dup_count",
      threshold: thresholds.exact_dup_max,
      actual: exactDupCount,
      provenance: "bctc_table_rows(label,value_current)",
    });
  }
  if (valueBlankLabelCount > thresholds.value_blank_label_max) {
    gateFailures.push({
      gate_id: "value_blank_label_count",
      threshold: thresholds.value_blank_label_max,
      actual: valueBlankLabelCount,
      provenance: "bctc_table_rows.label=NULL with value_current set",
    });
  }

  // Status:
  //   RED  → any hard gate failed (label_coverage, code_coverage, exact_dup_count, value_blank_label)
  //   YELLOW → no hard gate failure but cross-section dups detected (informational warning)
  //   GREEN  → no hard gate failure and no cross-section dups
  const status: EvalStatus =
    gateFailures.length > 0
      ? "red"
      : crossSectionDupCount > 0
        ? "yellow"
        : "green";

  return {
    status,
    metrics_json: {
      label_coverage: Math.round(labelCoverage * 1000) / 1000,
      code_coverage: Math.round(codeCoverage * 1000) / 1000,
      exact_dup_count: exactDupCount,
      cross_section_dup_count: crossSectionDupCount,
      value_blank_label_count: valueBlankLabelCount,
      total_rows: totalRows,
    },
    gate_failures_json: gateFailures,
    golden_diff_json: {},
  };
}

// ─── Stage 5: MARKDOWN_RENDER ─────────────────────────────────────────────────

/**
 * evalStage5MarkdownRender — pure function.
 *
 * Computes round-trip match ratio between markdown table rows and stage 4 rows.
 * mdJson: parsed JSON from bctc_md_tables.md_tables_json (array of md table strings).
 * stage4Rows: the same BctcTableRow[] used in stage 4.
 *
 * Metrics:
 *   roundtrip_row_match_ratio: fraction of stage4 rows found in parsed md tables
 *   roundtrip_value_drift_max: max relative value drift between matched rows
 *   md_table_count: number of markdown tables parsed
 */
export function evalStage5MarkdownRender(
  mdJson: unknown,
  stage4Rows: BctcTableRow[],
  thresholds: Stage5Thresholds,
): EvalStageResult {
  const gateFailures: GateFailure[] = [];

  // Parse md_tables_json (array of markdown pipe-table strings)
  let mdTables: string[] = [];
  if (Array.isArray(mdJson)) {
    mdTables = mdJson.filter((x): x is string => typeof x === "string");
  }

  const mdTableCount = mdTables.length;

  if (stage4Rows.length === 0 || mdTableCount === 0) {
    // No data — yellow (cannot evaluate)
    return {
      status: "yellow",
      metrics_json: {
        roundtrip_row_match_ratio: 0,
        roundtrip_value_drift_max: 0,
        md_table_count: mdTableCount,
      },
      gate_failures_json: [],
      golden_diff_json: {},
    };
  }

  // Extract all numeric values from markdown tables (simple heuristic)
  const mdValueSet = new Set<string>();
  for (const table of mdTables) {
    const lines = table.split("\n");
    for (const line of lines) {
      if (!line.includes("|")) continue;
      const cells = line.split("|").map((c) => c.trim());
      for (const cell of cells) {
        const num = parseFloat(cell.replace(/,/g, ""));
        if (!isNaN(num)) mdValueSet.add(String(num));
      }
    }
  }

  // Match stage4 rows by value_current presence in md tables
  let matched = 0;
  let maxDrift = 0;
  const rowsWithValue = stage4Rows.filter((r) => r.value_current !== null);

  for (const row of rowsWithValue) {
    const val = row.value_current!;
    const valStr = String(val);
    if (mdValueSet.has(valStr)) {
      matched++;
    } else {
      // Try approximate match (within 1% drift)
      let bestDrift = 1;
      for (const mdVal of mdValueSet) {
        const mdNum = parseFloat(mdVal);
        if (!isNaN(mdNum) && Math.abs(val) > 1e-9) {
          const drift = Math.abs(val - mdNum) / Math.abs(val);
          if (drift < bestDrift) bestDrift = drift;
        }
      }
      if (bestDrift < 0.01) {
        matched++;
        maxDrift = Math.max(maxDrift, bestDrift);
      }
    }
  }

  const rowMatchRatio =
    rowsWithValue.length > 0 ? matched / rowsWithValue.length : 1;

  if (rowMatchRatio < thresholds.roundtrip_row_match_min) {
    gateFailures.push({
      gate_id: "roundtrip_row_match_ratio",
      threshold: thresholds.roundtrip_row_match_min,
      actual: Math.round(rowMatchRatio * 1000) / 1000,
      provenance: "bctc_md_tables vs bctc_table_rows",
    });
  }
  if (maxDrift > thresholds.roundtrip_value_drift_max) {
    gateFailures.push({
      gate_id: "roundtrip_value_drift_max",
      threshold: thresholds.roundtrip_value_drift_max,
      actual: Math.round(maxDrift * 10000) / 10000,
      provenance: "bctc_md_tables value drift",
    });
  }

  const status: EvalStatus = gateFailures.length > 0 ? "red" : "green";

  return {
    status,
    metrics_json: {
      roundtrip_row_match_ratio: Math.round(rowMatchRatio * 1000) / 1000,
      roundtrip_value_drift_max: Math.round(maxDrift * 10000) / 10000,
      md_table_count: mdTableCount,
    },
    gate_failures_json: gateFailures,
    golden_diff_json: {},
  };
}

// ─── Stage 6: STRUCTURED_EXTRACT ─────────────────────────────────────────────

/**
 * evalStage6StructuredExtract — pure function.
 *
 * CRITICAL: balance_pass is SIGNAL not gate.
 * thresholds.balance_pass_is_signal_only = true → balance_pass=false NEVER makes
 * stage 6 red. It is emitted in metrics_json as informational only.
 *
 * Hard gate: golden_row_match_ratio (requires goldenAnchors to be non-empty).
 * Soft signals: balance_pass=false, qoq_outlier_flags.
 *
 * goldenAnchors: known expected scalar keys to check. If empty, golden_row_match
 * is skipped (not enough data to evaluate).
 */
export function evalStage6StructuredExtract(
  financialReport: FinancialReportRecord,
  goldenAnchors: string[],
  thresholds: Stage6Thresholds,
  balancePassValue?: boolean | null,
): EvalStageResult {
  const gateFailures: GateFailure[] = [];
  const warnings: string[] = [];

  // balance_pass as SIGNAL only — never a gate
  const balancePass =
    balancePassValue !== undefined && balancePassValue !== null
      ? balancePassValue
      : financialReport.balance_pass === 1;

  if (!balancePass) {
    warnings.push("balance_pass=false (signal only, not a gate)");
  }

  // Compute golden row match — how many golden anchor fields have non-null values
  let goldenRowMatchRatio = 1.0;
  const missingRows: string[] = [];
  const goldenDiff: Record<string, unknown> = {};

  if (goldenAnchors.length > 0) {
    const reportValues: Record<string, unknown> = {
      net_revenue: financialReport.net_revenue,
      net_profit: financialReport.net_profit,
      gross_profit: financialReport.gross_profit,
    };

    let matched = 0;
    for (const anchor of goldenAnchors) {
      const val = reportValues[anchor];
      if (val !== null && val !== undefined) {
        matched++;
      } else {
        missingRows.push(anchor);
      }
    }
    goldenRowMatchRatio = matched / goldenAnchors.length;

    if (missingRows.length > 0) {
      goldenDiff.missing_rows = missingRows;
      goldenDiff.extra_rows = [];
    }

    if (goldenRowMatchRatio < thresholds.golden_row_match_min) {
      gateFailures.push({
        gate_id: "golden_row_match_ratio",
        threshold: thresholds.golden_row_match_min,
        actual: Math.round(goldenRowMatchRatio * 1000) / 1000,
        provenance: "financial_reports scalar columns vs golden anchors",
      });
    }
  }

  // QoQ outlier detection (informational — yellow signal if triggered)
  const qoqOutlierFlags: string[] = [];
  // Cannot compute QoQ from a single report — would need prior period.
  // This hook is here for when computeBctcEval passes prior-period data in future.

  // Determine status:
  // red = hard gate fails (golden_row_match)
  // yellow = soft warnings only (balance_pass=false, qoq outlier, golden_diff non-empty but within tolerance)
  // green = all hard gates pass, no warnings

  let status: EvalStatus = "green";
  if (gateFailures.length > 0) {
    status = "red";
  } else if (!balancePass || qoqOutlierFlags.length > 0 || missingRows.length > 0) {
    status = "yellow";
  }

  return {
    status,
    metrics_json: {
      golden_row_match_ratio: Math.round(goldenRowMatchRatio * 1000) / 1000,
      balance_pass: balancePass,
      balance_pass_is_signal_only: thresholds.balance_pass_is_signal_only,
      qoq_outlier_flags: qoqOutlierFlags,
      warnings,
    },
    gate_failures_json: gateFailures,
    golden_diff_json: goldenDiff,
  };
}
