/**
 * Task 317 — Fix Telegram routing bugs A, B, D
 *
 * Bug A: priceUpdateWatchdogJob notifyUser default must be no-op (not sendTelegramMarket)
 * Bug B: server.ts push-prices alert persist metadata must use from_agent="alert-commander"
 * Bug D: priceUpdateWatchdogJob must use Bun.env not process.env for VINAHOST_IP
 */

import { describe, it, expect } from "bun:test";
import { priceUpdateWatchdog, _resetWatchdogStaleFlag, _resetWatchdogCooldown } from "../scheduler/market-data/priceUpdateWatchdogJob.js";

describe("Bug A — priceUpdateWatchdogJob notifyUser default is no-op", () => {
  it("recovery path: injected notifyUser fires, but omitting it still returns 'restored' (no crash)", async () => {
    // Prime lastWasStale = true: run a stale cycle with injected callbacks
    _resetWatchdogStaleFlag();
    _resetWatchdogCooldown();
    const marketTime = new Date("2026-04-22T04:00:00Z"); // Tuesday, market hours
    const stalePrice = new Date("2026-04-21T20:00:00Z"); // 32h old

    await priceUpdateWatchdog({
      now: marketTime,
      readPrice: () => stalePrice,
      notify: async (_msg) => true,
      notifyUser: async (_msg) => {},
    });

    // Now call recovery WITHOUT notifyUser option — default is no-op, must not throw
    const freshPrice = new Date("2026-04-22T03:55:00Z");
    const laterTime = new Date("2026-04-22T04:30:00Z");

    let result: string;
    let threw = false;
    try {
      result = await priceUpdateWatchdog({
        now: laterTime,
        readPrice: () => freshPrice,
        notify: async (_msg) => true,
        // notifyUser intentionally omitted — must be a safe no-op default
      });
    } catch (_e) {
      threw = true;
      result = "threw";
    }

    expect(threw).toBe(false);
    expect(result!).toBe("restored");
  });

  it("stale alert path: omitting notifyUser returns 'alert-sent' without throwing", async () => {
    _resetWatchdogStaleFlag();
    _resetWatchdogCooldown();
    const marketTime = new Date("2026-04-22T05:00:00Z");
    const stalePrice = new Date("2026-04-21T20:00:00Z"); // 33h old

    let result: string;
    let threw = false;
    try {
      result = await priceUpdateWatchdog({
        now: marketTime,
        readPrice: () => stalePrice,
        notify: async (_msg) => true,
        // notifyUser intentionally omitted — must be a safe no-op default
      });
    } catch (_e) {
      threw = true;
      result = "threw";
    }

    expect(threw).toBe(false);
    expect(result!).toBe("alert-sent");
  });

  it("source: default notifyUser is no-op (not sendTelegramMarket)", async () => {
    const src = await Bun.file(
      new URL("../scheduler/market-data/priceUpdateWatchdogJob.ts", import.meta.url).pathname
    ).text();

    // The no-op pattern must be present (both call sites)
    const noOpPattern = /\(_msg.*\)\s*=>\s*Promise\.resolve\(undefined\)/g;
    const matches = src.match(noOpPattern);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);

    // sendTelegramMarket must NOT appear as the default for notifyUser
    // It should not appear at all now (removed from import too)
    expect(src).not.toContain("sendTelegramMarket");
  });
});

describe("Bug D — priceUpdateWatchdogJob uses Bun.env not process.env", () => {
  it("source file does not contain process.env.VINAHOST_IP", async () => {
    const src = await Bun.file(
      new URL("../scheduler/market-data/priceUpdateWatchdogJob.ts", import.meta.url).pathname
    ).text();
    expect(src).not.toContain("process.env.VINAHOST_IP");
    expect(src).toContain("Bun.env.VINAHOST_IP");
  });
});

describe("Bug B — server.ts push-prices alert persist metadata", () => {
  // Architecture rule (CLAUDE.md): Alert Commander exclusivity — only 05-alert-commander.md
  // calls send_telegram(channel="market") for alerts. push-prices webhook is NOT Alert Commander.
  // Correct routing: sendTelegramWork with from_agent="push-prices", message_type="system_alert".

  it("push-prices severity alert block routes to WORK channel with push-prices metadata", async () => {
    const src = await Bun.file(
      new URL("../interface/mcp/server.ts", import.meta.url).pathname
    ).text();

    // Anchor: the NGHIÊM TRỌNG / QUAN TRỌNG severity label is unique to the push-prices alert block
    const sevIdx = src.indexOf("NGHIÊM TRỌNG");
    expect(sevIdx).toBeGreaterThan(0);

    // Check 1000-char window around the severity alert send
    const sevBlock = src.slice(sevIdx, sevIdx + 1000);
    expect(sevBlock).not.toContain('"mcp-user"');
    expect(sevBlock).not.toContain('"user_ask_reply"');
    // push-prices is not Alert Commander — must NOT claim to be alert-commander
    expect(sevBlock).not.toContain('"alert-commander"');
    // Must route to WORK channel (sendTelegramWork) and use correct source metadata
    expect(sevBlock).toContain("sendTelegramWork");
    expect(sevBlock).toContain('"push-prices"');
    expect(sevBlock).toContain('"system_alert"');
  });

  it("push-prices threshold alert block routes to WORK channel with push-prices metadata", async () => {
    const src = await Bun.file(
      new URL("../interface/mcp/server.ts", import.meta.url).pathname
    ).text();

    // Anchor: CẮT LỖ / CHỐT LỜI labels are unique to the threshold alert block
    const threshIdx = src.indexOf("CẮT LỖ");
    expect(threshIdx).toBeGreaterThan(0);

    const threshBlock = src.slice(threshIdx, threshIdx + 1000);
    expect(threshBlock).not.toContain('"mcp-user"');
    expect(threshBlock).not.toContain('"user_ask_reply"');
    // push-prices is not Alert Commander — must NOT claim to be alert-commander
    expect(threshBlock).not.toContain('"alert-commander"');
    // Must route to WORK channel and use correct source metadata
    expect(threshBlock).toContain("sendTelegramWork");
    expect(threshBlock).toContain('"push-prices"');
    expect(threshBlock).toContain('"system_alert"');
  });

  it("user_ask_reply persist (ask-reply route) is untouched — still mcp-user", async () => {
    const src = await Bun.file(
      new URL("../interface/mcp/server.ts", import.meta.url).pathname
    ).text();

    // The /ask reply route should still have mcp-user (correct for that context)
    expect(src).toContain('"mcp-user"');
    expect(src).toContain('"user_ask_reply"');
  });
});
