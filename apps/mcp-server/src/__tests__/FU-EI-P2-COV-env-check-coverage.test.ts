/**
 * FU-EI-P2-COV-1 + FU-EI-P2-COV-2 — env-check coverage gaps (test-only, no runtime change)
 *
 * COV-1: runEnvCheck (lines 160-185) was at 0% coverage.
 *   Tests exercise:
 *   R1 — no-op when all required vars are present (logger.warn NOT called)
 *   R2 — calls logger.warn exactly once when a var is missing
 *   R3 — warn message includes the missing var name
 *   R4 — does not throw when TELEGRAM_BOT_TOKEN is missing (degraded-mode early-return)
 *   R5 — meta object passed to logger.warn contains missingVars array
 *
 *   Honest-green pin: R2 asserts logger.warn IS called when missing.length > 0.
 *   If the branch condition were inverted (always-return), calls.length would be 0
 *   and the `expect(log.calls.length).toBe(1)` assertion would fail — directly
 *   pins line 162 `if (missing.length === 0) return`.
 *
 * COV-2: APP_ENV=testing (4th DEV_ENV_VALUES entry) had no explicit test.
 *   Tests exercise:
 *   T1 — isProductionEnv("testing") → false  (must NOT be treated as production)
 *   T2 — checkEnvDbConsistency("testing", PROD_DB_PATH) → non-null error
 *   T3 — checkEnvDbConsistency("testing", "/app/data/market.test.db") → null (ok)
 *   T4 — currentDataEnv({ APP_ENV: "testing" }) → "testing"
 *
 *   Honest-green pin: T1 directly pins the `DEV_ENV_VALUES.has("testing")`
 *   membership check. If "testing" were removed from the Set the test would
 *   fail (isProductionEnv would return true instead of false).
 */

import { describe, it, expect } from "bun:test";
import {
  runEnvCheck,
  checkEnvDbConsistency,
  isProductionEnv,
  currentDataEnv,
  PROD_DB_PATH,
  REQUIRED_ENV_VARS,
} from "../infrastructure/envCheck.js";

// ─── COV-2: APP_ENV=testing branch ────────────────────────────────────────────

describe("FU-EI-P2-COV-2 — isProductionEnv('testing')", () => {
  it("T1: 'testing' is NOT production (must return false)", () => {
    // Pins DEV_ENV_VALUES membership — remove 'testing' from the Set → fails
    expect(isProductionEnv("testing")).toBe(false);
  });

  it("T1b: 'TESTING' (uppercase) is also NOT production (case-insensitive)", () => {
    expect(isProductionEnv("TESTING")).toBe(false);
  });

  it("T1c: 'Testing' (mixed case) is also NOT production", () => {
    expect(isProductionEnv("Testing")).toBe(false);
  });
});

describe("FU-EI-P2-COV-2 — checkEnvDbConsistency with APP_ENV=testing", () => {
  it("T2: testing + PROD_DB_PATH → error (non-prod must NOT use prod DB)", () => {
    const result = checkEnvDbConsistency("testing", PROD_DB_PATH);
    // Pins the `!isProd && resolvedDb === PROD_DB_PATH` error branch
    expect(result).not.toBeNull();
    expect(result!).toContain("EI-P2-1");
    expect(result!).toContain("testing");
  });

  it("T3: testing + dev path → null (consistent, no error)", () => {
    const result = checkEnvDbConsistency("testing", "/app/data/market.test.db");
    expect(result).toBeNull();
  });
});

describe("FU-EI-P2-COV-2 — currentDataEnv with APP_ENV=testing", () => {
  it("T4: returns 'testing' when APP_ENV is 'testing'", () => {
    expect(currentDataEnv({ APP_ENV: "testing" })).toBe("testing");
  });
});

// ─── COV-1: runEnvCheck ────────────────────────────────────────────────────────

/** Minimal logger spy — captures warn calls without any real I/O. */
interface WarnCall {
  msg: string;
  meta: Record<string, unknown> | undefined;
}

