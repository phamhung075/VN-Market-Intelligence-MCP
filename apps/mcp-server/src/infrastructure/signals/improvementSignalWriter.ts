/**
 * improvementSignalWriter.ts — Output adapter for improvement proposal docs
 *
 * Sprint SELF-IMPROVE-GATE Phase 2 lane-B substrate (TASK-4).
 *
 * DDD layer: Infrastructure / Signals (output adapter)
 *
 * Responsibilities:
 *   - Write docs/improvement-proposals/{id}.md in DRAFT form
 *   - Append a row to docs/signals/DASHBOARD.md ## po section
 *
 * Throws on file-write failure — caller (selfImproveOrchestratorJob.ts) wraps
 * in try/catch per C-5 isolation rule. Does NOT commit to git.
 * Creates parent directories if absent (R-4 blueprint requirement).
 */

import { resolve, dirname } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import type { DegradationFinding } from "../../domain/services/degradationRules.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

// Root of the monorepo (relative to this compiled file's location)
// __dirname in Bun is the directory of the compiled/source file
const REPO_ROOT = resolve(__dirname, "../../../../../../");

const PROPOSALS_DIR = resolve(REPO_ROOT, "docs/improvement-proposals");
const DASHBOARD_PATH = resolve(REPO_ROOT, "docs/signals/DASHBOARD.md");

// ─────────────────────────────────────────────────────────────────────────────
// FIX_AREA_TO_AGENT mapping (C-1 — typed derivation, no free-text parsing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps fix_area values from DEGRADATION_CAUSE_MAP to the responsible agent
 * and a concrete file hint. Used to populate target_agent + target_files in
 * the proposal doc — NEVER parses the "suggested_fix" prose (C-1 hard).
 *
 * ADD entries as new fix_areas are registered in DEGRADATION_CAUSE_MAP.
 * Do NOT remove or rename existing entries without updating DEGRADATION_CAUSE_MAP.
 */
export const FIX_AREA_TO_AGENT: Record<
  string,
  { target_agent: string; area_hint: string }
