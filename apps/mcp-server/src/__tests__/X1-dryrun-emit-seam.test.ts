/**
 * X1-dryrun-emit-seam.test.ts
 *
 * SIG-FOLLOWUP-DRYRUN X-1 — Synthetic dry-run: prove the D-IMPROVE lane-B emit seam
 * works end-to-end on the DEFAULT (non-injected writeProposalFn) path.
 *
 * Background:
 *   The existing TASK-3/4 tests (1948c/1948d) always inject `writeProposalFn`, bypassing
 *   the `else` branch in selfImproveOrchestratorJob.ts Step 12.  The actual emit seam —
 *   the default path that calls writeImprovementProposal() + appendDashboardRow() via
 *   dynamic import — was NOT tested end-to-end before this file.
 *
 * What this test proves:
 *   Given a synthetic DEGRADED finding (no writeProposalFn injected), the orchestrator:
 *   1. Writes docs/improvement-proposals/IMP-{date}-price-confirmation-degraded.md
 *      containing all required fields (target_agent, target_files, LANE-B, DRAFT, Gate Proof).
 *   2. Appends a signal_queue row to the sinked orch-state.json with
 *      type=improvement_proposal, status=NEW, from=system-auditor.
 *
 * Sink strategy (NO real production state mutated):
 *   - proposalsDir  → mkdtempSync temp dir (cleaned up in afterEach)
 *   - orchStatePath → temp dir / orch-state.json (cleaned up in afterEach)
 *   - sendWork      → in-memory capture (no real Telegram)
 *   - db            → :memory: SQLite (no real market.db)
 *   - detectFn      → synthetic fixture returning 1 DEGRADED finding
 *   - coverageGapFn → returns []
 *   NO writeProposalFn injected → default emit path is exercised
 *
 * REPEATABLE: the test cleans up temp dirs after each run and uses a fresh :memory: DB.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  runSelfImproveOrchestrator,
  type SelfImproveOrchestratorDeps,
} from "../scheduler/audits/selfImproveOrchestratorJob.js";
import type { DegradationFinding } from "../domain/services/degradationRules.js";

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic fixture: a canonical DEGRADED finding for price_confirmation
// ─────────────────────────────────────────────────────────────────────────────

function syntheticDegradedFinding(): DegradationFinding {
  return {
    signal_type: "price_confirmation",
    detection_class: "DEGRADED",
    current_rate: 0.40,   // 7d rate: 40%
    baseline_rate: 0.55,  // 30d baseline: 55% → delta = 15pp (≥ 10pp threshold)
    sample_count_7d: 5,
    sample_count_30d: 10,
    hypothesis:
      "price signal accuracy declined — source data stale or market condition shifted",
    fix_area: "apps/mcp-server/src/scheduler/alerts/",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-test temp dirs
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir = "";

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "x1-emit-seam-"));
});

afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// X-1 MAIN: prove the default emit path fires end-to-end
// ─────────────────────────────────────────────────────────────────────────────

describe("X-1 — D-IMPROVE lane-B emit seam: default path (no writeProposalFn injected)", () => {
  test("synthetic DEGRADED finding → proposal doc written + signal_queue row appended (sinked to temp)", async () => {
    // ── Sink setup (all writes go to temp, NO real production state touched) ──
    const proposalsDir = join(tmpDir, "improvement-proposals");
    mkdirSync(proposalsDir, { recursive: true });

    const orchDir = join(tmpDir, "data", "orch");
    mkdirSync(orchDir, { recursive: true });
    const orchStatePath = join(orchDir, "orch-state.json");

    const db = new Database(":memory:");
    initSystemTables(db);

    const sendWorkMessages: string[] = [];

    // ── Deps: NO writeProposalFn — forces default emit path ──
    const deps: SelfImproveOrchestratorDeps = {
      db,
      sendWork: async (text) => {
        sendWorkMessages.push(text);
        return true;
      },
      detectFn: () => [syntheticDegradedFinding()],
      coverageGapFn: () => [],
      // writeProposalFn intentionally ABSENT — exercises the default else branch
      proposalsDir,
      orchStatePath,
    };

    // ── Execute ──
    await runSelfImproveOrchestrator(deps);

    // ── Assert: WORK Telegram fired (proves the pipeline ran to Step 11) ──
    expect(sendWorkMessages).toHaveLength(1);
    expect(sendWorkMessages[0]).toContain("price_confirmation");
    expect(sendWorkMessages[0]).toContain("DEGRADED");

    // ── Assert: improve_check_log row inserted (proves Step 10 ran) ──
    const logRow = db
      .prepare(
        "SELECT * FROM improve_check_log WHERE signal_type = 'price_confirmation'",
      )
      .get() as Record<string, unknown> | undefined;
    expect(logRow).toBeDefined();
    expect(logRow!["dispatch_status"]).toBe("shadow");
    expect(logRow!["window_7d_rate"] as number).toBeCloseTo(0.40);
    expect(logRow!["window_30d_rate"] as number).toBeCloseTo(0.55);

    // ── Assert: proposal doc written to proposalsDir (proves writeImprovementProposal fired) ──
    const files = readdirSync(proposalsDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^IMP-\d{8}-price-confirmation-degraded\.md$/);

    const docContent = readFileSync(join(proposalsDir, files[0]!), "utf8");

    // Required brief §3 + C-1 fields
    expect(docContent).toContain("status: DRAFT");
    expect(docContent).toContain("lane: LANE-B");
    expect(docContent).toContain("created_by: system-auditor");
    expect(docContent).toContain("## Weakness");
    expect(docContent).toContain("## Evidence");
    expect(docContent).toContain("## Proposed Change");
    expect(docContent).toContain("## Gate Proof");

    // C-1 structured fields
    expect(docContent).toContain("**target_agent:** dev-mcp-server");
    expect(docContent).toContain("**target_files:**");
    const targetFilesMatch = docContent.match(/\*\*target_files:\*\*\s*(.+)/);
    expect(targetFilesMatch).not.toBeNull();
    const parsedTargetFiles = JSON.parse(targetFilesMatch![1]!.trim());
    expect(Array.isArray(parsedTargetFiles)).toBe(true);
    expect(parsedTargetFiles.length).toBeGreaterThan(0);

    // ── Assert: signal_queue row appended to sinked orch-state.json ──
    // (proves appendDashboardRow fired — the second half of the emit seam)
    expect(existsSync(orchStatePath)).toBe(true);
    const orchState = JSON.parse(readFileSync(orchStatePath, "utf8")) as {
      signal_queue?: { rows?: Array<{
        id: string;
        type: string;
        status: string;
        from: string;
        payload_ref: string | null;
      }> };
    };
    const rows = orchState.signal_queue?.rows ?? [];
    expect(rows.length).toBe(1);

    const emittedRow = rows[0]!;
    expect(emittedRow.type).toBe("improvement_proposal");
    expect(emittedRow.status).toBe("NEW");
    expect(emittedRow.from).toBe("system-auditor");
    expect(emittedRow.id).toMatch(/^IMP-\d{8}-price-confirmation-degraded$/);
    expect(emittedRow.payload_ref).toContain("improvement-proposals");

    // ── Confirm: real production files NOT touched ──
    // proposalsDir is temp → real docs/improvement-proposals/ untouched
    // orchStatePath is temp → real docs/data/orch/orch-state.json untouched
    // db is :memory: → real market.db untouched
    // sendWork is captured → no real Telegram sent
  });

  test("second run with same finding: cooldown blocks second doc write (idempotent emit)", async () => {
    // Prove the cooldown guard also works in the default path — prevents doc duplication
    const proposalsDir = join(tmpDir, "improvement-proposals-cd");
    mkdirSync(proposalsDir, { recursive: true });
    const orchDir = join(tmpDir, "data-cd", "orch");
    mkdirSync(orchDir, { recursive: true });
    const orchStatePath = join(orchDir, "orch-state.json");

    const db = new Database(":memory:");
    initSystemTables(db);

    const deps: SelfImproveOrchestratorDeps = {
      db,
      sendWork: async () => true,
      detectFn: () => [syntheticDegradedFinding()],
      coverageGapFn: () => [],
      // No writeProposalFn → default path
      proposalsDir,
      orchStatePath,
    };

    // First run — should write proposal + append row
    await runSelfImproveOrchestrator(deps);

    const filesAfterRun1 = readdirSync(proposalsDir);
    expect(filesAfterRun1).toHaveLength(1);

    // Second run — cooldown guard (improve_check_log has row + doc exists) should suppress
    await runSelfImproveOrchestrator(deps);

    // Still only 1 doc (cooldown blocked the second write)
    const filesAfterRun2 = readdirSync(proposalsDir);
    expect(filesAfterRun2).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// X-1 SECONDARY: verify PERSISTENTLY_LOW variant also emits on default path
// ─────────────────────────────────────────────────────────────────────────────

describe("X-1 secondary — PERSISTENTLY_LOW finding also emits on default path", () => {
  test("PERSISTENTLY_LOW finding → LANE-B proposal doc + signal_queue row (sinked)", async () => {
    const proposalsDir = join(tmpDir, "improvement-proposals-pl");
    mkdirSync(proposalsDir, { recursive: true });
    const orchDir = join(tmpDir, "data-pl", "orch");
    mkdirSync(orchDir, { recursive: true });
    const orchStatePath = join(orchDir, "orch-state.json");

    const db = new Database(":memory:");
    initSystemTables(db);

    const persistentlyLowFinding: DegradationFinding = {
      signal_type: "volume_spike",
      detection_class: "PERSISTENTLY_LOW",
      current_rate: 0.35,
      baseline_rate: 0.35,
      sample_count_7d: 12,
      sample_count_30d: 15,
      hypothesis:
        "volume signal accuracy persistently low — underlying model may need recalibration",
      fix_area: "apps/mcp-server/src/scheduler/alerts/",
    };

    await runSelfImproveOrchestrator({
      db,
      sendWork: async () => true,
      detectFn: () => [persistentlyLowFinding],
      coverageGapFn: () => [],
      proposalsDir,
      orchStatePath,
    });

    // Proposal doc must exist
    const files = readdirSync(proposalsDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^IMP-\d{8}-volume-spike-persistently-low\.md$/);

    const docContent = readFileSync(join(proposalsDir, files[0]!), "utf8");
    expect(docContent).toContain("lane: LANE-B");  // PERSISTENTLY_LOW → LANE-B
    expect(docContent).toContain("status: DRAFT");
    expect(docContent).toContain("**target_agent:** dev-mcp-server");

    // Signal queue row must exist
    const orchState = JSON.parse(readFileSync(orchStatePath, "utf8")) as {
      signal_queue?: { rows?: Array<{ id: string; type: string }> };
    };
    const rows = orchState.signal_queue?.rows ?? [];
    expect(rows.some((r) => r.type === "improvement_proposal")).toBe(true);
    expect(rows.some((r) => r.id.includes("volume-spike-persistently-low"))).toBe(true);
  });
});
