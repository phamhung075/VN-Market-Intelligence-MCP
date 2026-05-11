/**
 * fix/fetch-source-issues — Issue 3: Trading Economics deploy placeholder guard
 *
 * Verifies:
 * 1. The fetch-tradingeconomics.sh script contains a guard that exits 0 when
 *    TE_API_KEY is empty or still "__TE_API_KEY__".
 * 2. The guard is present before the first curl call in the indicator loop.
 * 3. The deploy script contains a sed substitution for __TE_API_KEY__.
 * 4. The deploy script warns (but does not abort) when TRADING_ECONOMICS_API_KEY
 *    is not set in .env.
 * 5. The .env.example documents TRADING_ECONOMICS_API_KEY.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// ── Resolve paths relative to project root ────────────────────────────────────

// import.meta.dir = apps/mcp-server/src/__tests__
// project root   = apps/mcp-server/src/__tests__/../../../../
//   __tests__ → src → mcp-server → apps → VN-Market-Intelligence-MCP
const PROJECT_ROOT = join(import.meta.dir, "..", "..", "..", "..");

const TE_SCRIPT   = join(PROJECT_ROOT, "vps-scripts", "fetch-tradingeconomics.sh");
const DEPLOY_SH   = join(PROJECT_ROOT, "scripts", "deploy-vinahost.sh");
const ENV_EXAMPLE = join(PROJECT_ROOT, ".env.example");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fix/fetch-source-issues — Issue 3: TE API key guard", () => {
  it("1. fetch-tradingeconomics.sh has a guard for empty TE_API_KEY", () => {
    const script = readFileSync(TE_SCRIPT, "utf-8");
    // Guard must check for empty string
    expect(script).toContain('[ -z "$TE_API_KEY" ]');
  });

  it("2. fetch-tradingeconomics.sh guard also checks for un-substituted placeholder", () => {
    const script = readFileSync(TE_SCRIPT, "utf-8");
    expect(script).toContain('"__TE_API_KEY__"');
  });

  it("3. guard exits 0 (graceful exit) not exit 1 (error)", () => {
    const script = readFileSync(TE_SCRIPT, "utf-8");
    // The full guard block: from "if [ -z" through the closing "fi\n"
    const guardBlock = script.match(/if \[ -z[^\n]*.*?\nfi\n/s)?.[0] ?? "";
    expect(guardBlock).toContain("exit 0");
    // Must not contain exit 1 in the same block
    expect(guardBlock).not.toContain("exit 1");
  });

  it("4. guard appears before the indicator fetch loop", () => {
    const script = readFileSync(TE_SCRIPT, "utf-8");
    const guardPos = script.indexOf('[ -z "$TE_API_KEY" ]');
    const loopPos  = script.indexOf("for ITEM in");
    expect(guardPos).toBeGreaterThan(0);
    expect(loopPos).toBeGreaterThan(0);
    expect(guardPos).toBeLessThan(loopPos);
  });

  it("5. deploy-vinahost.sh substitutes __TE_API_KEY__ via sed", () => {
    const deploy = readFileSync(DEPLOY_SH, "utf-8");
    // Both placeholder and env var must appear in the deploy script
    expect(deploy).toContain("__TE_API_KEY__");
    expect(deploy).toContain("TRADING_ECONOMICS_API_KEY");
    // The sed block for the TE script must contain the substitution expression.
    // The expression spans multiple lines so we check for the substitution token
    // within any sed -e line, not necessarily on the same line as "sed".
    const sedSubLine = deploy
      .split("\n")
      .find((l) => l.includes("__TE_API_KEY__") && l.includes("-e"));
    expect(sedSubLine).toBeDefined();
  });

  it("6. deploy-vinahost.sh warns (does not abort) when TRADING_ECONOMICS_API_KEY is absent", () => {
    const deploy = readFileSync(DEPLOY_SH, "utf-8");
    // Must have a WARN message, not an exit 1, for the missing TE key
    const warnIdx = deploy.indexOf("WARN: TRADING_ECONOMICS_API_KEY");
    expect(warnIdx).toBeGreaterThan(0);
    // The warning block must NOT contain "exit 1" within ~5 lines of the warn
    const warnWindow = deploy.slice(warnIdx, warnIdx + 300);
    expect(warnWindow).not.toContain("exit 1");
  });

  it("7. .env.example documents TRADING_ECONOMICS_API_KEY", () => {
    const envExample = readFileSync(ENV_EXAMPLE, "utf-8");
    expect(envExample).toContain("TRADING_ECONOMICS_API_KEY");
  });
});
