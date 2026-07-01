/**
 * TASK-EVIDENCE-HOP1-MCP — FR-2.2: vpsProxyWatchdogJob insider-freshness reader
 *
 * BA-PREDICTION-EVIDENCE-REVIVAL architecture brief §1 FR-2.2: `insider_transactions`
 * received 0 rows across ~2 months of "successful" daily insiderCheckJob runs — the
 * VPS proxy's SSC-portal fetch was silently 502ing on every run and nothing surfaced
 * that fact (silent-empty-success class). This is the observability fix — it makes
 * the failure visible in WORK Telegram on the next watchdog tick, it does NOT attempt
 * the deeper VPS<->SSC connectivity fix (decoupled to backlog FIX-VPS-SSC-INSIDER-502).
 *
 * Covers:
 *   - readLatestInsiderTimestamp: null on empty table
 *   - alert fires when insider_transactions has never been written (null reader)
 *   - alert fires when insider data is stale (> 4 days old)
 *   - fresh insider data (< 4 days old) does not trigger an insider alert
 *   - alert message includes the vn-ssc-insider-fetch label + the decoupled-backlog note
 */

// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import {
  runVpsProxyWatchdog,
  _resetWatchdogCooldown,
  readLatestInsiderTimestamp,
} from "../scheduler/vpsProxyWatchdogJob.js";

// Wed 2026-04-23T03:30:00Z — VN market hours (Mon-Fri 02:00-08:59 UTC)
const MARKET_NOW = new Date("2026-04-23T03:30:00Z");

/** Fresh readers for all OTHER sources so only insider staleness is under test */
const freshReaders = (now: Date) => ({
  readPrice:       () => new Date(now.getTime() - 5 * 60_000),
  readNews:        () => new Date(now.getTime() - 5 * 60_000),
  readOhlcv:       () => new Date(now.getTime() - 5 * 60_000),
  readForeignFlow: () => new Date(now.getTime() - 5 * 60_000),
  readReuters:     () => new Date(now.getTime() - 5 * 60_000),
  readTe:          () => new Date(now.getTime() - 5 * 60_000),
});

describe("TASK-EVIDENCE-HOP1-MCP FR-2.2 — watchdog insider staleness", () => {
  beforeEach(() => {
    _resetWatchdogCooldown();
  });

  it("readLatestInsiderTimestamp returns null when insider_transactions has no rows", () => {
    const result = readLatestInsiderTimestamp();
    expect(result).toBeNull();
  });

  it("fires alert when insider_transactions has never been written (null reader — the live silent-bug case)", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { calls.push(m); return true; },
      ...freshReaders(MARKET_NOW),
      readInsider: () => null,
    });
    expect(result).toBe("alert-sent");
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("vn-ssc-insider-fetch");
    // Message must point to the decoupled backlog, not a systemctl restart hint.
    expect(calls[0]).toContain("FIX-VPS-SSC-INSIDER-502");
  });

  it("fires alert when insider data is 5 days old (past the 4-day threshold)", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { calls.push(m); return true; },
      ...freshReaders(MARKET_NOW),
      readInsider: () => new Date(MARKET_NOW.getTime() - 5 * 24 * 60 * 60 * 1000),
    });
    expect(result).toBe("alert-sent");
    expect(calls[0]).toContain("vn-ssc-insider-fetch");
  });

  it("returns ok when insider data is 3 days old (below the 4-day threshold)", async () => {
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: MARKET_NOW,
      notify: async (m) => { calls.push(m); return true; },
      ...freshReaders(MARKET_NOW),
      readInsider: () => new Date(MARKET_NOW.getTime() - 3 * 24 * 60 * 60 * 1000),
    });
    expect(result).toBe("ok");
    expect(calls.length).toBe(0);
  });

  it("returns off-hours and sends no alert even when insider is stale", async () => {
    const OFF_NOW = new Date("2026-04-23T15:00:00Z"); // outside VN market hours
    const calls: string[] = [];
    const result = await runVpsProxyWatchdog({
      now: OFF_NOW,
      notify: async (m) => { calls.push(m); return true; },
      ...freshReaders(OFF_NOW),
      readInsider: () => null,
    });
    expect(result).toBe("off-hours");
    expect(calls.length).toBe(0);
  });
});