function makeLogSpy(): { warn: (msg: string, meta?: Record<string, unknown>) => void; calls: WarnCall[] } {
  const calls: WarnCall[] = [];
  return {
    warn(msg: string, meta?: Record<string, unknown>) {
      calls.push({ msg, meta: meta });
    },
    calls,
  };
}

/** Save and clear all required env vars; returns a restore function. */
function clearRequiredVars(): () => void {
  const saved = new Map<string, string>();
  for (const v of REQUIRED_ENV_VARS) {
    const cur = Bun.env[v];
    if (cur !== undefined) {
      saved.set(v, cur);
    }
    delete Bun.env[v];
  }
  return () => {
    for (const v of REQUIRED_ENV_VARS) {
      const orig = saved.get(v);
      if (orig !== undefined) {
        Bun.env[v] = orig;
      } else {
        delete Bun.env[v];
      }
    }
  };
}

/** Set all required env vars to dummy values; returns a restore function. */
function fillRequiredVars(): () => void {
  const saved = new Map<string, string>();
  for (const v of REQUIRED_ENV_VARS) {
    const cur = Bun.env[v];
    if (cur !== undefined) {
      saved.set(v, cur);
    }
    Bun.env[v] = "dummy-test-value";
  }
  return () => {
    for (const v of REQUIRED_ENV_VARS) {
      const orig = saved.get(v);
      if (orig !== undefined) {
        Bun.env[v] = orig;
      } else {
        delete Bun.env[v];
      }
    }
  };
}

describe("FU-EI-P2-COV-1 — runEnvCheck: no-op when all vars present", () => {
  it("R1: does NOT call logger.warn when all required vars are present", async () => {
    const log = makeLogSpy();
    const restore = fillRequiredVars();
    try {
      await runEnvCheck(log);
    } finally {
      restore();
    }
    // Pins line 162: `if (missing.length === 0) return` must fire
    expect(log.calls.length).toBe(0);
  });
});

describe("FU-EI-P2-COV-1 — runEnvCheck: warns when vars are missing", () => {
  it("R2: calls logger.warn exactly once when all vars are missing", async () => {
    const log = makeLogSpy();
    const restore = clearRequiredVars();
    try {
      await runEnvCheck(log);
    } finally {
      restore();
    }
    // Pins the warn branch: inverted condition → 0 calls → assertion fails
    expect(log.calls.length).toBe(1);
  });

  it("R3: warn message includes the name of the missing var", async () => {
    const log = makeLogSpy();
    const restore = clearRequiredVars();
    try {
      await runEnvCheck(log);
    } finally {
      restore();
    }

    expect(log.calls.length).toBe(1);
    const warnMsg = log.calls[0]?.msg ?? "";
    // Pins that formatEnvWarning output is forwarded into the logged message
    // All required vars should appear in the warning string
    for (const v of REQUIRED_ENV_VARS) {
      expect(warnMsg).toContain(v);
    }
  });

  it("R4: does not throw when TELEGRAM_BOT_TOKEN is missing (degraded-mode early-return)", async () => {
    const log = makeLogSpy();
    const restore = clearRequiredVars();
    try {
      // Must NOT throw even though token+workId absent (lines 170-174 early-return path)
      await expect(runEnvCheck(log)).resolves.toBeUndefined();
    } finally {
      restore();
    }
  });

  it("R5: meta object passed to logger.warn contains missingVars array with all required var names", async () => {
    const log = makeLogSpy();
    const restore = clearRequiredVars();
    try {
      await runEnvCheck(log);
    } finally {
      restore();
    }

    expect(log.calls.length).toBe(1);
    const meta = log.calls[0]?.meta;
    expect(meta).toBeDefined();
    const missingVars = (meta as Record<string, unknown>)["missingVars"];
    expect(Array.isArray(missingVars)).toBe(true);
    const vars = missingVars as string[];
    expect(vars.length).toBe(REQUIRED_ENV_VARS.length);
    for (const v of REQUIRED_ENV_VARS) {
      expect(vars).toContain(v);
    }
  });
});
