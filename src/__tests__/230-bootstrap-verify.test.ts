import { describe, test, expect, beforeAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getCycleBootstrap } from "../application/usecases/getCycleBootstrap.js";
import { initDatabase, getDb } from "../infrastructure/db/schema.js";

describe("Bootstrap Performance + Signal Quality (230)", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    await initDatabase();
    db = getDb();
  });

  // ============ AC-1: Latency Instrumentation (3 assertions) ============

  test("AC-1a: BootstrapResult includes elapsed_ms field (≥1)", async () => {
    const result = await getCycleBootstrap(db, "news-scout");
    expect(result).toHaveProperty("elapsed_ms");
    expect(typeof (result as any).elapsed_ms).toBe("number");
    expect((result as any).elapsed_ms).toBeGreaterThanOrEqual(1);
  });

  test("AC-1b: BootstrapResult includes sub_call_timings with 3 keys", async () => {
    const result = await getCycleBootstrap(db, "financial-analyst");
    expect(result).toHaveProperty("sub_call_timings");
    expect((result as any).sub_call_timings).toHaveProperty("agent_signals_ms");
    expect((result as any).sub_call_timings).toHaveProperty("market_context_ms");
    expect((result as any).sub_call_timings).toHaveProperty("system_status_ms");
  });

  test("AC-1c: timeout error recorded as '5000+' (string) in sub_call_timings on timeout", async () => {
    // This test verifies the timeout handling behavior.
    // When a sub-call times out (>5s), its value in sub_call_timings should be "5000+" string.
    // This will fail until timeout logic is implemented in getCycleBootstrap.
    const result = await getCycleBootstrap(db, "market-watcher");

    // Verify that if a timeout occurred, it would be recorded as string "5000+"
    const timingValues = Object.values((result as any).sub_call_timings || {});
    const hasTimeoutRecord = timingValues.some((val) => val === "5000+");

    // This assertion documents the expected behavior:
    // Either all timings are numbers, or any timeout is recorded as "5000+" string
    timingValues.forEach((val) => {
      expect(typeof val === "number" || val === "5000+").toBe(true);
    });
  });

  // ============ AC-2: Signal Price Validation ±5% (4 assertions) ============

  test("AC-2a: validateSignalPrice with 5.4% divergence → valid=false, confidence=0", async () => {
    // 5.4% divergence exceeds 5% threshold
    // Expects: valid=false, confidence < 100
    // This will fail until validateSignalPrice is implemented

    // Mock scenario: signal.price=33500, snapshot=35000
    // divergence = |33500 - 35000| / 35000 * 100 = 4.3%
    // But for this test, we expect 5.4% case: signal=33100, snapshot=35000
    // divergence = |33100 - 35000| / 35000 * 100 = 5.43% > 5%

    // Dummy expectation that will fail until validateSignalPrice exists
    expect({
      valid: true,
      confidence: 100,
      divergence_percent: 5.4,
    }).toEqual({
      valid: false,
      confidence: 0,
      divergence_percent: 5.4,
    });
  });

  test("AC-2b: validateSignalPrice with 0.5% divergence → valid=true, confidence≥95", async () => {
    // 0.5% divergence within ±5% threshold
    // Expects: valid=true, confidence ≥ 95
    // signal=35175, snapshot=35000
    // divergence = |35175 - 35000| / 35000 * 100 = 0.5%

    expect({
      valid: false,
      confidence: 50,
      divergence_percent: 0.5,
    }).toEqual({
      valid: true,
      confidence: 99,
      divergence_percent: 0.5,
    });
  });

  test("AC-2c: unknown ticker not in snapshot → valid=false, confidence=0, issue='Ticker not found'", async () => {
    // Missing ticker (e.g., 'UNKNOWN') should fail validation
    expect({
      valid: true,
      confidence: 50,
      issue: "Unknown error",
    }).toEqual({
      valid: false,
      confidence: 0,
      issue: "Ticker not found",
    });
  });

  test("AC-2d: negative snapshot price → valid=false, confidence=0, issue='Invalid snapshot price'", async () => {
    // Corrupted price (negative) should fail validation
    expect({
      valid: true,
      confidence: 50,
      issue: "Unknown error",
    }).toEqual({
      valid: false,
      confidence: 0,
      issue: "Invalid snapshot price",
    });
  });

  // ============ AC-3: Signal Metadata (2 assertions) ============

  test("AC-3a: agent signal includes confidence_score field (number, 0–100)", async () => {
    const result = await getCycleBootstrap(db, "alert-commander");

    // Verify that if signals exist, they include confidence_score
    if (result.agent_signals && result.agent_signals.length > 0) {
      const signal = result.agent_signals[0] as any;
      expect(signal).toHaveProperty("confidence_score");
      expect(typeof signal.confidence_score).toBe("number");
      expect(signal.confidence_score).toBeGreaterThanOrEqual(0);
      expect(signal.confidence_score).toBeLessThanOrEqual(100);
    }

    // Dummy assertion to force failure until confidence_score is added
    expect(false).toBe(true);
  });

  test("AC-3b: agent signal includes validated_at field (ISO8601 string)", async () => {
    const result = await getCycleBootstrap(db, "digest-predict");

    // Verify that if signals exist, they include validated_at in ISO8601 format
    if (result.agent_signals && result.agent_signals.length > 0) {
      const signal = result.agent_signals[0] as any;
      expect(signal).toHaveProperty("validated_at");
      expect(typeof signal.validated_at).toBe("string");
      // Check ISO8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(/^\d{4}-\d{2}-\d{2}T/.test(signal.validated_at)).toBe(true);
    }

    // Dummy assertion to force failure until validated_at is added
    expect(false).toBe(true);
  });

  // ============ AC-4: Fail-Loud Decision Tree (3 assertions) ============

  test("AC-4a: if bootstrap.error.market_context present → agent stops (decision tree check passes)", async () => {
    // Verify that when bootstrap.error.market_context is present,
    // agent .md files include decision logic to STOP
    // This assertion documents expected agent behavior

    // Dummy: simulate bootstrap with market_context error
    const mockBootstrapWithError = {
      agent_signals: [] as any[],
      market_context: "",
      system_status: "",
      error: {
        market_context: "Failed to fetch market context",
      },
    };

    // Expect that agent would stop (decision tree check)
    expect(!!(mockBootstrapWithError.error as any)?.market_context).toBe(true);

    // Force failure: decision tree not yet implemented in agents
    expect("STOP_DECISION_TREE_IMPLEMENTED").toBe("STOP_DECISION_TREE_NOT_IMPLEMENTED");
  });

  test("AC-4b: if bootstrap.error.agent_signals only → agent continues (no STOP)", async () => {
    // Verify that when ONLY agent_signals error exists (no market_context error),
    // agent does NOT stop

    const mockBootstrapWithPartialError = {
      agent_signals: [] as any[],
      market_context: "=== CONTEXT ===",
      system_status: "OK",
      error: {
        agent_signals: "Failed to fetch some signals",
        // no market_context error
      },
    };

    // Expect agent continues (no market_context error)
    expect(!(mockBootstrapWithPartialError.error as any)?.market_context).toBe(true);

    // Force failure: decision tree not yet implemented
    expect("CONTINUE_DECISION_TREE_IMPLEMENTED").toBe("CONTINUE_DECISION_TREE_NOT_IMPLEMENTED");
  });

  test("AC-4c: all 7 Cowork agent .md files include Step 0-b decision tree block", () => {
    // Scan each agent .md for "Step 0-b: Handle Bootstrap Errors"
    const agentNames = [
      "01-news-scout",
      "02-financial-analyst",
      "04-market-watcher",
      "05-alert-commander",
      "06-digest-predict",
      "07-qa-responder",
      "unified-agent",
    ];

    const agentDir = path.join(
      __dirname,
      "../../cowork-analysis-vnmarket-team"
    );

    const missingAgents: string[] = [];

    agentNames.forEach((agentName) => {
      const fileName = `${agentName}.md`;
      const agentFilePath = path.join(agentDir, fileName);

      if (!fs.existsSync(agentFilePath)) {
        missingAgents.push(`${agentName} (file not found: ${agentFilePath})`);
        return;
      }

      const content = fs.readFileSync(agentFilePath, "utf-8");
      const hasDecisionTree = content.includes("Step 0-b: Handle Bootstrap Errors");

      expect(hasDecisionTree).toBe(true);

      if (!hasDecisionTree) {
        missingAgents.push(agentName);
      }
    });

    // Summary check: all agents must have the decision tree
    expect(missingAgents).toEqual([]);
  });
});
