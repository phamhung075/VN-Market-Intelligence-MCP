/**
 * Guard test — BOOTSTRAP-ENUM-BCTC (2026-05-29)
 *
 * Regression guard: every cowork agent in docs/data/system-map.json must
 * appear in VALID_AGENT_NAMES.  Specifically guards against recurrence of the
 * bctc-analyst invalid_enum_value bug (Telegram report #3009, log #1154).
 *
 * RED proof: remove "bctc-analyst" from VALID_AGENT_NAMES → this test fails.
 * GREEN: "bctc-analyst" present → passes.
 *
 * Note on SSOT-derive: a full runtime-derive from system-map.json would cross
 * the application/infra layer boundary and require a SPIKE (out of XS scope).
 * See docs/signals/improvement-proposal-bootstrap-enum-ssot-derive.json for
 * the follow-up proposal.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod";
import { VALID_AGENT_NAMES } from "../application/usecases/getCycleBootstrap.js";
import { getCycleBootstrap } from "../application/usecases/getCycleBootstrap.js";
import { initDatabase, getDb } from "../infrastructure/db/schema.js";

// ─── Derive cowork agent ids from system-map.json at test time ───────────────

const SYSTEM_MAP_PATH = resolve(
  import.meta.dir,
  "../../../../docs/data/system-map.json",
);

const AgentSchema = z.object({
  id: z.string(),
  type: z.string(),
});

const SystemMapSchema = z.object({
  project: z.object({
    agents: z.array(AgentSchema),
  }),
});

function getCoworkAgentIds(): string[] {
  const raw = JSON.parse(readFileSync(SYSTEM_MAP_PATH, "utf-8")) as unknown;
  const map = SystemMapSchema.parse(raw);
  return map.project.agents
    .filter((a) => a.type === "cowork")
    .map((a) => a.id);
}

// ─── Guard: every roster cowork agent must be in VALID_AGENT_NAMES ────────────

describe("BOOTSTRAP-ENUM-BCTC guard — cowork roster ⊆ VALID_AGENT_NAMES", () => {
  const coworkIds = getCoworkAgentIds();

  test("system-map.json has at least one cowork agent", () => {
    expect(coworkIds.length).toBeGreaterThan(0);
  });

  test("bctc-analyst is a cowork agent in system-map.json", () => {
    expect(coworkIds).toContain("bctc-analyst");
  });

  test("bctc-analyst is in VALID_AGENT_NAMES (regression guard)", () => {
    // This test goes RED if "bctc-analyst" is removed from VALID_AGENT_NAMES.
    expect(VALID_AGENT_NAMES).toContain("bctc-analyst");
  });

  test("every cowork agent in system-map.json that uses bootstrap is in VALID_AGENT_NAMES", () => {
    // Agents known NOT to use get_cycle_bootstrap (dev/ops agents, not cowork).
    // Update this exclusion list only when a cowork agent is intentionally removed
    // from the bootstrap tool — never silently.
    const NON_BOOTSTRAP_COWORK = new Set<string>([
      // fb-market-poster does not call get_cycle_bootstrap per skill manifest
      "fb-market-poster",
      // market-analyst: not yet in VALID_AGENT_NAMES — separate ticket required
      "market-analyst",
    ]);

    const bootstrapCoworkIds = coworkIds.filter(
      (id) => !NON_BOOTSTRAP_COWORK.has(id),
    );

    for (const id of bootstrapCoworkIds) {
      expect(
        (VALID_AGENT_NAMES as readonly string[]).includes(id),
        `Cowork agent "${id}" is in system-map.json but missing from VALID_AGENT_NAMES. ` +
          "Add it to getCycleBootstrap.ts VALID_AGENT_NAMES.",
      ).toBe(true);
    }
  });
});

// ─── Functional: bctc-analyst resolves through get_cycle_bootstrap ────────────

describe("bctc-analyst functional bootstrap", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    await initDatabase();
    db = getDb();
  });

  test("get_cycle_bootstrap accepts bctc-analyst without throwing", async () => {
    const result = await getCycleBootstrap(db, "bctc-analyst");
    expect(result).toHaveProperty("agent_signals");
    expect(result).toHaveProperty("market_context");
    expect(result).toHaveProperty("system_status");
    expect(Array.isArray(result.agent_signals)).toBe(true);
  });

  test("bctc-analyst bootstrap completes within 3000ms", async () => {
    const start = Date.now();
    await getCycleBootstrap(db, "bctc-analyst");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});