> = {
  "apps/mcp-server/src/scheduler/alerts/": {
    target_agent: "dev-mcp-server",
    area_hint: "apps/mcp-server/src/scheduler/alerts/",
  },
  "apps/mcp-server/src/scheduler/news/": {
    target_agent: "dev-mcp-server",
    area_hint: "apps/mcp-server/src/scheduler/news/",
  },
  "apps/technical-analysis/": {
    target_agent: "dev-technical-analysis",
    area_hint: "apps/technical-analysis/",
  },
  manual: {
    target_agent: "UNRESOLVED",
    area_hint: "",
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ImprovementProposalFields
// ─────────────────────────────────────────────────────────────────────────────

export interface ImprovementProposalFields {
  id: string; // IMP-{YYYYMMDD}-{slug}
  created_at: string; // ISO-8601 UTC
  created_by: "system-auditor";
  status: "DRAFT";
  weakness: string;
  evidence_source: string; // 'improve_check_log'
  evidence_data: string; // "7d_rate=..., 30d_rate=..., delta=..."
  proposed_change: string; // from DEGRADATION_CAUSE_MAP.suggested_fix
  lane: "LANE-A" | "LANE-B";
  lane_rationale: string;
  success_signal: string;
  rollback: string;
  target_agent: string; // From FIX_AREA_TO_AGENT or 'UNRESOLVED'
  target_files: string[]; // [area_hint] or []
}

// ─────────────────────────────────────────────────────────────────────────────
// Slug derivation (Open Point ii — architect canonical rule)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the proposal document slug from a degradation finding.
 * Rule: {signal_type_kebab}-{detection_class_lower}
 * Date: YYYYMMDD from the run date (UTC).
 */
export function deriveProposalId(
  signal_type: string,
  detection_class: string,
  runDate: string, // YYYY-MM-DD
): string {
  const kebabType = signal_type.replace(/_/g, "-");
  // Normalize detection class: lowercase + replace underscores with hyphens
  // e.g. PERSISTENTLY_LOW → persistently-low, DEGRADED → degraded
  const kebabClass = detection_class.toLowerCase().replace(/_/g, "-");
  const dateCompact = runDate.replace(/-/g, "");
  return `IMP-${dateCompact}-${kebabType}-${kebabClass}`;
}

/**
 * Derive the weakness identifier (dedup key).
 * Rule: ${signal_type}_${detection_class}
 */
export function deriveWeaknessIdentifier(
  signal_type: string,
  detection_class: string,
): string {
  return `${signal_type}_${detection_class}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveTargetAgent (C-1 structural lookup, no prose parsing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve target_agent and target_files from a fix_area string.
 * Looks up FIX_AREA_TO_AGENT — never parses free-text prose.
 * Unknown fix_area → UNRESOLVED, [] (fail-safe per C-1).
 */
export function resolveTargetAgent(fix_area: string): {
  target_agent: string;
  target_files: string[];
} {
  const entry = FIX_AREA_TO_AGENT[fix_area];
  if (entry) {
    return {
      target_agent: entry.target_agent,
      target_files: entry.area_hint ? [entry.area_hint] : [],
    };
  }
  return { target_agent: "UNRESOLVED", target_files: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildProposalMarkdown
// ─────────────────────────────────────────────────────────────────────────────

function buildProposalMarkdown(fields: ImprovementProposalFields): string {
  const targetFilesJson = JSON.stringify(fields.target_files);
  return `---
id: ${fields.id}
created_at: ${fields.created_at}
created_by: ${fields.created_by}
status: ${fields.status}
lane: ${fields.lane}
---

## Weakness

${fields.weakness}

## Evidence

- Source: ${fields.evidence_source} (system-auditor detect run ${fields.created_at})
- ${fields.evidence_data}

## Proposed Change

${fields.proposed_change}

### Structured Target (C-1 — REQUIRED for agent-father dispatch)

**target_agent:** ${fields.target_agent}
**target_files:** ${targetFilesJson}

## Lane Rationale

${fields.lane_rationale}

## Success Signal

${fields.success_signal}

## Rollback

${fields.rollback}

## Gate Proof

_To be filled by QA after GATE-PROOF-1..5 procedure._
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// cooldownDocExists — check if a DRAFT/ARCHITECT-REVIEWED doc already exists
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan docs/improvement-proposals/ for an existing file matching
 * IMP-*-{signal_type_kebab}-{detection_class_lower}.md.
 * Returns true if a duplicate DRAFT/ARCHITECT-REVIEWED doc exists.
 */
export function cooldownDocExists(
  signal_type: string,
  detection_class: string,
  proposalsDir: string = PROPOSALS_DIR,
): boolean {
  if (!existsSync(proposalsDir)) return false;

  const kebabType = signal_type.replace(/_/g, "-");
  const lowerClass = detection_class.toLowerCase();
  const suffix = `-${kebabType}-${lowerClass}.md`;

  try {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const files = readdirSync(proposalsDir);
    return files.some(
      (f: string) =>
        f.startsWith("IMP-") && f.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// writeImprovementProposal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Writes docs/improvement-proposals/{id}.md in DRAFT form.
 * Throws on file-write failure (caller wraps in try/catch — C-5 non-fatal).
 * Creates parent directories if absent (R-4).
 * Does NOT commit — main terminal serializes commits.
 */
export async function writeImprovementProposal(
  fields: ImprovementProposalFields,
  proposalsDir: string = PROPOSALS_DIR,
): Promise<void> {
  mkdirSync(proposalsDir, { recursive: true });

  const filePath = resolve(proposalsDir, `${fields.id}.md`);
  const content = buildProposalMarkdown(fields);

  writeFileSync(filePath, content, "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// appendDashboardRow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appends a row to docs/signals/DASHBOARD.md ## po section.
 * Creates file + section if absent. Throws on write failure.
 * New row is always appended AFTER existing rows (not prepended).
 */
export async function appendDashboardRow(
  id: string,
  createdAt: string,
  summary: string,
  proposalPath: string,
  dashboardPath: string = DASHBOARD_PATH,
): Promise<void> {
  // Ensure directory exists
  mkdirSync(dirname(dashboardPath), { recursive: true });

  const newRow = `| ${id} | ${createdAt} | system-auditor | improvement_proposal | ${summary.slice(0, 40)} | NEW | ${proposalPath} |`;

  let content = "";
  if (existsSync(dashboardPath)) {
    content = readFileSync(dashboardPath, "utf8");
  }

  const SECTION_HEADER = "## po";
  const TABLE_HEADER =
    "| id | created_at | created_by | type | summary | status | path |";
  const TABLE_SEP =
    "|---|---|---|---|---|---|---|";

  if (!content.includes(SECTION_HEADER)) {
    // Create section from scratch
    if (content && !content.endsWith("\n")) content += "\n";
    content += `\n${SECTION_HEADER}\n\n${TABLE_HEADER}\n${TABLE_SEP}\n${newRow}\n`;
  } else {
    // Find the ## po section and append after existing rows
    const sectionIdx = content.indexOf(SECTION_HEADER);
    const afterSection = content.slice(sectionIdx);

    if (!afterSection.includes(TABLE_HEADER)) {
      // Section exists but has no table yet
      const insertAt = content.indexOf(SECTION_HEADER) + SECTION_HEADER.length;
      content =
        content.slice(0, insertAt) +
        `\n\n${TABLE_HEADER}\n${TABLE_SEP}\n${newRow}\n` +
        content.slice(insertAt);
    } else {
      // Append row at the end of the file (rows are ordered by append time)
      if (!content.endsWith("\n")) content += "\n";
      content += newRow + "\n";
    }
  }

  writeFileSync(dashboardPath, content, "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// buildProposalFields — orchestrator helper to construct ImprovementProposalFields
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the ImprovementProposalFields from a DegradationFinding + runDate.
 * Encodes the lane classification rule (LANE-B for DEGRADED/PERSISTENTLY_LOW,
 * LANE-A for COVERAGE_GAP) at emit time.
 */
export function buildProposalFields(
  finding: DegradationFinding,
  runDate: string, // YYYY-MM-DD
  runDatetime: string, // ISO-8601
): ImprovementProposalFields {
  const id = deriveProposalId(finding.signal_type, finding.detection_class, runDate);
  const { target_agent, target_files } = resolveTargetAgent(finding.fix_area);

  const lane: "LANE-A" | "LANE-B" =
    finding.detection_class === "COVERAGE_GAP" ? "LANE-A" : "LANE-B";

  const deltaStr =
    finding.current_rate !== null && finding.baseline_rate !== null
      ? `${((finding.baseline_rate - finding.current_rate) * 100).toFixed(1)}pp`
      : "n/a";

  const evidenceData = [
    `7d_rate=${finding.current_rate !== null ? (finding.current_rate * 100).toFixed(1) + "%" : "n/a"}`,
    `30d_rate=${finding.baseline_rate !== null ? (finding.baseline_rate * 100).toFixed(1) + "%" : "n/a"}`,
    `delta=${deltaStr}`,
    `sample_count_7d=${finding.sample_count_7d}`,
    `sample_count_30d=${finding.sample_count_30d}`,
  ].join(", ");

  const weakness =
    finding.detection_class === "COVERAGE_GAP"
      ? `Signal-type \`${finding.signal_type}\` has coverage gap: agent signals present but no resolved outcomes in the last 30 days.`
      : `Signal-type \`${finding.signal_type}\` shows accuracy ${finding.detection_class === "DEGRADED" ? "degradation" : "persistent weakness"}: ` +
        `7-day rate ${finding.current_rate !== null ? (finding.current_rate * 100).toFixed(1) + "%" : "n/a"} vs ` +
        `30-day baseline ${finding.baseline_rate !== null ? (finding.baseline_rate * 100).toFixed(1) + "%" : "n/a"} (delta ${deltaStr}).`;

  const laneRationale =
    lane === "LANE-B"
      ? `LANE-B: Signal accuracy degradation has a hard machine-checkable gate (unit test suite goes red on injected regression). Proof required before any auto-dispatch.`
      : `LANE-A: Coverage gap fix is a flow/config change (watchlist entry, signal seeding), not a code regression with a unit-test backstop. PO approves manually.`;

  const successSignal =
    lane === "LANE-B"
      ? `Unit test suite for \`detectDegradedSignalTypes()\` goes RED when threshold is tightened (regression injected). Reverting the injection returns suite to GREEN. Proof recorded in this doc's Gate Proof section.`
      : `Next system-auditor Tier-2 sweep confirms 0 coverage gaps for \`${finding.signal_type}\`.`;

  const rollback =
    lane === "LANE-B"
      ? `Revert the code changes that fix the degradation. Accuracy metric will return to prior state (data-dependent, not instant).`
      : `Remove the watchlist entry or signal seeding that introduced the coverage gap.`;

  return {
    id,
    created_at: runDatetime,
    created_by: "system-auditor",
    status: "DRAFT",
    weakness,
    evidence_source: "improve_check_log",
    evidence_data: evidenceData,
    proposed_change: finding.hypothesis,
    lane,
    lane_rationale: laneRationale,
    success_signal: successSignal,
    rollback,
    target_agent,
    target_files,
  };
}
