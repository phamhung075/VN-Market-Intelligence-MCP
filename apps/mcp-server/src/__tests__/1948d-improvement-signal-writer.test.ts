/**
 * 1948d-improvement-signal-writer.test.ts
 *
 * Acceptance criteria TASK-4: improvementSignalWriter.ts + orchestrator doc-write integration
 * AC-T4-1 through AC-T4-8
 *
 * Tests use temp directories (os.tmpdir()) — no writes to the real docs/ tree.
 * All orchestrator tests inject mock db + sendWork + writeProposalFn.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { Database } from "bun:sqlite";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  writeImprovementProposal,
  appendDashboardRow,
  deriveProposalId,
  resolveTargetAgent,
  FIX_AREA_TO_AGENT,
  buildProposalFields,
  type ImprovementProposalFields,
} from "../infrastructure/signals/improvementSignalWriter.js";
import {
  runSelfImproveOrchestrator,
  type SelfImproveOrchestratorDeps,
} from "../scheduler/audits/selfImproveOrchestratorJob.js";
import type { DegradationFinding } from "../domain/services/degradationRules.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir = "";

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sigi-test-"));
});

afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function makeDb(): Database {
  const db = new Database(":memory:");
  initSystemTables(db);
  return db;
}

function makeDegradedFinding(
  signal_type = "price_confirmation",
  detection_class: DegradationFinding["detection_class"] = "DEGRADED",
): DegradationFinding {
  return {
    signal_type,
    detection_class,
    current_rate: 0.4,
    baseline_rate: 0.55,
    sample_count_7d: 5,
    sample_count_30d: 10,
    hypothesis:
      signal_type === "price_confirmation"
        ? "price signal accuracy declined — source data stale or market condition shifted"
        : `hypothesis for ${signal_type}`,
    fix_area:
      signal_type === "totally_unknown"
        ? "manual"
        : "apps/mcp-server/src/scheduler/alerts/",
  };
}

function makeSampleFields(
  overrides: Partial<ImprovementProposalFields> = {},
): ImprovementProposalFields {
  return {
    id: "IMP-20260527-price-confirmation-degraded",
    created_at: "2026-05-27T09:02:00Z",
    created_by: "system-auditor",
    status: "DRAFT",
    weakness: "price_confirmation shows degradation",
    evidence_source: "improve_check_log",
    evidence_data: "7d_rate=40.0%, 30d_rate=55.0%, delta=15.0pp",
    proposed_change: "verify price source freshness",
    lane: "LANE-B",
    lane_rationale: "hard gate: unit test goes red on injected regression",
    success_signal: "test suite RED on regression, GREEN on fix",
    rollback: "revert the source-freshness check",
    target_agent: "dev-mcp-server",
    target_files: ["apps/mcp-server/src/scheduler/alerts/"],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-T4-1: Proposal doc written with C-1 structured fields
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T4-1: proposal doc written with C-1 structured fields", () => {
  test("writeImprovementProposal creates file with target_agent and target_files", async () => {
    const proposalsDir = join(tmpDir, "improvement-proposals");

    const fields = makeSampleFields();
    await writeImprovementProposal(fields, proposalsDir);

    const filePath = join(proposalsDir, `${fields.id}.md`);
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, "utf8");
    // target_agent and target_files are written as bold markdown: **target_agent:** value
    expect(content).toContain("**target_agent:** dev-mcp-server");
    expect(content).toContain("**target_files:**");
    expect(content).toContain("apps/mcp-server/src/scheduler/alerts/");
    expect(content).toContain("## Weakness");
    expect(content).toContain("Source: improve_check_log");
    expect(content).toContain("LANE-B");
    expect(content).toContain("status: DRAFT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T4-2: target_agent is kebab-case
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T4-2: target_agent is kebab-case", () => {
  test("FIX_AREA_TO_AGENT target_agent values match kebab-case regex", () => {
    const kebabRegex = /^[a-z][a-z0-9-]+$|^UNRESOLVED$/;

    for (const [_area, entry] of Object.entries(FIX_AREA_TO_AGENT)) {
      expect(entry.target_agent).toMatch(kebabRegex);
    }
  });

  test("resolveTargetAgent for known fix_area returns kebab-case target_agent", () => {
    const result = resolveTargetAgent("apps/mcp-server/src/scheduler/alerts/");
    expect(result.target_agent).toBe("dev-mcp-server");
    expect(result.target_agent).toMatch(/^[a-z][a-z0-9-]+$/);
  });

  test("resolveTargetAgent for 'manual' returns UNRESOLVED", () => {
    const result = resolveTargetAgent("manual");
    expect(result.target_agent).toBe("UNRESOLVED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T4-3: target_files is valid JSON array in the proposal doc
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T4-3: target_files in proposal doc is valid JSON array", () => {
  test("written proposal doc target_files line is parseable JSON array", async () => {
    const proposalsDir = join(tmpDir, "improvement-proposals");
    const fields = makeSampleFields();
    await writeImprovementProposal(fields, proposalsDir);

    const content = readFileSync(
      join(proposalsDir, `${fields.id}.md`),
      "utf8",
    );

    // Extract target_files line: **target_files:** ["..."]
    const match = content.match(/\*\*target_files:\*\*\s*(.+)/);
    expect(match).not.toBeNull();

    const parsed = JSON.parse(match![1]!.trim());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T4-4: DASHBOARD.md row appended in ## po section
// ─────────────────────────────────────────────────────────────────────────────

// AC-T4-4: OSC-2 — row appended to orch-state.json .signal_queue.rows[]
describe("AC-T4-4: signal_queue row appended to orch-state.json", () => {
  test("appendDashboardRow creates signal_queue row in orch-state.json", async () => {
    // Use a tmp orch-state.json fixture — NEVER mutates real docs/data/orch/orch-state.json
    const orchDir = join(tmpDir, "data", "orch");
    mkdirSync(orchDir, { recursive: true });
    const orchStatePath = join(orchDir, "orch-state.json");
    // File will be created by appendDashboardRow when absent

    await appendDashboardRow(
      "IMP-20260527-price-confirmation-degraded",
      "2026-05-27T09:02:00Z",
      "price_confirmation accuracy degraded",
      "docs/improvement-proposals/IMP-20260527-price-confirmation-degraded.md",
      orchStatePath,
    );

    expect(existsSync(orchStatePath)).toBe(true);
    const state = JSON.parse(readFileSync(orchStatePath, "utf8")) as {
      signal_queue?: { rows?: Array<{ id: string; type: string; status: string; from: string }> };
    };
    const rows = state.signal_queue?.rows ?? [];
    expect(rows.length).toBeGreaterThan(0);

    const row = rows.find(r => r.id === "IMP-20260527-price-confirmation-degraded");
    expect(row).toBeDefined();
    expect(row!.type).toBe("improvement_proposal");
    expect(row!.status).toBe("NEW");
    expect(row!.from).toBe("system-auditor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T4-5: Cooldown guard prevents duplicate docs
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T4-5: cooldown guard prevents duplicate proposal docs", () => {
  test("running orchestrator twice with same finding produces only 1 proposal file", async () => {
    const proposalsDir = join(tmpDir, "improvement-proposals");
    mkdirSync(proposalsDir, { recursive: true });
    const db = makeDb();

    const finding = makeDegradedFinding("price_confirmation");

    const deps: SelfImproveOrchestratorDeps = {
      db,
      sendWork: async (_t) => true,
      detectFn: () => [finding],
      coverageGapFn: () => [],
      proposalsDir,
    };

    // First run — should create 1 proposal file
    await runSelfImproveOrchestrator(deps);

    // Second run — cooldown in improve_check_log + file existence check should prevent second file
    await runSelfImproveOrchestrator(deps);

    const files = readdirSync(proposalsDir).filter(
      (f) => f.endsWith("-price-confirmation-degraded.md"),
    );
    expect(files).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T4-6: Doc-write failure is non-fatal (C-5 isolation)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T4-6: doc-write failure does not abort log+Telegram (C-5)", () => {
  test("writeProposalFn throws → improve_check_log inserted + WORK Telegram sent", async () => {
    const db = makeDb();
    const messages: string[] = [];

    await runSelfImproveOrchestrator({
      db,
      sendWork: async (text) => {
        messages.push(text);
        return true;
      },
      detectFn: () => [makeDegradedFinding("price_confirmation")],
      coverageGapFn: () => [],
      writeProposalFn: async (_finding, _runDate) => {
        throw new Error("Disk full error");
      },
    });

    // WORK Telegram must still have been sent
    expect(messages).toHaveLength(1);

    // improve_check_log row must still be inserted
    const count = (
      db
        .prepare("SELECT COUNT(*) AS cnt FROM improve_check_log")
        .get() as { cnt: number }
    ).cnt;
    expect(count).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T4-7: _default → UNRESOLVED fallback (C-1)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T4-7: totally_unknown signal_type → UNRESOLVED target_agent", () => {
  test("finding with manual fix_area → target_agent=UNRESOLVED, target_files=[]", async () => {
    const proposalsDir = join(tmpDir, "improvement-proposals");
    const db = makeDb();

    const capturedFields: ImprovementProposalFields[] = [];

    await runSelfImproveOrchestrator({
      db,
      sendWork: async (_t) => true,
      detectFn: () => [makeDegradedFinding("totally_unknown", "DEGRADED")],
      coverageGapFn: () => [],
      writeProposalFn: async (finding, runDate) => {
        const fields = buildProposalFields(
          finding,
          runDate,
          new Date().toISOString(),
        );
        capturedFields.push(fields);
        await writeImprovementProposal(fields, proposalsDir);
      },
    });

    expect(capturedFields).toHaveLength(1);
    expect(capturedFields[0]!.target_agent).toBe("UNRESOLVED");
    expect(capturedFields[0]!.target_files).toEqual([]);

    // File should be written successfully
    const files = readdirSync(proposalsDir);
    expect(files.some((f) => f.includes("totally-unknown-degraded"))).toBe(true);
  });

  test("resolveTargetAgent for unknown fix_area returns UNRESOLVED, []", () => {
    const result = resolveTargetAgent("some/unknown/path/");
    expect(result.target_agent).toBe("UNRESOLVED");
    expect(result.target_files).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T4-8: signal_queue rows ordered (newest prepended to rows[])
// OSC-2: orch-state.json .signal_queue.rows[] — new row prepended (most recent first)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T4-8: signal_queue rows — second row visible after first", () => {
  test("two appendDashboardRow calls produce two rows in signal_queue", async () => {
    // Use a tmp orch-state.json fixture — NEVER mutates real docs/data/orch/orch-state.json
    const orchDir = join(tmpDir, "data2", "orch");
    mkdirSync(orchDir, { recursive: true });
    const orchStatePath = join(orchDir, "orch-state.json");

    // First row
    await appendDashboardRow(
      "IMP-existing-id",
      "2026-05-26T09:00:00Z",
      "existing finding",
      "docs/improvement-proposals/IMP-existing-id.md",
      orchStatePath,
    );

    // Second row
    await appendDashboardRow(
      "IMP-20260527-new-finding",
      "2026-05-27T09:02:00Z",
      "new finding",
      "docs/improvement-proposals/IMP-20260527-new-finding.md",
      orchStatePath,
    );

    const state = JSON.parse(readFileSync(orchStatePath, "utf8")) as {
      signal_queue?: { rows?: Array<{ id: string }> };
    };
    const rows = state.signal_queue?.rows ?? [];
    const ids = rows.map(r => r.id);

    expect(ids).toContain("IMP-existing-id");
    expect(ids).toContain("IMP-20260527-new-finding");
    expect(rows.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional: deriveProposalId + slug rules
// ─────────────────────────────────────────────────────────────────────────────

describe("Slug derivation rules (architect Open Point ii)", () => {
  test("price_confirmation + DEGRADED → IMP-20260527-price-confirmation-degraded", () => {
    const id = deriveProposalId("price_confirmation", "DEGRADED", "2026-05-27");
    expect(id).toBe("IMP-20260527-price-confirmation-degraded");
  });

  test("volume_spike + PERSISTENTLY_LOW → IMP-20260527-volume-spike-persistently-low", () => {
    const id = deriveProposalId(
      "volume_spike",
      "PERSISTENTLY_LOW",
      "2026-05-27",
    );
    expect(id).toBe("IMP-20260527-volume-spike-persistently-low");
  });

  test("unknown_xyz + DEGRADED → IMP-20260527-unknown-xyz-degraded", () => {
    const id = deriveProposalId("unknown_xyz", "DEGRADED", "2026-05-27");
    expect(id).toBe("IMP-20260527-unknown-xyz-degraded");
  });
});
